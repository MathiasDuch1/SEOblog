# Phase 03 — Content Generation Pipeline

## Goal

Approved keyword clusters become fully populated `Post` documents through Claude's Message Batches API. Each cluster produces one post on the cluster's domain, written natively in that domain's language for that country's market. Listicles use real product data (titles, images, affiliate URLs) from the affiliate marketplace configured for that domain's country. Each post gets an AI-generated hero image stored in R2.

At production volume — a month of content for several country domains — imports and image generation run in resumable chunks that fit inside serverless function time limits. Every batch is tracked, imports are idempotent, failures are recorded, and failed clusters can simply be resubmitted. This phase runs from scripts; the admin UI for it is phase 06.

## Prerequisites

- Phases 01 and 02 fully checked off.
- `ANTHROPIC_API_KEY` for an organization with Batch API access.
- Decision recorded: **affiliate network and marketplace per country** (e.g. amazon.de for the German domain), with product feed/API credentials. The pipeline also ships a `mock` product source, so everything except the real-feed checklist item can be verified without one.
- **Affiliate terms review** (record findings in `00-overview.md`). Read each network's operating agreement for:
  - whether product images may be proxied or cached by `next/image`
  - whether prices may be displayed and how fresh they must be
  - the required disclosure wording
  - restrictions on AI-written product descriptions
  Step 5 applies what you find.
- Decision recorded: **hero image provider** (default: Flux via fal.ai) and its API key.

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — all pipeline code is server-only (`src/lib/…` with `import 'server-only'`, or `payload run` scripts). No client components.
- `claude-api` (built-in) — **load it before writing any Anthropic SDK code** and follow its TypeScript batch and structured-output docs rather than recalled API shapes. The spec's model choice is `claude-sonnet-5`.

## Key API facts (verify against the `claude-api` skill before relying on them)

- `client.messages.batches.create({ requests: [{ custom_id, params }] })` → poll `client.messages.batches.retrieve(id)` until `processing_status === 'ended'` → iterate `client.messages.batches.results(id)`.
- Each result has `custom_id` and `result.type`: `succeeded` | `errored` | `canceled` | `expired`. **Results come back in any order** — always key by `custom_id`.
- Limits: 100,000 requests or 256 MB per batch. Most batches finish within 1 hour, 24 hours at most. **Results are kept for 29 days**, so a batch must be imported within that window. All token usage is billed at 50%.
- `custom_id` must match `^[a-zA-Z0-9_-]{1,64}$` — no colons.
- Structured JSON output uses `output_config: { format: … }`. The deprecated `output_format` must not be used, and assistant prefill is rejected on current models.

## Steps

1. **Install dependencies and set up testing.** Install `@anthropic-ai/sdk` and `zod`, plus `vitest` as a dev dependency with an `npm test` script. Add `ANTHROPIC_API_KEY`, `GENERATION_MODEL=claude-sonnet-5`, and `GENERATION_EFFORT=medium` to `.env.example`. Create `src/lib/ai/client.ts` (server-only), which exports a single `Anthropic` client.
   **Verify:** `npm test` runs, even with zero tests, and a one-off `payload run` script calling `client.models.retrieve(process.env.GENERATION_MODEL)` prints the model's `id`. Delete the script afterwards.

2. **Link posts to clusters and add batch tracking.**
   - `Posts.sourceCluster` — relationship → `keyword-clusters`, unique, admin read-only. This is how an import finds the post a cluster already produced, keeping imports idempotent.
   - New collection `generation-batches`, logged-in users only. Fields:
     - `anthropicBatchId` (unique), `domain` (every cluster in a batch belongs to this domain), `autoSchedule` (checkbox, used in phase 06)
     - `status` (`submitted` | `in_progress` | `ended` | `importing` | `imported` | `failed`)
     - `requests[]`: `customId`, `cluster`, `post`, `importState` (`pending` | `imported` | `errored`), `error`, `inputTokens`, `outputTokens`
     - `productSnapshot` (JSON: the product list per cluster that the model saw), `submittedAt`, `endedAt`, `importedAt`, `requestCounts` (group)
   - `generation-batches` isn't in spec §4. Report it as a deviation in the wrap-up.
   - Regenerate types and create a migration.
   **Verify:** `generation-batches` appears in the admin sidebar and is denied to anonymous REST requests, a second post with the same `sourceCluster` is rejected, `tsc --noEmit` passes, and a new migration file exists.

3. **Define output schemas.** `src/lib/ai/schemas.ts` contains zod schemas for one article's generated content:
   - **Listicle:** `slug` (lowercase kebab-case ASCII, transliterating characters like `ä → ae` or `ß → ss`, written in the domain's language), `intro`, `products[]` (`productRef` echoing the input product id, `title`, `description`), `summary`, `meta` (`title` ≤ 60 chars, `description` ≤ 160 chars).
   - **Informational:** `slug`, `intro`, `sections[]` (`heading`, `paragraphs[]`, optional `links[]` with `text` + `productRef`), `summary`, `meta`.
   Build the JSON schema for `output_config.format` from these zod schemas. Check with the `claude-api` skill whether the SDK's zod helper serializes correctly inside batch `params`; if not, pass `{ type: 'json_schema', schema }` built from `z.toJSONSchema`. On import, parse the text and validate with the **same** zod schema.
   **Verify:** `vitest` tests pass for a valid fixture and fail with clear errors for an over-long `meta.title`, a missing product, and a slug containing `ü` or spaces.

4. **Convert sections to Lexical.** `src/lib/ai/toLexical.ts` converts `sections[]` into valid Lexical editor state JSON: `heading` nodes (h2), `paragraph` nodes, and link nodes for `links[]`. A `productRef` link resolves to that product's affiliate URL.
   **Verify:** a `vitest` test converts a fixture. Saving the result into an informational post's `body` through the Local API succeeds, and the phase 02 template renders it with correct headings and links.

5. **Build the per-country affiliate product source.**
   - Add an `affiliate` group to Domains: `source` (text, e.g. `mock` or the network name), `marketplace` (e.g. `amazon.de`), `partnerTag`. Update the seed script (Alpha, Beta, and Gamma use `mock`), regenerate types, and add a migration.
   - `src/lib/affiliate/types.ts` defines `ProductSource.findProducts({ keywords, domain, limit })`, which returns `{ id, title, imageUrl, affiliateUrl, price?, currency? }[]` for **that domain's marketplace**, with the partner tag applied.
   - Implementations: `mock.ts` (deterministic fake products whose URLs include the marketplace, with placeholder images on an allowed remote host) and `<network>.ts` (the chosen network, credentials from env).
   - `getProductSource(domain)` picks the implementation from `domain.affiliate.source`.
   - Product images always come from the source — never generated.
   - Apply the terms review:
     - If product images may not be proxied or cached, render those hosts with `next/image`'s `unoptimized` prop in the phase 02 listicle template.
     - Otherwise add them to `images.remotePatterns`.
     - Prices are not stored or displayed unless the terms allow it and a refresh mechanism exists.
   **Verify:** a script prints 5 products for a test keyword on Beta (mock), with affiliate URLs pointing at Beta's configured marketplace, and on Alpha, with URLs pointing at Alpha's. With the real network configured for one domain, it prints real products from that country's marketplace, with image URLs returning 200 and the partner tag present, and the listicle renders them in line with the terms. If there are no credentials yet, say so and leave the real-feed box unchecked.

6. **Write the prompt builders.** Put them in `src/lib/ai/prompts/{listicle,informational}.ts`.
   - The **system prompt** is byte-identical across every request of a template, with no language, dates, IDs, or per-request data, and ends with a `cache_control` breakpoint so the shared prefix is cached across the batch and across domains. It covers voice, SEO writing rules, the output shape, and grounding rules: describe only facts present in the supplied product data, and never invent specs, prices, or ratings.
   - The **user message** carries the per-request data:
     - domain name, and the domain `locale` spelled out (e.g. "German for readers in Germany (de-DE)"), with the instruction to write natively for that market — spelling (en-GB vs en-US), units, and cultural references — not as a translation
     - primary keyword + supporting keywords
     - the template's target length
     - for listicles, the product list with `productRef` ids
   **Verify:** a `vitest` test asserts the system prompt is identical for clusters on Alpha and Beta, and snapshot tests pin one rendered user message per template, including the locale instruction.

7. **Assemble and submit a batch.** `src/lib/generation/submitBatch.ts` → `submitBatch({ clusterIds })`:
   - Load clusters. Reject any whose status isn't `unused`, and reject a mix of target domains (one batch per domain).
   - Listicles: fetch products once per cluster from `getProductSource(domain)`, and store the list in `productSnapshot`.
   - One request per cluster, with `custom_id = c{clusterId}`. Params: `model: GENERATION_MODEL`, `max_tokens: 16000`, `thinking: { type: 'adaptive' }`, `output_config: { effort: GENERATION_EFFORT, format: … }`, and the system and user prompts from step 6.
   - If the request count exceeds the API limits (see "Key API facts"), split into several batches.
   - Create the `generation-batches` doc(s) and set the clusters to `assigned` **after** the API accepts the batch. If submission throws, nothing changes.
   - Script: `npm run generate -- --clusters <id,id,...>` (`payload run src/scripts/generate.ts`).
   **Verify:** with mock products, 3 Beta clusters (2 listicles, 1 informational) create one batch with 3 requests. The batch doc has 3 `pending` rows and a product snapshot, and all three clusters are `assigned`. Mixing an Alpha cluster into the same call is rejected, with nothing submitted.

8. **Poll and import results in resumable chunks.** `src/lib/generation/importBatch.ts` → `importBatch(batchDocId, { maxRows = IMPORT_CHUNK_SIZE })`:
   - Retrieve the batch and update `status` / `requestCounts`. Stop if it hasn't `ended`.
   - Stream results and key them by `custom_id`. Skip rows already `imported` or `errored`. Process at most `maxRows` pending rows per call, then return `{ remaining }`. The next call continues where this one stopped, so an import of thousands of rows spreads across cron runs.
   - `succeeded`: parse and validate with zod. Find the post by `sourceCluster`, or create it (`domain`, `template`, `status: draft`, `sourceCluster`). Write `slug`, `intro`, `summary`, and `meta`, plus `products` (listicle) built from `productSnapshot` in order — `imageUrl` and `affiliateUrl` from the snapshot, `title` and `description` from the output — or `body` (informational) via `toLexical`.
   - If the generated slug collides with an existing slug on that domain, append `-2`, `-3`, … before saving.
   - Record `usage.input_tokens` / `output_tokens` on the request row.
   - `errored` / `expired` / `canceled`, or output failing zod validation: record the error on the row, create no post, and set the cluster back to `unused` so it can be resubmitted.
   - When no rows are `pending`, clusters with a created post become `used`, and the batch becomes `imported` with `importedAt`.
   - Script: `npm run generation:poll` loops `importBatch` until every non-imported batch has `remaining: 0`.
   - Route: `GET /api/cron/generation` (`src/app/api/cron/generation/route.ts`, `dynamic = 'force-dynamic'`, `maxDuration` set explicitly) processes one chunk per non-imported batch, then runs step 9's image chunk, then returns. It requires `Authorization: Bearer ${CRON_SECRET}`, compared in constant time.
   - Add `CRON_SECRET` and `IMPORT_CHUNK_SIZE` (default 50) to `.env.example`.
   - The route is reachable only on the admin host (phase 02 proxy). Scheduling it is phase 07.
   **Verify:**
   - After the step 7 batch ends, `generation:poll` creates 3 Beta draft posts in German.
   - Listicle product order, image URLs, and affiliate URLs match the snapshot.
   - With `IMPORT_CHUNK_SIZE=1`, three calls to the cron route are needed to finish, and no row is imported twice.
   - A further `generation:poll` changes nothing.
   - A forced validation failure on one row (e.g. a fixture batch result) leaves that cluster `unused` with the error recorded.
   - The cron route returns 401 without the secret.

9. **Generate hero images in resumable chunks.** `src/lib/images/types.ts` defines `ImageProvider.generate({ prompt, aspectRatio })`, which returns `{ bytes, mimeType }`, with a `fal.ts` (or the chosen provider) implementation and a `mock.ts` that returns a generated placeholder. `attachHeroImages({ limit = IMAGE_CHUNK_SIZE })`:
   - Finds imported posts with no `featuredImage`, oldest first, up to `limit`.
   - Per post, builds an English image prompt from the primary keyword and intro gist: editorial photography style, no text, logos, watermarks, or recognizable branded products.
   - Uploads the bytes via `payload.create({ collection: 'media', data: { alt }, file })` so they land in R2, then sets `featuredImage`. `alt` is written in the domain's language, from the post's intro or title.
   - A provider failure on one post is logged, and that post is retried on the next run, capped at 3 attempts (tracked in a `heroImageAttempts` field). It never fails the batch or changes post status.
   - Image generation is **not** done inline during import, so a large import can't time out waiting on the image API.
   - Add `IMAGE_PROVIDER` and `IMAGE_CHUNK_SIZE` (default 10) to `.env.example`.
   **Verify:** with the real provider, an imported Beta post gets a `featuredImage` stored in R2, with German alt text, that renders on the phase 02 article page. Re-running doesn't create a second media doc. With `IMAGE_CHUNK_SIZE=1` and 3 imageless posts, three runs attach all three. A forced provider error stops retrying after 3 attempts. With `IMAGE_PROVIDER=mock`, the flow works offline.

10. **Resubmit failed clusters.** Clusters that come back `unused` after a failed request go through `submitBatch` again like any other cluster. `submitBatch` re-fetches products (a fresh snapshot) and, because posts are only created on success, no stale or partial post exists to clean up. Add a `--failed-from <batchDocId>` option to `npm run generate`, which collects that batch's errored clusters.
    **Verify:** after the forced failure from step 8, `npm run generate -- --failed-from <batchDocId>` submits exactly one request, and once imported, the cluster becomes `used` with a single post (no duplicates for that `sourceCluster`).

11. **Validate readiness.** `src/lib/generation/readiness.ts` → `getReadiness(post)` returns `{ ready, missing[] }`, checking `slug`, `intro`, `summary`, `meta.title`, `meta.description`, `featuredImage`, and either every product's `title` + `affiliateUrl` + `imageUrl` (listicle) or a non-empty `body` (informational). Phases 04 and 06 use this.
    **Verify:** `vitest` tests cover a complete listicle, a complete informational post, a post missing `featuredImage`, and a listicle missing one product's `affiliateUrl`, each with the correct `missing` list.

12. **Run an end-to-end dry run with the real API.** Use hand-made clusters on two domains in separate batches — 1 listicle + 1 informational on Beta (`de-DE`), and 1 listicle on Alpha (`en-GB`) — with the real Anthropic API. Use the real affiliate source if available, otherwise mock. Run it through `generate` → wait → `generation:poll`.
    **Verify:** all three posts render correctly on their domains after temporarily setting them to `published`, then setting them back to `draft`. The Beta posts read as native German, and the Alpha post uses British spelling. Listicle products match each domain's feed data. Report the total input and output tokens and the computed cost at batch pricing against spec §8's ~$0.012 per post estimate.

## Out of scope

- Assigning `scheduledAt`, publishing, and revalidation on publish (phase 04).
- Scheduling the cron routes on a real host (phase 07).
- Semrush and automatic cluster creation (phase 05). Clusters in this phase are created by hand in the admin.
- Any admin UI for submitting batches, resubmitting, or reviewing results (phase 06).

## Acceptance Checklist

- [ ] **Step 1:** Anthropic SDK, zod, and vitest are installed, and a server-only client reaches the configured model
- [ ] **Step 2:** Posts have a unique `sourceCluster`, and an admin-only `generation-batches` collection exists with a migration
- [ ] **Step 3:** Zod output schemas for both templates exist, with passing validation tests, including ASCII-only slugs
- [ ] **Step 4:** Generated sections convert to Lexical JSON that saves and renders on the frontend
- [ ] **Step 5:** Domains carry affiliate marketplace settings, and the mock product source returns marketplace-specific affiliate URLs per domain
- [ ] **Step 5:** A real affiliate network source returns real products for a domain's country marketplace, rendered in line with the terms review
- [ ] **Step 6:** System prompts are byte-identical across requests and domains with a cache breakpoint, and user messages carry the locale-specific writing instruction
- [ ] **Step 7:** `npm run generate` submits one request per cluster for a single domain, snapshots products, and marks clusters `assigned` only after acceptance
- [ ] **Step 8:** Import creates one post per successful cluster in the domain's language, with products matching the snapshot
- [ ] **Step 8:** Import runs in resumable chunks, is idempotent, records failures, and returns failed clusters to `unused`
- [ ] **Step 8:** `/api/cron/generation` rejects requests without `CRON_SECRET`
- [ ] **Step 9:** Hero images are generated outside the import, in capped retrying chunks, stored in R2 with alt text in the domain's language, attached once, and render on the article page
- [ ] **Step 10:** Failed clusters can be resubmitted from a batch and produce exactly one post
- [ ] **Step 11:** `getReadiness` reports missing fields for both templates, with passing tests
- [ ] **Step 12:** A real end-to-end run produced native-language posts on two domains, and actual token cost was reported against the spec estimate
