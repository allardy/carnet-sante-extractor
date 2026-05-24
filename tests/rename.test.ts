import { describe, expect, it } from 'vitest'

import { renameDocument } from '../src/output/rename.js'

describe('renameDocument', () => {
  it('builds <type>/SLUG_DATE.pdf from descriptor', () => {
    const taken = new Set<string>()
    const out = renameDocument(
      { id: 'abc', url: 'x', title: 'Radiographie thorax', type: 'imagerie', date: '2024-06-15' },
      taken,
    )

    expect(out).toBe('imagerie/RADIOGRAPHIE_THORAX_2024-06-15.pdf')
    expect(taken.has(out)).toBe(true)
  })

  it('strips diacritics + collapses non-alphanum', () => {
    const out = renameDocument(
      { id: 'a', url: '', title: 'Échographie pré-natale', type: 'imagerie', date: '2024-01-01' },
      new Set(),
    )

    expect(out).toBe('imagerie/ECHOGRAPHIE_PRE_NATALE_2024-01-01.pdf')
  })

  it('disambiguates collisions by appending id suffix', () => {
    const taken = new Set<string>()
    const first = renameDocument({ id: 'AAAAAA111111', url: '', title: 'X', type: 't', date: '2024-01-01' }, taken)
    const second = renameDocument({ id: 'BBBBBB222222', url: '', title: 'X', type: 't', date: '2024-01-01' }, taken)

    expect(first).toBe('t/X_2024-01-01.pdf')
    expect(second).toBe('t/X_2024-01-01_222222.pdf')
  })
})
