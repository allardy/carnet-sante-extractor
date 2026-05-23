import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

export const profileCollector: Collector = {
  domain: 'profile',
  collect: async (ctx): Promise<DomainResult> => {
    const id = ctx.citizenId
    // Per Phase 2 capture, the connected-user object comes from `/api/1/Citoyens` (no path
    // suffix). The `/api/1/Citoyens/{id}` form does NOT exist as a fetchable endpoint — only
    // its sub-resources do. So we hit the bare /Citoyens for the root object plus the
    // documented sub-resources for the rest.
    const [citoyen, coordonnees, carte, email, phone, medecin] = await Promise.all([
      ctx.nav.fetchJson(`${BASE}/Citoyens`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/Coordonnees`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/CarteAssuranceMaladie`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/DonneesContact/Courriel`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/DonneesContact/TelephoneMobile`),
      ctx.nav.fetchJson(`${BASE}/Citoyens/${id}/SituationMedecinFamille`),
    ])

    return {
      domain: 'profile',
      raw: { citoyen, coordonnees, carte, email, phone, medecin },
      documents: [],
    }
  },
}
