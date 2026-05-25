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
import { type CleanProfile } from '../normalize/schemas.js'
import { docStrings, type Locale } from '../shared/i18n.js'
import { ensureDir, sha256, writeJson, writeText } from '../util/fs.js'

import { type DossierSection, dossierHtml } from './dossier.js'
import { type Manifest, type ManifestEntry, saveManifest } from './manifest.js'
import { readmeMarkdown } from './readme.js'
import { renameDocument } from './rename.js'
import { allSections, type RenderCtx, runRootLinks, type SectionKey, sectionFileLinks } from './sections.js'

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

type SectionSpec = {
  key: SectionKey
  raw: () => unknown
  normalize: (raw: unknown) => unknown
  markdown: (clean: never, docs: DocLink[], ctx: RenderCtx) => string
  count: (clean: never) => number
}

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

export const writeOutput = async (
  raw: OrchestratorOutput,
  runDir: string,
  locale: Locale,
  logger?: Logger,
): Promise<Manifest> => {
  const docsDir = resolve(runDir, 'documents')
  const dataDir = resolve(runDir, 'donnees')

  await Promise.all([ensureDir(docsDir), ensureDir(dataDir)])

  // 1. Copy PDFs first so docLinks is available to the section markdown generators.
  const taken = new Set<string>()
  const entries: ManifestEntry[] = []
  const files: string[] = []

  for (const dDoc of raw.documents) {
    const relToDocuments = renameDocument(dDoc.descriptor, taken) // e.g. 'pdf/imagerie/2024_X.pdf'
    const runRelPath = `documents/${relToDocuments}`
    const dest = resolve(docsDir, relToDocuments)

    try {
      await ensureDir(resolve(dest, '..'))
      await copyFile(dDoc.localPath, dest)
      const buf = await readFile(dest)

      entries.push({
        id: dDoc.descriptor.id,
        url: dDoc.descriptor.url,
        outputPath: runRelPath,
        sha256: sha256(buf),
        bytes: buf.length,
        capturedAt: dDoc.descriptor.date ?? '',
      })
      files.push(runRelPath)
      logger?.log({ phase: 'output', status: 'ok', message: runRelPath, bytes: buf.length })
    } catch (err) {
      logger?.log({
        phase: 'output',
        status: 'error',
        message: `copy ${dDoc.descriptor.id}`,
        error: (err as Error).message,
      })
    }
  }

  // docLinks for the standalone section files (in documents/) carry the documents-relative path.
  const docLinks: DocLink[] = entries.map((e) => ({
    date: e.capturedAt,
    outputPath: e.outputPath.replace(/^documents\//, ''),
  }))

  const specs: SectionSpec[] = [
    {
      key: 'profile',
      raw: () => raw.profile,
      normalize: (r) => normalizeProfile(r as ProfileRaw),
      markdown: (c, _d, ctx) => profileMarkdown(c as CleanProfile, ctx),
      count: () => 1,
    },
    {
      key: 'medications',
      raw: () => raw.medications,
      normalize: (r) => normalizeMedications(r),
      markdown: (c, d, ctx) => medicationsMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
    {
      key: 'appointments',
      raw: () => raw.appointments,
      normalize: (r) => normalizeAppointments(r),
      markdown: (c, d, ctx) => appointmentsMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
    {
      key: 'imaging',
      raw: () => raw.imaging,
      normalize: (r) => {
        const i = r as { list: unknown; details: Record<string, unknown> } | null

        return normalizeImaging(i?.list ?? [], i?.details ?? {})
      },
      markdown: (c, d, ctx) => imagingMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
    {
      key: 'labs',
      raw: () => raw.labs,
      normalize: (r) => {
        const l = r as { list: unknown; rapports: Record<string, unknown>; results: Record<string, unknown> } | null

        return normalizeLabs({ list: l?.list ?? [], rapports: l?.rapports ?? {}, results: l?.results ?? {} })
      },
      markdown: (c, d, ctx) => labsMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
    {
      key: 'medical-services',
      raw: () => raw.medicalServices,
      normalize: (r) => normalizeMedicalServices(r),
      markdown: (c, d, ctx) => medicalServicesMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
    {
      key: 'access',
      raw: () => raw.access,
      normalize: (r) => normalizeAccess(r),
      markdown: (c, d, ctx) => accessMarkdown(c, d, ctx),
      count: (c) => (c as unknown[]).length,
    },
  ]

  const fileCtx: RenderCtx = { locale, links: sectionFileLinks }
  const rootCtx: RenderCtx = { locale, links: runRootLinks }
  const domains: Manifest['domains'] = {}
  let profileOut: CleanProfile | null = null
  const bodiesForDossier: DossierSection[] = []
  const sectionByKey = new Map(allSections().map((s) => [s.key, s]))

  for (const spec of specs) {
    const def = sectionByKey.get(spec.key)!
    const slug = def.slug
    const n = await tryStep(logger, spec.key, 'normalize', () => spec.normalize(spec.raw()))

    if (!n.ok) {
      domains[spec.key] = { count: 0, errors: [n.error] }
      // Fallback: always leave a usable JSON blob even when the best-guess schema misses.
      await tryStep(logger, spec.key, `write donnees/${slug}.json (raw fallback)`, () =>
        writeJson(resolve(dataDir, `${slug}.json`), spec.raw()),
      )
      files.push(`donnees/${slug}.json`)
      // Still show the section in the dossier so nothing silently goes missing.
      bodiesForDossier.push({ def, body: `_${docStrings[locale].sectionError}_\n` })
      continue
    }

    const clean = n.value as never

    if (spec.key === 'profile') {
      profileOut = clean as CleanProfile
    }

    await tryStep(logger, spec.key, `write donnees/${slug}.json`, () =>
      writeJson(resolve(dataDir, `${slug}.json`), clean),
    )

    // Per-section Markdown is for LLMs + file browsing; the human-readable HTML is the single dossier.
    await tryStep(logger, spec.key, `write documents/${def.order}-${slug}.md`, () =>
      writeText(resolve(docsDir, `${def.order}-${slug}.md`), spec.markdown(clean, docLinks, fileCtx)),
    )

    files.push(`donnees/${slug}.json`, `documents/${def.order}-${slug}.md`)
    domains[spec.key] = { count: spec.count(clean), errors: [] }
    // The dossier sits at the run root, so its section bodies use run-root-relative asset links.
    bodiesForDossier.push({ def, body: spec.markdown(clean, docLinks, rootCtx) })
  }

  // Machine index first — both the dossier and the README read their counts from the manifest.
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    locale,
    profile: profileOut,
    domains,
    documents: entries,
    files: [...files, 'dossier-complet.html', 'LISEZ-MOI.md', 'donnees/index.json'],
  }

  await saveManifest(resolve(dataDir, 'index.json'), manifest)

  // The single, self-contained, human-facing HTML record.
  await writeText(resolve(runDir, 'dossier-complet.html'), dossierHtml(bodiesForDossier, manifest))

  // Markdown index (for humans browsing files + for LLMs).
  await writeText(resolve(runDir, 'LISEZ-MOI.md'), readmeMarkdown(manifest, locale))

  return manifest
}
