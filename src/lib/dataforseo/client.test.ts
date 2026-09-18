import { describe, expect, it } from 'vitest'

import authError from './__fixtures__/auth_error.json'
import failedTask from './__fixtures__/failed_task.json'
import keywordSuggestions from './__fixtures__/keyword_suggestions.json'
import relatedKeywords from './__fixtures__/related_keywords.json'
import sandboxIdeasFailed from './__fixtures__/sandbox_keyword_ideas_failed.json'
import sandboxSuggestions from './__fixtures__/sandbox_keyword_suggestions.json'
import sandboxRelated from './__fixtures__/sandbox_related_keywords.json'
import { buildTask, DataForSeoError, parseKeywordResponse, type RawResponse } from './client'

describe('parseKeywordResponse', () => {
  it('maps related_keywords items nested under keyword_data', () => {
    const result = parseKeywordResponse('related_keywords', relatedKeywords as RawResponse)
    expect(result.costUsd).toBe(0.01236)
    expect(result.rows).toEqual([
      {
        keyword: 'tarotkort betydning',
        searchVolume: 1900,
        cpc: 0.41,
        competition: 0.12,
        keywordDifficulty: 14,
        intent: 'informational',
        coreKeyword: null,
      },
      {
        keyword: 'køb tarotkort',
        searchVolume: 320,
        cpc: 0.95,
        competition: 0.87,
        keywordDifficulty: 22,
        intent: 'transactional',
        coreKeyword: 'tarotkort køb',
      },
      {
        keyword: 'tarot kort',
        searchVolume: null,
        cpc: null,
        competition: null,
        keywordDifficulty: null,
        intent: null,
        coreKeyword: 'tarotkort',
      },
    ])
  })

  it('maps flat keyword_suggestions items and ignores unknown intents', () => {
    const result = parseKeywordResponse('keyword_suggestions', keywordSuggestions as RawResponse)
    expect(result.rows.map((r) => [r.keyword, r.coreKeyword, r.intent])).toEqual([
      ['best tarot decks', 'best tarot deck', 'commercial'],
      ['tarot deck for beginners', null, null],
    ])
  })

  it('throws a typed error for a failed task inside a successful response', () => {
    expect.assertions(4)
    try {
      parseKeywordResponse('keyword_ideas', failedTask as RawResponse)
    } catch (error) {
      expect(error).toBeInstanceOf(DataForSeoError)
      expect((error as DataForSeoError).statusCode).toBe(40501)
      expect((error as DataForSeoError).statusMessage).toBe("Invalid Field: 'location_code'.")
      expect((error as DataForSeoError).message).toContain('task failed')
    }
  })

  it('throws a typed error for a non-20000 top-level status', () => {
    expect(() => parseKeywordResponse('related_keywords', authError as RawResponse)).toThrow(
      expect.objectContaining({ name: 'DataForSeoError', statusCode: 40100 }),
    )
  })
})

describe('buildTask', () => {
  const base = { locationCode: 2208, languageCode: 'da', limit: 10 }

  it('sends one seed per call for related_keywords and keyword_suggestions', () => {
    expect(buildTask({ ...base, endpoint: 'related_keywords', seeds: [' Tarotkort '] })).toEqual({
      location_code: 2208,
      language_code: 'da',
      limit: 10,
      keyword: 'tarotkort',
      depth: 2,
    })
    expect(() => buildTask({ ...base, endpoint: 'keyword_suggestions', seeds: ['a', 'b'] })).toThrow(/one seed/)
  })

  it('sends all seeds in one keyword_ideas call', () => {
    expect(buildTask({ ...base, endpoint: 'keyword_ideas', seeds: ['tarotkort', 'krystaller'] })).toMatchObject({
      keywords: ['tarotkort', 'krystaller'],
    })
  })

  it('requires an explicit limit within 1–1000', () => {
    expect(() => buildTask({ ...base, limit: 0, endpoint: 'keyword_ideas', seeds: ['x'] })).toThrow(/limit/)
    expect(() => buildTask({ ...base, limit: 1001, endpoint: 'keyword_ideas', seeds: ['x'] })).toThrow(/limit/)
  })
})

describe('recorded sandbox responses', () => {
  it('parses related_keywords and keyword_suggestions as returned by the sandbox', () => {
    const related = parseKeywordResponse('related_keywords', sandboxRelated as RawResponse)
    expect(related.costUsd).toBe(0)
    expect(related.rows[0]).toEqual({
      keyword: 'phone',
      searchVolume: 673000,
      cpc: 4.51,
      competition: 0.91,
      keywordDifficulty: 54,
      intent: 'informational',
      coreKeyword: null,
    })
    const suggestions = parseKeywordResponse('keyword_suggestions', sandboxSuggestions as RawResponse)
    expect(suggestions.rows[0]).toMatchObject({ keyword: 'seo marketing tool', coreKeyword: 'seo marketing tools', intent: 'commercial' })
  })

  it('throws for the failed task the sandbox returns for an invalid location', () => {
    expect(() => parseKeywordResponse('keyword_ideas', sandboxIdeasFailed as RawResponse)).toThrow(
      expect.objectContaining({ statusCode: 40501, statusMessage: "Invalid Field: 'location_code'." }),
    )
  })
})
