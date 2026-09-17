import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { assertSlugIsFreeOnDomain } from '../lib/slugs'

/**
 * Legal and static pages — privacy, imprint, about, affiliate disclosure — one set per
 * domain, in that domain's language. Not part of spec §4; added in phase 02 because every
 * affiliate site needs them and they share the `/{slug}` URL space with posts.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'domain', 'type', 'status'],
  },
  access: {
    read: ({ req }) => (req.user ? true : { status: { equals: 'published' } }),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeValidate: [
      async (args) => {
        await assertSlugIsFreeOnDomain({ ...args, collection: 'pages' })
        return args.data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'other',
      options: [
        { label: 'About', value: 'about' },
        { label: 'Privacy policy', value: 'privacy' },
        { label: 'Imprint', value: 'imprint' },
        { label: 'Terms', value: 'terms' },
        { label: 'Affiliate disclosure', value: 'affiliate-disclosure' },
        { label: 'Contact', value: 'contact' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'URL segment, unique within the domain across pages and posts',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'body',
      type: 'richText',
      editor: lexicalEditor(),
    },
  ],
}