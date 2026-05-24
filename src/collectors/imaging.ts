import { CARNET_API_BASE as BASE } from '../constants.js'

import { type Collector, type DocumentDescriptor, type DomainResult } from './types.js'

// The gov API mixes PascalCase (older endpoints) and camelCase (newer endpoints). Imaging's
// DetailRapport response uses camelCase in practice; the Phase 3 best-guess assumed PascalCase
// because Phase 2 only captured the URL, not the body. Look up both forms so we work either way.
const pick = (obj: unknown, ...keys: string[]): unknown => {
  if (!obj || typeof obj !== 'object') {
    return undefined
  }

  const o = obj as Record<string, unknown>

  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) {
      return o[k]
    }
  }

  return undefined
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export const imagingCollector: Collector = {
  domain: 'imaging',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    // Imaging endpoint caps the date range at ~6 years (server 500s on wider). Phase 2 capture
    // showed the SPA uses DateDebut=YYYY-1-1 with YYYY = currentYear - 6.
    const fromYear = now.getFullYear() - 6
    const listUrl = `${BASE}/Citoyens/${ctx.citizenId}/ExamensImagerie?DateDebut=${fromYear}-1-1&DateFin=${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const list = (await ctx.nav.fetchJson(listUrl)) as unknown[]

    const details: Record<string, unknown> = {}
    const documents: DocumentDescriptor[] = []
    const diagnostics: { examId: string; detailKeys: string[]; reason: string }[] = []

    for (const e of list) {
      const examId = asString(pick(e, 'NumeroExamen', 'numeroExamen'))
      const description = asString(pick(e, 'DescriptionExamen', 'descriptionExamen')) ?? 'Examen'
      const dateExamen = asString(pick(e, 'DateExamen', 'dateExamen')) ?? ''

      if (!examId) {
        continue
      }

      try {
        const d = (await ctx.nav.fetchJson(
          `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${examId}/DetailRapport`,
        )) as unknown

        details[examId] = d

        // Real API returns the detail as a direct array; older shape wraps it in an object
        const rapports = Array.isArray(d)
          ? (d as unknown[])
          : ((pick(d, 'RapportsImagerie', 'rapportsImagerie') ?? []) as unknown[])
        const detailKeys = d && typeof d === 'object' ? Object.keys(d) : []
        let flagged = 0

        for (const r of rapports) {
          const reportId = asString(pick(r, 'IdRapport', 'idRapport'))

          if (!reportId) {
            continue
          }

          documents.push({
            id: reportId,
            url: `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${examId}/DetailRapport/${reportId}/Rapport`,
            title: description,
            type: 'imagerie',
            date: dateExamen.slice(0, 10),
          })
          flagged += 1
        }

        if (flagged === 0) {
          // Fallback: the report URL Yann confirmed works follows the pattern
          // `1061642060${examId}0`. If the detail body didn't surface a rapports list (likely
          // a field-name mismatch we haven't covered, or the SPA derives the id client-side
          // the same way we are here), try the derived id. A 404 lands in the per-PDF log
          // alongside the diagnostic so we can see exactly which exam needed the fallback.
          const derivedId = `1061642060${examId}0`

          diagnostics.push({ examId, detailKeys, reason: 'no rapports in detail; using derived id' })
          documents.push({
            id: derivedId,
            url: `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${examId}/DetailRapport/${derivedId}/Rapport`,
            title: description,
            type: 'imagerie',
            date: dateExamen.slice(0, 10),
          })
        }
      } catch (err) {
        details[examId] = { __error: (err as Error).message }
        diagnostics.push({ examId, detailKeys: [], reason: `detail fetch failed: ${(err as Error).message}` })
      }
    }

    return { domain: 'imaging', raw: { list, details, diagnostics }, documents }
  },
}
