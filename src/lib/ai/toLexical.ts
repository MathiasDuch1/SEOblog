import { randomBytes } from 'crypto'

import type { InformationalOutput } from './schemas'
import type { Post } from '@/payload-types'

type LexicalBody = NonNullable<Post['body']>
type Node = LexicalBody['root']['children'][number]

const textNode = (text: string): Node => ({
  mode: 'normal',
  text,
  type: 'text',
  style: '',
  detail: 0,
  format: 0,
  version: 1,
})

const linkNode = (text: string, url: string): Node => ({
  id: randomBytes(12).toString('hex'),
  type: 'link',
  fields: { url, newTab: false, linkType: 'custom' },
  format: '',
  indent: 0,
  version: 3,
  children: [textNode(text)],
  direction: null,
})

/**
 * Splits a paragraph into text and link nodes. Each link is placed on the first
 * occurrence of its anchor text that no earlier link has claimed; a link whose anchor
 * text isn't in the paragraph is skipped.
 */
function paragraphChildren(paragraph: string, links: { text: string; url: string }[]): Node[] {
  const matches: { start: number; end: number; url: string }[] = []
  for (const link of links) {
    let from = 0
    while (from <= paragraph.length) {
      const start = paragraph.indexOf(link.text, from)
      if (start === -1) break
      const end = start + link.text.length
      if (!matches.some((m) => start < m.end && end > m.start)) {
        matches.push({ start, end, url: link.url })
        break
      }
      from = start + 1
    }
  }
  matches.sort((a, b) => a.start - b.start)

  const children: Node[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) children.push(textNode(paragraph.slice(cursor, match.start)))
    children.push(linkNode(paragraph.slice(match.start, match.end), match.url))
    cursor = match.end
  }
  if (cursor < paragraph.length) children.push(textNode(paragraph.slice(cursor)))
  return children
}

/**
 * Converts generated informational sections into Lexical editor state: an h2 per section,
 * a paragraph per paragraph, and link nodes for `links[]`. A link's `productRef` resolves
 * to that product's affiliate URL; each link is used once, in the first paragraph of its
 * section that contains its anchor text.
 */
export function sectionsToLexical(
  sections: InformationalOutput['sections'],
  affiliateUrlByRef: Record<string, string>,
): LexicalBody {
  const children: Node[] = []

  for (const section of sections) {
    children.push({
      tag: 'h2',
      type: 'heading',
      format: '',
      indent: 0,
      version: 1,
      children: [textNode(section.heading)],
      direction: null,
    })

    const pending = (section.links ?? [])
      .filter((link) => affiliateUrlByRef[link.productRef])
      .map((link) => ({ text: link.text, url: affiliateUrlByRef[link.productRef] }))

    for (const paragraph of section.paragraphs) {
      const here = pending.filter((link) => paragraph.includes(link.text))
      for (const link of here) pending.splice(pending.indexOf(link), 1)
      children.push({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        children: paragraphChildren(paragraph, here),
        direction: null,
        textStyle: '',
        textFormat: 0,
      })
    }
  }

  return {
    root: { type: 'root', format: '', indent: 0, version: 1, children, direction: null },
  }
}
