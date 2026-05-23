import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMedications } from '../src/normalize/medications.js'

describe('normalizeMedications', () => {
  it('flattens an OrdonnanceAvecService list into CleanMedication[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/medications/list.json'), 'utf8'))
    const result = normalizeMedications(raw)

    expect(result).toHaveLength(2)
    expect(result[0]?.id).toBe('TEST0001')
    expect(result[0]?.drugName).toBe('PLACEBO 10MG TABLET')
    expect(result[0]?.din).toBe('00000001')
    expect(result[0]?.posology).toBe('Take 1 tablet once daily')
    expect(result[0]?.prescriber).toBe('JOHN SMITH')
    expect(result[0]?.refillsRemaining).toBe(8)
    expect(result[0]?.lastDispensedAt).toBe('2026-05-01')
  })

  it('returns [] for an empty array', () => {
    expect(normalizeMedications([])).toEqual([])
  })

  it('throws on unexpected shape', () => {
    expect(() => normalizeMedications([{ bogus: true }])).toThrow()
  })
})
