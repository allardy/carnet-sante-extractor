import { randomUUID } from 'node:crypto'

import { RAMQ_GATEWAY_API_BASE as BASE } from '../constants.js'
import { extractBase64Pdfs } from '../util/pdf-extract.js'

import { type Collector, type DocumentDescriptor, type DomainResult } from './types.js'

// Matches the SPA's full sweep. The Prelevements endpoint expects per-year queries (it returns
// nothing for the current rolling year if the citizen's labs are older — see the phase2 endpoint
// map), so we fan out one DateDebut/DateFin request per calendar year and flatten the results.
const LABS_HISTORY_YEARS = 7

export const labsCollector: Collector = {
  domain: 'labs',
  collect: async (ctx): Promise<DomainResult> => {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: LABS_HISTORY_YEARS }, (_, i) => currentYear - i)

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
    const documents: DocumentDescriptor[] = []

    // The actual Prelevements list item shape (discovered on first live run) is camelCase
    // with an opaque `id` (already the format the server wants in subsequent URLs) and a
    // `trackingId` that maps to the ?Tracking= query param on ResultatsAnalyse.
    for (const [idx, item] of (list as Record<string, unknown>[]).entries()) {
      ctx.onItem?.(idx + 1, list.length, 'sample')
      const id = item['id']

      if (typeof id !== 'string') {
        const keys = Object.keys(item).join(', ')

        throw new Error(`labs list item missing id — actual keys: [${keys}]`)
      }

      const tracking = typeof item['trackingId'] === 'string' ? item['trackingId'] : randomUUID()
      const dateField = typeof item['datePrelevement'] === 'string' ? (item['datePrelevement'] as string) : undefined

      try {
        const rapportsResp = await ctx.nav.fetchJson(
          `${BASE}/Prelevement/Citoyens/${ctx.citizenId}/Prelevements/${id}/Rapports`,
        )

        rapports[id] = rapportsResp

        // Labs /Rapports returns the PDF binary inline as base64 (instead of pointing at a
        // separate URL like imaging does). Scan the response for PDF magic bytes and surface
        // each as a DocumentDescriptor; the orchestrator decodes inlineData and writes the file.
        const pdfs = extractBase64Pdfs(rapportsResp)

        for (let i = 0; i < pdfs.length; i += 1) {
          const pdf = pdfs[i]!
          const descId = pdfs.length === 1 ? id : `${id}-${i}`

          documents.push({
            id: descId,
            url: '', // not used — inlineData carries the bytes
            title: 'Prelevement',
            type: 'laboratoire',
            date: dateField?.slice(0, 10),
            inlineData: pdf.base64,
          })
        }

        results[id] = await ctx.nav.fetchJson(
          `${BASE}/Prelevement/Citoyens/${ctx.citizenId}/Prelevements/${id}/ResultatsAnalyse?Tracking=${tracking}`,
        )
      } catch (err) {
        // One bad lab doesn't kill the others — log the failure inline and continue.
        rapports[id] = { __error: (err as Error).message }
      }
    }

    return { domain: 'labs', raw: { list, rapports, results }, documents }
  },
}
