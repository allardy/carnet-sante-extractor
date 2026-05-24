import { resolve } from 'node:path'

import { CARNET_PORTAL_URL } from './constants.js'

export type Domain =
  | 'profile'
  | 'labs'
  | 'medications'
  | 'imaging'
  | 'appointments'
  | 'medical-services'
  | 'access'
  | 'documents'

export type Config = {
  carnetUrl: string
  baseDir: string
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

// baseDir defaults to cwd/runs for dev (`pnpm dev`); main/index.ts overrides it to
// ~/carnet-sante-extractor/ once the Electron app path is available.
export const config: Config = {
  carnetUrl: CARNET_PORTAL_URL,
  baseDir: resolve(root, 'runs'),
  partitionName: 'persist:carnet',
  windowWidth: 1280,
  windowHeight: 900,
  toolbarHeight: 56,
  domains: ['profile', 'labs', 'medications', 'imaging', 'appointments', 'medical-services', 'access', 'documents'],
  requestDelayMs: 800,
  downloadConcurrency: 3,
  downloadRetries: 2,
}
