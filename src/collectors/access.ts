import { RAMQ_FUSED_RECORDS_API_BASE as BASE } from '../constants.js'

import { type Collector, type DomainResult } from './types.js'

// The fused-record access journal: every health-care worker who consulted the citizen's record.
// The SPA queries a wide window in one shot (no narrow per-year cap like Prelevements), so a
// 7-year look-back matches the other history pulls. Date params are zero-padded YYYY-MM-DD.
const ACCESS_HISTORY_YEARS = 7

// Zero-padded LOCAL date (YYYY-MM-DD), matching the format the SPA sends. Must be local, not UTC:
// toISOString() rolls to the next calendar day after ~20:00 Eastern, which pushes DateFin into the
// future on RAMQ's clock and the gateway answers 500.
const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const accessCollector: Collector = {
  domain: 'access',
  collect: async (ctx): Promise<DomainResult> => {
    const id = ctx.citizenId
    const end = new Date()
    const start = new Date(end)

    start.setFullYear(start.getFullYear() - ACCESS_HISTORY_YEARS)
    const url = `${BASE}/AccesRenseignementsSanteFusionnes/${id}?IdCitoyenConnecte=${id}&DateDebut=${ymd(start)}&DateFin=${ymd(end)}`
    const raw = await ctx.nav.fetchJson(url)

    return { domain: 'access', raw, documents: [] }
  },
}
