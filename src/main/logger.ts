import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { ensureDir } from '../util/fs.js'

export type LogStatus = 'start' | 'ok' | 'warn' | 'error'

export type LogEntry = {
  ts: string
  elapsedMs: number
  phase: string
  status: LogStatus
  message: string
  domain?: string
  url?: string
  httpStatus?: number
  bytes?: number
  durationMs?: number
  error?: string
  detail?: unknown
}

export type Logger = {
  log: (entry: Omit<LogEntry, 'ts' | 'elapsedMs'>) => void
  child: (defaults: Partial<LogEntry>) => Logger
  close: () => Promise<void>
}

const formatHuman = (e: LogEntry): string => {
  const tag = e.domain ? `[${e.phase}/${e.domain}]` : `[${e.phase}]`
  const status = e.status === 'ok' ? '✓' : e.status === 'error' ? '✗' : e.status === 'warn' ? '!' : '·'
  const tail: string[] = []

  if (typeof e.httpStatus === 'number') {
    tail.push(`HTTP ${e.httpStatus}`)
  }

  if (typeof e.bytes === 'number') {
    tail.push(`${e.bytes} bytes`)
  }

  if (typeof e.durationMs === 'number') {
    tail.push(`${e.durationMs}ms`)
  }

  if (e.url) {
    tail.push(e.url)
  }

  if (e.error) {
    tail.push(`error=${e.error}`)
  }

  const tailStr = tail.length > 0 ? ` (${tail.join(', ')})` : ''

  return `${e.ts} +${e.elapsedMs}ms ${status} ${tag} ${e.message}${tailStr}`
}

// One `appendFile` per entry — flushes to disk per call, so a tail -f on log.txt updates in
// real time during a long extract. Calls are chained on a single promise to preserve order
// without blocking the caller (log() is sync from the caller's perspective).
export const createLogger = async (runDir: string): Promise<Logger> => {
  await ensureDir(runDir)
  const jsonlPath = resolve(runDir, 'log.jsonl')
  const txtPath = resolve(runDir, 'log.txt')
  const start = Date.now()
  let pending: Promise<unknown> = Promise.resolve()

  const make = (defaults: Partial<LogEntry>): Logger => ({
    log: (entry) => {
      const full = {
        ...defaults,
        ...entry,
        ts: new Date().toISOString(),
        elapsedMs: Date.now() - start,
      } as LogEntry
      const jsonl = `${JSON.stringify(full)}\n`
      const txt = `${formatHuman(full)}\n`

      console.log(formatHuman(full))

      pending = pending
        .then(() => appendFile(jsonlPath, jsonl, 'utf8'))
        .then(() => appendFile(txtPath, txt, 'utf8'))
        .catch((e) => console.error('logger write failed', e))
    },
    child: (more) => make({ ...defaults, ...more }),
    close: async () => {
      await pending
    },
  })

  return make({})
}
