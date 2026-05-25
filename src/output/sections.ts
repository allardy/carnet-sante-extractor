import { type Domain } from '../config.js'
import { type Locale } from '../shared/i18n.js'

export type SectionKey = Exclude<Domain, 'documents'>

export type SectionDef = {
  key: SectionKey
  order: number
  slug: string
  pdfType?: string
  name: { fr: string; en: string }
}

const SECTIONS: SectionDef[] = [
  { key: 'profile', order: 1, slug: 'profil', name: { fr: 'Profil', en: 'Profile' } },
  { key: 'medications', order: 2, slug: 'medicaments', name: { fr: 'Médicaments', en: 'Medications' } },
  { key: 'appointments', order: 3, slug: 'rendez-vous', name: { fr: 'Rendez-vous', en: 'Appointments' } },
  {
    key: 'imaging',
    order: 4,
    slug: 'imagerie',
    pdfType: 'imagerie',
    name: { fr: 'Imagerie médicale', en: 'Medical imaging' },
  },
  {
    key: 'labs',
    order: 5,
    slug: 'prelevements',
    pdfType: 'prelevements',
    name: { fr: 'Prélèvements', en: 'Lab samples' },
  },
  {
    key: 'medical-services',
    order: 6,
    slug: 'services',
    name: { fr: "Services médicaux payés à l'acte", en: 'Medical services (fee-for-service)' },
  },
  {
    key: 'access',
    order: 7,
    slug: 'acces',
    name: { fr: 'Intervenants ayant consulté votre dossier', en: 'Health workers who consulted your record' },
  },
]

export const allSections = (): SectionDef[] => [...SECTIONS].sort((a, b) => a.order - b.order)

export const sectionFor = (key: SectionKey): SectionDef => {
  const s = SECTIONS.find((x) => x.key === key)

  if (!s) {
    throw new Error(`no section registered for key '${key}'`)
  }

  return s
}

export const sectionName = (key: SectionKey, locale: Locale): string => sectionFor(key).name[locale]

export type LinkPaths = {
  pdf: (docRelPath: string) => string
  json: (slug: string) => string
  readme: string
  dossier: string
}

// Section .md/.html files live in documents/, so PDFs (documents/pdf/…) are a sibling subtree and
// donnees/ + the run-root entry points sit one level up.
export const sectionFileLinks: LinkPaths = {
  pdf: (p) => p,
  json: (slug) => `../donnees/${slug}.json`,
  readme: '../LISEZ-MOI.md',
  dossier: '../dossier-complet.html',
}

// dossier-complet.html lives at the run root, so every asset path is run-root-relative.
export const runRootLinks: LinkPaths = {
  pdf: (p) => `documents/${p}`,
  json: (slug) => `donnees/${slug}.json`,
  readme: 'LISEZ-MOI.md',
  dossier: 'dossier-complet.html',
}

export type RenderCtx = { locale: Locale; links: LinkPaths }
