const statusEl = document.querySelector<HTMLSpanElement>('#status')!
const urlEl = document.querySelector<HTMLSpanElement>('#url')!
const toggleEl = document.querySelector<HTMLButtonElement>('#toggle')!
const openEl = document.querySelector<HTMLButtonElement>('#open')!

let capturing = false

toggleEl.addEventListener('click', () => {
  if (capturing) {
    void window.api.stopCapture()
    capturing = false
    toggleEl.textContent = 'Start capture'
  } else {
    void window.api.startCapture()
    capturing = true
    toggleEl.textContent = 'Stop & save'
  }
})

openEl.addEventListener('click', () => {
  void window.api.openOutput()
})

window.api.onSiteUrl((url) => {
  urlEl.textContent = url
})

window.api.onProgress((payload) => {
  const tail = payload.downloaded === undefined ? '' : `, ${payload.downloaded} downloaded`

  statusEl.textContent = `${payload.phase} — ${payload.json} JSON, ${payload.binaries} PDF${tail}`
  toggleEl.disabled = payload.phase === 'downloading'

  if (payload.phase === 'done') {
    capturing = false
    toggleEl.textContent = 'Start capture'
    toggleEl.disabled = false
  }
})

const extractEl = document.querySelector<HTMLButtonElement>('#extract')!
let extracting = false

extractEl.addEventListener('click', () => {
  if (extracting) {
    void window.api.stopExtract()
  } else {
    void window.api.startExtract()
  }
})

window.api.onExtractProgress((payload) => {
  extracting = payload.phase === 'running' || payload.phase === 'normalizing' || payload.phase === 'writing'
  extractEl.textContent = extracting ? 'Stop extract' : 'Extract everything'

  const parts: string[] = []

  if (payload.currentDomain) {
    parts.push(payload.currentDomain)
  }

  if (payload.error) {
    parts.push(payload.error)
  }

  const tail = parts.length > 0 ? ` — ${parts.join(' — ')}` : ''

  statusEl.textContent = `extract: ${payload.phase} (${payload.domainsDone}/${payload.domainsTotal})${tail}`
  statusEl.title = payload.error ?? ''
})
