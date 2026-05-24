import { CARNET_API_BASE as BASE } from '../constants.js'

import { type Collector, type DomainResult } from './types.js'

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
