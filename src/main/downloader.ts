import { net, type Session } from 'electron'
import { resolve } from 'node:path'

import { type CapturedResponse, safeName } from '../capture/store.js'
import { config } from '../config.js'
import { mapLimit, sleep } from '../util/concurrency.js'
import { writeBuffer } from '../util/fs.js'
import { log } from '../util/log.js'

type FetchInit = RequestInit & { session?: Session; useSessionCookies?: boolean }

const fetchWithRetry = async (session: Session, url: string): Promise<Buffer> => {
  let lastError: unknown

  for (let attempt = 0; attempt <= config.downloadRetries; attempt += 1) {
    try {
      const init: FetchInit = { session, useSessionCookies: true }
      const response = await net.fetch(url, init)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error

      if (attempt < config.downloadRetries) {
        await sleep(config.requestDelayMs * (attempt + 1))
      }
    }
  }

  throw lastError
}

// Phase 1: download every flagged binary by URL into `dir`, named from the URL slug.
// Phase 3 replaces this with descriptor + manifest-skip logic once collectors supply metadata.
export const downloadCaptured = async (
  session: Session,
  binaries: CapturedResponse[],
  dir: string,
): Promise<number> => {
  let saved = 0

  await mapLimit(binaries, config.downloadConcurrency, async (binary, i) => {
    try {
      const buffer = await fetchWithRetry(session, binary.url)

      await writeBuffer(resolve(dir, `${safeName(binary.url, i)}.pdf`), buffer)
      await sleep(config.requestDelayMs)
      saved += 1
      log.info(`downloaded ${binary.url} (${buffer.length} bytes)`)
    } catch (error) {
      log.warn(`download failed ${binary.url}`, (error as Error).message)
    }
  })

  return saved
}
