import { app, ipcMain, net, session, shell } from 'electron'
import { join, resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { config } from '../config.js'
import { IPC, type ExtractProgressPayload, type ProgressPayload } from '../shared/ipc.js'

import { type CaptureHandle, startCapture } from './capture.js'
import { downloadCaptured } from './downloader.js'
import { runExtraction } from './orchestrator.js'
import { type AppWindow, createWindow, type RendererEntry } from './window.js'

let win: AppWindow | undefined
let capture: CaptureHandle | undefined
let starting = false

const send = (channel: string, payload: unknown): void => win?.toolbar.webContents.send(channel, payload)

const rendererEntry = (): RendererEntry => {
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  if (devUrl) {
    return { url: devUrl }
  }

  return { file: join(import.meta.dirname, '../renderer/index.html') }
}

const wireIpc = (): void => {
  ipcMain.handle(IPC.captureStart, async () => {
    if (!win || capture || starting) {
      return
    }

    starting = true

    try {
      const runId = new Date().toISOString().replace(/[:.]/g, '-')
      const runDir = resolve(config.rawDir, runId)

      capture = await startCapture(win.site.webContents, runDir, (counts) =>
        send(IPC.captureProgress, { phase: 'capturing', ...counts } satisfies ProgressPayload),
      )
      send(IPC.captureProgress, { phase: 'capturing', json: 0, binaries: 0 } satisfies ProgressPayload)
    } finally {
      starting = false
    }
  })

  ipcMain.handle(IPC.captureStop, async () => {
    if (!capture) {
      return
    }

    const { store, runDir } = capture

    await capture.stop()
    capture = undefined
    send(IPC.captureProgress, {
      phase: 'downloading',
      json: store.json.length,
      binaries: store.binaries.length,
    } satisfies ProgressPayload)

    const ses = session.fromPartition(config.partitionName)
    const downloaded = await downloadCaptured(ses, store.binaries, resolve(runDir, 'documents'))

    send(IPC.captureProgress, {
      phase: 'done',
      json: store.json.length,
      binaries: store.binaries.length,
      downloaded,
    } satisfies ProgressPayload)
  })

  ipcMain.handle(IPC.openOutput, async () => {
    await shell.openPath(config.rawDir)
  })

  ipcMain.handle(IPC.extractStart, async () => {
    if (!win) {
      return
    }

    const sess = session.fromPartition(config.partitionName)
    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const runRawDir = resolve(config.rawDir, runId)

    try {
      await runExtraction(
        win.site.webContents,
        sess,
        config.outputDir,
        runRawDir,
        async () => {
          const r = await net.fetch('https://www.carnetsante.gouv.qc.ca/api/1/Citoyens', {
            session: sess,
            useSessionCookies: true,
          } as never)

          if (!r.ok) {
            throw new Error(`Citoyens: HTTP ${r.status}`)
          }

          const json = (await r.json()) as { IdCitoyen: string }

          return json.IdCitoyen
        },
        (e) =>
          send(IPC.extractProgress, {
            phase: e.phase,
            currentDomain: e.currentDomain,
            domainsDone: e.domainsDone,
            domainsTotal: e.domainsTotal,
            rawBytes: 0,
            downloads: 0,
            error: e.error,
          } satisfies ExtractProgressPayload),
      )
    } catch (err) {
      send(IPC.extractProgress, {
        phase: 'error',
        domainsDone: 0,
        domainsTotal: collectors.length,
        rawBytes: 0,
        downloads: 0,
        error: (err as Error).message,
      } satisfies ExtractProgressPayload)
    }
  })

  ipcMain.handle(IPC.extractStop, () => {
    // Phase 3a: no cancellation support; extract runs to completion. Phase 3b can add an AbortController.
  })
}

void app.whenReady().then(() => {
  const preloadPath = join(import.meta.dirname, '../preload/index.mjs')

  const base = join(app.getPath('home'), 'carnet-sante-extract')

  config.outputDir = join(base, 'output')
  config.rawDir = join(base, 'raw')

  win = createWindow(rendererEntry(), preloadPath)
  win.site.webContents.on('did-navigate', (_event, url) => win?.toolbar.webContents.send(IPC.siteUrl, url))
  win.site.webContents.on('did-navigate-in-page', (_event, url) => win?.toolbar.webContents.send(IPC.siteUrl, url))
  wireIpc()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
