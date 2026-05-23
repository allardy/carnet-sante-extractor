import { resolve } from 'node:path'
import { type BrowserContext, type Response } from 'playwright'

import { ensureDir, writeJson } from '../util/fs.js'
import { log } from '../util/log.js'

export type CapturedResponse = {
  url: string
  status: number
  method: string
  contentType: string
  file: string
}

export type CaptureStore = {
  json: CapturedResponse[]
  binaries: CapturedResponse[]
}

const safeName = (url: string, index: number): string => {
  let slug = 'root'

  try {
    const parsed = new URL(url)

    slug =
      `${parsed.pathname}${parsed.search}`
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'root'
  } catch {
    // non-http url (data:, blob:) — keep the fallback slug
  }

  return `${String(index).padStart(4, '0')}-${slug}`
}

// Attaches a passive listener that dumps every JSON response to `dir` and flags PDF/binary responses.
// Returns the live store plus a `detach` to stop listening.
export const attachCapture = (context: BrowserContext, dir: string): { store: CaptureStore; detach: () => void } => {
  const store: CaptureStore = { json: [], binaries: [] }
  let index = 0

  const handle = async (response: Response): Promise<void> => {
    const current = index

    index += 1
    const url = response.url()
    const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
    const method = response.request().method()

    try {
      if (contentType.includes('application/json')) {
        const body = await response.body()
        const file = `${safeName(url, current)}.json`

        await ensureDir(dir)
        await writeJson(resolve(dir, file), {
          url,
          status: response.status(),
          method,
          body: JSON.parse(body.toString('utf8')),
        })
        store.json.push({ url, status: response.status(), method, contentType, file })
      } else if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
        store.binaries.push({ url, status: response.status(), method, contentType, file: '' })
      }
    } catch (error) {
      log.warn(`capture skipped ${url}`, (error as Error).message)
    }
  }

  const onResponse = (response: Response): void => {
    void handle(response)
  }

  context.on('response', onResponse)

  return { store, detach: () => context.off('response', onResponse) }
}

export const writeCaptureIndex = async (dir: string, store: CaptureStore): Promise<void> => {
  await writeJson(resolve(dir, 'index.json'), store)
}
