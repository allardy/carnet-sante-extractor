import {
  type CleanAppointment,
  type CleanImagingExam,
  type CleanLab,
  type CleanMedication,
  type CleanProfile,
  type CleanService,
} from './schemas.js'

export const profileMarkdown = (p: CleanProfile): string => {
  const lines = [
    '# Profile',
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
  }

  return `${lines.join('\n')}\n`
}

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

export const medicationsMarkdown = (meds: CleanMedication[]): string => {
  if (meds.length === 0) {
    return '# Medications\n\n_None._\n'
  }

  const lines = ['# Medications', '']

  for (const m of meds) {
    lines.push(`## ${m.drugName}`)
    lines.push('')
    lines.push(`- **DIN:** ${m.din}`)
    lines.push(`- **Posology:** ${m.posology}`)
    lines.push(`- **Prescriber:** ${m.prescriber}`)
    lines.push(`- **Pharmacy:** ${m.pharmacy}`)
    lines.push(`- **Prescribed:** ${m.prescribedAt} (${m.durationDays} days)`)
    lines.push(`- **Refills:** ${m.refillsRemaining}/${m.refillsAuthorized} remaining`)

    if (m.lastDispensedAt) {
      lines.push(`- **Last dispensed:** ${m.lastDispensedAt}`)
    }

    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

export const appointmentsMarkdown = (appts: CleanAppointment[]): string => {
  if (appts.length === 0) {
    return '# Appointments\n\n_None scheduled._\n'
  }

  const lines = ['# Appointments', '']

  for (const a of [...appts].sort((x, y) => x.date.localeCompare(y.date))) {
    const tail = [a.specialty, a.clinic, a.status].filter(Boolean).join(' — ')

    lines.push(`- **${a.date} ${a.time}** — Dr ${a.doctor}${tail ? ` (${tail})` : ''}`)
  }

  return `${lines.join('\n')}\n`
}

export const medicalServicesMarkdown = (services: CleanService[]): string => {
  if (services.length === 0) {
    return '# Medical services\n\n_No services._\n'
  }

  const lines = ['# Medical services', '']

  for (const s of [...services].sort((x, y) => y.date.localeCompare(x.date))) {
    const tail = [s.facility, s.specialty].filter(Boolean).join(' — ')

    lines.push(`- **${s.date}** — ${s.description ?? 'Service'}${tail ? ` (${tail})` : ''}`)
  }

  return `${lines.join('\n')}\n`
}

export const imagingMarkdown = (exams: CleanImagingExam[]): string => {
  if (exams.length === 0) {
    return '# Imaging\n\n_No exams._\n'
  }

  const lines = ['# Imaging', '']

  for (const e of [...exams].sort((x, y) => y.date.localeCompare(x.date))) {
    lines.push(`- **${e.date}** — ${e.description} (Dr ${e.prescriber}) — ${e.reportIds.length} report(s)`)
  }

  return `${lines.join('\n')}\n`
}

export const labsMarkdown = (labs: CleanLab[]): string => {
  if (labs.length === 0) {
    return '# Labs\n\n_No labs._\n'
  }

  const lines = ['# Labs', '']

  for (const l of [...labs].sort((x, y) => y.date.localeCompare(x.date))) {
    lines.push(`## ${l.date} — ${l.description ?? l.noReq}`)
    lines.push('')

    if (l.prescriber) {
      lines.push(`Prescriber: ${l.prescriber}`)
      lines.push('')
    }

    if (l.analyses.length > 0) {
      lines.push('| Test | Value | Reference | |')
      lines.push('|------|-------|-----------|--|')

      for (const a of l.analyses) {
        const flag = a.abnormal ? '⚠' : ''

        lines.push(`| ${a.label} | ${a.value} ${a.unit ?? ''} | ${a.reference ?? ''} | ${flag} |`)
      }

      lines.push('')
    }
  }

  return `${lines.join('\n')}\n`
}
