import { contextBridge, ipcRenderer } from 'electron'

import { type Locale } from '../shared/i18n.js'
import { IPC, type ExtractProgressPayload } from '../shared/ipc.js'

const api = {
  openOutput: (): Promise<void> => ipcRenderer.invoke(IPC.openOutput),
  onSiteUrl: (cb: (url: string) => void): (() => void) => {
    const handler = (_event: unknown, url: string): void => cb(url)

    ipcRenderer.on(IPC.siteUrl, handler)

    return () => ipcRenderer.off(IPC.siteUrl, handler)
  },
  onSiteLocale: (cb: (locale: Locale) => void): (() => void) => {
    const handler = (_event: unknown, locale: Locale): void => cb(locale)

    ipcRenderer.on(IPC.siteLocale, handler)

    return () => ipcRenderer.off(IPC.siteLocale, handler)
  },
  onSiteAuthState: (cb: (loggedIn: boolean) => void): (() => void) => {
    const handler = (_event: unknown, loggedIn: boolean): void => cb(loggedIn)

    ipcRenderer.on(IPC.siteAuthState, handler)

    return () => ipcRenderer.off(IPC.siteAuthState, handler)
  },
  startExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStart),
  stopExtract: (): Promise<void> => ipcRenderer.invoke(IPC.extractStop),
  openDebugMenu: (): Promise<void> => ipcRenderer.invoke(IPC.debugMenu),
  onExtractProgress: (cb: (payload: ExtractProgressPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: ExtractProgressPayload): void => cb(payload)

    ipcRenderer.on(IPC.extractProgress, handler)

    return () => ipcRenderer.off(IPC.extractProgress, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
