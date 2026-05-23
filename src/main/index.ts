import { app, ipcMain, session, shell } from 'electron'
import { join, resolve } from 'node:path'

import { config } from '../config.js'
import { IPC, type ProgressPayload } from '../shared/ipc.js'

import { type CaptureHandle, startCapture } from './capture.js'
import { downloadCaptured } from './downloader.js'
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
      capture = await startCapture(win.site.webContents, resolve(config.rawDir, 'responses'), (counts) =>
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

    const { store } = capture

    await capture.stop()
    capture = undefined
    send(IPC.captureProgress, {
      phase: 'downloading',
      json: store.json.length,
      binaries: store.binaries.length,
    } satisfies ProgressPayload)

    const ses = session.fromPartition(config.partitionName)
    const downloaded = await downloadCaptured(ses, store.binaries, resolve(config.rawDir, 'documents'))

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
}

void app.whenReady().then(() => {
  const preloadPath = join(import.meta.dirname, '../preload/index.mjs')

  config.outputDir = join(app.getPath('documents'), 'carnet-sante-extract', 'output')
  config.rawDir = join(app.getPath('documents'), 'carnet-sante-extract', 'raw')

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
