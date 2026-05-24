import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeAccess } from '../src/normalize/access.js'

describe('normalizeAccess', () => {
  it('maps each access-log entry to CleanAccess', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/access/list.json'), 'utf8'))
    const result = normalizeAccess(raw)

    expect(result).toHaveLength(3)
    expect(result[0]?.date).toBe('2099-03-10')
    expect(result[0]?.time).toBe('09:15:00')
    expect(result[0]?.person).toBe('Alpha TEST-NOM')
    expect(result[0]?.role).toBe('Médecin')
    expect(result[0]?.roleEn).toBe('Physician')
    expect(result[0]?.providerId).toBe('alte0001@TEST.EXAMPLE')
    expect(result[0]?.domains).toEqual(['Medicament'])
    expect(result[1]?.domains).toEqual(['Medicament', 'Prelevement', 'Imagerie'])
  })

  it('handles empty array', () => {
    expect(normalizeAccess([])).toEqual([])
  })

  it('tolerates a missing access period and missing domaines', () => {
    const result = normalizeAccess([{ intervenant: { nom: 'X', prenom: 'Y', role: 'Médecin' } }])

    expect(result).toHaveLength(1)
    expect(result[0]?.date).toBe('')
    expect(result[0]?.time).toBe('')
    expect(result[0]?.domains).toEqual([])
  })

  it('tolerates a null roleAnglais (seen on real entries)', () => {
    const result = normalizeAccess([
      {
        periodeAcces: { dateDebut: '2099-01-01T08:00:00.000000', dateFin: '2099-01-01T08:00:00.000000' },
        domaines: ['Medicament'],
        intervenant: { nom: 'X', prenom: 'Y', role: 'Médecin', roleAnglais: null, id: 'xy@TEST' },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.roleEn).toBeUndefined()
    expect(result[0]?.role).toBe('Médecin')
  })
})
