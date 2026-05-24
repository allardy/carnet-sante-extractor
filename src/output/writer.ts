import { copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type DocumentDescriptor } from '../collectors/types.js'
import { type Logger } from '../main/logger.js'
import { normalizeAccess } from '../normalize/access.js'
import { normalizeAppointments } from '../normalize/appointments.js'
import { normalizeImaging } from '../normalize/imaging.js'
import { normalizeLabs } from '../normalize/labs.js'
import {
  accessMarkdown,
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
  profile: unknown
  medications: unknown
  appointments: unknown
  medicalServices: unknown
  imaging: unknown
  labs: unknown
  access: unknown
  documents: { descriptor: DocumentDescriptor; localPath: string }[]
}

type DocLink = { date: string; outputPath: string }

// Per-domain failures during normalize/markdown are non-fatal: log them, record the error
// against the manifest's domain block, and keep going so the user still gets every other
// domain's clean output. The raw data is already on disk regardless.
const tryStep = async <T>(
  logger: Logger | undefined,
  domain: string,
  step: string,
  fn: () => Promise<T> | T,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
  try {
    const value = await fn()

    logger?.log({ phase: 'output', domain, status: 'ok', message: step })

    return { ok: true, value }
  } catch (err) {
    const error = (err as Error).message

    logger?.log({ phase: 'output', domain, status: 'error', message: step, error })

    return { ok: false, error }
  }
}

export const writeOutput = async (raw: OrchestratorOutput, outputDir: string, logger?: Logger): Promise<Manifest> => {
  const dataDir = resolve(outputDir, 'data')
  const mdDir = resolve(outputDir, 'markdown')
  const docsDir = resolve(outputDir, 'documents')

  await Promise.all([ensureDir(dataDir), ensureDir(mdDir), ensureDir(docsDir)])

  const domains: Manifest['domains'] = {}
  let profileOut: ReturnType<typeof normalizeProfile> | null = null

  // Copy PDFs and build manifest entries FIRST so docLinks is available for markdown generators
  const taken = new Set<string>()
  const entries: ManifestEntry[] = []

  for (const d of raw.documents) {
    const outputPath = renameDocument(d.descriptor, taken)
    const dest = resolve(docsDir, outputPath)

    try {
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
      logger?.log({ phase: 'output', status: 'ok', message: `documents/${outputPath}`, bytes: buf.length })
    } catch (err) {
      logger?.log({
        phase: 'output',
        status: 'error',
        message: `copy ${d.descriptor.id}`,
        error: (err as Error).message,
      })
    }
  }

  // Build the doc-link index from copied entries (date comes from the descriptor's date field)
  const docLinks: DocLink[] = entries.map((e) => ({ date: e.capturedAt, outputPath: e.outputPath }))

  const writePair = async (
    domain: string,
    file: string,
    rawPayload: unknown,
    normalize: () => unknown,
    markdown: (clean: never, docs: DocLink[]) => string,
    count: (clean: never) => number,
  ): Promise<void> => {
    const n = await tryStep(logger, domain, 'normalize', () => normalize())

    if (!n.ok) {
      domains[domain] = { count: 0, errors: [n.error] }
      // Fallback: write the raw payload so the user always has *something* in output/data/.
      // Better a usable raw blob than a missing file when the best-guess schema misses.
      await tryStep(logger, domain, `write data/${file}.json (raw fallback)`, () =>
        writeJson(resolve(dataDir, `${file}.json`), rawPayload),
      )

      return
    }

    const clean = n.value as never

    await tryStep(logger, domain, `write data/${file}.json`, () => writeJson(resolve(dataDir, `${file}.json`), clean))
    await tryStep(logger, domain, `write markdown/${file}.md`, () =>
      writeText(resolve(mdDir, `${file}.md`), markdown(clean, docLinks)),
    )

    domains[domain] = { count: count(clean), errors: [] }
  }

  // Profile is special — needed for the manifest header. Track separately.
  const profileResult = await tryStep(logger, 'profile', 'normalize', () => normalizeProfile(raw.profile as ProfileRaw))

  if (profileResult.ok) {
    profileOut = profileResult.value
    await tryStep(logger, 'profile', 'write data/profile.json', () =>
      writeJson(resolve(dataDir, 'profile.json'), profileOut),
    )
    await tryStep(logger, 'profile', 'write markdown/profile.md', () =>
      writeText(resolve(mdDir, 'profile.md'), profileMarkdown(profileOut!)),
    )
    domains['profile'] = { count: 1, errors: [] }
  } else {
    domains['profile'] = { count: 0, errors: [profileResult.error] }
    await tryStep(logger, 'profile', 'write data/profile.json (raw fallback)', () =>
      writeJson(resolve(dataDir, 'profile.json'), raw.profile),
    )
  }

  await writePair(
    'medications',
    'medications',
    raw.medications,
    () => normalizeMedications(raw.medications),
    (c, docs) => medicationsMarkdown(c, docs),
    (c) => (c as unknown[]).length,
  )
  await writePair(
    'appointments',
    'appointments',
    raw.appointments,
    () => normalizeAppointments(raw.appointments),
    (c, docs) => appointmentsMarkdown(c, docs),
    (c) => (c as unknown[]).length,
  )
  await writePair(
    'medical-services',
    'medical-services',
    raw.medicalServices,
    () => normalizeMedicalServices(raw.medicalServices),
    (c, docs) => medicalServicesMarkdown(c, docs),
    (c) => (c as unknown[]).length,
  )
  await writePair(
    'imaging',
    'imaging',
    raw.imaging,
    () => {
      const i = raw.imaging as { list: unknown; details: Record<string, unknown> } | null

      return normalizeImaging(i?.list ?? [], i?.details ?? {})
    },
    (c, docs) => imagingMarkdown(c, docs),
    (c) => (c as unknown[]).length,
  )
  await writePair(
    'labs',
    'labs',
    raw.labs,
    () => {
      const l = raw.labs as {
        list: unknown
        rapports: Record<string, unknown>
        results: Record<string, unknown>
      } | null

      return normalizeLabs({ list: l?.list ?? [], rapports: l?.rapports ?? {}, results: l?.results ?? {} })
    },
    (c, docs) => labsMarkdown(c, docs),
    (c) => (c as unknown[]).length,
  )
  await writePair(
    'access',
    'access',
    raw.access,
    () => normalizeAccess(raw.access),
    (c) => accessMarkdown(c),
    (c) => (c as unknown[]).length,
  )

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    profile: profileOut,
    domains,
    documents: entries,
  }

  await saveManifest(resolve(outputDir, 'manifest.json'), manifest)
  await writeText(resolve(outputDir, 'summary.md'), summaryMarkdown(manifest))

  return manifest
}
