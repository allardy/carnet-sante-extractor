import { resolve } from 'node:path'
import { type BrowserContext } from 'playwright'

import { type DocumentDescriptor } from '../collectors/types.js'
import { config } from '../config.js'
import { mapLimit, sleep } from '../util/concurrency.js'
import { sha256, writeBuffer } from '../util/fs.js'
import { log } from '../util/log.js'

export type DownloadResult = {
  descriptor: DocumentDescriptor
  path: string
  sha256: string
  bytes: number
  skipped: boolean
}

const fetchWithRetry = async (context: BrowserContext, url: string): Promise<Buffer> => {
  let lastError: unknown

  for (let attempt = 0; attempt <= config.downloadRetries; attempt += 1) {
    try {
      const response = await context.request.get(url)

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}`)
      }

      return Buffer.from(await response.body())
    } catch (error) {
      lastError = error
      await sleep(config.requestDelayMs * (attempt + 1))
    }
  }

  throw lastError
}

// Downloads each descriptor's PDF via the authenticated context, concurrency-limited and retried.
// `isAlreadyDownloaded` lets the manifest skip files we already have.
export const downloadDocuments = async (
  context: BrowserContext,
  descriptors: DocumentDescriptor[],
  destDir: string,
  isAlreadyDownloaded: (descriptor: DocumentDescriptor) => boolean,
): Promise<DownloadResult[]> =>
  mapLimit(descriptors, config.downloadConcurrency, async (descriptor) => {
    const path = resolve(destDir, `${descriptor.id}.pdf`)

    if (isAlreadyDownloaded(descriptor)) {
      return { descriptor, path, sha256: '', bytes: 0, skipped: true }
    }

    const buffer = await fetchWithRetry(context, descriptor.url)

    await writeBuffer(path, buffer)
    await sleep(config.requestDelayMs)
    log.info(`downloaded ${descriptor.id} (${buffer.length} bytes)`)

    return { descriptor, path, sha256: sha256(buffer), bytes: buffer.length, skipped: false }
  })
