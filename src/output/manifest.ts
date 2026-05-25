import { type CleanProfile } from '../normalize/schemas.js'
import { type Locale } from '../shared/i18n.js'
import { fileExists, readJson, writeJson } from '../util/fs.js'

export type ManifestEntry = {
  id: string
  url: string
  outputPath: string
  sha256: string
  bytes: number
  capturedAt: string
}

export type Manifest = {
  generatedAt: string
  locale: Locale
  profile: CleanProfile | null
  domains: Record<string, { count: number; errors: string[] }>
  documents: ManifestEntry[]
  files: string[]
}

export const emptyManifest = (): Manifest => ({
  generatedAt: new Date().toISOString(),
  locale: 'fr',
  profile: null,
  domains: {},
  documents: [],
  files: [],
})

export const loadManifest = async (path: string): Promise<Manifest> => {
  if (!(await fileExists(path))) {
    return emptyManifest()
  }

  return readJson<Manifest>(path)
}

export const saveManifest = async (path: string, m: Manifest): Promise<void> => {
  await writeJson(path, m)
}

export const docInManifest = (m: Manifest, id: string, sha256: string): ManifestEntry | undefined =>
  m.documents.find((e) => e.id === id && e.sha256 === sha256)
