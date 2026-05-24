const startEl = document.querySelector<HTMLButtonElement>('#start')!
const openEl = document.querySelector<HTMLButtonElement>('#open')!
const debugEl = document.querySelector<HTMLButtonElement>('#debug')!
const stepEl = document.querySelector<HTMLSpanElement>('#step')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const fillEl = document.querySelector<HTMLDivElement>('#progress-fill')!

type StepState = '' | 'done' | 'error'

const prettyDomain = (d: string): string => d.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const setStep = (text: string, state: StepState = ''): void => {
  stepEl.textContent = text
  stepEl.className = state
}

const setProgress = (pct: number, state: StepState = ''): void => {
  progressEl.hidden = false
  progressEl.className = `progress${state ? ` ${state}` : ''}`
  fillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`
}

let extracting = false

startEl.addEventListener('click', () => {
  if (extracting) {
    return
  }

  void window.api.startExtract()
})

openEl.addEventListener('click', () => void window.api.openOutput())
debugEl.addEventListener('click', () => void window.api.openDebugMenu())

window.api.onExtractProgress((p) => {
  extracting = p.phase === 'running' || p.phase === 'normalizing' || p.phase === 'writing'
  startEl.disabled = extracting
  startEl.textContent = extracting ? 'Extracting…' : 'Extract my health record'

  switch (p.phase) {
    case 'running': {
      // Reserve the last 10% for the normalize + write phases so the bar never sits at 100% early.
      const pct = p.domainsTotal > 0 ? (p.domainsDone / p.domainsTotal) * 90 : 0

      setProgress(pct)
      setStep(
        p.currentDomain
          ? `Collecting — ${prettyDomain(p.currentDomain)} (${p.domainsDone}/${p.domainsTotal})`
          : 'Starting…',
      )
      break
    }
    case 'normalizing':
      setProgress(93)
      setStep('Normalizing records…')
      break
    case 'writing':
      setProgress(97)
      setStep('Writing Markdown, JSON & PDFs…')
      break
    case 'done':
      setProgress(100, 'done')
      setStep('Done — your health record is ready. Open the output folder.', 'done')
      startEl.textContent = 'Extract again'
      break
    case 'error':
      setProgress(100, 'error')
      setStep(`Error: ${p.error ?? 'extraction failed'}`, 'error')
      startEl.title = p.error ?? ''
      startEl.textContent = 'Try again'
      break
  }
})

// Capture is a debugging flow (started from the ⚙ menu). It shares the step line.
window.api.onProgress((p) => {
  const tail = p.downloaded === undefined ? '' : `, ${p.downloaded} downloaded`

  if (p.phase === 'done') {
    setStep(`Capture saved — ${p.json} JSON, ${p.binaries} PDF${tail}.`, 'done')
  } else {
    setStep(`Capturing — ${p.json} JSON, ${p.binaries} PDF${tail}…`)
  }
})
