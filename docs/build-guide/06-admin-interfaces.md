# Phase 06 — Admin Interfaces

## Goal

Two purpose-built interfaces live inside the Payload admin (spec §5), on top of the phase 03–05 server functions:

- **SEO interface** (`/admin/seo`): pick a niche, then run DataForSEO research for a country domain in it, review and edit clusters, and submit bulk generation with a cost preview. Imported posts can be scheduled automatically. Batch status tracking lets you resubmit failed clusters.
- **Editor interface** (`/admin/editor`): filterable article list across domains with readiness status, rendered previews of unpublished posts, a scheduling calendar/timeline per domain, schedule/reschedule actions, and QC attention lists for upcoming **and** live posts (incomplete fields, missing images, broken affiliate links). Every post links into Payload's native edit screen.

Every domain is one country with one language. Wherever the interfaces show a domain, they also show its locale (e.g. `example.dk · da-DK`), so editors always know which market they are working on. Everything renders on the server. Client components are limited to the small interactive leaves listed below.

## Prerequisites

- Phases 01–05 checked off, except phase 03's deferred items (step 5's real affiliate feed and step 9's hero images).
- `npm run generate:importmap` works (phase 01 step 2). Custom admin components only load after the import map is regenerated.
- Decision recorded: human QC cadence (`00-overview.md`).
- All admin URLs below are on `ADMIN_HOSTNAME` (`localhost:3000` in dev).

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step.
- `nextjs-developer` — admin views are Server Components that read data through the Local API. Filters, pagination, and calendar navigation are URL `searchParams` handled on the server, not client state. Mutations are Server Actions with server-side auth.
- **Allowed client components (leaves only):** the cluster selection checkbox group plus its submit bar (step 4), the inline cluster editor form (step 3), and a confirm-dialog button wrapper for destructive or costly actions (steps 4, 5, 9). Each must receive only the minimal serializable props it renders. Anything beyond this list must be justified in the step summary.

## Steps

1. **Set up the admin view shell.**
   - Register custom views in `payload.config.ts` under `admin.components.views`: `seo` → path `/seo`, `editor` → path `/editor`, `calendar` → path `/editor/calendar`.
   - Add nav links through `admin.components.afterNavLinks`.
   - Each view is a Server Component wrapped in Payload's admin `DefaultTemplate`, so the sidebar and header stay. Confirm the exact view props (`initPageResult`, `params`, `searchParams`) and the template import path against the installed `@payloadcms/next` types rather than assuming.
   - Each view checks `initPageResult.req.user` on the server and redirects to `/admin/login` if there's none.
   - Put shared server-side data loaders in `src/lib/admin/`, including a `DomainLabel` server component that renders `hostname · locale`.
   - Run `npm run generate:importmap`.
   **Verify:** logged in, "SEO" and "Editor" nav links appear, and each view renders inside the normal admin chrome. Logged out, `localhost:3000/admin/seo` redirects to login and returns no view HTML.

2. **Build the research panel in the SEO interface.** A form — a plain `<form action={serverAction}>`, no client JS required — with a niche selector (`searchParams`) that narrows the domain list to that niche's domains, domain (shown with its locale and DataForSEO location and language), seed keywords (entered in that domain's language), and limit per endpoint. It calls `runResearchAction` then `clusterKeywordsAction` from phase 05. Below it, list recent research runs for the selected domain (from `searchParams`): date, location and language, seeds, keyword count, cost, status, and a link to review that run's proposed clusters.
   **Verify:** submitting the form for Beta runs research against Denmark's location and Danish (`2208`/`da`) and creates proposed clusters with Danish names, and the run shows in the list with its cost. Re-submitting identical inputs reuses the stored run (no new cost).

3. **Build cluster review.** For a research run, show proposed clusters: name, primary keyword, keywords with volume/KD, suggested template, rationale, and any conflict reasons from `findConflicts`. The inline editor (allowed client leaf) renames a cluster, removes keywords, and overrides the target template, calling `updateClusterAction` / `saveClustersAction`. Conflicting clusters need an explicit "save anyway" choice. A saved-clusters tab lists the domain's `unused` / `assigned` / `used` clusters, filtered via `searchParams`.
   **Verify:** editing a cluster's name and template persists after a full page reload. A conflicting cluster can't be saved without the explicit override. The status filter shows the right counts.

4. **Add bulk generation.**
   - Scoped to one domain at a time (phase 03 batches are per domain). The domain and its locale are shown prominently above the form, with its niche.
   - Above the domain, a niche selector lists that niche's domains with their `unused` cluster counts, so a month of content can be worked through one niche at a time. Picking a domain there is still what submits a batch.
   - Select `unused` clusters with the allowed client checkbox leaf. The selection is submitted as form data, not held in global client state.
   - Option: **"Schedule automatically when ready"** stores `autoSchedule` on the batch.
   - A server-rendered cost preview shows request count (one per selected cluster) × estimated tokens per request × batch price, plus hero images × image price. Put per-model and per-image rates in `src/lib/ai/pricing.ts`, sourced from spec §8 and labelled "verify current pricing".
   - A confirm step, then a Server Action calls phase 03's `submitBatch`.
   - Guard against double submission: the action rejects clusters that are no longer `unused`.
   - Extend the phase 03 generation cron: after a batch with `autoSchedule` is fully imported, call phase 04's `scheduleDrafts({ domainId, startDate: tomorrow, days: 30, postIds })` with that batch's ready posts, and store the report on the batch. This covers spec §5.1's "draft/scheduled" on import.
   **Verify:**
   - Selecting 3 Beta clusters shows 3 requests with text and image cost estimates.
   - Submitting creates one `generation-batches` doc for Beta with the clusters `assigned`.
   - Submitting the same form again, e.g. with the back button, is rejected without creating a second batch.
   - With auto-schedule on and mocks enabled, the imported posts end `scheduled` in Beta's free slots once the cron has run.

5. **Show batch status and resubmission.**
   - List `generation-batches` for the selected domain: submitted time, status, request counts, imported/errored rows, total tokens with actual cost (from recorded usage × pricing — first extend the phase 03 request rows to store cache-write and cache-read tokens separately from `inputTokens`, since they are billed at different rates), and the auto-schedule report.
   - "Import now" runs `importBatch` chunks for an `ended` batch until done.
   - Rows expand to show per-request errors. "Resubmit failed clusters" (behind the confirm leaf) calls phase 03's `submitBatch` with that batch's errored clusters, which are back to `unused`.
   - `scheduler-status.lastGenerationPollAt` appears at the top, with a warning if it's older than 30 minutes.
   **Verify:** a finished batch shows correct counts and cost, and "Import now" imports it so its posts appear in the Editor list (step 6). For a batch with a simulated failed request, "Resubmit failed clusters" creates a new batch containing only that cluster, and after import there is exactly one post for it. A stale poll timestamp shows the warning.

6. **Build the Editor article list.** `/admin/editor` is a server-rendered table of posts across all domains.
   - Filters (all `searchParams`, applied as a Payload `where` on the server): niche (matched through `domain.niche`), domain, template, status, readiness (ready / not ready), and scheduled date range.
   - Columns: title (`meta.title`), domain (with locale), template, status, `scheduledAt` in the domain's timezone, a readiness badge listing missing fields from `getReadiness`, a hero image indicator, and "Preview" (step 7) and "Edit" links.
   - "Edit" opens `/admin/collections/posts/{id}`, Payload's native edit screen (spec §5.2).
   - Pagination via `?page=`.
   **Verify:** the niche filter shows only posts on that niche's domains, and the domain + status filters return the same count as an equivalent REST query. The "not ready" filter shows only posts with missing fields, and the badge names them. "Edit" opens the native edit screen. Filters survive a page reload, since they're in the URL.

7. **Add draft preview.**
   - Route group `src/app/(preview)/preview/[postId]/page.tsx` with its own root layout (`<html lang={domain.locale}>`), the frontend `globals.css`, the post's domain branding, and that domain's UI dictionary. It's reachable only on the admin host (phase 02 proxy).
   - It authenticates with `payload.auth({ headers: await headers() })` and returns 404 without a user.
   - It loads the post in any status with `overrideAccess: false` for the user, then renders the phase 02 `ListicleTemplate` / `InformationalTemplate` unchanged.
   - It shows a fixed "Preview — {domain} — {status} — scheduled {time}" banner, `robots: noindex`, and no caching.
   - Set `admin.preview` on the Posts collection so the native edit screen has a Preview button.
   **Verify:** a `draft` Beta post renders at `/preview/{id}` exactly like the public template, with Danish UI strings and Beta's branding, when logged in. Logged out, it returns 404. On a blog hostname, `/preview/...` returns 404. The edit screen's Preview button opens it.

8. **Build the scheduling calendar.** `/admin/editor/calendar?domain=&week=`:
   - Server-rendered week grid in the domain's timezone, with the domain and locale in the header. Each day shows its computed slots (phase 04 `computeDailySlots` without jitter as the grid rows), with `scheduled` / `published` / `failed` posts placed at their actual times.
   - Posts are colour-coded by status, with an attention icon when not ready or QC issues exist.
   - Previous/next week are plain links. Each post links to its preview and edit screen.
   - The header shows `scheduler-status.lastPublishRunAt`, with a warning if it's older than 15 minutes.
   **Verify:** Beta's calendar for a seeded week shows each scheduled post on the correct Copenhagen-local day and time, and matches the list view's filtered count for that week. Switching to Alpha shows New York-local times. Week navigation works without client JS.

9. **Add schedule management actions.**
   - "Schedule drafts" form: domain, start date, days → phase 04 `scheduleDrafts`, showing its report (filled, empty slots, skipped drafts with reasons).
   - Per post: "Reschedule" (datetime in the domain's timezone → UTC, rejected if outside the domain window or colliding with another post on that domain within `jitterMinutes` × 2), "Unschedule" (back to `draft`, clears `scheduledAt`), and "Publish now" (phase 04's `publishPost` plus IndexNow, behind the confirm leaf).
   **Verify:** scheduling 5 Beta drafts from the UI places them in Beta's free slots and shows the report. Rescheduling into an occupied Beta slot is refused with a reason, while the same time on Alpha is allowed. "Publish now" makes the post's URL return 200 immediately. Unschedule returns the post to `draft` and it disappears from the calendar.

10. **Add QC attention lists (before and after go-live, spec §6.7).**
    - `src/lib/qc/linkCheck.ts` (server-only): HEAD with GET fallback, 10s timeout, following redirects, checking every product `affiliateUrl` and `imageUrl`. Results are stored on the post in a `qc` group (`checkedAt`, `brokenLinks[]` with URL + status).
    - **"Needs attention — next 48h"** panel on `/admin/editor`: scheduled posts that are not ready, have no featured image, or have broken links.
    - **"Live issues"** panel: published posts with broken links, so products that were discontinued after publishing get caught.
    - Both panels can be filtered by domain.
    - "Re-check links" Server Action per post.
    - Checks run automatically from the publish cron in small batches, at most 20 posts per run:
      - scheduled posts due within 48h whose `qc.checkedAt` is older than 12 hours
      - published posts whose `qc.checkedAt` is older than 7 days (or the QC cadence recorded in `00-overview.md`), oldest first
    **Verify:** a scheduled post with a deliberately broken affiliate URL appears in the 48h panel with that URL listed. Fixing the URL in the native edit screen and clicking "Re-check links" removes it. A published post with a broken image URL appears under "Live issues" after the cron's periodic check. A post with an empty `summary` appears with the reason.

11. **Verify edit isolation end to end (spec §5.2).** Using the native edit screen reached from the Editor list, change one product's title and affiliate URL on the published Alpha (`en-US`) post that shares its slug (`best-meditation-cushions`) with a Gamma (`en-US`) post (phase 02 seed).
    **Verify:** the Alpha page shows the new title and link immediately. The Gamma post with the same slug is unchanged in every field, both on its page and in the REST API.

12. **Audit server-first and build.** List every `'use client'` file under `src/`. It must match only the allowed leaves above. Confirm none of them import from `src/lib/` modules marked `server-only`, and that none receive full Payload documents as props.
    **Verify:** `grep -rln "use client" src` output matches the allowed list, and `npm run lint`, `npm test`, and `npm run build` all exit 0.

## Out of scope

- Replacing Payload's native document edit screen. Editing stays native (spec §5.2).
- Role-based permissions beyond "logged-in user" (e.g. editors restricted to their country's domains).
- Analytics, revenue, or rank-tracking dashboards.
- Alerts by email when something fails (phase 07). This phase only shows problems in the admin.

## Acceptance Checklist

- [ ] **Step 1:** `/admin/seo` and `/admin/editor` render inside the admin chrome with nav links, and redirect when logged out
- [ ] **Step 2:** The research form runs against the selected domain's DataForSEO location and language, creates runs and proposed clusters, and identical inputs reuse the stored run
- [ ] **Step 3:** Clusters' name, keywords, and template can be edited from the UI, and conflicts require an explicit override
- [ ] **Step 4:** Bulk generation is scoped to one domain, shows a text + image cost preview, submits one batch, and rejects double submission
- [ ] **Step 4:** Batches with auto-schedule end with their ready posts scheduled into that domain's free slots
- [ ] **Step 5:** Batch status shows counts, errors, and actual cost; "Import now" and "Resubmit failed clusters" work; a stale poller is flagged
- [ ] **Step 6:** The Editor list filters server-side via URL params, including by niche, shows domain + locale and readiness, and links into native editing
- [ ] **Step 7:** Unpublished posts can be previewed with the real templates, branding, and language on the admin host only, including from the native edit screen
- [ ] **Step 8:** The calendar shows each domain's posts at the correct local slot times, navigates by week without client JS, and flags a stale dispatcher
- [ ] **Step 9:** Schedule drafts, reschedule (with per-domain collision and window checks), unschedule, and publish-now all work from the UI
- [ ] **Step 10:** The attention lists catch incomplete, imageless, and broken-link posts both in the next 48h and after publishing, and clear after a fix + re-check
- [ ] **Step 11:** An edit to one domain's post never changes a same-slug post on another domain
- [ ] **Step 12:** `'use client'` files match the allowed leaf list, and lint, tests, and build all pass
