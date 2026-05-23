import { describe, expect, it } from 'vitest'

import { encodeLabId } from '../src/util/lab-id.js'

describe('encodeLabId', () => {
  it('encodes the JSON triple to base64 without padding', () => {
    const id = encodeLabId({ NoReq: '4054515361', OIDSIL: '2.16.124.10.101.1.60.1.3.500.1', TypeRapp: 'LAB' })

    expect(id).toMatch(/^eyJOb1JlcSI6/)
    expect(id.endsWith('=')).toBe(false)
    const decoded = JSON.parse(Buffer.from(id, 'base64').toString('utf8'))

    expect(decoded.NoReq).toBe('4054515361')
    expect(decoded.TypeRapp).toBe('LAB')
  })
})
