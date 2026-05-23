import { describe, expect, it } from 'vitest'

import { documentFileName } from '../src/output/rename.js'

describe('documentFileName', () => {
  it('builds TYPE_DATE.pdf from descriptor metadata', () => {
    expect(documentFileName({ id: '1', url: 'x', title: 'Bilan', type: 'Laboratoire', date: '2026-01-15' })).toBe(
      'LABORATOIRE_2026-01-15.pdf',
    )
  })

  it('strips accents and normalizes separators', () => {
    expect(documentFileName({ id: '2', url: 'x', title: 't', type: 'Imagerie médicale', date: '2025-12-01' })).toBe(
      'IMAGERIE_MEDICALE_2025-12-01.pdf',
    )
  })

  it('falls back to DOCUMENT and undated when type/date are missing', () => {
    expect(documentFileName({ id: '3', url: 'x', title: 't', type: '' })).toBe('DOCUMENT_undated.pdf')
  })
})
