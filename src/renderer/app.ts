import { strings, type Locale } from '../shared/i18n.js'

const startEl = document.querySelector<HTMLButtonElement>('#start')!
const openEl = document.querySelector<HTMLButtonElement>('#open')!
const debugEl = document.querySelector<HTMLButtonElement>('#debug')!
const stepEl = document.querySelector<HTMLSpanElement>('#step')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const fillEl = document.querySelector<HTMLDivElement>('#progress-fill')!

type StepState = '' | 'done' | 'error'

let locale: Locale = 'fr'
let extracting = false
let idle = true
let loggedIn = false

const s = (): (typeof strings)[Locale] => strings[locale]

const applyLocale = (): void => {
  document.documentElement.lang = locale
  openEl.textContent = s().outputButton
  debugEl.title = s().debugTitle
  debugEl.setAttribute('aria-label', s().debugTitle)

  if (!extracting) {
    startEl.disabled = !loggedIn
    startEl.textContent = s().extractButton
  }

  if (idle) {
    stepEl.textContent = s().initialStep
    stepEl.className = ''
  }
}

const setStep = (text: string, state: StepState = ''): void => {
  stepEl.textContent = text
  stepEl.className = state
}

const setProgress = (pct: number, state: StepState = ''): void => {
  progressEl.hidden = false
  progressEl.className = `progress${state ? ` ${state}` : ''}`
  fillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`
}

applyLocale()

window.api.onSiteAuthState((state) => {
  loggedIn = state

  if (!extracting) {
    startEl.disabled = !loggedIn
  }
})

startEl.addEventListener('click', () => {
  if (extracting) {
    return
  }

  void window.api.startExtract()
})

openEl.addEventListener('click', () => void window.api.openOutput())
debugEl.addEventListener('click', () => void window.api.openDebugMenu())

window.api.onSiteLocale((newLocale) => {
  locale = newLocale
  applyLocale()
})

window.api.onExtractProgress((p) => {
  extracting = p.phase === 'running' || p.phase === 'normalizing' || p.phase === 'writing'
  startEl.disabled = extracting || !loggedIn
  startEl.textContent = extracting ? s().extractingButton : s().extractButton

  switch (p.phase) {
    case 'running': {
      idle = false
      const within = p.itemsTotal && p.itemsTotal > 0 ? (p.itemsDone ?? 0) / p.itemsTotal : 0
      const pct = p.domainsTotal > 0 ? ((p.domainsDone + within) / p.domainsTotal) * 90 : 0
      const sub =
        p.itemsTotal && p.itemsTotal > 0 ? ` · ${p.itemLabel ?? 'item'} ${p.itemsDone ?? 0}/${p.itemsTotal}` : ''

      setProgress(pct)
      setStep(
        p.currentDomain
          ? s().collectingStep(s().domainName(p.currentDomain), p.domainsDone, p.domainsTotal, sub)
          : s().startingStep,
      )
      break
    }
    case 'normalizing':
      setProgress(93)
      setStep(s().normalizingStep)
      break
    case 'writing':
      setProgress(97)
      setStep(s().writingStep)
      break
    case 'done':
      setProgress(100, 'done')
      setStep(s().doneStep, 'done')
      startEl.textContent = s().extractAgainButton
      break
    case 'error':
      setProgress(100, 'error')
      setStep(s().errorStep(p.error ?? 'extraction failed'), 'error')
      startEl.title = p.error ?? ''
      startEl.textContent = s().tryAgainButton
      break
  }
})
