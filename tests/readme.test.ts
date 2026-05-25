import { describe, expect, it } from 'vitest'

import { emptyManifest } from '../src/output/manifest.js'
import { readmeMarkdown } from '../src/output/readme.js'

describe('readmeMarkdown', () => {
  it('lists sections with counts + links to the markdown files (fr)', () => {
    const m = emptyManifest()

    m.profile = { citizenId: '99999', fullName: 'JANE DOE', birthDate: '1980-01-01', sex: 'Femme' }
    m.domains = { medications: { count: 5, errors: [] }, labs: { count: 3, errors: ['x'] } }
    m.documents = [
      {
        id: '1',
        url: 'u',
        outputPath: 'documents/pdf/imagerie/a.pdf',
        sha256: 's',
        bytes: 12345,
        capturedAt: '2024-01-01',
      },
    ]

    const out = readmeMarkdown(m, 'fr')

    expect(out).toContain('JANE DOE')
    expect(out).toContain('Contenu de ce dossier')
    expect(out).toContain('[Médicaments](documents/2-medicaments.md)')
    expect(out).toContain('Médicaments](documents/2-medicaments.md) | 5 |')
    expect(out).toContain('](dossier-complet.html)')
    expect(out).toContain('1 PDF téléchargé.')
  })
})
