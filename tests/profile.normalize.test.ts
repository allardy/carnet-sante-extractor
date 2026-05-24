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
  it('flattens the real API shape (object Adresse, NAM, Situation) into a CleanProfile', async () => {
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
    expect(result.address).toBe('1-123 rue Example, Montréal (Québec) H0H 0H0')
    // No assigned doctor — only an enrolment situation is surfaced.
    expect(result.familyDoctor).toBeUndefined()
    expect(result.familyDoctorStatus).toBe("Inscrit au guichet d'accès (aucun médecin assigné)")
  })

  it('stays tolerant of the legacy best-guess shape (string Adresse, Numero, named doctor)', () => {
    const result = normalizeProfile({
      citoyen: {
        IdCitoyen: '99999',
        Nom: 'DOE',
        Prenom: 'JANE',
        Sexe: 'Femme',
        DateNaissance: '1980-01-01T00:00:00',
        IndAdmissibiliteCarnetSante: true,
        EstAgeEntre14Et17Ans: false,
        PersonnesACharge: null,
      },
      coordonnees: { Adresse: '123 Test Street', Ville: 'Montreal', Province: 'QC', CodePostal: 'H0H 0H0' },
      carte: { Numero: 'DOEJ12345678', DateExpiration: '2030-12-31T00:00:00' },
      email: { Adresse: 'jane.doe@example.invalid' },
      phone: { Numero: '555-0100' },
      medecin: { ANomMedecinFamille: 'SMITH', APrenomMedecinFamille: 'JOHN' },
    })

    expect(result.cardNumber).toBe('DOEJ12345678')
    expect(result.cardExpires).toBe('2030-12-31')
    expect(result.address).toBe('123 Test Street, Montreal, QC, H0H 0H0')
    expect(result.familyDoctor).toBe('JOHN SMITH')
    expect(result.familyDoctorStatus).toBeUndefined()
  })

  it('handles missing optional sections without throwing', async () => {
    const raw: ProfileRaw = { citoyen: await loadFixture('citoyen') }
    const result = normalizeProfile(raw)

    expect(result.citizenId).toBe('99999')
    expect(result.cardNumber).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.familyDoctor).toBeUndefined()
    expect(result.familyDoctorStatus).toBeUndefined()
  })
})
