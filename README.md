# carnet-sante-extract

Desktop app that pulls **everything** out of [Carnet Santé Québec](https://carnetsante.gouv.qc.ca) — the Quebec government health portal that has no API and no bulk download. Open the app, log in by hand (MFA and all), and it takes over the live session: it captures the structured data the site renders + downloads every PDF, ready to be normalized into clean **Markdown + JSON** for an LLM later.

No cloud, no API keys, no LLM in the loop. Everything stays on your machine.

## Run it (development)

```bash
pnpm install
pnpm dev        # launches the app: log in, click Start capture, walk every section, Stop & save
```

## Build the installer

```bash
pnpm package    # → release/Carnet Sante Extract Setup <version>.exe (Windows, NSIS)
```

The build is unsigned, so Windows SmartScreen warns on first launch — **More info → Run anyway**.

## Output

Written to `~/Documents/carnet-sante-extract/`:

```
raw/
  responses/   captured JSON (one file per response) + index.json
  documents/   downloaded PDFs
```

(Phase 3 adds the normalize step that turns `raw/` into `output/data`, `output/markdown`, and renamed `output/documents`.)

## Privacy

`raw/`, `output/`, and the Electron session partition (live cookies) live under your user profile and must never be committed. The repo ships only code + synthetic/redacted fixtures.

## Status

Phase 1 (Electron capture app) is implemented. Phase 2 = a live recon pass to map the site's endpoints; Phase 3 = targeted per-domain collectors + normalization. See `docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`.
