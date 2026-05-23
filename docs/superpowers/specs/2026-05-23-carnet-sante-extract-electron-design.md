# carnet-sante-extract → Electron — Design

**Date:** 2026-05-23
**Status:** Approved (brainstorming) → ready for implementation plan
**Supersedes the interface decision in:** [`2026-05-23-carnet-sante-extract-design.md`](2026-05-23-carnet-sante-extract-design.md) (CLI + Playwright). The data pipeline, output structure, privacy posture, and resilience strategy from that doc still hold; only the acquisition platform changes.

## Why this change

The original tool is a CLI driven by headed Playwright: the user runs `pnpm dev recon`, a Playwright-controlled Chromium opens, they log in, and Playwright captures traffic. That works but is **not usable by a non-technical person** — it needs Node, pnpm, `playwright install chromium`, and a terminal.

The new shape is a **double-click desktop app**: it opens a window showing the real Carnet Santé site, the user logs in (MFA included), and the app takes over the *same* session to extract everything. No terminal, no toolchain, no Playwright. The acquisition mechanics are nearly identical (drive the UI, passively capture the JSON it fires, download every PDF) — we just swap Playwright for Electron's built-in Chromium + Chrome DevTools Protocol.

## Goals

- A **Windows desktop app** (electron-builder NSIS installer) anyone can run without a toolchain.
- Same end product as before: all **PDF documents** + the **structured data** rendered on screen → clean, **AI-ready Markdown + JSON**, fully **local and deterministic** (no LLM, no API keys, no cloud).
- Human does login/MFA; the app drives the authenticated session that the login established.

## Non-goals

- No in-app LLM enrichment (user does that downstream).
- No cloud/external calls beyond Carnet Santé itself.
- No code-signing in this iteration (unsigned build trips SmartScreen once — "More info → Run anyway"). macOS build deferred.
- Not a hardened multi-user product; personal tool for one account.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Platform | **Electron** (replaces CLI + Playwright) | A double-click app "anyone can use." Embedded Chromium = the real login flow; CDP gives the same capture Playwright did, without the dependency. |
| Acquisition | **Recon → targeted collectors** (two phase) | Phase 1 captures everything generically (= recon, in app form); we map endpoints from the capture, then build precise per-domain collectors in Phase 3. Accurate per-domain output. |
| Capture | **Chrome DevTools Protocol** via `webContents.debugger` | `Network.responseReceived` + `getResponseBody` is exactly what Playwright used under the hood. Produces the same `CaptureStore` shape, so the normalize/output layers are untouched. |
| Session | **Persistent partition** (`persist:carnet`) | Electron persists cookies in `userData` automatically — session survives relaunch with no `storageState` juggling. |
| PDF download | **`net.fetch(url, { session })`** | Auto-attaches the partition's cookies; reuses the existing retry/concurrency/checksum/skip logic. |
| Packaging | **electron-builder → NSIS** (Windows) | Final build step. macOS deferred; signing deferred. |
| Build tool | **electron-vite** | Standard Electron bundler for main/preload/renderer + TS + renderer HMR. oxlint/oxfmt/vitest unchanged. |

## Process model

- **Main process** (`src/main/`) — app lifecycle, window, the embedded site's `WebContentsView`, the CDP capture, the authed downloader, the orchestrator, and **all** filesystem writes. Node-privileged. Nothing else writes to disk.
- **Embedded site** — `carnetsante.gouv.qc.ca` in a `WebContentsView` (modern replacement for the deprecated `<webview>` tag). The user logs in here directly. The debugger is attached to *this* web contents.
- **Control UI** (`src/renderer/`) — a thin chrome around the embedded site: status line (`Please log in` → `Logged in — ready` → `Capturing… N responses, M PDFs` → `Done → output/`), Start/Stop-capture button, scrolling log, "Open output folder". No Node access; talks to main over typed IPC.
- **Preload** (`src/preload/`) — `contextBridge` exposing a minimal IPC API (start/stop capture, subscribe to progress, open output dir).

## Capture mechanism (replaces Playwright `context.on('response')`)

1. `webContents.debugger.attach('1.3')`, then `Network.enable`.
2. On `Network.responseReceived` — record `requestId → {url, status, mimeType, method}`.
3. On `Network.loadingFinished`:
   - JSON mime → `Network.getResponseBody` → write `raw/responses/NNNN-slug.json` as `{ url, status, method, body }`; push to `store.json`.
   - `pdf` / `octet-stream` → push to `store.binaries` as a download descriptor (fetched later by the downloader).
4. On Stop — write `raw/index.json` (the `CaptureStore`).

`CaptureStore` / `CapturedResponse` keep their existing shapes from the old `capture.ts`, so the downstream pipeline does not care that the source changed from Playwright to CDP.

## Authed PDF download (replaces `context.request.get`)

`net.fetch(descriptor.url, { session: theSession })` from the main process; the partition's cookies attach automatically. The pure logic — `mapLimit` concurrency, `sha256`, retry-with-backoff, skip-if-in-manifest — is lifted unchanged from the old `download/downloader.ts`.

## Module layout

```
src/
  main/
    index.ts            # app lifecycle, IPC wiring, orchestrator entry
    window.ts           # control window + embedded WebContentsView, layout/resize
    session.ts          # persist:carnet partition, login-state detection
    capture.ts          # CDP debugger → CaptureStore (writes raw/responses + index)
    navigator.ts        # Navigator iface backed by embedded webContents (goto/click/waitForResponse)
    downloader.ts       # net.fetch authed PDF download (retry/concurrency/checksum/skip)
    orchestrator.ts     # Phase 1: capture mode. Phase 3: run collectors → normalize → output
    ipc.ts              # typed IPC channel contracts (main <-> renderer)
  preload/
    index.ts            # contextBridge API surface
  renderer/
    index.html
    app.ts              # control bar UI: status, start/stop, log, open-output
    styles.css
  collectors/
    types.ts            # CollectContext = { nav: Navigator; capture: CaptureStore } (no Electron leak)
    index.ts            # registry — empty until Phase 2 maps endpoints
    labs.ts ...         # added in Phase 3
  normalize/            # UNCHANGED — schemas.ts, markdown.ts, per-domain normalizers (Phase 3)
  output/               # UNCHANGED — rename.ts, manifest.ts, writer.ts
  util/                 # UNCHANGED — fs.ts, concurrency.ts, log.ts
  config.ts             # + partitionName, windowSize; drop storageStatePath
tests/                  # UNCHANGED — vitest on pure logic (rename, manifest, markdown)
electron.vite.config.ts # electron-vite (main/preload/renderer)
electron-builder.yml    # win nsis target, appId, productName, icon, output dir
```

Removed: `playwright` dependency, `browser/` directory, `cli.ts`.

## Data flow

**Phase 1 / capture mode (`Start capture`):**

1. `session.ts` opens the window with the `persist:carnet` partition; the embedded view navigates to `carnetUrl`. If cookies are still valid the user is already logged in; otherwise they log in in the embedded view.
2. User clicks **Start capture**. `capture.ts` attaches the debugger and begins recording.
3. User clicks through every section (manual walk — we don't have the section map yet). All JSON is dumped to `raw/`; PDFs are flagged.
4. User clicks **Stop**. `downloader.ts` fetches all flagged PDFs via `net.fetch`. `raw/index.json` is written. Status → done; "Open output folder" reveals `raw/`.

**Phase 3 / extract mode (after collectors exist):** orchestrator runs each enabled collector (`nav.goto` its section → `nav.waitForResponse` → return raw + document descriptors), downloads PDFs, then runs the unchanged normalize → output pipeline producing `data/*.json`, `markdown/*.md`, renamed `documents/`, `manifest.json`, `summary.md`.

## Output structure (unchanged from original design)

```
output/
  documents/   # renamed PDFs organized by type (laboratoire/ imagerie/ ...)
  data/        # clean structured JSON, one file per domain
  markdown/    # per-domain rollups + summary.md
  manifest.json
raw/           # captured JSON + downloaded PDFs (re-normalization source)
```

## Build sequence

1. **Phase 1 — Electron shell + capture + packaging (no live site needed).**
   - electron-vite project (main/preload/renderer), oxlint/oxfmt/vitest still green.
   - Window + embedded `WebContentsView` loading Carnet Santé; persistent partition; login-state surface.
   - CDP capture → `raw/` (same `CaptureStore` shape); `net.fetch` downloader; control UI (start/stop/status/log/open-output).
   - Port the reusable pure pipeline + keep existing tests passing.
   - electron-builder NSIS installer (`pnpm package`).
   - **Deliverable:** a double-click `.exe` that loads the site, lets you log in, captures every JSON/PDF you click through, downloads the PDFs, and writes a raw dump. This *is* the recon.

2. **Phase 2 — live recon (needs the user).** Run the app against the live site, log in, walk every section → produces `raw/`. Map the auth flow + per-domain endpoints from the capture; build redacted fixtures for tests.

3. **Phase 3 — targeted collectors (from the Phase-2 map).** Per-domain collectors + per-domain normalizers + `summary.md`, wired into extract mode, TDD'd against the redacted fixtures. Refine the placeholder zod schemas against real payloads.

## Resilience & privacy

- **Incremental**: manifest tracks docs by stable id + checksum; re-runs skip already-downloaded docs (unchanged).
- **Isolated failures**: each collector wrapped in try/catch; one failing doesn't abort the run (unchanged).
- **Offline re-processing**: `raw/` persisted so format changes never require re-login.
- **Polite**: configurable delay between PDF fetches.
- **Privacy**: `output/`, `raw/`, `recon/`, and the Electron session partition (cookies, in `userData`) are gitignored / outside the repo and never committed. Repo ships only code + synthetic/redacted fixtures.

## Testing strategy (unchanged)

TDD on the pure logic — normalize, rename, manifest skip-logic, markdown — against saved fixtures (vitest). Electron main-process capture/download/navigator is smoke-tested against recorded fixtures, not unit-tested against the live gov site.

## Open questions (resolved during Phase 2)

- Exact login/MFA flow and the most reliable "logged-in" signal for the status bar.
- Cookie session vs short-lived bearer token (affects whether collectors must re-trigger page activity to keep a token fresh).
- The real set of data domains and their endpoint shapes (the list above is the expected set; confirmed/adjusted from the capture).
