import { describe, expect, it } from 'vitest'

import { type Domain } from '../src/config.js'
import { allSections, runRootLinks, sectionFileLinks, sectionFor, sectionName } from '../src/output/sections.js'

const DOMAINS: Domain[] = ['profile', 'medications', 'appointments', 'imaging', 'labs', 'medical-services', 'access']

describe('section registry', () => {
  it('has one section per data domain, with unique orders and slugs', () => {
    const sections = allSections()

    expect(sections.map((s) => s.key).sort()).toEqual([...DOMAINS].sort())
    expect(new Set(sections.map((s) => s.order)).size).toBe(sections.length)
    expect(new Set(sections.map((s) => s.slug)).size).toBe(sections.length)
  })

  it('returns sections sorted by reading order', () => {
    const orders = allSections().map((s) => s.order)

    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('localizes section names', () => {
    expect(sectionName('imaging', 'fr')).toBe('Imagerie médicale')
    expect(sectionName('imaging', 'en')).toBe('Medical imaging')
    expect(sectionName('labs', 'fr')).toBe('Prélèvements')
    expect(sectionFor('labs').slug).toBe('prelevements')
  })

  it('sectionFileLinks resolve relative to documents/, runRootLinks relative to run root', () => {
    expect(sectionFileLinks.pdf('pdf/imagerie/x.pdf')).toBe('pdf/imagerie/x.pdf')
    expect(sectionFileLinks.json('medicaments')).toBe('../donnees/medicaments.json')
    expect(sectionFileLinks.readme).toBe('../LISEZ-MOI.md')

    expect(runRootLinks.pdf('pdf/imagerie/x.pdf')).toBe('documents/pdf/imagerie/x.pdf')
    expect(runRootLinks.json('medicaments')).toBe('donnees/medicaments.json')
    expect(runRootLinks.readme).toBe('LISEZ-MOI.md')
  })
})
