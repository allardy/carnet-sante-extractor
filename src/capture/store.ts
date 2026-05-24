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
