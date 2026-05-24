export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureProgress: 'capture:progress',
  siteUrl: 'site:url',
  openOutput: 'output:open',
  extractStart: 'extract:start',
  extractStop: 'extract:stop',
  extractProgress: 'extract:progress',
  debugMenu: 'debug:menu',
} as const

export type Phase = 'idle' | 'capturing' | 'downloading' | 'done'

export type ProgressPayload = {
  phase: Phase
  json: number
  binaries: number
  downloaded?: number
}

export type ExtractPhase = 'idle' | 'running' | 'normalizing' | 'writing' | 'done' | 'error'

export type ExtractProgressPayload = {
  phase: ExtractPhase
  currentDomain?: string
  domainsDone: number
  domainsTotal: number
  rawBytes: number
  downloads: number
  error?: string
}
