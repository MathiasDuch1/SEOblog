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
      name: 'locale',
      type: 'text',
      required: true,
      admin: {
        description: 'The single language + country this domain publishes in, e.g. de-DE, en-GB',
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
