import { type WebContents } from 'electron'
import { resolve } from 'node:path'

import { type CaptureStore, classify, emptyStore, safeName } from '../capture/store.js'
import { ensureDir, writeJson } from '../util/fs.js'
import { log } from '../util/log.js'

export type ProgressCounts = { json: number; binaries: number }

export type CaptureHandle = {
  store: CaptureStore
  runDir: string
  stop: () => Promise<void>
}

type ResponseMeta = { url: string; status: number; method: string; contentType: string }

export const startCapture = async (
  webContents: WebContents,
  runDir: string,
  onProgress: (counts: ProgressCounts) => void,
): Promise<CaptureHandle> => {
  const store = emptyStore()
  const methods = new Map<string, string>()
  const responses = new Map<string, ResponseMeta>()
  let index = 0

  const dbg = webContents.debugger

  if (!dbg.isAttached()) {
    dbg.attach('1.3')
  }

  const finish = async (requestId: string): Promise<void> => {
    const meta = responses.get(requestId)

    if (!meta) {
      return
    }

    responses.delete(requestId)
    const kind = classify(meta.contentType)
    const current = index

    index += 1

    try {
      if (kind === 'json') {
        const result = (await dbg.sendCommand('Network.getResponseBody', { requestId })) as {
          body: string
          base64Encoded: boolean
        }
        const text = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body
        const file = `${safeName(meta.url, current)}.json`
        const responsesDir = resolve(runDir, 'responses')

        await ensureDir(responsesDir)
        await writeJson(resolve(responsesDir, file), {
          url: meta.url,
          status: meta.status,
          method: meta.method,
          body: JSON.parse(text),
        })
        store.json.push({ ...meta, file })
        onProgress({ json: store.json.length, binaries: store.binaries.length })
      } else if (kind === 'binary') {
        store.binaries.push({ ...meta, file: '' })
        onProgress({ json: store.json.length, binaries: store.binaries.length })
      }
    } catch (error) {
      log.warn(`capture skipped ${meta.url}`, (error as Error).message)
    }
  }

  const onMessage = (_event: unknown, method: string, params: Record<string, any>): void => {
    if (method === 'Network.requestWillBeSent') {
      methods.set(params['requestId'], params['request']?.method ?? '')
    } else if (method === 'Network.responseReceived') {
      const response = params['response']

      responses.set(params['requestId'], {
        url: response.url,
        status: response.status,
        method: methods.get(params['requestId']) ?? '',
        contentType: String(response.headers?.['content-type'] ?? response.mimeType ?? '').toLowerCase(),
      })
    } else if (method === 'Network.loadingFinished') {
      void finish(params['requestId'])
    }
  }

  dbg.on('message', onMessage)
  await dbg.sendCommand('Network.enable')

  const stop = async (): Promise<void> => {
    dbg.off('message', onMessage)

    try {
      await dbg.sendCommand('Network.disable')
      dbg.detach()
    } catch {
      // already detached
    }

    const responsesDir = resolve(runDir, 'responses')

    await ensureDir(responsesDir)
    await writeJson(resolve(responsesDir, 'index.json'), store)
  }

  return { store, runDir, stop }
}
