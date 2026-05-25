import { describe, expect, it } from 'vitest'

import { dossierHtml, type DossierSection } from '../src/output/dossier.js'
import { emptyManifest, type Manifest } from '../src/output/manifest.js'
import { sectionFor } from '../src/output/sections.js'
import { type Locale } from '../src/shared/i18n.js'

const sections: DossierSection[] = [
  {
    def: sectionFor('profile'),
    body: '# Profil\n\n**Nom :** JANE DOE\n\n---\n\n[← LISEZ-MOI](LISEZ-MOI.md) · [JSON](donnees/profil.json)\n',
  },
  { def: sectionFor('medications'), body: '# Médicaments\n\n_Aucun._\n' },
]

const build = (locale: Locale): string => {
  const m: Manifest = emptyManifest()

  m.locale = locale
  m.profile = { citizenId: '99999', fullName: 'JANE DOE', birthDate: '1980-01-01', sex: 'Femme' }
  m.domains = { profile: { count: 1, errors: [] }, medications: { count: 0, errors: [] } }

  return dossierHtml(sections, m)
}

describe('dossierHtml', () => {
  it('produces one self-contained HTML page with every section inline', () => {
    const html = build('fr')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('lang="fr"')
    expect(html).toContain('Dossier de santé complet')
    expect(html).toContain('id="profil"')
    expect(html).toContain('id="medicaments"')
    expect(html).toContain('JANE DOE')
    expect(html).toContain('<style>')
    expect(html).toContain('<script>')
  })

  it('ships search + in-page nav and embeds no external assets', () => {
    const html = build('fr')

    expect(html).toContain('id="q"') // search box
    expect(html).toContain('href="#profil"') // TOC / sidebar jump
    expect(html).not.toContain('<script src')
    expect(html).not.toContain('<link rel')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('strips the per-section H1 and the back-to-readme footer (no md back-links on a single page)', () => {
    const html = build('fr')

    expect(html).not.toContain('LISEZ-MOI.md')
    // The H1 "# Profil" is dropped from the body; the section title lives in the accordion summary.
    expect(html).not.toContain('<h1>Profil</h1>')
  })

  it('localizes the chrome (en)', () => {
    const html = build('en')

    expect(html).toContain('lang="en"')
    expect(html).toContain('Complete health record')
  })
})
