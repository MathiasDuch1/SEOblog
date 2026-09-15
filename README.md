# SEOblog

Automated affiliate blog network — generates, translates, schedules, and publishes SEO-optimized affiliate posts across multiple domains and languages.

See [docs/spec.md](docs/spec.md) for the full project specification.

## Stack

- **Next.js 16** (App Router) + **Tailwind CSS v4**
- **Payload CMS 3** running inside the Next.js app, with the SEO plugin and Lexical editor
- **Postgres** via Payload's Postgres adapter
- **TypeScript** throughout

## Setup

Requires Node 22 (see `.nvmrc` — Payload's CLI does not work on Node 26).

```bash
nvm use
npm install
cp .env.example .env   # then fill in DATABASE_URI and PAYLOAD_SECRET
npm run dev
```

The site runs at `localhost:3000`, the Payload admin at `localhost:3000/admin`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run generate:types` | Regenerate `src/payload-types.ts` from the Payload config |
| `npm run generate:importmap` | Regenerate the admin import map |
