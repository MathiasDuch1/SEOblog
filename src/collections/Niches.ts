import type { CollectionConfig } from 'payload'

/**
 * A topic area a set of domains covers, e.g. Outdoor or Kitchen.
 * Domains are grouped by niche so a month of content can be generated for
 * every domain in one niche at a time. Niches are internal — visitors never see them.
 */
export const Niches: CollectionConfig = {
  slug: 'niches',
  // Payload would otherwise singularize "niches" to "Nich".
  typescript: { interface: 'Niche' },
  admin: {
    group: 'Setup',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'description'],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name, e.g. Outdoor',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Short identifier used in scripts and filters, e.g. outdoor',
      },
      hooks: {
        beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)],
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'What this niche covers, for editors',
      },
    },
  ],
}
