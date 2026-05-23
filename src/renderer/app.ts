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
