import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Domains } from './collections/Domains'
import { GenerationBatches } from './collections/GenerationBatches'
import { KeywordClusters } from './collections/KeywordClusters'
import { Media } from './collections/Media'
import { Niches } from './collections/Niches'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { postUrl } from './lib/urls'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // Order sets the sidebar: groups appear in the order of their first collection.
  collections: [Posts, Pages, Media, KeywordClusters, GenerationBatches, Domains, Niches, Users],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      // Supabase's session pooler allows 15 clients; keep room for CLI scripts
      // running alongside the dev server.
      max: 5,
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  plugins: [
    s3Storage({
      collections: {
        media: {
          // Files are served straight from the bucket's public domain, keeping image traffic off app compute.
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) =>
            [process.env.R2_PUBLIC_URL, prefix, filename].filter(Boolean).join('/'),
        },
      },
      bucket: process.env.R2_BUCKET || '',
      config: {
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
      },
    }),
    seoPlugin({
      collections: ['posts', 'pages'],
      uploadsCollection: 'media',
      tabbedUI: true,
      generateTitle: async ({ doc, req }) => {
        if (!doc?.title) return ''
        const domainValue = doc.domain
        const domain =
          typeof domainValue === 'object' && domainValue !== null
            ? domainValue
            : domainValue
              ? await req.payload.findByID({ collection: 'domains', id: domainValue, depth: 0, req })
              : null
        return domain ? `${doc.title} | ${domain.name}` : doc.title
      },
      generateDescription: ({ doc }) => {
        // Posts have an intro; pages fall back to their title.
        const source: string = doc?.intro ?? doc?.title ?? ''
        return source.length > 160 ? `${source.slice(0, 157).trimEnd()}…` : source
      },
      generateURL: async ({ doc, req }) => {
        const domainValue = doc?.domain
        if (!domainValue || !doc?.slug) return ''
        const domain =
          typeof domainValue === 'object'
            ? domainValue
            : await req.payload.findByID({ collection: 'domains', id: domainValue, depth: 0, req })
        return postUrl(domain, doc.slug)
      },
    }),
  ],
  sharp,
})
