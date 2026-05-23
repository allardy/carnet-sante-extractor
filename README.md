# carnet-sante-extract

Desktop app that pulls **everything** out of [Carnet Santé Québec](https://carnetsante.gouv.qc.ca) — the Quebec government health portal that has no API and no bulk download. Open the app, log in by hand (MFA and all), and it takes over the live session: it captures the structured data the site renders + downloads every PDF, ready to be normalized into clean **Markdown + JSON** for an LLM later.

No cloud, no API keys, no LLM in the loop. Everything stays on your machine.

## Run it (development)

```bash
pnpm install
pnpm dev        # launches the app — log in, then either:
                #   Start capture → walk sections → Stop & save  (raw dump for debugging)
                #   Extract everything                           (full pipeline → clean output)
```

## Build the installer

```bash
pnpm package    # → release/Carnet Sante Extract Setup <version>.exe (Windows, NSIS)
```

The build is unsigned, so Windows SmartScreen warns on first launch — **More info → Run anyway**.

## Output

Written to `~/carnet-sante-extract/`:

```
raw/<ISO-timestamp>/   # one folder per capture/extract run
  responses/   captured JSON
  documents/   downloaded PDFs (Phase 1 raw names)

output/
  data/        clean structured JSON (one file per domain)
  markdown/    per-domain markdown rollups + summary.md
  documents/   renamed PDFs organized by type
  manifest.json
  summary.md   top-level health record summary
```

## Privacy

`raw/`, `output/`, and the Electron session partition (live cookies) live under your user profile and must never be committed. The repo ships only code + synthetic/redacted fixtures.

## Status

Phase 1/2/3 implemented. Phase 4 (vaccines via Carnet de vaccination, a separate portal) is optional and out of scope for this app. See `docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`.
