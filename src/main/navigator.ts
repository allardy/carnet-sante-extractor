import { type Session, type WebContents } from 'electron'

import { type Navigator } from '../collectors/types.js'

import { authHeaders } from './auth.js'
import { type Logger } from './logger.js'

const DEFAULT_TIMEOUT_MS = 30_000

const refererFor = (url: string): string => {
  try {
    return new URL(url).origin + '/accueil'
  } catch {
    return 'https://www.carnetsante.gouv.qc.ca/accueil'
  }
}

export const createNavigator = (webContents: WebContents, session: Session, logger?: Logger): Navigator => ({
  goto: async (pathOrUrl) => {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://www.carnetsante.gouv.qc.ca${pathOrUrl}`

    logger?.log({ phase: 'navigator', status: 'start', message: 'goto', url })
    await webContents.loadURL(url)
    logger?.log({ phase: 'navigator', status: 'ok', message: 'goto', url })
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
        void session
          .fetch(details.url, { headers: authHeaders(refererFor(details.url)) })
          .then(async (r) => resolveP((await r.json()) as T))
          .catch(rejectP)
      })
    }),
  fetchJson: async <T>(url: string): Promise<T> => {
    const t0 = Date.now()

    logger?.log({ phase: 'fetch', status: 'start', message: 'GET', url })

    try {
      const response = await session.fetch(url, { headers: authHeaders(refererFor(url)) })
      const text = await response.text()
      const durationMs = Date.now() - t0
      const bytes = text.length

      if (!response.ok) {
        logger?.log({
          phase: 'fetch',
          status: 'error',
          message: 'GET',
          url,
          httpStatus: response.status,
          bytes,
          durationMs,
        })
        throw new Error(`fetchJson ${url}: HTTP ${response.status}`)
      }

      logger?.log({
        phase: 'fetch',
        status: 'ok',
        message: 'GET',
        url,
        httpStatus: response.status,
        bytes,
        durationMs,
      })

      return JSON.parse(text) as T
    } catch (err) {
      const durationMs = Date.now() - t0

      logger?.log({
        phase: 'fetch',
        status: 'error',
        message: 'GET',
        url,
        durationMs,
        error: (err as Error).message,
      })
      throw err
    }
  },
})
