import { accessListSchema, type CleanAccess } from './schemas.js'

export const normalizeAccess = (raw: unknown): CleanAccess[] => {
  const parsed = accessListSchema.parse(raw)

  return parsed.map((e) => {
    const debut = e.periodeAcces?.dateDebut ?? ''
    const person = `${e.intervenant?.prenom ?? ''} ${e.intervenant?.nom ?? ''}`.trim()

    return {
      date: debut.slice(0, 10),
      time: debut.slice(11, 19),
      person,
      role: e.intervenant?.role ?? '',
      roleEn: e.intervenant?.roleAnglais ?? undefined,
      providerId: e.intervenant?.id ?? '',
      domains: e.domaines ?? [],
    }
  })
}
