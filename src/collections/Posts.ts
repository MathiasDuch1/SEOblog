import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { assertSlugIsFreeOnDomain } from '../lib/slugs'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'domain', 'template', 'status', 'scheduledAt'],
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
        await assertSlugIsFreeOnDomain({ ...args, collection: 'posts' })
        return args.data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: "The article headline (H1), in the domain's language",
      },
    },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
      index: true,
      admin: {
        description: 'Every post belongs to exactly one domain; it is never shared across domains',
      },
    },
    {
      name: 'sourceCluster',
      type: 'relationship',
      relationTo: 'keyword-clusters',
      unique: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'The keyword cluster this post was generated from',
      },
    },
    {
      name: 'template',
      type: 'select',
      required: true,
      options: [
        { label: 'Listicle', value: 'listicle' },
        { label: 'Informational', value: 'informational' },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'URL segment, unique within the domain',
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
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Published', value: 'published' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'scheduledAt',
      type: 'date',
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'intro',
      type: 'textarea',
    },
    {
      name: 'products',
      type: 'array',
      admin: {
        condition: (data) => data?.template === 'listicle',
        description: 'Listicle template only',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'textarea',
        },
        {
          name: 'imageUrl',
          type: 'text',
          admin: {
            description: 'Pulled from the affiliate product feed',
          },
        },
        {
          name: 'affiliateUrl',
          type: 'text',
          required: true,
          admin: {
            description: "Link for this domain's country marketplace, e.g. amazon.com",
          },
        },
      ],
    },
    {
      name: 'body',
      type: 'richText',
      editor: lexicalEditor(),
      admin: {
        condition: (data) => data?.template === 'informational',
        description: 'Informational template only',
      },
    },
    {
      name: 'summary',
      type: 'textarea',
    },
  ],
}
