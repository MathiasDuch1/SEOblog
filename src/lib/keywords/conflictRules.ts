import { normalizeForComparison, normalizeKeyword } from './normalize'

/**
 * Cannibalization rules: when a proposed cluster would compete with an existing cluster or
 * post on the same domain. Callers pass only that domain's clusters and posts — separate
 * country domains may target the same topic.
 *
 * No `server-only` import: pure functions, tested without the database.
 */

/** Share of the smaller keyword set that must be shared for two clusters to count as overlapping. */
export const OVERLAP_THRESHOLD = 0.5

export type ClusterCandidate = {
  clusterName: string
  primaryKeyword: string
  coreKeyword?: string | null
  keywords: { keyword: string }[]
}

export type ExistingCluster = ClusterCandidate & { id: number; status: string }
export type ExistingPost = { id: number; title: string; metaTitle?: string | null }

export type ConflictReason =
  | { type: 'primary-keyword'; clusterId: number; clusterName: string; detail: string }
  | { type: 'keyword-overlap'; clusterId: number; clusterName: string; overlap: number; detail: string }
  | { type: 'post-title'; postId: number; title: string; detail: string }

export type ClusterConflict = {
  /** Index of the proposed cluster in the input array. */
  index: number
  clusterName: string
  reasons: ConflictReason[]
}

const padded = (text: string) => ` ${text} `

/** SEO titles carry a " | Site name" suffix; only the article part names the keyword. */
const titlePart = (title: string) => title.split(' | ')[0]

export function detectConflicts(
  proposed: ClusterCandidate[],
  existing: ExistingCluster[],
  posts: ExistingPost[],
  language: string,
): ClusterConflict[] {
  const compare = (keyword: string) => normalizeForComparison(keyword, language)
  const coreOf = (cluster: ClusterCandidate) =>
    cluster.coreKeyword ? normalizeKeyword(cluster.coreKeyword) : null
  const primaryOf = (cluster: ClusterCandidate) => cluster.primaryKeyword || cluster.keywords[0]?.keyword || ''
  const keywordSet = (cluster: ClusterCandidate) =>
    new Set([primaryOf(cluster), ...cluster.keywords.map((k) => k.keyword)].filter(Boolean).map(compare))

  const conflicts: ClusterConflict[] = []
  proposed.forEach((candidate, index) => {
    const reasons: ConflictReason[] = []
    const core = coreOf(candidate)
    const primary = compare(primaryOf(candidate))
    const keywords = keywordSet(candidate)

    for (const other of existing) {
      const otherCore = coreOf(other)
      const otherPrimary = compare(primaryOf(other))

      if (core && otherCore && core === otherCore) {
        reasons.push({
          type: 'primary-keyword',
          clusterId: other.id,
          clusterName: other.clusterName,
          detail: `Same core keyword "${core}" as cluster "${other.clusterName}" (${other.status})`,
        })
        continue
      }
      if (primary && primary === otherPrimary) {
        reasons.push({
          type: 'primary-keyword',
          clusterId: other.id,
          clusterName: other.clusterName,
          detail: `Primary keyword "${candidate.primaryKeyword}" matches "${primaryOf(other)}" of cluster "${other.clusterName}" (${other.status})`,
        })
        continue
      }

      const otherKeywords = keywordSet(other)
      const shared = [...keywords].filter((k) => otherKeywords.has(k)).length
      const smaller = Math.min(keywords.size, otherKeywords.size)
      const overlap = smaller === 0 ? 0 : shared / smaller
      if (overlap >= OVERLAP_THRESHOLD) {
        reasons.push({
          type: 'keyword-overlap',
          clusterId: other.id,
          clusterName: other.clusterName,
          overlap,
          detail: `${Math.round(overlap * 100)}% of keywords shared with cluster "${other.clusterName}" (${other.status})`,
        })
      }
    }

    if (primary) {
      for (const post of posts) {
        const title = compare(titlePart(post.metaTitle || post.title))
        if (padded(title).includes(padded(primary))) {
          reasons.push({
            type: 'post-title',
            postId: post.id,
            title: post.metaTitle || post.title,
            detail: `Post "${post.metaTitle || post.title}" already targets "${candidate.primaryKeyword}"`,
          })
        }
      }
    }

    if (reasons.length > 0) conflicts.push({ index, clusterName: candidate.clusterName, reasons })
  })
  return conflicts
}
