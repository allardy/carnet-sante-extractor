import { docStrings, type Locale } from '../shared/i18n.js'

import { type Manifest } from './manifest.js'
import { allSections, sectionName } from './sections.js'

// The human entry point. Lists every section with counts + links to its .html, links the combined
// page, and explains each top-level folder so a non-technical user never needs index.json.
export const readmeMarkdown = (m: Manifest, locale: Locale): string => {
  const d = docStrings[locale]
  const title = locale === 'fr' ? 'Votre dossier de santé' : 'Your health record'
  const lines = [`# ${title}`, '']

  if (m.profile) {
    lines.push(d.generatedFor(m.profile.fullName, m.profile.citizenId, m.generatedAt.slice(0, 10)), '')
  }

  lines.push(`## ${d.whatsInside}`, '')
  lines.push(`- ${d.legendDossier}`)
  lines.push(`- ${d.legendDocuments}`)
  lines.push(`- ${d.legendDonnees}`)
  lines.push(`- ${d.legendCapture}`)
  lines.push(
    '',
    `[**${locale === 'fr' ? 'Ouvrir le dossier complet' : 'Open the complete record'}**](dossier-complet.html)`,
    '',
  )

  lines.push(`## ${d.section}`, '')
  lines.push(`| ${d.section} | ${d.count} |`)
  lines.push('| --- | --- |')

  for (const s of allSections()) {
    const info = m.domains[s.key]
    const count = info ? info.count : 0
    const errs = info && info.errors.length > 0 ? ` ⚠` : ''

    lines.push(`| [${sectionName(s.key, locale)}](documents/${s.order}-${s.slug}.md) | ${count}${errs} |`)
  }

  lines.push('', d.documentsCount(m.documents.length), '')

  return `${lines.join('\n')}\n`
}
