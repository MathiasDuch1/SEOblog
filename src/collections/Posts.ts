import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'domain', 'template', 'status', 'scheduledAt'],
  },
  fields: [
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
      admin: {
        description: 'Every post belongs to exactly one domain; it is never shared across domains',
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
      admin: {
        description: 'URL segment, unique within the domain',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
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
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
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
            description: "Link for this domain's country marketplace, e.g. amazon.de",
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
