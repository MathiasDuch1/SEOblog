import { describe, expect, it } from 'vitest'

import type { KeywordRow } from '../dataforseo/client'
import { collapseVariants, validateClusters, type ClusterOutput } from './clusterRules'

const row = (keyword: string, searchVolume: number | null, extra: Partial<KeywordRow> = {}): KeywordRow => ({
  keyword,
  searchVolume,
  cpc: null,
  competition: null,
  keywordDifficulty: 20,
  intent: 'informational',
  coreKeyword: null,
  ...extra,
})

const rows: KeywordRow[] = [
  row('tarot kort', 400, { coreKeyword: 'tarotkort' }),
  row('tarotkort', 2900, { intent: 'commercial' }),
  row('tarot-kort', 90, { coreKeyword: 'tarotkort' }),
  row('bedste tarotkort', 880, { intent: 'commercial', coreKeyword: 'bedste tarotkort' }),
  row('de bedste tarotkort', 50, { intent: 'commercial', coreKeyword: 'bedste tarotkort' }),
  row('tarotkort betydning', 1900),
  row('lær tarot', 320),
]

describe('collapseVariants', () => {
  it('merges rows sharing a core_keyword into one entry led by the highest-volume variant', () => {
    const entries = collapseVariants(rows)
    expect(entries.map((e) => [e.keyword, e.variants.map((v) => v.keyword)])).toEqual([
      ['tarotkort', ['tarot kort', 'tarot-kort']],
      ['tarotkort betydning', []],
      ['bedste tarotkort', ['de bedste tarotkort']],
      ['lær tarot', []],
    ])
    expect(entries[0].groupKey).toBe('tarotkort')
  })
})

describe('validateClusters', () => {
  const entries = collapseVariants(rows)
  const output: ClusterOutput = {
    clusters: [
      {
        clusterName: 'Bedste tarotkort',
        primaryKeyword: 'bedste tarotkort',
        keywords: ['bedste tarotkort', 'tarotkort', 'tarotkort til begyndere'],
        suggestedTemplate: 'listicle',
        rationale: 'Købsintention.',
      },
      {
        clusterName: 'Tarotkortenes betydning',
        primaryKeyword: 'tarotkort betydning',
        // "tarotkort" is a duplicate assignment; "Lær Tarot" differs only in case.
        keywords: ['tarotkort', 'tarotkort betydning', 'Lær Tarot'],
        suggestedTemplate: 'informational',
        rationale: 'Forklarende indhold.',
      },
      {
        clusterName: 'Opfundet',
        primaryKeyword: 'tarot app',
        keywords: ['tarot app'],
        suggestedTemplate: 'informational',
        rationale: 'Findes ikke i input.',
      },
    ],
  }

  const { clusters, issues } = validateClusters(output, entries)

  it('drops invented keywords and clusters left empty', () => {
    const all = clusters.flatMap((c) => c.keywords.map((k) => k.keyword))
    expect(all).not.toContain('tarotkort til begyndere')
    expect(all).not.toContain('tarot app')
    expect(clusters.map((c) => c.clusterName)).toEqual(['Bedste tarotkort', 'Tarotkortenes betydning'])
    expect(issues).toContain('Dropped cluster "Opfundet": no valid keywords left')
  })

  it('keeps each keyword in at most one cluster', () => {
    const all = clusters.flatMap((c) => c.keywords.map((k) => k.keyword))
    expect(new Set(all).size).toBe(all.length)
    expect(clusters[1].keywords.map((k) => k.keyword)).toEqual(['tarotkort betydning', 'lær tarot'])
    expect(issues.some((i) => i.includes('already assigned to "Bedste tarotkort"'))).toBe(true)
  })

  it('re-attaches variants so a core_keyword group never splits', () => {
    expect(clusters[0].primaryKeyword).toBe('bedste tarotkort')
    expect(clusters[0].coreKeyword).toBe('bedste tarotkort')
    expect(clusters[0].keywords.map((k) => k.keyword)).toEqual([
      'bedste tarotkort',
      'de bedste tarotkort',
      'tarotkort',
      'tarot kort',
      'tarot-kort',
    ])
  })

  it('replaces a primary keyword that did not survive', () => {
    const result = validateClusters(
      {
        clusters: [
          {
            clusterName: 'X',
            primaryKeyword: 'opfundet',
            keywords: ['lær tarot', 'tarotkort betydning'],
            suggestedTemplate: 'informational',
            rationale: '.',
          },
        ],
      },
      entries,
    )
    expect(result.clusters[0].primaryKeyword).toBe('tarotkort betydning')
    expect(result.clusters[0].keywords[0].keyword).toBe('tarotkort betydning')
  })
})
