import { CARNET_API_BASE as BASE } from '../constants.js'

import { type Collector, type DomainResult } from './types.js'

const yearsAgo = (today: Date, years: number): string => {
  const d = new Date(today)

  d.setFullYear(d.getFullYear() - years)

  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const todayStr = (today: Date): string => `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`

// Phase 2 capture showed the SPA queries a 2-year window for Medications. Wider ranges may 500.
const MEDICATIONS_HISTORY_YEARS = 2

export const medicationsCollector: Collector = {
  domain: 'medications',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    const url = `${BASE}/Citoyens/${ctx.citizenId}/Medications?DateDebut=${yearsAgo(now, MEDICATIONS_HISTORY_YEARS)}&DateFin=${todayStr(now)}`
    const raw = await ctx.nav.fetchJson(url)

    return { domain: 'medications', raw, documents: [] }
  },
}
