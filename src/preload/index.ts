import { contextBridge, ipcRenderer } from 'electron'

import { IPC, type ExtractProgressPayload, type ProgressPayload } from '../shared/ipc.js'

const api = {
  startCapture: (): Promise<void> => ipcRenderer.invoke(IPC.captureStart),
  stopCapture: (): Promise<void> => ipcRenderer.invoke(IPC.captureStop),
  openOutput: (): Promise<void> => ipcRenderer.invoke(IPC.openOutput),
  onProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: ProgressPayload): void => cb(payload)

    ipcRenderer.on(IPC.captureProgress, handler)

    return () => ipcRenderer.off(IPC.captureProgress, handler)
  },
  onSiteUrl: (cb: (url: string) => void): (() => void) => {
    const handler = (_event: unknown, url: string): void => cb(url)

    ipcRenderer.on(IPC.siteUrl, handler)

    return () => ipcRenderer.off(IPC.siteUrl, handler)
  },
  startExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStart),
  stopExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStop),
  onExtractProgress: (cb: (payload: ExtractProgressPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: ExtractProgressPayload): void => cb(payload)

    ipcRenderer.on(IPC.extractProgress, handler)

    return () => ipcRenderer.off(IPC.extractProgress, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
