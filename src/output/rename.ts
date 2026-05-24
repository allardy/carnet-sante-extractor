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
  const base = `${d.type}/${slug(d.title)}_${date}`
  let name = `${base}.pdf`
  let i = 1

  while (taken.has(name)) {
    const suffix = d.id.slice(-6)

    name = `${base}_${suffix}.pdf`

    if (taken.has(name)) {
      i += 1
      name = `${base}_${suffix}-${i}.pdf`
    }
  }

  taken.add(name)

  return name
}
