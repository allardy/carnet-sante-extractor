import { z } from 'zod'

// Placeholder shapes — refined against real payloads after the recon session (build step 3+).

export const labResultSchema = z.object({
  testName: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  date: z.string().optional(),
})
export type LabResult = z.infer<typeof labResultSchema>

export const medicationSchema = z.object({
  name: z.string(),
  dose: z.string().optional(),
  prescribedDate: z.string().optional(),
  prescriber: z.string().optional(),
})
export type Medication = z.infer<typeof medicationSchema>

export const vaccineSchema = z.object({
  name: z.string(),
  date: z.string().optional(),
  lot: z.string().optional(),
})
export type Vaccine = z.infer<typeof vaccineSchema>

export const appointmentSchema = z.object({
  title: z.string(),
  date: z.string().optional(),
  location: z.string().optional(),
})
export type Appointment = z.infer<typeof appointmentSchema>
