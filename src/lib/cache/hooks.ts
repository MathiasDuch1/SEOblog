import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Domain, Page, Post } from '@/payload-types'

import { revalidateDomainChange, revalidatePageChange, revalidatePostChange } from './revalidate'

/**
 * Collection hooks that keep the public site current after editor changes. Only documents
 * that are or were published are visible, so drafts and scheduled posts revalidate nothing.
 */

const wasOrIsPublished = (doc?: { status?: string | null } | null, previous?: { status?: string | null } | null) =>
  doc?.status === 'published' || previous?.status === 'published'

export const revalidatePostAfterChange: CollectionAfterChangeHook<Post> = ({ doc, previousDoc }) => {
  if (wasOrIsPublished(doc, previousDoc)) revalidatePostChange(doc, previousDoc)
  return doc
}

export const revalidatePostAfterDelete: CollectionAfterDeleteHook<Post> = ({ doc }) => {
  if (wasOrIsPublished(doc)) revalidatePostChange(doc)
  return doc
}

export const revalidatePageAfterChange: CollectionAfterChangeHook<Page> = ({ doc, previousDoc }) => {
  if (wasOrIsPublished(doc, previousDoc)) revalidatePageChange(doc, previousDoc)
  return doc
}

export const revalidatePageAfterDelete: CollectionAfterDeleteHook<Page> = ({ doc }) => {
  if (wasOrIsPublished(doc)) revalidatePageChange(doc)
  return doc
}

export const revalidateDomainAfterChange: CollectionAfterChangeHook<Domain> = ({ doc, previousDoc }) => {
  revalidateDomainChange(doc, previousDoc)
  return doc
}
