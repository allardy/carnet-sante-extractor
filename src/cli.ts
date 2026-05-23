import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { attachCapture, writeCaptureIndex } from './browser/capture.js'
import { launchSession } from './browser/session.js'
import { collectors } from './collectors/index.js'
import { config } from './config.js'
import { ensureDir } from './util/fs.js'
import { log } from './util/log.js'

const waitForEnter = async (prompt: string): Promise<void> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  await rl.question(prompt)
  rl.close()
}

const recon = async (): Promise<void> => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = resolve(config.reconDir, stamp)

  await ensureDir(dir)

  log.step('Recon — recording all network traffic')
  const session = await launchSession({ recordHarPath: resolve(dir, 'session.har'), reuseState: true })
  const { store, detach } = attachCapture(session.context, resolve(dir, 'responses'))

  await session.page.goto(config.carnetUrl)
  log.info(`Browser open at ${config.carnetUrl}`)
  log.info('Log in, then click through every section you want to map.')
  await waitForEnter('\nPress Enter here when you are done to save the recording... ')

  detach()
  await writeCaptureIndex(dir, store)
  await session.saveState()
  await session.close()
  log.info(`Recon saved to ${dir} — ${store.json.length} JSON responses, ${store.binaries.length} binaries flagged.`)
}

const login = async (): Promise<void> => {
  log.step('Login — establish + persist a session')
  const session = await launchSession({ reuseState: true })

  await session.page.goto(config.carnetUrl)
  log.info('Log in, then press Enter to save the session.')
  await waitForEnter('\nPress Enter when logged in... ')
  await session.saveState()
  await session.close()
}

const run = async (): Promise<void> => {
  if (collectors.length === 0) {
    log.warn('No collectors registered yet. Run `recon` first, then implement collectors (build steps 3-4).')

    return
  }

  log.warn('run: orchestration is wired up as collectors are added.')
}

const normalize = async (): Promise<void> => {
  log.warn('normalize: implemented alongside collectors (build step 3+).')
}

const commands: Record<string, () => Promise<void>> = { recon, login, run, normalize }

const main = async (): Promise<void> => {
  const name = process.argv[2]
  const handler = name ? commands[name] : undefined

  if (!handler) {
    log.info('Usage: carnet-extract <recon|run|normalize|login>')
    process.exitCode = name ? 1 : 0

    return
  }

  await handler()
}

main().catch((error) => {
  log.error('fatal', (error as Error).stack ?? error)
  process.exitCode = 1
})
