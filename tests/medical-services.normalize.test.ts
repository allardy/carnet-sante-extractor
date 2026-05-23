import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeMedicalServices } from '../src/normalize/medical-services.js'

describe('normalizeMedicalServices', () => {
  it('flattens to CleanService[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/medical-services/list.json'), 'utf8'))
    const result = normalizeMedicalServices(raw)

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('SVC0001')
    expect(result[0]?.date).toBe('2026-04-10')
    expect(result[0]?.facility).toBe('Clinique Example')
  })

  it('handles empty array', () => {
    expect(normalizeMedicalServices([])).toEqual([])
  })
})
