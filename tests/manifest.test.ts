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
  it('round-trips through disk', async () => {
    await mkdir(dir, { recursive: true })
    const path = resolve(dir, 'manifest.json')
    const m = emptyManifest()

    m.documents.push({ id: 'd1', url: 'u', outputPath: 'p', sha256: 's1', bytes: 100, capturedAt: '2026-05-23' })
    await saveManifest(path, m)
    const reloaded = await loadManifest(path)

    expect(reloaded.documents).toHaveLength(1)
    expect(docInManifest(reloaded, 'd1', 's1')).toBeDefined()
    expect(docInManifest(reloaded, 'd1', 'different-sha')).toBeUndefined()
  })

  it('returns an empty manifest when the file does not exist', async () => {
    const m = await loadManifest(resolve(dir, 'missing.json'))

    expect(m.documents).toEqual([])
  })
})
