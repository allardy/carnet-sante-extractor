import { describe, expect, it } from 'vitest'

import { emptyManifest, isDownloaded, type Manifest } from '../src/output/manifest.js'

describe('manifest', () => {
  it('emptyManifest has no documents or errors', () => {
    const manifest = emptyManifest()

    expect(Object.keys(manifest.documents)).toHaveLength(0)
    expect(manifest.errors).toHaveLength(0)
  })

  it('isDownloaded reflects presence of an id', () => {
    const manifest: Manifest = {
      updatedAt: '2026-05-23T00:00:00.000Z',
      documents: {
        'doc-1': {
          id: 'doc-1',
          domain: 'labs',
          url: 'x',
          path: 'p',
          sha256: 'abc',
          bytes: 10,
          downloadedAt: '2026-05-23T00:00:00.000Z',
        },
      },
      errors: [],
    }

    expect(isDownloaded(manifest, 'doc-1')).toBe(true)
    expect(isDownloaded(manifest, 'doc-2')).toBe(false)
  })
})
