# Phase 06 — Admin Interfaces

## Goal

Two purpose-built interfaces live inside the Payload admin (spec §5), on top of the phase 03–05 server functions:

- **SEO interface** (`/admin/seo`): run Semrush research, review and edit clusters (including template and target locales per cluster), and submit bulk generation with a cost preview. Imported posts can be scheduled automatically. Batch status tracking shows regeneration of failed locales.
- **Editor interface** (`/admin/editor`): filterable article list with locale completeness, rendered previews of unpublished posts, a scheduling calendar/timeline per domain, schedule/reschedule actions, and QC attention lists for upcoming **and** live posts (missing locales, missing images, broken affiliate links). Every post links into Payload's native per-locale edit screen.

Everything renders on the server. Client components are limited to the small interactive leaves listed below.

## Prerequisites

- Phases 01–05 fully checked off.
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
   - Put shared server-side data loaders in `src/lib/admin/`.
   - Run `npm run generate:importmap`.
   **Verify:** logged in, "SEO" and "Editor" nav links appear, and each view renders inside the normal admin chrome. Logged out, `localhost:3000/admin/seo` redirects to login and returns no view HTML.

2. **Build the research panel in the SEO interface.** A form — a plain `<form action={serverAction}>`, no client JS required — with domain, locale (limited to that domain's active locales), seed keywords, and limit per report. It calls `runResearchAction` then `clusterKeywordsAction` from phase 05. Below it, list recent research runs for the selected domain (from `searchParams`): date, seeds, keyword count, units used, status, and a link to review that run's proposed clusters.
   **Verify:** submitting the form for Alpha creates a research run and proposed clusters, and the run shows in the list with units used. Re-submitting identical inputs reuses the stored run (no new units).

3. **Build cluster review.** For a research run, show proposed clusters: name, primary keyword, keywords with volume/KD, suggested template, rationale, and any conflict reasons from `findConflicts`. The inline editor (allowed client leaf) renames a cluster, removes keywords, and overrides the target template and **target locales** (limited to the domain's active locales), calling `updateClusterAction` / `saveClustersAction`. Conflicting clusters need an explicit "save anyway" choice. A saved-clusters tab lists the domain's `unused` / `assigned` / `used` clusters, filtered via `searchParams`.
   **Verify:** editing a cluster's name, template, and target locales (e.g. only `en` on Alpha) persists after a full page reload. A conflicting cluster can't be saved without the explicit override. The status filter shows the right counts.

4. **Add bulk generation.**
   - Select `unused` clusters with the allowed client checkbox leaf. The selection is submitted as form data, not held in global client state.
   - Each selected cluster generates in its own `targetLocales`, and the form shows them per cluster.
   - Option: **"Schedule automatically when ready"** stores `autoSchedule` on the batch.
   - A server-rendered cost preview shows total requests (Σ target locales) × estimated tokens per request × batch price. Put per-model rates in `src/lib/ai/pricing.ts`, sourced from spec §8 and labelled "verify current pricing".
   - A confirm step, then a Server Action calls phase 03's `submitBatch`.
   - Guard against double submission: the action rejects clusters that are no longer `unused`.
   - Extend the phase 03 generation cron: after a batch with `autoSchedule` is fully imported and its posts have hero images, call phase 04's `scheduleDrafts({ domainId, startDate: tomorrow, days: 30, postIds })` with that batch's ready posts, and store the report on the batch. This covers spec §5.1's "draft/scheduled" on import.
   **Verify:**
   - Selecting one cluster targeting `en` + `de` and one targeting `en` shows 3 requests and a cost estimate.
   - Submitting creates one `generation-batches` doc with clusters `assigned`.
   - Submitting the same form again, e.g. with the back button, is rejected without creating a second batch.
   - With auto-schedule on and mocks enabled, the imported posts end `scheduled` in free slots once the cron has run.

5. **Show batch status and regeneration.**
   - List `generation-batches` for the selected domain: kind, submitted time, status, request counts, imported/errored rows, total tokens with actual cost (from recorded usage × pricing), and the auto-schedule report.
   - "Import now" runs `importBatch` chunks for an `ended` batch until done.
   - Rows expand to show per-request errors. For a post with errored locales, "Regenerate missing locales" (behind the confirm leaf) calls phase 03's `submitRegeneration`.
   - `scheduler-status.lastGenerationPollAt` appears at the top, with a warning if it's older than 30 minutes.
   **Verify:** a finished batch shows correct counts and cost, and "Import now" imports it so its posts appear in the Editor list (step 6). For a post with a simulated failed `de` request, "Regenerate missing locales" creates a `regenerate` batch that fills only `de`. A stale poll timestamp shows the warning.

6. **Build the Editor article list.** `/admin/editor` is a server-rendered table of posts.
   - Filters (all `searchParams`, applied as a Payload `where` on the server): domain, template, status, locale completeness (complete / missing a given locale), and scheduled date range.
   - Columns: title (first target locale's `meta.title`), domain, template, status, `scheduledAt` in the domain's timezone, a per-target-locale completeness badge from `getReadiness`, a hero image indicator, and a "Preview" link (step 7).
   - Pagination via `?page=`.
   - Each locale badge links to `/admin/collections/posts/{id}?locale={code}`, Payload's native per-locale edit screen (spec §5.2).
   **Verify:** the domain + status filters return the same count as an equivalent REST query. The "missing `de`" filter shows only posts lacking `de` content among those targeting `de`. A locale badge opens the native edit screen already in that locale. Filters survive a page reload, since they're in the URL.

7. **Add draft preview.**
   - Route group `src/app/(preview)/preview/[postId]/[locale]/page.tsx` with its own root layout, the frontend `globals.css`, and the domain's branding. It's reachable only on the admin host (phase 02 proxy).
   - It authenticates with `payload.auth({ headers: await headers() })` and returns 404 without a user.
   - It loads the post in any status with `draft: true` and `overrideAccess: false` for the user, then renders the phase 02 `ListicleTemplate` / `InformationalTemplate` unchanged.
   - It shows a fixed "Preview — {status} — scheduled {time}" banner, `robots: noindex`, and no caching.
   - Set `admin.preview` on the Posts collection so the native edit screen has a Preview button for the current locale.
   **Verify:** a `draft` Alpha post in `de` renders exactly like the public template at `/preview/{id}/de` when logged in. Logged out, it returns 404. On a blog hostname, `/preview/...` returns 404. The edit screen's Preview button opens the current locale.

8. **Build the scheduling calendar.** `/admin/editor/calendar?domain=&week=`:
   - Server-rendered week grid in the domain's timezone. Each day shows its computed slots (phase 04 `computeDailySlots` without jitter as the grid rows), with `scheduled` / `published` / `failed` posts placed at their actual times.
   - Posts are colour-coded by status, with an attention icon when readiness is incomplete or QC issues exist.
   - Previous/next week are plain links. Each post links to its preview and edit screen.
   - The header shows `scheduler-status.lastPublishRunAt`, with a warning if it's older than 15 minutes.
   **Verify:** Alpha's calendar for a seeded week shows each scheduled post on the correct local day and time, and matches the list view's filtered count for that week. Week navigation works without client JS.

9. **Add schedule management actions.**
   - "Schedule drafts" form: domain, start date, days → phase 04 `scheduleDrafts`, showing its report (filled, empty slots, skipped drafts with reasons).
   - Per post: "Reschedule" (datetime in domain timezone → UTC, rejected if outside the domain window or colliding with another post within `jitterMinutes` × 2), "Unschedule" (back to `draft`, clears `scheduledAt`), and "Publish now" (phase 04's `publishPost` plus IndexNow, behind the confirm leaf).
   **Verify:** scheduling 5 drafts from the UI places them in free slots and shows the report. Rescheduling into an occupied slot is refused with a reason. "Publish now" makes the post's URL return 200 immediately. Unschedule returns the post to `draft` and it disappears from the calendar.

10. **Add QC attention lists (before and after go-live, spec §6.7).**
    - `src/lib/qc/linkCheck.ts` (server-only): HEAD with GET fallback, 10s timeout, following redirects, checking every product `affiliateUrl` and `imageUrl` in every target locale. Results are stored on the post in a `qc` group (`checkedAt`, `brokenLinks[]` with locale + URL + status).
    - **"Needs attention — next 48h"** panel on `/admin/editor`: scheduled posts that are not ready, have no featured image, or have broken links.
    - **"Live issues"** panel: published posts with broken links, so products that were discontinued after publishing get caught.
    - "Re-check links" Server Action per post.
    - Checks run automatically from the publish cron in small batches, at most 20 posts per run:
      - scheduled posts due within 48h whose `qc.checkedAt` is older than 12 hours
      - published posts whose `qc.checkedAt` is older than 7 days (or the QC cadence recorded in `00-overview.md`), oldest first
    **Verify:** a scheduled post with a deliberately broken affiliate URL appears in the 48h panel with that URL listed. Fixing the URL in the native edit screen and clicking "Re-check links" removes it. A published post with a broken image URL appears under "Live issues" after the cron's periodic check. A post missing `de` content appears with the reason.

11. **Verify edit isolation end to end (spec §5.2).** Using the native edit screen reached from the Editor list, change one product's `de` title and `de` affiliate URL on a published Alpha post that shares its `en` slug with a Beta post (phase 02 seed).
    **Verify:** the Alpha `de` page shows the new title and link immediately. The Alpha `en` page is unchanged. The Beta post with the same `en` slug is unchanged in every field. The REST API confirms the unchanged values.

12. **Audit server-first and build.** List every `'use client'` file under `src/`. It must match only the allowed leaves above. Confirm none of them import from `src/lib/` modules marked `server-only`, and that none receive full Payload documents as props.
    **Verify:** `grep -rln "use client" src` output matches the allowed list, and `npm run lint`, `npm test`, and `npm run build` all exit 0.

## Out of scope

- Replacing Payload's native document edit screen. Editing stays native (spec §5.2).
- Role-based permissions beyond "logged-in user".
- Analytics, revenue, or rank-tracking dashboards.
- Alerts by email when something fails (phase 07). This phase only shows problems in the admin.

## Acceptance Checklist

- [ ] **Step 1:** `/admin/seo` and `/admin/editor` render inside the admin chrome with nav links, and redirect when logged out
- [ ] **Step 2:** The research form creates runs and proposed clusters, and identical inputs reuse the stored run
- [ ] **Step 3:** Clusters' name, keywords, template, and target locales can be edited from the UI, and conflicts require an explicit override
- [ ] **Step 4:** Bulk generation uses per-cluster locales, shows a cost preview, submits one batch, and rejects double submission
- [ ] **Step 4:** Batches with auto-schedule end with their ready posts scheduled into free slots
- [ ] **Step 5:** Batch status shows counts, errors, and actual cost; "Import now" and "Regenerate missing locales" work; a stale poller is flagged
- [ ] **Step 6:** The Editor list filters server-side via URL params, shows per-target-locale completeness, and links into native per-locale editing
- [ ] **Step 7:** Unpublished posts can be previewed with the real templates on the admin host only, including from the native edit screen
- [ ] **Step 8:** The calendar shows each domain's posts at the correct local slot times, navigates by week without client JS, and flags a stale dispatcher
- [ ] **Step 9:** Schedule drafts, reschedule (with collision and window checks), unschedule, and publish-now all work from the UI
- [ ] **Step 10:** The attention lists catch incomplete, imageless, and broken-link posts both in the next 48h and after publishing, and clear after a fix + re-check
- [ ] **Step 11:** An edit to one locale of one domain's post changes only that locale on that domain
- [ ] **Step 12:** `'use client'` files match the allowed leaf list, and lint, tests, and build all pass
