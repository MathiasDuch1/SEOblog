# Phase 05 — Keyword Research

## Goal

Keyword clusters are created from Semrush data instead of by hand. A research run pulls keyword data for a seed topic from the Semrush regional database of the domain's country, so each country domain is researched independently in its own language. Raw results are stored so Semrush API units are never spent twice on the same query. Keywords are grouped into clusters, each with a primary keyword and a suggested template, and duplicates of existing clusters for that domain are flagged. Clusters are saved as `unused`, ready for phase 03's generation. Everything is exposed as server functions that phase 06's SEO interface calls.

## Prerequisites

- Phases 01 and 03 checked off, except phase 03's deferred items (step 5's real affiliate feed and step 9's hero images). Clustering uses the phase 03 Anthropic client.
- Decision recorded: **Semrush plan with API access and purchased API units**. Every call consumes units, so development uses small `display_limit` values.
- `SEMRUSH_API_KEY` available.

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — Server Actions with server-side auth checks, no client components (the UI is phase 06).
- `claude-api` (built-in) — load it before writing the clustering call (step 4).

## Steps

1. **Link each domain to its Semrush database.** Add `semrushDatabase` (required text) to Domains: the Semrush regional database code for that domain's country (e.g. `us`, `dk` — confirm the exact codes against the Semrush docs). A `beforeValidate` hook warns if the database obviously mismatches the domain's `locale` country, using a small mapping in `src/lib/semrush/databases.ts`. Update the seed script (Alpha `us`, Beta `dk`, Gamma `us`), regenerate types, and add a migration.
   **Verify:** saving Beta with `semrushDatabase: 'dk'` succeeds, saving Beta with an empty value fails, and a migration exists.

2. **Build the Semrush client.** `src/lib/semrush/client.ts` (server-only):
   - A thin wrapper over the Semrush Analytics API. **Before implementing, confirm the exact report types, parameters, and export columns against the current Semrush API docs.** The expected reports are keyword overview (`phrase_this`), related keywords (`phrase_related`), broad match (`phrase_fullsearch`), questions (`phrase_questions`), and keyword difficulty (`phrase_kdi`).
   - Parse Semrush's semicolon-separated responses into typed rows: `keyword`, `searchVolume`, `cpc`, `competition`, `keywordDifficulty`, `intent` where available. Detect Semrush's error responses, which come back as text bodies like `ERROR 50 :: NOTHING FOUND`, and throw typed errors for them.
   - Every call takes an explicit `displayLimit` and logs estimated units consumed.
   - Throttle to stay under Semrush's rate limit.
   - Add `SEMRUSH_API_KEY` to `.env.example`.
   **Verify:** `vitest` tests parse recorded fixture responses, including an error response, without calling the API. A live script fetching `phrase_related` for one seed keyword with `displayLimit: 10` prints 10 typed rows and the units used. If the key isn't available yet, say so and leave the live box unchecked.

3. **Store research runs.** New collection `keyword-research-runs` (logged-in users only):
   - Fields: `domain`, `semrushDatabase` (copied from the domain at run time), `seedKeywords[]` (in the domain's language), `reports[]` (which Semrush reports ran), `rows` (JSON array of typed rows, deduped by normalized keyword), `unitsUsed`, `status` (`running` | `complete` | `failed`), `error`.
   - `src/lib/keywords/research.ts` → `runResearch({ domainId, seedKeywords, limitPerReport })` queries the domain's `semrushDatabase`. Seeds belong to the domain's niche, and the same seed topic is normally researched once per country domain in that niche, because Semrush databases are per country — keyword data is never shared between countries, only the topic is. It reuses a `complete` run with identical inputs (same database, seeds, and limits) from the last 30 days instead of calling Semrush again, unless `force: true`.
   - This collection isn't in spec §4. Report it as a deviation in the wrap-up.
   **Verify:** two identical `runResearch` calls hit Semrush once — the second returns the cached run, with `unitsUsed` unchanged and no new API calls logged — and the run doc shows deduped rows.

4. **Cluster keywords.** `src/lib/keywords/cluster.ts` → `clusterKeywords(runId)`:
   - Semrush's public API doesn't expose its keyword-clustering tool (confirm this against the docs in step 2; if it does, prefer it and adapt this step). Clustering is done with one standard (non-batch) Claude call, since it's interactive, using `GENERATION_MODEL` and structured output.
   - Input: the run's rows (keyword, volume, KD, intent), the domain name, its niche name and description (from `domain.niche`), and the domain `locale`. Cluster names and rationales are written in the domain's language so editors reviewing that domain read them naturally.
   - Output (zod-validated): `clusters[]` with `clusterName`, `primaryKeyword` (must be one of the input keywords), `keywords[]` (subset of input, each keyword in at most one cluster), `suggestedTemplate` (`listicle` for commercial "best/top/vs" intent, `informational` for how-to/what/why intent), and `rationale` (one sentence).
   - Post-validation in code, not just the prompt: drop keywords not in the input, remove any keyword assigned to more than one cluster, and drop clusters left with no keywords.
   **Verify:** a `vitest` test of the post-validation rules with a fixture model output that has an invented keyword and a duplicate assignment. A live run over a real research run returns clusters where every keyword came from the run and no keyword appears twice.

5. **Detect cannibalization.** `src/lib/keywords/dedupe.ts` → `findConflicts(domainId, clusters)`. It flags a proposed cluster whose normalized primary keyword matches, or whose keyword set overlaps ≥ 50% with, an existing `keyword-clusters` doc for the same domain in any status, or a post's `meta.title` keyword. Normalization is lowercase, trimmed, with stop-words removed, using a stop-word list for the domain's language. Singularization is English-only and skipped for other languages. Other domains are ignored — separate country domains are allowed to target the same topic (spec §4).
   **Verify:** `vitest` tests: "best tarot decks" conflicts with an existing "best tarot deck" cluster on Alpha (`en-US`), the same cluster on Gamma (`en-US`, another domain) doesn't conflict, "bedste tarotkort" conflicts with an existing "de bedste tarotkort" cluster on Beta (`da-DK`), and a 60% keyword overlap is flagged.

6. **Extend and persist KeywordClusters.** Add `primaryKeyword`, `suggestedTemplate`, `researchRun` (relationship), and per-keyword `searchVolume`, `keywordDifficulty`, `cpc`, `intent`. `targetTemplate` defaults to `suggestedTemplate` but stays editable. `src/lib/keywords/saveClusters.ts` → `saveClusters({ runId, clusters, targetDomainId })` creates `unused` clusters and refuses any that `findConflicts` flags, unless `allowConflict: true` is passed per cluster. Regenerate types and add a migration.
   **Verify:** saving the step 4 output creates `unused` clusters linked to the run with metrics filled and `targetDomain` set to the run's domain, a conflicting cluster is refused with a reason, and a migration exists.

7. **Add Server Actions for phase 06.** `src/lib/keywords/actions.ts` with `'use server'` exports `runResearchAction`, `clusterKeywordsAction`, `saveClustersAction`, and `updateClusterAction` (rename, edit keywords, change target template, only while `unused`). Each action:
   - authenticates on the server via `payload.auth({ headers: await headers() })` and throws if there's no user,
   - validates its input with zod,
   - returns serializable results only (no Payload docs with internal fields).
   **Verify:** a script-level or `vitest` test calls each action's inner function with and without a user: unauthenticated calls throw, invalid input throws a zod error, and valid calls succeed. `updateClusterAction` on an `assigned` cluster is refused.

8. **Run an end-to-end research flow.** Script `npm run research -- --domain <betaId> --seeds "tarotkort" --limit 20`: research against Beta's `dk` database → cluster → conflicts → save. Then generate one of the resulting clusters through phase 03's `npm run generate`.
   **Verify:** the script saves real Danish-language clusters for Beta from live Semrush data and reports units used. One saved cluster successfully produces a Danish draft post on Beta through phase 03's pipeline. If Semrush access isn't available, say so and leave the box unchecked.

## Out of scope

- Any admin UI for research, cluster review, or bulk generation (phase 06).
- Automatic recurring research runs.
- SERP scraping or rank tracking.

## Acceptance Checklist

- [ ] **Step 1:** Each domain has a required Semrush database for its country, with a migration
- [ ] **Step 2:** The Semrush client parses fixture responses and error bodies in tests
- [ ] **Step 2:** A live Semrush call returns typed rows and logs units used
- [ ] **Step 3:** Research runs are stored, and identical requests within 30 days reuse the stored run without spending units
- [ ] **Step 4:** Clustering returns validated clusters using only input keywords, each keyword in at most one cluster
- [ ] **Step 5:** Cannibalization detection flags same-domain duplicates and overlaps using language-aware normalization, and ignores other domains
- [ ] **Step 6:** Clusters persist as `unused` with metrics, suggested template, target domain, and run link; conflicts are refused unless allowed
- [ ] **Step 7:** Keyword Server Actions require an authenticated user, validate input, and refuse edits to non-`unused` clusters
- [ ] **Step 8:** A live research → cluster → save → generate flow produced a native-language draft post on a country domain from that country's Semrush data
