import { resolve } from 'node:path'

export type Domain = 'labs' | 'medications' | 'vaccines' | 'imaging' | 'appointments' | 'documents'

export type Config = {
  carnetUrl: string
  outputDir: string
  reconDir: string
  rawDir: string
  authDir: string
  storageStatePath: string
  domains: Domain[]
  requestDelayMs: number
  downloadConcurrency: number
  downloadRetries: number
}

const root = process.cwd()

export const config: Config = {
  carnetUrl: 'https://carnetsante.gouv.qc.ca',
  outputDir: resolve(root, 'output'),
  reconDir: resolve(root, 'recon'),
  rawDir: resolve(root, 'raw'),
  authDir: resolve(root, '.auth'),
  storageStatePath: resolve(root, '.auth', 'storage-state.json'),
  domains: ['labs', 'medications', 'vaccines', 'imaging', 'appointments', 'documents'],
  requestDelayMs: 800,
  downloadConcurrency: 3,
  downloadRetries: 2,
}
