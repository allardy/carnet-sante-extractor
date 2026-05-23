# carnet-sante-extract

Pull **everything** out of [Carnet Santé Québec](https://carnetsante.gouv.qc.ca) — the Quebec government health portal that has no API and no bulk download. You log in by hand (MFA and all); the tool takes over the live session, captures the structured data the site renders, downloads every PDF, and writes it all out as clean, deterministic **Markdown + JSON** you can hand to an LLM later.

No cloud, no API keys, no LLM in the loop. Everything stays on your machine.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium   # one-time browser download

pnpm dev recon     # opens a browser; log in + click through every section → records traffic to recon/
pnpm dev run       # full extraction → output/
pnpm dev normalize # re-build output/ from saved raw/ (offline, no login)
pnpm dev login     # just establish + persist the session
```

## Output

```
output/
  documents/   renamed PDFs, organized by type
  data/        clean structured JSON, one file per domain
  markdown/    human/LLM-readable rollups + summary.md
  manifest.json
```

## Privacy

`output/`, `recon/`, `raw/`, and `.auth/` are gitignored and contain real health data + live session cookies. They never leave your machine and must never be committed.

## Status

Step 1 (scaffold + `recon`) is in place. Collectors are added after a live recon session maps the site's endpoints — see [`docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`](docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md) and `CLAUDE.md`.
