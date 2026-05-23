# carnet-sante-extract — Design

**Date:** 2026-05-23
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Carnet Santé Québec (the Quebec government health portal) has **no API and no bulk-download**. To get your own health records out, you must manually click and download each document one at a time, and the structured data shown on screen (lab values over time, medication lists, vaccines, appointments) isn't downloadable at all.

An existing Python toolkit ([Gavin-Qiao/carnet-sante-toolkit](https://github.com/Gavin-Qiao/carnet-sante-toolkit)) only implements "Phase 2" — LLM-renaming of PDFs you've *already* downloaded by hand. The hard part — actually logging in and pulling everything down automatically — is unimplemented.

This project fills that gap, in TypeScript/Node.

## Goals

- Log into Carnet Santé (human does the login, MFA included), then automatically extract **everything**:
  - All downloadable **PDF documents** (lab reports, imaging reports, hospital docs, etc.).
  - The **structured data** rendered on screen (lab values, medications, vaccines, appointments).
- Normalize it into clean, **AI-ready** Markdown + JSON for the user to feed to an LLM later.
- Fully **deterministic and offline** — no LLM in the tool, no API keys, no Ollama.
- Everything stays **local**. Health data and session state never leave the machine and are never committed.

## Non-goals

- No in-tool LLM enrichment/summarization (user does that downstream).
- No cloud processing or external API calls beyond Carnet Santé itself.
- No GUI/desktop app — CLI + a real browser window is the interface.
- Not a hardened multi-user product; it's a personal tool for one account.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Data scope | Everything → AI-ready (PDFs + structured data → clean MD/JSON) | Full vision; the structured data is the part no manual workflow can get. |
| Interface | CLI + real headed browser window | Human does login/MFA; Playwright takes over the same session. Least code, most robust. No Electron. |
| LLM role | None in-tool; deterministic extraction | Filenames/metadata come from API payloads, not LLM guessing. Fully offline, no keys. |
| Acquisition | Hybrid C → graduate to A | Drive the UI like a human, passively capture the JSON it fires; promote stable endpoints to direct API calls later. Lowest risk, produces the API map for free. |

## Architecture — three cleanly separated layers

1. **Browser layer** — owns the live session. Launches headed Chromium, lets the human log in (MFA), persists the session (`storageState`), and exposes (a) an authenticated request context for binary downloads and (b) a passive network-capture stream. Knows nothing about specific health domains.
2. **Collector layer** — one module per data domain. Each navigates to its section, waits for the JSON it needs (captured by the browser layer), and returns raw payloads + PDF descriptors. Collectors are **isolated**: one failing does not abort the run.
3. **Normalize/output layer** — pure and network-free. Turns raw JSON into zod-validated typed records → writes `data/*.json`, `markdown/*.md`, organized/renamed PDFs, and a `manifest.json`. Reads from saved raw responses, so normalization can be re-run offline without re-login.

## Module layout

```
carnet-sante-extract/
  src/
    cli.ts                  # commands: recon | run | normalize | login
    config.ts               # base URL, output dir, enabled domains, polite-delay, concurrency
    browser/
      session.ts            # headed chromium, human login, persist storageState, authed request context
      capture.ts            # page.on('response') → dump JSON + flag PDFs to raw/
      navigator.ts          # generic UI-driving helpers (click, waitForResponse, retries)
    collectors/
      types.ts              # Collector interface + DomainResult
      labs.ts
      medications.ts
      vaccines.ts
      imaging.ts
      appointments.ts
      documents.ts
      index.ts              # registry of enabled collectors
    download/
      downloader.ts         # authed PDF fetch: concurrency, retry, checksum, skip-existing
    normalize/
      schemas.ts            # zod schema per domain (clean record shapes)
      labs.ts               # raw JSON → clean records (one per domain)
      ...
      markdown.ts           # clean records → Markdown
    output/
      writer.ts             # writes data/*.json, markdown/*.md, organizes documents/
      manifest.ts           # manifest read/write + incremental skip logic
      rename.ts             # deterministic PDF naming from metadata
    util/
      log.ts
      fs.ts
      concurrency.ts
  tests/
    fixtures/               # saved raw JSON samples (synthetic/redacted)
    normalize.test.ts
    rename.test.ts
    manifest.test.ts
  recon/                    # gitignored — captured traffic from recon runs
  output/                   # gitignored — extracted health data
  raw/                      # gitignored — raw API responses (re-normalization source)
  .auth/                    # gitignored — storageState.json (session)
  package.json tsconfig.json .gitignore README.md CLAUDE.md
```

## CLI commands

- **`recon`** — opens the browser, you log in and click around; records *all* network traffic to `recon/` (HAR + per-response JSON + an index). The deliverable of build Step 2: the map of the auth flow + endpoints. Exploratory/throwaway.
- **`run`** — login/session → run enabled collectors (UI-driven nav + passive capture) → download PDFs → normalize → write `output/`. The main command.
- **`normalize`** — re-runs normalization from saved `raw/` only. No network, no login. For iterating on output format.
- **`login`** — just establish + persist the session.

## Data flow (`run`)

1. `session.ts` launches headed Chromium with persisted `storageState` if still valid; otherwise waits for the human to complete login, then persists the session.
2. `capture.ts` attaches a `response` listener: JSON responses from the API base are buffered and written to `raw/`; PDF / `application/octet-stream` responses are flagged as download descriptors.
3. The orchestrator runs each enabled collector: it navigates to its section, waits for the relevant JSON responses, and returns raw payload references + document descriptors.
4. `downloader.ts` fetches PDFs via the authenticated request context (reusing cookies/token), concurrency-limited, retried, checksummed; skips docs already present in the manifest.
5. `normalize` turns raw JSON into zod-validated clean records → writes `data/*.json` + `markdown/*.md`.
6. `output` organizes/renames PDFs into `documents/<type>/EXAM_TYPE_YYYY-MM-DD.pdf`, writes `manifest.json` (timestamps, counts, checksums, per-domain errors), and a top-level `summary.md`.

## Output structure

```
output/
  documents/               # renamed PDFs, organized by type
    laboratoire/  imagerie/  ...
  data/                    # clean structured JSON, one file per domain
    labs.json medications.json vaccines.json appointments.json imaging.json
  markdown/                # human/LLM-readable rollups
    labs.md medications.md ... summary.md
  manifest.json            # what was extracted, when, counts, checksums, errors
```

## Resilience & privacy

- **Incremental**: manifest tracks docs by stable ID + checksum; re-runs skip already-downloaded docs.
- **Polite**: configurable delay between requests; we do not hammer a government server.
- **Isolated failures**: each collector wrapped in try/catch; failures logged and reported at the end, run continues.
- **Offline re-processing**: raw responses persisted so format changes never require re-fetching or re-login.
- **Privacy**: `output/`, `recon/`, `raw/`, `.auth/` all gitignored. The repo ships only code + synthetic/redacted fixtures. Nothing leaves the machine.

## Tech stack (matches workspace conventions)

TypeScript, Node 20+, **pnpm**, Playwright (Chromium, headed), **zod**, **oxlint + oxfmt**, **vitest**, tsx (dev) / tsc (build). `pnpm check` (format + lint + typecheck) and `pnpm fix` (autoformat + lint fix) wired up like the other active projects.

## Testing strategy

- **TDD** on the high-value pure logic — normalize, rename, manifest skip-logic, markdown generation — against saved fixtures. These are bug-prone and matter most.
- Browser/capture/download is smoke-tested against recorded fixtures, **not** unit-tested against the live gov site.

## Build sequence

1. **Scaffold** — package.json, tsconfig, oxlint/oxfmt, vitest, `.gitignore`, CLI skeleton, `session.ts` + `capture.ts`, working `recon` command.
2. **Live recon session** (needs the user) — log in, click through every section, record traffic → document the auth flow + endpoints in `docs/`.
3. **One collector end-to-end** (labs first) — collector + normalize + markdown + tests against captured fixtures.
4. **Remaining collectors** — medications, vaccines, imaging, appointments, documents.
5. **Downloader + rename + manifest + incremental** — authed PDF download, deterministic naming, skip-existing.
6. **Output consolidation + harden** — `summary.md`; promote proven-stable endpoints to direct API calls (Approach A); retries/delays tuning.

## Open questions (resolved during recon)

- Exact login/MFA flow and how to reliably detect "logged in".
- Whether the API uses short-lived bearer tokens (needs live-page refresh) vs cookie sessions.
- The real set of data domains and their endpoint shapes — the domain list above is the expected set and will be confirmed/adjusted from recon.
