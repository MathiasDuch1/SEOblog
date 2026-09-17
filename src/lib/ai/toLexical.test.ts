import { describe, expect, it } from 'vitest'

import { sectionsToLexical } from './toLexical'

type AnyNode = { type: string; tag?: string; text?: string; fields?: { url: string }; children?: AnyNode[] }

const urls = { p1: 'https://www.amazon.com/dp/P1?tag=alpha-20', p2: 'https://www.amazon.com/dp/P2?tag=alpha-20' }

describe('sectionsToLexical', () => {
  const body = sectionsToLexical(
    [
      {
        heading: 'Choosing a cushion',
        paragraphs: ['A firm cushion keeps your hips raised.', 'Try a buckwheat cushion or a zafu first.'],
        links: [
          { text: 'buckwheat cushion', productRef: 'p1' },
          { text: 'zafu', productRef: 'p2' },
          { text: 'not in any paragraph', productRef: 'p1' },
          { text: 'firm cushion', productRef: 'unknown' },
        ],
      },
      { heading: 'Summary', paragraphs: ['Sit comfortably.'] },
    ],
    urls,
  )
  const nodes = body.root.children as AnyNode[]

  it('emits a heading followed by paragraphs for each section', () => {
    expect(nodes.map((n) => n.tag ?? n.type)).toEqual(['h2', 'paragraph', 'paragraph', 'h2', 'paragraph'])
    expect(nodes[0].children?.[0].text).toBe('Choosing a cushion')
  })

  it('keeps paragraph text intact around links', () => {
    const text = (n: AnyNode): string => n.text ?? (n.children ?? []).map(text).join('')
    expect(text(nodes[2])).toBe('Try a buckwheat cushion or a zafu first.')
  })

  it('resolves productRef links to affiliate URLs and skips unmatched or unknown links', () => {
    const links = nodes.flatMap((n) => (n.children ?? []).filter((c) => c.type === 'link'))
    expect(links.map((l) => [l.children?.[0].text, l.fields?.url])).toEqual([
      ['buckwheat cushion', urls.p1],
      ['zafu', urls.p2],
    ])
  })
})
