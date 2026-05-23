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
    const reportsRaw = raw.rapports[l.id]
    const reports =
      reportsRaw && !(reportsRaw as Record<string, unknown>)['__error']
        ? (() => {
            const arr = Array.isArray(reportsRaw) ? reportsRaw : []

            try {
              return rapportsArraySchema.parse(arr)
            } catch {
              return []
            }
          })()
        : []

    const resultsRaw = raw.results[l.id]
    let analyses: CleanLab['analyses'] = []

    try {
      if (resultsRaw) {
        analyses = labResultsSchema.parse(resultsRaw).Analyses.map((a) => ({
          code: a.Code,
          label: a.Libelle,
          value: a.Valeur,
          unit: a.Unite,
          reference: a.Reference,
          abnormal: a.Anormal,
        }))
      }
    } catch {
      analyses = []
    }

    return {
      id: l.id,
      noReq: l.id,
      date: l.datePrelevement?.slice(0, 10) ?? '',
      description: undefined,
      prescriber:
        l.prenomPrescripteur && l.nomPrescripteur ? `${l.prenomPrescripteur} ${l.nomPrescripteur}` : undefined,
      reports: reports.map((r) => ({ id: r.IdRapport, date: r.DateRapport.slice(0, 10), status: r.Statut })),
      analyses,
    }
  })
}
