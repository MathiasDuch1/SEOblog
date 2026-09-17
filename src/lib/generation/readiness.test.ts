import { describe, expect, it } from 'vitest'

import { sectionsToLexical } from '@/lib/ai/toLexical'

import { getReadiness } from './readiness'

const base = {
  slug: 'bedste-yogamaatte',
  intro: 'Intro',
  summary: 'Summary',
  meta: { title: 'Title', description: 'Description' },
}

const product = (n: number) => ({
  title: `Product ${n}`,
  imageUrl: `https://picsum.photos/seed/${n}/800/800`,
  affiliateUrl: `https://www.amazon.de/dp/B0${n}?tag=beta-21`,
})

const listicle = { ...base, template: 'listicle' as const, products: [product(1), product(2)] }
const informational = {
  ...base,
  template: 'informational' as const,
  body: sectionsToLexical([{ heading: 'Heading', paragraphs: ['A paragraph.'] }], {}),
}

describe('getReadiness', () => {
  it('reports a complete listicle as ready', () => {
    expect(getReadiness(listicle)).toEqual({ ready: true, missing: [] })
  })

  it('reports a complete informational post as ready', () => {
    expect(getReadiness(informational)).toEqual({ ready: true, missing: [] })
  })

  it('does not require a featured image while hero images are deferred', () => {
    expect(getReadiness({ ...listicle, featuredImage: null } as typeof listicle)).toEqual({ ready: true, missing: [] })
  })

  it("names the one product missing its affiliateUrl", () => {
    const products = [product(1), { ...product(2), affiliateUrl: '' }]
    expect(getReadiness({ ...listicle, products })).toEqual({ ready: false, missing: ['products.1.affiliateUrl'] })
  })

  it('lists every missing field', () => {
    expect(
      getReadiness({ template: 'listicle', slug: ' ', intro: null, summary: undefined, meta: {}, products: [] }),
    ).toEqual({
      ready: false,
      missing: ['slug', 'intro', 'summary', 'meta.title', 'meta.description', 'products'],
    })
  })

  it('treats an informational body with no text as missing', () => {
    const empty = sectionsToLexical([], {})
    expect(getReadiness({ ...informational, body: empty }).missing).toEqual(['body'])
    expect(getReadiness({ ...informational, body: null }).missing).toEqual(['body'])
  })
})
