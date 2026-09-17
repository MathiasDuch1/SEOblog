import { describe, expect, it } from 'vitest'

import { informationalSystem, informationalUserMessage } from './informational'
import { listicleSystem, listicleUserMessage } from './listicle'
import { describeLocale } from './shared'
import type { Product } from '@/lib/affiliate/types'

const products: Product[] = [
  { id: 'p1', title: 'Buckwheat zafu cushion', imageUrl: 'https://picsum.photos/a', affiliateUrl: 'https://www.amazon.de/dp/A?tag=beta-21' },
  { id: 'p2', title: 'Kapok zabuton mat', imageUrl: 'https://picsum.photos/b', affiliateUrl: 'https://www.amazon.de/dp/B?tag=beta-21' },
]

describe('system prompts', () => {
  it('are byte-identical for clusters on Alpha and Beta', () => {
    // The builders take no request data at all, so nothing domain-specific can leak in.
    expect(JSON.stringify(listicleSystem())).toBe(JSON.stringify(listicleSystem()))
    expect(JSON.stringify(informationalSystem())).toBe(JSON.stringify(informationalSystem()))
    const alphaMessage = listicleUserMessage({ domainName: 'Alpha', locale: 'en-US', primaryKeyword: 'x', supportingKeywords: [], products })
    const betaMessage = listicleUserMessage({ domainName: 'Beta', locale: 'da-DK', primaryKeyword: 'y', supportingKeywords: [], products })
    expect(alphaMessage).not.toBe(betaMessage)
  })

  it('contain no locale, domain, or date data and end with a 1-hour cache breakpoint', () => {
    for (const blocks of [listicleSystem(), informationalSystem()]) {
      const last = blocks[blocks.length - 1]
      expect(last.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
      const text = blocks.map((b) => b.text).join('')
      expect(text).not.toMatch(/Alpha|Beta|Gamma|da-DK|20\d\d-\d\d/)
    }
  })
})

describe('describeLocale', () => {
  it('spells out language and country', () => {
    expect(describeLocale('da-DK')).toBe('Danish for readers in Denmark (da-DK)')
    expect(describeLocale('en-US')).toBe('English for readers in United States (en-US)')
  })
})

describe('user messages', () => {
  it('listicle', () => {
    expect(
      listicleUserMessage({
        domainName: 'Beta',
        locale: 'da-DK',
        primaryKeyword: 'bedste meditationspude',
        supportingKeywords: ['meditationspude boghvede', 'zafu pude'],
        products,
      }),
    ).toMatchSnapshot()
  })

  it('informational', () => {
    expect(
      informationalUserMessage({
        domainName: 'Alpha',
        locale: 'en-US',
        primaryKeyword: 'how to start meditating',
        supportingKeywords: ['meditation for beginners'],
        products,
      }),
    ).toMatchSnapshot()
  })
})
