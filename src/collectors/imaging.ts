import { type Collector, type DocumentDescriptor, type DomainResult } from './types.js'

const BASE = 'https://www.carnetsante.gouv.qc.ca/api/1'

type ImagingListItem = { NumeroExamen: string; DateExamen: string; DescriptionExamen: string }
type ImagingDetail = { RapportsImagerie?: { IdRapport: string }[] | null }

export const imagingCollector: Collector = {
  domain: 'imaging',
  collect: async (ctx): Promise<DomainResult> => {
    const now = new Date()
    const fromYear = now.getFullYear() - 7
    const url = `${BASE}/Citoyens/${ctx.citizenId}/ExamensImagerie?DateDebut=${fromYear}-1-1&DateFin=${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const list = (await ctx.nav.fetchJson(url)) as ImagingListItem[]

    const details: Record<string, ImagingDetail> = {}
    const documents: DocumentDescriptor[] = []

    for (const e of list) {
      const d = (await ctx.nav.fetchJson(
        `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${e.NumeroExamen}/DetailRapport`,
      )) as ImagingDetail

      details[e.NumeroExamen] = d

      for (const r of d.RapportsImagerie ?? []) {
        documents.push({
          id: r.IdRapport,
          url: `${BASE}/Citoyens/${ctx.citizenId}/ExamenImagerie/${e.NumeroExamen}/DetailRapport/${r.IdRapport}/Rapport`,
          title: e.DescriptionExamen,
          type: 'imagerie',
          date: e.DateExamen.slice(0, 10),
        })
      }
    }

    return { domain: 'imaging', raw: { list, details }, documents }
  },
}
