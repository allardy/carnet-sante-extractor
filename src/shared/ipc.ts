export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureProgress: 'capture:progress',
  siteUrl: 'site:url',
  siteLocale: 'site:locale',
  siteAuthState: 'site:auth-state',
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
  // Sub-progress within the current domain (e.g. exams fetched, PDFs downloaded). Lets the bar
  // advance and the label read "Imaging — exam 12/45" instead of sitting frozen at the domain step.
  itemsDone?: number
  itemsTotal?: number
  itemLabel?: string
  rawBytes: number
  downloads: number
  error?: string
}
