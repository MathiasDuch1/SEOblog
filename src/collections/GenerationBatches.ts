import type { CollectionConfig } from 'payload'

/**
 * One Claude Message Batch submitted for one domain. Tracks every request in it so imports
 * are resumable and idempotent, and failed clusters can be resubmitted. Added in phase 03
 * (GenerationBatch in spec §4).
 */
export const GenerationBatches: CollectionConfig = {
  slug: 'generation-batches',
  admin: {
    useAsTitle: 'anthropicBatchId',
    defaultColumns: ['anthropicBatchId', 'domain', 'status', 'submittedAt', 'importedAt'],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'anthropicBatchId',
      type: 'text',
      required: true,
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Every cluster in a batch targets this domain',
      },
    },
    {
      name: 'autoSchedule',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Schedule the imported posts automatically once they are ready (phase 06)',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'submitted',
      options: [
        { label: 'Submitted', value: 'submitted' },
        { label: 'In progress', value: 'in_progress' },
        { label: 'Ended', value: 'ended' },
        { label: 'Importing', value: 'importing' },
        { label: 'Imported', value: 'imported' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'requests',
      type: 'array',
      admin: { readOnly: true },
      fields: [
        { name: 'customId', type: 'text', required: true },
        { name: 'cluster', type: 'relationship', relationTo: 'keyword-clusters', required: true },
        { name: 'post', type: 'relationship', relationTo: 'posts' },
        {
          name: 'importState',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Imported', value: 'imported' },
            { label: 'Errored', value: 'errored' },
          ],
        },
        { name: 'error', type: 'textarea' },
        { name: 'inputTokens', type: 'number' },
        { name: 'outputTokens', type: 'number' },
      ],
    },
    {
      name: 'productSnapshot',
      type: 'json',
      admin: {
        readOnly: true,
        description: 'The product list per cluster (keyed by custom ID) that the model saw',
      },
    },
    { name: 'submittedAt', type: 'date', admin: { readOnly: true } },
    { name: 'endedAt', type: 'date', admin: { readOnly: true } },
    { name: 'importedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'requestCounts',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        { name: 'processing', type: 'number' },
        { name: 'succeeded', type: 'number' },
        { name: 'errored', type: 'number' },
        { name: 'canceled', type: 'number' },
        { name: 'expired', type: 'number' },
      ],
    },
  ],
}
