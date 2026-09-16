import type { CollectionConfig } from 'payload'

export const KeywordClusters: CollectionConfig = {
  slug: 'keyword-clusters',
  admin: {
    useAsTitle: 'clusterName',
    defaultColumns: ['clusterName', 'targetDomain', 'targetTemplate', 'status'],
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'semrush',
      options: [{ label: 'Semrush', value: 'semrush' }],
    },
    {
      name: 'clusterName',
      type: 'text',
      required: true,
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
          name: 'searchVolume',
          type: 'number',
        },
      ],
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
      options: [
        { label: 'Listicle', value: 'listicle' },
        { label: 'Informational', value: 'informational' },
      ],
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
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      admin: {
        description: 'The article generated from this cluster, once created',
      },
    },
  ],
}
