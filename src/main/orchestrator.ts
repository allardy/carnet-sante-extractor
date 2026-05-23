import { net, type Session, type WebContents } from 'electron'
import { resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { type DocumentDescriptor } from '../collectors/types.js'
import { type Domain } from '../config.js'
import { writeOutput } from '../output/writer.js'
import { ensureDir, writeBuffer } from '../util/fs.js'

import { createNavigator } from './navigator.js'

export type ProgressCallback = (event: {
  phase: 'running' | 'normalizing' | 'writing' | 'done' | 'error'
  currentDomain?: string
  domainsDone: number
  domainsTotal: number
  error?: string
}) => void

export const runExtraction = async (
  webContents: WebContents,
  session: Session,
  outputDir: string,
  rawDir: string,
  citizenIdFetcher: () => Promise<string>,
  onProgress: ProgressCallback,
): Promise<void> => {
  const nav = createNavigator(webContents, session)
  const citizenId = await citizenIdFetcher()
  const capture = { json: [], binaries: [] }
  const ctx = { nav, capture, citizenId }

  const total = collectors.length
  const collected: Record<Domain, unknown> = {} as Record<Domain, unknown>
  const allDocs: DocumentDescriptor[] = []

  for (const [i, c] of collectors.entries()) {
    onProgress({ phase: 'running', currentDomain: c.domain, domainsDone: i, domainsTotal: total })

    try {
      const result = await c.collect(ctx)

      collected[result.domain] = result.raw
      allDocs.push(...result.documents)
    } catch (err) {
      throw new Error(`${c.domain}: ${(err as Error).message}`, { cause: err })
    }
  }

  onProgress({ phase: 'normalizing', domainsDone: total, domainsTotal: total })
  await ensureDir(resolve(rawDir, 'documents'))
  const localDocs: { descriptor: DocumentDescriptor; localPath: string }[] = []

  for (const d of allDocs) {
    const r = await net.fetch(d.url, { session, useSessionCookies: true } as never)

    if (!r.ok) {
      throw new Error(`document ${d.id}: HTTP ${r.status}`)
    }

    const buf = Buffer.from(await r.arrayBuffer())
    const localPath = resolve(rawDir, 'documents', `${d.id}.pdf`)

    await writeBuffer(localPath, buf)
    localDocs.push({ descriptor: d, localPath })
  }

  onProgress({ phase: 'writing', domainsDone: total, domainsTotal: total })
  await writeOutput(
    {
      profile: collected.profile as never,
      medications: collected.medications,
      appointments: collected.appointments,
      medicalServices: collected['medical-services'],
      imaging: collected.imaging as never,
      labs: collected.labs as never,
      documents: localDocs,
    },
    outputDir,
  )

  onProgress({ phase: 'done', domainsDone: total, domainsTotal: total })
}
