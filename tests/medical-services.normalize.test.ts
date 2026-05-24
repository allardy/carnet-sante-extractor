import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMedicalServices } from '../src/normalize/medical-services.js'

describe('normalizeMedicalServices', () => {
  it('flattens to CleanService[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/medical-services/list.json'), 'utf8'))
    const result = normalizeMedicalServices(raw)

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('2099-01-15-0')
    expect(result[0]?.date).toBe('2099-01-15')
    expect(result[0]?.facility).toBe('CLINIQUE EXEMPLE (TEST)')
    expect(result[0]?.practitioner).toBe('MARIE TREMBLAY')
    expect(result[0]?.amountPaid).toBe(46.6)
    expect(result[0]?.description).toBe('Visite, examen ou consultation')
  })

  it('handles empty array', () => {
    expect(normalizeMedicalServices([])).toEqual([])
  })
})
