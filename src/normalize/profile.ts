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

export const normalizeProfile = (raw: ProfileRaw): CleanProfile => {
  const citoyen = citoyenSchema.parse(raw.citoyen)
  const carte = raw.carte ? carteSchema.parse(raw.carte) : undefined
  const email = raw.email ? courrielSchema.parse(raw.email) : undefined
  const phone = raw.phone ? phoneSchema.parse(raw.phone) : undefined
  const coordonnees = raw.coordonnees ? coordonneesSchema.parse(raw.coordonnees) : undefined
  const medecin = raw.medecin ? medecinSchema.parse(raw.medecin) : undefined

  const address = coordonnees
    ? [coordonnees.Adresse, coordonnees.Ville, coordonnees.Province, coordonnees.CodePostal].filter(Boolean).join(', ')
    : undefined
  const familyDoctor =
    medecin && (medecin.APrenomMedecinFamille || medecin.ANomMedecinFamille)
      ? `${medecin.APrenomMedecinFamille ?? ''} ${medecin.ANomMedecinFamille ?? ''}`.trim() || undefined
      : undefined

  return {
    citizenId: citoyen.IdCitoyen,
    fullName: `${citoyen.Prenom} ${citoyen.Nom}`,
    birthDate: citoyen.DateNaissance.slice(0, 10),
    sex: citoyen.Sexe,
    cardNumber: carte?.Numero,
    cardExpires: carte?.DateExpiration.slice(0, 10),
    email: email?.Adresse,
    phone: phone?.Numero,
    address: address || undefined,
    familyDoctor,
  }
}
