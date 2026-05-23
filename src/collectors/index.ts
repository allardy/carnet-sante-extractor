import { type Collector } from './types.js'

// Collectors are registered here once the recon session maps each domain's endpoints.
// See docs/superpowers/specs/2026-05-23-carnet-sante-extract-design.md — build steps 3-4.
export const collectors: Collector[] = []

export const collectorFor = (domain: string): Collector | undefined =>
  collectors.find((collector) => collector.domain === domain)
