import { type Page } from 'playwright'

import { type CaptureStore } from '../browser/capture.js'
import { type Domain } from '../config.js'

export type CollectContext = {
  page: Page
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
