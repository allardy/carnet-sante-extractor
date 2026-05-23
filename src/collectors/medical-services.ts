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
