import { describe, expect, it, vi } from 'vitest'

import type { KeywordRow } from '../dataforseo/client'

vi.mock('@/lib/payload', () => ({ getPayloadClient: vi.fn() }))

const { dedupeRows } = await import('./research')

const row = (keyword: string, extra: Partial<KeywordRow> = {}): KeywordRow => ({
  keyword,
  searchVolume: null,
  cpc: null,
  competition: null,
  keywordDifficulty: null,
  intent: null,
  coreKeyword: null,
  ...extra,
})

describe('dedupeRows', () => {
  it('keeps one row per normalized keyword, preferring the most complete, sorted by volume', () => {
    const rows = dedupeRows([
      row('Tarotkort ', { searchVolume: 2900 }),
      row('tarotkort', { searchVolume: 2900, keywordDifficulty: 30, intent: 'commercial' }),
      row('tarot  kort betydning', { searchVolume: 1900 }),
      row('tarot kort betydning'),
    ])
    expect(rows).toEqual([
      row('tarotkort', { searchVolume: 2900, keywordDifficulty: 30, intent: 'commercial' }),
      row('tarot kort betydning', { searchVolume: 1900 }),
    ])
  })
})
