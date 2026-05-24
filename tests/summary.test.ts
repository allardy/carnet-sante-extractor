import { describe, expect, it } from 'vitest'

import { emptyManifest } from '../src/output/manifest.js'
import { summaryMarkdown } from '../src/output/summary.js'

describe('summaryMarkdown', () => {
  it('renders counts + docs from a manifest', () => {
    const m = emptyManifest()

    m.profile = {
      citizenId: '99999',
      fullName: 'JANE DOE',
      birthDate: '1980-01-01',
      sex: 'Femme',
    }
    m.domains = {
      medications: { count: 5, errors: [] },
      labs: { count: 3, errors: ['one failed'] },
    }
    m.documents = [
      {
        id: '1',
        url: 'u',
        outputPath: 'documents/imagerie/A_2024.pdf',
        sha256: 's',
        bytes: 12345,
        capturedAt: '2024-01-01',
      },
    ]
    const out = summaryMarkdown(m)

    expect(out).toContain('JANE DOE')
    expect(out).toContain('**medications:** 5')
    expect(out).toContain('**labs:** 3 (1 errors)')
    expect(out).toContain('1 PDF(s) downloaded')
    expect(out).toContain('documents/imagerie/A_2024.pdf')
  })
})
