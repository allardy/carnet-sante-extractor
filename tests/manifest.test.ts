import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { docInManifest, emptyManifest, loadManifest, saveManifest } from '../src/output/manifest.js'

const dir = resolve(tmpdir(), `carnet-test-${process.pid}`)

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('manifest', () => {
  it('defaults locale to fr and files to []', () => {
    const m = emptyManifest()

    expect(m.locale).toBe('fr')
    expect(m.files).toEqual([])
  })

  it('round-trips locale, files, and documents through disk', async () => {
    await mkdir(dir, { recursive: true })
    const path = resolve(dir, 'index.json')
    const m = emptyManifest()

    m.locale = 'en'
    m.files = ['LISEZ-MOI.html', 'documents/1-profil.html']
    m.documents.push({
      id: 'd1',
      url: 'u',
      outputPath: 'documents/pdf/imagerie/x.pdf',
      sha256: 's1',
      bytes: 100,
      capturedAt: '2026-05-23',
    })
    await saveManifest(path, m)
    const reloaded = await loadManifest(path)

    expect(reloaded.locale).toBe('en')
    expect(reloaded.files).toContain('documents/1-profil.html')
    expect(docInManifest(reloaded, 'd1', 's1')).toBeDefined()
  })
})
