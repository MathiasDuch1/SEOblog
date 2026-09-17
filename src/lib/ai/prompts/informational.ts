import { requestHeader, SHARED_RULES, systemBlocks, type ArticleRequestInput } from './shared'
import type { Product } from '@/lib/affiliate/types'

export const INFORMATIONAL_SYSTEM_PROMPT = `${SHARED_RULES}

# Template: informational

You are writing an editorial guide that answers the reader's question thoroughly — a how-to, an explainer, or practical advice. The page renders, in order: the headline, the intro, the body sections (each an H2 heading with paragraphs), and the summary.

- intro: 50–100 words. Name the reader's question or problem, include the primary keyword early, and tell the reader what the article will help them do.
- sections: 4–6 sections. Each has:
  - heading: a specific, informative H2 heading (not "Introduction" or "Conclusion"). Use the primary or a supporting keyword in at least one heading where it reads naturally.
  - paragraphs: 2–4 plain-text paragraphs of two to four sentences each.
  - links (optional): inline affiliate links. Only add a link where a product genuinely helps the reader at that point, and use at most one link per section and three in the whole article. Each link's text must appear word for word in one of that section's paragraphs (it becomes the clickable anchor), should be a short natural phrase of two to five words written as part of the sentence (never the full product title pasted into the text), and its productRef must be one of the supplied product ids. If no product fits, omit links entirely — a useful article without links is better than a forced one.
- summary: 40–90 words. The key takeaways and a practical next step. Do not repeat the intro.
- The whole article should be roughly 900–1,300 words.`

export const informationalSystem = () => systemBlocks(INFORMATIONAL_SYSTEM_PROMPT)

export function informationalUserMessage(input: ArticleRequestInput & { products: Product[] }): string {
  const products =
    input.products.length > 0
      ? input.products.map((product) => `- id: ${product.id}\n  title: ${product.title}`).join('\n')
      : '- (none — do not add links)'
  return `${requestHeader(input)}

Template: informational
Target length: 900–1,300 words

Products you may link to where genuinely helpful (use these ids as productRef):
${products}`
}
