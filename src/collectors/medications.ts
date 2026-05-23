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
