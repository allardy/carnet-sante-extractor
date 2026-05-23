# carnet-sante-extract Electron (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-platform carnet-sante-extract from a CLI + Playwright tool into a double-click Windows Electron app that loads the real Carnet Santé site, lets the user log in (MFA included), then captures every JSON response + downloads every PDF the site emits while the user clicks through — writing a raw dump for later endpoint-mapping.

**Architecture:** Electron `BaseWindow` with two `WebContentsView`s — a thin control toolbar (our renderer) on top, the embedded `carnetsante.gouv.qc.ca` below. The site runs in a persistent session partition (cookies survive relaunch). The main process attaches the Chrome DevTools Protocol to the site's `webContents` to passively capture response bodies (replacing Playwright's `context.on('response')`), and downloads flagged PDFs via `net.fetch` with the partition's cookies. The pure normalize/output/util layers are reused untouched.

**Tech Stack:** Electron (ESM main), electron-vite (bundling + renderer HMR), electron-builder (NSIS installer), TypeScript (Bundler resolution), Chrome DevTools Protocol, vitest, oxlint + oxfmt, pnpm.

**Scope note:** This plan is **Phase 1** of the design at `docs/superpowers/specs/2026-05-23-carnet-sante-extract-electron-design.md`. Phase 2 (live recon by the user) and Phase 3 (targeted per-domain collectors built from the captured endpoint map) are separate and follow once Phase 1's capture has produced real fixtures. Writing their tasks now would be guesswork.

**Conventions (enforced by `pnpm check`):** no semicolons, single quotes, 2-space indent, 120 col, trailing commas, arrow functions over `function`, named exports only, relative imports keep `.js` extensions. `no-floating-promises` is an error → prefix fire-and-forget promises with `void`. A blank line is required before every `return`/`if`/`for`/`try` and after each `const`/`let` block (oxlint `@stylistic/padding-line-between-statements`). Run `pnpm fix` before every commit; it auto-fixes formatting + lint.

---

## File structure

**Created:**
- `src/capture/store.ts` — pure capture types + `classify`/`safeName`/`emptyStore` (no Electron). Shared by main + collectors + tests.
- `src/main/index.ts` — app lifecycle, base-dir setup, window creation, IPC wiring.
- `src/main/window.ts` — `BaseWindow` + toolbar/site `WebContentsView`s + resize layout.
- `src/main/capture.ts` — CDP debugger → `CaptureStore`, writes `raw/responses/`.
- `src/main/downloader.ts` — authed PDF fetch via `net.fetch` → `raw/documents/`.
- `src/preload/index.ts` — `contextBridge` API surface.
- `src/renderer/index.html`, `src/renderer/app.ts`, `src/renderer/styles.css`, `src/renderer/env.d.ts` — control toolbar UI.
- `src/shared/ipc.ts` — IPC channel constants + payload types (imported by main, preload, renderer).
- `electron.vite.config.ts` — electron-vite config (main/preload/renderer).
- `electron-builder.yml` — NSIS Windows packaging.
- `tests/capture-store.test.ts` — vitest for the pure capture helpers.

**Modified:**
- `package.json` — drop `playwright`/`tsx`, add electron toolchain, swap scripts, set `main`.
- `tsconfig.json` — NodeNext → Bundler resolution, add DOM lib, `noEmit`.
- `src/config.ts` — drop auth/recon/storage fields, add partition + window dims.
- `src/collectors/types.ts` — replace Playwright `Page` with a `Navigator` interface.
- `.gitignore` — add `out/`, `release/`.
- `README.md`, `CLAUDE.md` — reflect the Electron platform.

**Deleted:**
- `src/browser/` (session.ts, capture.ts, navigator.ts) — replaced by `src/main/*`.
- `src/cli.ts` — replaced by the Electron app.
- `src/download/downloader.ts` — replaced by `src/main/downloader.ts`.

**Reused unchanged:** `src/normalize/*`, `src/output/*`, `src/util/*`, `tests/{rename,manifest,markdown}.test.ts`.

---

## Task 1: Extract the pure capture store (TDD)

Additive — nothing else changes yet, so the repo stays green. This pulls the testable slug/classify logic out of the old Playwright `capture.ts` into a domain-pure module that both the new main process and future collectors will import.

**Files:**
- Create: `src/capture/store.ts`
- Test: `tests/capture-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/capture-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { classify, emptyStore, safeName } from '../src/capture/store.js'

describe('classify', () => {
  it('detects json', () => {
    expect(classify('application/json; charset=utf-8')).toBe('json')
  })

  it('detects pdf and octet-stream as binary', () => {
    expect(classify('application/pdf')).toBe('binary')
    expect(classify('application/octet-stream')).toBe('binary')
  })

  it('treats html and everything else as other', () => {
    expect(classify('text/html')).toBe('other')
  })
})

describe('safeName', () => {
  it('builds a zero-padded slug from the url path + query', () => {
    expect(safeName('https://carnetsante.gouv.qc.ca/api/labs?year=2026', 7)).toBe('0007-api-labs-year-2026')
  })

  it('falls back to root for unparseable urls', () => {
    expect(safeName('::: not a url :::', 0)).toBe('0000-root')
  })
})

describe('emptyStore', () => {
  it('starts with empty json and binaries arrays', () => {
    expect(emptyStore()).toEqual({ json: [], binaries: [] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test capture-store`
Expected: FAIL — cannot resolve `../src/capture/store.js`.

- [ ] **Step 3: Write the implementation**

Create `src/capture/store.ts`:

```ts
export type CapturedResponse = {
  url: string
  status: number
  method: string
  contentType: string
  file: string
}

export type CaptureStore = {
  json: CapturedResponse[]
  binaries: CapturedResponse[]
}

export type ResponseKind = 'json' | 'binary' | 'other'

export const emptyStore = (): CaptureStore => ({ json: [], binaries: [] })

export const classify = (contentType: string): ResponseKind => {
  const ct = contentType.toLowerCase()

  if (ct.includes('application/json')) {
    return 'json'
  }

  if (ct.includes('pdf') || ct.includes('octet-stream')) {
    return 'binary'
  }

  return 'other'
}

export const safeName = (url: string, index: number): string => {
  let slug = 'root'

  try {
    const parsed = new URL(url)

    slug =
      `${parsed.pathname}${parsed.search}`
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'root'
  } catch {
    // non-http url (data:, blob:) — keep the fallback slug
  }

  return `${String(index).padStart(4, '0')}-${slug}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test capture-store`
Expected: PASS — 3 suites, 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/capture/store.ts tests/capture-store.test.ts
git commit -m "feat: extract pure capture store (classify/safeName)"
```

---

## Task 2: Toolchain swap — remove Playwright, add Electron build

After this task there is no Electron runtime code yet, only pure TS — so `pnpm check:type` and `pnpm test` must stay green. The Electron app boots in Task 3.

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `src/config.ts` (full rewrite below)
- Modify: `src/collectors/types.ts` (full rewrite below)
- Delete: `src/browser/`, `src/cli.ts`, `src/download/downloader.ts`

- [ ] **Step 1: Delete the Playwright-coupled files**

```bash
git rm -r src/browser src/cli.ts src/download/downloader.ts
```

- [ ] **Step 2: Rewrite `src/config.ts`**

Replace the entire file with:

```ts
import { resolve } from 'node:path'

export type Domain = 'labs' | 'medications' | 'vaccines' | 'imaging' | 'appointments' | 'documents'

export type Config = {
  carnetUrl: string
  outputDir: string
  rawDir: string
  partitionName: string
  windowWidth: number
  windowHeight: number
  toolbarHeight: number
  domains: Domain[]
  requestDelayMs: number
  downloadConcurrency: number
  downloadRetries: number
}

const root = process.cwd()

// outputDir/rawDir default to cwd for dev (`pnpm dev`); main/index.ts overrides them to a
// user-visible Documents folder once the Electron app path is available.
export const config: Config = {
  carnetUrl: 'https://carnetsante.gouv.qc.ca',
  outputDir: resolve(root, 'output'),
  rawDir: resolve(root, 'raw'),
  partitionName: 'persist:carnet',
  windowWidth: 1280,
  windowHeight: 900,
  toolbarHeight: 56,
  domains: ['labs', 'medications', 'vaccines', 'imaging', 'appointments', 'documents'],
  requestDelayMs: 800,
  downloadConcurrency: 3,
  downloadRetries: 2,
}
```

- [ ] **Step 3: Rewrite `src/collectors/types.ts`** (removes the Playwright `Page` import)

```ts
import { type CaptureStore } from '../capture/store.js'
import { type Domain } from '../config.js'

// Backed in Phase 3 by an Electron WebContents adapter; collectors only see this interface.
export type Navigator = {
  goto: (pathOrUrl: string) => Promise<void>
  waitForJson: (match: (url: string) => boolean, timeoutMs?: number) => Promise<unknown>
}

export type CollectContext = {
  nav: Navigator
  capture: CaptureStore
}

export type DocumentDescriptor = {
  id: string
  url: string
  title: string
  type: string
  date?: string
}

export type DomainResult = {
  domain: Domain
  raw: unknown[]
  documents: DocumentDescriptor[]
}

export type Collector = {
  domain: Domain
  collect: (ctx: CollectContext) => Promise<DomainResult>
}
```

- [ ] **Step 4: Rewrite `package.json`**

Replace `dependencies`, `devDependencies`, `scripts`, `main`, `bin`, and `pnpm.onlyBuiltDependencies`:

```json
{
  "name": "carnet-sante-extract",
  "version": "0.2.0",
  "private": true,
  "description": "Desktop app that logs you into Carnet Santé Québec, then captures your health records (PDFs + structured data) into AI-ready Markdown/JSON.",
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "package": "electron-vite build && electron-builder",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:type": "tsc --noEmit -p tsconfig.json",
    "check:lint": "oxlint",
    "check:format": "oxfmt --check .",
    "fix:lint": "oxlint --fix",
    "fix:format": "oxfmt .",
    "check": "pnpm check:format && pnpm check:lint && pnpm check:type",
    "fix": "pnpm fix:format && pnpm fix:lint"
  },
  "dependencies": {
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@oxfmt/binding-win32-x64-msvc": "^0.43.0",
    "@oxlint/binding-win32-x64-msvc": "^1.58.0",
    "@rolldown/binding-win32-x64-msvc": "1.0.2",
    "@stylistic/eslint-plugin": "^5.10.0",
    "@types/node": "^22.19.17",
    "electron": "latest",
    "electron-builder": "latest",
    "electron-vite": "latest",
    "oxfmt": "^0.43.0",
    "oxlint": "^1.58.0",
    "typescript": "^5.9.3",
    "vite": "latest",
    "vitest": "^4.1.7"
  },
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@10.33.0",
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "electron"
    ]
  }
}
```

- [ ] **Step 5: Rewrite `tsconfig.json`** (Bundler resolution + DOM lib, typecheck-only)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 6: Install and verify the pure layers still typecheck + test**

```bash
pnpm install
pnpm check:type
pnpm test
```
Expected: `pnpm install` resolves electron + electron-vite (Electron's postinstall downloads its binary). `check:type` passes (no Playwright references remain). `pnpm test` passes (rename/manifest/markdown/capture-store all green).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: swap Playwright/tsx toolchain for Electron + electron-vite"
```

---

## Task 3: electron-vite config + minimal main window

Boot a window that loads the live Carnet Santé site. No toolbar yet — this proves the Electron + electron-vite + ESM wiring works end to end.

**Files:**
- Create: `electron.vite.config.ts`
- Create: `src/shared/ipc.ts`
- Create: `src/main/index.ts`

- [ ] **Step 1: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: 'src/main/index.ts' } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: 'src/preload/index.ts' } } },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: 'src/renderer/index.html' } } },
  },
})
```

- [ ] **Step 2: Create `src/shared/ipc.ts`** (channel contracts used by every layer)

```ts
export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureProgress: 'capture:progress',
  siteUrl: 'site:url',
  openOutput: 'output:open',
} as const

export type Phase = 'idle' | 'capturing' | 'downloading' | 'done'

export type ProgressPayload = {
  phase: Phase
  json: number
  binaries: number
  downloaded?: number
}
```

- [ ] **Step 3: Create a minimal `src/main/index.ts`**

```ts
import { app, BaseWindow, WebContentsView } from 'electron'

import { config } from '../config.js'

const createWindow = (): void => {
  const window = new BaseWindow({
    width: config.windowWidth,
    height: config.windowHeight,
    title: 'Carnet Santé Extract',
  })

  const site = new WebContentsView({ webPreferences: { partition: config.partitionName } })

  window.contentView.addChildView(site)
  const { width, height } = window.getContentBounds()

  site.setBounds({ x: 0, y: 0, width, height })
  void site.webContents.loadURL(config.carnetUrl)
}

void app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 4: Manual verification — the window loads the site**

Run: `pnpm dev`
Expected: an Electron window opens showing the Carnet Santé Québec login page. Closing the window exits the process. (Renderer/preload bundles are empty for now — that's fine.)

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add -A
git commit -m "feat: electron-vite config + main window loading Carnet Sante"
```

---

## Task 4: Control toolbar (renderer + preload + two-view layout)

Add the top toolbar with status/URL/buttons in its own `WebContentsView`, wired over IPC. Handlers are no-ops for now; capture lands in Task 5.

**Files:**
- Create: `src/main/window.ts`
- Modify: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/styles.css`, `src/renderer/app.ts`, `src/renderer/env.d.ts`

- [ ] **Step 1: Create `src/main/window.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

import { IPC, type ProgressPayload } from '../shared/ipc.js'

const api = {
  startCapture: (): Promise<void> => ipcRenderer.invoke(IPC.captureStart),
  stopCapture: (): Promise<void> => ipcRenderer.invoke(IPC.captureStop),
  openOutput: (): Promise<void> => ipcRenderer.invoke(IPC.openOutput),
  onProgress: (cb: (payload: ProgressPayload) => void): (() => void) => {
    const handler = (_event: unknown, payload: ProgressPayload): void => cb(payload)

    ipcRenderer.on(IPC.captureProgress, handler)

    return () => ipcRenderer.off(IPC.captureProgress, handler)
  },
  onSiteUrl: (cb: (url: string) => void): (() => void) => {
    const handler = (_event: unknown, url: string): void => cb(url)

    ipcRenderer.on(IPC.siteUrl, handler)

    return () => ipcRenderer.off(IPC.siteUrl, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 3: Create the renderer files**

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <link rel="stylesheet" href="./styles.css" />
    <title>Carnet Santé Extract</title>
  </head>
  <body>
    <header id="bar">
      <button id="toggle">Start capture</button>
      <span id="status">Log in to Carnet Santé, then click Start capture.</span>
      <span id="url"></span>
      <button id="open">Open output</button>
    </header>
    <script type="module" src="./app.ts"></script>
  </body>
</html>
```

`src/renderer/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font: 13px/1.4 system-ui, sans-serif;
  color: #1a1a1a;
}

#bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 12px;
  background: #f4f4f5;
  border-bottom: 1px solid #d4d4d8;
}

#bar button {
  padding: 6px 14px;
  border: 1px solid #71717a;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

#status {
  font-weight: 600;
}

#url {
  flex: 1;
  color: #71717a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

`src/renderer/app.ts`:

```ts
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

  if (payload.phase === 'done') {
    capturing = false
    toggleEl.textContent = 'Start capture'
  }
})
```

`src/renderer/env.d.ts`:

```ts
import { type Api } from '../preload/index.js'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 4: Wire the window + no-op IPC handlers in `src/main/index.ts`**

Replace the whole file with:

```ts
import { app, ipcMain, shell } from 'electron'
import { join } from 'node:path'

import { config } from '../config.js'
import { IPC } from '../shared/ipc.js'
import { type AppWindow, createWindow, type RendererEntry } from './window.js'

let win: AppWindow | undefined

const rendererEntry = (): RendererEntry => {
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  if (devUrl) {
    return { url: devUrl }
  }

  return { file: join(import.meta.dirname, '../renderer/index.html') }
}

const wireIpc = (): void => {
  ipcMain.handle(IPC.captureStart, () => undefined)
  ipcMain.handle(IPC.captureStop, () => undefined)
  ipcMain.handle(IPC.openOutput, async () => {
    await shell.openPath(config.rawDir)
  })
}

void app.whenReady().then(() => {
  const preloadPath = join(import.meta.dirname, '../preload/index.mjs')

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
```

- [ ] **Step 5: Manual verification — toolbar renders, URL tracks navigation**

Run: `pnpm dev`
Expected: a 56px toolbar strip at top with **Start capture**, a status message, the live URL, and **Open output**; the Carnet Santé site fills the area below. Clicking around the site updates the URL text. **Start capture** toggles its label to **Stop & save** (no capture yet). Resizing the window keeps the layout correct.

> If the preload doesn't load (buttons throw `window.api is undefined`), check the emitted filename in `out/preload/` and adjust the `index.mjs` extension in `main/index.ts` to match (electron-vite emits `.mjs` for ESM preload).

- [ ] **Step 6: Commit**

```bash
pnpm fix
git add -A
git commit -m "feat: control toolbar renderer + preload + two-view layout"
```

---

## Task 5: CDP capture wiring

Attach the Chrome DevTools Protocol to the site's `webContents` and stream JSON bodies to `raw/responses/`, flagging PDFs. This is the Electron equivalent of the old Playwright `capture.ts`.

**Files:**
- Create: `src/main/capture.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/capture.ts`**

```ts
import { type WebContents } from 'electron'
import { resolve } from 'node:path'

import { type CaptureStore, classify, emptyStore, safeName } from '../capture/store.js'
import { ensureDir, writeJson } from '../util/fs.js'
import { log } from '../util/log.js'

export type ProgressCounts = { json: number; binaries: number }

export type CaptureHandle = {
  store: CaptureStore
  stop: () => Promise<void>
}

type ResponseMeta = { url: string; status: number; method: string; contentType: string }

export const startCapture = async (
  webContents: WebContents,
  dir: string,
  onProgress: (counts: ProgressCounts) => void,
): Promise<CaptureHandle> => {
  const store = emptyStore()
  const methods = new Map<string, string>()
  const responses = new Map<string, ResponseMeta>()
  let index = 0

  const dbg = webContents.debugger

  if (!dbg.isAttached()) {
    dbg.attach('1.3')
  }

  const finish = async (requestId: string): Promise<void> => {
    const meta = responses.get(requestId)

    if (!meta) {
      return
    }

    responses.delete(requestId)
    const kind = classify(meta.contentType)
    const current = index

    index += 1

    try {
      if (kind === 'json') {
        const result = (await dbg.sendCommand('Network.getResponseBody', { requestId })) as {
          body: string
          base64Encoded: boolean
        }
        const text = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body
        const file = `${safeName(meta.url, current)}.json`

        await ensureDir(dir)
        await writeJson(resolve(dir, file), { url: meta.url, status: meta.status, method: meta.method, body: JSON.parse(text) })
        store.json.push({ ...meta, file })
        onProgress({ json: store.json.length, binaries: store.binaries.length })
      } else if (kind === 'binary') {
        store.binaries.push({ ...meta, file: '' })
        onProgress({ json: store.json.length, binaries: store.binaries.length })
      }
    } catch (error) {
      log.warn(`capture skipped ${meta.url}`, (error as Error).message)
    }
  }

  const onMessage = (_event: unknown, method: string, params: Record<string, any>): void => {
    if (method === 'Network.requestWillBeSent') {
      methods.set(params['requestId'], params['request']?.method ?? '')
    } else if (method === 'Network.responseReceived') {
      const response = params['response']

      responses.set(params['requestId'], {
        url: response.url,
        status: response.status,
        method: methods.get(params['requestId']) ?? '',
        contentType: String(response.headers?.['content-type'] ?? response.mimeType ?? '').toLowerCase(),
      })
    } else if (method === 'Network.loadingFinished') {
      void finish(params['requestId'])
    }
  }

  dbg.on('message', onMessage)
  await dbg.sendCommand('Network.enable')

  const stop = async (): Promise<void> => {
    dbg.off('message', onMessage)

    try {
      await dbg.sendCommand('Network.disable')
      dbg.detach()
    } catch {
      // already detached
    }

    await ensureDir(dir)
    await writeJson(resolve(dir, 'index.json'), store)
  }

  return { store, stop }
}
```

- [ ] **Step 2: Wire start/stop into `src/main/index.ts`**

Add imports near the top (after the existing `./window.js` import):

```ts
import { type CaptureHandle, startCapture } from './capture.js'
import { IPC, type ProgressPayload } from '../shared/ipc.js'
```

(Replace the existing `import { IPC } from '../shared/ipc.js'` line so `ProgressPayload` is included.)

Add module state below `let win`:

```ts
let capture: CaptureHandle | undefined

const send = (channel: string, payload: unknown): void => win?.toolbar.webContents.send(channel, payload)
```

Replace the no-op `captureStart`/`captureStop` handlers in `wireIpc` with:

```ts
  ipcMain.handle(IPC.captureStart, async () => {
    if (!win || capture) {
      return
    }

    capture = await startCapture(win.site.webContents, resolve(config.rawDir, 'responses'), (counts) =>
      send(IPC.captureProgress, { phase: 'capturing', ...counts } satisfies ProgressPayload),
    )
    send(IPC.captureProgress, { phase: 'capturing', json: 0, binaries: 0 } satisfies ProgressPayload)
  })

  ipcMain.handle(IPC.captureStop, async () => {
    if (!capture) {
      return
    }

    const { store } = capture

    await capture.stop()
    capture = undefined
    send(IPC.captureProgress, { phase: 'done', json: store.json.length, binaries: store.binaries.length } satisfies ProgressPayload)
  })
```

Add `resolve` to the `node:path` import: `import { join, resolve } from 'node:path'`.

- [ ] **Step 3: Point the output base dir at the user's Documents folder**

In `app.whenReady().then(...)`, before `createWindow`, add:

```ts
  config.outputDir = join(app.getPath('documents'), 'carnet-sante-extract', 'output')
  config.rawDir = join(app.getPath('documents'), 'carnet-sante-extract', 'raw')
```

- [ ] **Step 4: Manual verification — capture writes raw JSON**

Run: `pnpm dev`
Steps: log into Carnet Santé in the embedded view → click **Start capture** → navigate to a data section (e.g. lab results) → watch the status count climb (`capturing — N JSON, M PDF`).
Expected: `~/Documents/carnet-sante-extract/raw/responses/` fills with `NNNN-*.json` files, each `{ url, status, method, body }`. Clicking **Stop & save** writes `raw/responses/index.json` and the status flips to `done`.

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add -A
git commit -m "feat: CDP network capture to raw/responses"
```

---

## Task 6: Authed PDF downloader + Stop flow

On Stop, fetch every flagged PDF through `net.fetch` with the partition's cookies and save to `raw/documents/`.

**Files:**
- Create: `src/main/downloader.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/downloader.ts`**

```ts
import { net, type Session } from 'electron'
import { resolve } from 'node:path'

import { type CapturedResponse, safeName } from '../capture/store.js'
import { config } from '../config.js'
import { mapLimit, sleep } from '../util/concurrency.js'
import { writeBuffer } from '../util/fs.js'
import { log } from '../util/log.js'

type FetchInit = RequestInit & { session?: Session; useSessionCookies?: boolean }

const fetchWithRetry = async (session: Session, url: string): Promise<Buffer> => {
  let lastError: unknown

  for (let attempt = 0; attempt <= config.downloadRetries; attempt += 1) {
    try {
      const init: FetchInit = { session, useSessionCookies: true }
      const response = await net.fetch(url, init)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      await sleep(config.requestDelayMs * (attempt + 1))
    }
  }

  throw lastError
}

// Phase 1: download every flagged binary by URL into `dir`, named from the URL slug.
// Phase 3 replaces this with descriptor + manifest-skip logic once collectors supply metadata.
export const downloadCaptured = async (session: Session, binaries: CapturedResponse[], dir: string): Promise<number> => {
  let saved = 0

  await mapLimit(binaries, config.downloadConcurrency, async (binary, i) => {
    try {
      const buffer = await fetchWithRetry(session, binary.url)

      await writeBuffer(resolve(dir, `${safeName(binary.url, i)}.pdf`), buffer)
      await sleep(config.requestDelayMs)
      saved += 1
      log.info(`downloaded ${binary.url} (${buffer.length} bytes)`)
    } catch (error) {
      log.warn(`download failed ${binary.url}`, (error as Error).message)
    }
  })

  return saved
}
```

- [ ] **Step 2: Run the Stop flow through the downloader in `src/main/index.ts`**

Add imports:

```ts
import { app, ipcMain, session, shell } from 'electron'
```

(extend the existing electron import with `session`), and:

```ts
import { downloadCaptured } from './downloader.js'
```

Replace the `captureStop` handler body with:

```ts
  ipcMain.handle(IPC.captureStop, async () => {
    if (!capture) {
      return
    }

    const { store } = capture

    await capture.stop()
    capture = undefined
    send(IPC.captureProgress, { phase: 'downloading', json: store.json.length, binaries: store.binaries.length } satisfies ProgressPayload)

    const ses = session.fromPartition(config.partitionName)
    const downloaded = await downloadCaptured(ses, store.binaries, resolve(config.rawDir, 'documents'))

    send(IPC.captureProgress, {
      phase: 'done',
      json: store.json.length,
      binaries: store.binaries.length,
      downloaded,
    } satisfies ProgressPayload)
  })
```

- [ ] **Step 3: Manual verification — a PDF downloads with the live session**

Run: `pnpm dev`
Steps: log in → **Start capture** → open a section that triggers a PDF (e.g. view/download a lab report) → **Stop & save**.
Expected: status shows `downloading` then `done — N JSON, M PDF, K downloaded`; `~/Documents/carnet-sante-extract/raw/documents/` contains the PDF(s), and each opens as a valid (non-HTML, non-empty) document. **Open output** reveals the `raw` folder in Explorer.

- [ ] **Step 4: Commit**

```bash
pnpm fix
git add -A
git commit -m "feat: authed PDF download via net.fetch on stop"
```

---

## Task 7: electron-builder packaging (Windows NSIS)

Produce a double-click installer.

**Files:**
- Create: `electron-builder.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: dev.icitte.carnet-sante-extract
productName: Carnet Sante Extract
directories:
  output: release
files:
  - out/**/*
  - package.json
win:
  target: nsis
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Add build artifacts to `.gitignore`**

Add under the `# build` section:

```
out
release
```

- [ ] **Step 3: Build the installer**

```bash
pnpm package
```
Expected: `electron-vite build` emits `out/{main,preload,renderer}`, then electron-builder writes `release/Carnet Sante Extract Setup <version>.exe` (plus an unpacked dir).

- [ ] **Step 4: Manual verification — install + launch the packaged app**

Run the installer from `release/`. (Windows SmartScreen will warn on the unsigned build — **More info → Run anyway**.) Launch the installed app.
Expected: same behaviour as `pnpm dev` — window loads Carnet Santé, login + capture + download + Open output all work. Output lands in `~/Documents/carnet-sante-extract/`.

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add -A
git commit -m "build: electron-builder NSIS Windows installer"
```

---

## Task 8: Update docs

Bring README + CLAUDE.md in line with the Electron platform.

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# carnet-sante-extract

Desktop app that pulls **everything** out of [Carnet Santé Québec](https://carnetsante.gouv.qc.ca) — the Quebec government health portal that has no API and no bulk download. Open the app, log in by hand (MFA and all), and it takes over the live session: it captures the structured data the site renders + downloads every PDF, ready to be normalized into clean **Markdown + JSON** for an LLM later.

No cloud, no API keys, no LLM in the loop. Everything stays on your machine.

## Run it (development)

```bash
pnpm install
pnpm dev        # launches the app: log in, click Start capture, walk every section, Stop & save
```

## Build the installer

```bash
pnpm package    # → release/Carnet Sante Extract Setup <version>.exe (Windows, NSIS)
```

The build is unsigned, so Windows SmartScreen warns on first launch — **More info → Run anyway**.

## Output

Written to `~/Documents/carnet-sante-extract/`:

```
raw/
  responses/   captured JSON (one file per response) + index.json
  documents/   downloaded PDFs
```

(Phase 3 adds the normalize step that turns `raw/` into `output/data`, `output/markdown`, and renamed `output/documents`.)

## Privacy

`raw/`, `output/`, and the Electron session partition (live cookies) live under your user profile and must never be committed. The repo ships only code + synthetic/redacted fixtures.

## Status

Phase 1 (Electron capture app) is implemented. Phase 2 = a live recon pass to map the site's endpoints; Phase 3 = targeted per-domain collectors + normalization. See `docs/superpowers/specs/2026-05-23-carnet-sante-extract-electron-design.md`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Replace the opening description line, the "Stack & conventions" Playwright bullet, the "Commands" block, and the "Architecture" section to describe the Electron platform:

- Description: "Electron desktop app that logs you into Carnet Santé Québec (you do the login by hand, MFA included), then takes over the live session to capture the JSON the site renders + download every PDF, for later normalization into clean Markdown/JSON."
- Stack bullet: replace "Playwright (Chromium, headed)" with "Electron (ESM main) + electron-vite + electron-builder; Chrome DevTools Protocol for capture".
- Commands block:

```bash
pnpm install
pnpm dev        # launch the app (electron-vite dev)
pnpm build      # bundle main/preload/renderer
pnpm package    # build + electron-builder NSIS installer → release/
pnpm test       # vitest (pure logic)
pnpm check      # format + lint + typecheck
pnpm fix        # auto-format + lint fix
```

- Architecture section: replace the three Playwright layers with: (1) **`src/main/`** — Electron lifecycle, `BaseWindow` + toolbar/site `WebContentsView`s (`window.ts`), persistent `persist:carnet` session, CDP capture (`capture.ts`), authed `net.fetch` PDF download (`downloader.ts`), IPC orchestration (`index.ts`). (2) **`src/capture/store.ts` + `src/preload/` + `src/renderer/` + `src/shared/`** — pure capture model, contextBridge API, control toolbar UI, IPC contracts. (3) **`src/normalize/` + `src/output/`** — unchanged pure layer (Phase 3). Note the package uses **pnpm** still, and `bin`/CLI is gone.

- Replace the "Build status" checklist with the Phase 1/2/3 framing from the Electron design spec.

- [ ] **Step 3: Verify the whole project is green**

```bash
pnpm check
pnpm test
```
Expected: format, lint, typecheck, and all vitest suites pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README + CLAUDE.md for the Electron platform"
```

---

## Done — Phase 1 complete

The app loads Carnet Santé, the user logs in, capture records all JSON + downloads all PDFs to `~/Documents/carnet-sante-extract/raw/`, and `pnpm package` produces an installer. **Next:** the user runs a live recon pass (Phase 2) to produce a real `raw/` dump; from that capture we map per-domain endpoints and write the Phase 3 plan (targeted collectors + normalization + `summary.md`), reusing the untouched `normalize/`/`output/` layers and the placeholder zod schemas.
