# Phase 03 — Content Generation Pipeline

## Goal

Approved keyword clusters become fully populated `Post` documents through Claude's Message Batches API. Each cluster produces one post, with every target locale's content written into that same document. Listicles use real product data (titles, images, affiliate URLs) from an affiliate product source. Each post gets an AI-generated hero image stored in R2.

At production volume — a month of content for several domains — imports and image generation run in resumable chunks that fit inside serverless function time limits. Every batch is tracked, imports are idempotent, failures are recorded, and missing locales of an existing post can be regenerated on their own. This phase runs from scripts; the admin UI for it is phase 06.

## Prerequisites

- Phases 01 and 02 fully checked off.
- `ANTHROPIC_API_KEY` for an organization with Batch API access.
- Decision recorded: **affiliate network** with product feed/API credentials. The pipeline also ships a `mock` product source, so everything except the real-feed checklist item can be verified without one.
- **Affiliate terms review** (record findings in `00-overview.md`). Read the network's operating agreement for:
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

2. **Add target locales, link posts to clusters, and add batch tracking.**
   - `KeywordClusters.targetLocales` — `select`, `hasMany`, validated as a subset of the target domain's `activeLocales`, defaulting to all of them. This is spec §5.1's per-cluster locale choice.
   - `Posts.sourceCluster` — relationship → `keyword-clusters`, unique, admin read-only. This is how an import finds the post a cluster already produced.
   - `Posts.targetLocales` — copied from the cluster when the post is created, editable. Readiness (step 11) and scheduling (phase 04) check these locales, not every locale the domain has.
   - New collection `generation-batches`, logged-in users only. Fields: `anthropicBatchId` (unique), `kind` (`new` | `regenerate`), `status` (`submitted` | `in_progress` | `ended` | `importing` | `imported` | `failed`), `domain`, `autoSchedule` (checkbox, used in phase 06), `requests[]` (`customId`, `cluster`, `post`, `locale`, `importState`: `pending` | `imported` | `errored`, `error`, `inputTokens`, `outputTokens`), `productSnapshot` (JSON: the product list per cluster that the model saw), `submittedAt`, `endedAt`, `importedAt`, `requestCounts` (group).
   - `generation-batches` isn't in spec §4. Report it as a deviation in the wrap-up.
   - Regenerate types, create a migration, and update the seed script.
   **Verify:** `targetLocales` rejects `de` on a Beta cluster. `generation-batches` appears in the admin sidebar and is denied to anonymous REST requests. `tsc --noEmit` passes, and a new migration file exists.

3. **Define output schemas.** `src/lib/ai/schemas.ts` contains zod schemas for one locale's generated content:
   - **Listicle:** `slug` (kebab-case, in the target language), `intro`, `products[]` (`productRef` echoing the input product id, `title`, `description`), `summary`, `meta` (`title` ≤ 60 chars, `description` ≤ 160 chars).
   - **Informational:** `slug`, `intro`, `sections[]` (`heading`, `paragraphs[]`, optional `links[]` with `text` + `productRef`), `summary`, `meta`.
   Build the JSON schema for `output_config.format` from these zod schemas. Check with the `claude-api` skill whether the SDK's zod helper serializes correctly inside batch `params`; if not, pass `{ type: 'json_schema', schema }` built from `z.toJSONSchema`. On import, parse the text and validate with the **same** zod schema.
   **Verify:** `vitest` tests pass for a valid fixture and fail with clear errors for an over-long `meta.title`, a missing product, and a non-kebab slug.

4. **Convert sections to Lexical.** `src/lib/ai/toLexical.ts` converts `sections[]` into valid Lexical editor state JSON: `heading` nodes (h2), `paragraph` nodes, and link nodes for `links[]`. A `productRef` link resolves to that product's localized affiliate URL.
   **Verify:** a `vitest` test converts a fixture. Saving the result into an informational post's `body` through the Local API succeeds, and the phase 02 template renders it with correct headings and links.

5. **Build the affiliate product source.** `src/lib/affiliate/types.ts` defines `ProductSource.findProducts({ keywords, locale, limit })`, which returns `{ id, title, imageUrl, affiliateUrlByLocale, price?, currency? }[]`. Implementations:
   - `mock.ts` — deterministic fake products with placeholder images on an allowed remote host.
   - `<network>.ts` — the chosen affiliate network, credentials from env.
   A `getProductSource()` factory picks one via `AFFILIATE_SOURCE=mock|<network>`. Product images always come from the source — never generated.

   Apply the terms review:
   - If product images may not be proxied or cached, render those hosts with `next/image`'s `unoptimized` prop in the phase 02 listicle template.
   - Otherwise add them to `images.remotePatterns`.
   - Prices are not stored or displayed unless the terms allow it and a refresh mechanism exists.
   **Verify:** a script prints 5 products for a test keyword with `AFFILIATE_SOURCE=mock`. With the real network configured, it prints real products whose `imageUrl` returns 200 and whose affiliate URLs contain the partner tag, and the listicle renders them in line with the terms. If there are no credentials yet, say so and leave the real-feed box unchecked.

6. **Write the prompt builders.** Put them in `src/lib/ai/prompts/{listicle,informational}.ts`.
   - The **system prompt** is byte-identical across every request of a template, with no dates, IDs, or per-request data, and ends with a `cache_control` breakpoint so the shared prefix is cached across the batch. It covers voice, SEO writing rules, the output shape, and grounding rules: describe only facts present in the supplied product data, never invent specs, prices, or ratings, and write natively in the target language rather than translating.
   - The **user message** carries the per-request data: domain name, locale/language, primary keyword + supporting keywords, the template's target length, and, for listicles, the product list with `productRef` ids.
   **Verify:** a `vitest` test asserts the system prompt is identical for two different clusters/locales, and a snapshot test pins one rendered user message per template.

7. **Assemble and submit a batch.** `src/lib/generation/submitBatch.ts` → `submitBatch({ clusterIds, localesOverride? })`:
   - Load clusters and reject any whose status isn't `unused`.
   - Locales per cluster are `localesOverride ?? cluster.targetLocales`.
   - Listicles: fetch products once per cluster from `getProductSource()`, and store the list in `productSnapshot` so every locale — and any later regeneration — describes the same products in the same order.
   - One request per cluster × locale, with `custom_id = c{clusterId}_{locale}`. Params: `model: GENERATION_MODEL`, `max_tokens: 16000`, `thinking: { type: 'adaptive' }`, `output_config: { effort: GENERATION_EFFORT, format: … }`, and the system and user prompts from step 6.
   - If the request count exceeds the API limits (step "Key API facts"), split into several batches.
   - Create the `generation-batches` doc(s) and set the clusters to `assigned` **after** the API accepts the batch. If submission throws, nothing changes.
   - Script: `npm run generate -- --clusters <id,id> [--locales en,de]` (`payload run src/scripts/generate.ts`).
   **Verify:** with the mock product source, 2 clusters (one per template, both targeting `en` + `de`) plus a third targeting only `en` create one batch with 5 requests. The batch doc has 5 `pending` rows and a product snapshot, and all three clusters are `assigned`.

8. **Poll and import results in resumable chunks.** `src/lib/generation/importBatch.ts` → `importBatch(batchDocId, { maxRows = IMPORT_CHUNK_SIZE })`:
   - Retrieve the batch and update `status` / `requestCounts`. Stop if it hasn't `ended`.
   - Stream results and key them by `custom_id`. Skip rows already `imported` or `errored`. Process at most `maxRows` pending rows per call, then return `{ remaining }`. The next call continues where this one stopped, so an import of thousands of rows spreads across cron runs.
   - `succeeded`: parse and validate with zod. Find the post by `sourceCluster`, or create it (`domain`, `template`, `targetLocales`, `status: draft`, `sourceCluster`). Write this locale with `payload.update({ id, locale, data })`.
   - **Listicle product rows** (the array isn't localized): the first imported locale creates the rows from `productSnapshot` in order, with `imageUrl` + that locale's `title` / `description` / `affiliateUrl`. Later locales must send the **existing row `id`s** in the same order, or Payload replaces the rows and wipes the other locales' values.
   - **Informational:** convert `sections` with `toLexical`.
   - Write `meta` from the output.
   - Record `usage.input_tokens` / `output_tokens` on the request row.
   - `errored` / `expired` / `canceled`: record the error on the row.
   - When no rows are `pending`:
     - a cluster with at least one imported locale becomes `used`
     - a cluster with none goes back to `unused`, and its post, if created, becomes `failed`
     - the batch becomes `imported` with `importedAt`
   - Script: `npm run generation:poll` loops `importBatch` until every non-imported batch has `remaining: 0`.
   - Route: `GET /api/cron/generation` (`src/app/api/cron/generation/route.ts`, `dynamic = 'force-dynamic'`, `maxDuration` set explicitly) processes one chunk per non-imported batch, then runs step 9's image chunk, then returns. It requires `Authorization: Bearer ${CRON_SECRET}`, compared in constant time.
   - Add `CRON_SECRET` and `IMPORT_CHUNK_SIZE` (default 50) to `.env.example`.
   - The route is reachable only on the admin host (phase 02 proxy). Scheduling it is phase 07.
   **Verify:**
   - After the step 7 batch ends, `generation:poll` creates 3 posts: the two bilingual posts with `en` + `de` content, and the third with `en` only.
   - On the listicle, the `en` product titles are still intact after `de` was imported, and product order matches the snapshot.
   - With `IMPORT_CHUNK_SIZE=2`, three calls to the cron route are needed to finish, and no row is imported twice.
   - A further `generation:poll` changes nothing.
   - The cron route returns 401 without the secret.

9. **Generate hero images in resumable chunks.** `src/lib/images/types.ts` defines `ImageProvider.generate({ prompt, aspectRatio })`, which returns `{ bytes, mimeType }`, with a `fal.ts` (or the chosen provider) implementation and a `mock.ts` that returns a generated placeholder. `attachHeroImages({ limit = IMAGE_CHUNK_SIZE })`:
   - Finds posts with at least one imported locale and no `featuredImage`, oldest first, up to `limit`.
   - Per post, builds the prompt from the primary keyword and the first available locale's intro: editorial photography style, no text, logos, watermarks, or recognizable branded products.
   - Uploads the bytes via `payload.create({ collection: 'media', data: { alt }, file })` so they land in R2, then sets `featuredImage`.
   - A provider failure on one post is logged, and that post is retried on the next run, capped at 3 attempts (tracked in a `heroImageAttempts` field). It never fails the batch or changes post status.
   - Image generation is **not** done inline during import, so a large import can't time out waiting on the image API.
   - Add `IMAGE_PROVIDER` and `IMAGE_CHUNK_SIZE` (default 10) to `.env.example`.
   **Verify:** with the real provider, an imported post gets a `featuredImage` stored in R2 that renders on the phase 02 article page. Re-running doesn't create a second media doc. With `IMAGE_CHUNK_SIZE=1` and 3 imageless posts, three runs attach all three. A forced provider error stops retrying after 3 attempts. With `IMAGE_PROVIDER=mock`, the flow works offline.

10. **Regenerate missing locales.** `src/lib/generation/regenerate.ts` → `submitRegeneration({ postIds, locales? })`:
    - For each post, the locales to generate are `locales ?? (post.targetLocales minus locales that already have content)`.
    - Build requests from the post's `sourceCluster` and, for listicles, the product list the post already has (row order and `imageUrl`), so new locales line up with existing product rows. Use `custom_id = p{postId}_{locale}`.
    - Create a `generation-batches` doc with `kind: 'regenerate'`.
    - `importBatch` handles `p…` custom ids by updating that post directly, writing only the requested locale and never touching other locales' values.
    - Script: `npm run regenerate -- --posts <id> [--locales de]`.
    **Verify:** on a post whose `de` request failed (simulated by clearing its `de` fields), `regenerate` submits one request. After import, `de` is filled, `en` is byte-for-byte unchanged, and the product rows keep their ids and order.

11. **Validate readiness.** `src/lib/generation/readiness.ts` → `getReadiness(post)` returns, for each of the post's `targetLocales`, whether it is complete — `slug`, `intro`, `summary`, `meta.title`, plus every product's `title` + `affiliateUrl` (listicle) or `body` (informational) — and whether `featuredImage` is set. Phases 04 and 06 use this.
    **Verify:** `vitest` tests cover a complete post, a post missing `de`, a post whose `targetLocales` is only `en` on an `en` + `de` domain (counts as complete), and a listicle missing one product's `affiliateUrl` in one locale.

12. **Run an end-to-end dry run with the real API.** Use 2 real (hand-made) clusters — one listicle, one informational — × the Alpha domain's locales, with the real Anthropic API. Use the real affiliate source if available, otherwise mock. Run it through `generate` → wait → `generation:poll`.
    **Verify:** both posts render correctly on `alpha.localhost` in every locale after temporarily setting them to `published`, then setting them back to `draft`. The German text reads as native German. Listicle products match the feed data. Report the total input and output tokens and the computed cost at batch pricing against spec §8's ~$0.012 per post-locale estimate.

## Out of scope

- Assigning `scheduledAt`, publishing, and revalidation on publish (phase 04).
- Scheduling the cron routes on a real host (phase 07).
- Semrush and automatic cluster creation (phase 05). Clusters in this phase are created by hand in the admin.
- Any admin UI for submitting batches, regenerating, or reviewing results (phase 06).

## Acceptance Checklist

- [ ] **Step 1:** Anthropic SDK, zod, and vitest are installed, and a server-only client reaches the configured model
- [ ] **Step 2:** Clusters and posts have validated `targetLocales`, posts have a unique `sourceCluster`, and an admin-only `generation-batches` collection exists with a migration
- [ ] **Step 3:** Zod output schemas for both templates exist, with passing validation tests
- [ ] **Step 4:** Generated sections convert to Lexical JSON that saves and renders on the frontend
- [ ] **Step 5:** The product source abstraction works with the `mock` source
- [ ] **Step 5:** The real affiliate network source returns real products, rendered in line with the recorded terms review
- [ ] **Step 6:** System prompts are byte-identical across requests with a cache breakpoint, and user-message snapshots are pinned
- [ ] **Step 7:** `npm run generate` submits one request per cluster × target locale, snapshots products, and marks clusters `assigned` only after acceptance
- [ ] **Step 8:** Import writes every locale into one post per cluster without wiping other locales' product values
- [ ] **Step 8:** Import runs in resumable chunks, is idempotent, records failures, and ends clusters as `used` or back to `unused`
- [ ] **Step 8:** `/api/cron/generation` rejects requests without `CRON_SECRET`
- [ ] **Step 9:** Hero images are generated outside the import, in capped retrying chunks, stored in R2, attached once, and render on the article page
- [ ] **Step 10:** Missing locales of an existing post can be regenerated without changing other locales or product rows
- [ ] **Step 11:** `getReadiness` reports completeness against the post's `targetLocales`, with passing tests
- [ ] **Step 12:** A real end-to-end run produced correct posts in every locale, and actual token cost was reported against the spec estimate
