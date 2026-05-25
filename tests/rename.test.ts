import { describe, expect, it } from 'vitest'

import { renameDocument } from '../src/output/rename.js'

describe('renameDocument', () => {
  it('builds pdf/<type>/DATE_SLUG.pdf from descriptor', () => {
    const taken = new Set<string>()
    const out = renameDocument(
      { id: 'abc', url: 'x', title: 'Radiographie thorax', type: 'imagerie', date: '2024-06-15' },
      taken,
    )

    expect(out).toBe('pdf/imagerie/2024-06-15_RADIOGRAPHIE_THORAX.pdf')
    expect(taken.has(out)).toBe(true)
  })

  it('strips diacritics + collapses non-alphanum', () => {
    const out = renameDocument(
      { id: 'a', url: '', title: 'Échographie pré-natale', type: 'imagerie', date: '2024-01-01' },
      new Set(),
    )

    expect(out).toBe('pdf/imagerie/2024-01-01_ECHOGRAPHIE_PRE_NATALE.pdf')
  })

  it('places labs under pdf/prelevements/', () => {
    const out = renameDocument(
      { id: 'p1', url: '', title: 'Prelevement', type: 'prelevements', date: '2023-11-02' },
      new Set(),
    )

    expect(out).toBe('pdf/prelevements/2023-11-02_PRELEVEMENT.pdf')
  })

  it('disambiguates collisions with sequential _2, _3 suffixes', () => {
    const taken = new Set<string>()
    const first = renameDocument({ id: 'A', url: '', title: 'X', type: 'imagerie', date: '2024-01-01' }, taken)
    const second = renameDocument({ id: 'B', url: '', title: 'X', type: 'imagerie', date: '2024-01-01' }, taken)
    const third = renameDocument({ id: 'C', url: '', title: 'X', type: 'imagerie', date: '2024-01-01' }, taken)

    expect(first).toBe('pdf/imagerie/2024-01-01_X.pdf')
    expect(second).toBe('pdf/imagerie/2024-01-01_X_2.pdf')
    expect(third).toBe('pdf/imagerie/2024-01-01_X_3.pdf')
  })
})
