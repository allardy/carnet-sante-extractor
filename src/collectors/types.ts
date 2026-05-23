import { type CaptureStore } from '../capture/store.js'
import { type Domain } from '../config.js'

export type Navigator = {
  goto: (pathOrUrl: string) => Promise<void>
  waitForJson: <T = unknown>(match: (url: string) => boolean, timeoutMs?: number) => Promise<T>
  fetchJson: <T = unknown>(url: string) => Promise<T>
}

export type CollectContext = {
  nav: Navigator
  capture: CaptureStore
  citizenId: string
}

export type DocumentDescriptor = {
  id: string
  url: string
  title: string
  type: string
  date?: string
  // Some endpoints (notably labs /Rapports) return the PDF binary inline as base64 inside the
  // JSON response rather than at a separate URL. When `inlineData` is set, the orchestrator
  // decodes it instead of calling fetch on `url` (which may be a placeholder).
  inlineData?: string
}

export type DomainResult = {
  domain: Domain
  raw: unknown
  documents: DocumentDescriptor[]
}

export type Collector = {
  domain: Domain
  collect: (ctx: CollectContext) => Promise<DomainResult>
}
