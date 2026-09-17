import type { CollectionConfig } from 'payload'

import { isSupportedLocale, SUPPORTED_LOCALES } from '../lib/locales'

export const Domains: CollectionConfig = {
  slug: 'domains',
  admin: {
    group: 'Setup',
    useAsTitle: 'name',
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
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
      hooks: {
        beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)],
      },
    },
    {
      name: 'niche',
      type: 'relationship',
      relationTo: 'niches',
      required: true,
      index: true,
      admin: {
        description: 'The topic area this domain covers. Content runs are grouped by niche.',
      },
    },
    {
      name: 'locale',
      type: 'text',
      required: true,
      admin: {
        description: `The single language + country this domain publishes in. One of: ${SUPPORTED_LOCALES.join(', ')}`,
      },
      validate: (value: string | null | undefined) =>
        isSupportedLocale(value) || `Locale must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
    },
    {
      name: 'affiliate',
      type: 'group',
      admin: {
        description: "Where this domain's listicle products come from — the affiliate marketplace for its country",
      },
      fields: [
        {
          name: 'source',
          type: 'text',
          required: true,
          defaultValue: 'mock',
          admin: { description: 'Product source implementation: `mock`, or the affiliate network name' },
        },
        {
          name: 'marketplace',
          type: 'text',
          admin: { description: 'Marketplace for this country, e.g. amazon.com or amazon.de' },
        },
        {
          name: 'partnerTag',
          type: 'text',
          admin: { description: 'Affiliate partner/tracking tag added to every product link' },
        },
      ],
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
