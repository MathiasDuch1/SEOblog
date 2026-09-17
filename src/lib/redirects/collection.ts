import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { ValidationError } from 'payload'
import type { Field, TextField } from 'payload'

import { revalidateRedirectsChange } from '../cache/revalidate'

const idOf = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { id: number }).id : (value as number | undefined)

/**
 * `redirects` collection from `@payloadcms/plugin-redirects`, scoped to one domain per
 * redirect. The plugin makes `from` globally unique; here it is unique per domain instead,
 * because `/best-tents` on two country domains are unrelated URLs.
 *
 * Slug-change redirects are created automatically by `createSlugRedirect`; editors can also
 * add manual ones in the admin.
 */
export const redirects = redirectsPlugin({
  collections: ['posts', 'pages'],
  overrides: {
    admin: {
      group: 'Content',
      defaultColumns: ['from', 'to.url', 'domain', 'updatedAt'],
    },
    access: {
      read: () => true,
      create: ({ req }) => Boolean(req.user),
      update: ({ req }) => Boolean(req.user),
      delete: ({ req }) => Boolean(req.user),
    },
    hooks: {
      beforeValidate: [
        async ({ data, originalDoc, req }) => {
          const domain = idOf(data?.domain ?? originalDoc?.domain)
          const from = data?.from ?? originalDoc?.from
          if (!domain || !from) return data
          const clash = await req.payload.find({
            collection: 'redirects',
            where: {
              and: [
                { domain: { equals: domain } },
                { from: { equals: from } },
                ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
              ],
            },
            limit: 1,
            depth: 0,
            req,
          })
          if (clash.docs.length > 0) {
            throw new ValidationError({
              collection: 'redirects',
              errors: [{ path: 'from', message: 'This domain already has a redirect from this path' }],
              req,
            })
          }
          return data
        },
      ],
      afterChange: [
        ({ doc, previousDoc }) => {
          revalidateRedirectsChange(idOf(doc.domain), idOf(previousDoc?.domain))
          return doc
        },
      ],
      afterDelete: [
        ({ doc }) => {
          revalidateRedirectsChange(idOf(doc.domain))
          return doc
        },
      ],
    },
    fields: ({ defaultFields }) => [
      ...defaultFields.map((field): Field =>
        'name' in field && field.name === 'from'
          ? {
              ...(field as TextField),
              unique: false,
              admin: { description: 'Path on this domain, starting with a slash, e.g. /old-slug' },
            }
          : field,
      ),
      {
        name: 'domain',
        type: 'relationship',
        relationTo: 'domains',
        required: true,
        index: true,
        admin: { position: 'sidebar', description: 'The redirect only applies on this domain' },
      },
    ],
  },
})
