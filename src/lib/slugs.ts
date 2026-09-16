import { ValidationError } from 'payload'
import type { PayloadRequest } from 'payload'

/**
 * A slug identifies one document per domain, across **both** `posts` and `pages` — they
 * share the `/{slug}` URL space. The same slug on another domain is always allowed.
 */
export async function assertSlugIsFreeOnDomain({
  collection,
  data,
  originalDoc,
  req,
}: {
  collection: 'posts' | 'pages'
  data?: Record<string, unknown> | null
  originalDoc?: Record<string, unknown> | null
  req: PayloadRequest
}): Promise<void> {
  const domainValue = data?.domain ?? originalDoc?.domain
  const domain =
    typeof domainValue === 'object' && domainValue !== null
      ? (domainValue as { id: number }).id
      : domainValue
  const slug = data?.slug ?? originalDoc?.slug
  if (!domain || !slug) return

  const currentId = (originalDoc as { id?: number | string } | null | undefined)?.id

  for (const target of ['posts', 'pages'] as const) {
    const result = await req.payload.find({
      collection: target,
      where: {
        and: [
          { domain: { equals: domain } },
          { slug: { equals: slug } },
          ...(target === collection && currentId ? [{ id: { not_equals: currentId } }] : []),
        ],
      },
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })

    if (result.docs.length > 0) {
      throw new ValidationError({
        collection,
        errors: [
          {
            message:
              target === collection
                ? `Another ${target === 'posts' ? 'post' : 'page'} on this domain already uses this slug`
                : `A ${target === 'posts' ? 'post' : 'page'} on this domain already uses this slug`,
            path: 'slug',
          },
        ],
        req,
      })
    }
  }
}
