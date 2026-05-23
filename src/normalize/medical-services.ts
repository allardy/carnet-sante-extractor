import { type CleanService, servicesListSchema } from './schemas.js'

export const normalizeMedicalServices = (raw: unknown): CleanService[] => {
  const parsed = servicesListSchema.parse(raw)

  return parsed.map((s) => ({
    id: s.Id,
    date: s.DateService.slice(0, 10),
    description: s.Description,
    facility: s.Etablissement,
    specialty: s.Specialite,
    amount: s.Montant,
    status: s.Statut,
  }))
}
