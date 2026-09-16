# Phase 02 — Public Blog Frontend

## Goal

One Next.js app serves every country domain in the `domains` collection. Each domain publishes in its single locale, and URLs have **no language prefix** (`https://example.de/best-tents`). Each site has a front page, header menu, footer, legal pages, and both article templates (listicle and informational), all rendered as Server Components in the domain's language. Metadata comes from the Payload SEO plugin, with JSON-LD, a per-domain `sitemap.xml` that scales past 50k URLs, and `robots.txt`. The Payload admin and API are only reachable on a dedicated admin hostname, and non-production environments are never indexable. Every cached read carries tags from a fixed tag contract, so phase 04 can revalidate precisely.

## Prerequisites

- Phase 01 fully checked off.
- Decision recorded in `00-overview.md`: dev test domains. Default: `alpha.localhost` (`en-GB`), `beta.localhost` (`de-DE`), `gamma.localhost` (`en-US`).
- Local multi-domain testing uses `*.localhost` hostnames. Browsers and curl resolve these to 127.0.0.1 without `/etc/hosts` changes. In dev, the admin hostname is `localhost`.
- Legal page texts (privacy policy, imprint, about, affiliate disclosure) come from **you**, not from AI generation. Placeholder text is fine for this phase.

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — this phase is mostly Next.js. Server Components by default, `loading.tsx` / `error.tsx` on async segments, `next/image` for all content images, `next build` must pass. **Allowed client components:** none are expected. The mobile menu uses `<details>`/`<summary>`, so no JS is needed. Any exception must be justified in the step summary.

Before writing routing or caching code, read the bundled Next.js 16 docs. Next 16 differs from older versions (e.g. Middleware is now `proxy.ts`, `revalidateTag` takes a cache-life profile, and `global-not-found` exists for apps whose root layouts sit under dynamic segments):
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- `node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`

## Steps

1. **Write a seed script.** `src/scripts/seed.ts`, run with `npm run seed` (`payload run src/scripts/seed.ts`). It is idempotent — safe to run twice — and creates:
   - Niche **Outdoor** (`outdoor`) for Alpha and Beta, and niche **Kitchen** (`kitchen`) for Gamma, so multi-niche grouping is exercised. Every domain requires a niche (phase 01).
   - Domain **Alpha**: `alpha.localhost`, `en-GB`, Outdoor, distinct branding colors.
   - Domain **Beta**: `beta.localhost`, `de-DE`, Outdoor, different branding. Same niche as Alpha, different country.
   - Domain **Gamma**: `gamma.localhost`, `en-US`, Kitchen, different branding. Same language as Alpha, different country and niche.
   - For each domain, content written in that domain's language: 3 published listicles with 3–5 products (placeholder product images from an allowed remote host) and a featured image, 3 published informational posts with Lexical bodies (headings, paragraphs, an inline link) and a featured image, 1 draft, and 1 scheduled post.
   - One Alpha post and one Gamma post sharing the same slug, to prove domain isolation.
   Later phases add required fields; each of those steps updates this script.
   **Verify:** running `npm run seed` twice leaves the same document counts (no duplicates), and the admin shows the data above.

2. **Define the cache tag contract.** `src/lib/cache/tags.ts` exports tag builders that every cached read in this phase must use, and that phase 04 uses to revalidate:
   - `domain(hostname)` — one domain's config
   - `post(postId)` — a single post
   - `page(pageId)` — a single legal/static page
   - `postList(domainId)` — front page and listings
   - `sitemap(domainId)` — that domain's sitemap
   Pick the caching mechanism after reading `how-revalidation-works.md` — either `'use cache'` + `cacheTag` with `cacheComponents` enabled, or `unstable_cache` with `tags` — and use it consistently. Document the choice in a short comment at the top of `tags.ts`.
   **Verify:** a small throwaway script or route shows that calling `revalidateTag` with one post's tag refreshes that post's cached read but not another post's. Remove the throwaway afterwards.

3. **Resolve domains on the server.** `src/lib/domains.ts` (server-only) exports `getDomainByHostname(hostname)`. It strips the port, lowercases, queries `domains` through the Local API, and caches with the `domain(hostname)` tag. An unknown hostname returns `null`. `www` → apex redirects are handled at the hosting/DNS level in phase 07, not here.
   **Verify:** a temporary route or test logs the Alpha document for `alpha.localhost:3000` and `null` for `unknown.localhost`.

4. **Write `src/proxy.ts` with hostname rewrite, admin lockdown, and environment guard.**
   - `ADMIN_HOSTNAME` (dev: `localhost`) and `SITE_ENV` (`development` | `staging` | `production`) go in `.env.example`.
   - **On the admin host:** `/admin`, `/api`, and `/preview` pass through untouched. Any other path redirects to `/admin`.
   - **On every other host:** `/admin`, `/api`, and `/preview` return 404. Every other public path is rewritten from `/{path}` to `/{hostname}{path}`, e.g. `beta.localhost:3000/beste-zelte` → `/beta.localhost/beste-zelte`. There is no locale segment.
   - Exclude `/_next` and static files through the `matcher`.
   - When `SITE_ENV !== 'production'`, add `X-Robots-Tag: noindex, nofollow` to every response.
   - The proxy does **no database access** — Next's docs say Proxy isn't for data fetching. Unknown domains are handled by the routes in step 5.
   **Verify:**
   - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/admin` → 200 (or a login redirect)
   - `curl -s -o /dev/null -w '%{http_code}' alpha.localhost:3000/admin` → 404
   - `curl -s -o /dev/null -w '%{http_code}' alpha.localhost:3000/api/posts` → 404
   - `curl -I alpha.localhost:3000/` reaches the frontend route
   - response headers include `X-Robots-Tag: noindex, nofollow` with `SITE_ENV=development`, and don't with `SITE_ENV=production`

5. **Build the route tree.**
   ```
   src/app/(frontend)/[host]/layout.tsx                    → root layout: <html lang={domain.locale}>, header, footer, branding
   src/app/(frontend)/[host]/page.tsx                      → front page (step 7)
   src/app/(frontend)/[host]/[slug]/page.tsx               → article or legal page (steps 8–12)
   src/app/(frontend)/[host]/sitemap.xml/route.ts          → step 14
   src/app/(frontend)/[host]/sitemaps/[chunk]/route.ts     → step 14
   src/app/(frontend)/[host]/robots.txt/route.ts           → step 14
   src/app/global-not-found.tsx                            → 404 for URLs matching no route (enable the flag per the docs)
   + loading.tsx / error.tsx / not-found.tsx at [host] and [slug]
   ```
   - Move `globals.css` into this tree and delete the placeholder `(frontend)/layout.tsx` and `page.tsx` from phase 01.
   - For an unknown host, `[host]/layout.tsx` renders a neutral unbranded shell (`lang="en"`), and every page and route handler under `[host]` calls `notFound()` or returns 404, so no content from any domain leaks onto an unknown host.
   **Verify:** `alpha.localhost:3000/` → 200 with `<html lang="en-GB"`. `beta.localhost:3000/` → 200 with `<html lang="de-DE"`. `unknown.localhost:3000/` → 404 without any domain's branding. Paths like `alpha.localhost:3000/en/anything` are treated as a slug and 404, since there is no locale routing.

6. **Add the site shell and branding.**
   - Header: domain name/logo and a menu linking to the front page. There is no language switcher — each domain has one language.
   - Footer: affiliate disclosure text in the domain's language, links to that domain's legal pages (step 11), and the year.
   - Apply `branding.primaryColor` / `accentColor` as CSS custom properties on `<body>` from the server, mapped through Tailwind v4 `@theme` tokens in `globals.css`. Components use the tokens (`bg-primary`) — never a hardcoded brand color.
   - UI strings (menu labels, "Buy now", disclosure, 404 text, date formats) live in `src/lib/i18n/dictionaries/{language}.ts`, keyed by **language** (`languageOf(domain.locale)`), and are loaded server-side. `en-GB` and `en-US` share `en`. Format dates and numbers with `Intl` using the full `domain.locale`, so they follow country conventions.
   - The mobile menu uses `<details>`/`<summary>` (no client JS).
   **Verify:** Alpha, Beta, and Gamma render with visibly different primary colors. Beta shows German UI strings. Alpha and Gamma show English UI strings, with a published date formatted `15 September 2026` on Alpha and `September 15, 2026` on Gamma. `grep -rn "use client" src/app/\(frontend\) src/components` returns nothing.

7. **Build the front page.** It lists the domain's published posts, newest `publishedAt` first. Show featured image, title (`meta.title`, falling back to the slug), intro excerpt, and a link to `/{slug}`. Paginate with `?page=N` read from `searchParams` on the server. Cache with the `postList(domainId)` tag.
   **Verify:** Alpha's front page lists only Alpha's published posts — no drafts, scheduled posts, or Beta or Gamma posts — and `?page=2` works when there are more posts than one page holds.

8. **Build the article route and template switch.** `[slug]/page.tsx` loads the post by `domain` + `slug` + `status: published`, cached with `post(postId)`. If there's no post, it tries a legal page (step 11), then `notFound()`. It renders `ListicleTemplate` or `InformationalTemplate` from `src/components/templates/` based on `template`. Both templates share `FeaturedImage`, `Intro`, and `Summary` components, and take the post plus domain as props **without fetching**, so phase 06's preview can reuse them.
   **Verify:** a published listicle and a published informational post both render. The draft's slug returns 404. The shared slug from step 1 renders different content on Alpha and Gamma. An Alpha slug requested on Beta returns 404.

9. **Build the listicle template.** For each product, in order: title, description, and product image via `next/image`, with the affiliate image hosts added to `images.remotePatterns`. The **Buy now** button (dictionary string) is an `<a>` pointing at the product's `affiliateUrl`, with `rel="sponsored nofollow noopener"` and `target="_blank"`. Add the affiliate disclosure near the top.
   **Verify:** a listicle shows all products in admin order, every Buy now link has `rel="sponsored nofollow noopener"` and the product's affiliate URL, the button text is German on Beta, and the rendered HTML contains no plain `<img>` tags for content images.

10. **Build the informational template.** Render `body` with `RichText` from `@payloadcms/richtext-lexical/react` as a Server Component. Confirm it needs no `'use client'`; if it does, isolate it in a leaf and note that in the summary. Style prose with `@tailwindcss/typography` (Tailwind v4: `@plugin "@tailwindcss/typography";` in `globals.css`). Inline links in the body that point off-site get `rel="sponsored nofollow noopener"` through a custom link converter.
    **Verify:** headings, paragraphs, and links from the seeded body render with typography styles, and off-site links carry the sponsored rel.

11. **Add legal and static pages.**
    - New collection `pages`: `domain` (required), `type` (`about` | `privacy` | `imprint` | `terms` | `affiliate-disclosure` | `contact` | `other`), `title`, `slug`, `body` (Lexical), `status` (`draft` | `published`). The SEO plugin is enabled on `pages` too. Access matches `posts` (anonymous read = published only).
    - Extend the phase 01 slug validation so a slug is unique per domain **across both `posts` and `pages`**.
    - `[slug]/page.tsx` renders a published page with a simple prose layout when no post matches. The footer (step 6) links the domain's published pages by `type`.
    - Seed: `about`, `privacy`, `imprint`, and `affiliate-disclosure` for each domain, in that domain's language, with placeholder text marked "replace before launch".
    - This collection isn't in spec §4. Report it as a deviation in the wrap-up.
    - Regenerate types and add a migration.
    **Verify:** `beta.localhost:3000/impressum` renders the German imprint. The footer lists the four pages on each domain. Creating a page whose slug equals an existing post's slug on the same domain is rejected. A draft page 404s.

12. **Add metadata and JSON-LD.**
    - `generateMetadata` on `[slug]/page.tsx` and `page.tsx` reads the SEO plugin's `meta` (title, description, image) and returns `title`, `description`, `openGraph` (with image URL and `locale: ogLocaleOf(domain.locale)`), and `alternates.canonical`.
    - There are **no** `hreflang` alternates, because every article exists on exactly one domain in one language.
    - All absolute URLs are built with `src/lib/urls.ts`.
    - Legal pages get the same treatment.
    - JSON-LD in a server-rendered `<script type="application/ld+json">`, with `<` escaped and `inLanguage` set to the domain locale: `Article` for informational posts, and `Article` + `ItemList` of products for listicles. No `Product` schema with invented offers or ratings.
    **Verify:** view source on a Beta article: `<title>` matches `meta.title`, there's exactly one canonical (`http://beta.localhost:3000/<slug>`), `og:locale` is `de_DE`, there are no `hreflang` links, and the JSON-LD parses with `JSON.parse` and has `"inLanguage":"de-DE"`.

13. **Add error, loading, and not-found states.** `not-found.tsx` in the domain's language, `global-not-found.tsx` for unmatched URLs, and `error.tsx` + `loading.tsx` on every async segment (`[host]`, `[slug]`). Unknown slugs render the branded 404 with a 404 status.
    **Verify:** `curl -s -o /dev/null -w '%{http_code}' beta.localhost:3000/does-not-exist` prints `404`, and the page shows Beta's branding and German 404 text.

14. **Add sitemaps and robots.**
    - The proxy rewrites `/sitemap.xml`, `/sitemaps/*`, and `/robots.txt` into the `[host]` tree like any other path.
    - URLs are all of the domain's published posts and pages, each with `<lastmod>` from `updatedAt`.
    - When the total is at most `SITEMAP_CHUNK_SIZE` (default 45000, set via env for testing), `sitemap.xml` is a single urlset. Above it, `sitemap.xml` becomes a `<sitemapindex>` pointing at `/sitemaps/{n}.xml` chunks. This stays under the 50,000-URL protocol limit as content accumulates.
    - Cached with the `sitemap(domainId)` tag.
    - `robots.txt`: when `SITE_ENV === 'production'`, allow everything and reference `siteOrigin(domain)/sitemap.xml`. Otherwise `Disallow: /`.
    **Verify:** `curl alpha.localhost:3000/sitemap.xml` validates as XML and lists Alpha's published posts and pages, with nothing from Beta, Gamma, or drafts. With `SITEMAP_CHUNK_SIZE=5`, it becomes a sitemap index whose chunks together contain the same URLs. `robots.txt` shows `Disallow: /` in development and the Sitemap line with `SITE_ENV=production`.

15. **Check production build and performance.** Run `npm run build && SITE_ENV=production npm start`, and run Lighthouse against a seeded listicle page on the production server.
    **Verify:** the build exits 0, and Lighthouse reports Performance ≥ 90, SEO ≥ 90, and Accessibility ≥ 90 on that page. If Lighthouse can't run in this environment, say so and leave the box unchecked.

## Out of scope

- Real generated content, affiliate feed data, hero image generation (phase 03).
- Publishing, `revalidateTag` calls on publish, redirects, IndexNow (phase 04).
- Draft preview and custom admin views (phase 06).
- Deployment, real domains, and `www` redirects (phase 07).

## Acceptance Checklist

- [ ] **Step 1:** `npm run seed` is idempotent and creates two niches and three single-locale domains (two sharing a niche) with content in their own language, draft/scheduled posts, and a slug shared across two domains
- [ ] **Step 2:** `src/lib/cache/tags.ts` defines the tag contract, and revalidating one post's tag refreshes only that post
- [ ] **Step 3:** `getDomainByHostname` resolves known hosts (ignoring port) and returns `null` for unknown ones
- [ ] **Step 4:** `src/proxy.ts` rewrites public paths by hostname only (no locale segment) and does no database access
- [ ] **Step 4:** `/admin` and `/api` are reachable only on `ADMIN_HOSTNAME` and return 404 on blog domains
- [ ] **Step 4:** Non-production environments send `X-Robots-Tag: noindex, nofollow`
- [ ] **Step 5:** Each domain serves its front page at `/` with `<html lang>` set to its locale; unknown hosts 404 without leaking any domain's content
- [ ] **Step 6:** Domains render with their own branding tokens, UI strings in their language, and country-specific date formatting, with no client components in the frontend
- [ ] **Step 7:** The front page lists only that domain's published posts, with working pagination
- [ ] **Step 8:** Posts resolve by domain + slug at `/{slug}`; drafts 404; the shared slug renders different posts per domain; templates don't fetch their own data
- [ ] **Step 9:** Listicles render products in order with `next/image` and `rel="sponsored nofollow noopener"` Buy now links in the domain's language
- [ ] **Step 10:** Informational bodies render server-side with typography styles, and off-site links are marked sponsored
- [ ] **Step 11:** A per-domain `pages` collection serves legal pages linked from the footer, with slugs unique across posts and pages within a domain
- [ ] **Step 12:** `generateMetadata` uses SEO plugin fields with an absolute canonical and `og:locale`, no hreflang, and valid JSON-LD with `inLanguage`
- [ ] **Step 13:** Unknown slugs return a branded 404 in the domain's language with status 404; async segments have `loading.tsx` and `error.tsx`
- [ ] **Step 14:** Each domain serves a valid sitemap (splitting into an index above the chunk size) and an environment-aware `robots.txt`
- [ ] **Step 15:** `npm run build` passes and Lighthouse Performance, SEO, and Accessibility are all ≥ 90 on a listicle page
