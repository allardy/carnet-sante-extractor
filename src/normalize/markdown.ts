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
