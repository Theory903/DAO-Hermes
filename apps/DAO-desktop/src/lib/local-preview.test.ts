import { describe, expect, it } from 'vitest'

import { isBrowsableHttpUrl, localPreviewTarget } from './local-preview'

describe('isBrowsableHttpUrl', () => {
  it('accepts localhost and real domains', () => {
    expect(isBrowsableHttpUrl('http://localhost:5173/')).toBe(true)
    expect(isBrowsableHttpUrl('https://example.com/path')).toBe(true)
  })

  it('rejects truncated agent-hallucinated hosts', () => {
    expect(isBrowsableHttpUrl('https://boards.g/')).toBe(false)
    expect(isBrowsableHttpUrl('https://www.druva/')).toBe(false)
  })
})

describe('localPreviewTarget http urls', () => {
  it('returns null for invalid http preview urls', () => {
    expect(localPreviewTarget('https://boards.g/')).toBeNull()
  })
})
