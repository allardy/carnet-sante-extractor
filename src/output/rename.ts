import { type DocumentDescriptor } from '../collectors/types.js'

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const renameDocument = (d: DocumentDescriptor, taken: Set<string>): string => {
  const date = d.date ?? '0000-00-00'
  const base = `${d.type}/${date}_${slug(d.title)}`
  let name = `${base}.pdf`
  let i = 1

  while (taken.has(name)) {
    i += 1
    name = `${base}_${i}.pdf`
  }

  taken.add(name)

  return name
}
