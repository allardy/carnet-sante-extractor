import { describe, expect, it } from 'vitest'

import {
  accessMarkdown,
  heading,
  medicationsMarkdown,
  profileMarkdown,
  toMarkdownTable,
} from '../src/normalize/markdown.js'
import { type CleanAccess, type CleanMedication, type CleanProfile } from '../src/normalize/schemas.js'
import { sectionFileLinks } from '../src/output/sections.js'

const fr = { locale: 'fr' as const, links: sectionFileLinks }
const en = { locale: 'en' as const, links: sectionFileLinks }

describe('markdown helpers', () => {
  it('heading renders the right number of hashes', () => {
    expect(heading(2, 'Labs')).toBe('## Labs\n')
  })

  it('toMarkdownTable renders header, separator, and rows', () => {
    expect(toMarkdownTable(['Test', 'Value'], [['HbA1c', '5.4']])).toBe(
      '| Test | Value |\n| --- | --- |\n| HbA1c | 5.4 |',
    )
  })
})

describe('profileMarkdown', () => {
  const profile: CleanProfile = {
    citizenId: '99999',
    fullName: 'JANE DOE',
    birthDate: '1980-01-01',
    sex: 'Femme',
  }

  it('uses localized section name + labels (fr)', () => {
    const out = profileMarkdown(profile, fr)

    expect(out).toContain('# Profil')
    expect(out).toContain('**Nom :** JANE DOE')
    expect(out).toContain('[JSON](../donnees/profil.json)')
  })

  it('uses localized section name + labels (en)', () => {
    const out = profileMarkdown(profile, en)

    expect(out).toContain('# Profile')
    expect(out).toContain('**Name:** JANE DOE')
  })
})

describe('medicationsMarkdown', () => {
  const meds: CleanMedication[] = [
    {
      id: '1',
      drugName: 'ATORVASTATINE 20 MG',
      din: '02288999',
      posology: '1 co die',
      prescriber: 'TREMBLAY',
      pharmacy: 'PHARMA X',
      prescribedAt: '2024-02-01',
      durationDays: 90,
      refillsAuthorized: 3,
      refillsRemaining: 2,
      klass: '',
    },
  ]

  it('localizes the active/labels block (fr)', () => {
    const out = medicationsMarkdown(meds, [], fr)

    expect(out).toContain('# Médicaments')
    expect(out).toContain('## Actifs (renouvellements restants)')
    expect(out).toContain('- **Prescripteur :** TREMBLAY')
  })

  it('empty input renders the localized none message', () => {
    expect(medicationsMarkdown([], [], fr)).toBe('# Médicaments\n\n_Aucun._\n')
  })

  it('renders a degraded entry without blank bullets or an empty heading', () => {
    const degraded: CleanMedication[] = [
      {
        id: 'BARE',
        drugName: '',
        din: '',
        posology: '',
        prescriber: '',
        pharmacy: '',
        prescribedAt: '',
        durationDays: null,
        refillsAuthorized: null,
        refillsRemaining: null,
        klass: '',
      },
    ]
    const out = medicationsMarkdown(degraded, [], en)

    expect(out).toContain('### Medication (details unavailable)')
    expect(out).not.toContain('### \n')
    expect(out).not.toContain('**Prescriber:** \n')
    expect(out).not.toContain('undefined')
    expect(out).not.toContain('N/A/N/A')
  })
})

describe('accessMarkdown', () => {
  const access: CleanAccess[] = [
    {
      date: '2099-03-10',
      time: '09:15:00',
      person: 'Alpha TEST-NOM',
      role: 'Médecin',
      providerId: 'a@T',
      domains: ['Medicament'],
    },
    {
      date: '2099-07-22',
      time: '14:00:00',
      person: 'Alpha TEST-NOM',
      role: 'Médecin',
      providerId: 'a@T',
      domains: ['Medicament', 'Prelevement', 'Imagerie'],
    },
  ]

  it('leads with a per-person table (en domain labels)', () => {
    const out = accessMarkdown(access, [], en)

    expect(out).toContain('## Who accessed your record')
    expect(out).toContain('| Alpha TEST-NOM | Médecin | 2 | 2099-03-10 | 2099-07-22 |')
    expect(out).toContain('Medications, Labs, Imaging')
  })

  it('handles empty input (fr)', () => {
    expect(accessMarkdown([], [], fr)).toBe('# Intervenants ayant consulté votre dossier\n\n_Aucun._\n')
  })
})
