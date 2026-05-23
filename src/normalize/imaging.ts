import { type CleanImagingExam, imagingDetailSchema, imagingListSchema } from './schemas.js'

export const normalizeImaging = (list: unknown, details: Record<string, unknown>): CleanImagingExam[] => {
  const parsed = imagingListSchema.parse(list)

  return parsed.map((e) => {
    const detail = details[e.NumeroExamen]
    const parsedDetail = detail ? imagingDetailSchema.parse(detail) : undefined

    return {
      examId: e.NumeroExamen,
      date: e.DateExamen.slice(0, 10),
      description: e.DescriptionExamen,
      prescriber: `${e.PrenomPrescripteur} ${e.NomPrescripteur}`,
      reportIds: parsedDetail?.RapportsImagerie?.map((r) => r.IdRapport) ?? [],
    }
  })
}
