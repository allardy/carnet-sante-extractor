import { describe, expect, it } from 'vitest'

import { heading, toMarkdownTable } from '../src/normalize/markdown.js'

describe('markdown', () => {
  it('heading renders the right number of hashes', () => {
    expect(heading(2, 'Labs')).toBe('## Labs\n')
  })

  it('toMarkdownTable renders header, separator, and rows', () => {
    expect(
      toMarkdownTable(
        ['Test', 'Value'],
        [
          ['HbA1c', '5.4'],
          ['LDL', '2.1'],
        ],
      ),
    ).toBe('| Test | Value |\n| --- | --- |\n| HbA1c | 5.4 |\n| LDL | 2.1 |')
  })

  it('toMarkdownTable renders just the header when there are no rows', () => {
    expect(toMarkdownTable(['Test', 'Value'], [])).toBe('| Test | Value |\n| --- | --- |')
  })
})
