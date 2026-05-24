import { appointmentsListSchema, type CleanAppointment } from './schemas.js'

export const normalizeAppointments = (raw: unknown): CleanAppointment[] => {
  const parsed = appointmentsListSchema.parse(raw)

  return parsed.map((a) => ({
    id: a.Id,
    date: a.DateRendezVous.slice(0, 10),
    time: a.DateRendezVous.slice(11, 16),
    doctor: `${a.PrenomMedecin} ${a.NomMedecin}`,
    clinic: a.Clinique,
    specialty: a.Specialite,
    status: a.Statut,
  }))
}
