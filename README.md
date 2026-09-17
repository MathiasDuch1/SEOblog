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

The Payload admin runs at `localhost:3000/admin` — `ADMIN_HOSTNAME` is the only hostname that serves `/admin`, `/api`, and `/preview`. On first visit to `/admin`, create the first admin user.

Public sites are served per hostname. After `npm run seed`, the development domains are:

| Hostname | Locale | Niche |
|---|---|---|
| `alpha.localhost:3000` | `en-US` | Spirituality |
| `beta.localhost:3000` | `da-DK` | Spirituality |
| `gamma.localhost:3000` | `en-US` | Wellness (seed-only fixture) |

Browsers and curl resolve `*.localhost` to 127.0.0.1 with no `/etc/hosts` changes.

## Querying content

Payload's Local API skips access control by default, so a plain `payload.find({ collection: 'posts' })` returns drafts and scheduled posts.

- **Public pages** query through `getPublicPayload()` in `src/lib/public-payload.ts`. It runs every query as an anonymous visitor, so posts are narrowed to `status: 'published'`. ESLint blocks the raw client inside `src/app/(frontend)/` and `src/components/`.
- **Trusted server work** that must see unpublished content — the generation pipeline, the publish dispatcher, draft preview — uses `getPayloadClient()` directly.

## Scripts that import `server-only` modules

Modules in `src/lib/` start with `import 'server-only'`, which throws outside a React Server Component build. Scripts run through `payload run` therefore set `NODE_OPTIONS=--conditions=react-server`, and end with `--` so flags reach the script (`payload run` otherwise swallows them). Follow the `generate` script in `package.json` when adding new ones.

## Database schema: push vs. migrations

- **Development** uses Payload's schema **push**: `npm run dev` syncs the schema to the dev database automatically.
- **Production** never uses push. Every deploy runs `npm run migrate`, which applies the migrations in `src/migrations/`.
- After changing collections, run `npm run migrate:create -- <name>` and commit the generated migration.
- **Push and migrations must never run against the same database.** The dev database is push-only; staging and production are migrations-only.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run seed` | Seed development niches, domains, posts, and legal pages (idempotent) |
| `npm run generate -- --clusters <ids>` | Submit unused keyword clusters (one domain) to Claude's Batch API. Also `--niche <slug>` (one batch per domain in the niche) and `--failed-from <batchDocId>` (resubmit errored clusters) |
| `npm run generation:poll` | Poll open generation batches and import finished results as draft posts (`-- --wait` keeps polling) |
| `npm test` | Run the vitest unit tests |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run generate:types` | Regenerate `src/payload-types.ts` from the Payload config (committed) |
| `npm run generate:importmap` | Regenerate the admin import map |
| `npm run migrate` | Apply pending migrations (production deploys) |
| `npm run migrate:create -- <name>` | Create a migration from the current schema |
| `npm run migrate:status` | Show which migrations have run |
