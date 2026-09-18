import { z } from 'zod'

import type { KeywordIntent, KeywordRow } from '../dataforseo/client'
import { normalizeKeyword } from './normalize'

/**
 * The code half of keyword clustering: collapsing DataForSEO close variants before the model
 * sees them, the model's output schema, and the post-validation that never trusts the model
 * to follow its instructions.
 *
 * No `server-only` import: pure functions, tested without the API.
 */

export type Template = 'listicle' | 'informational'

/** One query after close variants are collapsed: the highest-volume variant plus the rest. */
export type KeywordEntry = KeywordRow & {
  /** The shared synonym group, normalized: `core_keyword`, or the keyword itself when it has none. */
  groupKey: string
  variants: KeywordRow[]
}

export type ProposedCluster = {
  clusterName: string
  primaryKeyword: string
  /** Synonym group of the primary keyword, for cannibalization checks. */
  coreKeyword: string
  /** Every keyword the article covers, variants included; the primary keyword first. */
  keywords: KeywordRow[]
  suggestedTemplate: Template
  rationale: string
}

/**
 * Rows sharing a `core_keyword` become one entry, represented by the variant with the highest
 * search volume. A row whose own text is another row's `core_keyword` joins that group too.
 */
export function collapseVariants(rows: KeywordRow[]): KeywordEntry[] {
  const groups = new Map<string, KeywordRow[]>()
  for (const row of rows) {
    const key = normalizeKeyword(row.coreKeyword ?? row.keyword)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.entries()]
    .map(([groupKey, members]) => {
      const [best, ...rest] = [...members].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
      return { ...best, groupKey, variants: rest }
    })
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
}

// ---------------------------------------------------------------- model output

export const clusterOutputSchema = z.object({
  clusters: z.array(
    z.object({
      clusterName: z.string().min(1).describe("Short article topic name, in the domain's language"),
      primaryKeyword: z.string().min(1).describe('The keyword the article targets; one of the input keywords, verbatim'),
      keywords: z
        .array(z.string().min(1))
        .min(1)
        .describe('Every input keyword this article covers, verbatim, including the primary keyword'),
      suggestedTemplate: z.enum(['listicle', 'informational']),
      rationale: z.string().min(1).describe("One sentence explaining the grouping, in the domain's language"),
    }),
  ),
})

export type ClusterOutput = z.infer<typeof clusterOutputSchema>

/** Template implied by DataForSEO's search intent, used as guidance and as a fallback. */
export function templateForIntent(intent: KeywordIntent | null): Template {
  return intent === 'commercial' || intent === 'transactional' ? 'listicle' : 'informational'
}

export type ClusterPromptContext = {
  domainName: string
  locale: string
  nicheName: string
  nicheDescription?: string | null
}

export function clusterSystemPrompt(): string {
  return [
    'You group search keywords into article plans for an affiliate blog. Each cluster becomes exactly one article.',
    '',
    'Put keywords in the same cluster when one article can fully satisfy all of those searches — same topic and compatible search intent. Keep a keyword separate when it needs its own article. Close spelling variants were already merged, so every input keyword is a distinct query.',
    '',
    'Rules:',
    '- Use input keywords verbatim. Never invent, translate, or rephrase keywords.',
    '- Each keyword belongs to at most one cluster. Leave out keywords that are off-topic for the niche, navigational (brand or site lookups), or not worth an article.',
    '- primaryKeyword is the keyword in the cluster the article should rank for: usually the highest search volume with a reasonable keyword difficulty.',
    '- suggestedTemplate: "listicle" (a ranked list of products) for commercial or transactional intent; "informational" (an explanatory article) for informational intent. Follow the intent of the primary keyword unless the cluster clearly calls for the other template.',
    "- Write clusterName and rationale in the domain's language (given by its locale), as an editor in that country would.",
  ].join('\n')
}

export function clusterUserMessage(entries: KeywordEntry[], context: ClusterPromptContext): string {
  const lines = entries.map((entry) =>
    JSON.stringify({
      keyword: entry.keyword,
      variants: entry.variants.map((v) => v.keyword),
      volume: entry.searchVolume,
      kd: entry.keywordDifficulty,
      intent: entry.intent,
    }),
  )
  return [
    `Domain: ${context.domainName}`,
    `Locale: ${context.locale}`,
    `Niche: ${context.nicheName}${context.nicheDescription ? ` — ${context.nicheDescription}` : ''}`,
    '',
    `Keywords (${entries.length}, one JSON object per line; volume = monthly searches, kd = keyword difficulty 0–100):`,
    ...lines,
  ].join('\n')
}

// ---------------------------------------------------------------- post-validation

export type ValidatedClusters = {
  clusters: ProposedCluster[]
  /** What post-validation changed, for logs and the SEO interface. */
  issues: string[]
}

const toRow = (entry: KeywordEntry): KeywordRow => ({
  keyword: entry.keyword,
  searchVolume: entry.searchVolume,
  cpc: entry.cpc,
  competition: entry.competition,
  keywordDifficulty: entry.keywordDifficulty,
  intent: entry.intent,
  coreKeyword: entry.coreKeyword,
})

/**
 * Enforces the clustering rules in code: keywords not in the input are dropped, a keyword
 * assigned to several clusters stays only in the first, each kept keyword gets its collapsed
 * variants back, and clusters left empty are dropped. A primary keyword that didn't survive
 * is replaced by the cluster's highest-volume keyword.
 */
export function validateClusters(output: ClusterOutput, entries: KeywordEntry[]): ValidatedClusters {
  const byKeyword = new Map(entries.map((entry) => [normalizeKeyword(entry.keyword), entry]))
  const assigned = new Map<string, string>()
  const issues: string[] = []
  const clusters: ProposedCluster[] = []

  for (const cluster of output.clusters) {
    const primaryKey = normalizeKeyword(cluster.primaryKeyword)
    const kept: KeywordEntry[] = []
    const seen = new Set<string>()

    // The primary keyword counts as a member even if the model forgot to list it.
    for (const raw of [cluster.primaryKeyword, ...cluster.keywords]) {
      const key = normalizeKeyword(raw)
      if (seen.has(key)) continue
      seen.add(key)

      const entry = byKeyword.get(key)
      if (!entry) {
        issues.push(`"${cluster.clusterName}": dropped "${raw}", which isn't an input keyword`)
        continue
      }
      const owner = assigned.get(key)
      if (owner !== undefined) {
        issues.push(`"${cluster.clusterName}": dropped "${raw}", already assigned to "${owner}"`)
        continue
      }
      assigned.set(key, cluster.clusterName)
      kept.push(entry)
    }

    if (kept.length === 0) {
      issues.push(`Dropped cluster "${cluster.clusterName}": no valid keywords left`)
      continue
    }

    let primary = kept.find((entry) => normalizeKeyword(entry.keyword) === primaryKey)
    if (!primary) {
      primary = [...kept].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))[0]
      issues.push(`"${cluster.clusterName}": primary keyword "${cluster.primaryKeyword}" replaced by "${primary.keyword}"`)
    }

    const ordered = [primary, ...kept.filter((entry) => entry !== primary)]
    clusters.push({
      clusterName: cluster.clusterName.trim(),
      primaryKeyword: primary.keyword,
      coreKeyword: primary.groupKey,
      keywords: ordered.flatMap((entry) => [toRow(entry), ...entry.variants]),
      suggestedTemplate: cluster.suggestedTemplate,
      rationale: cluster.rationale.trim(),
    })
  }

  return { clusters, issues }
}
