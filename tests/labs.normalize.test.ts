import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeLabs } from '../src/normalize/labs.js'

describe('normalizeLabs', () => {
  it('joins list + rapports + results per id (camelCase list shape)', async () => {
    const list = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/list.json'), 'utf8'))
    const rapports = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/rapports.json'), 'utf8'))
    const results = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/results.json'), 'utf8'))
    const result = normalizeLabs({
      list,
      rapports: { '1234567890': rapports },
      results: { '1234567890': results },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('1234567890')
    expect(result[0]?.noReq).toBe('1234567890')
    expect(result[0]?.date).toBe('2024-10-15')
    expect(result[0]?.prescriber).toBe('JOHN SMITH')
    expect(result[0]?.analyses).toHaveLength(2)
    expect(result[0]?.analyses[0]?.label).toBe('Hémoglobine')
    expect(result[0]?.reports[0]?.id).toBe('RPT0001')
  })

  it('accepts statutRapport as a number (API sometimes returns integer status codes)', () => {
    const list = [
      {
        id: '9999',
        datePrelevement: '2024-03-01T08:00:00-05:00',
        statutRapport: 2,
        nomPrescripteur: 'DOE',
        prenomPrescripteur: 'JANE',
      },
    ]

    expect(() => normalizeLabs({ list, rapports: {}, results: {} })).not.toThrow()
    const result = normalizeLabs({ list, rapports: {}, results: {} })

    expect(result).toHaveLength(1)
    expect(result[0]?.date).toBe('2024-03-01')
  })
})
