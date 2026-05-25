import { describe, expect, it } from 'vitest'

import { mdToHtml, renderMarkdown } from '../src/output/html.js'

describe('renderMarkdown', () => {
  it('returns an HTML fragment with no document shell', () => {
    const frag = renderMarkdown('# Hi\n\nsome text')

    expect(frag).toContain('<h1>Hi</h1>')
    expect(frag).not.toContain('<!doctype')
    expect(frag).not.toContain('<html')
  })

  it('preserves relative links', () => {
    expect(renderMarkdown('[r](pdf/imagerie/x.pdf)')).toContain('href="pdf/imagerie/x.pdf"')
  })
})

describe('mdToHtml', () => {
  it('renders markdown into a self-contained HTML document', () => {
    const html = mdToHtml('# Profil\n\nBonjour', { title: 'Profil', lang: 'fr' })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('lang="fr"')
    expect(html).toContain('<title>Profil</title>')
    expect(html).toContain('<h1>Profil</h1>')
    expect(html).toContain('<style>')
  })

  it('preserves relative links and embeds no external assets', () => {
    const html = mdToHtml('[rapport](pdf/imagerie/x.pdf)', { title: 't', lang: 'en' })

    expect(html).toContain('href="pdf/imagerie/x.pdf"')
    expect(html).not.toContain('<script src')
    expect(html).not.toContain('<link rel')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('passes through raw anchor HTML (used by dossier-complet)', () => {
    const html = mdToHtml('<a id="profil"></a>\n\n# Profil', { title: 't', lang: 'fr' })

    expect(html).toContain('<a id="profil">')
  })
})
