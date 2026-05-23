# carnet-sante-extract — Design

**Date:** 2026-05-23
**Status:** Approved → Phase 1 implemented; Phase 2/3 follow.

## Problem

[Carnet Santé Québec](https://carnetsante.gouv.qc.ca) (the Quebec government health portal) has **no API and no bulk-download**. To get your own health records out you must manually click and download each document one at a time, and the structured data shown on screen (lab values over time, medication lists, vaccines, appointments) isn't downloadable at all.

## Goals

- A **Windows desktop app** (electron-builder NSIS installer) anyone can run without a toolchain — double-click to launch, no terminal, no `pnpm`, no Playwright install.
- Log into Carnet Santé (human does the login, MFA included), then automatically extract **everything**:
  - All downloadable **PDF documents** (lab reports, imaging reports, hospital docs, etc.).
  - The **structured data** rendered on screen (lab values, medications, vaccines, appointments).
- Normalize it into clean, **AI-ready Markdown + JSON** for the user to feed to an LLM later.
- Fully **deterministic and offline** — no LLM in the tool, no API keys, no cloud.
- Everything stays **local**. Health data and session state never leave the machine and are never committed.

## Non-goals

- No in-app LLM enrichment/summarization (user does that downstream).
- No cloud processing or external API calls beyond Carnet Santé itself.
- No code-signing in this iteration — the unsigned build trips Windows SmartScreen once (**More info → Run anyway**). macOS build deferred.
- Not a hardened multi-user product; personal tool for one account.

## Key decisions

| Decision     | Choice                                                  | Rationale                                                                                                                                                       |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform     | **Electron** desktop app                                | A double-click app anyone can use. Embedded Chromium handles the real login flow; CDP gives us the network capture without an extra dependency.                 |
| Acquisition  | **Capture-first → targeted collectors** (phased)        | Phase 1 captures every JSON/PDF the site fires generically. From that capture we map per-domain endpoints, then write precise collectors in Phase 3.            |
| Capture      | **Chrome DevTools Protocol** via `webContents.debugger` | `Network.responseReceived` + `Network.getResponseBody` records JSON bodies and flags PDFs. The captured shape (`CaptureStore`) is what every later layer reads. |
| Session      | **Persistent partition** (`persist:carnet`)             | Electron stores cookies in `userData` automatically — session survives relaunch, no `storageState` files to juggle.                                             |
| PDF download | **`net.fetch(url, { session })`**                       | Auto-attaches the partition's cookies. Concurrency, retry, checksum, skip-if-in-manifest layered on top.                                                        |
| LLM role     | **None in-tool**; deterministic extraction              | Filenames/metadata come from API payloads, not LLM guessing. Fully offline, no keys.                                                                            |
| Build tool   | **electron-vite**                                       | Standard Electron bundler for main/preload/renderer + TS + renderer HMR. oxlint/oxfmt/vitest unchanged.                                                         |
| Packaging    | **electron-builder → NSIS** (Windows)                   | Single-file installer (`release/Carnet Sante Extract Setup <version>.exe`). macOS + signing deferred.                                                           |

## Process model

- **Main process** (`src/main/`) — app lifecycle, the embedded site's `WebContentsView`, the CDP capture, the authed downloader, the orchestrator, and **all** filesystem writes. Node-privileged.
- **Embedded site** — `carnetsante.gouv.qc.ca` in a `WebContentsView` (modern replacement for the deprecated `<webview>` tag). The user logs in here directly. The debugger is attached to _this_ web contents.
- **Control UI** (`src/renderer/`) — a thin chrome around the embedded site: status line (`Please log in` → `capturing — N JSON, M PDF` → `downloading — K downloaded` → `done`), Start/Stop-capture button, live URL display, "Open output folder". No Node access; talks to main over typed IPC.
- **Preload** (`src/preload/`) — `contextBridge` exposing a minimal IPC API (start/stop capture, subscribe to progress, subscribe to site URL changes, open output dir).

## Capture mechanism

1. `webContents.debugger.attach('1.3')`, then `Network.enable`.
2. On `Network.responseReceived` — record `requestId → {url, status, method, contentType}`.
3. On `Network.loadingFinished`:
   - JSON mime → `Network.getResponseBody` → write `raw/responses/NNNN-slug.json` as `{ url, status, method, body }`; push to `store.json`.
   - `pdf` / `octet-stream` → push to `store.binaries` as a download descriptor (fetched later by the downloader).
4. On Stop — write `raw/responses/index.json` (the `CaptureStore`), then run the downloader.

The `CaptureStore` / `CapturedResponse` types are pure (`src/capture/store.ts`) and shared between the main process, future collectors, and tests.

## Authed PDF download

`net.fetch(descriptor.url, { session, useSessionCookies: true })` from the main process; the partition's cookies attach automatically. `mapLimit` caps concurrency at `config.downloadConcurrency`, `requestDelayMs` paces between requests, and `downloadRetries` controls retry-with-linear-backoff. Failures on individual PDFs are logged but don't abort the batch.

Phase 1 names files from the URL slug (`safeName(url, i).pdf`). Phase 3 replaces this with descriptor-driven naming + a manifest-skip path once collectors supply metadata.

## Module layout

```
src/
  main/
    index.ts            # app lifecycle, IPC wiring
    window.ts           # BaseWindow + toolbar/site WebContentsViews + layout
    capture.ts          # CDP debugger → CaptureStore (writes raw/responses/)
    downloader.ts       # net.fetch authed PDF download (retry/concurrency)
  preload/
    index.ts            # contextBridge API surface
  renderer/
    index.html
    app.ts              # control toolbar UI
    styles.css
    env.d.ts
  shared/
    ipc.ts              # IPC channel constants + payload types
  capture/
    store.ts            # pure CaptureStore types + classify + safeName + emptyStore
  collectors/           # (Phase 3) — one module per data domain
    types.ts            # CollectContext = { nav: Navigator; capture: CaptureStore }
    index.ts            # registry — empty until Phase 2 maps endpoints
  normalize/            # (Phase 3) — schemas.ts, markdown.ts, per-domain normalizers
  output/               # (Phase 3) — rename.ts, manifest.ts, writer.ts
  util/                 # fs.ts, concurrency.ts, log.ts
  config.ts             # carnetUrl, partition, window dims, concurrency, retries
tests/
  capture-store.test.ts # pure capture-helper tests
  rename.test.ts manifest.test.ts markdown.test.ts  # (Phase 3) — pure logic tests
electron.vite.config.ts # electron-vite (main/preload/renderer)
electron-builder.yml    # win nsis target, appId, productName
```

## Data flow

**Phase 1 / capture mode (Start capture → Stop & save):**

1. App opens the window with the `persist:carnet` partition; the embedded view navigates to `carnetUrl`. If cookies are still valid the user is already logged in; otherwise they log in in the embedded view.
2. User clicks **Start capture**. `capture.ts` attaches the debugger and begins recording.
3. User clicks through every section. All JSON is dumped to `raw/responses/`; PDFs are flagged.
4. User clicks **Stop & save**. `downloader.ts` fetches all flagged PDFs via `net.fetch` into `raw/documents/`. `raw/responses/index.json` is written. Status → `done`. **Open output** reveals `raw/` in Explorer.

**Phase 3 / extract mode (after collectors exist):** orchestrator runs each enabled collector (`nav.goto` its section → `nav.waitForJson` → return raw + document descriptors), downloads PDFs, then runs the unchanged normalize → output pipeline producing `data/*.json`, `markdown/*.md`, renamed `documents/`, `manifest.json`, `summary.md`.

## Output structure

Written to `~/Documents/carnet-sante-extract/`:

```
raw/
  responses/   captured JSON (one file per response) + index.json
  documents/   downloaded PDFs (Phase 1 names them by URL slug)

output/        (Phase 3)
  documents/   renamed PDFs organized by type (laboratoire/, imagerie/, ...)
  data/        clean structured JSON, one file per domain
  markdown/    per-domain rollups + summary.md
  manifest.json
```

`raw/` is the re-normalization source: Phase 3 can re-run normalize/output entirely offline against captured fixtures.

## Build sequence

1. **Phase 1 — Electron shell + capture + packaging.** electron-vite project (main/preload/renderer), oxlint/oxfmt/vitest green. Window + embedded `WebContentsView` loading Carnet Santé; persistent partition. CDP capture → `raw/responses/`; `net.fetch` downloader → `raw/documents/`. Control toolbar (start/stop/status/url/open-output). electron-builder NSIS installer (`pnpm package`). **Deliverable:** a double-click `.exe` that loads the site, lets you log in, captures every JSON/PDF you click through, downloads the PDFs, and writes a raw dump.

2. **Phase 2 — live recon (needs the user).** Run the app against the live site, log in, walk every section → produces `raw/`. Map the auth flow + per-domain endpoints from the capture; build redacted fixtures for tests.

3. **Phase 3 — targeted collectors (from the Phase-2 map).** Per-domain collectors + per-domain normalizers + `summary.md`, wired into extract mode, TDD'd against the redacted fixtures. Refine the placeholder zod schemas against real payloads.

## Resilience & privacy

- **Incremental** (Phase 3): manifest tracks docs by stable id + checksum; re-runs skip already-downloaded docs.
- **Isolated failures**: each collector wrapped in try/catch; one failing doesn't abort the run.
- **Offline re-processing**: `raw/` persisted so format changes never require re-login.
- **Polite**: configurable delay between PDF fetches; we do not hammer a government server.
- **Privacy**: `raw/`, `output/`, and the Electron session partition (cookies, in `userData`) live under the user's profile and are gitignored / outside the repo. Repo ships only code + synthetic/redacted fixtures.

## Testing strategy

TDD on the pure logic — `capture/store.ts`, `output/rename.ts`, `output/manifest.ts`, `normalize/markdown.ts` — against saved fixtures (vitest). Electron main-process capture/download/navigator is smoke-tested against recorded fixtures, not unit-tested against the live gov site.

## Open questions (resolved during Phase 2)

- Exact login/MFA flow and the most reliable "logged-in" signal for the status bar.
- Cookie session vs short-lived bearer token (affects whether collectors must re-trigger page activity to keep a token fresh).
- The real set of data domains and their endpoint shapes (the expected list — labs, medications, vaccines, imaging, appointments, documents — will be confirmed/adjusted from the capture).
