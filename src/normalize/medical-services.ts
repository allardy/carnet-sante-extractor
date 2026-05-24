import { type CleanService, servicesListSchema } from './schemas.js'

export const normalizeMedicalServices = (raw: unknown): CleanService[] => {
  const parsed = servicesListSchema.parse(raw)

  return parsed.map((s, i) => {
    const practitioner =
      s.PrenomProfessionnel || s.NomProfessionnel
        ? `${s.PrenomProfessionnel ?? ''} ${s.NomProfessionnel ?? ''}`.trim() || undefined
        : undefined

    return {
      id: `${s.DateService.slice(0, 10)}-${i}`, // synthesized — real shape has no server id
      date: s.DateService.slice(0, 10),
      description: s.DescriptionService,
      descriptionEn: s.DescriptionServiceAnglais,
      precision: s.PrecisionService,
      practitioner,
      amountPaid: s.MontantPayeRAMQ,
      facility: s.LieuPhysique?.Nom,
      address: s.LieuPhysique?.Adresse,
    }
  })
}
