import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

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
      // Slugs are unique per domain; the same slug on another domain is allowed.
      async ({ data, originalDoc, req }) => {
        const domainValue = data?.domain ?? originalDoc?.domain
        const domain = typeof domainValue === 'object' && domainValue !== null ? domainValue.id : domainValue
        const slug = data?.slug ?? originalDoc?.slug
        if (!domain || !slug) return data

        const existing = await req.payload.find({
          collection: 'posts',
          where: {
            and: [
              { domain: { equals: domain } },
              { slug: { equals: slug } },
              ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })

        if (existing.docs.length > 0) {
          throw new ValidationError({
            collection: 'posts',
            errors: [{ message: 'Another post on this domain already uses this slug', path: 'slug' }],
            req,
          })
        }

        return data
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
