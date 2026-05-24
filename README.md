# Carnet Santé Extractor

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

Locally (builds for the current platform only):

```bash
pnpm package
# Windows → release/Carnet Sante Extractor Setup <version>.exe  (NSIS)
# macOS   → release/Carnet Sante Extractor-<version>.dmg        (universal: x64 + arm64)
# Linux   → release/Carnet Sante Extractor-<version>.AppImage
```

Builds are unsigned. On Windows, SmartScreen warns on first launch — **More info → Run anyway**. On macOS, Gatekeeper blocks unsigned apps — **right-click the DMG → Open** to bypass.

**Releases** are built for all three platforms automatically by the GitHub Actions workflow whenever `package.json`'s `version` field changes on `master`:

```bash
# bump version in package.json, commit, push — the workflow does the rest
npm version patch   # or minor / major, or edit package.json directly
git push origin master
```

## What it extracts

Each domain becomes a `data/<domain>.json` + a linked `markdown/<domain>.md`; imaging and labs also pull their report PDFs.

| Domain               | What you get                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Profile**          | Name, sex, birth date, health-card number + expiry, address, email, phone, family-doctor status                 |
| **Medications**      | Prescriptions — drug (DIN), posology, prescriber, pharmacy, duration, refills remaining, last-dispensed date    |
| **Appointments**     | Scheduled appointments — date/time, doctor, clinic, specialty, status                                           |
| **Medical services** | RAMQ-billed services/visits — date, description, practitioner, facility, amount paid by RAMQ                    |
| **Imaging**          | Exam list (date, description, prescriber) + every radiology **report PDF**                                      |
| **Labs**             | Sample list + structured analyses (value / reference / abnormal flag) + every lab **report PDF**                |
| **Folder access**    | The access journal — **who consulted your record**: each worker's name + role, when, and which domains they saw |

Vaccines (a separate _Carnet de vaccination_ portal) are out of scope. Endpoint surface + response shapes: [`docs/api-reference.md`](docs/api-reference.md).

## Output

Written to `~/carnet-sante-extractor/` — every run lives in its own ISO-timestamped subfolder so prior runs are preserved:

```
~/carnet-sante-extractor/
  <ISO-timestamp>/
    raw/         full server payloads for the run
      responses/   captured JSON (Capture flow)
      data/        per-domain raw JSON (Extract flow)
      documents/   downloaded PDFs (raw filenames by report id)
      log.jsonl    one-event-per-line for tooling
      log.txt      same events, human-readable
    output/      clean deliverables for the run
      data/        normalized JSON (or raw fallback if a schema misses)
      markdown/    per-domain markdown rollups, linked to PDFs + raw JSON
      documents/   renamed PDFs organized by type (imagerie/, laboratoire/)
      manifest.json
      summary.md   top-level health record summary
```

The toolbar's **Open output** button lands you in the most recent run's folder automatically.

## Privacy

`raw/`, `output/`, and the Electron session partition (live cookies) live under your user profile and must never be committed. The repo ships only code + synthetic/redacted fixtures.

## Status

Implemented end-to-end: log in, capture, and extract every domain above into clean Markdown + JSON with organized PDFs.
