# SEOblog

Automated affiliate blog network — generates, schedules, and publishes SEO-optimized affiliate posts across dedicated country domains, each written in its own language.

See [docs/spec.md](docs/spec.md) for the full project specification.

## Stack

- **Next.js 16** (App Router) + **Tailwind CSS v4**
- **Payload CMS 3** running inside the Next.js app, with the SEO plugin and Lexical editor
- **Postgres** (Supabase) via Payload's Postgres adapter
- **Cloudflare R2** for media, via `@payloadcms/storage-s3`
- **TypeScript** throughout

## Setup

Requires Node 22 (see `.nvmrc` — Payload's CLI does not work on Node 26).

```bash
nvm use
npm install
cp .env.example .env   # then fill in every variable — see the comments in .env.example
npm run dev
```

`DATABASE_URI` is the Session pooler URI of the Supabase **development** project. The `R2_*` variables come from a Cloudflare R2 bucket and an API token with read/write access to it.

The site runs at `localhost:3000`, the Payload admin at `localhost:3000/admin`. On first visit to `/admin`, create the first admin user.

## Querying content

Payload's Local API skips access control by default, so a plain `payload.find({ collection: 'posts' })` returns drafts and scheduled posts.

- **Public pages** query through `getPublicPayload()` in `src/lib/public-payload.ts`. It runs every query as an anonymous visitor, so posts are narrowed to `status: 'published'`. ESLint blocks the raw client inside `src/app/(frontend)/` and `src/components/`.
- **Trusted server work** that must see unpublished content — the generation pipeline, the publish dispatcher, draft preview — uses `getPayloadClient()` directly.

## Database schema: push vs. migrations

- **Development** uses Payload's schema **push**: `npm run dev` syncs the schema to the dev database automatically.
- **Production** never uses push. Every deploy runs `npm run migrate`, which applies the migrations in `src/migrations/`.
- After changing collections, run `npm run migrate:create -- <name>` and commit the generated migration.
- **Push and migrations must never run against the same database.** The dev database is push-only; staging and production are migrations-only.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run generate:types` | Regenerate `src/payload-types.ts` from the Payload config (committed) |
| `npm run generate:importmap` | Regenerate the admin import map |
| `npm run migrate` | Apply pending migrations (production deploys) |
| `npm run migrate:create -- <name>` | Create a migration from the current schema |
| `npm run migrate:status` | Show which migrations have run |
