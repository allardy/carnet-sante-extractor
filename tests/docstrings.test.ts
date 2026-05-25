import { describe, expect, it } from 'vitest'

import { docStrings } from '../src/shared/i18n.js'

describe('docStrings', () => {
  it('has fr and en with the same keys', () => {
    expect(Object.keys(docStrings.fr).sort()).toEqual(Object.keys(docStrings.en).sort())
  })

  it('localizes a few representative labels', () => {
    expect(docStrings.fr.prescriber).toBe('Prescripteur')
    expect(docStrings.en.prescriber).toBe('Prescriber')
    expect(docStrings.fr.none).toBe('Aucun.')
    expect(docStrings.fr.entryCount(1)).toBe('1 élément')
    expect(docStrings.en.entryCount(3)).toBe('3 items')
  })
})
