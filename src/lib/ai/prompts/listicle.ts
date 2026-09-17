import { requestHeader, SHARED_RULES, systemBlocks, type ArticleRequestInput } from './shared'
import type { Product } from '@/lib/affiliate/types'

export const LISTICLE_SYSTEM_PROMPT = `${SHARED_RULES}

# Template: listicle

You are writing a product roundup ("the best …") that helps a reader choose between specific products. The page renders, in order: the headline, the intro, one block per product (title, description, and a "Buy now" button linking to the retailer), and the summary.

- intro: 60–110 words. State the reader's need, include the primary keyword early, and say briefly how the list is organised or what to consider. Do not name every product here.
- products: exactly one entry per product in the request, in the same order as the request. Each entry has:
  - productRef: the id of the product, copied exactly.
  - title: a clear, readable product name based on the supplied title.
  - description: 70–120 words. Who it suits, what sets it apart from the others in the list where the supplied data shows a difference, and anything to consider before buying — grounded only in the supplied data. Do not start every description the same way, and do not include a call to action; the page adds the button.
- summary: 50–100 words. Help the reader decide: which kind of reader should pick which kind of option. Do not introduce new products.
- The whole article should be roughly 500–900 words, depending on how many products there are.`

export const listicleSystem = () => systemBlocks(LISTICLE_SYSTEM_PROMPT)

export function listicleUserMessage(input: ArticleRequestInput & { products: Product[] }): string {
  const products = input.products
    .map((product) => `- id: ${product.id}\n  title: ${product.title}`)
    .join('\n')
  return `${requestHeader(input)}

Template: listicle
Target length: 500–900 words

Products (cover every one exactly once, in this order, using these ids as productRef):
${products}`
}
