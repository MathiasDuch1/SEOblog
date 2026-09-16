# Build Guide — Overview

This guide turns [`docs/spec.md`](../spec.md) into seven phases that can each be built, verified, and reviewed on their own. Every phase file has the same shape, so the Claude Code skills in `.claude/skills/` can track progress reliably.

## Phases

| File | Phase | Builds | Depends on | External accounts needed |
|---|---|---|---|---|
| [01-scaffold.md](01-scaffold.md) | Scaffold & content model | Next.js + Payload running on Supabase (dev), R2 media, collections with one niche and one locale per domain, SEO plugin, URL helper, access control, migrations | — | Supabase, Cloudflare R2 |
| [02-frontend.md](02-frontend.md) | Public blog frontend | Hostname-based routing (one country domain = one language, no locale paths), admin-host lockdown, front page, both article templates, legal pages, metadata from the SEO plugin, JSON-LD, scalable sitemaps, robots | 01 | — |
| [03-generation-pipeline.md](03-generation-pipeline.md) | Content generation | Claude Batch API pipeline in each domain's language, per-country affiliate product feed, import in resumable chunks, hero images, resubmitting failed clusters | 01, 02 | Anthropic API, affiliate network, image provider |
| [04-scheduling.md](04-scheduling.md) | Scheduling & publishing | Jittered slot assignment, publish dispatcher, revalidation, slug-change redirects, IndexNow (dry run), local cron runner | 01–03 | — |
| [05-keyword-research.md](05-keyword-research.md) | Keyword research | Semrush integration, keyword clustering, cannibalization checks, cluster persistence | 01, 03 | Semrush API units |
| [06-admin-interfaces.md](06-admin-interfaces.md) | Admin interfaces | SEO interface (research → clusters → bulk generation → batches) and Editor interface (article list, preview, calendar, schedule actions, QC) inside Payload admin | 01–05 | — |
| [07-launch.md](07-launch.md) | Launch & operations | CI, production database/media, staging + production deploys, real domains, hardened admin host, hosted crons, live IndexNow, search consoles, email, monitoring + alerts, runbooks, first live publish | 01–06 | Hosting, production Supabase, DNS, email provider, error tracking, Google Search Console, Bing Webmaster Tools |

Phases 01–06 are fully verifiable on a local machine. Everything that needs a live deployment is in phase 07, so no earlier phase is ever blocked by missing infrastructure.

## Workflow

Each phase is one unit of work and one review cycle.

1. **Start a fresh session per phase.** Tell Claude which file to work from, e.g. *"Work through `docs/build-guide/02-frontend.md`."*
2. **Claude works the Steps in order.** After each numbered step, the `build-guide-progress` skill applies:
   - the step is **verified** (command run, page loaded, query checked) — never assumed,
   - a short summary is given in the session,
   - the matching boxes in that file's **Acceptance Checklist** are checked — and only those lines are edited.
3. **Anything that can't be verified yet stays unchecked**, with the reason stated in the session (e.g. a placeholder API key). An unchecked box always means "not yet confirmed working."
4. **When every box is checked**, Claude gives a phase wrap-up (what was built, workarounds, deviations, things to revisit) and **stops**. It does not start the next phase.
5. **You review**: read the diff, run the app, and try the checklist items yourself if you want.
6. **Commit on `develop`** with a message naming the phase, e.g. `Phase 02: public blog frontend`. Open a PR `develop → main` when you want a stable milestone.
7. Start a new session for the next phase.

If a phase is stopped partway through, the checklist shows exactly where to pick up. Tell the next session to continue from the first unchecked item.

## Rules that apply to every phase

**Server-first (the `nextjs-developer` skill).** Everything that can run on the server runs on the server:
- Pages, layouts, and templates are Server Components. `'use client'` is only allowed on small leaf components that genuinely need browser interactivity, and each phase lists which ones are expected.
- Data is read through Payload's **Local API** (`getPayload({ config })`) in Server Components, Route Handlers, and Server Actions — never fetched from the browser.
- Mutations go through Server Actions or Route Handlers, and each one checks authentication on the server.
- Modules that touch secrets, the database, or third-party APIs live in `src/lib/` and start with `import 'server-only'`.
- Async route segments get `loading.tsx` and `error.tsx`.
- `npm run build` must pass at the end of every phase.

**SEO metadata comes from the Payload SEO plugin.** Pages render the plugin's stored `meta` fields through `generateMetadata`. Titles and descriptions are never hand-built in JSX.

**Secrets** live only in `.env`, which is gitignored. Every new variable is added to `.env.example` with a comment in the same step that introduces it.

**Node 22** (`nvm use`). Payload's CLI does not work on Node 26.

**Phase files are only edited to check boxes.** Deviations from the guide, workarounds, and open questions are reported in the session wrap-up, not written into the phase files.

**Stay inside the phase.** Each phase has an "Out of scope" section. Work listed there belongs to a later phase, even if it looks quick.

## Decisions to make before specific phases

These are open items from spec §9. Each phase lists the decisions it needs under **Prerequisites**. Record your choice in the table when you make it.

| Decision | Needed by | Recommended default | Choice |
|---|---|---|---|
| Supabase development project + region | 01 | Region closest to your planned hosting | `aws-1-eu-west-1` (Ireland), session pooler — dev project only |
| R2 bucket + public media domain (e.g. `media.<yourdomain>`) | 01 | One dev bucket; production gets its own in 07 | `seoblog-media-dev`, served from its `r2.dev` URL; custom media domain deferred to 07 |
| Niches at launch, and which domains belong to each | 01 | Start with one niche; add more as domains are added | **Spirituality** — both launch domains belong to it |
| Supported locales (language + country codes) | 01 | Start with the launch countries, e.g. `en-GB`, `en-US`, `de-DE` | `en-US`, `da-DK` |
| Dev test domains | 02 | `alpha.localhost` (`en-GB`), `beta.localhost` (`de-DE`), `gamma.localhost` (`en-US`) — covers two languages, plus two countries sharing a language | `alpha.localhost` (`en-US`), `beta.localhost` (`da-DK`) |
| Launch countries and their domains | 07 | One dedicated domain per country; no language path prefixes | |
| Affiliate marketplace per country | 03 | — | Deferred with the network choice |
| Legal page texts (privacy, imprint, about, affiliate disclosure) | 02 (placeholders), 07 (final) | Written or reviewed by you, not AI-generated | Placeholders in 02; real text written by Mathias before launch |
| Affiliate network(s) + product feed/API access | 03 | — | **Deferred** — phase 03 uses the `mock` product source only |
| Affiliate terms: image caching, price display, disclosure wording | 03 | — | Deferred with the network choice |
| Hero image provider | 03 | Flux via fal.ai | **Deferred** — build without generated images; revisit before launch |
| Semrush plan with API units | 05 | — | Not purchased yet — buy when phase 05 starts |
| Human QC cadence | 06 | Review the next 48h of scheduled posts daily; re-check live posts weekly | Default accepted: next 48h of scheduled posts daily, live posts weekly |
| Hosting platform + cron mechanism | 07 | Must allow crons every 1–5 minutes and long enough function durations | |
| Production Supabase project + backup plan | 07 | Separate projects for staging and production | |
| Admin hostname | 07 | `admin.<yourdomain>` | |
| Transactional email provider | 07 | — | |
| Error tracking service | 07 | — | |
| Image optimization strategy | 07 | Decide after checking hosting image-optimization pricing | |

## Code layout conventions

```
src/
  app/
    (frontend)/[host]/…            public site, one country domain per host (phase 02)
    (payload)/admin, (payload)/api  Payload admin + REST (phase 01)
    (preview)/preview/…             draft preview on the admin host (phase 06)
    api/cron/…                      cron route handlers (phases 03–04, 07)
    api/health                      health check (phase 07)
  collections/                      Payload collection configs
  components/                       Server Components (client leaves marked in the phase)
  lib/                              server-only modules: urls, cache, domains, ai, affiliate, images, generation, scheduling, indexnow, semrush, keywords, qc, alerts
  scripts/                          `payload run` scripts (seed, generate, poll, regenerate, schedule, research, cron:dev)
  migrations/                       Payload migrations
  payload.config.ts
  proxy.ts                          hostname rewrite, admin lockdown, noindex guard (phase 02)
```

## Phase file format

Every phase file uses these sections, in this order:

1. **Goal** — what exists when the phase is done.
2. **Prerequisites** — earlier phases, accounts, decisions.
3. **Skills in play** — which project skills govern the work.
4. **Steps** — numbered. Each ends with a **Verify** line saying how to prove it works.
5. **Out of scope** — work that belongs to later phases.
6. **Acceptance Checklist** — always last. Each item names the step(s) it verifies.
