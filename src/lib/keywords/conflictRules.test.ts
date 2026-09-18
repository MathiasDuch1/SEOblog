import { describe, expect, it } from 'vitest'

import { detectConflicts, type ClusterCandidate, type ExistingCluster } from './conflictRules'

const kw = (...keywords: string[]) => keywords.map((keyword) => ({ keyword }))

/** Clusters as stored, keyed by the domain they target. `findConflicts` only ever loads one domain's. */
const store: Record<'alpha' | 'beta' | 'gamma', ExistingCluster[]> = {
  alpha: [
    {
      id: 1,
      status: 'used',
      clusterName: 'Best tarot deck',
      primaryKeyword: 'best tarot deck',
      coreKeyword: 'best tarot deck',
      keywords: kw('best tarot deck', 'top tarot deck'),
    },
  ],
  beta: [
    {
      id: 2,
      status: 'unused',
      clusterName: 'De bedste tarotkort',
      primaryKeyword: 'de bedste tarotkort',
      coreKeyword: 'de bedste tarotkort',
      keywords: kw('de bedste tarotkort'),
    },
  ],
  gamma: [],
}

const bestTarotDecks: ClusterCandidate = {
  clusterName: 'Best tarot decks',
  primaryKeyword: 'best tarot decks',
  coreKeyword: 'best tarot deck',
  keywords: kw('best tarot decks', 'best tarot deck for beginners'),
}

describe('detectConflicts', () => {
  it('flags a same-domain cluster sharing the core_keyword (Alpha, en-US)', () => {
    const [conflict] = detectConflicts([bestTarotDecks], store.alpha, [], 'en')
    expect(conflict.reasons).toEqual([expect.objectContaining({ type: 'primary-keyword', clusterId: 1 })])
    expect(conflict.reasons[0].detail).toContain('core keyword')
  })

  it("ignores another domain's cluster on the same topic (Gamma, en-US)", () => {
    expect(detectConflicts([bestTarotDecks], store.gamma, [], 'en')).toEqual([])
  })

  it('matches primary keywords through Danish stop-word normalization (Beta, da-DK)', () => {
    const candidate: ClusterCandidate = {
      clusterName: 'Bedste tarotkort',
      primaryKeyword: 'bedste tarotkort',
      coreKeyword: 'bedste tarotkort',
      keywords: kw('bedste tarotkort'),
    }
    const [conflict] = detectConflicts([candidate], store.beta, [], 'da')
    expect(conflict.reasons).toEqual([expect.objectContaining({ type: 'primary-keyword', clusterId: 2 })])
    expect(conflict.reasons[0].detail).toContain('Primary keyword')
    // Without Danish stop-words the two phrasings stay distinct.
    expect(detectConflicts([candidate], store.beta, [], 'xx')).toEqual([])
  })

  it('flags a 60% keyword overlap but not 40%', () => {
    const existing: ExistingCluster[] = [
      {
        id: 3,
        status: 'assigned',
        clusterName: 'Tarot for beginners',
        primaryKeyword: 'tarot for beginners',
        coreKeyword: 'tarot for beginners',
        keywords: kw('tarot for beginners', 'learn tarot', 'how to read tarot', 'tarot basics', 'tarot guide'),
      },
    ]
    const sixty: ClusterCandidate = {
      clusterName: 'Reading tarot',
      primaryKeyword: 'reading tarot cards',
      coreKeyword: 'reading tarot cards',
      keywords: kw('reading tarot cards', 'learn tarot', 'how to read tarot', 'tarot basics', 'tarot spreads'),
    }
    const forty: ClusterCandidate = { ...sixty, keywords: kw('reading tarot cards', 'learn tarot', 'tarot basics', 'tarot spreads', 'tarot journal') }

    const [conflict] = detectConflicts([sixty], existing, [], 'en')
    expect(conflict.reasons).toEqual([expect.objectContaining({ type: 'keyword-overlap', clusterId: 3, overlap: 0.6 })])
    expect(detectConflicts([forty], existing, [], 'en')).toEqual([])
  })

  it("flags a primary keyword already in a post's SEO title", () => {
    const [conflict] = detectConflicts(
      [{ ...bestTarotDecks, coreKeyword: null }],
      [],
      [{ id: 9, title: 'Ignored', metaTitle: 'The Best Tarot Decks of 2026 | Alpha' }],
      'en',
    )
    expect(conflict.reasons).toEqual([expect.objectContaining({ type: 'post-title', postId: 9 })])
  })
})
