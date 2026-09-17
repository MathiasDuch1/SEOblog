import { randomBytes } from 'crypto'

import type { CollectionConfig } from 'payload'

import { revalidateDomainAfterChange } from '../lib/cache/hooks'
import { isSupportedLocale, SUPPORTED_LOCALES } from '../lib/locales'
import { isValidTimezone, parseWallClock } from '../lib/scheduling/zonedTime'

export const Domains: CollectionConfig = {
  slug: 'domains',
  admin: {
    group: 'Setup',
    useAsTitle: 'name',
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        // Every domain needs a key; existing domains without one get it on their next save.
        if (!data.indexNowKey && !originalDoc?.indexNowKey) {
          data.indexNowKey = randomBytes(16).toString('hex')
        }
        return data
      },
    ],
    afterChange: [revalidateDomainAfterChange],
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
      name: 'timezone',
      type: 'text',
      required: true,
      admin: {
        description:
          "IANA timezone of this domain's country, e.g. Europe/Copenhagen. The publishing window is in this timezone.",
      },
      validate: (value: string | null | undefined) =>
        isValidTimezone(value) || 'Timezone must be an IANA name such as Europe/Copenhagen',
    },
    {
      name: 'schedule',
      type: 'group',
      admin: {
        description: 'Daily publishing slots, in the domain timezone. Every slot gets random jitter.',
      },
      fields: [
        {
          name: 'postsPerDay',
          type: 'number',
          required: true,
          defaultValue: 10,
          min: 1,
          max: 48,
        },
        {
          name: 'windowStart',
          type: 'text',
          required: true,
          defaultValue: '08:00',
          admin: { description: 'Local time of the first slot, HH:MM' },
          validate: (value: string | null | undefined) =>
            parseWallClock(value) !== null || 'Use 24-hour HH:MM, e.g. 08:00',
        },
        {
          name: 'windowEnd',
          type: 'text',
          required: true,
          defaultValue: '23:30',
          admin: { description: 'Local time of the last slot, HH:MM' },
          validate: (value: string | null | undefined, { siblingData }: { siblingData: { windowStart?: string } }) => {
            const end = parseWallClock(value)
            if (end === null) return 'Use 24-hour HH:MM, e.g. 23:30'
            const start = parseWallClock(siblingData?.windowStart)
            return start === null || end > start || 'The window must end after it starts'
          },
        },
        {
          name: 'jitterMinutes',
          type: 'number',
          required: true,
          defaultValue: 8,
          min: 5,
          max: 10,
          admin: { description: 'Each slot moves by a random amount within ± this many minutes' },
        },
      ],
    },
    {
      name: 'indexNowKey',
      type: 'text',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Served at /{key}.txt on this domain to prove ownership to IndexNow. Generated automatically.',
      },
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
