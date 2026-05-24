# carnet-sante-extractor

Electron desktop app that logs you into Carnet Santé Québec (you do the login by hand, MFA included), then takes over the live session to capture the JSON the site renders + download every PDF, for later normalization into clean Markdown/JSON.

**Design spec:** [`docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`](docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md)

## Privacy — non-negotiable

`output/`, `recon/`, `raw/`, `.auth/` are gitignored and MUST NEVER be committed — they hold real health data and live session cookies. The repo ships only code + synthetic/redacted fixtures.

## Stack & conventions

- TypeScript + Node 20+, **pnpm** (never npm/yarn), Electron (ESM main) + electron-vite + electron-builder, Chrome DevTools Protocol for capture, zod.
- oxlint + oxfmt — 120 col, no semicolons, single quotes, trailing commas, LF, import-sort. `pnpm fix` to auto-format, `pnpm check` for CI-style verification (format + lint + typecheck).
- Arrow functions over `function` declarations; named exports only (no default exports); almost no comments (only when the WHY is non-obvious); strict TS.
- Bundler module resolution — **relative imports still use `.js` extensions** (e.g. `import { config } from './config.js'`), so the same source compiles cleanly under NodeNext if the project ever needs it.

## Commands

```bash
pnpm install
pnpm dev        # launch the app (electron-vite dev)
pnpm build      # bundle main/preload/renderer
pnpm package    # build + electron-builder NSIS installer → release/
pnpm test       # vitest (pure logic)
pnpm check      # format + lint + typecheck
pnpm fix        # auto-format + lint fix
```

## Architecture — three cleanly separated layers

1. **`src/main/`** — Electron lifecycle, `BaseWindow` with two `WebContentsView`s (`window.ts`), persistent `persist:carnet` session, Chrome DevTools Protocol capture (`capture.ts`), authed PDF download via `net.fetch` (`downloader.ts`), and IPC orchestration (`index.ts`). All filesystem writes happen here.
2. **`src/capture/store.ts` + `src/preload/` + `src/renderer/` + `src/shared/`** — pure capture model (`store.ts`), `contextBridge` API surface (`preload/`), control-toolbar UI (`renderer/`), and IPC channel contracts (`shared/ipc.ts`). The renderer has no Node access; talks to main over typed IPC.
3. **`src/collectors/` + `src/normalize/` + `src/output/`** — pure, network-free layer. Collectors (profile, medications, appointments, medical-services, imaging, labs) each navigate to their endpoints via the typed Navigator and return raw JSON + PDF descriptors. Normalize maps raw → zod-validated clean records. Output writes `data/*.json`, per-domain `markdown/*.md`, organized/renamed `documents/`, `manifest.json`, and `summary.md`.

## Acquisition strategy

Drive the UI like a human, **passively capture** the JSON it fires (hybrid), then promote proven-stable endpoints to direct API calls. The `recon` command records all traffic (HAR + per-response JSON + index) so we can map the auth flow + endpoints before hardening anything.

## Build status

- [x] **Phase 1** — Electron capture app + NSIS installer. `pnpm package` ships a double-click `.exe`. Output rooted at `~/carnet-sante-extractor/` (never under Documents/, never OneDrive-redirected). Every capture/extract run lands in its own ISO-timestamped subfolder.
- [x] **Phase 2** — live recon mapped the endpoint surface; see `docs/superpowers/notes/2026-05-23-phase2-endpoint-map.md`.
- [x] **Phase 3** — collectors + normalize + markdown + manifest + summary. Extract button runs the full pipeline.
- [x] **Phase 3 hardening** (live-tuned over multiple iterations):
  - Bearer JWT bootstrap from oidc-client-js sessionStorage + live capture via `webRequest.onBeforeSendHeaders` (token auto-refreshes mid-run).
  - Tolerant normalizers — schemas are now lenient enough to ride through PascalCase/camelCase divergence and nullable fields. Per-domain failures write the raw payload as fallback so output is never empty.
  - Per-endpoint date-window caps respected (imaging ≤ 6y, medications 2y, labs configurable — defaulted to 1y while iterating).
  - Imaging DetailRapport handled as direct array (real shape) AND object-wrapped (legacy).
  - Lab PDFs extracted from inline base64 in the /Rapports response (not at a separate URL like imaging).
  - Structured streaming logger writes `log.jsonl` + `log.txt` to each raw run for postmortem.
  - Markdown files now link to PDFs (`../documents/...`) and raw JSON (`../data/...`), year-grouped, with footer back to summary.
- [ ] **Phase 4 (optional)** — vaccines via Carnet de vaccination (separate portal, separate recon).
- [ ] **Profile sub-resources (carte/coordonnees/courriel/phone)** — Phase 2 didn't read response bodies; Phase 3 lenient schemas accept anything but the normalize fields may need refinement once shapes are seen.

## Testing

TDD on the pure logic — `output/rename.ts`, `output/manifest.ts`, `normalize/markdown.ts` — against fixtures in `tests/`. Browser/capture/download is smoke-tested against recorded fixtures, not unit-tested against the live gov site. Tests use `.js` specifiers (`import { x } from '../src/.../y.js'`); vitest resolves them to `.ts`.
