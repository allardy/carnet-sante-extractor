import { type Collector, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

export const profileCollector: Collector = {
  domain: 'profile',
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
      domain: 'profile',
      raw: { citoyen, coordonnees, carte, email, phone, medecin },
      documents: [],
    }
  },
}
