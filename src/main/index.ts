import { app, ipcMain, Menu, type MenuItemConstructorOptions, session, shell, type WebContents } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { collectors } from '../collectors/index.js'
import { config } from '../config.js'
import { ACCEPT_LANGUAGE, BROWSER_USER_AGENT, CARNET_API_BASE } from '../constants.js'
import { type Locale } from '../shared/i18n.js'
import { IPC, type ExtractProgressPayload, type ProgressPayload } from '../shared/ipc.js'

import { authHeaders, installAuthCapture, seedAuthFromSessionStorage } from './auth.js'
import { type CaptureHandle, startCapture } from './capture.js'
import { downloadCaptured } from './downloader.js'
import { runExtraction } from './orchestrator.js'
import { type AppWindow, createWindow, type RendererEntry } from './window.js'

const localRunId = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`
}

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
let currentLocale: Locale = 'fr'

const detectLocale = async (siteContents: WebContents): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 200))

    try {
      const text = (await siteContents.executeJavaScript(
        `(document.querySelector('h1, h2, [class*="title"], [class*="header"]')?.textContent ?? '').trim()`,
      )) as string

      if (text.includes('Health Booklet')) {
        send(IPC.siteLocale, 'en' satisfies Locale)

        return
      }

      if (text.includes('Carnet') || text.includes('santé') || text.includes('Santé')) {
        send(IPC.siteLocale, 'fr' satisfies Locale)

        return
      }
    } catch {
      // frame not ready yet — retry
    }
  }
}

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
    const runId = localRunId()
    const runDir = resolve(config.baseDir, runId, 'capture-brute')

    capture = await startCapture(win.site.webContents, runDir, (counts) =>
      send(IPC.captureProgress, { phase: 'capturing', ...counts } satisfies ProgressPayload),
    )
    send(IPC.captureProgress, {
      phase: 'capturing',
      json: 0,
      binaries: 0,
    } satisfies ProgressPayload)
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
  const target = await mostRecentRunDir(config.baseDir).catch(() => config.baseDir)

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
    const runId = localRunId()
    const runDir = resolve(config.baseDir, runId)
    const runRawDir = resolve(runDir, 'capture-brute')

    try {
      await seedAuthFromSessionStorage(win.site.webContents)
      await runExtraction(
        win.site.webContents,
        sess,
        runDir,
        runRawDir,
        currentLocale,
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
            itemsDone: e.itemsDone,
            itemsTotal: e.itemsTotal,
            itemLabel: e.itemLabel,
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

  // Forward locale and auth-state reports from the site preload to the toolbar.
  ipcMain.on(IPC.siteLocale, (_event, locale: unknown) => {
    if (locale === 'fr' || locale === 'en') {
      currentLocale = locale
    }

    send(IPC.siteLocale, locale)
  })
  ipcMain.on(IPC.siteAuthState, (_event, loggedIn: unknown) => send(IPC.siteAuthState, loggedIn))
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
  const sitePreloadPath = join(import.meta.dirname, '../preload/site.mjs')

  config.baseDir = join(app.getPath('home'), 'carnet-sante-extractor')

  win = createWindow(rendererEntry(), preloadPath, sitePreloadPath)
  win.site.webContents.on('did-navigate', (_event, url) => {
    win?.toolbar.webContents.send(IPC.siteUrl, url)
    void detectLocale(win!.site.webContents)
  })
  win.site.webContents.on('did-navigate-in-page', (_event, url) => {
    win?.toolbar.webContents.send(IPC.siteUrl, url)
    void detectLocale(win!.site.webContents)
  })

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
