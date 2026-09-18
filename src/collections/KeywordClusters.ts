import type { CollectionConfig } from 'payload'

import type { KeywordCluster } from '../payload-types'

const TEMPLATE_OPTIONS = [
  { label: 'Listicle', value: 'listicle' },
  { label: 'Informational', value: 'informational' },
]

export const KeywordClusters: CollectionConfig = {
  slug: 'keyword-clusters',
  admin: {
    group: 'Keyword research',
    useAsTitle: 'clusterName',
    defaultColumns: ['clusterName', 'primaryKeyword', 'targetDomain', 'targetTemplate', 'status'],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const merged = { ...originalDoc, ...data } as Partial<KeywordCluster>
        // The template defaults to the suggestion but stays editable.
        if (!merged.targetTemplate && merged.suggestedTemplate) data.targetTemplate = merged.suggestedTemplate
        // Manual clusters without an explicit primary keyword target their first keyword.
        if (!merged.primaryKeyword?.trim() && merged.keywords?.[0]?.keyword) {
          data.primaryKeyword = merged.keywords[0].keyword
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'DataForSEO', value: 'dataforseo' },
        { label: 'Manual', value: 'manual' },
      ],
      admin: {
        description: 'Where the keywords came from: DataForSEO research (phase 05) or entered by hand',
      },
    },
    {
      name: 'clusterName',
      type: 'text',
      required: true,
    },
    {
      name: 'primaryKeyword',
      type: 'text',
      index: true,
      admin: { description: 'The keyword the article targets. Defaults to the first keyword.' },
    },
    {
      name: 'coreKeyword',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description: "DataForSEO's synonym group for the primary keyword, used to catch duplicate clusters",
      },
    },
    {
      name: 'keywords',
      type: 'array',
      required: true,
      fields: [
        {
          name: 'keyword',
          type: 'text',
          required: true,
        },
        {
          type: 'row',
          fields: [
            { name: 'searchVolume', type: 'number' },
            { name: 'keywordDifficulty', type: 'number', min: 0, max: 100 },
            { name: 'cpc', type: 'number', admin: { description: 'USD' } },
            {
              name: 'intent',
              type: 'select',
              options: [
                { label: 'Informational', value: 'informational' },
                { label: 'Navigational', value: 'navigational' },
                { label: 'Commercial', value: 'commercial' },
                { label: 'Transactional', value: 'transactional' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'rationale',
      type: 'textarea',
      admin: { description: 'Why these keywords make one article, from clustering' },
    },
    {
      name: 'targetDomain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
    },
    {
      name: 'targetTemplate',
      type: 'select',
      required: true,
      options: TEMPLATE_OPTIONS,
    },
    {
      name: 'suggestedTemplate',
      type: 'select',
      options: TEMPLATE_OPTIONS,
      admin: { readOnly: true, description: 'Template suggested by clustering from search intent' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'unused',
      options: [
        { label: 'Unused', value: 'unused' },
        { label: 'Assigned', value: 'assigned' },
        { label: 'Used', value: 'used' },
      ],
    },
    {
      name: 'researchRun',
      type: 'relationship',
      relationTo: 'keyword-research-runs',
      admin: { readOnly: true, description: 'The DataForSEO research run these keywords came from' },
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      admin: {
        description: 'The article generated from this cluster, once created',
      },
    },
  ],
}
