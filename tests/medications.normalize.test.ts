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

  it('keeps a medication that omits DernierService and Services entirely', () => {
    const result = normalizeMedications([
      {
        Type: 'OrdonnanceAvecService',
        Id: 'NOSVC',
        IdOrdonnance: 'NOSVC',
        Date: '2026-03-01T00:00:00-05:00',
        Duree: 30,
        NomPrescripteur: 'ROY',
        PrenomPrescripteur: 'LUC',
        Pharmacie: 'PHARMA',
        NombreDelivrancesAutorisees: 1,
        NombreDelivrancesRestantes: 1,
        MedicamentPrescrit: {
          DIN: '00000009',
          Nom: 'DRUG NINE',
          NomAnglais: 'DRUG NINE',
          LibelleClasse: 'klass',
          LibelleClasseAnglais: 'klass',
          Posologies: [{ Description: 'once daily' }],
        },
        // no DernierService, no Services keys at all
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.drugName).toBe('DRUG NINE')
    expect(result[0]?.lastDispensedAt).toBeUndefined()
  })

  it('keeps the whole list when one entry is missing nearly every field', () => {
    const result = normalizeMedications([
      {
        Type: 'OrdonnanceAvecService',
        Id: 'GOOD',
        IdOrdonnance: 'GOOD',
        Date: '2026-03-01T00:00:00-05:00',
        Duree: 30,
        NomPrescripteur: 'ROY',
        PrenomPrescripteur: 'LUC',
        Pharmacie: 'PHARMA',
        NombreDelivrancesAutorisees: 1,
        NombreDelivrancesRestantes: 1,
        MedicamentPrescrit: {
          DIN: '00000009',
          Nom: 'DRUG NINE',
          NomAnglais: 'DRUG NINE',
          LibelleClasse: 'klass',
          LibelleClasseAnglais: 'klass',
          Posologies: [{ Description: 'once daily' }],
        },
        DernierService: null,
        Services: null,
      },
      // Degraded entry: server returned only Type + Id (seen in the wild on another user's record)
      { Type: 'OrdonnanceSansService', Id: 'BARE' },
    ])

    expect(result).toHaveLength(2)
    expect(result[1]?.id).toBe('BARE')
    expect(result[1]?.drugName).toBe('')
    expect(result[1]?.prescriber).toBe('')
    expect(result[1]?.durationDays).toBeNull()
    expect(result[1]?.refillsRemaining).toBeNull()
  })

  it('throws only when the payload is not a medications array', () => {
    expect(() => normalizeMedications({ not: 'an array' })).toThrow()
  })
})
