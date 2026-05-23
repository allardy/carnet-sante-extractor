import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeProfile, type ProfileRaw } from '../src/normalize/profile.js'

const fixtureDir = resolve(__dirname, 'fixtures/profile')

const loadFixture = async (name: string): Promise<unknown> => {
  const text = await readFile(resolve(fixtureDir, `${name}.json`), 'utf8')

  return JSON.parse(text)
}

describe('normalizeProfile', () => {
  it('flattens the assembled raw into a CleanProfile', async () => {
    const raw: ProfileRaw = {
      citoyen: await loadFixture('citoyen'),
      coordonnees: await loadFixture('coordonnees'),
      carte: await loadFixture('carte'),
      email: await loadFixture('email'),
      phone: await loadFixture('phone'),
      medecin: await loadFixture('medecin'),
    }
    const result = normalizeProfile(raw)

    expect(result.citizenId).toBe('99999')
    expect(result.fullName).toBe('JANE DOE')
    expect(result.birthDate).toBe('1980-01-01')
    expect(result.sex).toBe('Femme')
    expect(result.cardNumber).toBe('DOEJ12345678')
    expect(result.cardExpires).toBe('2030-12-31')
    expect(result.email).toBe('jane.doe@example.invalid')
    expect(result.phone).toBe('555-0100')
    expect(result.address).toBe('123 Test Street, Montreal, QC, H0H 0H0')
    expect(result.familyDoctor).toBe('JOHN SMITH')
  })

  it('handles missing optional sections without throwing', async () => {
    const raw: ProfileRaw = { citoyen: await loadFixture('citoyen') }
    const result = normalizeProfile(raw)

    expect(result.citizenId).toBe('99999')
    expect(result.cardNumber).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.familyDoctor).toBeUndefined()
  })
})
