# Phase 04 — Scheduling & Publishing

## Goal

Ready drafts get jittered publish slots — by default 10 per day per domain across the 08:00–23:30 window in that domain's country timezone, a month ahead. A cron-callable dispatcher publishes due posts exactly once, revalidates the affected post, listing, and sitemap using the phase 02 tag contract, and builds IndexNow submissions per domain. Editor changes to live posts show up on the site immediately. Changing a live slug creates a permanent redirect on that domain, so indexed URLs never break. Everything is verified locally; wiring the real cron and live IndexNow happens in phase 07.

## Prerequisites

- Phases 01–03 checked off, except phase 03's deferred items (step 5's real affiliate feed and step 9's hero images).
- `CRON_SECRET` set (phase 03).

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — route handlers and revalidation. All logic is server-only, with no client components.

Read these bundled Next.js 16 docs before steps 5–7. `revalidateTag` now takes a cache-life profile, and the choice decides whether a newly published URL is fresh on its first request:
- `node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md`
- the `revalidateTag`, `revalidatePath`, and `permanentRedirect` API reference pages under `node_modules/next/dist/docs/01-app/03-api-reference/`

## Interpretation of the spec (report in the wrap-up)

- Spec §7's "30 days × 10 posts per domain" means each country domain has its own independent slot calendar. Adding a domain adds 10 slots per day; domains never share slots.
- Each domain's 08:00–23:30 window is in its own timezone. This phase adds `Domain.timezone`.
- Spec §7 mentions optionally submitting to Google's URL Inspection API. That API only reports index status; it can't request indexing. Google discovery relies on the sitemap submitted in Search Console (phase 07). This phase implements IndexNow only.

## Steps

1. **Add scheduling settings to Domains.**
   - `timezone` — IANA name (e.g. `Europe/Copenhagen` for a Danish domain), required with no default so each country's timezone is set deliberately, validated with `Intl.supportedValuesOf('timeZone')`.
   - `schedule` group: `postsPerDay` (default 10), `windowStart` (default `08:00`), `windowEnd` (default `23:30`), `jitterMinutes` (default 8, allowed 5–10).
   - `indexNowKey` — 32 hex chars, generated in a `beforeChange` hook on create, admin read-only.
   Regenerate types, add a migration, and update the seed script: Alpha `America/New_York`, Beta `Europe/Copenhagen`, Gamma `America/Los_Angeles` (Alpha and Gamma share a country and locale, so different US timezones keep their calendars distinguishable).
   **Verify:** a new domain gets a valid `indexNowKey` and the defaults above, an invalid timezone is rejected on save, and a migration file exists.

2. **Write the slot algorithm.** `src/lib/scheduling/slots.ts` exports a pure function `computeDailySlots({ date, timezone, postsPerDay, windowStart, windowEnd, jitterMinutes, random })`, which returns UTC `Date`s:
   - Base interval = window length ÷ (postsPerDay − 1), ≈ 103 minutes for the defaults.
   - Apply independent uniform jitter in ±`jitterMinutes` to **every** slot, then clamp to the window and keep slots strictly increasing.
   - Window times are wall-clock times in the domain's timezone, so DST days still start at 08:00 local.
   - `random` is injectable so tests are deterministic.
   **Verify:** `vitest` tests pass for:
   - defaults → 10 slots, all within 08:00–23:30 local, strictly increasing
   - two different seeds → different slot times
   - no slot is exactly on the un-jittered base time for a seeded run
   - EU and US spring-forward and fall-back dates (`Europe/Copenhagen` and `America/New_York`) → first slot ≥ 08:00 local and last ≤ 23:30 local
   - the same date in `Europe/Copenhagen` and `America/New_York` → different UTC slot times
   - `postsPerDay: 1` doesn't divide by zero

3. **Enforce readiness.** A `beforeChange` hook on Posts blocks setting `status` to `scheduled` or `published` unless `getReadiness` (phase 03) reports `ready`. It throws a validation error listing the missing fields. Setting `scheduled` also requires `scheduledAt`. Setting `published` without `publishedAt` fills it with now. Update the seed script so every seeded published or scheduled post satisfies readiness.
   **Verify:** in the admin, scheduling a post with an empty `summary` fails with a message naming `summary`. After filling it, scheduling succeeds. `npm run seed` still succeeds on a fresh database.

4. **Assign slots to drafts.** `src/lib/scheduling/scheduleDrafts.ts` → `scheduleDrafts({ domainId, startDate, days, postIds? })`:
   - For each day, compute that domain's slots and drop any already occupied by its `scheduled` or `published` posts on that day, matching within ±`jitterMinutes` × 2.
   - Fill free slots with that domain's ready drafts, oldest `createdAt` first, restricted to `postIds` when given, setting `scheduledAt` + `status: scheduled`.
   - Return a report: slots filled, slots left empty, and drafts skipped as not ready (with reasons).
   - Script: `npm run schedule -- --domain <id> --start 2026-10-01 --days 30`.
   **Verify:** with 25 ready drafts on Beta, `--days 3` schedules exactly 25 posts across 3 days, with at most 10 per Copenhagen-local day, each within the window. A second run schedules nothing new. A not-ready draft shows in the skipped list. Passing `postIds` schedules only those posts. Scheduling Beta leaves Alpha's and Gamma's calendars untouched.

5. **Add a revalidation helper.** `src/lib/cache/revalidate.ts` exports `revalidatePostChange(post, previous?)` and `revalidatePageChange(page, previous?)`. They revalidate the document tag, `postList(domainId)`, and `sitemap(domainId)`, using the phase 02 tag builders. If the domain or slug changed, they also revalidate the previous values. Pick the `revalidateTag` profile (and add `revalidatePath` for new URLs if needed) based on the docs read above. The requirement is that a newly published URL returns 200 with current content on its **first** request after publishing, not a stale 404.
   **Verify:** in production mode (`npm run build && npm start`), a post URL that 404s while scheduled returns 200 on the very first request after the dispatcher publishes it (checked in step 8).

6. **Revalidate on editor changes.** `afterChange` and `afterDelete` hooks on Posts and Pages call the step 5 helpers when the document is or was `published`. An `afterChange` hook on Domains revalidates `domain(hostname)` and that domain's list and sitemap. Hooks skip revalidation when running outside a Next.js request context (seed and CLI scripts); in that case the dispatcher or next deploy covers it.
   **Verify:** in production mode, edit the intro of the published Alpha post that shares its slug with a Gamma post, and save. Reloading the Alpha page shows the new text without a rebuild, and the Gamma page with the same slug is unchanged.

7. **Create redirects when a live slug changes.**
   - Install `@payloadcms/plugin-redirects` for a `redirects` collection, with a required `domain` relationship added through the plugin's field overrides.
   - A `beforeChange` hook on Posts and Pages compares the slug with the previous version when the document is `published`. If it changed, it creates (or updates) a redirect from `/{oldSlug}` → `/{newSlug}` scoped to that domain. It also removes any redirect on that domain whose `from` equals the new slug, to prevent loops, and repoints earlier redirects that targeted the old slug, so chains collapse into one hop.
   - `[slug]/page.tsx` (phase 02) checks that domain's redirects before `notFound()`, cached with a `redirects(domainId)` tag added to the tag contract, and calls `permanentRedirect`.
   - Regenerate types and add a migration.
   **Verify:** change a published Beta post's slug from `a` to `b`, then later to `c`. `curl -I beta.localhost:3000/a` and `/b` both return a permanent redirect straight to `/c`, and a post on Alpha with slug `a` is unaffected.

8. **Build the publish dispatcher.**
   - `src/lib/scheduling/publishPost.ts` → `publishPost(postId, now)`. It does a **conditional** update: `payload.update({ collection: 'posts', where: { and: [{ id: { equals } }, { status: { equals: 'scheduled' } }] }, data: { status: 'published', publishedAt: now } })`. If zero docs were updated, another run got there first, so it returns `skipped`. Otherwise it revalidates and returns the post's absolute URL (via `src/lib/urls.ts`) and domain. Phase 06's "Publish now" reuses this function.
   - `src/app/api/cron/publish/route.ts` — `GET`, `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, `maxDuration` set explicitly. It requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare), otherwise 401.
   - The route queries `posts` across all domains where `status = scheduled` and `scheduledAt <= now`, oldest first, limit 50, and calls `publishPost` for each.
   - It groups URLs by domain and passes them to IndexNow (step 9). An IndexNow failure is logged but never reverts publishing.
   - A post that throws during publish is set to `failed`, with the error in a new `publishError` text field (admin read-only).
   - It responds with JSON `{ published: [...ids], skipped, failed, indexNow: {...} }`.
   **Verify:** in production mode, schedule 2 ready posts on Alpha and 1 on Beta, 2 minutes ahead, and call the route after they're due. All 3 become `published` with `publishedAt` set, their URLs return 200 on the first request, they appear on their own domain's front page and `sitemap.xml` only, and the response lists them. Two concurrent calls (`curl … & curl …`) publish each post exactly once. A call without the secret returns 401.

9. **Add IndexNow (dry run locally).**
   - `src/proxy.ts` rewrites `/{32-hex}.txt` to `/{host}/indexnow/{key}`.
   - `src/app/(frontend)/[host]/indexnow/[key]/route.ts` returns the key as `text/plain` only if it equals that domain's `indexNowKey`, otherwise 404.
   - `src/lib/indexnow.ts` (server-only) → `submitUrls(domain, urls)` POSTs `{ host, key, keyLocation, urlList }` to `https://api.indexnow.org/indexnow`, in chunks of ≤ 10,000 URLs, and returns the status codes.
   - It sends only when `INDEXNOW_ENABLED=true` **and** `SITE_ENV=production`. Otherwise it logs the payload and returns `{ dryRun: true }`. Add `INDEXNOW_ENABLED=false` to `.env.example`.
   - Live submission is verified in phase 07.
   **Verify:** `curl alpha.localhost:3000/<alphaKey>.txt` returns the key, and requesting Beta's key on Alpha returns 404. Step 8's run logs one payload for Alpha (2 URLs) and one for Beta (1 URL), each with its own host and key.

10. **Add dispatcher health.** A Payload global `scheduler-status` (read-only in admin): `lastPublishRunAt`, `lastPublishResult` (JSON), `lastGenerationPollAt`, `lastGenerationPollResult`. Both cron routes (publish, and generation from phase 03) update it at the end of each run.
    **Verify:** after calling both routes, the global shows current timestamps and results in the admin.

11. **Add a local cron runner for development.** Script `npm run cron:dev` calls both cron routes on the admin host with the bearer secret — publish every 60s, generation every 5 min — until stopped, logging each response. This lets later phases exercise the full flow locally without a hosted cron.
    **Verify:** with `npm run dev` and `npm run cron:dev` running, a post scheduled 2 minutes ahead gets published with no manual curl, and `scheduler-status` timestamps advance.

## Out of scope

- Calendar/timeline UI, rescheduling UI, and "schedule drafts" buttons (phase 06). This phase provides the functions and scripts.
- Hosted cron configuration, live IndexNow submission, and search console setup (phase 07).
- DataForSEO keyword research (phase 05).

## Acceptance Checklist

- [ ] **Step 1:** Domains have `timezone`, schedule settings, and an auto-generated `indexNowKey`, with a migration
- [ ] **Step 2:** `computeDailySlots` passes tests for window bounds, per-slot jitter, ordering, EU/US DST days, timezone differences, and `postsPerDay: 1`
- [ ] **Step 3:** Posts can't be scheduled or published unless `getReadiness` reports them ready
- [ ] **Step 4:** `npm run schedule` fills one domain's free jittered slots with its ready drafts (≤ postsPerDay per local day), is re-runnable, supports `postIds`, and reports skipped drafts
- [ ] **Step 5:** A newly published URL returns 200 on its first request after publish in production mode
- [ ] **Step 6:** Editing a live post updates that page without a rebuild, and a same-slug post on another domain is untouched
- [ ] **Step 7:** Changing a live slug creates a domain-scoped permanent redirect, without chains or loops
- [ ] **Step 8:** `/api/cron/publish` requires `CRON_SECRET`, publishes due posts across domains through a reusable `publishPost`, and updates each domain's front page and sitemap
- [ ] **Step 8:** Concurrent dispatcher runs publish each post exactly once, and publish errors mark the post `failed`
- [ ] **Step 9:** Each domain serves only its own IndexNow key file, and the dispatcher builds correct per-domain IndexNow payloads in dry-run mode
- [ ] **Step 10:** The `scheduler-status` global records the last publish and generation-poll runs
- [ ] **Step 11:** `npm run cron:dev` publishes scheduled posts locally with no manual trigger
