import type { CollectionBeforeChangeHook } from 'payload'

const idOf = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { id: number }).id : (value as number | undefined)

/**
 * Posts and Pages `beforeChange` hook: when a published document's slug changes, its old URL
 * permanently redirects to the new one on the same domain, so indexed URLs never break.
 *
 * - `/{old}` → `/{new}` is created, or updated if it already exists.
 * - Redirects that pointed at `/{old}` are repointed at `/{new}`, so chains collapse to one hop.
 * - A redirect *from* `/{new}` is removed, because that path is live again (no loops).
 *
 * Runs inside the save's transaction (`req`), so a failed save leaves no redirects behind.
 */
export const createSlugRedirect: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || originalDoc?.status !== 'published') return data

  const oldSlug: string | undefined = originalDoc.slug
  const newSlug: string | undefined = data.slug ?? oldSlug
  const domain = idOf(originalDoc.domain)
  // A move to another domain is not a slug change on this domain; there is nothing to redirect to.
  if (!oldSlug || !newSlug || oldSlug === newSlug || !domain || idOf(data.domain ?? domain) !== domain) return data

  const from = `/${oldSlug}`
  const to = `/${newSlug}`
  const onDomain = { domain: { equals: domain } }

  await req.payload.delete({
    collection: 'redirects',
    where: { and: [onDomain, { from: { equals: to } }] },
    req,
  })

  await req.payload.update({
    collection: 'redirects',
    where: { and: [onDomain, { 'to.type': { equals: 'custom' } }, { 'to.url': { equals: from } }] },
    data: { to: { type: 'custom', url: to } },
    req,
  })

  const existing = await req.payload.find({
    collection: 'redirects',
    where: { and: [onDomain, { from: { equals: from } }] },
    limit: 1,
    depth: 0,
    req,
  })
  if (existing.docs[0]) {
    await req.payload.update({
      collection: 'redirects',
      id: existing.docs[0].id,
      data: { to: { type: 'custom', url: to } },
      req,
    })
  } else {
    await req.payload.create({
      collection: 'redirects',
      data: { from, to: { type: 'custom', url: to }, domain },
      req,
    })
  }

  return data
}
