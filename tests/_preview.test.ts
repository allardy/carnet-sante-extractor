import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { it } from 'vitest'

import {
  accessMarkdown,
  appointmentsMarkdown,
  imagingMarkdown,
  labsMarkdown,
  medicalServicesMarkdown,
  medicationsMarkdown,
  profileMarkdown,
} from '../src/normalize/markdown.js'
import {
  type CleanAccess,
  type CleanAppointment,
  type CleanImagingExam,
  type CleanLab,
  type CleanMedication,
  type CleanProfile,
  type CleanService,
} from '../src/normalize/schemas.js'
import { dossierHtml, type DossierSection } from '../src/output/dossier.js'
import { emptyManifest, type Manifest } from '../src/output/manifest.js'
import { runRootLinks, sectionFor } from '../src/output/sections.js'

const ctx = { locale: 'fr' as const, links: runRootLinks }

const profile: CleanProfile = {
  citizenId: '1234567890',
  fullName: 'JEANNE TREMBLAY-LAROSE',
  birthDate: '1984-07-19',
  sex: 'Féminin',
  cardNumber: 'TREJ 8407 1912',
  cardExpires: '2027-07',
  email: 'jeanne.tremblay@example.com',
  phone: '514-555-0142',
  address: '4521 rue Sainte-Catherine E, Montréal, QC H1V 1Z3',
  familyDoctor: 'MARC-ANDRÉ BÉLANGER',
}

const meds: CleanMedication[] = [
  {
    id: '1',
    drugName: 'ATORVASTATINE 20 MG',
    din: '02288999',
    posology: '1 comprimé une fois par jour au coucher',
    prescriber: 'BÉLANGER',
    pharmacy: 'PHARMAPRIX 0421',
    prescribedAt: '2025-02-11',
    durationDays: 90,
    refillsAuthorized: 4,
    refillsRemaining: 3,
    lastDispensedAt: '2025-04-02',
    klass: '',
  },
  {
    id: '2',
    drugName: 'PANTOPRAZOLE 40 MG',
    din: '02241804',
    posology: '1 comprimé le matin à jeun',
    prescriber: 'NGUYEN',
    pharmacy: 'JEAN COUTU 188',
    prescribedAt: '2025-01-05',
    durationDays: 30,
    refillsAuthorized: 2,
    refillsRemaining: 1,
    klass: '',
  },
  {
    id: '3',
    drugName: 'AMOXICILLINE 500 MG',
    din: '02230245',
    posology: '1 capsule 3 fois par jour pendant 7 jours',
    prescriber: 'BÉLANGER',
    pharmacy: 'PHARMAPRIX 0421',
    prescribedAt: '2024-11-20',
    durationDays: 7,
    refillsAuthorized: 0,
    refillsRemaining: 0,
    klass: '',
  },
]

const appts: CleanAppointment[] = [
  {
    id: 'a1',
    date: '2025-06-18',
    time: '09:30',
    doctor: 'BÉLANGER',
    specialty: 'Médecine familiale',
    clinic: 'GMF Hochelaga',
    status: 'Confirmé',
  },
  {
    id: 'a2',
    date: '2025-07-04',
    time: '14:15',
    doctor: 'NGUYEN',
    specialty: 'Gastroentérologie',
    clinic: 'CHUM',
    status: 'À venir',
  },
]

const imaging: CleanImagingExam[] = [
  {
    examId: 'e1',
    date: '2025-03-12',
    description: 'Radiographie pulmonaire (thorax)',
    prescriber: 'BÉLANGER',
    reportIds: ['r1'],
  },
  {
    examId: 'e2',
    date: '2024-09-28',
    description: 'Échographie abdominale complète',
    prescriber: 'NGUYEN',
    reportIds: ['r2'],
  },
]

const labs: CleanLab[] = [
  {
    id: 'l1',
    noReq: 'l1',
    date: '2025-04-02',
    prescriber: 'BÉLANGER',
    reports: [],
    analyses: [
      { code: 'GLU', label: 'Glucose à jeun', value: '6.4', unit: 'mmol/L', reference: '3.9–5.5', abnormal: true },
      { code: 'HBA1C', label: 'Hémoglobine glyquée (HbA1c)', value: '5.9', unit: '%', reference: '< 6.0' },
      { code: 'LDL', label: 'Cholestérol LDL', value: '3.1', unit: 'mmol/L', reference: '< 3.4' },
    ],
  },
  {
    id: 'l2',
    noReq: 'l2',
    date: '2024-10-15',
    prescriber: 'NGUYEN',
    reports: [],
    analyses: [{ code: 'TSH', label: 'Thyréostimuline (TSH)', value: '2.1', unit: 'mUI/L', reference: '0.35–5.0' }],
  },
]

const services: CleanService[] = [
  {
    id: 's1',
    date: '2025-02-11',
    description: 'Examen périodique',
    practitioner: 'MARC-ANDRÉ BÉLANGER',
    facility: 'GMF Hochelaga',
    amountPaid: 84.5,
  },
  {
    id: 's2',
    date: '2024-09-28',
    description: 'Échographie',
    precision: 'Abdominale',
    practitioner: 'THI NGUYEN',
    facility: 'CHUM',
    amountPaid: 132.0,
  },
]

const access: CleanAccess[] = [
  {
    date: '2025-04-02',
    time: '11:05:00',
    person: 'Marc-André BÉLANGER',
    role: 'Médecin',
    providerId: 'bela1@PROD',
    domains: ['Medicament', 'Prelevement'],
  },
  {
    date: '2025-03-12',
    time: '08:50:00',
    person: 'Sophie LAVOIE',
    role: 'Technologue en imagerie',
    providerId: 'lavs2@PROD',
    domains: ['Imagerie'],
  },
  {
    date: '2024-10-15',
    time: '16:20:00',
    person: 'Marc-André BÉLANGER',
    role: 'Médecin',
    providerId: 'bela1@PROD',
    domains: ['Prelevement'],
  },
]

const docLinks = [
  { date: '2025-03-12', outputPath: 'pdf/imagerie/2025-03-12_RADIOGRAPHIE_PULMONAIRE.pdf' },
  { date: '2024-09-28', outputPath: 'pdf/imagerie/2024-09-28_ECHOGRAPHIE_ABDOMINALE.pdf' },
]

it('writes a dossier-complet.html preview to tmp', () => {
  const sections: DossierSection[] = [
    { def: sectionFor('profile'), body: profileMarkdown(profile, ctx) },
    { def: sectionFor('medications'), body: medicationsMarkdown(meds, [], ctx) },
    { def: sectionFor('appointments'), body: appointmentsMarkdown(appts, [], ctx) },
    { def: sectionFor('imaging'), body: imagingMarkdown(imaging, docLinks, ctx) },
    { def: sectionFor('labs'), body: labsMarkdown(labs, [], ctx) },
    { def: sectionFor('medical-services'), body: medicalServicesMarkdown(services, [], ctx) },
    { def: sectionFor('access'), body: accessMarkdown(access, [], ctx) },
  ]

  const m: Manifest = emptyManifest()

  m.profile = profile
  m.locale = 'fr'
  m.documents = [
    { id: 'r1', url: 'u', outputPath: 'documents/pdf/imagerie/a.pdf', sha256: 's', bytes: 1, capturedAt: '2025-03-12' },
    { id: 'r2', url: 'u', outputPath: 'documents/pdf/imagerie/b.pdf', sha256: 's', bytes: 1, capturedAt: '2024-09-28' },
  ]
  m.domains = {
    profile: { count: 1, errors: [] },
    medications: { count: meds.length, errors: [] },
    appointments: { count: appts.length, errors: [] },
    imaging: { count: imaging.length, errors: [] },
    labs: { count: labs.length, errors: [] },
    'medical-services': { count: services.length, errors: [] },
    access: { count: access.length, errors: [] },
  }

  const out = resolve(tmpdir(), 'carnet-dossier-preview.html')

  writeFileSync(out, dossierHtml(sections, m), 'utf8')
  // eslint-disable-next-line no-console
  console.log('PREVIEW_PATH=' + out)
})
