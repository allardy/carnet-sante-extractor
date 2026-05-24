import {
  carteSchema,
  citoyenSchema,
  type CleanProfile,
  coordonneesSchema,
  courrielSchema,
  medecinSchema,
  phoneSchema,
} from './schemas.js'

export type ProfileRaw = {
  citoyen: unknown
  coordonnees?: unknown
  carte?: unknown
  email?: unknown
  phone?: unknown
  medecin?: unknown
}

// Known enrolment situations surfaced when no family doctor is assigned. Unmapped values pass
// through verbatim so we never silently drop a status we haven't seen yet.
const situationLabels: Record<string, string> = {
  InscritAuGuichet: "Inscrit au guichet d'accès (aucun médecin assigné)",
}

const formatAddress = (coordonnees: ReturnType<typeof coordonneesSchema.parse> | undefined): string | undefined => {
  if (!coordonnees) {
    return undefined
  }

  const adresse = coordonnees.Adresse
  const parts =
    adresse && typeof adresse === 'object'
      ? [adresse.Ligne1, adresse.Ligne2, adresse.Ligne3]
      : [adresse, coordonnees.Ville, coordonnees.Province, coordonnees.CodePostal]

  return parts.filter(Boolean).join(', ') || undefined
}

export const normalizeProfile = (raw: ProfileRaw): CleanProfile => {
  const citoyen = citoyenSchema.parse(raw.citoyen)
  const carte = raw.carte ? carteSchema.parse(raw.carte) : undefined
  const email = raw.email ? courrielSchema.parse(raw.email) : undefined
  const phone = raw.phone ? phoneSchema.parse(raw.phone) : undefined
  const coordonnees = raw.coordonnees ? coordonneesSchema.parse(raw.coordonnees) : undefined
  const medecin = raw.medecin ? medecinSchema.parse(raw.medecin) : undefined

  const familyDoctor =
    medecin && (medecin.APrenomMedecinFamille || medecin.ANomMedecinFamille)
      ? `${medecin.APrenomMedecinFamille ?? ''} ${medecin.ANomMedecinFamille ?? ''}`.trim() || undefined
      : undefined
  const familyDoctorStatus =
    !familyDoctor && medecin?.Situation ? (situationLabels[medecin.Situation] ?? medecin.Situation) : undefined

  return {
    citizenId: citoyen.IdCitoyen,
    fullName: `${citoyen.Prenom} ${citoyen.Nom}`,
    birthDate: citoyen.DateNaissance.slice(0, 10),
    sex: citoyen.Sexe,
    cardNumber: carte?.NAM ?? carte?.Numero,
    cardExpires: (carte?.DateExpirationCarte ?? carte?.DateExpiration)?.slice(0, 10),
    email: email?.Adresse,
    phone: phone?.Numero,
    address: formatAddress(coordonnees),
    familyDoctor,
    familyDoctorStatus,
  }
}
