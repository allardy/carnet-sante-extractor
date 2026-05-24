import { type CleanMedication, medicationsListSchema } from './schemas.js'

export const normalizeMedications = (raw: unknown): CleanMedication[] => {
  const parsed = medicationsListSchema.parse(raw)

  return parsed.map((o) => ({
    id: o.IdOrdonnance,
    drugName: o.MedicamentPrescrit.Nom,
    din: o.MedicamentPrescrit.DIN,
    posology: o.MedicamentPrescrit.Posologies.map((p) => p.Description)
      .filter(Boolean)
      .join(' / '),
    prescriber: `${o.PrenomPrescripteur} ${o.NomPrescripteur}`,
    pharmacy: o.Pharmacie,
    prescribedAt: o.Date.slice(0, 10),
    durationDays: o.Duree,
    refillsAuthorized: o.NombreDelivrancesAutorisees,
    refillsRemaining: o.NombreDelivrancesRestantes,
    lastDispensedAt: o.DernierService?.Date.slice(0, 10),
    klass: o.MedicamentPrescrit.LibelleClasse,
  }))
}
