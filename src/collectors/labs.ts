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
