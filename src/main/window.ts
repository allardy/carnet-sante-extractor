import { BaseWindow, WebContentsView } from 'electron'

import { config } from '../config.js'

export type AppWindow = {
  window: BaseWindow
  toolbar: WebContentsView
  site: WebContentsView
}

export type RendererEntry = { url?: string; file?: string }

export const createWindow = (entry: RendererEntry, preloadPath: string): AppWindow => {
  const window = new BaseWindow({
    width: config.windowWidth,
    height: config.windowHeight,
    title: 'Carnet Santé Extract',
  })

  const toolbar = new WebContentsView({ webPreferences: { preload: preloadPath, sandbox: false } })
  const site = new WebContentsView({ webPreferences: { partition: config.partitionName } })

  window.contentView.addChildView(toolbar)
  window.contentView.addChildView(site)

  const layout = (): void => {
    const { width, height } = window.getContentBounds()

    toolbar.setBounds({ x: 0, y: 0, width, height: config.toolbarHeight })
    site.setBounds({ x: 0, y: config.toolbarHeight, width, height: height - config.toolbarHeight })
  }

  layout()
  window.on('resize', layout)

  if (entry.url) {
    void toolbar.webContents.loadURL(entry.url)
  } else if (entry.file) {
    void toolbar.webContents.loadFile(entry.file)
  }

  void site.webContents.loadURL(config.carnetUrl)

  return { window, toolbar, site }
}
