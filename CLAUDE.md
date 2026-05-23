# carnet-sante-extract

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
3. **`src/collectors/` + `src/normalize/` + `src/output/`** — pure, network-free layer (Phase 3). Collectors return raw JSON + PDF descriptors via a `Navigator` interface; normalize/output turn raw JSON into zod-validated records → `data/*.json`, `markdown/*.md`, organized/renamed PDFs, `manifest.json`. The collectors registry is empty until Phase 2 maps the endpoints.

## Acquisition strategy

Drive the UI like a human, **passively capture** the JSON it fires (hybrid), then promote proven-stable endpoints to direct API calls. The `recon` command records all traffic (HAR + per-response JSON + index) so we can map the auth flow + endpoints before hardening anything.

## Build status

- [x] **Phase 1** — Electron capture app: window + persistent session + CDP capture + authed PDF download + NSIS installer. `pnpm package` ships a double-click `.exe`; capture writes to `~/Documents/carnet-sante-extract/raw/`.
- [ ] **Phase 2** — live recon (needs Yann): launch the app, log in, walk every section → produces `raw/`. Map auth flow + per-domain endpoints from the capture; build redacted fixtures.
- [ ] **Phase 3** — targeted per-domain collectors built from the Phase 2 endpoint map, per-domain normalizers, `summary.md` rollup. Plan written after Phase 2 produces real fixtures.

## Testing

TDD on the pure logic — `output/rename.ts`, `output/manifest.ts`, `normalize/markdown.ts` — against fixtures in `tests/`. Browser/capture/download is smoke-tested against recorded fixtures, not unit-tested against the live gov site. Tests use `.js` specifiers (`import { x } from '../src/.../y.js'`); vitest resolves them to `.ts`.
