# Phase 05 — Keyword Research

## Goal

Keyword clusters are created from DataForSEO data instead of by hand. A research run pulls keyword data for a seed topic from DataForSEO Labs, scoped to the location and language of the domain's country, so each country domain is researched independently in its own language. Each keyword comes back with search volume, CPC, keyword difficulty, search intent, and DataForSEO's `core_keyword` synonym grouping. Raw results are stored so no request is paid for twice. Keywords are grouped into article clusters, each with a primary keyword and a suggested template, and duplicates of existing clusters for that domain are flagged. Clusters are saved as `unused`, ready for phase 03's generation. Everything is exposed as server functions that phase 06's SEO interface calls.

## Prerequisites

- Phases 01 and 03 checked off, except phase 03's deferred items (step 5's real affiliate feed and step 9's hero images). Clustering uses the phase 03 Anthropic client.
- Decision recorded: **DataForSEO account** (pay-as-you-go balance). Development and tests use the free sandbox (`https://sandbox.dataforseo.com`), which returns dummy data in the same response shape; only the live verifications spend balance.
- DataForSEO API login and API password (from the dashboard's API access page — the API password differs from the account password).

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — Server Actions with server-side auth checks, no client components (the UI is phase 06).
- `claude-api` (built-in) — load it before writing the clustering call (step 4).

## Key API facts (confirm against docs.dataforseo.com before relying on them)

- Base URL `https://api.dataforseo.com/v3/`, sandbox `https://sandbox.dataforseo.com/v3/`. HTTP Basic auth with the API login and API password.
- Requests are `POST` with a JSON **array** of tasks. Live endpoints return results in the same response.
- Every response has a top-level `status_code` (`20000` = OK) and `cost` (USD), and each task has its own `status_code`, `status_message`, and `cost`. A request can succeed while an individual task fails.
- Locations and languages are `location_code` + `language_code` (e.g. United States `2840` / `en`, Denmark `2208` / `da`). Confirm codes with `dataforseo_labs/locations_and_languages`.
- Labs keyword endpoints used here: `dataforseo_labs/google/related_keywords/live`, `keyword_suggestions/live`, and `keyword_ideas/live`. Their items include `keyword_info` (`search_volume`, `cpc`, `competition`), `keyword_properties` (`keyword_difficulty`, `core_keyword`, `synonym_clustering_algorithm`), and `search_intent_info` (`main_intent`).
- `core_keyword` groups **close variants of the same query** (e.g. singular/plural). It is not a topic clustering of different queries into articles, which is why step 4 still clusters with Claude.
- Pricing is per task plus per returned item (about $0.012 per task and $0.00012 per item for these endpoints at the time of writing). Rate limit: 2,000 calls per minute.

## Steps

1. **Link each domain to its DataForSEO location and language.** Add a `dataforseo` group to Domains: `locationCode` (required number) and `languageCode` (required text). A `beforeValidate` hook rejects a `languageCode` that doesn't match `languageOf(domain.locale)`, and warns when `locationCode` doesn't match the locale's country, using a small mapping in `src/lib/dataforseo/locations.ts`. Update the seed script (Alpha `2840`/`en`, Beta `2208`/`da`, Gamma `2840`/`en`), regenerate types, and add a migration.
   **Verify:** saving Beta with `2208`/`da` succeeds, saving Beta with an empty location fails, saving Beta with `languageCode: 'en'` fails, and a migration exists.

2. **Build the DataForSEO client.** `src/lib/dataforseo/client.ts` (server-only):
   - A thin typed wrapper over the Labs keyword endpoints listed above. **Before implementing, confirm the exact request parameters and response fields against the current DataForSEO docs.**
   - Map each item into a typed row: `keyword`, `searchVolume`, `cpc`, `competition`, `keywordDifficulty`, `intent`, `coreKeyword`.
   - Check the top-level and per-task `status_code`, and throw typed errors that carry the status message for any non-`20000` code.
   - Every call takes an explicit `limit`, returns the reported `cost`, and logs it.
   - Throttle to stay under the rate limit.
   - Add `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, and `DATAFORSEO_BASE_URL` (sandbox URL in development) to `.env.example`.
   **Verify:** `vitest` tests parse recorded fixture responses, including a failed task inside a successful response, without calling the API. A sandbox call returns typed rows and a cost of 0. A live script fetching `related_keywords` for one seed keyword on Beta's location with `limit: 10` prints 10 typed rows with Danish keywords and the cost. If credentials aren't available yet, say so and leave the live box unchecked.

3. **Store research runs.** New collection `keyword-research-runs` (logged-in users only):
   - Fields: `domain`, `locationCode` and `languageCode` (copied from the domain at run time), `seedKeywords[]` (in the domain's language), `endpoints[]` (which Labs endpoints ran), `rows` (JSON array of typed rows, deduped by normalized keyword), `costUsd`, `status` (`running` | `complete` | `failed`), `error`.
   - `src/lib/keywords/research.ts` → `runResearch({ domainId, seedKeywords, limitPerEndpoint })` queries with the domain's location and language. Seeds belong to the domain's niche, and the same seed topic is normally researched once per country domain in that niche, because DataForSEO data is per location — keyword data is never shared between countries, only the topic is. It reuses a `complete` run with identical inputs (same location, language, seeds, and limits) from the last 30 days instead of calling DataForSEO again, unless `force: true`.
   - This collection isn't in spec §4. Report it as a deviation in the wrap-up.
   **Verify:** two identical `runResearch` calls hit DataForSEO once — the second returns the stored run, with `costUsd` unchanged and no new API calls logged — and the run doc shows deduped rows.

4. **Cluster keywords.** `src/lib/keywords/cluster.ts` → `clusterKeywords(runId)`:
   - First collapse close variants in code: rows sharing a `core_keyword` become one entry, represented by the variant with the highest search volume, with the other variants attached as supporting keywords.
   - Then group the collapsed entries into article clusters with one standard (non-batch) Claude call, since it's interactive, using `GENERATION_MODEL` and structured output. DataForSEO's `core_keyword` only merges variants of one query, so this step decides which different queries one article should cover.
   - Input: the collapsed entries (keyword, variants, volume, KD, intent), the domain name, its niche name and description (from `domain.niche`), and the domain `locale`. Cluster names and rationales are written in the domain's language so editors reviewing that domain read them naturally.
   - Output (zod-validated): `clusters[]` with `clusterName`, `primaryKeyword` (must be one of the input keywords), `keywords[]` (subset of input, each keyword in at most one cluster), `suggestedTemplate`, and `rationale` (one sentence). DataForSEO's `main_intent` guides the template: `commercial`/`transactional` → `listicle`, `informational` → `informational`.
   - Post-validation in code, not just the prompt: drop keywords not in the input, remove any keyword assigned to more than one cluster, re-attach each kept keyword's variants, and drop clusters left with no keywords.
   **Verify:** `vitest` tests of the variant collapse and of the post-validation rules, with a fixture model output that has an invented keyword and a duplicate assignment. A live run over a real research run returns clusters where every keyword came from the run, no keyword appears twice, and variants of one `core_keyword` never land in different clusters.

5. **Detect cannibalization.** `src/lib/keywords/dedupe.ts` → `findConflicts(domainId, clusters)`. It flags a proposed cluster whose primary keyword matches an existing `keyword-clusters` doc for the same domain in any status — by stored `core_keyword` or by normalized text — or whose keyword set overlaps ≥ 50% with one, or that matches a post's `meta.title` keyword. Normalization is lowercase, trimmed, with stop-words removed, using a stop-word list for the domain's language. Other domains are ignored — separate country domains are allowed to target the same topic (spec §4).
   **Verify:** `vitest` tests: "best tarot decks" conflicts with an existing "best tarot deck" cluster on Alpha (`en-US`) through their shared `core_keyword`, the same cluster on Gamma (`en-US`, another domain) doesn't conflict, "bedste tarotkort" conflicts with an existing "de bedste tarotkort" cluster on Beta (`da-DK`) through normalization, and a 60% keyword overlap is flagged.

6. **Extend and persist KeywordClusters.** Add `primaryKeyword`, `coreKeyword`, `suggestedTemplate`, `researchRun` (relationship), and per-keyword `searchVolume`, `keywordDifficulty`, `cpc`, `intent`. `targetTemplate` defaults to `suggestedTemplate` but stays editable. `src/lib/keywords/saveClusters.ts` → `saveClusters({ runId, clusters, targetDomainId })` creates `unused` clusters with `source: 'dataforseo'` and refuses any that `findConflicts` flags, unless `allowConflict: true` is passed per cluster. Regenerate types and add a migration.
   **Verify:** saving the step 4 output creates `unused` DataForSEO clusters linked to the run with metrics filled and `targetDomain` set to the run's domain, a conflicting cluster is refused with a reason, and a migration exists.

7. **Add Server Actions for phase 06.** `src/lib/keywords/actions.ts` with `'use server'` exports `runResearchAction`, `clusterKeywordsAction`, `saveClustersAction`, and `updateClusterAction` (rename, edit keywords, change target template, only while `unused`). Each action:
   - authenticates on the server via `payload.auth({ headers: await headers() })` and throws if there's no user,
   - validates its input with zod,
   - returns serializable results only (no Payload docs with internal fields).
   **Verify:** a script-level or `vitest` test calls each action's inner function with and without a user: unauthenticated calls throw, invalid input throws a zod error, and valid calls succeed. `updateClusterAction` on an `assigned` cluster is refused.

8. **Run an end-to-end research flow.** Script `npm run research -- --domain <betaId> --seeds "tarotkort" --limit 20`: research against Beta's Danish location and language → cluster → conflicts → save. Then generate one of the resulting clusters through phase 03's `npm run generate`.
   **Verify:** the script saves real Danish-language clusters for Beta from live DataForSEO data and reports the cost. One saved cluster successfully produces a Danish draft post on Beta through phase 03's pipeline. If DataForSEO access isn't available, say so and leave the box unchecked.

## Out of scope

- Any admin UI for research, cluster review, or bulk generation (phase 06).
- Automatic recurring research runs.
- SERP scraping or rank tracking.
- The DataForSEO MCP server. It is useful for ad-hoc research from an AI assistant, but the pipeline calls the REST API directly so research is deterministic, cached, and cost-tracked.

## Acceptance Checklist

- [x] **Step 1:** Each domain has a required DataForSEO location and language matching its locale, with a migration
- [x] **Step 2:** The DataForSEO client parses fixture responses and failed tasks in tests, and works against the sandbox
- [x] **Step 2:** A live DataForSEO call returns typed rows in the domain's language and reports its cost
- [x] **Step 3:** Research runs are stored, and identical requests within 30 days reuse the stored run without new API cost
- [x] **Step 4:** Clustering collapses `core_keyword` variants and returns validated clusters using only input keywords, each keyword in at most one cluster
- [x] **Step 5:** Cannibalization detection flags same-domain duplicates and overlaps using `core_keyword` and language-aware normalization, and ignores other domains
- [x] **Step 6:** Clusters persist as `unused` DataForSEO clusters with metrics, suggested template, target domain, and run link; conflicts are refused unless allowed
- [x] **Step 7:** Keyword Server Actions require an authenticated user, validate input, and refuse edits to non-`unused` clusters
- [x] **Step 8:** A live research → cluster → save → generate flow produced a native-language draft post on a country domain from that country's DataForSEO data
