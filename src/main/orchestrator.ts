import { type Session, type WebContents } from 'electron'
import { resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { type DocumentDescriptor } from '../collectors/types.js'
import { type Domain } from '../config.js'
import { writeOutput } from '../output/writer.js'
import { type Locale } from '../shared/i18n.js'
import { ensureDir, writeBuffer, writeJson } from '../util/fs.js'

import { authHeaders } from './auth.js'
import { createLogger } from './logger.js'
import { createNavigator } from './navigator.js'

export type ProgressCallback = (event: {
  phase: 'running' | 'normalizing' | 'writing' | 'done' | 'error'
  currentDomain?: string
  domainsDone: number
  domainsTotal: number
  itemsDone?: number
  itemsTotal?: number
  itemLabel?: string
  error?: string
  // Domains that failed to collect but were skipped so the run could finish. Present on the
  // `done` event when the run completed with partial data.
  failedDomains?: string[]
}) => void

export const runExtraction = async (
  webContents: WebContents,
  session: Session,
  outputDir: string,
  rawDir: string,
  locale: Locale,
  citizenIdFetcher: () => Promise<string>,
  onProgress: ProgressCallback,
): Promise<void> => {
  const logger = await createLogger(rawDir)
  const total = collectors.length
  let domainsDone = 0
  let currentDomain: string | undefined
  const failedDomains: string[] = []

  logger.log({ phase: 'extract', status: 'start', message: 'run begin', detail: { rawDir, outputDir } })

  try {
    const nav = createNavigator(webContents, session, logger)
    const citizenId = await citizenIdFetcher()

    logger.log({ phase: 'extract', status: 'ok', message: `bootstrap citizenId=${citizenId}` })

    const capture = { json: [], binaries: [] }
    const ctx = { nav, capture, citizenId }
    const collected: Record<Domain, unknown> = {} as Record<Domain, unknown>
    const rawDataDir = resolve(rawDir, 'data')
    const rawDocsDir = resolve(rawDir, 'documents')

    await ensureDir(rawDataDir)
    await ensureDir(rawDocsDir)

    const localDocs: { descriptor: DocumentDescriptor; localPath: string }[] = []

    for (const [i, c] of collectors.entries()) {
      currentDomain = c.domain
      onProgress({ phase: 'running', currentDomain: c.domain, domainsDone: i, domainsTotal: total })
      logger.log({ phase: 'collect', domain: c.domain, status: 'start', message: 'begin' })
      const t0 = Date.now()

      try {
        const result = await c.collect({
          ...ctx,
          onItem: (done, itemsTotal, itemLabel) =>
            onProgress({
              phase: 'running',
              currentDomain: c.domain,
              domainsDone: i,
              domainsTotal: total,
              itemsDone: done,
              itemsTotal,
              itemLabel,
            }),
        })
        const durationMs = Date.now() - t0

        collected[result.domain] = result.raw
        await writeJson(resolve(rawDataDir, `${result.domain}.json`), result.raw)
        logger.log({
          phase: 'collect',
          domain: result.domain,
          status: 'ok',
          message: `wrote data/${result.domain}.json (${result.documents.length} docs flagged)`,
          durationMs,
        })

        for (const [di, d] of result.documents.entries()) {
          const dt0 = Date.now()

          try {
            let buf: Buffer

            if (d.inlineData) {
              buf = Buffer.from(d.inlineData, 'base64')
            } else {
              const r = await session.fetch(d.url, { headers: authHeaders(d.url) })

              if (!r.ok) {
                throw new Error(`HTTP ${r.status}`)
              }

              buf = Buffer.from(await r.arrayBuffer())
            }

            const localPath = resolve(rawDocsDir, `${d.id}.pdf`)

            await writeBuffer(localPath, buf)
            localDocs.push({ descriptor: d, localPath })
            logger.log({
              phase: 'pdf',
              domain: result.domain,
              status: 'ok',
              message: d.id,
              url: d.url || '(inline)',
              bytes: buf.length,
              durationMs: Date.now() - dt0,
            })
          } catch (err) {
            await writeJson(resolve(rawDocsDir, `${d.id}.error.json`), {
              url: d.url,
              error: (err as Error).message,
            })
            logger.log({
              phase: 'pdf',
              domain: result.domain,
              status: 'error',
              message: d.id,
              url: d.url || '(inline)',
              durationMs: Date.now() - dt0,
              error: (err as Error).message,
            })
          }

          onProgress({
            phase: 'running',
            currentDomain: result.domain,
            domainsDone: i,
            domainsTotal: total,
            itemsDone: di + 1,
            itemsTotal: result.documents.length,
            itemLabel: 'PDF',
          })
        }

        domainsDone += 1
      } catch (err) {
        // One domain failing must never abort the run. Log it, record the raw error as a fallback
        // so the section isn't silently empty, flag the domain as failed, and move on — the same
        // tolerance the PDF loop above and writeOutput already apply. The run finishes with
        // whatever collected, and `failedDomains` is surfaced on the `done` event.
        logger.log({
          phase: 'collect',
          domain: c.domain,
          status: 'error',
          message: 'failed',
          durationMs: Date.now() - t0,
          error: (err as Error).message,
        })
        await writeJson(resolve(rawDataDir, `${c.domain}.error.json`), { error: (err as Error).message })
        failedDomains.push(c.domain)
      }
    }

    currentDomain = undefined
    onProgress({ phase: 'normalizing', domainsDone, domainsTotal: total })
    logger.log({ phase: 'normalize', status: 'start', message: 'writeOutput begin' })
    const wt0 = Date.now()

    // writeOutput is now per-domain-tolerant — see writer.ts. Failures of individual domains
    // are logged + recorded against the manifest; the run still produces partial output.
    await writeOutput(
      {
        profile: collected.profile,
        medications: collected.medications,
        appointments: collected.appointments,
        medicalServices: collected['medical-services'],
        imaging: collected.imaging,
        labs: collected.labs,
        access: collected.access,
        documents: localDocs,
      },
      outputDir,
      locale,
      logger,
    )

    logger.log({ phase: 'normalize', status: 'ok', message: 'writeOutput done', durationMs: Date.now() - wt0 })
    onProgress({ phase: 'done', domainsDone, domainsTotal: total, failedDomains })
    logger.log({
      phase: 'extract',
      status: 'ok',
      message: failedDomains.length > 0 ? `run complete (failed: ${failedDomains.join(', ')})` : 'run complete',
    })
  } catch (err) {
    const message = (err as Error).message

    onProgress({
      phase: 'error',
      currentDomain,
      domainsDone,
      domainsTotal: total,
      error: message,
    })
    logger.log({ phase: 'extract', status: 'error', message: 'run aborted', error: message })
    throw err
  } finally {
    await logger.close()
  }
}
