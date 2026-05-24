import { type CleanImagingExam, imagingDetailSchema, imagingListSchema } from './schemas.js'

const reportsFromDetail = (detail: unknown): { id: string; date: string; status?: string }[] => {
  const parsed = imagingDetailSchema.parse(detail)
  const rapports = Array.isArray(parsed) ? parsed : (parsed.RapportsImagerie ?? [])

  return rapports.map((r) => ({ id: r.IdRapport, date: r.DateRapport.slice(0, 10), status: r.Statut }))
}

export const normalizeImaging = (list: unknown, details: Record<string, unknown>): CleanImagingExam[] => {
  const parsed = imagingListSchema.parse(list)

  return parsed.map((e) => {
    const detail = details[e.NumeroExamen]
    const reports = detail ? reportsFromDetail(detail) : []

    return {
      examId: e.NumeroExamen,
      date: e.DateExamen.slice(0, 10),
      description: e.DescriptionExamen,
      prescriber: `${e.PrenomPrescripteur} ${e.NomPrescripteur}`,
      reportIds: reports.map((r) => r.id),
    }
  })
}
