import 'server-only'

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

import { anthropic, generationEffort, generationModel } from '@/lib/ai/client'
import type { KeywordRow } from '@/lib/dataforseo/client'
import { getPayloadClient } from '@/lib/payload'
import type { Niche } from '@/payload-types'

import {
  clusterOutputSchema,
  clusterSystemPrompt,
  clusterUserMessage,
  collapseVariants,
  validateClusters,
  type ValidatedClusters,
} from './clusterRules'

export type ClusterResult = ValidatedClusters & {
  runId: number
  domainId: number
  inputKeywords: number
  usage: { inputTokens: number; outputTokens: number }
}

const { type: formatType, schema: formatSchema } = zodOutputFormat(clusterOutputSchema)

/**
 * Groups a research run's keywords into article clusters with one standard Claude call.
 * Nothing is saved; the SEO interface reviews the result and saves it with `saveClusters`.
 */
export async function clusterKeywords(runId: number): Promise<ClusterResult> {
  const payload = await getPayloadClient()
  const run = await payload.findByID({ collection: 'keyword-research-runs', id: runId, depth: 0 })
  if (run.status !== 'complete') throw new Error(`Research run ${runId} is ${run.status}, not complete`)

  const domainId = typeof run.domain === 'object' ? run.domain.id : run.domain
  const domain = await payload.findByID({ collection: 'domains', id: domainId, depth: 1 })
  const niche = domain.niche as Niche

  const rows = (run.rows ?? []) as KeywordRow[]
  const entries = collapseVariants(rows)
  if (entries.length === 0) throw new Error(`Research run ${runId} has no keywords to cluster`)

  // Streamed: a few hundred keywords can produce a long answer, beyond non-streaming timeouts.
  const message = await anthropic.messages
    .stream({
      model: generationModel(),
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: generationEffort(), format: { type: formatType, schema: formatSchema } },
      system: clusterSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: clusterUserMessage(entries, {
            domainName: domain.name,
            locale: domain.locale,
            nicheName: niche.name,
            nicheDescription: niche.description,
          }),
        },
      ],
    })
    .finalMessage()

  if (message.stop_reason === 'refusal') throw new Error('Clustering request was refused')
  if (message.stop_reason === 'max_tokens') throw new Error('Clustering output hit max_tokens; research fewer keywords')

  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  const parsed = clusterOutputSchema.safeParse(JSON.parse(text))
  if (!parsed.success) {
    throw new Error(`Clustering output failed validation: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
  }

  const validated = validateClusters(parsed.data, entries)
  payload.logger.info(
    `Clustering: run ${runId} → ${validated.clusters.length} clusters from ${entries.length} keywords (${validated.issues.length} post-validation fixes)`,
  )
  return {
    ...validated,
    runId,
    domainId,
    inputKeywords: entries.length,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  }
}
