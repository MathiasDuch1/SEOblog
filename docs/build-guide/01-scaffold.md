# Phase 01 — Scaffold & Content Model

## Goal

The Next.js + Payload app runs against a real Supabase Postgres database, and media uploads go to Cloudflare R2. The spec §4 collections (`niches`, `domains`, `keyword-clusters`, `posts`, `media`) are modelled per spec §4:
- each domain belongs to exactly one niche, which is how content runs are grouped
- each domain is one country with exactly one locale
- posts belong to one domain and are **not** localized
- slugs are unique per domain

The SEO plugin is on posts, public read is limited to published content, and there's a single URL helper for public URLs, generated types, and an initial migration. `npm run build` passes.

## Prerequisites

- Node 22 active (`nvm use`).
- A Supabase project for development. From **Project Settings → Database → Connection string**, copy the **Session pooler** URI (IPv4-compatible).
- A Cloudflare R2 bucket and an R2 API token with read/write access to it. A public domain for the bucket, e.g. `media.<yourdomain>`, or the `r2.dev` URL for development.
- Decision recorded in `00-overview.md`: the supported locales (language + country codes, e.g. `en-GB`, `de-DE`).

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — server-first rules. This phase adds no client components.

## Steps

1. **Confirm the existing baseline.** Next.js 16, Tailwind CSS v4, Payload 3 (`payload`, `@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/plugin-seo`), `graphql`, and `sharp` should already be installed. `.nvmrc` should pin Node 22. `@payload-config` should be aliased in `tsconfig.json`, and `next.config.ts` should be wrapped with `withPayload`. Fix anything that's missing rather than reinstalling.
   **Verify:** `node --version` prints v22.x, and `npm ls payload next tailwindcss` shows the expected major versions with no `missing` or `invalid` entries.

2. **Make the Payload CLI work.** Add `"type": "module"` to `package.json`, matching Payload's official blank template. Without it, the CLI loads `payload.config.ts` as CommonJS and fails with `ERR_REQUIRE_ASYNC_MODULE` on `@payloadcms/richtext-lexical`. Check that `next.config.ts`, `postcss.config.mjs`, and `eslint.config.mjs` still load.
   **Verify:** `npm run generate:importmap` exits 0 and rewrites `src/app/(payload)/admin/importMap.js`, and `npm run dev` still starts.

3. **Split the root layouts into route groups.** Payload's `(payload)/layout.tsx` renders its own `<html>`, so the top-level `src/app/layout.tsx` must not wrap it. Move `src/app/layout.tsx`, `page.tsx`, `globals.css`, and `favicon.ico` into `src/app/(frontend)/`. After the move, no `layout.tsx` should remain directly in `src/app/`. Phase 02 relocates the frontend root layout again, under `[host]`.
   **Verify:** with the dev server running, `curl -s localhost:3000/ | grep -o '<html' | wc -l` prints `1`, and the same command against `/admin` also prints `1`.

4. **Connect Supabase.** Use a Supabase project dedicated to **development** — production gets its own project in phase 07. Put its Session pooler URI into `.env` as `DATABASE_URI`, URL-encoding any special characters in the password. Leave the adapter's default `push` behaviour on for development, so the schema syncs automatically.
   **Verify:** `npm run dev` logs no Postgres connection errors, `/admin` returns 200, and Supabase's Table Editor shows Payload tables (`users`, `domains`, `posts`, …).

5. **Create the first admin user and harden login.** Set `auth: { maxLoginAttempts: 5, lockTime: 600000 }` on `Users`, then create the first user through the `/admin` create-first-user screen.
   **Verify:** log out and back in successfully. An unauthenticated `curl -s localhost:3000/api/users` returns 401/403 rather than user data. Five wrong passwords lock a (throwaway) user account.

6. **Store media in Cloudflare R2.** Install `@payloadcms/storage-s3` (R2 is S3-compatible) and register `s3Storage` for the `media` collection:
   - `bucket: process.env.R2_BUCKET`
   - `config.endpoint: https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: 'auto'`, `forcePathStyle: true`, credentials from `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
   - Serve files straight from the bucket's public domain instead of proxying through the Next.js server. Set `disablePayloadAccessControl: true` and a `generateFileURL` that builds `${R2_PUBLIC_URL}/${prefix}/${filename}`. This keeps image traffic off app compute, which is the point of R2's zero egress.
   - Add `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` to `.env.example`.
   - Add the R2 public hostname to `images.remotePatterns` in `next.config.ts`.
   **Verify:** upload an image in Media. It appears in the R2 bucket in the Cloudflare dashboard, the document's `url` points at `R2_PUBLIC_URL`, and that URL returns 200 with an image content type.

7. **Define supported locales and remove Payload localization.** There are no language variants inside documents, because each domain publishes in exactly one language (spec §4).
   - Delete the `localization` block from `payload.config.ts`, and every `localized: true` from the collections.
   - Create `src/lib/locales.ts`, which exports:
     - `SUPPORTED_LOCALES` — BCP 47 language-country codes from the decision table, e.g. `['en-GB', 'en-US', 'de-DE']`
     - `languageOf('de-DE')` → `'de'`
     - `countryOf('de-DE')` → `'DE'`
     - `ogLocaleOf('de-DE')` → `'de_DE'`
   - Adding a new country or language later means editing this list (plus a UI dictionary in phase 02). It needs no database migration.
   **Verify:** `grep -rn "localized" src/collections src/payload.config.ts` returns nothing, and the post edit screen has no locale switcher. The Supabase schema has no `*_locales` tables once the dev database is recreated or pushed. `vitest` isn't installed yet, so a short `payload run` script prints the three helper results for `de-DE` and is deleted afterwards.

8. **Align the collections with spec §4.** Review the stubs in `src/collections/` and adjust:
   - **Niches** — `name`, `slug` (unique, lowercase), `description`. Logged-in users only; niches are internal and never shown to visitors.
   - **Domains** — `name`, `hostname` (unique, lowercase), `niche` (required relationship, indexed — exactly one niche per domain), `locale` (required text, validated against `SUPPORTED_LOCALES`; a text field rather than a select, so adding a locale never requires a migration), and a `branding` group.
   - **KeywordClusters** — `source`, `clusterName`, `keywords[]`, `targetDomain`, `targetTemplate`, `status` (`unused` | `assigned` | `used`).
   - **Posts** — `domain` (required), `template`, `slug`, `status`, `scheduledAt`, `publishedAt`, `featuredImage`, `intro`, and `products[]` (`title`, `description`, `imageUrl`, `affiliateUrl`). `body` is Lexical rich text, plus `summary`. Nothing is localized.
   - Show `products` only for listicles and `body` only for informational posts.
   - Index `posts.domain`, `posts.slug`, `posts.status`, `posts.scheduledAt`, and `posts.publishedAt`. The frontend (phase 02) and the dispatcher (phase 04) query these on every request or cron run.
   - Validate that a post's `slug` is unique **per domain**: a `beforeValidate` hook queries for another post with the same domain and slug. The same slug on a different domain is allowed.
   **Verify:** all five collections appear in the admin sidebar with the fields above. A domain with no `niche` is rejected, and a domain with `locale: 'xx-XX'` is rejected. A listicle post shows `products` and hides `body`, and vice versa. Saving a second post with the same slug on the same domain is rejected, while the same slug on a different domain is accepted.

9. **Configure the SEO plugin and the URL helper.**
   - Create `src/lib/urls.ts`, which exports `siteOrigin(domain)` and `postUrl(domain, slug)` → `{scheme}://{hostname}{:port}/{slug}`, with no locale segment. These are the **only** way absolute public URLs are built in any phase: canonical, sitemap, IndexNow, and SEO `generateURL`. The scheme comes from `PUBLIC_URL_SCHEME` (`http` in dev, `https` in prod) and an optional `PUBLIC_URL_PORT` (`3000` in dev, empty in prod). Add both to `.env.example`.
   - Set `seoPlugin({ collections: ['posts'], uploadsCollection: 'media', tabbedUI: true, generateTitle, generateDescription, generateURL })`, where `generateURL` uses `postUrl`.
   **Verify:** the post edit screen has an SEO tab. The "auto-generate" buttons fill title, description, and a URL like `http://alpha.localhost:3000/<slug>`.

10. **Add access control.**
    - `posts`: anonymous `read` returns only `status: published`, via a query constraint (`({ req }) => req.user ? true : { status: { equals: 'published' } }`). Create, update, and delete require a logged-in user.
    - `domains` and `media`: anonymous read allowed; writes require a user.
    - `keyword-clusters`: every operation requires a user.
    **Verify:** with one draft and one published post, unauthenticated `GET /api/posts` returns only the published one, and `GET /api/keyword-clusters` is denied. Authenticated requests return both posts.

11. **Generate and commit types.** Remove `payload-types.ts` from `.gitignore`, since `next build` type-checks against it in any fresh checkout. Run `npm run generate:types`.
    **Verify:** `src/payload-types.ts` exists and contains `Post`, `Domain`, `KeywordCluster`, and `Media` interfaces, `npx tsc --noEmit` passes, and `git check-ignore src/payload-types.ts` prints nothing.

12. **Create the initial migration.** Add scripts `"migrate": "payload migrate"`, `"migrate:create": "payload migrate:create"`, and `"migrate:status": "payload migrate:status"`. Run `npm run migrate:create -- initial`. Document in `README.md`: dev uses schema push, production runs `npm run migrate` on deploy, and push and migrations must never run against the same database.
    **Verify:** `src/migrations/` contains the initial migration and its index, and `npm run migrate:status` runs without error.

13. **Set up the server-only boundary.** Install `server-only`. Create `src/lib/payload.ts`, which exports a `getPayloadClient()` wrapper around `getPayload({ config })` and starts with `import 'server-only'`. Later phases import Payload through this module.
    **Verify:** importing `src/lib/payload.ts` from a temporary `'use client'` component makes `npm run build` fail with the server-only error. Remove the temporary component afterwards.

14. **Complete `.env.example` and run the final check.** `.env.example` lists every variable used so far, each with a one-line comment. `README.md` setup steps match reality.
    **Verify:** `npm run lint` and `npm run build` both exit 0.

## Out of scope

- Any public page beyond the placeholder homepage (phase 02).
- Seed data and UI dictionaries (phase 02).
- Anthropic, affiliate, image-generation, or DataForSEO code (phases 03 and 05).
- Scheduling hooks and cron routes (phase 04).
- Custom admin views (phase 06).

## Acceptance Checklist

- [x] **Step 1:** Node 22 is active and Next.js 16, Tailwind v4, and Payload 3 are installed with no missing or invalid packages
- [x] **Step 2:** `npm run generate:importmap` succeeds
- [x] **Step 3:** `/` and `/admin` each render exactly one `<html>` element
- [x] **Step 4:** The app connects to the development Supabase project and Payload tables exist in the database
- [x] **Step 5:** An admin user can log in, `/api/users` is not publicly readable, and repeated failed logins lock the account
- [x] **Step 6:** Media uploads land in R2 and are served from `R2_PUBLIC_URL`
- [x] **Step 7:** Payload localization is removed (no `localized` fields, no locale tables), and `src/lib/locales.ts` defines supported locales and helpers
- [x] **Step 8:** `niches`, `domains`, `keyword-clusters`, `posts`, `media` collections all appear in the admin sidebar with the spec §4 fields, and each domain has one validated `locale`
- [x] **Step 8:** Every domain requires exactly one `niche`, and `niches` is not publicly readable
- [x] **Step 8:** Template-conditional fields work (`products` for listicle only, `body` for informational only)
- [x] **Step 8:** A duplicate slug on the same domain is rejected; the same slug on another domain is accepted
- [x] **Step 9:** `src/lib/urls.ts` builds locale-free public URLs from env-configured scheme/port, and the SEO tab auto-generates title/description/URL
- [x] **Step 10:** Anonymous `GET /api/posts` returns only published posts; `keyword-clusters` is not publicly readable
- [x] **Step 11:** `src/payload-types.ts` is generated, committed (not gitignored), and `tsc --noEmit` passes
- [x] **Step 12:** An initial migration exists and `migrate:status` runs
- [x] **Step 13:** `src/lib/payload.ts` is server-only and importing it from a client component fails the build
- [x] **Step 14:** `.env.example` documents every variable, and `npm run lint` and `npm run build` pass
