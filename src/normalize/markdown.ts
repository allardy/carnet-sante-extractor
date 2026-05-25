import { type RenderCtx, sectionFor, sectionName } from '../output/sections.js'
import { docStrings, type Locale } from '../shared/i18n.js'

import {
  type CleanAccess,
  type CleanAppointment,
  type CleanImagingExam,
  type CleanLab,
  type CleanMedication,
  type CleanProfile,
  type CleanService,
} from './schemas.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

export const heading = (level: number, text: string): string => `${'#'.repeat(level)} ${text}\n`

export const toMarkdownTable = (headers: string[], rows: string[][]): string => {
  const head = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`

  if (rows.length === 0) {
    return `${head}\n${separator}`
  }

  return `${head}\n${separator}\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`
}

const groupByYear = <T extends { date: string }>(items: T[]): { year: string; items: T[] }[] => {
  const byYear = new Map<string, T[]>()

  for (const item of items) {
    const y = item.date.slice(0, 4) || 'unknown'

    byYear.set(y, [...(byYear.get(y) ?? []), item])
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, its]) => ({ year, items: [...its].sort((a, b) => b.date.localeCompare(a.date)) }))
}

type DocLink = { date: string; outputPath: string }

const docsByDate = (docs: DocLink[]): Map<string, DocLink[]> => {
  const m = new Map<string, DocLink[]>()

  for (const d of docs) {
    m.set(d.date, [...(m.get(d.date) ?? []), d])
  }

  return m
}

// French puts a thin space before ':' — keep a simple ' :' to match the localized UI.
const labelSep = (locale: Locale): string => (locale === 'fr' ? ' :' : ':')

const footer = (key: Parameters<typeof sectionFor>[0], ctx: RenderCtx): string[] => {
  const d = docStrings[ctx.locale]
  const slug = sectionFor(key).slug

  return ['---', '', `[${d.backToReadme}](${ctx.links.readme}) · [${d.jsonLink}](${ctx.links.json(slug)})`]
}

const headerNote = (key: Parameters<typeof sectionFor>[0], n: number, ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]
  const slug = sectionFor(key).slug

  return `_${d.entryCount(n)} — ${d.fullData} [\`donnees/${slug}.json\`](${ctx.links.json(slug)})_`
}

// ── Profile ─────────────────────────────────────────────────────────────────

export const profileMarkdown = (p: CleanProfile, ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]
  const s = labelSep(ctx.locale)
  const lines = [
    `# ${sectionName('profile', ctx.locale)}`,
    '',
    `**${d.name}${s}** ${p.fullName}`,
    `**${d.citizenId}${s}** ${p.citizenId}`,
    `**${d.sex}${s}** ${p.sex}`,
    `**${d.birthDate}${s}** ${p.birthDate}`,
  ]

  if (p.cardNumber) {
    lines.push(`**${d.healthCard}${s}** ${p.cardNumber} (${d.expires} ${p.cardExpires})`)
  }

  if (p.email) {
    lines.push(`**${d.email}${s}** ${p.email}`)
  }

  if (p.phone) {
    lines.push(`**${d.phone}${s}** ${p.phone}`)
  }

  if (p.address) {
    lines.push(`**${d.address}${s}** ${p.address}`)
  }

  if (p.familyDoctor) {
    lines.push(`**${d.familyDoctor}${s}** ${p.familyDoctor}`)
  } else if (p.familyDoctorStatus) {
    lines.push(`**${d.familyDoctor}${s}** ${p.familyDoctorStatus}`)
  }

  lines.push('', ...footer('profile', ctx))

  return `${lines.join('\n')}\n`
}

// ── Medications ───────────────────────────────────────────────────────────────

export const medicationsMarkdown = (meds: CleanMedication[], _docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (meds.length === 0) {
    return `# ${sectionName('medications', ctx.locale)}\n\n_${d.none}_\n`
  }

  const s = labelSep(ctx.locale)
  const active = meds.filter((m) => (m.refillsRemaining ?? 0) > 0)
  const completed = meds.filter((m) => (m.refillsRemaining ?? 0) <= 0)
  const lines = [`# ${sectionName('medications', ctx.locale)}`, '', headerNote('medications', meds.length, ctx), '']

  const renderMed = (m: CleanMedication): void => {
    lines.push(`### ${m.drugName}`, '')
    lines.push(`- **${d.din}${s}** ${m.din}`)
    lines.push(`- **${d.posology}${s}** ${m.posology}`)
    lines.push(`- **${d.prescriber}${s}** ${m.prescriber}`)
    lines.push(`- **${d.pharmacy}${s}** ${m.pharmacy}`)
    lines.push(`- **${d.prescribed}${s}** ${m.prescribedAt} (${m.durationDays} ${d.days})`)
    lines.push(`- **${d.refills}${s}** ${m.refillsRemaining ?? 'N/A'}/${m.refillsAuthorized ?? 'N/A'} ${d.remaining}`)

    if (m.lastDispensedAt) {
      lines.push(`- **${d.lastDispensed}${s}** ${m.lastDispensedAt}`)
    }

    lines.push('')
  }

  if (active.length > 0) {
    lines.push(`## ${d.activeRefills}`, '')
    active.forEach(renderMed)
  }

  if (completed.length > 0) {
    lines.push(`## ${d.completed}`, '')
    completed.forEach(renderMed)
  }

  lines.push(...footer('medications', ctx))

  return `${lines.join('\n')}\n`
}

// ── Appointments ──────────────────────────────────────────────────────────────

export const appointmentsMarkdown = (appts: CleanAppointment[], _docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (appts.length === 0) {
    return `# ${sectionName('appointments', ctx.locale)}\n\n_${d.none}_\n`
  }

  const lines = [`# ${sectionName('appointments', ctx.locale)}`, '', headerNote('appointments', appts.length, ctx), '']

  for (const a of [...appts].sort((x, y) => x.date.localeCompare(y.date))) {
    const tail = [a.specialty, a.clinic, a.status].filter(Boolean).join(' — ')

    lines.push(`- **${a.date} ${a.time}** — Dr ${a.doctor}${tail ? ` (${tail})` : ''}`)
  }

  lines.push('', ...footer('appointments', ctx))

  return `${lines.join('\n')}\n`
}

// ── Medical services ──────────────────────────────────────────────────────────

export const medicalServicesMarkdown = (services: CleanService[], _docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (services.length === 0) {
    return `# ${sectionName('medical-services', ctx.locale)}\n\n_${d.none}_\n`
  }

  const lines = [
    `# ${sectionName('medical-services', ctx.locale)}`,
    '',
    headerNote('medical-services', services.length, ctx),
    '',
  ]

  for (const { year, items } of groupByYear(services)) {
    lines.push(`## ${year}`, '')

    for (const sv of items) {
      const parts = [`**${sv.date}**`]
      const desc = [sv.description, sv.precision].filter(Boolean).join(' — ')

      if (desc) {
        parts.push(desc)
      }

      if (sv.practitioner) {
        parts.push(`Dr ${sv.practitioner}`)
      }

      if (sv.facility) {
        parts.push(`@ ${sv.facility}`)
      }

      if (sv.amountPaid != null) {
        parts.push(`$${sv.amountPaid.toFixed(2)}`)
      }

      lines.push(`- ${parts.join(' — ')}`)
    }

    lines.push('')
  }

  lines.push(...footer('medical-services', ctx))

  return `${lines.join('\n')}\n`
}

// ── Imaging ───────────────────────────────────────────────────────────────────

export const imagingMarkdown = (exams: CleanImagingExam[], docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (exams.length === 0) {
    return `# ${sectionName('imaging', ctx.locale)}\n\n_${d.none}_\n`
  }

  const byDate = docsByDate(docs)
  const lines = [`# ${sectionName('imaging', ctx.locale)}`, '', headerNote('imaging', exams.length, ctx), '']

  for (const { year, items } of groupByYear(exams)) {
    lines.push(`## ${year}`, '')

    for (const e of items) {
      lines.push(`### ${e.date} — ${e.description}`, '')
      lines.push(`- ${d.prescriber}${labelSep(ctx.locale)} Dr ${e.prescriber}`)

      const matched = byDate.get(e.date) ?? []

      if (matched.length === 1) {
        lines.push(`- [PDF](${ctx.links.pdf(matched[0]!.outputPath)})`)
      } else {
        matched.forEach((m, i) => lines.push(`- ${d.reportN(i + 1)} — [PDF](${ctx.links.pdf(m.outputPath)})`))
      }

      lines.push('')
    }
  }

  lines.push(...footer('imaging', ctx))

  return `${lines.join('\n')}\n`
}

// ── Labs ──────────────────────────────────────────────────────────────────────

export const labsMarkdown = (labs: CleanLab[], docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (labs.length === 0) {
    return `# ${sectionName('labs', ctx.locale)}\n\n_${d.none}_\n`
  }

  const byDate = docsByDate(docs)
  const lines = [`# ${sectionName('labs', ctx.locale)}`, '', headerNote('labs', labs.length, ctx), '']

  for (const { year, items } of groupByYear(labs)) {
    lines.push(`## ${year}`, '')

    for (const l of items) {
      const matched = byDate.get(l.date) ?? []
      const pdf = matched.length > 0 ? ` [PDF](${ctx.links.pdf(matched[0]!.outputPath)})` : ''

      lines.push(`### ${l.date}${pdf}`, '')

      if (l.prescriber) {
        lines.push(`- ${d.prescriber}${labelSep(ctx.locale)} Dr ${l.prescriber}`)
      }

      if (l.analyses.length > 0) {
        lines.push('')
        lines.push(
          toMarkdownTable(
            [d.test, d.value, d.reference, ''],
            l.analyses.map((a) => [
              a.label,
              `${a.value} ${a.unit ?? ''}`.trim(),
              a.reference ?? '',
              a.abnormal ? '⚠' : '',
            ]),
          ),
        )
      }

      lines.push('')
    }
  }

  lines.push(...footer('labs', ctx))

  return `${lines.join('\n')}\n`
}

// ── Access journal ──────────────────────────────────────────────────────────

const accessDomainLabel = (code: string, ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]
  const map: Record<string, string> = {
    Imagerie: d.domainImaging,
    Medicament: d.domainMedications,
    Prelevement: d.domainLabs,
  }

  return map[code] ?? code
}

export const accessMarkdown = (access: CleanAccess[], _docs: DocLink[], ctx: RenderCtx): string => {
  const d = docStrings[ctx.locale]

  if (access.length === 0) {
    return `# ${sectionName('access', ctx.locale)}\n\n_${d.none}_\n`
  }

  type Agg = { person: string; role: string; count: number; first: string; last: string }
  const byPerson = new Map<string, Agg>()

  for (const a of access) {
    const key = a.providerId || a.person
    const existing = byPerson.get(key)

    if (existing) {
      existing.count += 1

      if (a.date !== '' && (existing.first === '' || a.date < existing.first)) {
        existing.first = a.date
      }

      if (a.date > existing.last) {
        existing.last = a.date
      }
    } else {
      byPerson.set(key, { person: a.person, role: a.role, count: 1, first: a.date, last: a.date })
    }
  }

  const people = [...byPerson.values()].sort((x, y) => y.last.localeCompare(x.last))
  const lines = [
    `# ${sectionName('access', ctx.locale)}`,
    '',
    `_${d.accessSummary(access.length, people.length)} — ${d.fullData} [\`donnees/acces.json\`](${ctx.links.json('acces')})_`,
    '',
    `## ${d.whoAccessed}`,
    '',
    toMarkdownTable(
      [d.person, d.role, d.accesses, d.first, d.last],
      people.map((p) => [p.person, p.role, String(p.count), p.first, p.last]),
    ),
    '',
    `## ${d.accessLog}`,
    '',
  ]

  for (const { year, items } of groupByYear(access)) {
    lines.push(`### ${year}`, '')

    for (const a of items) {
      const when = a.time ? `${a.date} ${a.time}` : a.date
      const doms = a.domains.map((x) => accessDomainLabel(x, ctx)).join(', ')

      lines.push(`- **${when}** — ${a.person} (${a.role})${doms ? ` — ${doms}` : ''}`)
    }

    lines.push('')
  }

  lines.push(...footer('access', ctx))

  return `${lines.join('\n')}\n`
}
