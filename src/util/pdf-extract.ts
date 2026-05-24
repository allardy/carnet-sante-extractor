// Walks a JSON payload and collects every string that decodes to a PDF (`%PDF-…` magic bytes).
// Used by collectors whose API returns PDFs as base64 fields inline rather than at a separate URL.

export type ExtractedPdf = {
  // Dot-path within the payload, useful for debugging which field carried the document.
  path: string
  base64: string
}

const PDF_BASE64_PREFIX = 'JVBERi'

export const extractBase64Pdfs = (root: unknown): ExtractedPdf[] => {
  const found: ExtractedPdf[] = []
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      if (node.length > 100 && node.startsWith(PDF_BASE64_PREFIX)) {
        try {
          const head = Buffer.from(node.slice(0, 12), 'base64').toString('ascii')

          if (head.startsWith('%PDF')) {
            found.push({ path, base64: node })
          }
        } catch {
          // Not base64 — skip silently.
        }
      }
    } else if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], `${path}[${i}]`)
      }
    } else if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path === '' ? k : `${path}.${k}`)
      }
    }
  }

  walk(root, '')

  return found
}
