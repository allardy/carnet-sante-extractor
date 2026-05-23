import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeImaging } from '../src/normalize/imaging.js'

describe('normalizeImaging', () => {
  it('joins list with per-exam detail to expose reportIds', async () => {
    const list = JSON.parse(await readFile(resolve(__dirname, 'fixtures/imaging/list.json'), 'utf8'))
    const detail = JSON.parse(await readFile(resolve(__dirname, 'fixtures/imaging/detail.json'), 'utf8'))
    const result = normalizeImaging(list, { '9.99.999.9.999999.9.9.99999.9999.9999999.9': detail })

    expect(result).toHaveLength(1)
    expect(result[0]?.reportIds).toHaveLength(1)
    expect(result[0]?.description).toBe('Radiographie test')
  })
})
