# carnet-sante-extract Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 1 raw-capture app into a full extraction pipeline — drive the live session, hit each domain's endpoints (labs, medications, vaccines-out-of-scope, imaging, appointments, services, profile), download flagged PDFs, then normalize the raw JSON into zod-validated records, deterministic per-domain Markdown rollups, organized renamed PDFs, a manifest, and a top-level `summary.md`.

**Architecture:** Add a new "Extract" toolbar button that runs collectors against the live partition session. Each collector calls one or more endpoints via a typed `Navigator` adapter over the embedded `WebContents`, returning raw payloads + PDF descriptors. The pure `normalize/` layer maps raw JSON → clean records via zod; the pure `output/` layer writes `data/*.json`, `markdown/*.md`, organized/renamed PDFs, and `manifest.json`. A final `summary.md` aggregates across domains.

**Tech Stack:** TypeScript (Bundler resolution), Electron `net.fetch` against the partition, zod, vitest, oxlint + oxfmt, pnpm.

**Scope note:** This implements Phase 3 of `docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`. The endpoint surface and shape sketches come from `docs/superpowers/notes/2026-05-23-phase2-endpoint-map.md` (Phase 2 capture). Vaccines stay out of scope (different portal). Task 1 patches two Phase 1 bugs discovered during Phase 2 — without them the pipeline can't be tested cleanly.

**Conventions (enforced by `pnpm check`):** no semicolons, single quotes, 2-space indent, 120 col, trailing commas, arrow functions over `function`, named exports only, relative imports keep `.js` extensions. `no-floating-promises` is an error → prefix fire-and-forget promises with `void`. Blank line before every `return`/`if`/`for`/`try` and after each `const`/`let` block. Run `pnpm fix` before every commit.

---

## File structure

**Created:**

- `src/main/navigator.ts` — concrete `Navigator` adapter (goto + waitForJson over embedded `webContents`).
- `src/main/orchestrator.ts` — runs all collectors, gathers raw + PDF descriptors, hands off to normalize/output.
- `src/main/extract.ts` — extract-mode entry: orchestrator + per-domain progress reporting.
- `src/collectors/profile.ts` — citoyen + carte + coordonnees + email + phone + photo + situation-médecin
- `src/collectors/medications.ts` — `/Medications?Dates` list
- `src/collectors/appointments.ts` — `/RendezVous?Dates` list (per-year sweep)
- `src/collectors/medical-services.ts` — `/ServicesMedicauxAssures?Dates` list
- `src/collectors/imaging.ts` — `/ExamensImagerie?Dates` list → per-exam `/DetailRapport` → PDF descriptors
- `src/collectors/labs.ts` — `/Prelevement/.../Prelevements?Dates` list per year → `/Rapports` + `/ResultatsAnalyse` per lab
- `src/collectors/index.ts` — registry
- `src/normalize/schemas.ts` — zod schemas per domain
- `src/normalize/profile.ts`, `medications.ts`, `appointments.ts`, `medical-services.ts`, `imaging.ts`, `labs.ts` — raw → clean records
- `src/normalize/markdown.ts` — clean records → per-domain markdown
- `src/output/rename.ts` — deterministic PDF naming
- `src/output/manifest.ts` — manifest read/write + skip-existing
- `src/output/writer.ts` — final assembly: write `data/*.json`, `markdown/*.md`, rename PDFs, write `manifest.json`
- `src/output/summary.ts` — top-level `summary.md` rollup
- `tests/fixtures/<domain>/list.json` — synthetic fixtures per domain (no real PHI, just shape)
- `tests/fixtures/<domain>/detail.json` — where applicable (imaging, labs)
- `tests/<domain>.normalize.test.ts` — per-domain normalize tests
- `tests/markdown.test.ts` — markdown generation
- `tests/rename.test.ts` — PDF rename rules
- `tests/manifest.test.ts` — manifest + skip-existing
- `tests/summary.test.ts` — summary rollup

**Modified:**

- `src/main/index.ts` — wire extract-mode handlers + per-run timestamped raw dir + non-OneDrive output base
- `src/main/capture.ts` — accept `runDir` for timestamped output (Phase 1 bug #2 fix)
- `src/main/downloader.ts` — accept `runDir` (same)
- `src/shared/ipc.ts` — add extractStart/extractStop/extractProgress channels
- `src/preload/index.ts` — expose extract API
- `src/renderer/index.html` / `app.ts` / `styles.css` — add Extract button + extract-progress display
- `src/config.ts` — drop `outputDir/rawDir` defaults in favour of `app.getPath('home')`-based, set at runtime
- `src/collectors/types.ts` — flesh out the `Navigator` interface (now concrete)
- `CLAUDE.md`, `README.md`, design spec — describe Phase 3 + extract mode

---

## Task 1: Phase 1 patches — OneDrive output path + per-run timestamped raw dir

Two Phase 1 bugs surfaced during Phase 2. Without these fixes, real recon data syncs to OneDrive and re-runs clobber prior captures. Quick surgical commit before any Phase 3 work.

**Files:**

- Modify: `src/main/index.ts` (output path override + per-run timestamp)
- Modify: `src/main/capture.ts` (accept runDir instead of hardcoding `responses/`)
- Modify: `src/main/downloader.ts` (no change needed — already takes `dir` arg; just confirm caller passes `<runDir>/documents`)

- [ ] **Step 1: Replace the output-path override in `src/main/index.ts`**

In `app.whenReady().then(...)`, replace these two lines:

```ts
config.outputDir = join(app.getPath('documents'), 'carnet-sante-extract', 'output')
config.rawDir = join(app.getPath('documents'), 'carnet-sante-extract', 'raw')
```

With these:

```ts
const base = join(app.getPath('home'), 'carnet-sante-extract')

config.outputDir = join(base, 'output')
config.rawDir = join(base, 'raw')
```

`app.getPath('home')` returns `%USERPROFILE%` on Windows — never OneDrive-redirected. The output lands at `C:\Users\<user>\carnet-sante-extract\` (visible at the top of the user profile, easy to "Open output").

- [ ] **Step 2: Add per-run timestamping in `captureStart`**

In `wireIpc`, replace the `captureStart` handler body so a fresh `runId` (ISO timestamp, filesystem-safe) anchors both the capture dir and the downloader dir for this run. The runId lives in the `capture` handle so `captureStop` reuses it.

Replace this:

```ts
ipcMain.handle(IPC.captureStart, async () => {
  if (!win || capture || starting) {
    return
  }

  starting = true

  try {
    capture = await startCapture(win.site.webContents, resolve(config.rawDir, 'responses'), (counts) =>
      send(IPC.captureProgress, { phase: 'capturing', ...counts } satisfies ProgressPayload),
    )
    send(IPC.captureProgress, { phase: 'capturing', json: 0, binaries: 0 } satisfies ProgressPayload)
  } finally {
    starting = false
  }
})
```

With this:

```ts
ipcMain.handle(IPC.captureStart, async () => {
  if (!win || capture || starting) {
    return
  }

  starting = true

  try {
    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const runDir = resolve(config.rawDir, runId)

    capture = await startCapture(win.site.webContents, runDir, (counts) =>
      send(IPC.captureProgress, { phase: 'capturing', ...counts } satisfies ProgressPayload),
    )
    send(IPC.captureProgress, { phase: 'capturing', json: 0, binaries: 0 } satisfies ProgressPayload)
  } finally {
    starting = false
  }
})
```

- [ ] **Step 3: Plumb runDir through `startCapture` → `CaptureHandle`**

In `src/main/capture.ts`, change the `dir: string` parameter to be the per-run base (not the `responses/` subdir), expose it on the handle, and write `responses/` underneath:

Replace the existing signature + body to:

```ts
export type CaptureHandle = {
  store: CaptureStore
  runDir: string
  stop: () => Promise<void>
}

export const startCapture = async (
  webContents: WebContents,
  runDir: string,
  onProgress: (counts: ProgressCounts) => void,
): Promise<CaptureHandle> => {
  // ...existing body unchanged EXCEPT:
  // - replace every `dir` reference with `resolve(runDir, 'responses')`
  //   (in ensureDir, writeJson paths, and the `stop()` index.json write)
```

Specifically, in the finish handler change:

```ts
await ensureDir(dir)
await writeJson(resolve(dir, file), { ... })
```

to:

```ts
const responsesDir = resolve(runDir, 'responses')
await ensureDir(responsesDir)
await writeJson(resolve(responsesDir, file), { ... })
```

And in `stop()` change:

```ts
await ensureDir(dir)
await writeJson(resolve(dir, 'index.json'), store)
```

to:

```ts
const responsesDir = resolve(runDir, 'responses')
await ensureDir(responsesDir)
await writeJson(resolve(responsesDir, 'index.json'), store)
```

Add `runDir` to the returned object: `return { store, runDir, stop }`.

- [ ] **Step 4: Use the captured runDir in `captureStop`**

In `src/main/index.ts`'s `captureStop` handler, replace `resolve(config.rawDir, 'documents')` with `resolve(capture.runDir, 'documents')`:

```ts
const downloaded = await downloadCaptured(ses, store.binaries, resolve(capture.runDir, 'documents'))
```

(You'll need to capture the handle in a local before calling `capture.stop()` if `capture` becomes undefined after stop. Read the file fresh and adjust accordingly.)

- [ ] **Step 5: Verify deterministic gates**

```bash
pnpm fix
pnpm check         # format + lint + typecheck — must be green
pnpm test          # 14/14 must still pass
pnpm build         # must emit out/main/index.js without errors
```

Yann verifies manually that a fresh `pnpm dev` writes to `~/carnet-sante-extract/raw/<ISO-timestamp>/responses/`, not under Documents.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: avoid OneDrive output path + timestamp each capture run"
```

---

## Task 2: Navigator adapter + extract-mode IPC + Extract button

Establish the Phase 3 architecture surface before any collector is written. Concrete `Navigator` over `webContents`, new IPC channels for extract mode, and a second toolbar button that wires through.

**Files:**

- Modify: `src/collectors/types.ts` (Navigator now backed by a real adapter)
- Create: `src/main/navigator.ts`
- Modify: `src/shared/ipc.ts` (add extractStart, extractStop, extractProgress channels + ExtractPhase type)
- Modify: `src/preload/index.ts` (expose extract API)
- Modify: `src/renderer/{index.html,app.ts,styles.css}` (Extract button + extract status row)
- Modify: `src/main/index.ts` (no-op IPC handlers for extract; orchestrator wiring lands in Task 11)

- [ ] **Step 1: Update `src/collectors/types.ts`**

Replace contents with:

```ts
import { type CaptureStore } from '../capture/store.js'
import { type Domain } from '../config.js'

export type Navigator = {
  goto: (pathOrUrl: string) => Promise<void>
  waitForJson: <T = unknown>(match: (url: string) => boolean, timeoutMs?: number) => Promise<T>
  fetchJson: <T = unknown>(url: string) => Promise<T>
}

export type CollectContext = {
  nav: Navigator
  capture: CaptureStore
  citizenId: string
}

export type DocumentDescriptor = {
  id: string
  url: string
  title: string
  type: string
  date?: string
}

export type DomainResult = {
  domain: Domain
  raw: unknown
  documents: DocumentDescriptor[]
}

export type Collector = {
  domain: Domain
  collect: (ctx: CollectContext) => Promise<DomainResult>
}
```

Note `Navigator.fetchJson` is added — collectors will use it for direct API calls now that endpoints are mapped, rather than relying purely on waitForJson capturing UI-fired traffic.

- [ ] **Step 2: Create `src/main/navigator.ts`**

```ts
import { net, type Session, type WebContents } from 'electron'

import { type Navigator } from '../collectors/types.js'

const DEFAULT_TIMEOUT_MS = 30_000

export const createNavigator = (webContents: WebContents, session: Session): Navigator => ({
  goto: async (pathOrUrl) => {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.carnetsante.gouv.qc.ca${pathOrUrl}`

    await webContents.loadURL(url)
  },
  waitForJson: <T>(match: (url: string) => boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> =>
    new Promise((resolveP, rejectP) => {
      const timer = setTimeout(() => {
        webContents.session.webRequest.onCompleted(null)
        rejectP(new Error('waitForJson: timed out'))
      }, timeoutMs)

      webContents.session.webRequest.onCompleted({ urls: ['<all_urls>'] }, (details) => {
        if (!match(details.url)) {
          return
        }

        clearTimeout(timer)
        webContents.session.webRequest.onCompleted(null)
        // The body isn't on `details`. We re-fetch the matched URL via net.fetch (session cookies attach).
        void net
          .fetch(details.url, { session, useSessionCookies: true } as never)
          .then(async (r) => resolveP((await r.json()) as T))
          .catch(rejectP)
      })
    }),
  fetchJson: async <T>(url: string): Promise<T> => {
    const response = await net.fetch(url, { session, useSessionCookies: true } as never)

    if (!response.ok) {
      throw new Error(`fetchJson ${url}: HTTP ${response.status}`)
    }

    return (await response.json()) as T
  },
})
```

- [ ] **Step 3: Add extract channels to `src/shared/ipc.ts`**

Append to the existing `IPC` object:

```ts
export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureProgress: 'capture:progress',
  siteUrl: 'site:url',
  openOutput: 'output:open',
  extractStart: 'extract:start',
  extractStop: 'extract:stop',
  extractProgress: 'extract:progress',
} as const

export type ExtractPhase = 'idle' | 'running' | 'normalizing' | 'writing' | 'done' | 'error'

export type ExtractProgressPayload = {
  phase: ExtractPhase
  currentDomain?: string
  domainsDone: number
  domainsTotal: number
  rawBytes: number
  downloads: number
  error?: string
}
```

- [ ] **Step 4: Expose extract API in `src/preload/index.ts`**

Add to the `api` object:

```ts
startExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStart),
stopExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStop),
onExtractProgress: (cb: (payload: ExtractProgressPayload) => void): (() => void) => {
  const handler = (_event: unknown, payload: ExtractProgressPayload): void => cb(payload)

  ipcRenderer.on(IPC.extractProgress, handler)

  return () => ipcRenderer.off(IPC.extractProgress, handler)
},
```

And update the import line:

```ts
import { IPC, type ExtractProgressPayload, type ProgressPayload } from '../shared/ipc.js'
```

- [ ] **Step 5: Update renderer**

In `src/renderer/index.html`, add an Extract button after the Open output button:

```html
<button id="extract">Extract everything</button>
```

In `src/renderer/app.ts`, add at the bottom:

```ts
const extractEl = document.querySelector<HTMLButtonElement>('#extract')!
let extracting = false

extractEl.addEventListener('click', () => {
  if (extracting) {
    void window.api.stopExtract()
  } else {
    void window.api.startExtract()
  }
})

window.api.onExtractProgress((payload) => {
  extracting = payload.phase === 'running' || payload.phase === 'normalizing' || payload.phase === 'writing'
  extractEl.textContent = extracting ? 'Stop extract' : 'Extract everything'

  const tail = payload.currentDomain ? ` — ${payload.currentDomain}` : ''

  statusEl.textContent = `extract: ${payload.phase} (${payload.domainsDone}/${payload.domainsTotal})${tail}`
})
```

In `src/renderer/styles.css`, no rule additions needed (button inherits `#bar button`).

- [ ] **Step 6: Add no-op IPC handlers in `src/main/index.ts`** (the real implementation lands in Task 11)

In `wireIpc`, after the existing handlers, add:

```ts
ipcMain.handle(IPC.extractStart, () => undefined)
ipcMain.handle(IPC.extractStop, () => undefined)
```

- [ ] **Step 7: Verify**

```bash
pnpm fix
pnpm check
pnpm test
pnpm build
```

All gates green. `pnpm dev` shows the Extract button next to Open output; clicking it does nothing (no-op handlers).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: extract-mode IPC + Navigator adapter + toolbar button"
```

---

## Task 3: Profile collector + bootstrap + normalize/markdown + tests

Smallest non-trivial collector; exercises the full vertical (collector → schema → normalize → markdown → fixture-based test). Implicitly fixes the "where does citizenId come from" question via `/api/1/Citoyens`.

**Files:**

- Create: `src/collectors/profile.ts`
- Create: `src/normalize/schemas.ts` (just profile shape for now; other domains append)
- Create: `src/normalize/profile.ts`
- Create: `src/normalize/markdown.ts` (just profile section for now; other domains append)
- Create: `tests/fixtures/profile/citoyen.json`, `coordonnees.json`, `carte.json`, `email.json`, `phone.json`, `medecin.json`
- Create: `tests/profile.normalize.test.ts`

- [ ] **Step 1: Write the fixtures**

Synthetic only — no real PHI. Names of fictional public figures avoided; use placeholders.

`tests/fixtures/profile/citoyen.json`:

```json
{
  "IndAdmissibiliteCarnetSante": true,
  "PersonnesACharge": null,
  "IdCitoyen": "99999",
  "Nom": "DOE",
  "Prenom": "JANE",
  "Sexe": "Femme",
  "DateNaissance": "1980-01-01T00:00:00",
  "CarteAssuranceMaladie": null,
  "FonctionnalitesActives": null,
  "EstAgeEntre14Et17Ans": false
}
```

`tests/fixtures/profile/coordonnees.json`:

```json
{ "Adresse": "123 Test Street", "Ville": "Montreal", "CodePostal": "H0H 0H0", "Province": "QC" }
```

`tests/fixtures/profile/carte.json`:

```json
{ "Numero": "DOEJ12345678", "DateExpiration": "2030-12-31T00:00:00" }
```

`tests/fixtures/profile/email.json`:

```json
{ "Adresse": "jane.doe@example.invalid", "Confirme": true }
```

`tests/fixtures/profile/phone.json`:

```json
{ "Numero": "555-0100", "Confirme": true }
```

`tests/fixtures/profile/medecin.json`:

```json
{ "ANomMedecinFamille": "SMITH", "APrenomMedecinFamille": "JOHN", "AClinique": "Clinique Example" }
```

Note: real `Coordonnees` / `CarteAssuranceMaladie` / `Email` / `Phone` / `MedecinFamille` shapes weren't fully read in Phase 2 — these fixtures are a best-guess from field names visible in the URLs. When the collector is run against the live site, the schemas may need adjustment. Add a TODO comment to the schema and adjust on first real run.

- [ ] **Step 2: Write `src/normalize/schemas.ts` profile section**

```ts
import { z } from 'zod'

const isoDate = z.string()

export const citoyenSchema = z.object({
  IdCitoyen: z.string(),
  Nom: z.string(),
  Prenom: z.string(),
  Sexe: z.string(),
  DateNaissance: isoDate,
  IndAdmissibiliteCarnetSante: z.boolean(),
  EstAgeEntre14Et17Ans: z.boolean(),
  PersonnesACharge: z.array(z.unknown()).nullable(),
})

export const coordonneesSchema = z.object({
  Adresse: z.string().optional(),
  Ville: z.string().optional(),
  CodePostal: z.string().optional(),
  Province: z.string().optional(),
})

export const carteSchema = z.object({
  Numero: z.string(),
  DateExpiration: isoDate,
})

export const courrielSchema = z.object({
  Adresse: z.string(),
  Confirme: z.boolean().optional(),
})

export const phoneSchema = z.object({
  Numero: z.string(),
  Confirme: z.boolean().optional(),
})

export const medecinSchema = z.object({
  ANomMedecinFamille: z.string().optional(),
  APrenomMedecinFamille: z.string().optional(),
  AClinique: z.string().optional(),
})

export type CleanProfile = {
  citizenId: string
  fullName: string
  birthDate: string
  sex: string
  cardNumber?: string
  cardExpires?: string
  email?: string
  phone?: string
  address?: string
  familyDoctor?: string
}
```

- [ ] **Step 3: Write `src/normalize/profile.ts`**

```ts
import {
  carteSchema,
  citoyenSchema,
  type CleanProfile,
  coordonneesSchema,
  courrielSchema,
  medecinSchema,
  phoneSchema,
} from './schemas.js'

export type ProfileRaw = {
  citoyen: unknown
  coordonnees?: unknown
  carte?: unknown
  email?: unknown
  phone?: unknown
  medecin?: unknown
}

export const normalizeProfile = (raw: ProfileRaw): CleanProfile => {
  const citoyen = citoyenSchema.parse(raw.citoyen)
  const carte = raw.carte ? carteSchema.parse(raw.carte) : undefined
  const email = raw.email ? courrielSchema.parse(raw.email) : undefined
  const phone = raw.phone ? phoneSchema.parse(raw.phone) : undefined
  const coordonnees = raw.coordonnees ? coordonneesSchema.parse(raw.coordonnees) : undefined
  const medecin = raw.medecin ? medecinSchema.parse(raw.medecin) : undefined

  const address = coordonnees
    ? [coordonnees.Adresse, coordonnees.Ville, coordonnees.Province, coordonnees.CodePostal].filter(Boolean).join(', ')
    : undefined
  const familyDoctor =
    medecin && (medecin.APrenomMedecinFamille || medecin.ANomMedecinFamille)
      ? `${medecin.APrenomMedecinFamille ?? ''} ${medecin.ANomMedecinFamille ?? ''}`.trim() || undefined
      : undefined

  return {
    citizenId: citoyen.IdCitoyen,
    fullName: `${citoyen.Prenom} ${citoyen.Nom}`,
    birthDate: citoyen.DateNaissance.slice(0, 10),
    sex: citoyen.Sexe,
    cardNumber: carte?.Numero,
    cardExpires: carte?.DateExpiration.slice(0, 10),
    email: email?.Adresse,
    phone: phone?.Numero,
    address: address || undefined,
    familyDoctor,
  }
}
```

- [ ] **Step 4: Write `tests/profile.normalize.test.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeProfile, type ProfileRaw } from '../src/normalize/profile.js'

const fixtureDir = resolve(__dirname, 'fixtures/profile')

const loadFixture = async (name: string): Promise<unknown> => {
  const text = await readFile(resolve(fixtureDir, `${name}.json`), 'utf8')

  return JSON.parse(text)
}

describe('normalizeProfile', () => {
  it('flattens the assembled raw into a CleanProfile', async () => {
    const raw: ProfileRaw = {
      citoyen: await loadFixture('citoyen'),
      coordonnees: await loadFixture('coordonnees'),
      carte: await loadFixture('carte'),
      email: await loadFixture('email'),
      phone: await loadFixture('phone'),
      medecin: await loadFixture('medecin'),
    }
    const result = normalizeProfile(raw)

    expect(result.citizenId).toBe('99999')
    expect(result.fullName).toBe('JANE DOE')
    expect(result.birthDate).toBe('1980-01-01')
    expect(result.sex).toBe('Femme')
    expect(result.cardNumber).toBe('DOEJ12345678')
    expect(result.cardExpires).toBe('2030-12-31')
    expect(result.email).toBe('jane.doe@example.invalid')
    expect(result.phone).toBe('555-0100')
    expect(result.address).toBe('123 Test Street, Montreal, QC, H0H 0H0')
    expect(result.familyDoctor).toBe('JOHN SMITH')
  })

  it('handles missing optional sections without throwing', async () => {
    const raw: ProfileRaw = { citoyen: await loadFixture('citoyen') }
    const result = normalizeProfile(raw)

    expect(result.citizenId).toBe('99999')
    expect(result.cardNumber).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.familyDoctor).toBeUndefined()
  })
})
```

- [ ] **Step 5: Write `src/normalize/markdown.ts` profile section**

```ts
import { type CleanProfile } from './schemas.js'

export const profileMarkdown = (p: CleanProfile): string => {
  const lines = [
    '# Profile',
    '',
    `**Name:** ${p.fullName}`,
    `**Citizen ID:** ${p.citizenId}`,
    `**Sex:** ${p.sex}`,
    `**Birth date:** ${p.birthDate}`,
  ]

  if (p.cardNumber) {
    lines.push(`**Health card:** ${p.cardNumber} (expires ${p.cardExpires})`)
  }
  if (p.email) {
    lines.push(`**Email:** ${p.email}`)
  }
  if (p.phone) {
    lines.push(`**Phone:** ${p.phone}`)
  }
  if (p.address) {
    lines.push(`**Address:** ${p.address}`)
  }
  if (p.familyDoctor) {
    lines.push(`**Family doctor:** ${p.familyDoctor}`)
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 6: Write `src/collectors/profile.ts`** (will be exercised in Task 11; just defines the shape now)

```ts
import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

export const profileCollector: Collector = {
  domain: 'documents', // see note below
  collect: async (ctx): Promise<DomainResult> => {
    const id = ctx.citizenId
    const [citoyen, coordonnees, carte, email, phone, medecin] = await Promise.all([
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/Coordonnees`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/CarteAssuranceMaladie`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/DonneesContact/Courriel`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/DonneesContact/TelephoneMobile`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/SituationMedecinFamille`),
    ])

    return {
      domain: 'documents', // domain enum needs a "profile" entry — see Step 7
      raw: { citoyen, coordonnees, carte, email, phone, medecin },
      documents: [],
    }
  },
}
```

- [ ] **Step 7: Add `'profile'` to the Domain enum in `src/config.ts`**

```ts
export type Domain = 'profile' | 'labs' | 'medications' | 'imaging' | 'appointments' | 'medical-services' | 'documents'
```

(Adds `profile` and `medical-services`; removes `vaccines` because it's out of scope.) Update `config.domains` array accordingly.

Then change `profileCollector.domain` to `'profile'` in Step 6.

- [ ] **Step 8: Gates + commit**

```bash
pnpm fix
pnpm check
pnpm test          # 14/14 + 2 new = 16/16
git add -A
git commit -m "feat(collectors): profile + zod schemas + markdown rollup"
```

---

## Task 4: Medications collector + schema + normalize + tests

Simplest data domain after profile. List endpoint is rich enough that we don't call the per-drug detail endpoint at all.

**Files:**

- Modify: `src/normalize/schemas.ts` (append medications)
- Create: `src/normalize/medications.ts`
- Modify: `src/normalize/markdown.ts` (append medications section)
- Create: `src/collectors/medications.ts`
- Create: `tests/fixtures/medications/list.json`
- Create: `tests/medications.normalize.test.ts`

- [ ] **Step 1: Fixture**

`tests/fixtures/medications/list.json` — two synthetic entries matching the documented shape:

```json
[
  {
    "Type": "OrdonnanceAvecService",
    "Id": "TEST0001",
    "IdOrdonnance": "TEST0001",
    "Date": "2026-04-01T00:00:00-04:00",
    "Duree": 365,
    "NomPrescripteur": "SMITH",
    "PrenomPrescripteur": "JOHN",
    "Pharmacie": "TEST PHARMACY",
    "NombreDelivrancesAutorisees": 12,
    "NombreDelivrancesRestantes": 8,
    "MedicamentPrescrit": {
      "DIN": "00000001",
      "Nom": "PLACEBO 10MG TABLET",
      "NomAnglais": "PLACEBO 10MG TABLET",
      "LibelleClasse": "Test class",
      "LibelleClasseAnglais": "Test class",
      "Posologies": [{ "DIN": null, "Nom": null, "NomAnglais": null, "Description": "Take 1 tablet once daily" }]
    },
    "DernierService": {
      "Id": "SVC0001",
      "Date": "2026-05-01T00:00:00-04:00",
      "Duree": 30,
      "NomPharmacie": "TEST PHARMACY",
      "Medicaments": {
        "DIN": "00000001",
        "Nom": "PLACEBO 10MG TABLET",
        "NomAnglais": "PLACEBO 10MG TABLET",
        "LibelleClasse": "Test class",
        "LibelleClasseAnglais": "Test class",
        "Posologies": [{ "DIN": null, "Nom": null, "NomAnglais": null, "Description": "Take 1 tablet once daily" }]
      }
    },
    "Services": null
  },
  {
    "Type": "OrdonnanceAvecService",
    "Id": "TEST0002",
    "IdOrdonnance": "TEST0002",
    "Date": "2025-12-01T00:00:00-05:00",
    "Duree": 90,
    "NomPrescripteur": "DOE",
    "PrenomPrescripteur": "JANE",
    "Pharmacie": "ANOTHER PHARMACY",
    "NombreDelivrancesAutorisees": 3,
    "NombreDelivrancesRestantes": 0,
    "MedicamentPrescrit": {
      "DIN": "00000002",
      "Nom": "ANOTHER 5MG CAPSULE",
      "NomAnglais": "ANOTHER 5MG CAPSULE",
      "LibelleClasse": "Test class 2",
      "LibelleClasseAnglais": "Test class 2",
      "Posologies": [{ "DIN": null, "Nom": null, "NomAnglais": null, "Description": "Take 1 capsule twice daily" }]
    },
    "DernierService": {
      "Id": "SVC0002",
      "Date": "2026-02-15T00:00:00-05:00",
      "Duree": 30,
      "NomPharmacie": "ANOTHER PHARMACY",
      "Medicaments": {
        "DIN": "00000002",
        "Nom": "ANOTHER 5MG CAPSULE",
        "NomAnglais": "ANOTHER 5MG CAPSULE",
        "LibelleClasse": "Test class 2",
        "LibelleClasseAnglais": "Test class 2",
        "Posologies": [{ "DIN": null, "Nom": null, "NomAnglais": null, "Description": "Take 1 capsule twice daily" }]
      }
    },
    "Services": null
  }
]
```

- [ ] **Step 2: Append to `src/normalize/schemas.ts`**

```ts
const posologieSchema = z.object({
  Description: z.string(),
  DIN: z.string().nullable().optional(),
  Nom: z.string().nullable().optional(),
  NomAnglais: z.string().nullable().optional(),
})

const medicamentSchema = z.object({
  DIN: z.string(),
  Nom: z.string(),
  NomAnglais: z.string(),
  LibelleClasse: z.string(),
  LibelleClasseAnglais: z.string(),
  Posologies: z.array(posologieSchema),
})

export const ordonnanceSchema = z.object({
  Type: z.string(),
  Id: z.string(),
  IdOrdonnance: z.string(),
  Date: isoDate,
  Duree: z.number(),
  NomPrescripteur: z.string(),
  PrenomPrescripteur: z.string(),
  Pharmacie: z.string(),
  NombreDelivrancesAutorisees: z.number(),
  NombreDelivrancesRestantes: z.number(),
  MedicamentPrescrit: medicamentSchema,
  DernierService: z
    .object({
      Id: z.string(),
      Date: isoDate,
      Duree: z.number(),
      NomPharmacie: z.string(),
      Medicaments: medicamentSchema,
    })
    .nullable(),
  Services: z.array(z.unknown()).nullable(),
})

export const medicationsListSchema = z.array(ordonnanceSchema)

export type CleanMedication = {
  id: string
  drugName: string
  din: string
  posology: string
  prescriber: string
  pharmacy: string
  prescribedAt: string
  durationDays: number
  refillsAuthorized: number
  refillsRemaining: number
  lastDispensedAt?: string
  klass: string
}
```

- [ ] **Step 3: Create `src/normalize/medications.ts`**

```ts
import { type CleanMedication, medicationsListSchema } from './schemas.js'

export const normalizeMedications = (raw: unknown): CleanMedication[] => {
  const parsed = medicationsListSchema.parse(raw)

  return parsed.map((o) => ({
    id: o.IdOrdonnance,
    drugName: o.MedicamentPrescrit.Nom,
    din: o.MedicamentPrescrit.DIN,
    posology: o.MedicamentPrescrit.Posologies.map((p) => p.Description)
      .filter(Boolean)
      .join(' / '),
    prescriber: `${o.PrenomPrescripteur} ${o.NomPrescripteur}`,
    pharmacy: o.Pharmacie,
    prescribedAt: o.Date.slice(0, 10),
    durationDays: o.Duree,
    refillsAuthorized: o.NombreDelivrancesAutorisees,
    refillsRemaining: o.NombreDelivrancesRestantes,
    lastDispensedAt: o.DernierService?.Date.slice(0, 10),
    klass: o.MedicamentPrescrit.LibelleClasse,
  }))
}
```

- [ ] **Step 4: Append markdown section to `src/normalize/markdown.ts`**

```ts
import { type CleanMedication } from './schemas.js'

export const medicationsMarkdown = (meds: CleanMedication[]): string => {
  if (meds.length === 0) {
    return '# Medications\n\n_None._\n'
  }

  const lines = ['# Medications', '']

  for (const m of meds) {
    lines.push(`## ${m.drugName}`)
    lines.push('')
    lines.push(`- **DIN:** ${m.din}`)
    lines.push(`- **Posology:** ${m.posology}`)
    lines.push(`- **Prescriber:** ${m.prescriber}`)
    lines.push(`- **Pharmacy:** ${m.pharmacy}`)
    lines.push(`- **Prescribed:** ${m.prescribedAt} (${m.durationDays} days)`)
    lines.push(`- **Refills:** ${m.refillsRemaining}/${m.refillsAuthorized} remaining`)
    if (m.lastDispensedAt) {
      lines.push(`- **Last dispensed:** ${m.lastDispensedAt}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 5: Test**

`tests/medications.normalize.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMedications } from '../src/normalize/medications.js'

describe('normalizeMedications', () => {
  it('flattens an OrdonnanceAvecService list into CleanMedication[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/medications/list.json'), 'utf8'))
    const result = normalizeMedications(raw)

    expect(result).toHaveLength(2)
    expect(result[0]?.id).toBe('TEST0001')
    expect(result[0]?.drugName).toBe('PLACEBO 10MG TABLET')
    expect(result[0]?.din).toBe('00000001')
    expect(result[0]?.posology).toBe('Take 1 tablet once daily')
    expect(result[0]?.prescriber).toBe('JOHN SMITH')
    expect(result[0]?.refillsRemaining).toBe(8)
    expect(result[0]?.lastDispensedAt).toBe('2026-05-01')
  })

  it('returns [] for an empty array', () => {
    expect(normalizeMedications([])).toEqual([])
  })

  it('throws on unexpected shape', () => {
    expect(() => normalizeMedications([{ bogus: true }])).toThrow()
  })
})
```

- [ ] **Step 6: Create the collector**

`src/collectors/medications.ts`:

```ts
import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

const sevenYearsAgo = (today: Date): string => {
  const d = new Date(today)

  d.setFullYear(d.getFullYear() - 7)

  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const todayStr = (today: Date): string => `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`

export const medicationsCollector: Collector = {
  domain: 'medications',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    const url = `${BASE}/Citoyens/${ctx.citizenId}/Medications?DateDebut=${sevenYearsAgo(now)}&DateFin=${todayStr(now)}`
    const raw = await ctx.nav.fetchJson(url)

    return { domain: 'medications', raw, documents: [] }
  },
}
```

- [ ] **Step 7: Gates + commit**

```bash
pnpm fix
pnpm check
pnpm test          # +3 = 19/19
git add -A
git commit -m "feat(collectors): medications list + zod schema + markdown"
```

---

## Task 5: Appointments collector + schema + normalize + tests

`/RendezVous?Dates` returns a flat array. UI calls it per year — we'll do the same to keep server load aligned with the human UI's pattern. Synthetic shape only (real shape wasn't read in Phase 2 — confirm-and-adjust on first live run).

**Files:**

- Modify: `src/normalize/schemas.ts` (append)
- Create: `src/normalize/appointments.ts`
- Modify: `src/normalize/markdown.ts` (append)
- Create: `src/collectors/appointments.ts`
- Create: `tests/fixtures/appointments/list.json`
- Create: `tests/appointments.normalize.test.ts`

- [ ] **Step 1: Fixture (best-guess shape — verify-and-adjust on first live run)**

```json
[
  {
    "Id": "RDV0001",
    "DateRendezVous": "2026-06-15T10:00:00-04:00",
    "NomMedecin": "SMITH",
    "PrenomMedecin": "JOHN",
    "Clinique": "Clinique Example",
    "Specialite": "Médecine familiale",
    "Statut": "Confirme"
  },
  {
    "Id": "RDV0002",
    "DateRendezVous": "2026-07-20T14:30:00-04:00",
    "NomMedecin": "DOE",
    "PrenomMedecin": "JANE",
    "Clinique": "Clinique Other",
    "Specialite": "Cardiologie",
    "Statut": "EnAttente"
  }
]
```

- [ ] **Step 2: Append schema**

```ts
export const appointmentSchema = z.object({
  Id: z.string(),
  DateRendezVous: isoDate,
  NomMedecin: z.string(),
  PrenomMedecin: z.string(),
  Clinique: z.string().optional(),
  Specialite: z.string().optional(),
  Statut: z.string().optional(),
})

export const appointmentsListSchema = z.array(appointmentSchema)

export type CleanAppointment = {
  id: string
  date: string
  time: string
  doctor: string
  clinic?: string
  specialty?: string
  status?: string
}
```

- [ ] **Step 3: `src/normalize/appointments.ts`**

```ts
import { appointmentsListSchema, type CleanAppointment } from './schemas.js'

export const normalizeAppointments = (raw: unknown): CleanAppointment[] => {
  const parsed = appointmentsListSchema.parse(raw)

  return parsed.map((a) => ({
    id: a.Id,
    date: a.DateRendezVous.slice(0, 10),
    time: a.DateRendezVous.slice(11, 16),
    doctor: `${a.PrenomMedecin} ${a.NomMedecin}`,
    clinic: a.Clinique,
    specialty: a.Specialite,
    status: a.Statut,
  }))
}
```

- [ ] **Step 4: Append markdown section**

```ts
export const appointmentsMarkdown = (appts: CleanAppointment[]): string => {
  if (appts.length === 0) {
    return '# Appointments\n\n_None scheduled._\n'
  }

  const lines = ['# Appointments', '']

  for (const a of [...appts].sort((x, y) => x.date.localeCompare(y.date))) {
    const tail = [a.specialty, a.clinic, a.status].filter(Boolean).join(' — ')

    lines.push(`- **${a.date} ${a.time}** — Dr ${a.doctor}${tail ? ` (${tail})` : ''}`)
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 5: Test**

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeAppointments } from '../src/normalize/appointments.js'

describe('normalizeAppointments', () => {
  it('sorts and flattens to CleanAppointment[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/appointments/list.json'), 'utf8'))
    const result = normalizeAppointments(raw)

    expect(result).toHaveLength(2)
    expect(result[0]?.doctor).toBe('JOHN SMITH')
    expect(result[0]?.time).toBe('10:00')
    expect(result[1]?.specialty).toBe('Cardiologie')
  })

  it('handles empty array', () => {
    expect(normalizeAppointments([])).toEqual([])
  })
})
```

- [ ] **Step 6: Collector — per-year sweep**

```ts
import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

export const appointmentsCollector: Collector = {
  domain: 'appointments',
  collect: async (ctx): Promise<DomainResult> => {
    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear, currentYear + 1]
    const responses = await Promise.all(
      years.map((year) =>
        ctx.nav.fetchJson(`${BASE}/Citoyens/${ctx.citizenId}/RendezVous?DateDebut=${year}-1-1&DateFin=${year}-12-31`),
      ),
    )

    const flat = responses.flatMap((r) => (Array.isArray(r) ? r : []))

    return { domain: 'appointments', raw: flat, documents: [] }
  },
}
```

- [ ] **Step 7: Gates + commit**

```bash
pnpm fix
pnpm check
pnpm test
git add -A
git commit -m "feat(collectors): appointments per-year sweep + schema + markdown"
```

---

## Task 6: Medical-services collector + schema + normalize + tests

`ServicesMedicauxAssures?Dates`. Lightweight; same pattern as medications/appointments. Shape best-guessed (Phase 2 didn't read it).

**Files:**

- Modify: `src/normalize/schemas.ts` (append)
- Create: `src/normalize/medical-services.ts`
- Modify: `src/normalize/markdown.ts` (append)
- Create: `src/collectors/medical-services.ts`
- Create: `tests/fixtures/medical-services/list.json`
- Create: `tests/medical-services.normalize.test.ts`

- [ ] **Step 1: Fixture**

`tests/fixtures/medical-services/list.json`:

```json
[
  {
    "Id": "SVC0001",
    "DateService": "2026-04-10T00:00:00-04:00",
    "Description": "Consultation generale",
    "Etablissement": "Clinique Example",
    "Specialite": "Omnipraticien",
    "Montant": 125.5,
    "Statut": "Paye"
  }
]
```

- [ ] **Step 2: Append schema to `src/normalize/schemas.ts`**

```ts
export const serviceSchema = z.object({
  Id: z.string(),
  DateService: isoDate,
  Description: z.string().optional(),
  Etablissement: z.string().optional(),
  Specialite: z.string().optional(),
  Montant: z.number().optional(),
  Statut: z.string().optional(),
})

export const servicesListSchema = z.array(serviceSchema)

export type CleanService = {
  id: string
  date: string
  description?: string
  facility?: string
  specialty?: string
  amount?: number
  status?: string
}
```

- [ ] **Step 3: Create `src/normalize/medical-services.ts`**

```ts
import { type CleanService, servicesListSchema } from './schemas.js'

export const normalizeMedicalServices = (raw: unknown): CleanService[] => {
  const parsed = servicesListSchema.parse(raw)

  return parsed.map((s) => ({
    id: s.Id,
    date: s.DateService.slice(0, 10),
    description: s.Description,
    facility: s.Etablissement,
    specialty: s.Specialite,
    amount: s.Montant,
    status: s.Statut,
  }))
}
```

- [ ] **Step 4: Append markdown section to `src/normalize/markdown.ts`**

```ts
export const medicalServicesMarkdown = (services: CleanService[]): string => {
  if (services.length === 0) {
    return '# Medical services\n\n_No services._\n'
  }

  const lines = ['# Medical services', '']

  for (const s of [...services].sort((x, y) => y.date.localeCompare(x.date))) {
    const tail = [s.facility, s.specialty].filter(Boolean).join(' — ')

    lines.push(`- **${s.date}** — ${s.description ?? 'Service'}${tail ? ` (${tail})` : ''}`)
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 5: Test**

`tests/medical-services.normalize.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMedicalServices } from '../src/normalize/medical-services.js'

describe('normalizeMedicalServices', () => {
  it('flattens to CleanService[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/medical-services/list.json'), 'utf8'))
    const result = normalizeMedicalServices(raw)

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('SVC0001')
    expect(result[0]?.date).toBe('2026-04-10')
    expect(result[0]?.facility).toBe('Clinique Example')
  })

  it('handles empty array', () => {
    expect(normalizeMedicalServices([])).toEqual([])
  })
})
```

- [ ] **Step 6: Collector**

```ts
import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

export const medicalServicesCollector: Collector = {
  domain: 'medical-services',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    const start = new Date(now)

    start.setFullYear(start.getFullYear() - 7)
    const url = `${BASE}/Citoyens/${ctx.citizenId}/ServicesMedicauxAssures?DateDebut=${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}&DateFin=${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const raw = await ctx.nav.fetchJson(url)

    return { domain: 'medical-services', raw, documents: [] }
  },
}
```

- [ ] **Step 7: Commit** as `feat(collectors): medical-services list + schema + markdown`.

---

## Task 7: Imaging collector — list → detail → PDF descriptors

First multi-step collector. List endpoint gives `NumeroExamen`; per-exam `/DetailRapport` gives `{reportId}`; PDF lives at `/DetailRapport/{reportId}/Rapport`.

**Files:**

- Modify: `src/normalize/schemas.ts` (append imaging shapes)
- Create: `src/normalize/imaging.ts`
- Modify: `src/normalize/markdown.ts` (append)
- Create: `src/collectors/imaging.ts`
- Create: `tests/fixtures/imaging/list.json`, `tests/fixtures/imaging/detail.json`
- Create: `tests/imaging.normalize.test.ts`

- [ ] **Step 1: Fixtures**

`tests/fixtures/imaging/list.json`:

```json
[
  {
    "IdCitoyen": null,
    "NumeroExamen": "9.99.999.9.999999.9.9.99999.9999.9999999.9",
    "DateExamen": "2024-06-15T10:30:00-04:00",
    "DescriptionExamen": "Radiographie test",
    "NomPrescripteur": "SMITH",
    "PrenomPrescripteur": "JOHN",
    "RapportsImagerie": null,
    "DateDisponibiliteRapport": null
  }
]
```

`tests/fixtures/imaging/detail.json` (best-guess — first real run will refine):

```json
{
  "NumeroExamen": "9.99.999.9.999999.9.9.99999.9999.9999999.9",
  "RapportsImagerie": [
    {
      "IdRapport": "999999999999.99.999.9.999999.9.9.99999.9999.99999990",
      "DateRapport": "2024-06-15T11:00:00-04:00",
      "Statut": "Finalise"
    }
  ]
}
```

- [ ] **Step 2: Schemas**

```ts
export const imagingListItemSchema = z.object({
  NumeroExamen: z.string(),
  DateExamen: isoDate,
  DescriptionExamen: z.string(),
  NomPrescripteur: z.string(),
  PrenomPrescripteur: z.string(),
  RapportsImagerie: z.array(z.unknown()).nullable(),
  DateDisponibiliteRapport: z.string().nullable(),
  IdCitoyen: z.string().nullable(),
})

export const imagingListSchema = z.array(imagingListItemSchema)

export const imagingDetailSchema = z.object({
  NumeroExamen: z.string(),
  RapportsImagerie: z
    .array(
      z.object({
        IdRapport: z.string(),
        DateRapport: isoDate,
        Statut: z.string().optional(),
      }),
    )
    .nullable(),
})

export type CleanImagingExam = {
  examId: string
  date: string
  description: string
  prescriber: string
  reportIds: string[]
}
```

- [ ] **Step 3: Normalize**

```ts
import { type CleanImagingExam, imagingDetailSchema, imagingListSchema } from './schemas.js'

export const normalizeImaging = (list: unknown, details: Record<string, unknown>): CleanImagingExam[] => {
  const parsed = imagingListSchema.parse(list)

  return parsed.map((e) => {
    const detail = details[e.NumeroExamen]
    const parsedDetail = detail ? imagingDetailSchema.parse(detail) : undefined

    return {
      examId: e.NumeroExamen,
      date: e.DateExamen.slice(0, 10),
      description: e.DescriptionExamen,
      prescriber: `${e.PrenomPrescripteur} ${e.NomPrescripteur}`,
      reportIds: parsedDetail?.RapportsImagerie?.map((r) => r.IdRapport) ?? [],
    }
  })
}
```

- [ ] **Step 4: Markdown**

```ts
export const imagingMarkdown = (exams: CleanImagingExam[]): string => {
  if (exams.length === 0) {
    return '# Imaging\n\n_No exams._\n'
  }

  const lines = ['# Imaging', '']

  for (const e of [...exams].sort((x, y) => y.date.localeCompare(x.date))) {
    lines.push(`- **${e.date}** — ${e.description} (Dr ${e.prescriber}) — ${e.reportIds.length} report(s)`)
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 5: Test**

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeImaging } from '../src/normalize/imaging.js'

describe('normalizeImaging', () => {
  it('joins list with per-exam detail to expose reportIds', async () => {
    const list = JSON.parse(await readFile(resolve(__dirname, 'fixtures/imaging/list.json'), 'utf8'))
    const detail = JSON.parse(await readFile(resolve(__dirname, 'fixtures/imaging/detail.json'), 'utf8'))
    const result = normalizeImaging(list, { '9.99.999.9.999999.9.9.99999.9999.9999999.9': detail })

    expect(result).toHaveLength(1)
    expect(result[0]?.reportIds).toHaveLength(1)
    expect(result[0]?.description).toBe('Radiographie test')
  })
})
```

- [ ] **Step 6: Collector — list then detail-per-exam, return PDF descriptors**

```ts
import { type Collector, type DocumentDescriptor, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

type ImagingListItem = { NumeroExamen: string; DateExamen: string; DescriptionExamen: string }
type ImagingDetail = { RapportsImagerie?: { IdRapport: string }[] | null }

export const imagingCollector: Collector = {
  domain: 'imaging',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    const fromYear = now.getFullYear() - 7
    const url = `${BASE}/Citoyens/${ctx.citizenId}/ExamensImagerie?DateDebut=${fromYear}-1-1&DateFin=${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const list = (await ctx.nav.fetchJson(url)) as ImagingListItem[]

    const details: Record<string, ImagingDetail> = {}
    const documents: DocumentDescriptor[] = []

    for (const e of list) {
      const d = (await ctx.nav.fetchJson(
        `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${e.NumeroExamen}/DetailRapport`,
      )) as ImagingDetail

      details[e.NumeroExamen] = d

      for (const r of d.RapportsImagerie ?? []) {
        documents.push({
          id: r.IdRapport,
          url: `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${e.NumeroExamen}/DetailRapport/${r.IdRapport}/Rapport`,
          title: e.DescriptionExamen,
          type: 'imagerie',
          date: e.DateExamen.slice(0, 10),
        })
      }
    }

    return { domain: 'imaging', raw: { list, details }, documents }
  },
}
```

- [ ] **Step 7: Commit**

```bash
pnpm fix
pnpm check
pnpm test          # +1 = 21/21
git add -A
git commit -m "feat(collectors): imaging list+detail+PDF descriptors"
```

---

## Task 8: Labs collector — list-per-year → Rapports + ResultatsAnalyse per lab

Most complex collector. `Prelevements?Dates` per year → for each `Prelevement`, construct the base64-encoded composite ID → fetch `/Rapports` (metadata) + `/ResultatsAnalyse?Tracking=` (values).

**Files:**

- Modify: `src/normalize/schemas.ts` (append labs shapes)
- Create: `src/normalize/labs.ts`
- Modify: `src/normalize/markdown.ts` (append)
- Create: `src/collectors/labs.ts`
- Create: `tests/fixtures/labs/list.json`, `tests/fixtures/labs/rapports.json`, `tests/fixtures/labs/results.json`
- Create: `tests/labs.normalize.test.ts`
- Create: `src/util/lab-id.ts` (helper that base64-url-encodes `{NoReq, OIDSIL, TypeRapp}`)
- Create: `tests/lab-id.test.ts`

- [ ] **Step 1: Base64 helper**

`src/util/lab-id.ts`:

```ts
export type LabIdParts = { NoReq: string; OIDSIL: string; TypeRapp: 'LAB' }

export const encodeLabId = (parts: LabIdParts): string => {
  const json = JSON.stringify(parts)
  // URL-safe base64 (RFC 4648 §5) — the gov API uses standard base64 but the URLs in the wild
  // contain no `+`/`/`/`=` characters in the captures, so standard base64 works. If a future
  // capture shows URL-encoded characters, switch to base64url here.

  return Buffer.from(json, 'utf8').toString('base64').replace(/=+$/, '')
}
```

`tests/lab-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { encodeLabId } from '../src/util/lab-id.js'

describe('encodeLabId', () => {
  it('encodes the JSON triple to base64 without padding', () => {
    const id = encodeLabId({ NoReq: '4054515361', OIDSIL: '2.16.124.10.101.1.60.1.3.500.1', TypeRapp: 'LAB' })

    expect(id).toMatch(/^eyJOb1JlcSI6/)
    expect(id.endsWith('=')).toBe(false)
    const decoded = JSON.parse(Buffer.from(id, 'base64').toString('utf8'))

    expect(decoded.NoReq).toBe('4054515361')
    expect(decoded.TypeRapp).toBe('LAB')
  })
})
```

- [ ] **Step 2: Fixtures (synthetic)**

`tests/fixtures/labs/list.json`:

```json
[
  {
    "NoReq": "1234567890",
    "OIDSIL": "9.99.999.99.999.9.99.9.9.999.9",
    "TypeRapp": "LAB",
    "DateService": "2024-10-15T08:00:00-04:00",
    "Description": "Bilan sanguin standard",
    "NomPrescripteur": "SMITH",
    "PrenomPrescripteur": "JOHN"
  }
]
```

(Schema for the list item is approximated; verify-and-adjust live.)

`tests/fixtures/labs/rapports.json`:

```json
[
  {
    "IdRapport": "RPT0001",
    "DateRapport": "2024-10-16T14:00:00-04:00",
    "Statut": "Finalise"
  }
]
```

`tests/fixtures/labs/results.json`:

```json
{
  "Analyses": [
    {
      "Code": "HEMO",
      "Libelle": "Hémoglobine",
      "Valeur": "150",
      "Unite": "g/L",
      "Reference": "130-170",
      "Anormal": false
    },
    {
      "Code": "GLUC",
      "Libelle": "Glycémie",
      "Valeur": "5.2",
      "Unite": "mmol/L",
      "Reference": "3.9-6.1",
      "Anormal": false
    }
  ]
}
```

- [ ] **Step 3: Schemas**

```ts
export const prelevementListItemSchema = z.object({
  NoReq: z.string(),
  OIDSIL: z.string(),
  TypeRapp: z.literal('LAB'),
  DateService: isoDate.optional(),
  Description: z.string().optional(),
  NomPrescripteur: z.string().optional(),
  PrenomPrescripteur: z.string().optional(),
})

export const prelevementListSchema = z.array(prelevementListItemSchema)

export const labRapportSchema = z.object({
  IdRapport: z.string(),
  DateRapport: isoDate,
  Statut: z.string().optional(),
})

export const labResultsSchema = z.object({
  Analyses: z.array(
    z.object({
      Code: z.string(),
      Libelle: z.string(),
      Valeur: z.string(),
      Unite: z.string().optional(),
      Reference: z.string().optional(),
      Anormal: z.boolean().optional(),
    }),
  ),
})

export type CleanLab = {
  noReq: string
  date: string
  description?: string
  prescriber?: string
  reports: { id: string; date: string; status?: string }[]
  analyses: { code: string; label: string; value: string; unit?: string; reference?: string; abnormal?: boolean }[]
}
```

- [ ] **Step 4: Normalize**

```ts
import { type CleanLab, labResultsSchema, labRapportSchema, prelevementListSchema } from './schemas.js'
import { z } from 'zod'

const rapportsArraySchema = z.array(labRapportSchema)

export type LabsRaw = {
  list: unknown
  rapports: Record<string, unknown>
  results: Record<string, unknown>
}

export const normalizeLabs = (raw: LabsRaw): CleanLab[] => {
  const list = prelevementListSchema.parse(raw.list)

  return list.map((l) => {
    const reports = raw.rapports[l.NoReq] ? rapportsArraySchema.parse(raw.rapports[l.NoReq]) : []
    const resultsRaw = raw.results[l.NoReq]
    const results = resultsRaw ? labResultsSchema.parse(resultsRaw).Analyses : []

    return {
      noReq: l.NoReq,
      date: l.DateService?.slice(0, 10) ?? '',
      description: l.Description,
      prescriber:
        l.PrenomPrescripteur && l.NomPrescripteur ? `${l.PrenomPrescripteur} ${l.NomPrescripteur}` : undefined,
      reports: reports.map((r) => ({ id: r.IdRapport, date: r.DateRapport.slice(0, 10), status: r.Statut })),
      analyses: results.map((a) => ({
        code: a.Code,
        label: a.Libelle,
        value: a.Valeur,
        unit: a.Unite,
        reference: a.Reference,
        abnormal: a.Anormal,
      })),
    }
  })
}
```

- [ ] **Step 5: Markdown**

```ts
export const labsMarkdown = (labs: CleanLab[]): string => {
  if (labs.length === 0) {
    return '# Labs\n\n_No labs._\n'
  }

  const lines = ['# Labs', '']

  for (const l of [...labs].sort((x, y) => y.date.localeCompare(x.date))) {
    lines.push(`## ${l.date} — ${l.description ?? l.noReq}`)
    lines.push('')
    if (l.prescriber) {
      lines.push(`Prescriber: ${l.prescriber}`)
      lines.push('')
    }
    if (l.analyses.length > 0) {
      lines.push('| Test | Value | Reference | |')
      lines.push('|------|-------|-----------|--|')
      for (const a of l.analyses) {
        const flag = a.abnormal ? '⚠' : ''

        lines.push(`| ${a.label} | ${a.value} ${a.unit ?? ''} | ${a.reference ?? ''} | ${flag} |`)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 6: Test**

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeLabs } from '../src/normalize/labs.js'

describe('normalizeLabs', () => {
  it('joins list + rapports + results per NoReq', async () => {
    const list = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/list.json'), 'utf8'))
    const rapports = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/rapports.json'), 'utf8'))
    const results = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/results.json'), 'utf8'))
    const result = normalizeLabs({
      list,
      rapports: { '1234567890': rapports },
      results: { '1234567890': results },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.analyses).toHaveLength(2)
    expect(result[0]?.analyses[0]?.label).toBe('Hémoglobine')
    expect(result[0]?.reports[0]?.id).toBe('RPT0001')
  })
})
```

- [ ] **Step 7: Collector**

```ts
import { randomUUID } from 'node:crypto'

import { encodeLabId } from '../util/lab-id.js'
import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://ais-passerelle-autorisation-api.ramq.gouv.qc.ca/api/1'

export const labsCollector: Collector = {
  domain: 'labs',
  collect: async (ctx): Promise<DomainResult> => {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 7 }, (_, i) => currentYear - i)

    const listPerYear = await Promise.all(
      years.map((year) =>
        ctx.nav.fetchJson(
          `${BASE}/Prelevement/Citoyens/${ctx.citizenId}/Prelevements?DateDebut=${year}-01-01&DateFin=${year}-12-31`,
        ),
      ),
    )
    const list = listPerYear.flatMap((p) => (Array.isArray(p) ? p : []))

    const rapports: Record<string, unknown> = {}
    const results: Record<string, unknown> = {}

    for (const item of list as { NoReq: string; OIDSIL: string }[]) {
      const id = encodeLabId({ NoReq: item.NoReq, OIDSIL: item.OIDSIL, TypeRapp: 'LAB' })

      rapports[item.NoReq] = await ctx.nav.fetchJson(
        `${BASE}/Prelevement/Citoyens/${ctx.citizenId}/Prelevements/${id}/Rapports`,
      )
      results[item.NoReq] = await ctx.nav.fetchJson(
        `${BASE}/Prelevement/Citoyens/${ctx.citizenId}/Prelevements/${id}/ResultatsAnalyse?Tracking=${randomUUID()}`,
      )
    }

    return { domain: 'labs', raw: { list, rapports, results }, documents: [] }
  },
}
```

- [ ] **Step 8: Commit**

```bash
pnpm fix
pnpm check
pnpm test          # +2 = 23/23
git add -A
git commit -m "feat(collectors): labs list+reports+results chain"
```

---

## Task 9: Output layer — manifest + rename + writer + tests

Pure, network-free layer. Reads orchestrator output → writes `output/{data,markdown,documents}/` + `manifest.json`. Manifest enables skip-existing on re-runs.

**Files:**

- Create: `src/output/rename.ts`
- Create: `src/output/manifest.ts`
- Create: `src/output/writer.ts`
- Create: `tests/rename.test.ts`
- Create: `tests/manifest.test.ts`

- [ ] **Step 1: `src/output/rename.ts`** (deterministic PDF naming)

```ts
import { type DocumentDescriptor } from '../collectors/types.js'

// rules:
// - <type>/<DESCRIPTION_NORMALIZED>_<YYYY-MM-DD>.pdf
// - DESCRIPTION_NORMALIZED: uppercase, non-alphanumeric → "_", collapse repeats, trim
// - If two docs collide, append _<short-id> suffix

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const renameDocument = (d: DocumentDescriptor, taken: Set<string>): string => {
  const date = d.date ?? '0000-00-00'
  const base = `${d.type}/${slug(d.title)}_${date}`
  let name = `${base}.pdf`
  let i = 1

  while (taken.has(name)) {
    const suffix = d.id.slice(-6)

    name = `${base}_${suffix}.pdf`
    if (taken.has(name)) {
      i += 1
      name = `${base}_${suffix}-${i}.pdf`
    }
  }

  taken.add(name)

  return name
}
```

- [ ] **Step 2: Test**

```ts
import { describe, expect, it } from 'vitest'

import { renameDocument } from '../src/output/rename.js'

describe('renameDocument', () => {
  it('builds <type>/SLUG_DATE.pdf from descriptor', () => {
    const taken = new Set<string>()
    const out = renameDocument(
      { id: 'abc', url: 'x', title: 'Radiographie thorax', type: 'imagerie', date: '2024-06-15' },
      taken,
    )

    expect(out).toBe('imagerie/RADIOGRAPHIE_THORAX_2024-06-15.pdf')
    expect(taken.has(out)).toBe(true)
  })

  it('strips diacritics + collapses non-alphanum', () => {
    const out = renameDocument(
      { id: 'a', url: '', title: 'Échographie pré-natale', type: 'imagerie', date: '2024-01-01' },
      new Set(),
    )

    expect(out).toBe('imagerie/ECHOGRAPHIE_PRE_NATALE_2024-01-01.pdf')
  })

  it('disambiguates collisions by appending id suffix', () => {
    const taken = new Set<string>()
    const first = renameDocument({ id: 'AAAAAA111111', url: '', title: 'X', type: 't', date: '2024-01-01' }, taken)
    const second = renameDocument({ id: 'BBBBBB222222', url: '', title: 'X', type: 't', date: '2024-01-01' }, taken)

    expect(first).toBe('t/X_2024-01-01.pdf')
    expect(second).toBe('t/X_2024-01-01_222222.pdf')
  })
})
```

- [ ] **Step 3: `src/output/manifest.ts`**

```ts
import { type CleanProfile } from '../normalize/schemas.js'
import { fileExists, readJson, writeJson } from '../util/fs.js'

export type ManifestEntry = {
  id: string
  url: string
  outputPath: string
  sha256: string
  bytes: number
  capturedAt: string
}

export type Manifest = {
  generatedAt: string
  profile: CleanProfile | null
  domains: Record<string, { count: number; errors: string[] }>
  documents: ManifestEntry[]
}

export const emptyManifest = (): Manifest => ({
  generatedAt: new Date().toISOString(),
  profile: null,
  domains: {},
  documents: [],
})

export const loadManifest = async (path: string): Promise<Manifest> => {
  if (!(await fileExists(path))) {
    return emptyManifest()
  }

  return readJson<Manifest>(path)
}

export const saveManifest = async (path: string, m: Manifest): Promise<void> => {
  await writeJson(path, m)
}

export const docInManifest = (m: Manifest, id: string, sha256: string): ManifestEntry | undefined =>
  m.documents.find((e) => e.id === id && e.sha256 === sha256)
```

- [ ] **Step 4: Test**

```ts
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

import { docInManifest, emptyManifest, loadManifest, saveManifest } from '../src/output/manifest.ts'

const dir = resolve(tmpdir(), `carnet-test-${process.pid}`)

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('manifest', () => {
  it('round-trips through disk', async () => {
    await mkdir(dir, { recursive: true })
    const path = resolve(dir, 'manifest.json')
    const m = emptyManifest()

    m.documents.push({ id: 'd1', url: 'u', outputPath: 'p', sha256: 's1', bytes: 100, capturedAt: '2026-05-23' })
    await saveManifest(path, m)
    const reloaded = await loadManifest(path)

    expect(reloaded.documents).toHaveLength(1)
    expect(docInManifest(reloaded, 'd1', 's1')).toBeDefined()
    expect(docInManifest(reloaded, 'd1', 'different-sha')).toBeUndefined()
  })

  it('returns an empty manifest when the file does not exist', async () => {
    const m = await loadManifest(resolve(dir, 'missing.json'))

    expect(m.documents).toEqual([])
  })
})
```

- [ ] **Step 5: `src/output/writer.ts`** (assembly)

```ts
import { copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type DocumentDescriptor } from '../collectors/types.js'
import {
  appointmentsMarkdown,
  imagingMarkdown,
  labsMarkdown,
  medicalServicesMarkdown,
  medicationsMarkdown,
  profileMarkdown,
} from '../normalize/markdown.js'
import { normalizeAppointments } from '../normalize/appointments.js'
import { normalizeImaging } from '../normalize/imaging.js'
import { normalizeLabs } from '../normalize/labs.js'
import { normalizeMedicalServices } from '../normalize/medical-services.js'
import { normalizeMedications } from '../normalize/medications.js'
import { normalizeProfile, type ProfileRaw } from '../normalize/profile.js'
import { ensureDir, sha256, writeJson, writeText } from '../util/fs.js'
import { type Manifest, type ManifestEntry, saveManifest } from './manifest.js'
import { renameDocument } from './rename.js'

export type OrchestratorOutput = {
  profile: ProfileRaw
  medications: unknown
  appointments: unknown
  medicalServices: unknown
  imaging: { list: unknown; details: Record<string, unknown> }
  labs: { list: unknown; rapports: Record<string, unknown>; results: Record<string, unknown> }
  documents: { descriptor: DocumentDescriptor; localPath: string }[]
}

export const writeOutput = async (raw: OrchestratorOutput, outputDir: string): Promise<Manifest> => {
  const dataDir = resolve(outputDir, 'data')
  const mdDir = resolve(outputDir, 'markdown')
  const docsDir = resolve(outputDir, 'documents')

  await Promise.all([ensureDir(dataDir), ensureDir(mdDir), ensureDir(docsDir)])

  const profile = normalizeProfile(raw.profile)
  const meds = normalizeMedications(raw.medications)
  const appts = normalizeAppointments(raw.appointments)
  const services = normalizeMedicalServices(raw.medicalServices)
  const imaging = normalizeImaging(raw.imaging.list, raw.imaging.details)
  const labs = normalizeLabs(raw.labs)

  await Promise.all([
    writeJson(resolve(dataDir, 'profile.json'), profile),
    writeJson(resolve(dataDir, 'medications.json'), meds),
    writeJson(resolve(dataDir, 'appointments.json'), appts),
    writeJson(resolve(dataDir, 'medical-services.json'), services),
    writeJson(resolve(dataDir, 'imaging.json'), imaging),
    writeJson(resolve(dataDir, 'labs.json'), labs),
  ])

  await Promise.all([
    writeText(resolve(mdDir, 'profile.md'), profileMarkdown(profile)),
    writeText(resolve(mdDir, 'medications.md'), medicationsMarkdown(meds)),
    writeText(resolve(mdDir, 'appointments.md'), appointmentsMarkdown(appts)),
    writeText(resolve(mdDir, 'medical-services.md'), medicalServicesMarkdown(services)),
    writeText(resolve(mdDir, 'imaging.md'), imagingMarkdown(imaging)),
    writeText(resolve(mdDir, 'labs.md'), labsMarkdown(labs)),
  ])

  // PDFs: rename + copy from raw runDir to output/documents
  const taken = new Set<string>()
  const entries: ManifestEntry[] = []

  for (const d of raw.documents) {
    const outputPath = renameDocument(d.descriptor, taken)
    const dest = resolve(docsDir, outputPath)

    await ensureDir(resolve(dest, '..'))
    await copyFile(d.localPath, dest)
    const buf = await readFile(dest)

    entries.push({
      id: d.descriptor.id,
      url: d.descriptor.url,
      outputPath: `documents/${outputPath}`,
      sha256: sha256(buf),
      bytes: buf.length,
      capturedAt: d.descriptor.date ?? '',
    })
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    profile,
    domains: {
      medications: { count: meds.length, errors: [] },
      appointments: { count: appts.length, errors: [] },
      'medical-services': { count: services.length, errors: [] },
      imaging: { count: imaging.length, errors: [] },
      labs: { count: labs.length, errors: [] },
    },
    documents: entries,
  }

  await saveManifest(resolve(outputDir, 'manifest.json'), manifest)

  return manifest
}
```

- [ ] **Step 6: Commit**

```bash
pnpm fix
pnpm check
pnpm test          # +5 = 28/28
git add -A
git commit -m "feat(output): writer + rename + manifest + tests"
```

---

## Task 10: `summary.md` rollup + tests

Top-level rollup file across all domains. Reads the clean records + manifest, writes one human-readable document.

**Files:**

- Create: `src/output/summary.ts`
- Create: `tests/summary.test.ts`

- [ ] **Step 1: Summary generator**

```ts
import { type Manifest } from './manifest.js'

export const summaryMarkdown = (m: Manifest): string => {
  const lines = ['# Health record summary', '']

  if (m.profile) {
    lines.push(
      `Generated for **${m.profile.fullName}** (citizen ${m.profile.citizenId}) on ${m.generatedAt.slice(0, 10)}.`,
    )
    lines.push('')
  }
  lines.push('## Counts')
  lines.push('')
  for (const [domain, info] of Object.entries(m.domains)) {
    lines.push(`- **${domain}:** ${info.count}${info.errors.length > 0 ? ` (${info.errors.length} errors)` : ''}`)
  }
  lines.push('')
  lines.push('## Documents')
  lines.push('')
  lines.push(`${m.documents.length} PDF(s) downloaded.`)
  if (m.documents.length > 0) {
    lines.push('')
    for (const d of m.documents.slice(0, 20)) {
      lines.push(`- \`${d.outputPath}\` (${d.bytes.toLocaleString()} bytes)`)
    }
    if (m.documents.length > 20) {
      lines.push(`- … and ${m.documents.length - 20} more`)
    }
  }

  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 2: Test**

```ts
import { describe, expect, it } from 'vitest'

import { emptyManifest } from '../src/output/manifest.js'
import { summaryMarkdown } from '../src/output/summary.js'

describe('summaryMarkdown', () => {
  it('renders counts + docs from a manifest', () => {
    const m = emptyManifest()

    m.profile = {
      citizenId: '99999',
      fullName: 'JANE DOE',
      birthDate: '1980-01-01',
      sex: 'Femme',
    }
    m.domains = {
      medications: { count: 5, errors: [] },
      labs: { count: 3, errors: ['one failed'] },
    }
    m.documents = [
      {
        id: '1',
        url: 'u',
        outputPath: 'documents/imagerie/A_2024.pdf',
        sha256: 's',
        bytes: 12345,
        capturedAt: '2024-01-01',
      },
    ]
    const out = summaryMarkdown(m)

    expect(out).toContain('JANE DOE')
    expect(out).toContain('**medications:** 5')
    expect(out).toContain('**labs:** 3 (1 errors)')
    expect(out).toContain('1 PDF(s) downloaded')
    expect(out).toContain('documents/imagerie/A_2024.pdf')
  })
})
```

- [ ] **Step 3: Wire into `src/output/writer.ts`**

At the end of `writeOutput`, after `saveManifest`:

```ts
await writeText(resolve(outputDir, 'summary.md'), summaryMarkdown(manifest))
```

(Add the import: `import { summaryMarkdown } from './summary.js'`.)

- [ ] **Step 4: Commit**

```bash
pnpm fix
pnpm check
pnpm test          # +1 = 29/29
git add -A
git commit -m "feat(output): summary.md rollup + writer wiring"
```

---

## Task 11: Orchestrator + extract-mode wiring

Glue layer. Runs the collectors in order, downloads PDFs, calls `writeOutput`, reports progress over IPC.

**Files:**

- Create: `src/main/orchestrator.ts`
- Modify: `src/main/index.ts` (real extractStart/Stop handlers)
- Modify: `src/collectors/index.ts` (registry)

- [ ] **Step 1: Collectors registry**

`src/collectors/index.ts`:

```ts
import { appointmentsCollector } from './appointments.js'
import { imagingCollector } from './imaging.js'
import { labsCollector } from './labs.js'
import { medicalServicesCollector } from './medical-services.js'
import { medicationsCollector } from './medications.js'
import { profileCollector } from './profile.js'
import { type Collector } from './types.js'

export const collectors: Collector[] = [
  profileCollector,
  medicationsCollector,
  appointmentsCollector,
  medicalServicesCollector,
  imagingCollector,
  labsCollector,
]
```

- [ ] **Step 2: Orchestrator**

`src/main/orchestrator.ts`:

```ts
import { net, type Session, type WebContents } from 'electron'
import { resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { type Domain } from '../config.js'
import { emptyStore } from '../capture/store.js'
import { writeOutput, type OrchestratorOutput } from '../output/writer.js'
import { ensureDir, sha256, writeBuffer } from '../util/fs.js'
import { createNavigator } from './navigator.js'

export type ProgressCallback = (event: {
  phase: 'running' | 'normalizing' | 'writing' | 'done' | 'error'
  currentDomain?: string
  domainsDone: number
  domainsTotal: number
  error?: string
}) => void

export const runExtraction = async (
  webContents: WebContents,
  session: Session,
  outputDir: string,
  rawDir: string,
  citizenIdFetcher: () => Promise<string>,
  onProgress: ProgressCallback,
): Promise<void> => {
  const nav = createNavigator(webContents, session)
  const capture = emptyStore()
  const citizenId = await citizenIdFetcher()
  const ctx = { nav, capture, citizenId }

  const total = collectors.length
  const collected: Record<Domain, unknown> = {} as Record<Domain, unknown>
  const allDocs = []

  for (const [i, c] of collectors.entries()) {
    onProgress({ phase: 'running', currentDomain: c.domain, domainsDone: i, domainsTotal: total })
    try {
      const result = await c.collect(ctx)

      collected[result.domain] = result.raw
      allDocs.push(...result.documents)
    } catch (err) {
      onProgress({
        phase: 'error',
        error: `${c.domain}: ${(err as Error).message}`,
        domainsDone: i,
        domainsTotal: total,
      })
      throw err
    }
  }

  // Download flagged PDFs into the run's rawDir/documents (Phase 1 downloader already exists).
  onProgress({ phase: 'normalizing', domainsDone: total, domainsTotal: total })
  await ensureDir(resolve(rawDir, 'documents'))
  const localDocs: { descriptor: (typeof allDocs)[number]; localPath: string }[] = []

  for (const d of allDocs) {
    const r = await net.fetch(d.url, { session, useSessionCookies: true } as never)
    const buf = Buffer.from(await r.arrayBuffer())
    const localPath = resolve(rawDir, 'documents', `${d.id}.pdf`)

    await writeBuffer(localPath, buf)
    void sha256(buf)
    localDocs.push({ descriptor: d, localPath })
  }

  onProgress({ phase: 'writing', domainsDone: total, domainsTotal: total })
  await writeOutput(
    {
      profile: collected.profile as never,
      medications: collected.medications,
      appointments: collected.appointments,
      medicalServices: collected['medical-services'],
      imaging: collected.imaging as never,
      labs: collected.labs as never,
      documents: localDocs,
    },
    outputDir,
  )

  onProgress({ phase: 'done', domainsDone: total, domainsTotal: total })
}
```

- [ ] **Step 3: Wire extract handlers in `src/main/index.ts`**

Replace the no-op extract handlers from Task 2 with real ones:

```ts
ipcMain.handle(IPC.extractStart, async () => {
  if (!win) {
    return
  }

  const sess = session.fromPartition(config.partitionName)
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const runRawDir = resolve(config.rawDir, runId)

  try {
    await runExtraction(
      win.site.webContents,
      sess,
      config.outputDir,
      runRawDir,
      async () => {
        const r = await net.fetch('https://www.carnetsante.gouv.qc.ca/api/1/Citoyens', {
          session: sess,
          useSessionCookies: true,
        } as never)
        const json = (await r.json()) as { IdCitoyen: string }

        return json.IdCitoyen
      },
      (e) =>
        send(IPC.extractProgress, {
          phase: e.phase,
          currentDomain: e.currentDomain,
          domainsDone: e.domainsDone,
          domainsTotal: e.domainsTotal,
          rawBytes: 0,
          downloads: 0,
          error: e.error,
        } satisfies ExtractProgressPayload),
    )
  } catch (err) {
    send(IPC.extractProgress, {
      phase: 'error',
      domainsDone: 0,
      domainsTotal: collectors.length,
      rawBytes: 0,
      downloads: 0,
      error: (err as Error).message,
    } satisfies ExtractProgressPayload)
  }
})

ipcMain.handle(IPC.extractStop, () => {
  // Phase 3a: no cancellation support; extract runs to completion. Phase 3b can add an AbortController.
})
```

Add imports:

```ts
import { net } from 'electron'
import { collectors } from '../collectors/index.js'
import { runExtraction } from './orchestrator.js'
import { type ExtractProgressPayload } from '../shared/ipc.js'
```

- [ ] **Step 4: Gates + manual smoke**

```bash
pnpm fix
pnpm check
pnpm test          # 29/29 still passes (orchestrator isn't unit-tested — exercised live)
pnpm build
```

Yann manually verifies: launch app → log in → click **Extract everything** → status cycles through `running → normalizing → writing → done`. Output appears at `~/carnet-sante-extract/output/{data,markdown,documents}/` + `manifest.json` + `summary.md`.

The first live run will surface schema mismatches (best-guess shapes for appointments / medical-services / labs / imaging-detail). Each is a focused zod parse error → adjust the relevant schema, re-run.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(main): orchestrator + extract-mode handlers"
```

---

## Task 12: Update docs (CLAUDE.md + README + design spec)

**Files:**

- Modify: `CLAUDE.md` (architecture, build status, commands)
- Modify: `README.md` (extract mode + output structure)
- Modify: `docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md` (move Phase 3 from "future" to "implemented", note the Phase 1 patches)

- [ ] **Step 1: Update `CLAUDE.md`**

In the architecture section, expand layer 3 to mention the per-domain collectors + normalizers:

```
3. **`src/collectors/` + `src/normalize/` + `src/output/`** — pure, network-free layer. Collectors (profile, medications, appointments, medical-services, imaging, labs) each navigate to their endpoints via the typed Navigator and return raw JSON + PDF descriptors. Normalize maps raw → zod-validated clean records. Output writes `data/*.json`, per-domain `markdown/*.md`, organized/renamed `documents/`, `manifest.json`, and `summary.md`.
```

Update Build status section to mark Phase 3 done:

```
- [x] **Phase 1** — Electron capture app (with OneDrive + per-run-clobber patches from Phase 3 Task 1).
- [x] **Phase 2** — live recon completed; endpoint surface mapped in `docs/superpowers/notes/2026-05-23-phase2-endpoint-map.md`.
- [x] **Phase 3** — collectors + normalize + markdown + manifest + summary. Extract button in the toolbar runs the full pipeline.
- [ ] **Phase 4 (optional)** — vaccines via Carnet de vaccination (separate portal, separate recon).
```

- [ ] **Step 2: Update `README.md`**

Replace the "Run it (development)" section with:

```
## Run it (development)

\`\`\`bash
pnpm install
pnpm dev        # launches the app — log in, then either:
                #   Start capture → walk sections → Stop & save  (raw dump for debugging)
                #   Extract everything                           (full pipeline → clean output)
\`\`\`

## Output

Written to `~/carnet-sante-extract/`:

\`\`\`
raw/<ISO-timestamp>/   # one folder per capture/extract run
  responses/   captured JSON
  documents/   downloaded PDFs (Phase 1 raw names)

output/
  data/        clean structured JSON (one file per domain)
  markdown/    per-domain markdown rollups + summary.md
  documents/   renamed PDFs organized by type
  manifest.json
  summary.md   top-level health record summary
\`\`\`
```

- [ ] **Step 3: Update design spec**

In `docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md`, update:

- The "Build sequence" → mark Phase 1/2/3 status.
- The "Output structure" → reflect actual layout (raw/<timestamp>/ subfolders).
- The "Resilience & privacy" → mention the home-directory fallback for OneDrive avoidance.
- Add a paragraph: "Vaccines are out of scope for this app; the Quebec vaccine portal is separate and would be a Phase 4 recon."

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/
git commit -m "docs: Phase 3 platform — README + CLAUDE.md + spec updates"
```

---

## Done — Phase 3 complete

Pipeline is end-to-end: launch the app, log in once, click **Extract everything**, and `~/carnet-sante-extract/output/` fills with clean data + organized PDFs + a top-level summary. Schema mismatches discovered on the first live run get fixed by adjusting the relevant zod schema and re-running (`raw/<timestamp>/` is preserved so the next attempt doesn't re-hit the gov server unless the user wants to).
