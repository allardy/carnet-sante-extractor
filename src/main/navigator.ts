import { net, type Session, type WebContents } from 'electron'

import { type Navigator } from '../collectors/types.js'

const DEFAULT_TIMEOUT_MS = 30_000

export const createNavigator = (webContents: WebContents, session: Session): Navigator => ({
  goto: async (pathOrUrl) => {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.carnetsante.gouv.qc.ca${pathOrUrl}`

    await webContents.loadURL(url)
  },
  waitForJson: <T>(match: (url: string) => boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> =>
    new Promise((resolveP, rejectP) => {
      const timer = setTimeout(() => {
        webContents.session.webRequest.onCompleted(null)
        rejectP(new Error('waitForJson: timed out'))
      }, timeoutMs)

      webContents.session.webRequest.onCompleted({ urls: ['<all_urls>'] }, (details) => {
        if (!match(details.url)) {
          return
        }

        clearTimeout(timer)
        webContents.session.webRequest.onCompleted(null)
        void net
          .fetch(details.url, { session, useSessionCookies: true } as never)
          .then(async (r) => resolveP((await r.json()) as T))
          .catch(rejectP)
      })
    }),
  fetchJson: async <T>(url: string): Promise<T> => {
    const response = await net.fetch(url, { session, useSessionCookies: true } as never)

    if (!response.ok) {
      throw new Error(`fetchJson ${url}: HTTP ${response.status}`)
    }

    return (await response.json()) as T
  },
})
