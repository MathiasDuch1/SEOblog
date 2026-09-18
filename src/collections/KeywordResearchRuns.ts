import type { CollectionConfig } from 'payload'

/**
 * One DataForSEO research request for one domain, with the typed keyword rows it returned.
 * Identical requests within 30 days reuse a stored run instead of paying again.
 */
export const KeywordResearchRuns: CollectionConfig = {
  slug: 'keyword-research-runs',
  admin: {
    group: 'Keyword research',
    useAsTitle: 'label',
    defaultColumns: ['label', 'domain', 'status', 'costUsd', 'createdAt'],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'locationCode',
          type: 'number',
          required: true,
          admin: { readOnly: true, description: "Copied from the domain when the run started" },
        },
        {
          name: 'languageCode',
          type: 'text',
          required: true,
          admin: { readOnly: true, description: "Copied from the domain when the run started" },
        },
      ],
    },
    {
      name: 'seedKeywords',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { readOnly: true, description: "Seed topics, in the domain's language" },
      fields: [{ name: 'keyword', type: 'text', required: true }],
    },
    {
      name: 'endpoints',
      type: 'select',
      hasMany: true,
      required: true,
      admin: { readOnly: true },
      options: [
        { label: 'Related keywords', value: 'related_keywords' },
        { label: 'Keyword suggestions', value: 'keyword_suggestions' },
        { label: 'Keyword ideas', value: 'keyword_ideas' },
      ],
    },
    {
      name: 'limitPerEndpoint',
      type: 'number',
      required: true,
      admin: { readOnly: true, description: 'Keywords requested per DataForSEO call' },
    },
    {
      name: 'requestKey',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        hidden: true,
        description: 'Hash of location, language, seeds, endpoints, and limit — identical requests share it',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'running',
      index: true,
      options: [
        { label: 'Running', value: 'running' },
        { label: 'Complete', value: 'complete' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'costUsd',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, position: 'sidebar', description: 'Total DataForSEO cost reported for this run' },
    },
    {
      name: 'rowCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'rows',
      type: 'json',
      admin: {
        readOnly: true,
        description: 'Typed keyword rows, deduped by normalized keyword',
      },
    },
    {
      name: 'error',
      type: 'textarea',
      admin: { readOnly: true, condition: (data) => Boolean(data?.error) },
    },
  ],
}
