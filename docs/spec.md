# Automated Affiliate Blog Network — Project Specification

## 1. Overview

A system for automatically generating, scheduling, and publishing SEO-optimized affiliate blog posts across a network of country-specific domains — one dedicated domain per country, each written in that country's language — with a lightweight editing layer for fixing language errors, links, or content after generation.

**Core goals:**
- Generate ~10 SEO-optimized affiliate blog posts per day, per domain
- Support two content templates: **listicle** and **informational**
- Support multiple country domains — each domain targets exactly one country and publishes in exactly one language (e.g. `example.de` in German, `example.co.uk` in British English). There are no language path prefixes such as `/en/` or `/de/`
- Auto-generate a featured hero image per post and pull real product images from the affiliate data feed for that country's marketplace
- Pre-generate a month of content in advance and schedule it to publish at randomized intervals throughout the day
- Provide two dedicated admin interfaces: one for keyword research and bulk generation, one for reviewing and editing individual articles
- Allow manual editing of individual fields (an awkward sentence, a broken affiliate link, a wrong product image) without regenerating the whole post, and without affecting any other domain's articles

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

Both templates map to structured content models (not free-form rich text where avoidable), so each field is independently editable. The `Post` collection distinguishes which template a given article uses, and the Next.js frontend renders a different route/component per template type.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend/rendering | **Next.js** | Full control over SSR/SSG, per-domain rendering from one app, sitemaps, structured data — all essential for an SEO-driven business |
| Styling | **Tailwind CSS** | Fast to build a simple blog UI (front page, menu, footer, two article templates) |
| Content model / CMS | **Payload CMS** (runs inside the Next.js app) | Content for every domain in one CMS, `blocks`/array field types (match the product-block structure exactly), hooks, admin UI — all generated from a TypeScript config, no separate CMS service to run |
| SEO metadata | **Payload SEO plugin** | Handles meta title/description, Open Graph fields, and canonical URLs per post, rather than custom-built fields |
| Database | **Postgres** (Supabase Postgres) | Payload's Postgres adapter handles schema/migrations |
| Media storage | **Cloudflare R2** | Zero egress fees — matters since featured images get served on every page view |
| AI text generation | **Anthropic Claude API** (Sonnet 5), via the **Batch API** | Async, pre-generated content fits batch processing perfectly; 50% cheaper than standard API |
| AI image generation | Separate image API (Flux via fal.ai, Ideogram, DALL·E, or Recraft) | Anthropic does not generate images itself; used only for featured hero images |
| Product images | Pulled directly from the affiliate network's product feed / API for the domain's country (e.g. Amazon PA-API for amazon.de, or the relevant network's datafeed) | Real product photos are required for trust/compliance; never AI-generate a product image |
| Keyword research | **Semrush** (via API integration into the SEO admin interface), using the regional database for each domain's country | Source of keywords and keyword clusters that drive article generation |
| Language | **TypeScript** throughout | Matches your background, and Payload + Next.js are both TypeScript-native |

---

## 4. Data Model (conceptual)

**Domain** (one per country)
- name, hostname, branding/theme config
- `locale` — the single language + country the domain publishes in (e.g. `de-DE`, `en-GB`, `da-DK`); drives the article language, `<html lang>`, UI strings, and Open Graph locale
- Semrush regional database, affiliate marketplace settings, and publishing timezone for that country

**KeywordCluster**
- source (Semrush), cluster name, list of keywords, target domain, target template (listicle/informational), status (`unused` | `assigned` | `used`)
- One cluster produces exactly one article, written in the target domain's language

**Post** (one document per article, belonging to exactly one domain)
- `domain` — relationship to Domain (an article's identity is scoped to its domain; two domains never share a Post document, even if both covered the same topic or were generated in the same batch run)
- `template`: `listicle` | `informational`
- `slug` — unique within its domain; the URL is `https://<domain hostname>/<slug>`
- `status`: `draft` | `scheduled` | `published` | `failed`
- `scheduledAt`, `publishedAt`
- `featuredImage` (media reference)
- `intro`
- `products`: ordered list of blocks (listicle template only); within each item:
  - `title`
  - `description`
  - `imageUrl` (from the affiliate feed)
  - `affiliateUrl` (for the domain's country marketplace, e.g. amazon.de)
- `body`: rich text / structured sections (informational template only)
- `summary`
- SEO fields (managed by the Payload SEO plugin)

Content is not localized inside documents. Each article is written once, in its domain's language, and lives on that domain only. Because `domain` is a field on the document, a given article's data is never shared or duplicated across domains — `example.de`'s "10 best hiking backpacks" and `example.co.uk`'s "10 best hiking backpacks" are separate Post documents, researched and generated separately, and editing one never touches the other.

---

## 5. Admin Interfaces

Two purpose-built interfaces sit on top of the Payload admin/API, rather than relying on Payload's default collection views for the whole workflow.

### 5.1 SEO Interface (generation)
Used for keyword research and bulk content generation.

- **Semrush integration**: pulls keyword data and generates keyword clusters via the Semrush API, scoped to a chosen domain/niche and using that domain's country database
- **Cluster review**: displays generated keyword clusters, allows selecting/editing which clusters to use before generation
- **Bulk generation**: takes a set of approved keyword clusters and generates a month's worth of articles — **one keyword cluster maps to exactly one article**
- Lets the user choose, per cluster/article: target domain (which fixes the country and language) and template (listicle or informational)
- Triggers the generation pipeline (see Section 6), submitting the batch to Claude's Batch API and creating `draft`/`scheduled` `Post` rows once results return

### 5.2 Editor Interface (review & edit)
Used for reviewing and correcting individual articles after generation.

- Lists articles (filterable by domain, template, status, scheduled date)
- Opens a specific article for editing using Payload's native per-document edit screen — intro, product blocks or body sections, images, links, SEO fields
- Edits apply **only to that specific article on that specific domain** — since a Post document belongs to exactly one domain, there is no risk of an edit leaking into another domain's article
- Includes the scheduling calendar/timeline view (see Section 7) so upcoming scheduled posts can be caught and fixed before they go live

---

## 6. Content Generation Pipeline

1. **Keyword research**: Via the SEO interface, pull keyword clusters from Semrush for a target domain/niche, using that domain's country database.
2. **Cluster-to-article mapping**: Each approved keyword cluster becomes exactly one article — one `Post` document — assigned to the cluster's domain and template, and written in that domain's language.
3. **Batch job creation**: A script assembles a large batch of generation requests — one per article — each containing the keyword cluster, template type, the domain's language and country, and (for listicle articles) product data pulled from the affiliate feed for that country's marketplace.
4. **Submit to Claude's Batch API**: All requests submitted as a single async batch job. Cost is 50% cheaper than real-time API calls, and latency (typically minutes to a few hours, SLA up to 24h) is a non-issue since content is generated well ahead of its scheduled publish time.
5. **Retrieve results**: Poll for batch completion, and for each result, create the `Post` document — saved as `draft` or `scheduled` in Payload.
6. **Image generation**: For each post, call the image generation API for the featured hero image; attach real product images (listicle template) by looking up URLs from the affiliate feed — no AI generation for product images.
7. **Human QC pass** (recommended): Since listicle pages carry "Buy Now" links, a periodic manual review pass in the Editor interface catches AI-generated inaccuracies or unnatural language before/after they go live — this matters more for trust and conversion than for SEO itself.

---

## 7. Scheduling System

**Goal**: Publish 10 posts per day, per domain, spaced through the 08:00–23:30 window in that domain's country timezone — with randomized timing rather than perfectly even intervals.

- Base interval = (23:30 − 08:00) / (10 − 1) ≈ 103 minutes between posts
- **Random jitter is applied to every scheduled slot** (e.g. ±5–10 minutes), not optional — this is a built-in part of computing `scheduledAt`, so publishing cadence never looks mechanically identical day to day
- A batch of 30 days × 10 posts per domain is generated in advance and each post assigned a jittered `scheduledAt` timestamp

**Publishing mechanism — polling worker**
- A scheduled job (e.g. every 1–5 minutes, via a cron trigger) queries: `WHERE status = 'scheduled' AND scheduledAt <= now()`
- Flips matching posts to `published`
- Triggers Next.js `revalidatePath`/on-demand ISR for the post URL and relevant listing/index pages
- Appends the new URL to that domain's `sitemap.xml`
- **Pings IndexNow** (Bing/Yandex/other participating engines) immediately for near-instant crawl discovery, and optionally submits to Google's URL inspection API

This approach was chosen over a delayed-job queue (e.g. BullMQ/Redis) because it's simpler to build, easier to debug, and more than sufficient at this volume (hundreds of scheduled posts, not tens of thousands).

**Admin visibility**: The Editor interface includes a calendar/timeline view of scheduled posts by slot per domain, so an unnatural sentence or broken link can be caught and fixed before it goes live.

---

## 8. Cost Estimate

### Claude API (text generation)
Rates as of September 2026 (subject to change — verify current pricing before finalizing budget):

| Model | Input | Output | Batch API (50% off) |
|---|---|---|---|
| Sonnet 5 | $2/MTok | $10/MTok | $1 / $5 |

Per post: ~1,500 input tokens + ~2,000 output tokens ≈ **$0.023 standard**, **~$0.012 with Batch API**.

Example at 5 country domains × 10 posts/day (50 posts/day):
- Standard API: ~$1.15/day (~$35/month)
- **Batch API: ~$0.58/day (~$17/month)**

Each additional country domain adds 10 posts/day (~$3.50/month with Batch API).

### AI image generation (featured images only)
~$0.02–$0.05/image, one per post. At 50 featured images/day across 5 domains: **~$1–2.50/day (~$30–75/month)**.

### Database + storage
- Text storage is negligible at this scale (a year of content across several domains is roughly 1–2 GB)
- Managed Postgres: **$0–25/month** (minimum tier of any provider covers this easily)
- Image storage on Cloudflare R2 (zero egress fees): a few cents to under $1/month even after a year of accumulated images

### Semrush
Subscription cost depends on the tier needed for API-based keyword/cluster access — check current Semrush API plan pricing, as this isn't a Claude/Anthropic cost and wasn't covered in prior estimates.

### Estimated total
Roughly **$50–120/month** all-in for AI generation + images + database at 5 domains (excluding Semrush subscription), before hosting/compute and affiliate tooling. This is not expected to be the dominant cost of the project.

---

## 9. Open Items / Next Steps

- Finalize which countries to launch in, and the domain for each (drives the cost/scale numbers above)
- Choose specific affiliate network(s) per country and confirm product feed/API access for image + price data
- Choose image generation provider (Flux via fal.ai is a good low-cost default)
- Confirm Semrush API access/tier for keyword cluster generation
- Build Payload collection configs: `Posts`, `Domains`, `KeywordClusters`, `Media`
- Install and configure the Payload SEO plugin
- Build the SEO interface (Semrush integration + cluster-to-article batch generation trigger)
- Build the Editor interface (article list, per-article CMS editing, scheduling calendar)
- Build the batch generation script (keyword cluster → Claude Batch API → save drafts)
- Build the cron dispatcher (schedule check → publish → revalidate → sitemap update → IndexNow ping)
- Decide on human QC cadence for published content
