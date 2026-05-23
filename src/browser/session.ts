import { type BrowserContext, type Page, chromium } from 'playwright'

import { config } from '../config.js'
import { ensureDir, fileExists } from '../util/fs.js'
import { log } from '../util/log.js'

export type Session = {
  context: BrowserContext
  page: Page
  saveState: () => Promise<void>
  close: () => Promise<void>
}

export type LaunchOptions = {
  // When set, the whole context's network is recorded to this HAR file.
  recordHarPath?: string
  // Reuse a previously saved session (default true).
  reuseState?: boolean
}

export const launchSession = async (options: LaunchOptions = {}): Promise<Session> => {
  const { recordHarPath, reuseState = true } = options

  await ensureDir(config.authDir)

  const hasState = reuseState && (await fileExists(config.storageStatePath))
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    acceptDownloads: true,
    storageState: hasState ? config.storageStatePath : undefined,
    ...(recordHarPath ? { recordHar: { path: recordHarPath, content: 'embed' } } : {}),
  })

  if (hasState) {
    log.info('Reusing saved session from .auth/storage-state.json')
  }

  const page = await context.newPage()

  const saveState = async (): Promise<void> => {
    await context.storageState({ path: config.storageStatePath })
    log.info('Session saved to .auth/storage-state.json')
  }

  const close = async (): Promise<void> => {
    await context.close()
    await browser.close()
  }

  return { context, page, saveState, close }
}
