# Carnet Santé Québec — API reference

Carnet Santé Québec exposes no public API and no bulk export. This documents the private
`/api/1` surface its single-page app calls, mapped empirically by observing the live session.
URLs use `{citizenId}` for the per-user path parameter. Field names and types are listed; no
real values appear here.

## Hosts

| Host                                                 | Role                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `www.carnetsante.gouv.qc.ca`                         | Primary citizen API (`/api/1/Citoyens/{citizenId}/...`) |
| `ais-passerelle-autorisation-api.ramq.gouv.qc.ca`    | RAMQ data gateway — labs (Prélèvements)                 |
| `ais-acces-renseignements-sante-api.ramq.gouv.qc.ca` | RAMQ fused-health-records API                           |

A single session authenticates every host: RAMQ SSO transparently extends the carnetsante
session to `*.ramq.gouv.qc.ca` (a `.gouv.qc.ca`-domain cookie). There is no `/login` or `/token`
endpoint — login is out-of-band (ClicSEQUR + MFA).

## Authentication

The SPA is Angular + oidc-client-js. After login it holds a short-lived (~1h) Bearer JWT in
`sessionStorage` under a key like:

```
oidc.user:https://fedapp.ramq.gouv.qc.ca/adfs:http://ais-citoyen-prod
```

The value is a JSON object with an `access_token`. An Angular `HttpInterceptor` attaches that JWT
as `Authorization: Bearer <token>` to every `/api/1/*` request. A plain `fetch()` (or any request
that bypasses the interceptor) is rejected with **403 even with valid session cookies** — the
Bearer is required. The token refreshes in place when it expires, so always read the latest value.

Requests also need a browser-like `User-Agent`: a UA containing `Electron/<version>` is treated as
a non-browser client and 403s.

## Endpoints by domain

### Profile / citizen — `www.carnetsante.gouv.qc.ca`

- `GET /api/1/Citoyens` — the connected user. Bootstrap call to learn `{citizenId}`.
  (`/api/1/Citoyens/{citizenId}` itself does **not** exist — only the sub-resources below do.)
- `GET /api/1/Citoyens/{citizenId}/CarteAssuranceMaladie`
- `GET /api/1/Citoyens/{citizenId}/Coordonnees`
- `GET /api/1/Citoyens/{citizenId}/DonneesContact/Courriel`
- `GET /api/1/Citoyens/{citizenId}/DonneesContact/TelephoneMobile`
- `GET /api/1/Citoyens/{citizenId}/SituationMedecinFamille`
- `GET /api/1/Citoyens/PersonnesACharge` — dependents under guardianship (`null` when none)
- `GET /api/1/Citoyens/{citizenId}/Photo` — profile photo

### Appointments

- `GET /api/1/Citoyens/{citizenId}/RendezVous?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}`

### Medications

- `GET /api/1/Citoyens/{citizenId}/Medications?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}` — list, a
  flat array of `OrdonnanceAvecService`. Rich enough to use directly; the per-drug detail call is
  not needed for a bulk pull.
- `GET /api/1/Citoyens/{citizenId}/Medications/{medicationId}` — per-drug detail (extended history).

### Imaging (ExamenImagerie)

List → detail → PDF:

1. `GET /api/1/Citoyens/{citizenId}/ExamensImagerie?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}` — list
   (note plural `Examens`). Each item carries `NumeroExamen`, the `{examId}` for step 2.
2. `GET /api/1/Citoyens/{citizenId}/ExamenImagerie/{examId}/DetailRapport` — report metadata; a
   direct array of `{IdRapport, DateRapport, Statut, ...}`. `IdRapport` is the `{reportId}` for step 3.
3. `GET /api/1/Citoyens/{citizenId}/ExamenImagerie/{examId}/DetailRapport/{reportId}/Rapport` —
   the PDF binary (`application/pdf`).

`{examId}` is an OID-style dotted path (e.g. `2.16.840.1.113883.3.234.1.3.101.1.2.<...>`). The
`{reportId}` follows the empirical pattern `1061642060${examId-without-dots}0`.

### Labs (Prélèvement) — `ais-passerelle-autorisation-api.ramq.gouv.qc.ca`

Hosted on the RAMQ gateway, not carnetsante.

- `GET /api/1/Prelevement/Citoyens/{citizenId}/PrelevementsAccessibles` — feature gate
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements?DateDebut={YYYY-MM-DD}&DateFin={YYYY-MM-DD}`
  — date-range list. Queried per calendar year.
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements/{labId}/Rapports` — per-sample report.
  Returns the **PDF inline as base64** inside the JSON (not at a separate URL). Scan response strings
  for the `%PDF` magic bytes (base64 `JVBERi`) to extract.
- `GET /api/1/Prelevement/Citoyens/{citizenId}/Prelevements/{labId}/ResultatsAnalyse?Tracking={uuid}`
  — structured analysis values. `Tracking` is a per-fetch request-correlation UUID (not auth; the
  `trackingId` from the list item, or a fresh `crypto.randomUUID()`).

The list item's `id` is opaque and ready to use directly in the URLs above (no client-side
encoding needed).

### Medical services (ServicesMedicauxAssures)

- `GET /api/1/Citoyens/{citizenId}/ServicesMedicauxAssures?DateDebut={YYYY-M-D}&DateFin={YYYY-M-D}`
  — covered services (visits / billing-side records).
- `GET /api/1/Citoyens/{citizenId}/ServicesMedicauxAssures/DernierService` — most-recent service.

### Fused health records (AccesRenseignementsSante)

- `GET /api/1/AccesRenseignementsSanteFusionnes/{citizenId}?IdCitoyenConnecte={citizenId}&DateDebut={YYYY-MM-DD}&DateFin={YYYY-MM-DD}`
  — hosted on `ais-acces-renseignements-sante-api.ramq.gouv.qc.ca`. An umbrella "dossier" endpoint
  that may aggregate multiple domains in one payload.

## Date-range caps

The server returns 500 on ranges wider than its per-endpoint limit:

| Endpoint                                  | Max range                                    |
| ----------------------------------------- | -------------------------------------------- |
| `ExamensImagerie?Dates`                   | ~6 years                                     |
| `Medications?Dates`                       | ~2 years (default)                           |
| `ServicesMedicauxAssures?Dates`           | ~7 years                                     |
| `Prelevements?Dates` / `RendezVous?Dates` | per-year — sweep one calendar year at a time |

For per-year endpoints, note that the current rolling year is often empty; historical results live
in prior-year ranges.

## Response shapes

Field names + types only. The API mixes PascalCase (most endpoints) and camelCase (labs).

**`/api/1/Citoyens`** (connected user):

```
{ IndAdmissibiliteCarnetSante: bool, PersonnesACharge: null|array, IdCitoyen: string,
  Nom: string, Prenom: string, Sexe: string, DateNaissance: ISO,
  CarteAssuranceMaladie: null, FonctionnalitesActives: null, EstAgeEntre14Et17Ans: bool }
```

**`Medications?Dates`** — array of:

```
{ Type: 'OrdonnanceAvecService' | other,
  Id, IdOrdonnance: string,                       // same value duplicated
  Date: ISO, Duree: number,                       // prescription start + total days
  NomPrescripteur, PrenomPrescripteur, Pharmacie: string,
  NombreDelivrancesAutorisees, NombreDelivrancesRestantes: number|null,  // null for compounded meds
  MedicamentPrescrit: {
    DIN: string,                                  // Health Canada drug identifier (8 digits)
    Nom, NomAnglais: string,                      // brand + dose + form
    LibelleClasse, LibelleClasseAnglais: string,  // therapeutic class
    Posologies: [{ Description: string, DIN: null, Nom: null, NomAnglais: null }]
  },
  DernierService: { Id: string, Date: ISO, Duree: number, NomPharmacie: string,
                    Medicaments: { ...same shape as MedicamentPrescrit } } | null,
  Services: null | array }
```

**`ExamensImagerie?Dates`** — array of:

```
{ IdCitoyen: null, NumeroExamen: string,          // OID dotted path — the {examId}
  DateExamen: ISO, DescriptionExamen: string,
  NomPrescripteur, PrenomPrescripteur,
  RapportsImagerie: null,                          // not populated in list — use /DetailRapport
  DateDisponibiliteRapport: null | ISO }
```

**`ExamenImagerie/{examId}/DetailRapport`** — direct array (no wrapping object) of:

```
{ IdRapport: string, DateRapport: ISO, Statut: string,
  NumeroExamen: null, DateDisponibiliteRapport: null | ISO }
```

**Medical services** — array of (no `Id` field; synthesize one from `${DateService}-${index}`):

```
{ NomProfessionnel, PrenomProfessionnel,
  MontantPayeRAMQ: number,
  DateService: ISO,
  DescriptionService, DescriptionServiceAnglais: string,
  PrecisionService, PrecisionServiceAnglais: string,
  LieuPhysique: { Nom, Adresse, CodePostal: string } | null,
  LieuGeographique: unknown }
```

**Labs list** (camelCase) — array of:

```
{ id: string,                                      // opaque; use directly in /Rapports + /ResultatsAnalyse
  trackingId: string,                              // maps to ?Tracking=
  datePrelevement: ISO,
  dateEnvoiPrescripteur: null | ISO,
  statutRapport: string,
  nomPrescripteur, prenomPrescripteur: string,
  dateDisponibiliteResultatAnalyse: null | ISO,
  indResultatCovid: bool }
```

## Conventions

- `{citizenId}` is a path parameter on every per-user endpoint; discover it via `GET /api/1/Citoyens`.
- Date ranges are explicit and inclusive: `?DateDebut=...&DateFin=...`. Some endpoints use `YYYY-M-D`
  (no zero-pad), labs use `YYYY-MM-DD` — match the originating format.
- PDF downloads are direct GETs with the session's auth; content-type `application/pdf` — except labs,
  which inline the PDF as base64 in the `/Rapports` JSON.
