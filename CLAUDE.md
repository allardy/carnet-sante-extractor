# carnet-sante-extract

CLI that logs you into Carnet Santé Québec (you do the login by hand, MFA included), then drives the UI while passively capturing the JSON the site fires + downloading every PDF, and normalizes it all into clean, deterministic Markdown/JSON for later AI use.

**Design spec:** [`docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`](docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md)

## Privacy — non-negotiable

`output/`, `recon/`, `raw/`, `.auth/` are gitignored and MUST NEVER be committed — they hold real health data and live session cookies. The repo ships only code + synthetic/redacted fixtures.

## Stack & conventions

- TypeScript + Node 20+, **pnpm** (never npm/yarn), Playwright (Chromium, headed), zod.
- oxlint + oxfmt — 120 col, no semicolons, single quotes, trailing commas, LF, import-sort. `pnpm fix` to auto-format, `pnpm check` for CI-style verification (format + lint + typecheck).
- Arrow functions over `function` declarations; named exports only (no default exports); almost no comments (only when the WHY is non-obvious); strict TS.
- NodeNext modules — **relative imports use `.js` extensions** (e.g. `import { config } from './config.js'`).

## Commands

```bash
pnpm install
pnpm exec playwright install chromium   # one-time browser download (Playwright postinstall is gated by pnpm)
pnpm dev recon       # open browser, log in, click around → records traffic to recon/<timestamp>/
pnpm dev login       # just establish + persist the session to .auth/
pnpm dev run         # full extraction → output/ (collectors added post-recon)
pnpm dev normalize   # re-normalize from saved raw/ (offline, no login)
pnpm test            # vitest
pnpm check           # format + lint + typecheck
pnpm fix             # auto-format + lint fix
```

## Architecture — three cleanly separated layers

1. **`src/browser/`** — owns the live session: headed Chromium (`session.ts`), human login + `storageState` persistence + authed request context, passive network capture (`capture.ts`), generic UI-driving helpers (`navigator.ts`). Domain-agnostic.
2. **`src/collectors/`** — one module per data domain (labs, medications, vaccines, imaging, appointments, documents). Each navigates to its section and returns raw JSON + PDF descriptors. Isolated: one failing doesn't abort the run. **The registry in `index.ts` is empty until the recon session maps each domain's endpoints.**
3. **`src/normalize/` + `src/output/`** — pure, network-free: raw JSON → zod-validated records (`schemas.ts`) → `data/*.json`, `markdown/*.md`, organized/renamed PDFs (`rename.ts`), `manifest.json` (`manifest.ts`). Reads saved `raw/`, so `normalize` re-runs fully offline.

## Acquisition strategy

Drive the UI like a human, **passively capture** the JSON it fires (hybrid), then promote proven-stable endpoints to direct API calls. The `recon` command records all traffic (HAR + per-response JSON + index) so we can map the auth flow + endpoints before hardening anything.

## Build status

- [x] Step 1 — scaffold + working `recon` command
- [ ] Step 2 — live recon session → map auth flow + endpoints (document findings here)
- [ ] Step 3 — first collector end-to-end (labs) + normalize + markdown + tests
- [ ] Step 4 — remaining collectors
- [ ] Step 5 — downloader + rename + manifest + incremental skip
- [ ] Step 6 — output consolidation (`summary.md`) + promote stable endpoints to direct API calls

## Testing

TDD on the pure logic — `output/rename.ts`, `output/manifest.ts`, `normalize/markdown.ts` — against fixtures in `tests/`. Browser/capture/download is smoke-tested against recorded fixtures, not unit-tested against the live gov site. Tests use `.js` specifiers (`import { x } from '../src/.../y.js'`); vitest resolves them to `.ts`.
