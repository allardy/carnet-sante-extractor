import { copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type DocumentDescriptor } from '../collectors/types.js'
import { normalizeAppointments } from '../normalize/appointments.js'
import { normalizeImaging } from '../normalize/imaging.js'
import { normalizeLabs } from '../normalize/labs.js'
import {
  appointmentsMarkdown,
  imagingMarkdown,
  labsMarkdown,
  medicalServicesMarkdown,
  medicationsMarkdown,
  profileMarkdown,
} from '../normalize/markdown.js'
import { normalizeMedicalServices } from '../normalize/medical-services.js'
import { normalizeMedications } from '../normalize/medications.js'
import { normalizeProfile, type ProfileRaw } from '../normalize/profile.js'
import { ensureDir, sha256, writeJson, writeText } from '../util/fs.js'

import { type Manifest, type ManifestEntry, saveManifest } from './manifest.js'
import { renameDocument } from './rename.js'
import { summaryMarkdown } from './summary.js'

export type OrchestratorOutput = {
  profile: ProfileRaw
  medications: unknown
  appointments: unknown
  medicalServices: unknown
  imaging: { list: unknown; details: Record<string, unknown> }
  labs: { list: unknown; rapports: Record<string, unknown>; results: Record<string, unknown> }
  documents: { descriptor: DocumentDescriptor; localPath: string }[]
}

export const writeOutput = async (raw: OrchestratorOutput, outputDir: string): Promise<Manifest> => {
  const dataDir = resolve(outputDir, 'data')
  const mdDir = resolve(outputDir, 'markdown')
  const docsDir = resolve(outputDir, 'documents')

  await Promise.all([ensureDir(dataDir), ensureDir(mdDir), ensureDir(docsDir)])

  const profile = normalizeProfile(raw.profile)
  const meds = normalizeMedications(raw.medications)
  const appts = normalizeAppointments(raw.appointments)
  const services = normalizeMedicalServices(raw.medicalServices)
  const imaging = normalizeImaging(raw.imaging.list, raw.imaging.details)
  const labs = normalizeLabs(raw.labs)

  await Promise.all([
    writeJson(resolve(dataDir, 'profile.json'), profile),
    writeJson(resolve(dataDir, 'medications.json'), meds),
    writeJson(resolve(dataDir, 'appointments.json'), appts),
    writeJson(resolve(dataDir, 'medical-services.json'), services),
    writeJson(resolve(dataDir, 'imaging.json'), imaging),
    writeJson(resolve(dataDir, 'labs.json'), labs),
  ])

  await Promise.all([
    writeText(resolve(mdDir, 'profile.md'), profileMarkdown(profile)),
    writeText(resolve(mdDir, 'medications.md'), medicationsMarkdown(meds)),
    writeText(resolve(mdDir, 'appointments.md'), appointmentsMarkdown(appts)),
    writeText(resolve(mdDir, 'medical-services.md'), medicalServicesMarkdown(services)),
    writeText(resolve(mdDir, 'imaging.md'), imagingMarkdown(imaging)),
    writeText(resolve(mdDir, 'labs.md'), labsMarkdown(labs)),
  ])

  const taken = new Set<string>()
  const entries: ManifestEntry[] = []

  for (const d of raw.documents) {
    const outputPath = renameDocument(d.descriptor, taken)
    const dest = resolve(docsDir, outputPath)

    await ensureDir(resolve(dest, '..'))
    await copyFile(d.localPath, dest)
    const buf = await readFile(dest)

    entries.push({
      id: d.descriptor.id,
      url: d.descriptor.url,
      outputPath: `documents/${outputPath}`,
      sha256: sha256(buf),
      bytes: buf.length,
      capturedAt: d.descriptor.date ?? '',
    })
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    profile,
    domains: {
      medications: { count: meds.length, errors: [] },
      appointments: { count: appts.length, errors: [] },
      'medical-services': { count: services.length, errors: [] },
      imaging: { count: imaging.length, errors: [] },
      labs: { count: labs.length, errors: [] },
    },
    documents: entries,
  }

  await saveManifest(resolve(outputDir, 'manifest.json'), manifest)
  await writeText(resolve(outputDir, 'summary.md'), summaryMarkdown(manifest))

  return manifest
}
