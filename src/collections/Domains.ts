import type { CollectionConfig } from 'payload'

export const Domains: CollectionConfig = {
  slug: 'domains',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'hostname',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'The domain this site is served from, e.g. example.com',
      },
    },
    {
      name: 'defaultLocale',
      type: 'text',
      required: true,
      defaultValue: 'en',
    },
    {
      name: 'activeLocales',
      type: 'text',
      hasMany: true,
      required: true,
      defaultValue: ['en'],
      admin: {
        description: 'Locale codes this domain publishes in, e.g. en, de',
      },
    },
    {
      name: 'branding',
      type: 'group',
      fields: [
        {
          name: 'logo',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'primaryColor',
          type: 'text',
        },
        {
          name: 'accentColor',
          type: 'text',
        },
      ],
    },
  ],
}
