import { type Manifest } from './manifest.js'

export const summaryMarkdown = (m: Manifest): string => {
  const lines = ['# Health record summary', '']

  if (m.profile) {
    lines.push(
      `Generated for **${m.profile.fullName}** (citizen ${m.profile.citizenId}) on ${m.generatedAt.slice(0, 10)}.`,
    )
    lines.push('')
  }

  lines.push('## Counts')
  lines.push('')

  for (const [domain, info] of Object.entries(m.domains)) {
    lines.push(`- **${domain}:** ${info.count}${info.errors.length > 0 ? ` (${info.errors.length} errors)` : ''}`)
  }

  lines.push('')
  lines.push('## Documents')
  lines.push('')
  lines.push(`${m.documents.length} PDF(s) downloaded.`)

  if (m.documents.length > 0) {
    lines.push('')

    for (const d of m.documents.slice(0, 20)) {
      lines.push(`- \`${d.outputPath}\` (${d.bytes.toLocaleString()} bytes)`)
    }

    if (m.documents.length > 20) {
      lines.push(`- … and ${m.documents.length - 20} more`)
    }
  }

  return `${lines.join('\n')}\n`
}
