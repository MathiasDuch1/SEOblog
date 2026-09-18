import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import type { KeywordCluster, User } from '@/payload-types'

const mocks = vi.hoisted(() => ({
  runResearch: vi.fn(),
  clusterKeywords: vi.fn(),
  saveClusters: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
}))

vi.mock('./research', () => ({ runResearch: mocks.runResearch }))
vi.mock('./cluster', () => ({ clusterKeywords: mocks.clusterKeywords }))
vi.mock('./saveClusters', () => ({ saveClusters: mocks.saveClusters }))
vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({ findByID: mocks.findByID, update: mocks.update }),
}))

const {
  ClusterNotEditableError,
  clusterKeywordsHandler,
  runResearchHandler,
  saveClustersHandler,
  UnauthorizedError,
  updateClusterHandler,
} = await import('./actionHandlers')

const user = { id: 1, email: 'editor@example.com', collection: 'users' } as unknown as User

const cluster = (status: KeywordCluster['status']): KeywordCluster =>
  ({
    id: 7,
    clusterName: 'Bedste tarotkort',
    primaryKeyword: 'bedste tarotkort',
    keywords: [
      { id: 'a', keyword: 'bedste tarotkort', searchVolume: 880, keywordDifficulty: 20, cpc: 0.9, intent: 'commercial' },
      { id: 'b', keyword: 'tarotkort', searchVolume: 2900, keywordDifficulty: 30, cpc: 0.5, intent: 'commercial' },
    ],
    targetTemplate: 'listicle',
    suggestedTemplate: 'listicle',
    status,
    source: 'dataforseo',
    targetDomain: 13,
    updatedAt: '',
    createdAt: '',
  }) as KeywordCluster

const validInputs = {
  research: { domainId: 13, seedKeywords: ['tarotkort'], limitPerEndpoint: 20 },
  cluster: { runId: 3 },
  save: {
    runId: 3,
    clusters: [
      {
        clusterName: 'Bedste tarotkort',
        primaryKeyword: 'bedste tarotkort',
        keywords: [{ keyword: 'bedste tarotkort' }],
        suggestedTemplate: 'listicle',
        rationale: 'Købsintention.',
      },
    ],
  },
  update: { clusterId: 7, clusterName: 'Tarotkort til begyndere' },
}

const handlers = [
  ['runResearch', runResearchHandler, validInputs.research, { domainId: 13, seedKeywords: [], limitPerEndpoint: 20 }],
  ['clusterKeywords', clusterKeywordsHandler, validInputs.cluster, { runId: 'three' }],
  ['saveClusters', saveClustersHandler, validInputs.save, { runId: 3, clusters: [{ clusterName: 'x' }] }],
  ['updateCluster', updateClusterHandler, validInputs.update, { clusterId: 7 }],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runResearch.mockResolvedValue({ runId: 3, reused: false, costUsd: 0.01, rows: [] })
  mocks.clusterKeywords.mockResolvedValue({ runId: 3, clusters: [], issues: [] })
  mocks.saveClusters.mockResolvedValue({ saved: [], refused: [] })
  mocks.findByID.mockResolvedValue(cluster('unused'))
  mocks.update.mockImplementation(async ({ data }) => ({ docs: [{ ...cluster('unused'), ...data }] }))
})

describe.each(handlers)('%s', (_name, handler, valid, invalid) => {
  it('throws without a user and does no work', async () => {
    await expect(handler(null, valid)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mocks.runResearch).not.toHaveBeenCalled()
    expect(mocks.clusterKeywords).not.toHaveBeenCalled()
    expect(mocks.saveClusters).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('throws a zod error for invalid input', async () => {
    await expect(handler(user, invalid)).rejects.toBeInstanceOf(ZodError)
  })

  it('succeeds with a user and valid input, returning serializable data', async () => {
    const result = await handler(user, valid)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})

describe('updateCluster', () => {
  it('refuses a cluster that is already assigned', async () => {
    mocks.findByID.mockResolvedValue(cluster('assigned'))
    await expect(updateClusterHandler(user, validInputs.update)).rejects.toBeInstanceOf(ClusterNotEditableError)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses when the cluster stops being unused before the conditional update', async () => {
    mocks.update.mockResolvedValue({ docs: [] })
    mocks.findByID.mockResolvedValueOnce(cluster('unused')).mockResolvedValueOnce(cluster('assigned'))
    await expect(updateClusterHandler(user, validInputs.update)).rejects.toThrow(/assigned/)
  })

  it('keeps stored metrics for kept keywords and requires the primary keyword among them', async () => {
    const result = await updateClusterHandler(user, {
      clusterId: 7,
      keywords: [{ keyword: 'Bedste tarotkort' }, { keyword: 'tarotkort for begyndere' }],
      targetTemplate: 'informational',
    })
    expect(result.keywords).toEqual([
      { keyword: 'Bedste tarotkort', searchVolume: 880, keywordDifficulty: 20, cpc: 0.9, intent: 'commercial' },
      { keyword: 'tarotkort for begyndere', searchVolume: null, keywordDifficulty: null, cpc: null, intent: null },
    ])
    expect(result.targetTemplate).toBe('informational')
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { and: [{ id: { equals: 7 } }, { status: { equals: 'unused' } }] } }),
    )

    await expect(
      updateClusterHandler(user, { clusterId: 7, keywords: [{ keyword: 'tarotkort' }] }),
    ).rejects.toBeInstanceOf(ZodError)
  })
})
