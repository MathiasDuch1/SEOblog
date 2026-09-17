import { describe, expect, it } from 'vitest'

import { GeneratedOutputError, outputFormatFor, parseGeneratedArticle } from './schemas'

const listicle = {
  title: 'De bedste meditationspuder til en rolig praksis',
  slug: 'bedste-meditationspuder',
  intro: 'En god pude gør en forskel.',
  products: [
    { productRef: 'p1', title: 'Pude 1', description: 'Fast og stabil.' },
    { productRef: 'p2', title: 'Pude 2', description: 'Blød og let.' },
  ],
  summary: 'Vælg efter din praksis.',
  meta: { title: 'De bedste meditationspuder', description: 'Vores udvalg af puder.' },
}

const informational = {
  title: 'Sådan kommer du i gang med meditation',
  slug: 'kom-i-gang-med-meditation',
  intro: 'Start småt.',
  sections: [
    {
      heading: 'Første skridt',
      paragraphs: ['Sæt dig godt til rette på en pude.'],
      links: [{ text: 'en pude', productRef: 'p1' }],
    },
  ],
  summary: 'Fem minutter om dagen er nok.',
  meta: { title: 'Kom i gang med meditation', description: 'En enkel guide.' },
}

const parse = (template: 'listicle' | 'informational', value: unknown, refs = ['p1', 'p2']) =>
  parseGeneratedArticle(template, JSON.stringify(value), refs)

describe('parseGeneratedArticle', () => {
  it('accepts a valid listicle', () => {
    expect(parse('listicle', listicle).output.slug).toBe('bedste-meditationspuder')
  })

  it('accepts a valid informational article', () => {
    expect(parse('informational', informational).template).toBe('informational')
  })

  it('rejects a meta.title over 60 characters', () => {
    const value = { ...listicle, meta: { ...listicle.meta, title: 'x'.repeat(61) } }
    expect(() => parse('listicle', value)).toThrow(/meta\.title/)
  })

  it('rejects a listicle missing one of the input products', () => {
    const value = { ...listicle, products: [listicle.products[0]] }
    expect(() => parse('listicle', value)).toThrow(/missing product p2/)
  })

  it('rejects a listicle with an invented product', () => {
    const value = { ...listicle, products: [...listicle.products, { ...listicle.products[0], productRef: 'p9' }] }
    expect(() => parse('listicle', value)).toThrow(/unknown product p9/)
  })

  it.each(['bedste-røgelse', 'best meditation cushions', 'Best-Cushions', 'double--hyphen'])(
    'rejects the slug %j',
    (slug) => {
      expect(() => parse('listicle', { ...listicle, slug })).toThrow(/slug: Slug must be lowercase kebab-case ASCII/)
    },
  )

  it('rejects informational links to unknown products', () => {
    expect(() => parse('informational', informational, ['p2'])).toThrow(/unknown products: p1/)
  })

  it('rejects output that is not JSON', () => {
    expect(() => parseGeneratedArticle('listicle', '{nope', ['p1'])).toThrow(GeneratedOutputError)
  })
})

describe('outputFormatFor', () => {
  it('builds a strict JSON schema that keeps stripped limits in descriptions', () => {
    const format = outputFormatFor('listicle')
    expect(format.type).toBe('json_schema')
    expect(format).not.toHaveProperty('parse')
    const json = JSON.stringify(format.schema)
    expect(json).toContain('"additionalProperties":false')
    expect(json).toContain('maxLength: 60')
  })
})
