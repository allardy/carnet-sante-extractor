import { resolve } from 'node:path'

export type Domain = 'labs' | 'medications' | 'vaccines' | 'imaging' | 'appointments' | 'documents'

export type Config = {
  carnetUrl: string
  outputDir: string
  rawDir: string
  partitionName: string
  windowWidth: number
  windowHeight: number
  toolbarHeight: number
  domains: Domain[]
  requestDelayMs: number
  downloadConcurrency: number
  downloadRetries: number
}

const root = process.cwd()

// outputDir/rawDir default to cwd for dev (`pnpm dev`); main/index.ts overrides them to a
// user-visible Documents folder once the Electron app path is available.
export const config: Config = {
  carnetUrl: 'https://carnetsante.gouv.qc.ca',
  outputDir: resolve(root, 'output'),
  rawDir: resolve(root, 'raw'),
  partitionName: 'persist:carnet',
  windowWidth: 1280,
  windowHeight: 900,
  toolbarHeight: 56,
  domains: ['labs', 'medications', 'vaccines', 'imaging', 'appointments', 'documents'],
  requestDelayMs: 800,
  downloadConcurrency: 3,
  downloadRetries: 2,
}
