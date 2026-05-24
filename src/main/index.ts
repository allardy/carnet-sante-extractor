import { app, ipcMain, Menu, type MenuItemConstructorOptions, session, shell, type WebContents } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { config } from '../config.js'
import { ACCEPT_LANGUAGE, BROWSER_USER_AGENT, CARNET_API_BASE } from '../constants.js'
import { IPC, type ExtractProgressPayload, type ProgressPayload } from '../shared/ipc.js'

import { authHeaders, installAuthCapture, seedAuthFromSessionStorage } from './auth.js'
import { type CaptureHandle, startCapture } from './capture.js'
import { downloadCaptured } from './downloader.js'
import { runExtraction } from './orchestrator.js'
import { type AppWindow, createWindow, type RendererEntry } from './window.js'

const mostRecentRunDir = async (parent: string): Promise<string> => {
  const entries = await readdir(parent)
  const dirs = (
    await Promise.all(
      entries.map(async (name) => {
        const full = resolve(parent, name)
        const s = await stat(full)

        return s.isDirectory() ? { name, full, mtime: s.mtimeMs } : null
      }),
    )
  ).filter((d): d is { name: string; full: string; mtime: number } => d !== null)

  if (dirs.length === 0) {
    return parent
  }

  dirs.sort((a, b) => b.mtime - a.mtime)

  return dirs[0]!.full
}

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

// Capture/open are exposed both as IPC handlers (legacy toolbar buttons) and as native
// debug-menu actions, so the logic lives in plain functions both call.
const startCaptureRun = async (): Promise<void> => {
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
}

const stopCaptureRun = async (): Promise<void> => {
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
}

const openOutputFolder = async (): Promise<void> => {
  // Prefer the most recent extract run (output/<run>) — that's the clean deliverable.
  // Fall back to the most recent capture run (raw/<run>) if no extract has happened yet,
  // then to the base rawDir if neither exists.
  const target = await mostRecentRunDir(config.outputDir)
    .catch(() => mostRecentRunDir(config.rawDir))
    .catch(() => config.rawDir)

  await shell.openPath(target)
}

const wireIpc = (): void => {
  ipcMain.handle(IPC.captureStart, () => startCaptureRun())
  ipcMain.handle(IPC.captureStop, () => stopCaptureRun())
  ipcMain.handle(IPC.openOutput, () => openOutputFolder())

  // The toolbar's ⚙ button asks main to pop a native menu. A native popup isn't clipped by the
  // toolbar WebContentsView's 56px bounds the way an HTML dropdown would be.
  ipcMain.handle(IPC.debugMenu, () => {
    if (!win) {
      return
    }

    const template: MenuItemConstructorOptions[] = [
      { label: 'Debug tools', enabled: false },
      { type: 'separator' },
      capture
        ? { label: 'Stop capture & save', click: () => void stopCaptureRun() }
        : { label: 'Start capture', click: () => void startCaptureRun() },
      { label: 'Open output folder', click: () => void openOutputFolder() },
      { type: 'separator' },
      { label: 'DevTools — site', click: () => win?.site.webContents.toggleDevTools() },
      { label: 'DevTools — toolbar', click: () => win?.toolbar.webContents.toggleDevTools() },
    ]

    Menu.buildFromTemplate(template).popup()
  })

  ipcMain.handle(IPC.extractStart, async () => {
    if (!win) {
      return
    }

    const sess = session.fromPartition(config.partitionName)
    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const runRawDir = resolve(config.rawDir, runId)
    const runOutputDir = resolve(config.outputDir, runId)

    try {
      await seedAuthFromSessionStorage(win.site.webContents)
      await runExtraction(
        win.site.webContents,
        sess,
        runOutputDir,
        runRawDir,
        async () => {
          const url = `${CARNET_API_BASE}/Citoyens`
          const r = await sess.fetch(url, { headers: authHeaders(url) })

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
      // runExtraction already emitted an error progress event with accurate domainsDone — we
      // just log here as a safety net in case something escaped the orchestrator's try/finally.
      console.error('[extract] runExtraction threw past its handler', err)
    }
  })

  ipcMain.handle(IPC.extractStop, () => {
    // Phase 3a: no cancellation support; extract runs to completion. Phase 3b can add an AbortController.
  })
}

void app.whenReady().then(() => {
  // BaseWindow has no own webContents, so the default app menu's role-based "Toggle Developer Tools"
  // crashes when clicked. Drop the default menu — F12 still toggles DevTools via the binding below.
  Menu.setApplicationMenu(null)

  // Override the partition's UA to a plain Chrome string. Electron's default UA contains "Electron/<v>",
  // which carnetsante.gouv.qc.ca treats as a non-browser client and 403s on its API. This affects every
  // request on the partition (the embedded WebView and any session.fetch from the main process).
  const partitionSession = session.fromPartition(config.partitionName)

  partitionSession.setUserAgent(BROWSER_USER_AGENT, ACCEPT_LANGUAGE)

  // Intercept the partition's outgoing requests to capture the SPA's Bearer JWT (Angular
  // attaches it via HttpInterceptor; we have no other way to read it). Captured token is
  // then replayed by session.fetch calls from Navigator/orchestrator/downloader/citizenId.
  installAuthCapture(partitionSession)

  const preloadPath = join(import.meta.dirname, '../preload/index.mjs')

  const base = join(app.getPath('home'), 'carnet-sante-extractor')

  config.outputDir = join(base, 'output')
  config.rawDir = join(base, 'raw')

  win = createWindow(rendererEntry(), preloadPath)
  win.site.webContents.on('did-navigate', (_event, url) => win?.toolbar.webContents.send(IPC.siteUrl, url))
  win.site.webContents.on('did-navigate-in-page', (_event, url) => win?.toolbar.webContents.send(IPC.siteUrl, url))

  // BaseWindow has no own webContents, so the default menu's toggleDevTools target is undefined
  // and the role-based binding crashes. Bind F12 directly to each WebContentsView instead.
  const bindDevTools = (wc: WebContents): void => {
    wc.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        wc.toggleDevTools()
      }
    })
  }

  bindDevTools(win.site.webContents)
  bindDevTools(win.toolbar.webContents)
  wireIpc()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
