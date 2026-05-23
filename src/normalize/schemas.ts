import { z } from 'zod'

// NOTE: Coordonnees / CarteAssuranceMaladie / Courriel / TelephoneMobile shapes are best-guess
// from Phase 2 URL paths only; verify-and-adjust on first live extract.

const isoDate = z.string()

export const citoyenSchema = z.object({
  IdCitoyen: z.string(),
  Nom: z.string(),
  Prenom: z.string(),
  Sexe: z.string(),
  DateNaissance: isoDate,
  IndAdmissibiliteCarnetSante: z.boolean(),
  EstAgeEntre14Et17Ans: z.boolean(),
  PersonnesACharge: z.array(z.unknown()).nullable(),
})

export const coordonneesSchema = z.object({
  Adresse: z.string().optional(),
  Ville: z.string().optional(),
  CodePostal: z.string().optional(),
  Province: z.string().optional(),
})

export const carteSchema = z.object({
  Numero: z.string(),
  DateExpiration: isoDate,
})

export const courrielSchema = z.object({
  Adresse: z.string(),
  Confirme: z.boolean().optional(),
})

export const phoneSchema = z.object({
  Numero: z.string(),
  Confirme: z.boolean().optional(),
})

export const medecinSchema = z.object({
  ANomMedecinFamille: z.string().optional(),
  APrenomMedecinFamille: z.string().optional(),
  AClinique: z.string().optional(),
})

export type CleanProfile = {
  citizenId: string
  fullName: string
  birthDate: string
  sex: string
  cardNumber?: string
  cardExpires?: string
  email?: string
  phone?: string
  address?: string
  familyDoctor?: string
}

const posologieSchema = z.object({
  Description: z.string(),
  DIN: z.string().nullable().optional(),
  Nom: z.string().nullable().optional(),
  NomAnglais: z.string().nullable().optional(),
})

const medicamentSchema = z.object({
  DIN: z.string(),
  Nom: z.string(),
  NomAnglais: z.string(),
  LibelleClasse: z.string(),
  LibelleClasseAnglais: z.string(),
  Posologies: z.array(posologieSchema),
})

export const ordonnanceSchema = z.object({
  Type: z.string(),
  Id: z.string(),
  IdOrdonnance: z.string(),
  Date: isoDate,
  Duree: z.number(),
  NomPrescripteur: z.string(),
  PrenomPrescripteur: z.string(),
  Pharmacie: z.string(),
  NombreDelivrancesAutorisees: z.number(),
  NombreDelivrancesRestantes: z.number(),
  MedicamentPrescrit: medicamentSchema,
  DernierService: z
    .object({
      Id: z.string(),
      Date: isoDate,
      Duree: z.number(),
      NomPharmacie: z.string(),
      Medicaments: medicamentSchema,
    })
    .nullable(),
  Services: z.array(z.unknown()).nullable(),
})

export const medicationsListSchema = z.array(ordonnanceSchema)

export type CleanMedication = {
  id: string
  drugName: string
  din: string
  posology: string
  prescriber: string
  pharmacy: string
  prescribedAt: string
  durationDays: number
  refillsAuthorized: number
  refillsRemaining: number
  lastDispensedAt?: string
  klass: string
}

export const appointmentSchema = z.object({
  Id: z.string(),
  DateRendezVous: isoDate,
  NomMedecin: z.string(),
  PrenomMedecin: z.string(),
  Clinique: z.string().optional(),
  Specialite: z.string().optional(),
  Statut: z.string().optional(),
})

export const appointmentsListSchema = z.array(appointmentSchema)

export type CleanAppointment = {
  id: string
  date: string
  time: string
  doctor: string
  clinic?: string
  specialty?: string
  status?: string
}

export const serviceSchema = z.object({
  Id: z.string(),
  DateService: isoDate,
  Description: z.string().optional(),
  Etablissement: z.string().optional(),
  Specialite: z.string().optional(),
  Montant: z.number().optional(),
  Statut: z.string().optional(),
})

export const servicesListSchema = z.array(serviceSchema)

export type CleanService = {
  id: string
  date: string
  description?: string
  facility?: string
  specialty?: string
  amount?: number
  status?: string
}

export const imagingListItemSchema = z.object({
  NumeroExamen: z.string(),
  DateExamen: isoDate,
  DescriptionExamen: z.string(),
  NomPrescripteur: z.string(),
  PrenomPrescripteur: z.string(),
  RapportsImagerie: z.array(z.unknown()).nullable(),
  DateDisponibiliteRapport: z.string().nullable(),
  IdCitoyen: z.string().nullable(),
})

export const imagingListSchema = z.array(imagingListItemSchema)

export const imagingDetailSchema = z.object({
  NumeroExamen: z.string(),
  RapportsImagerie: z
    .array(
      z.object({
        IdRapport: z.string(),
        DateRapport: isoDate,
        Statut: z.string().optional(),
      }),
    )
    .nullable(),
})

export type CleanImagingExam = {
  examId: string
  date: string
  description: string
  prescriber: string
  reportIds: string[]
}

export const prelevementListItemSchema = z.object({
  NoReq: z.string(),
  OIDSIL: z.string(),
  TypeRapp: z.literal('LAB'),
  DateService: isoDate.optional(),
  Description: z.string().optional(),
  NomPrescripteur: z.string().optional(),
  PrenomPrescripteur: z.string().optional(),
})

export const prelevementListSchema = z.array(prelevementListItemSchema)

export const labRapportSchema = z.object({
  IdRapport: z.string(),
  DateRapport: isoDate,
  Statut: z.string().optional(),
})

export const labResultsSchema = z.object({
  Analyses: z.array(
    z.object({
      Code: z.string(),
      Libelle: z.string(),
      Valeur: z.string(),
      Unite: z.string().optional(),
      Reference: z.string().optional(),
      Anormal: z.boolean().optional(),
    }),
  ),
})

export type CleanLab = {
  noReq: string
  date: string
  description?: string
  prescriber?: string
  reports: { id: string; date: string; status?: string }[]
  analyses: { code: string; label: string; value: string; unit?: string; reference?: string; abnormal?: boolean }[]
}
