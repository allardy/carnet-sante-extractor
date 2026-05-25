import { type CleanMedication, medicationsListSchema } from './schemas.js'

export const normalizeMedications = (raw: unknown): CleanMedication[] => {
  const parsed = medicationsListSchema.parse(raw)

  return parsed.map((o, i) => {
    const med = o.MedicamentPrescrit
    const prescriber = [o.PrenomPrescripteur, o.NomPrescripteur].filter(Boolean).join(' ')

    return {
      id: o.IdOrdonnance ?? o.Id ?? `med-${i + 1}`,
      drugName: med?.Nom ?? '',
      din: med?.DIN ?? '',
      posology: (med?.Posologies ?? [])
        .map((p) => p.Description)
        .filter(Boolean)
        .join(' / '),
      prescriber,
      pharmacy: o.Pharmacie ?? '',
      prescribedAt: o.Date?.slice(0, 10) ?? '',
      durationDays: o.Duree ?? null,
      refillsAuthorized: o.NombreDelivrancesAutorisees ?? null,
      refillsRemaining: o.NombreDelivrancesRestantes ?? null,
      lastDispensedAt: o.DernierService?.Date?.slice(0, 10),
      klass: med?.LibelleClasse ?? '',
    }
  })
}
