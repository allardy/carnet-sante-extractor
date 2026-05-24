import { describe, expect, it } from 'vitest'

import { accessMarkdown, heading, toMarkdownTable } from '../src/normalize/markdown.js'
import { type CleanAccess } from '../src/normalize/schemas.js'

describe('markdown', () => {
  it('heading renders the right number of hashes', () => {
    expect(heading(2, 'Labs')).toBe('## Labs\n')
  })

  it('toMarkdownTable renders header, separator, and rows', () => {
    expect(
      toMarkdownTable(
        ['Test', 'Value'],
        [
          ['HbA1c', '5.4'],
          ['LDL', '2.1'],
        ],
      ),
    ).toBe('| Test | Value |\n| --- | --- |\n| HbA1c | 5.4 |\n| LDL | 2.1 |')
  })

  it('toMarkdownTable renders just the header when there are no rows', () => {
    expect(toMarkdownTable(['Test', 'Value'], [])).toBe('| Test | Value |\n| --- | --- |')
  })
})

describe('accessMarkdown', () => {
  const access: CleanAccess[] = [
    {
      date: '2099-03-10',
      time: '09:15:00',
      person: 'Alpha TEST-NOM',
      role: 'Médecin',
      roleEn: 'Physician',
      providerId: 'alte0001@TEST.EXAMPLE',
      domains: ['Medicament'],
    },
    {
      date: '2099-07-22',
      time: '14:00:00',
      person: 'Alpha TEST-NOM',
      role: 'Médecin',
      roleEn: 'Physician',
      providerId: 'alte0001@TEST.EXAMPLE',
      domains: ['Medicament', 'Prelevement', 'Imagerie'],
    },
    {
      date: '2098-11-05',
      time: '11:30:00',
      person: 'Beta EXEMPLE',
      role: 'Pharmacien',
      roleEn: 'Pharmacist',
      providerId: 'beex0002@TEST.EXAMPLE',
      domains: ['Prelevement'],
    },
  ]

  it('leads with a per-person "who accessed" table', () => {
    const out = accessMarkdown(access)

    expect(out).toContain('## Who accessed your record')
    // Alpha appears once (aggregated): 2 accesses, first + last span the two dates.
    expect(out).toContain('| Alpha TEST-NOM | Médecin | 2 | 2099-03-10 | 2099-07-22 |')
    expect(out).toContain('| Beta EXEMPLE | Pharmacien | 1 | 2098-11-05 | 2098-11-05 |')
  })

  it('renders a chronological log grouped by year, newest first, with English domain labels', () => {
    const out = accessMarkdown(access)
    const log = out.slice(out.indexOf('## Access log'))

    expect(log.indexOf('### 2099')).toBeLessThan(log.indexOf('### 2098'))
    expect(log).toContain('- **2099-07-22 14:00:00** — Alpha TEST-NOM (Médecin) — Medications, Labs, Imaging')
    expect(log).toContain('- **2098-11-05 11:30:00** — Beta EXEMPLE (Pharmacien) — Labs')
  })

  it('handles empty input', () => {
    expect(accessMarkdown([])).toBe('# Folder access\n\n_None._\n')
  })
})
