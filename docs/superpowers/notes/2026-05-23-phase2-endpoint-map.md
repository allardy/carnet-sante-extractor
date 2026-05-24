# carnet-sante-extractor — Phase 2 endpoint map

**Capture date:** 2026-05-23
**Capture size:** 66 JSON responses + 2 PDFs (one section walked per data type, not exhaustive)
**Source dump:** `raw/responses/index.json` + per-response `NNNN-*.json` files (gitignored — stays on machine)

Derived from the metadata in `index.json` (URL / status / method / content-type only — response bodies were not read for this map). URLs use `{citizenId}` for the per-user path parameter that appeared throughout the capture.

---

## Privacy heads-up — Phase 1 platform bug

Phase 1 wrote the capture to `app.getPath('documents')`. On Windows when OneDrive is configured to back up Documents (default for many users), this resolves to `%USERPROFILE%\OneDrive\Documents\carnet-sante-extract\`. **Real captured health data is then auto-syncing to OneDrive.** The design spec explicitly says "everything stays on your machine and never leaves it" — OneDrive sync breaks that.

**Phase 1 patch options:**

1. Use `app.getPath('userData')` (Electron's per-app folder under `%APPDATA%\<productName>`). Hidden from the user but never OneDrive-redirected.
2. Use a per-app folder under `%LOCALAPPDATA%` (e.g. `%LOCALAPPDATA%\carnet-sante-extract\`). Hidden from the user but never OneDrive-redirected by Microsoft policy.
3. Detect OneDrive redirection on startup (`app.getPath('documents')` vs `os.homedir() + '\Documents'`) and warn the user before any data is written.

Recommend option (2) plus a quick "Open output" path adjustment so the user can still find the dump from the toolbar.

---

## Hosts

| Host                                                                                 | Role                                                |
| ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `www.carnetsante.gouv.qc.ca`                                                         | Primary citizen API (`/api/1/Citoyens/{id}/...`)    |
| `ais-passerelle-autorisation-api.ramq.gouv.qc.ca`                                    | RAMQ data gateway (labs / banking / refunds)        |
| `ais-acces-renseignements-sante-api.ramq.gouv.qc.ca`                                 | RAMQ fused-health-records API                       |
| `ais-prelevement-ui.ramq.gouv.qc.ca` and 3 sibling `*-ui.ramq.gouv.qc.ca` subdomains | UI config endpoints (`/config/config.json`) — noise |

Single cookie partition (`persist:carnet`) carries authentication for every host above. No `/login` or `/token` endpoints appeared in the capture — login happened before Start capture, and subsequent requests are cookie-authenticated. RAMQ SSO transparently extends the carnetsante session to `*.ramq.gouv.qc.ca` (probably via a `.gouv.qc.ca`-domain cookie).

---

## Per-domain endpoint surface

### Profile / citizen — `www.carnetsante.gouv.qc.ca`

- `GET /api/1/Citoyens` — returns the connected user; **bootstrap call to learn `{citizenId}`**
- `GET /api/1/Citoyens/{citizenId}/CarteAssuranceMaladie`
- `GET /api/1/Citoyens/{citizenId}/Coordonnees`
- `GET /api/1/Citoyens/{citizenId}/DonneesContact/TelephoneMobile`
- `GET /api/1/Citoyens/{citizenId}/SituationMedecinFamille`

### Appointments

- `GET /api/1/Citoyens/{citizenId}/RendezVous?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}`

### Medications

- `GET /api/1/Citoyens/{citizenId}/Medications/{medicationId}` — detail per drug. Medication IDs are short alphanumeric tokens.
- ❓ **No list endpoint captured.** Three detail calls only — the list URL was not in this capture window. Likely either `GET /api/1/Citoyens/{citizenId}/Medications` (no path suffix) or the meds list comes embedded in `AccesRenseignementsSanteFusionnes` (see below).

### Imaging (ExamenImagerie)

- `GET /api/1/Citoyens/{citizenId}/ExamenImagerie/{examId}/DetailRapport` — exam detail
- `GET /api/1/Citoyens/{citizenId}/ExamenImagerie/{examId}/DetailRapport/{reportId}/Rapport` — **PDF binary** (this is the download URL)
- ❓ **No list endpoint captured.** Same situation as medications.

`{examId}` is an OID-style dotted path (e.g. `2.16.840.1.113883.3.234.1.3.101.1.2.<...>`). `{reportId}` is a numeric+OID composite.

### Labs (Prelevement) — RAMQ gateway

Hosted on `ais-passerelle-autorisation-api.ramq.gouv.qc.ca`, NOT carnetsante.

- `GET /api/1/Prelevement/Citoyens/{citizenId}/PrelevementsAccessibles` — feature gate
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements?DateDebut={YYYY-MM-DD}&DateFin={YYYY-MM-DD}` — date-range list. The UI calls this per year (the capture shows 2024-01..12, 2025-01..12, 2026-01..05).
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements/{base64LabId}/Rapports` — report metadata for a single lab
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements/{base64LabId}/ResultatsAnalyse?Tracking={uuid}` — structured analysis values
- `GET /api/1/Prelevement/Citoyens/{citizenId}/BilanPersonnalise/AnalysesBilanPersonnalise` — personalized dashboard
- `GET /api/1/Prelevement/FonctionnaliteApplicationIsolee/VerifierDisponibilite` — feature availability

`{base64LabId}` structure — URL-safe base64 of a JSON triple:

```js
base64Url(JSON.stringify({ NoReq: '<request-number>', OIDSIL: '<lab-system-oid>', TypeRapp: 'LAB' }))
```

`Tracking` is a UUID generated by the UI per-fetch (not auth — a request-correlation id). Phase 3 can generate fresh ones.

**No lab PDFs captured.** Lab results render client-side from the `ResultatsAnalyse` JSON; there is no PDF view for labs in this portal.

### Medical services (ServicesMedicauxAssures)

- `GET /api/1/Citoyens/{citizenId}/ServicesMedicauxAssures?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}` — covered medical services (visits / billing-side records)

### Fused health records (AccesRenseignementsSante)

- `GET /api/1/AccesRenseignementsSanteFusionnes/{citizenId}?IdCitoyenConnecte={citizenId}&DateDebut={YYYY-MM-DD}&DateFin={YYYY-MM-DD}`

Hosted on `ais-acces-renseignements-sante-api.ramq.gouv.qc.ca`. **Likely the umbrella "your dossier" endpoint** that lists imaging exams, hospital records, and possibly meds in one payload — but the body wasn't read for this map. Worth reading before drafting individual collectors; it may replace several per-domain list calls.

### Banking / reimbursement — out of scope

- `/api/1/CoordonneesBancaires/...`
- `/api/1/RecevoirDemande/...`
- `/api/1/EtatDemandeRemboursement/...`

Not health data; Phase 3 should skip.

### System / config — noise

- `Interruption/Domaines` — system status
- `ApplicationIsolee/Configuration` (called repeatedly throughout the session)
- `*-ui.ramq.gouv.qc.ca/config/config.json` — 4 sibling subdomains for separate sub-features
- `*/FonctionnaliteApplicationIsolee/VerifierDisponibilite` — feature availability checks
- `*Accessibles` (CoordonneesBancairesAccessibles, RecevoirDemandeAccessible, EtatDemandeRemboursementAccessible)

---

## Patterns

1. **Citizen ID** is a path parameter on every per-user endpoint. Discovered via `GET /api/1/Citoyens`.
2. **Date ranges** are explicit + inclusive: `?DateDebut=YYYY-MM-DD&DateFin=YYYY-MM-DD`. Some endpoints use `YYYY-M-D` (no zero-pad) — collectors should match the originating format.
3. **Cross-host auth** is implicit via the shared cookie partition; no token relay needed.
4. **No login endpoints in this capture** — login is out-of-band (user does it before Start capture).
5. **PDF download** is direct: GET the URL with the partition cookies; content-type `application/pdf`. Phase 1's downloader handles this correctly.
6. **List → detail → PDF** is the pattern for imaging and labs. Medications has only detail captured — list endpoint TBD.

---

## Capture coverage

| Domain               | Captured?      | Gap                                                                            |
| -------------------- | -------------- | ------------------------------------------------------------------------------ |
| Profile (citoyen)    | ✅ 5 endpoints | —                                                                              |
| Appointments         | ✅             | —                                                                              |
| Medications          | ✅ partial     | List endpoint missing (3 details only)                                         |
| Imaging              | ✅ partial     | List endpoint missing (2 details + 2 PDFs)                                     |
| Labs                 | ✅ full chain  | —                                                                              |
| Medical services     | ✅             | —                                                                              |
| Fused health records | ✅             | Body shape not yet read                                                        |
| Vaccines             | ❌             | Not captured — likely a separate portal (Carnet de vaccination via Clic Santé) |

---

## Phase 3 implications

1. **Two collector hosts** (carnetsante + ais-passerelle). Per-collector base URL config; the kit's `Authentik` client pattern (one base URL → many endpoints) doesn't apply here.
2. **Bootstrap step:** `GET /api/1/Citoyens` to learn `{citizenId}` before any per-user call.
3. **List → detail → PDF pattern** for imaging and labs. Medications has only detail captured — needs either a second recon pass or schema inspection of `AccesRenseignementsSanteFusionnes` (which may contain the list).
4. **`AccesRenseignementsSanteFusionnes` is likely the umbrella endpoint** that lists multiple domains. Reading its body first may simplify the collectors registry into one fan-out call.
5. **Vaccines** is out of scope for this portal; either Phase 4 (a separate Clic Santé recon) or scope-out.
6. **Lab base64 IDs** need a small helper to construct (`base64Url(JSON.stringify({NoReq, OIDSIL, TypeRapp}))`).
7. **`Tracking` UUIDs** can be generated per-call (`crypto.randomUUID()`).

---

## Open questions

- Does `AccesRenseignementsSanteFusionnes` actually list everything, or just a subset? (Read body to confirm.)
- Where does the medication list come from? (Either a missing endpoint or embedded in fusionnes.)
- Where does the imaging exam list come from? (Same as above.)
- Are there any pagination headers / response fields we need to honor on list endpoints? (Body shapes not read yet.)
- For labs: is the `Tracking` param actually optional, or does the server require it for correlation?

Reading the response bodies of `Citoyens` (small, no PHI risk), `AccesRenseignementsSanteFusionnes` (umbrella — high signal), and one of each detail type would answer most of these. **Not done in this notes pass** — requires Yann's say-so since they contain real values.

---

## Update — second recon pass (2026-05-23, ~16:36)

A second `Start capture` → walk-more-sections → `Stop & save` cycle added the previously-missing endpoints and exposed two Phase 1 platform bugs.

### Phase 1 bugs surfaced

1. **OneDrive sync** — confirmed: `app.getPath('documents')` on this machine resolves to `%USERPROFILE%\OneDrive\Documents`, so the entire `raw/` tree is syncing to OneDrive cloud. Patch needed before any more real recon: switch to `%LOCALAPPDATA%\carnet-sante-extract\` (Windows-policy local-only) or `app.getPath('userData')`.
2. **Re-run clobbers** — each new `Start capture` resets the file-numbering counter to `0001` and overwrites prior files when slugs collide. The `index.json` is rewritten entirely on Stop, so the cross-session view is lost. Patch: each run should write into `raw/<ISO-timestamp>/responses/` so multiple sessions accumulate side-by-side without conflict.

### New endpoints (carnetsante.gouv.qc.ca)

- `GET /api/1/Citoyens/{citizenId}/Medications?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}` — **medications LIST** (the missing endpoint from the first pass). Returns a flat array of `OrdonnanceAvecService` records.
- `GET /api/1/Citoyens/{citizenId}/ExamensImagerie?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}` — **imaging LIST** (note plural `Examens` vs detail's singular `Examen`). Returns a flat array.
- `GET /api/1/Citoyens/PersonnesACharge` — dependents under guardianship (returns `null` when none)
- `GET /api/1/Citoyens/{citizenId}/DonneesContact/Courriel` — email
- `GET /api/1/Citoyens/{citizenId}/Photo` — profile photo (probably base64-in-JSON; not read)
- `GET /api/1/Citoyens/PreferencesUtilisateur` — UI preferences
- `GET /api/1/Citoyens/NouveautesAAfficher` — announcements/news (not health data)
- `GET /api/1/Citoyens/{citizenId}/ServicesMedicauxAssures/DernierService` — most-recent covered service (small payload)

### Response shape sketches

(Field names + types only. Specific values are PHI and stay in `raw/`.)

**`/api/1/Citoyens`** (connected user — small, ~10 fields):

```
{ IndAdmissibiliteCarnetSante: bool, PersonnesACharge: null|array, IdCitoyen: string,
  Nom: string, Prenom: string, Sexe: string, DateNaissance: ISO,
  CarteAssuranceMaladie: null, FonctionnalitesActives: null, EstAgeEntre14Et17Ans: bool }
```

**`/api/1/Citoyens/{id}/Medications?Dates` — array of:**

```
{ Type: 'OrdonnanceAvecService' | other,
  Id, IdOrdonnance: string,                       // medication-prescription IDs (same value duplicated)
  Date: ISO, Duree: number,                       // prescription start + total days
  NomPrescripteur, PrenomPrescripteur,
  Pharmacie: string,
  NombreDelivrancesAutorisees, NombreDelivrancesRestantes: number,
  MedicamentPrescrit: {
    DIN: string,                                  // Health Canada drug identifier (8 digits)
    Nom, NomAnglais: string,                      // brand+dose+form, e.g. "DRUG 40MG CAPSULE"
    LibelleClasse, LibelleClasseAnglais: string,  // therapeutic class
    Posologies: [{ Description: string, DIN: null, Nom: null, NomAnglais: null }]
  },
  DernierService: {
    Id: string, Date: ISO, Duree: number,
    NomPharmacie: string,
    Medicaments: { ...same shape as MedicamentPrescrit }  // dup of prescribed drug
  },
  Services: null | array                          // dispense history (probably; not seen populated)
}
```

Medications list is **rich enough that Phase 3 can normalize directly from it** without the per-drug detail call. The detail endpoint (`/Medications/{id}`) is probably for showing extended history when the user clicks a row — investigate later if needed.

**`/api/1/Citoyens/{id}/ExamensImagerie?Dates` — array of:**

```
{ IdCitoyen: null,                                // server doesn't echo
  NumeroExamen: string,                           // OID-style dotted path — this is the {examId} for /DetailRapport
  DateExamen: ISO,
  DescriptionExamen: string,                      // exam name (FR)
  NomPrescripteur, PrenomPrescripteur,
  RapportsImagerie: null,                         // not populated in list — needs /DetailRapport call
  DateDisponibiliteRapport: null | ISO
}
```

Imaging needs **list → detail → PDF**:

1. List returns N exams with `NumeroExamen`.
2. `GET /ExamenImagerie/{NumeroExamen}/DetailRapport` returns report metadata (including the `{reportId}` for the PDF URL).
3. `GET /ExamenImagerie/{NumeroExamen}/DetailRapport/{reportId}/Rapport` is the PDF binary.

The composite `{reportId}` looks like `10616420602{NumeroExamen-without-dots}0` — possibly derivable from `NumeroExamen` without the detail call. Worth confirming once with a detail body read; if derivable, the detail call may be skippable for the bulk pull.

**`/Prelevement/.../Prelevements?Dates`:** confirmed empty for the rolling year — the user's labs are in older year ranges. Shape still TBD; read one non-empty year (e.g. 2024-01..12) to learn it.

**`/api/1/Citoyens/{id}/RendezVous?Dates`:** confirmed empty for 2026 — read the wider range (2019-..-2025) to learn shape.

### Capture coverage — updated

| Domain               | Captured?                   | Status                                                          |
| -------------------- | --------------------------- | --------------------------------------------------------------- |
| Profile / citoyen    | ✅                          | 8 endpoints across two captures                                 |
| Appointments         | ✅ list endpoint            | Shape needs read of non-empty range                             |
| Medications          | ✅ list + detail            | List is rich enough to skip detail in Phase 3                   |
| Imaging              | ✅ list + detail + PDF      | Full chain captured                                             |
| Labs                 | ✅ list + reports + results | Empty in current year; shape from 2024 range                    |
| Medical services     | ✅                          | List + DernierService captured                                  |
| Fused health records | ✅ first run only           | Lost from `index.json` on second-run overwrite (Phase 1 bug #2) |
| Vaccines             | ❌                          | Different portal (not in scope for this app)                    |

### Ready for Phase 3

The endpoint map is complete enough to draft the Phase 3 plan. Phase 3 needs:

1. **Phase 1 patches first** — fix OneDrive output path + per-run timestamped folders. Without these, Phase 3 collectors can't be tested cleanly.
2. **Bootstrap collector** — `GET /api/1/Citoyens` to learn `{citizenId}`.
3. **Per-domain collectors** — labs (chained list → reports → results), imaging (list → detail → PDF), medications (just list), appointments (list per year window), services-medicaux (list), profile (5-6 small calls).
4. **Normalize layer** — zod schemas per domain (field names already mapped above), clean record types.
5. **Markdown layer** — per-domain rollup files + top-level `summary.md`.
6. **Output layer** — deterministic PDF rename (`<type>/EXAM-DESCRIPTION_YYYY-MM-DD.pdf`), `manifest.json` with checksums + counts.

Vaccines stays out of scope. If Yann wants vaccine data later, that's a separate Phase 4 against the Carnet de vaccination portal.

---

## Update — Phase 3 live-run discoveries

These shapes were guessed at Phase 3 plan time (since Phase 2 only captured URLs/metadata, not full bodies). Recording the real shapes here so future plan iterations don't re-guess.

### Authentication: Bearer JWT (not cookies alone)

The SPA is **Angular** + **oidc-client-js**. After ClicSEQUR login the SPA holds a short-lived (~1h) Bearer JWT in `sessionStorage` under:

```
oidc.user:https://fedapp.ramq.gouv.qc.ca/adfs:http://ais-citoyen-prod
```

The value is a JSON object containing `access_token`. An Angular `HttpInterceptor` attaches that JWT to every `/api/1/*` request. **Plain `fetch()`, `executeJavaScript("fetch(...)")` from devtools console, and `session.fetch()` ALL bypass the interceptor → 403 even with valid partition cookies.** Our `auth.ts` captures the Bearer via `session.webRequest.onBeforeSendHeaders` for refresh + seeds from sessionStorage for immediate bootstrap.

### Per-endpoint date range caps (server 500s on wider)

- Imaging `/ExamensImagerie?Dates` — ≤ 6 years
- Medications `/Medications?Dates` — 2-year default (wider may work, unverified)
- Medical services `/ServicesMedicauxAssures?Dates` — 7 years
- Labs / Appointments — server expects per-year queries; sweep yearly

### Real response shapes (camelCase vs PascalCase mix)

- **Connected user** (PascalCase): `IdCitoyen`, `Nom`, `Prenom`, `Sexe`, `DateNaissance`, `IndAdmissibiliteCarnetSante`, `EstAgeEntre14Et17Ans`, `PersonnesACharge`. Per-citizen `/api/1/Citoyens/{id}` does NOT exist; only sub-resources do.
- **Medications** (PascalCase): `IdOrdonnance`/`Id`, `Date`, `Duree`, `NomPrescripteur`, `PrenomPrescripteur`, `Pharmacie`, `MedicamentPrescrit{DIN,Nom,LibelleClasse,Posologies[{Description}]}`, `DernierService{Id,Date,Duree,NomPharmacie,Medicaments}`, `NombreDelivrancesAutorisees`, `NombreDelivrancesRestantes` (**both can be `null`** for compounded meds).
- **Medical services** (PascalCase): NO `Id` field. Fields: `NomProfessionnel`, `PrenomProfessionnel`, `MontantPayeRAMQ`, `DateService`, `DescriptionService`/`DescriptionServiceAnglais`, `PrecisionService`/`PrecisionServiceAnglais`, `LieuPhysique{Nom,Adresse,CodePostal}`, `LieuGeographique`. Synthesize id from `${date}-${idx}`.
- **Imaging list** (PascalCase): `NumeroExamen`, `DateExamen`, `DescriptionExamen`, `NomPrescripteur`, `PrenomPrescripteur`, `RapportsImagerie` (always null in list), `DateDisponibiliteRapport`.
- **Imaging DetailRapport** (PascalCase): **direct array** at root, no wrapping object. Each item: `{IdRapport, DateRapport, Statut, NumeroExamen (null), DateDisponibiliteRapport}`.
- **Imaging PDF URL**: `…/ExamenImagerie/{examId}/DetailRapport/{reportId}/Rapport` returns `application/pdf`. The reportId follows the empirical pattern `1061642060${examId}0` (confirmed across 3+ exams).
- **Labs list** (camelCase): `id` (opaque, ready for use in URLs — no client-side encoding needed), `trackingId` (maps to `?Tracking=`), `datePrelevement`, `dateEnvoiPrescripteur`, `statutRapport`, `nomPrescripteur`, `prenomPrescripteur`, `dateDisponibiliteResultatAnalyse`, `indResultatCovid`.
- **Labs /Rapports** returns the PDF **inline as base64** inside the JSON response (not at a separate URL). Scan response strings for `%PDF` magic bytes (base64 `JVBERi`) to extract.

### Still unknown

- **Carte / Coordonnees / Courriel / TelephoneMobile / SituationMedecinFamille** response shapes — Phase 2 didn't read them; Phase 3 schemas are lenient passthrough but the normalize field-mapping may be wrong. Inspect on first user with a populated card / contact / family doctor.
- **AccesRenseignementsSanteFusionnes** — was captured once but the body wasn't read for shape inference.
