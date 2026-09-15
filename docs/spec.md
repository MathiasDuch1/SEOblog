# Automated Affiliate Blog Network — Project Specification

## 1. Overview

A system for automatically generating, translating, scheduling, and publishing SEO-optimized affiliate blog posts across multiple domains and languages, with a lightweight editing layer for fixing translations, links, or content after generation.

**Core goals:**
- Generate ~10 SEO-optimized affiliate blog posts per day, per domain
- Support two content templates: **listicle** and **informational**
- Support multiple domains, each potentially running in multiple languages
- Auto-generate a featured hero image per post and pull real product images from affiliate data feeds
- Pre-generate a month of content in advance and schedule it to publish at randomized intervals throughout the day
- Provide two dedicated admin interfaces: one for keyword research and bulk generation, one for reviewing and editing individual articles
- Allow manual editing of individual fields (a mistranslated sentence, a broken affiliate link, a wrong product image) without regenerating the whole post, and without affecting the same article on other domains

---

## 2. Content Templates

The system supports **two article templates** at launch:

### Template A — Listicle
```
Featured Image
Intro (short SEO-optimized paragraph)
Product 1
  - Title
  - Description
  - Buy Now button (affiliate link)
Product 2
  - Title
  - Description
  - Buy Now button
...
Product N
Summary
```

### Template B — Informational
Classic informational/editorial content — a standard long-form article structure rather than repeating product blocks:
```
Featured Image
Intro
Body sections (headings + paragraphs, may include inline affiliate links/CTAs where relevant)
Summary / conclusion
```

Both templates map to structured content models (not free-form rich text where avoidable), so each is independently editable per locale. The `Post` collection distinguishes which template a given article uses, and the Next.js frontend renders a different route/component per template type.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend/rendering | **Next.js** | Full control over SSR/SSG, sitemaps, hreflang tags, structured data — all essential for an SEO-driven business |
| Styling | **Tailwind CSS** | Fast to build a simple blog UI (front page, menu, footer, two article templates) |
| Content model / CMS | **Payload CMS** (runs inside the Next.js app) | Built-in field-level localization, `blocks` field type (matches the product-block structure exactly), scheduled publishing, hooks, admin UI — all generated from a TypeScript config, no separate CMS service to run |
| SEO metadata | **Payload SEO plugin** | Handles meta title/description, Open Graph fields, and canonical URLs per post/locale, rather than custom-built fields |
| Database | **Postgres** (Supabase Postgres) | Payload's Postgres adapter handles schema/migrations |
| Media storage | **Cloudflare R2** | Zero egress fees — matters since featured images get served on every page view |
| AI text generation | **Anthropic Claude API** (Sonnet 5), via the **Batch API** | Async, pre-generated content fits batch processing perfectly; 50% cheaper than standard API |
| AI image generation | Separate image API (Flux via fal.ai, Ideogram, DALL·E, or Recraft) | Anthropic does not generate images itself; used only for featured hero images |
| Product images | Pulled directly from the affiliate network's product feed / API (e.g. Amazon PA-API, or the relevant network's datafeed) | Real product photos are required for trust/compliance; never AI-generate a product image |
| Keyword research | **Semrush** (via API integration into the SEO admin interface) | Source of keywords and keyword clusters that drive article generation |
| Language | **TypeScript** throughout | Matches your background, and Payload + Next.js are both TypeScript-native |

---

## 4. Data Model (conceptual)

**Domain**
- name, hostname, branding/theme config, default locale, active locales

**KeywordCluster**
- source (Semrush), cluster name, list of keywords, target domain, target template (listicle/informational), status (`unused` | `assigned` | `used`)
- One cluster produces exactly one article

**Post** (one document per article per domain — all locale variants live inside this same document, not as separate rows)
- `domain` — relationship to Domain (an article's identity is scoped to its domain; two domains never share a Post document, even if both originated from equivalent keyword clusters or were generated in the same batch run)
- `template`: `listicle` | `informational`
- `slug` (localized — the URL segment is translated per locale)
- `status`: `draft` | `scheduled` | `published` | `failed`
- `scheduledAt`, `publishedAt`
- `featuredImage` (media reference, shared across locales)
- `intro` (localized text)
- `products`: ordered list of blocks (listicle template only) — the array itself is *not* localized, so every locale has the same number of products in the same order; within each item:
  - `title` (localized)
  - `description` (localized)
  - `imageUrl` (from affiliate feed, not localized — same photo across languages)
  - `affiliateUrl` (localized — link can vary by region/locale, e.g. amazon.com vs amazon.de)
- `body`: rich text / structured sections (informational template only, localized)
- `summary` (localized)
- SEO fields (managed by the Payload SEO plugin, localized)

Payload's field-level `localized: true` flag stores a separate value per locale **inside the same document** — editing the German value of a field never touches the English value on that same Post, because they're just two values on one row, not two different rows. Because `domain` is a field on that one document, a given article's data is never shared or duplicated across domains — each domain's version of "10 best hiking backpacks" is its own separate Post document from the start.

---

## 5. Admin Interfaces

Two purpose-built interfaces sit on top of the Payload admin/API, rather than relying on Payload's default collection views for the whole workflow.

### 5.1 SEO Interface (generation)
Used for keyword research and bulk content generation.

- **Semrush integration**: pulls keyword data and generates keyword clusters via the Semrush API, scoped to a chosen domain/niche
- **Cluster review**: displays generated keyword clusters, allows selecting/editing which clusters to use before generation
- **Bulk generation**: takes a set of approved keyword clusters and generates a month's worth of articles — **one keyword cluster maps to exactly one article**
- Lets the user choose, per cluster/article: target domain, locale(s), and template (listicle or informational)
- Triggers the generation pipeline (see Section 6), submitting the batch to Claude's Batch API and creating `draft`/`scheduled` `Post` rows once results return

### 5.2 Editor Interface (review & edit)
Used for reviewing and correcting individual articles after generation.

- Lists articles (filterable by domain, locale, template, status, scheduled date)
- Opens a specific article for editing using Payload's native per-document, per-locale edit screen — intro, product blocks or body sections, images, links, SEO fields, with a locale switcher for translations
- Edits apply **only to that specific article on that specific domain, in the selected locale** — since a Post document is scoped to one domain and localized fields store separate values per locale on that same document, there is no risk of an edit leaking into another domain's copy or another language's value
- Includes the scheduling calendar/timeline view (see Section 7) so upcoming scheduled posts can be caught and fixed before they go live

---

## 6. Content Generation Pipeline

1. **Keyword research**: Via the SEO interface, pull keyword clusters from Semrush for a target domain/niche.
2. **Cluster-to-article mapping**: Each approved keyword cluster becomes exactly one article — one `Post` document — assigned a domain and template; that single document then holds every target locale's content as it's generated.
3. **Batch job creation**: A script assembles a large batch of generation requests — one per article, per language — each containing the keyword cluster, template type, and (for listicle articles) product data pulled from the affiliate feed.
4. **Submit to Claude's Batch API**: All requests submitted as a single async batch job. Cost is 50% cheaper than real-time API calls, and latency (typically minutes to a few hours, SLA up to 24h) is a non-issue since content is generated well ahead of its scheduled publish time.
5. **Retrieve results**: Poll for batch completion, and for each result, create the `Post` document (on its first locale) or update it (writing the additional locale's values into the same document) — saved as `draft` or `scheduled` in Payload.
6. **Image generation**: For each post, call the image generation API for the featured hero image; attach real product images (listicle template) by looking up URLs from the affiliate feed — no AI generation for product images.
7. **Human QC pass** (recommended): Since listicle pages carry "Buy Now" links, a periodic manual review pass in the Editor interface catches AI-generated inaccuracies or bad translations before/after they go live — this matters more for trust and conversion than for SEO itself.

---

## 7. Scheduling System

**Goal**: Publish 10 posts per day, per domain, spaced through the 08:00–23:30 window — with randomized timing rather than perfectly even intervals.

- Base interval = (23:30 − 08:00) / (10 − 1) ≈ 93 minutes between posts
- **Random jitter is applied to every scheduled slot** (e.g. ±5–10 minutes), not optional — this is a built-in part of computing `scheduledAt`, so publishing cadence never looks mechanically identical day to day
- A batch of 30 days × 10 posts × N locales is generated in advance and each post assigned a jittered `scheduledAt` timestamp

**Publishing mechanism — polling worker**
- A scheduled job (e.g. every 1–5 minutes, via a cron trigger) queries: `WHERE status = 'scheduled' AND scheduledAt <= now()`
- Flips matching posts to `published`
- Triggers Next.js `revalidatePath`/on-demand ISR for the post URL and relevant listing/index pages
- Appends the new URL to that domain's `sitemap.xml`
- **Pings IndexNow** (Bing/Yandex/other participating engines) immediately for near-instant crawl discovery, and optionally submits to Google's URL inspection API

This approach was chosen over a delayed-job queue (e.g. BullMQ/Redis) because it's simpler to build, easier to debug, and more than sufficient at this volume (hundreds of scheduled posts, not tens of thousands).

**Admin visibility**: The Editor interface includes a calendar/timeline view of scheduled posts by slot per domain, so a bad translation or broken link can be caught and fixed before it goes live.

---

## 8. Cost Estimate

### Claude API (text generation)
Rates as of September 2026 (subject to change — verify current pricing before finalizing budget):

| Model | Input | Output | Batch API (50% off) |
|---|---|---|---|
| Sonnet 5 | $2/MTok | $10/MTok | $1 / $5 |

Per post, per language: ~1,500 input tokens + ~2,000 output tokens ≈ **$0.023 standard**, **~$0.012 with Batch API**.

Example at 5 domains × 10 posts/day × 3 languages (150 units/day):
- Standard API: ~$3.45/day (~$104/month)
- **Batch API: ~$1.70/day (~$52/month)**

### AI image generation (featured images only)
~$0.02–$0.05/image. At 50 featured images/day across 5 domains: **~$1–2.50/day (~$30–75/month)**.

### Database + storage
- Text storage is negligible at this scale (a year of content across several domains/languages is roughly 1–2 GB)
- Managed Postgres: **$0–25/month** (minimum tier of any provider covers this easily)
- Image storage on Cloudflare R2 (zero egress fees): a few cents to under $1/month even after a year of accumulated images

### Semrush
Subscription cost depends on the tier needed for API-based keyword/cluster access — check current Semrush API plan pricing, as this isn't a Claude/Anthropic cost and wasn't covered in prior estimates.

### Estimated total
Roughly **$75–120/month** all-in for AI generation + images + database (excluding Semrush subscription), before hosting/compute and affiliate tooling. This is not expected to be the dominant cost of the project.

---

## 9. Open Items / Next Steps

- Finalize exact domain count and language count per domain (drives the cost/scale numbers above)
- Choose specific affiliate network(s) and confirm product feed/API access for image + price data
- Choose image generation provider (Flux via fal.ai is a good low-cost default)
- Confirm Semrush API access/tier for keyword cluster generation
- Build Payload collection configs: `Posts`, `Domains`, `KeywordClusters`, `Media`
- Install and configure the Payload SEO plugin
- Build the SEO interface (Semrush integration + cluster-to-article batch generation trigger)
- Build the Editor interface (article list, per-article CMS editing, scheduling calendar)
- Build the batch generation script (keyword cluster → Claude Batch API → save drafts)
- Build the cron dispatcher (schedule check → publish → revalidate → sitemap update → IndexNow ping)
- Decide on human QC cadence for published content
