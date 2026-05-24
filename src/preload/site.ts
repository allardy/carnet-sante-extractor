import { ipcRenderer } from 'electron'

import { IPC } from '../shared/ipc.js'

// Re-read the current heading text and send the detected locale to main.
// Retries up to `attempts` times so Angular's translate pipe has time to update.
const retryDetectLocale = (attempts = 5): void => {
  const text = (document.querySelector('h1, h2, [class*="title"], [class*="header"]')?.textContent ?? '').trim()

  if (text.includes('Health Booklet')) {
    ipcRenderer.send(IPC.siteLocale, 'en')
  } else if (text.includes('Carnet') || text.includes('santé') || text.includes('Santé')) {
    ipcRenderer.send(IPC.siteLocale, 'fr')
  } else if (attempts > 1) {
    setTimeout(() => retryDetectLocale(attempts - 1), 200)
  }
}

const checkAuth = (): void => {
  const loggedIn = !!document.querySelector('.prenom.ng-binding')

  ipcRenderer.send(IPC.siteAuthState, loggedIn)
}

const setup = (): void => {
  // Language toggle button click — delegated so Angular-rendered buttons are caught
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.langue')) {
      setTimeout(() => retryDetectLocale(), 200)
    }
  })

  // Auth state — MutationObserver detects when .prenom appears/disappears
  let authTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleAuthCheck = (): void => {
    if (authTimer !== null) {
      clearTimeout(authTimer)
    }

    authTimer = setTimeout(checkAuth, 100)
  }

  new MutationObserver(scheduleAuthCheck).observe(document.body, { childList: true, subtree: true })
  checkAuth()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup)
} else {
  setup()
}
