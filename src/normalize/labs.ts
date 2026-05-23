import { z } from 'zod'

import { type CleanLab, labRapportSchema, labResultsSchema, prelevementListSchema } from './schemas.js'

const rapportsArraySchema = z.array(labRapportSchema)

export type LabsRaw = {
  list: unknown
  rapports: Record<string, unknown>
  results: Record<string, unknown>
}

export const normalizeLabs = (raw: LabsRaw): CleanLab[] => {
  const list = prelevementListSchema.parse(raw.list)

  return list.map((l) => {
    const reports = raw.rapports[l.NoReq] ? rapportsArraySchema.parse(raw.rapports[l.NoReq]) : []
    const resultsRaw = raw.results[l.NoReq]
    const results = resultsRaw ? labResultsSchema.parse(resultsRaw).Analyses : []

    return {
      noReq: l.NoReq,
      date: l.DateService?.slice(0, 10) ?? '',
      description: l.Description,
      prescriber:
        l.PrenomPrescripteur && l.NomPrescripteur ? `${l.PrenomPrescripteur} ${l.NomPrescripteur}` : undefined,
      reports: reports.map((r) => ({ id: r.IdRapport, date: r.DateRapport.slice(0, 10), status: r.Statut })),
      analyses: results.map((a) => ({
        code: a.Code,
        label: a.Libelle,
        value: a.Valeur,
        unit: a.Unite,
        reference: a.Reference,
        abnormal: a.Anormal,
      })),
    }
  })
}
