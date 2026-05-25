# Carnet Santé Extractor

Desktop app that pulls **everything** out of [Carnet Santé Québec](https://carnetsante.gouv.qc.ca) — the Quebec government health portal that has no API and no bulk download. Open the app, log in by hand (MFA and all), and it takes over the live session: it captures the structured data the site renders + downloads every PDF, then turns it into a single **self-contained HTML record** you can open and search, plus per-section **Markdown + JSON** for an LLM later.

No cloud, no API keys, no LLM in the loop. Everything stays on your machine.

## Download & install

Go to the [Releases](../../releases) page and download the installer for your system:

- **Windows** — `.exe` (NSIS installer). Windows will warn you with a SmartScreen popup — click **More info → Run anyway** to proceed. The app is unsigned, not malicious.
- **macOS** — `.dmg`. Gatekeeper will block it on first open — **right-click the DMG → Open** to bypass.
- **Linux** — `.AppImage`. Make it executable (`chmod +x`) and run it directly.

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

**Releases** are built for all three platforms automatically by the GitHub Actions workflow whenever `package.json`'s `version` field changes on `master`:

```bash
# bump version in package.json, commit, push — the workflow does the rest
npm version patch   # or minor / major, or edit package.json directly
git push origin master
```

## What it extracts

Each domain becomes a `donnees/<slug>.json` + a linked `documents/<n>-<slug>.md`; imaging and labs also pull their report PDFs. Everything is also rolled into one searchable `dossier-complet.html`.

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

Written to `~/carnet-sante-extractor/` — every run lives in its own ISO-timestamped subfolder so prior runs are preserved. **HTML is emitted only as `dossier-complet.html`**; everything else is Markdown or JSON.

```
~/carnet-sante-extractor/
  <ISO-timestamp>/
    dossier-complet.html   ← open this: your whole record on one page —
                             sidebar TOC, live search, collapsible sections,
                             light/dark, prints to a clean PDF. Self-contained
                             (no internet, no external files).
    LISEZ-MOI.md           plain-text index of the folder
    documents/             the readable record, one Markdown file per section
      1-profil.md  2-medicaments.md  …  7-acces.md
      pdf/
        imagerie/            downloaded imaging report PDFs
        prelevements/        downloaded lab report PDFs
    donnees/               structured data for power users / tools
      profil.json  medicaments.json  …  acces.json
      index.json            machine index — counts, checksums, file map, locale
    capture-brute/         untouched raw capture, for debugging only
      data/*.json  documents/<id>.pdf  log.jsonl  log.txt
```

Headings and labels follow the app's language (default French); the data values stay as the government returns them. The toolbar's **Open output** button lands you in the most recent run's folder automatically.

## Privacy

Everything under `~/carnet-sante-extractor/` (your real record + the raw `capture-brute/` payloads) and the Electron session partition (live cookies) lives under your user profile and must never be committed. The repo ships only code + synthetic/redacted fixtures.

## Status

Implemented end-to-end: log in, capture, and extract every domain above into a single searchable HTML record + clean per-section Markdown/JSON with organized PDFs.
