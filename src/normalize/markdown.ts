import {
  type CleanAppointment,
  type CleanImagingExam,
  type CleanLab,
  type CleanMedication,
  type CleanProfile,
  type CleanService,
} from './schemas.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

export const heading = (level: number, text: string): string => `${'#'.repeat(level)} ${text}\n`

export const toMarkdownTable = (headers: string[], rows: string[][]): string => {
  const head = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`

  if (rows.length === 0) {
    return `${head}\n${separator}`
  }

  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n')

  return `${head}\n${separator}\n${body}`
}

const groupByYear = <T extends { date: string }>(items: T[]): { year: string; items: T[] }[] => {
  const byYear = new Map<string, T[]>()

  for (const item of items) {
    const y = item.date.slice(0, 4) || 'unknown'

    if (!byYear.has(y)) {
      byYear.set(y, [])
    }

    byYear.get(y)!.push(item)
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, its]) => ({ year, items: [...its].sort((a, b) => b.date.localeCompare(a.date)) }))
}

const docsByDate = (docs: { date: string; outputPath: string }[]): Map<string, { outputPath: string }[]> => {
  const m = new Map<string, { outputPath: string }[]>()

  for (const d of docs) {
    if (!m.has(d.date)) {
      m.set(d.date, [])
    }

    m.get(d.date)!.push({ outputPath: d.outputPath })
  }

  return m
}

// ──────────────────────────────────────────────────────────────────────────────
// Profile
// ──────────────────────────────────────────────────────────────────────────────

export const profileMarkdown = (p: CleanProfile): string => {
  const lines = [
    '# Profile',
    '',
    `_Full data in [\`data/profile.json\`](../data/profile.json)_`,
    '',
    `**Name:** ${p.fullName}`,
    `**Citizen ID:** ${p.citizenId}`,
    `**Sex:** ${p.sex}`,
    `**Birth date:** ${p.birthDate}`,
  ]

  if (p.cardNumber) {
    lines.push(`**Health card:** ${p.cardNumber} (expires ${p.cardExpires})`)
  }

  if (p.email) {
    lines.push(`**Email:** ${p.email}`)
  }

  if (p.phone) {
    lines.push(`**Phone:** ${p.phone}`)
  }

  if (p.address) {
    lines.push(`**Address:** ${p.address}`)
  }

  if (p.familyDoctor) {
    lines.push(`**Family doctor:** ${p.familyDoctor}`)
  } else if (p.familyDoctorStatus) {
    lines.push(`**Family doctor:** ${p.familyDoctorStatus}`)
  }

  lines.push('', '---', '', '[← Summary](../summary.md) · [Raw JSON](../data/profile.json)')

  return `${lines.join('\n')}\n`
}

// ──────────────────────────────────────────────────────────────────────────────
// Medications
// ──────────────────────────────────────────────────────────────────────────────

export const medicationsMarkdown = (meds: CleanMedication[], _docs: { date: string; outputPath: string }[]): string => {
  if (meds.length === 0) {
    return '# Medications\n\n_None._\n'
  }

  const active = meds.filter((m) => (m.refillsRemaining ?? 0) > 0)
  const completed = meds.filter((m) => (m.refillsRemaining ?? 0) <= 0)

  const lines = [
    '# Medications',
    '',
    `_${meds.length} item${meds.length === 1 ? '' : 's'} — full data in [\`data/medications.json\`](../data/medications.json)_`,
    '',
  ]

  const renderMed = (m: CleanMedication): void => {
    lines.push(`### ${m.drugName}`)
    lines.push('')
    lines.push(`- **DIN:** ${m.din}`)
    lines.push(`- **Posology:** ${m.posology}`)
    lines.push(`- **Prescriber:** ${m.prescriber}`)
    lines.push(`- **Pharmacy:** ${m.pharmacy}`)
    lines.push(`- **Prescribed:** ${m.prescribedAt} (${m.durationDays} days)`)
    lines.push(`- **Refills:** ${m.refillsRemaining ?? 'N/A'}/${m.refillsAuthorized ?? 'N/A'} remaining`)

    if (m.lastDispensedAt) {
      lines.push(`- **Last dispensed:** ${m.lastDispensedAt}`)
    }

    lines.push('')
  }

  if (active.length > 0) {
    lines.push('## Active (refills remaining)', '')

    for (const m of active) {
      renderMed(m)
    }
  }

  if (completed.length > 0) {
    lines.push('## Completed', '')

    for (const m of completed) {
      renderMed(m)
    }
  }

  lines.push('---', '', '[← Summary](../summary.md) · [Raw JSON](../data/medications.json)')

  return `${lines.join('\n')}\n`
}

// ──────────────────────────────────────────────────────────────────────────────
// Appointments
// ──────────────────────────────────────────────────────────────────────────────

export const appointmentsMarkdown = (
  appts: CleanAppointment[],
  _docs: { date: string; outputPath: string }[],
): string => {
  if (appts.length === 0) {
    return '# Appointments\n\n_None scheduled for the queried window._\n'
  }

  const lines = [
    '# Appointments',
    '',
    `_${appts.length} item${appts.length === 1 ? '' : 's'} — full data in [\`data/appointments.json\`](../data/appointments.json)_`,
    '',
  ]

  for (const a of [...appts].sort((x, y) => x.date.localeCompare(y.date))) {
    const tail = [a.specialty, a.clinic, a.status].filter(Boolean).join(' — ')

    lines.push(`- **${a.date} ${a.time}** — Dr ${a.doctor}${tail ? ` (${tail})` : ''}`)
  }

  lines.push('', '---', '', '[← Summary](../summary.md) · [Raw JSON](../data/appointments.json)')

  return `${lines.join('\n')}\n`
}

// ──────────────────────────────────────────────────────────────────────────────
// Medical services
// ──────────────────────────────────────────────────────────────────────────────

export const medicalServicesMarkdown = (
  services: CleanService[],
  _docs: { date: string; outputPath: string }[],
): string => {
  if (services.length === 0) {
    return '# Medical services\n\n_No services._\n'
  }

  const lines = [
    '# Medical services',
    '',
    `_${services.length} item${services.length === 1 ? '' : 's'} — full data in [\`data/medical-services.json\`](../data/medical-services.json)_`,
    '',
  ]

  for (const { year, items } of groupByYear(services)) {
    lines.push(`## ${year}`, '')

    for (const s of items) {
      const parts: string[] = [`**${s.date}**`]
      const desc = [s.description, s.precision].filter(Boolean).join(' — ')

      if (desc) {
        parts.push(desc)
      }

      if (s.practitioner) {
        parts.push(`Dr ${s.practitioner}`)
      }

      if (s.facility) {
        parts.push(`@ ${s.facility}`)
      }

      if (s.amountPaid != null) {
        parts.push(`$${s.amountPaid.toFixed(2)}`)
      }

      lines.push(`- ${parts.join(' — ')}`)
    }

    lines.push('')
  }

  lines.push('---', '', '[← Summary](../summary.md) · [Raw JSON](../data/medical-services.json)')

  return `${lines.join('\n')}\n`
}

// ──────────────────────────────────────────────────────────────────────────────
// Imaging
// ──────────────────────────────────────────────────────────────────────────────

export const imagingMarkdown = (exams: CleanImagingExam[], docs: { date: string; outputPath: string }[]): string => {
  if (exams.length === 0) {
    return '# Imaging\n\n_No exams._\n'
  }

  const byDate = docsByDate(docs)

  const lines = [
    '# Imaging',
    '',
    `_${exams.length} exam${exams.length === 1 ? '' : 's'} — full data in [\`data/imaging.json\`](../data/imaging.json)_`,
    '',
  ]

  for (const { year, items } of groupByYear(exams)) {
    lines.push(`## ${year}`, '')

    for (const e of items) {
      lines.push(`### ${e.date} — ${e.description}`)
      lines.push('')
      lines.push(`- Prescriber: Dr ${e.prescriber}`)

      const matchedDocs = byDate.get(e.date) ?? []

      if (matchedDocs.length === 1) {
        lines.push(`- 1 report — [PDF](../${matchedDocs[0]!.outputPath})`)
      } else if (matchedDocs.length > 1) {
        for (let i = 0; i < matchedDocs.length; i++) {
          lines.push(`- Report ${i + 1} — [PDF](../${matchedDocs[i]!.outputPath})`)
        }
      }

      lines.push('')
    }
  }

  lines.push('---', '', '[← Summary](../summary.md) · [Raw JSON](../data/imaging.json)')

  return `${lines.join('\n')}\n`
}

// ──────────────────────────────────────────────────────────────────────────────
// Labs
// ──────────────────────────────────────────────────────────────────────────────

export const labsMarkdown = (labs: CleanLab[], docs: { date: string; outputPath: string }[]): string => {
  if (labs.length === 0) {
    return '# Labs\n\n_No labs._\n'
  }

  const byDate = docsByDate(docs)

  const lines = [
    '# Labs',
    '',
    `_${labs.length} lab${labs.length === 1 ? '' : 's'} — full data in [\`data/labs.json\`](../data/labs.json)_`,
    '',
  ]

  for (const { year, items } of groupByYear(labs)) {
    lines.push(`## ${year}`, '')

    for (const l of items) {
      const matchedDocs = byDate.get(l.date) ?? []
      const pdfLink = matchedDocs.length > 0 ? ` [PDF](../${matchedDocs[0]!.outputPath})` : ''

      lines.push(`### ${l.date} — Prélèvement${pdfLink}`)
      lines.push('')

      if (l.prescriber) {
        lines.push(`- Prescriber: Dr ${l.prescriber}`)
      }

      lines.push(`- ${l.analyses.length} analyse${l.analyses.length === 1 ? '' : 's'}`)

      if (l.analyses.length > 0) {
        lines.push('')
        lines.push('| Test | Value | Reference | |')
        lines.push('|------|-------|-----------|--|')

        for (const a of l.analyses) {
          const flag = a.abnormal ? '⚠' : ''

          lines.push(`| ${a.label} | ${a.value} ${a.unit ?? ''} | ${a.reference ?? ''} | ${flag} |`)
        }
      }

      lines.push('')
    }
  }

  lines.push('---', '', '[← Summary](../summary.md) · [Raw JSON](../data/labs.json)')

  return `${lines.join('\n')}\n`
}
