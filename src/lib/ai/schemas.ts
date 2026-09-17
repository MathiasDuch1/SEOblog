import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

/**
 * Output schemas for one generated article. The same schema builds the `output_config.format`
 * sent in each batch request and validates the result on import.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const slug = z
  .string()
  .regex(
    SLUG_PATTERN,
    'Slug must be lowercase kebab-case ASCII (a-z, 0-9, single hyphens). Transliterate letters like æ → ae, ø → oe, å → aa.',
  )
  .max(80)
  .describe("URL slug in the domain's language, lowercase kebab-case ASCII only")

const meta = z.object({
  title: z.string().min(1).max(60).describe('SEO title, at most 60 characters'),
  description: z.string().min(1).max(160).describe('SEO meta description, at most 160 characters'),
})

const title = z.string().min(1).max(110).describe("The article headline (H1) in the domain's language")

export const listicleSchema = z.object({
  title,
  slug,
  intro: z.string().min(1),
  products: z
    .array(
      z.object({
        productRef: z.string().describe('The id of the input product this entry describes'),
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
  summary: z.string().min(1),
  meta,
})

export const informationalSchema = z.object({
  title,
  slug,
  intro: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        paragraphs: z.array(z.string().min(1)).min(1),
        links: z
          .array(
            z.object({
              text: z.string().min(1).describe('Anchor text, taken verbatim from one of the paragraphs'),
              productRef: z.string().describe('The id of the input product to link to'),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  summary: z.string().min(1),
  meta,
})

export type ListicleOutput = z.infer<typeof listicleSchema>
export type InformationalOutput = z.infer<typeof informationalSchema>
export type Template = 'listicle' | 'informational'
export type GeneratedArticle =
  | { template: 'listicle'; output: ListicleOutput }
  | { template: 'informational'; output: InformationalOutput }

/** `output_config.format` for a template, without the SDK helper's client-side `parse` function. */
export function outputFormatFor(template: Template): { type: 'json_schema'; schema: Record<string, unknown> } {
  const { type, schema } = zodOutputFormat(template === 'listicle' ? listicleSchema : informationalSchema)
  return { type, schema }
}

export class GeneratedOutputError extends Error {}

/**
 * Parses and validates a model's text output. Beyond the schema, checks that product
 * references match the products the model was given: a listicle covers every input product
 * exactly once, and informational links only point at input products.
 */
export function parseGeneratedArticle(
  template: Template,
  text: string,
  productRefs: string[],
): GeneratedArticle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new GeneratedOutputError(`Output is not valid JSON: ${(error as Error).message}`)
  }

  const schema = template === 'listicle' ? listicleSchema : informationalSchema
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new GeneratedOutputError(`Output failed validation:\n- ${issues.join('\n- ')}`)
  }

  const known = new Set(productRefs)
  if (template === 'listicle') {
    const output = result.data as ListicleOutput
    const seen = output.products.map((product) => product.productRef)
    const unknown = seen.filter((ref) => !known.has(ref))
    const duplicated = seen.filter((ref, index) => seen.indexOf(ref) !== index)
    const missing = productRefs.filter((ref) => !seen.includes(ref))
    const problems = [
      ...unknown.map((ref) => `unknown product ${ref}`),
      ...duplicated.map((ref) => `product ${ref} appears more than once`),
      ...missing.map((ref) => `missing product ${ref}`),
    ]
    if (problems.length > 0) {
      throw new GeneratedOutputError(`Output products don't match the input:\n- ${problems.join('\n- ')}`)
    }
    return { template, output }
  }

  const output = result.data as InformationalOutput
  const unknown = output.sections
    .flatMap((section) => section.links ?? [])
    .map((link) => link.productRef)
    .filter((ref) => !known.has(ref))
  if (unknown.length > 0) {
    throw new GeneratedOutputError(`Output links to unknown products: ${[...new Set(unknown)].join(', ')}`)
  }
  return { template, output }
}
