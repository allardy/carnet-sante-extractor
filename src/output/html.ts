import MarkdownIt from 'markdown-it'

import { type Locale } from '../shared/i18n.js'

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Renders a markdown string to an HTML fragment (no document shell). Building block for the dossier,
// which wraps each section fragment in its own collapsible card.
export const renderMarkdown = (markdown: string): string => md.render(markdown)

const SHELL_CSS = `
:root { color-scheme: light dark }
body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.55;
  max-width: 50rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff }
@media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #161616 } a { color: #6db3f2 } }
h1, h2, h3 { line-height: 1.25 }
h1 { border-bottom: 2px solid currentColor; padding-bottom: .3rem }
table { border-collapse: collapse; width: 100%; margin: 1rem 0 }
th, td { border: 1px solid #8884; padding: .35rem .6rem; text-align: left }
th { background: #8881 }
code { background: #8882; padding: .1rem .3rem; border-radius: .25rem }
hr { border: none; border-top: 1px solid #8884; margin: 2rem 0 }
a { color: #0b66c3 }
`.trim()

// Wraps a markdown string in a minimal self-contained HTML document. Used for one-off pages; the
// rich single-page record is built separately in dossier.ts.
export const mdToHtml = (markdown: string, opts: { title: string; lang: Locale }): string =>
  `<!doctype html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<main>
${renderMarkdown(markdown)}</main>
</body>
</html>
`
