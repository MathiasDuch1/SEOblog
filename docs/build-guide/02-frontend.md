# Phase 02 — Public Blog Frontend

## Goal

One Next.js app serves every domain in the `domains` collection, in each domain's active locales. Each site has a front page, header menu, footer, legal pages, and both article templates (listicle and informational), all rendered as Server Components. Metadata comes from the Payload SEO plugin, with hreflang alternates, JSON-LD, a per-domain `sitemap.xml` that scales past 50k URLs, and `robots.txt`. The Payload admin and API are only reachable on a dedicated admin hostname, and non-production environments are never indexable. Every cached read carries tags from a fixed tag contract, so phase 04 can revalidate precisely.

## Prerequisites

- Phase 01 fully checked off.
- Decisions recorded in `00-overview.md`: initial domains + locales, and the URL scheme (default: locale-prefixed paths, with `/` redirecting to the domain's default locale).
- Local multi-domain testing uses `*.localhost` hostnames (`alpha.localhost:3000`, `beta.localhost:3000`). Browsers and curl resolve these to 127.0.0.1 without `/etc/hosts` changes. In dev, the admin hostname is `localhost`.
- Legal page texts (privacy policy, imprint, about, affiliate disclosure) come from **you**, not from AI generation. Placeholder text is fine for this phase.

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — this phase is mostly Next.js. Server Components by default, `loading.tsx` / `error.tsx` on async segments, `next/image` for all content images, `next build` must pass. **Allowed client components:** none are expected. The mobile menu uses `<details>`/`<summary>`, so no JS is needed. Any exception must be justified in the step summary.

Before writing routing or caching code, read the bundled Next.js 16 docs. Next 16 differs from older versions (e.g. Middleware is now `proxy.ts`, and `revalidateTag` takes a cache-life profile):
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- `node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`

## Steps

1. **Write a seed script.** `src/scripts/seed.ts`, run with `npm run seed` (`payload run src/scripts/seed.ts`). It is idempotent — safe to run twice — and creates:
   - Domain **Alpha**: `alpha.localhost`, locales `en` + `de`, default `en`, distinct branding colors.
   - Domain **Beta**: `beta.localhost`, locale `en` only, different branding.
   - For each domain: 3 published listicles with 3–5 products (placeholder product images from an allowed remote host) and a featured image, 3 published informational posts with Lexical bodies (headings, paragraphs, an inline link) and a featured image, 1 draft, and 1 scheduled post. Alpha's posts have both `en` and `de` content with different slugs per locale.
   - Two posts on different domains that share the same `en` slug, to prove domain isolation.
   Later phases add required fields; each of those steps updates this script.
   **Verify:** running `npm run seed` twice leaves the same document counts (no duplicates), and the admin shows the data above.

2. **Define the cache tag contract.** `src/lib/cache/tags.ts` exports tag builders that every cached read in this phase must use, and that phase 04 uses to revalidate:
   - `domain(hostname)` — one domain's config
   - `post(postId)` — a single post, all locales
   - `page(pageId)` — a single legal/static page
   - `postList(domainId, locale)` — front page and listings
   - `sitemap(domainId)` — that domain's sitemap
   Pick the caching mechanism after reading `how-revalidation-works.md` — either `'use cache'` + `cacheTag` with `cacheComponents` enabled, or `unstable_cache` with `tags` — and use it consistently. Document the choice in a short comment at the top of `tags.ts`.
   **Verify:** a small throwaway script or route shows that calling `revalidateTag` with one post's tag refreshes that post's cached read but not another post's. Remove the throwaway afterwards.

3. **Resolve domains on the server.** `src/lib/domains.ts` (server-only) exports `getDomainByHostname(hostname)`. It strips the port, lowercases, queries `domains` through the Local API, and caches with the `domain(hostname)` tag. An unknown hostname returns `null`. `www` → apex redirects are handled at the hosting/DNS level in phase 07, not here.
   **Verify:** a temporary route or test logs the Alpha document for `alpha.localhost:3000` and `null` for `unknown.localhost`.

4. **Write `src/proxy.ts` with hostname rewrite, admin lockdown, and environment guard.**
   - `ADMIN_HOSTNAME` (dev: `localhost`) and `SITE_ENV` (`development` | `staging` | `production`) go in `.env.example`.
   - **On the admin host:** `/admin`, `/api`, and `/preview` pass through untouched. Any other path redirects to `/admin`.
   - **On every other host:** `/admin`, `/api`, and `/preview` return 404. Every other public path is rewritten from `/{path}` to `/{hostname}{path}`, e.g. `alpha.localhost:3000/en/best-tents` → `/alpha.localhost/en/best-tents`.
   - Exclude `/_next` and static files through the `matcher`.
   - When `SITE_ENV !== 'production'`, add `X-Robots-Tag: noindex, nofollow` to every response.
   - The proxy does **no database access** — Next's docs say Proxy isn't for data fetching. Unknown domains are handled by the route in step 5.
   **Verify:**
   - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/admin` → 200 (or a login redirect)
   - `curl -s -o /dev/null -w '%{http_code}' alpha.localhost:3000/admin` → 404
   - `curl -s -o /dev/null -w '%{http_code}' alpha.localhost:3000/api/posts` → 404
   - `curl -I alpha.localhost:3000/en` reaches the frontend route
   - response headers include `X-Robots-Tag: noindex, nofollow` with `SITE_ENV=development`, and don't with `SITE_ENV=production`

5. **Build the route tree.**
   ```
   src/app/(frontend)/[host]/route.ts                      → redirect "/" to the domain's defaultLocale (404 for unknown host)
   src/app/(frontend)/[host]/sitemap.xml/route.ts          → step 14
   src/app/(frontend)/[host]/sitemaps/[chunk]/route.ts     → step 14
   src/app/(frontend)/[host]/robots.txt/route.ts           → step 14
   src/app/(frontend)/[host]/[locale]/layout.tsx           → root layout: <html lang={locale}>, header, footer, branding
   src/app/(frontend)/[host]/[locale]/page.tsx             → front page (step 7)
   src/app/(frontend)/[host]/[locale]/[slug]/page.tsx      → article or legal page (steps 8–12)
   + loading.tsx / error.tsx / not-found.tsx at [locale] and [slug]
   ```
   Move `globals.css` into this tree and delete the placeholder `(frontend)/layout.tsx` and `page.tsx` from phase 01. `[locale]/layout.tsx` calls `notFound()` if the host is unknown or the locale isn't in that domain's `activeLocales`.
   **Verify:** `alpha.localhost:3000/` → 307 to `/en`. `beta.localhost:3000/de` → 404, since Beta is en-only. `unknown.localhost:3000/en` → 404. `curl -s alpha.localhost:3000/de | grep -o '<html lang="de"'` matches.

6. **Add the site shell and branding.**
   - Header: domain name/logo, a menu linking to the front page, and a locale switcher showing only that domain's active locales.
   - Footer: affiliate disclosure text in the current locale, links to that domain's legal pages (step 11), and the year.
   - Apply `branding.primaryColor` / `accentColor` as CSS custom properties on `<body>` from the server, mapped through Tailwind v4 `@theme` tokens in `globals.css`. Components use the tokens (`bg-primary`) — never a hardcoded brand color.
   - Put UI strings (menu labels, "Buy now", disclosure) in `src/lib/i18n/dictionaries/{locale}.ts`, loaded server-side.
   - The mobile menu uses `<details>`/`<summary>` (no client JS).
   **Verify:** Alpha and Beta render with visibly different primary colors, and German UI strings appear on `/de`. `grep -rn "use client" src/app/\(frontend\) src/components` returns nothing.

7. **Build the front page.** It lists published posts for the domain and locale, newest `publishedAt` first. Show featured image, title (the localized `meta.title`, falling back to the slug), intro excerpt, and a link. Paginate with `?page=N` read from `searchParams` on the server. Cache with the `postList(domainId, locale)` tag. Posts without a slug in the current locale are excluded.
   **Verify:** Alpha `/en` lists only Alpha's published posts — no drafts, scheduled posts, or Beta posts — and `?page=2` works when there are more posts than one page holds.

8. **Build the article route and template switch.** `[slug]/page.tsx` loads the post by `domain` + localized `slug` + `status: published` for the current locale (`locale` passed to the Local API, `fallbackLocale: false`), cached with `post(postId)`. If there's no post, it tries a legal page (step 11), then `notFound()`. It renders `ListicleTemplate` or `InformationalTemplate` from `src/components/templates/` based on `template`. Both templates share `FeaturedImage`, `Intro`, and `Summary` components, and take the post plus locale as props **without fetching**, so phase 06's preview can reuse them.
   **Verify:** a published listicle and a published informational post both render. The draft's slug returns 404. The shared-slug posts from step 1 render different content on Alpha and Beta. The `de` slug of an Alpha post works on `/de/…` and 404s on `/en/…`.

9. **Build the listicle template.** For each product, in order: title, description, and product image via `next/image`, with the affiliate image hosts added to `images.remotePatterns`. The **Buy now** button is an `<a>` pointing at the localized `affiliateUrl`, with `rel="sponsored nofollow noopener"` and `target="_blank"`. Add the affiliate disclosure near the top.
   **Verify:** a listicle shows all products in admin order, every Buy now link has `rel="sponsored nofollow noopener"` and the correct per-locale URL (checked on Alpha `en` vs `de`), and the rendered HTML contains no plain `<img>` tags for content images.

10. **Build the informational template.** Render `body` with `RichText` from `@payloadcms/richtext-lexical/react` as a Server Component. Confirm it needs no `'use client'`; if it does, isolate it in a leaf and note that in the summary. Style prose with `@tailwindcss/typography` (Tailwind v4: `@plugin "@tailwindcss/typography";` in `globals.css`). Inline links in the body that point off-site get `rel="sponsored nofollow noopener"` through a custom link converter.
    **Verify:** headings, paragraphs, and links from the seeded body render with typography styles, and off-site links carry the sponsored rel.

11. **Add legal and static pages.**
    - New collection `pages`: `domain` (required), `type` (`about` | `privacy` | `imprint` | `terms` | `affiliate-disclosure` | `contact` | `other`), localized `title`, localized `slug`, localized `body` (Lexical), `status` (`draft` | `published`). The SEO plugin is enabled on `pages` too. Access matches `posts` (anonymous read = published only).
    - Extend the phase 01 slug validation so a slug is unique per domain + locale **across both `posts` and `pages`**.
    - `[slug]/page.tsx` renders a published page with a simple prose layout when no post matches. The footer (step 6) links the domain's published pages by `type`.
    - Seed: `about`, `privacy`, `imprint`, and `affiliate-disclosure` for Alpha (`en` + `de`) and Beta (`en`), with placeholder text marked "replace before launch".
    - This collection isn't in spec §4. Report it as a deviation in the wrap-up.
    - Regenerate types and add a migration.
    **Verify:** `alpha.localhost:3000/de/<imprint-slug>` renders the German imprint. The footer lists the four pages in each locale. Creating a page whose slug equals an existing post's slug on the same domain + locale is rejected. A draft page 404s.

12. **Add metadata, hreflang, and JSON-LD.**
    - `generateMetadata` on `[slug]/page.tsx` and `[locale]/page.tsx` reads the SEO plugin's localized `meta` (title, description, image) and returns `title`, `description`, `openGraph` (with image URL), `alternates.canonical`, and `alternates.languages`. The last one maps every locale where this document has a slug, plus `x-default` pointing at the domain's default locale.
    - All absolute URLs are built with `src/lib/urls.ts`.
    - Front pages and legal pages get the same treatment.
    - JSON-LD in a server-rendered `<script type="application/ld+json">`, with `<` escaped: `Article` for informational posts, and `Article` + `ItemList` of products for listicles. No `Product` schema with invented offers or ratings.
    **Verify:** view source on an Alpha `en` article: `<title>` matches `meta.title`, there's one canonical, and `hreflang` links exist for `en`, `de`, and `x-default` with absolute URLs. A Beta article has no `de` alternate. The JSON-LD parses with `JSON.parse`.

13. **Add error, loading, and not-found states.** Localized `not-found.tsx`, and `error.tsx` + `loading.tsx` on every async segment (`[locale]`, `[slug]`). Unknown slugs render the branded 404 with a 404 status.
    **Verify:** `curl -s -o /dev/null -w '%{http_code}' alpha.localhost:3000/en/does-not-exist` prints `404`, and the page shows Alpha's branding.

14. **Add sitemaps and robots.**
    - The proxy rewrites `/sitemap.xml`, `/sitemaps/*`, and `/robots.txt` into the `[host]` tree like any other path.
    - URLs are all published posts and pages for the domain, across active locales, each with `<lastmod>` from `updatedAt` and `xhtml:link` hreflang alternates.
    - When the total is at most `SITEMAP_CHUNK_SIZE` (default 45000, set via env for testing), `sitemap.xml` is a single urlset. Above it, `sitemap.xml` becomes a `<sitemapindex>` pointing at `/sitemaps/{n}.xml` chunks. This stays under the 50,000-URL protocol limit as content accumulates.
    - Cached with the `sitemap(domainId)` tag.
    - `robots.txt`: when `SITE_ENV === 'production'`, allow everything and reference `siteOrigin(domain)/sitemap.xml`. Otherwise `Disallow: /`.
    **Verify:** `curl alpha.localhost:3000/sitemap.xml` validates as XML and lists Alpha's published posts and pages in `en` and `de`, with nothing from Beta or drafts. With `SITEMAP_CHUNK_SIZE=5`, it becomes a sitemap index whose chunks together contain the same URLs. `robots.txt` shows `Disallow: /` in development and the Sitemap line with `SITE_ENV=production`.

15. **Check production build and performance.** Run `npm run build && SITE_ENV=production npm start`, and run Lighthouse against a seeded listicle page on the production server.
    **Verify:** the build exits 0, and Lighthouse reports Performance ≥ 90, SEO ≥ 90, and Accessibility ≥ 90 on that page. If Lighthouse can't run in this environment, say so and leave the box unchecked.

## Out of scope

- Real generated content, affiliate feed data, hero image generation (phase 03).
- Publishing, `revalidateTag` calls on publish, redirects, IndexNow (phase 04). This phase only defines and attaches the tags.
- Draft preview and custom admin views (phase 06).
- Deployment, real domains, and `www` redirects (phase 07).

## Acceptance Checklist

- [ ] **Step 1:** `npm run seed` is idempotent and creates two domains, both templates, draft/scheduled posts, and a shared slug across domains
- [ ] **Step 2:** `src/lib/cache/tags.ts` defines the tag contract, and revalidating one post's tag refreshes only that post
- [ ] **Step 3:** `getDomainByHostname` resolves known hosts (ignoring port) and returns `null` for unknown ones
- [ ] **Step 4:** `src/proxy.ts` rewrites public paths by hostname and does no database access
- [ ] **Step 4:** `/admin` and `/api` are reachable only on `ADMIN_HOSTNAME` and return 404 on blog domains
- [ ] **Step 4:** Non-production environments send `X-Robots-Tag: noindex, nofollow`
- [ ] **Step 5:** `/` redirects to the domain's default locale; inactive locales and unknown hosts return 404; `<html lang>` matches the locale
- [ ] **Step 6:** Domains render with their own branding tokens and localized UI strings, with no client components in the frontend
- [ ] **Step 7:** The front page lists only that domain's published posts in that locale, with working pagination
- [ ] **Step 8:** Posts resolve by domain + localized slug; drafts 404; the shared slug renders different posts per domain; templates don't fetch their own data
- [ ] **Step 9:** Listicles render products in order with `next/image` and `rel="sponsored nofollow noopener"` per-locale Buy now links
- [ ] **Step 10:** Informational bodies render server-side with typography styles, and off-site links are marked sponsored
- [ ] **Step 11:** A localized, per-domain `pages` collection serves legal pages linked from the footer, with slugs unique across posts and pages
- [ ] **Step 12:** `generateMetadata` uses SEO plugin fields, with absolute canonical, correct hreflang alternates including `x-default`, and valid JSON-LD
- [ ] **Step 13:** Unknown slugs return a branded 404 with status 404; async segments have `loading.tsx` and `error.tsx`
- [ ] **Step 14:** Each domain serves a valid sitemap (splitting into an index above the chunk size) and an environment-aware `robots.txt`
- [ ] **Step 15:** `npm run build` passes and Lighthouse Performance, SEO, and Accessibility are all ≥ 90 on a listicle page
