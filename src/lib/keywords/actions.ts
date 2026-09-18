'use server'

import 'server-only'

import { headers } from 'next/headers'

import { getPayloadClient } from '@/lib/payload'

import {
  clusterKeywordsHandler,
  runResearchHandler,
  saveClustersHandler,
  updateClusterHandler,
} from './actionHandlers'

/**
 * Keyword research Server Actions for the SEO interface (phase 06). Server Actions are
 * reachable by direct POST, so each one authenticates from the request cookies itself.
 */

async function currentUser() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  return user
}

export async function runResearchAction(input: unknown) {
  return runResearchHandler(await currentUser(), input)
}

export async function clusterKeywordsAction(input: unknown) {
  return clusterKeywordsHandler(await currentUser(), input)
}

export async function saveClustersAction(input: unknown) {
  return saveClustersHandler(await currentUser(), input)
}

export async function updateClusterAction(input: unknown) {
  return updateClusterHandler(await currentUser(), input)
}
