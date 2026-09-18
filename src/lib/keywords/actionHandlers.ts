import 'server-only'

import { z } from 'zod'

import { KEYWORD_ENDPOINTS, KEYWORD_INTENTS } from '@/lib/dataforseo/client'
import { getPayloadClient } from '@/lib/payload'
import type { KeywordCluster, User } from '@/payload-types'

import { clusterKeywords } from './cluster'
import { normalizeKeyword } from './normalize'
import { runResearch } from './research'
import { saveClusters } from './saveClusters'

/**
 * The bodies of the keyword Server Actions in `actions.ts`, taking the authenticated user as an
 * argument so they can be tested without a request. Each one requires a user, validates its
 * input with zod, and returns plain serializable data.
 */

export class UnauthorizedError extends Error {
  constructor() {
    super('You must be logged in')
    this.name = 'UnauthorizedError'
  }
}

export class ClusterNotEditableError extends Error {
  constructor(clusterId: number, status: string) {
    super(`Cluster ${clusterId} is ${status}; only unused clusters can be edited`)
    this.name = 'ClusterNotEditableError'
  }
}

function requireUser(user: User | null | undefined): asserts user is User {
  if (!user) throw new UnauthorizedError()
}

const id = z.number().int().positive()
const keyword = z.string().trim().min(1).max(200)
const template = z.enum(['listicle', 'informational'])

// ---------------------------------------------------------------- research

export const runResearchInput = z.object({
  domainId: id,
  seedKeywords: z.array(keyword).min(1).max(200),
  limitPerEndpoint: z.number().int().min(1).max(1000),
  endpoints: z.array(z.enum(KEYWORD_ENDPOINTS)).min(1).optional(),
  force: z.boolean().optional(),
})

export async function runResearchHandler(user: User | null, input: unknown) {
  requireUser(user)
  return runResearch(runResearchInput.parse(input))
}

// ---------------------------------------------------------------- clustering

export const clusterKeywordsInput = z.object({ runId: id })

export async function clusterKeywordsHandler(user: User | null, input: unknown) {
  requireUser(user)
  const { runId } = clusterKeywordsInput.parse(input)
  return clusterKeywords(runId)
}

// ---------------------------------------------------------------- saving

export const saveClustersInput = z.object({
  runId: id,
  targetDomainId: id.optional(),
  clusters: z
    .array(
      z.object({
        clusterName: z.string().trim().min(1).max(200),
        primaryKeyword: keyword,
        coreKeyword: z.string().nullish(),
        keywords: z.array(z.object({ keyword })).min(1),
        suggestedTemplate: template,
        rationale: z.string().max(2000).default(''),
        allowConflict: z.boolean().optional(),
      }),
    )
    .min(1),
})

export async function saveClustersHandler(user: User | null, input: unknown) {
  requireUser(user)
  return saveClusters(saveClustersInput.parse(input))
}

// ---------------------------------------------------------------- editing

export const updateClusterInput = z
  .object({
    clusterId: id,
    clusterName: z.string().trim().min(1).max(200).optional(),
    primaryKeyword: keyword.optional(),
    keywords: z.array(z.object({ keyword })).min(1).optional(),
    targetTemplate: template.optional(),
  })
  .refine((v) => v.clusterName ?? v.primaryKeyword ?? v.keywords ?? v.targetTemplate, {
    message: 'Nothing to update',
  })

export type EditableCluster = {
  id: number
  clusterName: string
  primaryKeyword: string
  keywords: {
    keyword: string
    searchVolume: number | null
    keywordDifficulty: number | null
    cpc: number | null
    intent: (typeof KEYWORD_INTENTS)[number] | null
  }[]
  targetTemplate: 'listicle' | 'informational'
  suggestedTemplate: 'listicle' | 'informational' | null
  status: KeywordCluster['status']
}

const toEditable = (doc: KeywordCluster): EditableCluster => ({
  id: doc.id,
  clusterName: doc.clusterName,
  primaryKeyword: doc.primaryKeyword ?? doc.keywords[0]?.keyword ?? '',
  keywords: doc.keywords.map((k) => ({
    keyword: k.keyword,
    searchVolume: k.searchVolume ?? null,
    keywordDifficulty: k.keywordDifficulty ?? null,
    cpc: k.cpc ?? null,
    intent: k.intent ?? null,
  })),
  targetTemplate: doc.targetTemplate,
  suggestedTemplate: doc.suggestedTemplate ?? null,
  status: doc.status,
})

/**
 * Renames a cluster, edits its keywords, or changes its target template — only while it is
 * `unused`. Kept keywords keep their stored metrics; added keywords have none. The update is
 * conditional on the status, so a cluster submitted for generation meanwhile is never changed.
 */
export async function updateClusterHandler(user: User | null, input: unknown): Promise<EditableCluster> {
  requireUser(user)
  const { clusterId, clusterName, primaryKeyword, keywords, targetTemplate } = updateClusterInput.parse(input)

  const payload = await getPayloadClient()
  const current = await payload.findByID({ collection: 'keyword-clusters', id: clusterId, depth: 0 })
  if (current.status !== 'unused') throw new ClusterNotEditableError(clusterId, current.status)

  const data: Partial<KeywordCluster> = {}
  if (clusterName) data.clusterName = clusterName

  const stored = new Map(current.keywords.map((k) => [normalizeKeyword(k.keyword), k]))
  const nextKeywords = keywords
    ? [...new Map(keywords.map((k) => [normalizeKeyword(k.keyword), k.keyword.trim()])).entries()].map(
        ([key, text]) => {
          const kept = stored.get(key)
          return kept
            ? { keyword: text, searchVolume: kept.searchVolume, keywordDifficulty: kept.keywordDifficulty, cpc: kept.cpc, intent: kept.intent }
            : { keyword: text }
        },
      )
    : current.keywords
  const nextPrimary = primaryKeyword ?? current.primaryKeyword ?? nextKeywords[0]?.keyword
  if (!nextKeywords.some((k) => normalizeKeyword(k.keyword) === normalizeKeyword(nextPrimary ?? ''))) {
    throw new z.ZodError([
      { code: 'custom', path: ['primaryKeyword'], message: 'The primary keyword must be one of the keywords', input },
    ])
  }
  if (keywords) data.keywords = nextKeywords
  if (primaryKeyword) data.primaryKeyword = primaryKeyword
  if (targetTemplate) data.targetTemplate = targetTemplate

  const { docs } = await payload.update({
    collection: 'keyword-clusters',
    where: { and: [{ id: { equals: clusterId } }, { status: { equals: 'unused' } }] },
    data,
    depth: 0,
  })
  if (!docs[0]) {
    const latest = await payload.findByID({ collection: 'keyword-clusters', id: clusterId, depth: 0 })
    throw new ClusterNotEditableError(clusterId, latest.status)
  }
  return toEditable(docs[0])
}
