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
