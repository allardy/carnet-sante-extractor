export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureProgress: 'capture:progress',
  siteUrl: 'site:url',
  openOutput: 'output:open',
} as const

export type Phase = 'idle' | 'capturing' | 'downloading' | 'done'

export type ProgressPayload = {
  phase: Phase
  json: number
  binaries: number
  downloaded?: number
}
