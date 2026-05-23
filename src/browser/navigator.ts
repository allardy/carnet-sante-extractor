import { type Page, type Response } from 'playwright'

import { config } from '../config.js'
import { sleep } from '../util/concurrency.js'

// Navigate to a path (relative to carnetUrl) or absolute URL and settle the network.
export const goto = async (page: Page, pathOrUrl: string): Promise<void> => {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : new URL(pathOrUrl, config.carnetUrl).toString()

  await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(config.requestDelayMs)
}

// Resolve when a JSON response whose URL matches `match` arrives.
export const waitForJson = (page: Page, match: (url: string) => boolean, timeoutMs = 15_000): Promise<Response> =>
  page.waitForResponse((response) => match(response.url()), { timeout: timeoutMs })
