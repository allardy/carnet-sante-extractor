import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: 'src/main/index.ts' } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: 'src/preload/index.ts', site: 'src/preload/site.ts' } } },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: 'src/renderer/index.html' } } },
  },
})
