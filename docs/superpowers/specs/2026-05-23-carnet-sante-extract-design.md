# carnet-sante-extract — Design

**Date:** 2026-05-23
**Status:** Approved → Phase 1/2/3 implemented (2026-05-23). Phase 4 (vaccines via Carnet de vaccination) optional and out of scope for this app.

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

`session.fetch(url, { headers: authHeaders(referer) })` from the main process. `authHeaders` carries the Bearer JWT we captured (see "Authentication" below) plus the SPA-shaped Accept/Accept-Language/Referer. `mapLimit` caps concurrency, `requestDelayMs` paces requests, `downloadRetries` controls retry-with-linear-backoff. Failures on individual PDFs land in a sidecar `<id>.error.json` and the batch continues.

Phase 1 named files from the URL slug. Phase 3's `output/rename.ts` produces deterministic filenames like `documents/imagerie/CLAVICULE_G_2024-11-13.pdf` from descriptor metadata, with collision suffixes when needed.

**Two PDF acquisition shapes seen in practice:**

- **Imaging**: report is at a separate URL — `GET /Citoyens/{id}/ExamenImagerie/{examId}/DetailRapport/{reportId}/Rapport` returns `application/pdf` directly. The reportId comes from the DetailRapport response (or, when that doesn't surface one, from a derived pattern `1061642060${examId}0` we confirmed empirically).
- **Labs**: PDFs are returned **inline as base64** inside the `/Prelevements/{id}/Rapports` JSON response. `src/util/pdf-extract.ts` walks the JSON tree finding base64 strings whose decoded prefix is `%PDF`. Found PDFs are attached as `DocumentDescriptor.inlineData` and the orchestrator decodes them instead of issuing a fetch.

## Authentication

The Carnet Santé SPA is Angular and uses **oidc-client-js** against RAMQ's ADFS. After ClicSEQUR login the SPA holds a short-lived (~1h) Bearer JWT in `sessionStorage` under the key `oidc.user:https://fedapp.ramq.gouv.qc.ca/adfs:http://ais-citoyen-prod` (value is a JSON object containing `access_token`). An Angular `HttpInterceptor` attaches that JWT to every `/api/1/*` request. **Plain `fetch()` and `session.fetch()` bypass the interceptor**, so direct calls from the main process get 403 even with the partition cookies.

Our workaround (`src/main/auth.ts`):

1. On app start, `installAuthCapture` registers `session.webRequest.onBeforeSendHeaders` on the partition. Every outgoing request to `*.carnetsante.gouv.qc.ca` or `*.ramq.gouv.qc.ca` is scanned for an `Authorization: Bearer …` header and the latest value is cached.
2. On `extractStart`, `seedAuthFromSessionStorage` runs JS inside the site `WebContents` to read the oidc-client-js user object directly — this seeds the cache before the SPA has had a chance to fire a fresh request, so the very first extract click works without waiting.
3. Every `session.fetch` from main goes through `authHeaders(referer)`, which throws if no Bearer has been captured yet (with a clear "navigate the site once before extracting" message).
4. The partition's User-Agent is overridden to a plain Chrome UA — Electron's default UA contains "Electron/<v>" and the gov server treats that as a non-browser client (403s).

JWT refresh is automatic: the SPA periodically renews; our interceptor sees the new Authorization on subsequent fetches and updates the cached value.

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

Written to `~/carnet-sante-extract/`. Every run lives in its own ISO-timestamped subfolder so prior runs are preserved.

```
raw/<ISO-timestamp>/
  responses/   captured JSON (Capture flow only) + index.json
  data/        per-domain raw JSON (Extract flow)
  documents/   downloaded PDFs (raw filenames, by report id)
  log.jsonl    structured one-event-per-line log
  log.txt      same events, human-readable

output/<ISO-timestamp>/
  documents/   renamed PDFs organized by type (laboratoire/, imagerie/, ...)
  data/        normalized JSON (or raw payload fallback if a schema misses)
  markdown/    per-domain rollups linked to PDFs + raw JSON, year-grouped
  manifest.json
  summary.md
```

`raw/<run>/` is the re-normalization source: normalize/output can be re-run entirely offline against captured fixtures.

## Per-endpoint constraints

Discovered during Phase 3 live runs — the server caps date ranges per endpoint and 500s on requests wider than its limit:

| Endpoint | Max range (observed) | Notes |
|---|---|---|
| `/Citoyens/{id}/ExamensImagerie?DateDebut=...&DateFin=...` | ~6 years | 500 on 7-year window |
| `/Citoyens/{id}/Medications?Dates` | ~2 years | The SPA queries this default. Wider may work but unverified. |
| `/Citoyens/{id}/ServicesMedicauxAssures?Dates` | ~7 years | The SPA's own default. |
| `/Prelevement/.../Prelevements?Dates` | per-year sweep | The SPA queries one year at a time. Our collector mirrors this; window is configurable (defaulted to 1 year during iteration to avoid spam during debugging). |
| `/Citoyens/{id}/RendezVous?Dates` | per-year sweep | Same per-year pattern as labs. |

## API shape conventions

The gov API mixes **PascalCase** (older endpoints — `/Citoyens`, `/Medications`, `/ExamensImagerie`, `/ServicesMedicauxAssures`) and **camelCase** (newer endpoints — `/Prelevement`). Some endpoints return arrays at the root, others wrap in objects. Notable quirks:

- **`/ExamenImagerie/{examId}/DetailRapport`** returns a **direct array** of rapport objects (no wrapping `{RapportsImagerie: [...]}`). Older shape may exist; our normalizer accepts both via a `z.union`.
- **`/ServicesMedicauxAssures`** items have **no `Id` field** at all — we synthesize one from `${date}-${index}` to give downstream code a stable key.
- **Medications `NombreDelivrancesAutorisees`/`Restantes`** are sometimes `null` (compounded meds), so the schema declares them nullable.
- **Labs list items** are camelCase: `id` (opaque, ready to use in subsequent URLs), `trackingId` (maps directly to `?Tracking=`), `datePrelevement`, `nomPrescripteur`, etc.
- **Connected user**: `/api/1/Citoyens` (no path suffix, no id) returns the current user. `/Citoyens/{id}` itself does NOT exist — only its sub-resources do.

All schemas in `src/normalize/schemas.ts` are designed to be **lenient** on optionality so a single field mismatch in a list of N items doesn't fail the whole normalize. When a normalize does fail, `writeOutput` writes the raw payload to `output/<run>/data/<domain>.json` as fallback so the output dir is never empty.

## Build sequence

1. ✅ **Phase 1 — Electron shell + capture + packaging.** electron-vite project (main/preload/renderer), oxlint/oxfmt/vitest green. Window + embedded `WebContentsView` loading Carnet Santé; persistent partition. CDP capture → `raw/<ISO-timestamp>/responses/`; `net.fetch` downloader → `raw/<ISO-timestamp>/documents/`. Control toolbar (start/stop/status/url/open-output). electron-builder NSIS installer (`pnpm package`). Output path `~/carnet-sante-extract/` (not Documents, to avoid OneDrive). **Deliverable:** a double-click `.exe` that loads the site, lets you log in, captures every JSON/PDF you click through, downloads the PDFs, and writes a raw dump.

2. ✅ **Phase 2 — live recon done.** Ran the app against the live site; endpoint surface mapped in `docs/superpowers/notes/2026-05-23-phase2-endpoint-map.md`. Redacted fixtures built for tests.

3. ✅ **Phase 3 — targeted collectors + normalize + manifest + summary.** 6 collectors (profile, medications, appointments, medical-services, imaging, labs) + per-domain normalizers + `summary.md`, wired into extract mode, TDD'd against redacted fixtures. Extract button in the toolbar runs the full pipeline.

## Resilience & privacy

- **Incremental** (Phase 3): manifest tracks docs by stable id + checksum; re-runs skip already-downloaded docs.
- **Isolated failures**: each collector wrapped in try/catch; one failing doesn't abort the run.
- **Offline re-processing**: `raw/` persisted so format changes never require re-login.
- **Polite**: configurable delay between PDF fetches; we do not hammer a government server.
- **Local-only storage**: output lands under `~/carnet-sante-extract/` directly, not under `Documents/` — avoids Windows OneDrive auto-sync (Documents is often OneDrive-redirected, which would leak health data to cloud storage).
- **Privacy**: `raw/`, `output/`, and the Electron session partition (cookies, in `userData`) live under the user's profile and are gitignored / outside the repo. Repo ships only code + synthetic/redacted fixtures.

## Testing strategy

TDD on the pure logic — `capture/store.ts`, `output/rename.ts`, `output/manifest.ts`, `normalize/markdown.ts` — against saved fixtures (vitest). Electron main-process capture/download/navigator is smoke-tested against recorded fixtures, not unit-tested against the live gov site.

## Open questions (resolved during Phase 2 + 3)

- ~~Cookie session vs short-lived bearer token~~ → **Bearer JWT** (~1h, RAMQ ADFS-issued, stored in oidc-client-js sessionStorage, captured at network layer for refresh). See "Authentication".
- ~~Data domain endpoint shapes~~ → mapped in `docs/superpowers/notes/2026-05-23-phase2-endpoint-map.md`, with shape discoveries documented in this spec's "API shape conventions" section.
- **Carte / Coordonnees / Courriel / TelephoneMobile / SituationMedecinFamille response shapes** — still unread. Phase 3 schemas are lenient (passthrough + all-optional), so a normalize won't fail outright, but specific field mappings need refinement once response bodies are inspected.

Vaccines are out of scope for this app; the Quebec vaccine portal (Carnet de vaccination via Clic Santé) is separate and would be a Phase 4 recon.
