import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeLabs } from '../src/normalize/labs.js'

describe('normalizeLabs', () => {
  it('joins list + rapports + results per NoReq', async () => {
    const list = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/list.json'), 'utf8'))
    const rapports = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/rapports.json'), 'utf8'))
    const results = JSON.parse(await readFile(resolve(__dirname, 'fixtures/labs/results.json'), 'utf8'))
    const result = normalizeLabs({
      list,
      rapports: { '1234567890': rapports },
      results: { '1234567890': results },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.analyses).toHaveLength(2)
    expect(result[0]?.analyses[0]?.label).toBe('Hémoglobine')
    expect(result[0]?.reports[0]?.id).toBe('RPT0001')
  })
})
