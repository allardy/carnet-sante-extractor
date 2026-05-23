import { type CaptureStore } from '../capture/store.js'
import { type Domain } from '../config.js'

// Backed in Phase 3 by an Electron WebContents adapter; collectors only see this interface.
export type Navigator = {
  goto: (pathOrUrl: string) => Promise<void>
  waitForJson: (match: (url: string) => boolean, timeoutMs?: number) => Promise<unknown>
}

export type CollectContext = {
  nav: Navigator
  capture: CaptureStore
}

export type DocumentDescriptor = {
  id: string
  url: string
  title: string
  type: string
  date?: string
}

export type DomainResult = {
  domain: Domain
  raw: unknown[]
  documents: DocumentDescriptor[]
}

export type Collector = {
  domain: Domain
  collect: (ctx: CollectContext) => Promise<DomainResult>
}
