# Phase 07 — Launch & Operations

## Goal

The system runs unattended in production:
- Continuous integration guards every push.
- Production has its own database and media bucket, and migrations run on deploy.
- The app is deployed with separate staging and production environments.
- Real domains serve over HTTPS, with `www` redirects, and the admin lives on its own hardened hostname.
- Hosted crons drive generation and publishing, and IndexNow submits live.
- Every domain is verified in Google Search Console and Bing Webmaster Tools.
- Password reset and alert emails work, and failures reach a human without anyone opening the admin.
- Runbooks exist for routine operations.

The phase ends with the first post on a real domain published automatically, end to end.

## Prerequisites

- Phases 01–06 fully checked off.
- Decisions recorded in `00-overview.md`:
  - hosting platform + cron mechanism, which must support calls every 1–5 minutes and a function duration long enough for the phase 03 chunk sizes
  - production Supabase project
  - admin hostname (e.g. `admin.<yourdomain>`)
  - transactional email provider
  - error-tracking service
- DNS access for at least one real blog domain and the admin domain.
- Final legal page texts (privacy policy, imprint, affiliate disclosure) replacing the phase 02 placeholders.

## Skills in play

- `build-guide-progress` — verify, summarize, and check boxes after each step. Several items here depend on DNS propagation or search-engine processing time. If they can't be confirmed yet, say so and leave them unchecked.
- `nextjs-developer` — deploy validation: `next build` with zero errors, server-only and `NEXT_PUBLIC_*` env vars set per environment, and Core Web Vitals checked on the live site.

## Steps

1. **Set up continuous integration.** Add `.github/workflows/ci.yml`, running on push and pull request to `develop` and `main`:
   - Node 22, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`
   - `npm run build` against a Postgres service container, running `npm run migrate` first, with dummy values for every other required env var
   - no real secrets used
   **Verify:** a pull request `develop → main` shows the workflow green, and a deliberately introduced type error on a throwaway branch makes it fail.

2. **Set up the production database.**
   - Create a separate Supabase project for production.
   - Choose the connection string for the hosting runtime: Supabase's transaction pooler for serverless functions, otherwise the session pooler. Confirm Payload's Postgres adapter works with the chosen pooler.
   - Set `push: false` for production so the schema changes only through migrations.
   - Run `npm run migrate` as part of every production and staging deploy (build or release command).
   - Enable backups on a plan with daily backups, and point-in-time recovery if the budget allows.
   - Use a separate database for staging.
   **Verify:** `npm run migrate:status` against production shows every migration applied, the three `DATABASE_URI`s (dev, staging, prod) are all different, and the Supabase dashboard shows backups enabled.

3. **Set up production media.** Create a production R2 bucket (or a `prod/` prefix) with its own API token and a public custom domain on Cloudflare (e.g. `media.<yourdomain>`). Set the R2 env vars per environment, and add the production media hostname to `images.remotePatterns`.
   **Verify:** an image uploaded in the production admin is stored in the production bucket and served from the production media domain over HTTPS.

4. **Deploy staging and production.**
   - Connect the hosting project to GitHub: `main` → production, `develop` → staging.
   - Node 22 runtime. Every env var from `.env.example` is set per environment, with `SITE_ENV` = `production` / `staging` and `PUBLIC_URL_SCHEME=https`.
   - Set `maxDuration` on the cron routes to fit the platform limit, and tune `IMPORT_CHUNK_SIZE` / `IMAGE_CHUNK_SIZE` so one call finishes well within it.
   - Add `src/app/api/health/route.ts` (admin host only). It returns `{ ok, db: 'up'|'down', version }` — the git SHA, no secrets — after a trivial Local API query.
   **Verify:** both environments build and deploy from their branches, `/api/health` returns `ok: true` with the deployed commit SHA on each, and staging responses carry `X-Robots-Tag: noindex, nofollow` while production responses don't.

5. **Harden the admin hostname and security headers.**
   - Point the admin domain at the app, and set `ADMIN_HOSTNAME` per environment.
   - In `payload.config.ts`, set `serverURL` to the admin origin, and restrict `cors` and `csrf` to it.
   - Admin and preview responses send `X-Robots-Tag: noindex`.
   - Add security headers in `next.config.ts` `headers()` for all routes: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy: frame-ancestors 'self'`.
   - Create named admin accounts for everyone who needs access, and remove the initial development account from production.
   **Verify:**
   - `curl -I https://<blogdomain>/admin` → 404, and `https://<admindomain>/admin` → login page.
   - A cross-origin POST to the Payload API from another origin is rejected.
   - The four headers are present on a blog page.
   - Production has no default or shared admin credentials.

6. **Connect real country domains.**
   - One dedicated domain per launch country (e.g. `example.de`, `example.co.uk`). For each: add it to the hosting project (automatic TLS), create the DNS records, and add `www.<domain>` with a permanent redirect to the apex (or the reverse, but consistently) at the hosting/DNS level.
   - Create the `Domain` document in production with the real hostname, `locale`, timezone, schedule, Semrush database, and affiliate marketplace settings for that country.
   - Replace the legal page placeholders with the final texts, written in that domain's language and meeting that country's legal requirements (e.g. an Impressum for Germany).
   **Verify:** `curl -I http://<domain>` redirects to `https://<domain>`, and `curl -I https://www.<domain>` returns a permanent redirect to `https://<domain>`. The site renders with the correct branding and `<html lang>`, UI strings are in the domain's language, `sitemap.xml` URLs are absolute `https://<domain>/…` with no language prefixes, and the legal pages show the final text.

7. **Wire the hosted crons.** Configure the platform to call `GET https://<admindomain>/api/cron/publish` every 1–5 minutes and `GET https://<admindomain>/api/cron/generation` every 10–15 minutes, both with `Authorization: Bearer ${CRON_SECRET}`. Commit the cron config file, or document the external cron setup in `README.md` under "Deployment". Use separate `CRON_SECRET`s for staging and production.
   **Verify:** on production, `scheduler-status.lastPublishRunAt` and `lastGenerationPollAt` advance on their own over 20 minutes, and a post scheduled 5 minutes ahead is published by the cron without manual calls.

8. **Go live with IndexNow.** Set `INDEXNOW_ENABLED=true` in production only.
   **Verify:** `https://<domain>/<indexNowKey>.txt` returns the key. After the next automatic publish, `scheduler-status.lastPublishResult.indexNow` shows a 200 or 202 response for that domain. Staging logs a dry run instead.

9. **Register with search engines.** For each domain, verify ownership in Google Search Console and Bing Webmaster Tools (DNS TXT record), and submit `https://<domain>/sitemap.xml` in both.
   **Verify:** both consoles show the domain as verified and the sitemap as successfully read with a discovered-URL count. Processing can take days — if it's still pending, say so and leave the box unchecked.

10. **Set up transactional email.** Configure a Payload email adapter (e.g. `@payloadcms/email-nodemailer` over SMTP, or the provider's official adapter) with a verified sending domain (SPF/DKIM), `defaultFromAddress`, and `defaultFromName`. Add `ALERT_EMAILS` (comma-separated recipients) to `.env.example`.
    **Verify:** "Forgot password" on the production admin delivers a reset email that lands in the inbox rather than spam, and the reset link works.

11. **Add monitoring and alerts.**
    - Error tracking for server and client errors (the chosen service's Next.js integration), with source maps uploaded, and environment and release (git SHA) tagged.
    - `src/lib/alerts.ts` (server-only) → `sendAlert({ severity, subject, details })`, sent through Payload's email adapter to `ALERT_EMAILS`. It de-duplicates the same subject within 6 hours.
    - Alerts fire when:
      - a publish run marks any post `failed`
      - a generation batch ends with errored rows, or reaches 25 days since submission without being imported (results expire at 29)
      - hero image attempts are exhausted for a post
      - any cron hasn't run for 15 minutes (publish) or 45 minutes (generation), detected by an external uptime monitor on a small `/api/cron/heartbeat` route that reads `scheduler-status`
      - a daily QC digest has items in the "Needs attention — next 48h" or "Live issues" lists (phase 06)
    - Configure the external uptime monitor on `/api/health` and `/api/cron/heartbeat`.
    **Verify:** on staging, force a publish failure (e.g. a scheduled post whose data fails validation) → one alert email arrives, and a second identical failure within 6 hours sends none. Pausing the staging cron for 20 minutes triggers the heartbeat alert. A thrown test error appears in error tracking with the correct release SHA.

12. **Check live performance.** Run Lighthouse (mobile) against a real listicle and a real informational post on a production domain. Check the hosting platform's image-optimization pricing against expected volume (thousands of product and hero images). If it's costly, move product images to `unoptimized` or a custom `next/image` loader backed by Cloudflare image resizing, and record the choice.
    **Verify:** both pages score Performance ≥ 90, SEO ≥ 90, and Accessibility ≥ 90, and the image optimization decision is recorded in `00-overview.md`.

13. **Write runbooks.** `docs/runbooks.md`, with numbered steps and exact commands:
    - **Add a new country domain:** check the locale is in `SUPPORTED_LOCALES` (otherwise follow "Add a new language" first), then the Domain document (locale, timezone, schedule, Semrush database, affiliate marketplace), legal pages in that language, hosting domain + DNS + `www` redirect, Search Console + Bing + sitemap, and the first research run.
    - **Add a new language:** add the locale code(s) to `src/lib/locales.ts`, add a UI dictionary for the language, add a stop-word list for phase 05 cannibalization checks, deploy. No database migration is needed.
    - **Rotate a secret:** `CRON_SECRET`, `ANTHROPIC_API_KEY`, R2 token, Semrush key, `PAYLOAD_SECRET` (note that this invalidates sessions).
    - **Restore the database from backup.**
    - **Respond to each alert type.**
    - **Pause all publishing:** disable the cron or set an env flag the dispatcher honours. Add a `PUBLISHING_PAUSED` check to the phase 04 dispatcher if one doesn't exist.
    **Verify:** following "Add a new country domain" on staging, with a staging subdomain for a locale not yet used, brings the new domain online end to end without steps outside the runbooks. Setting `PUBLISHING_PAUSED=true` on staging stops publishing while the cron keeps running.

14. **Run the launch rehearsal and first live publish.**
    - **On staging:** research (small limit) → cluster → bulk generate with auto-schedule → import → hero images → scheduled into slots → auto-published by cron → IndexNow dry run → post visible on the staging domain, with no manual intervention after submission.
    - **Then on production:** the same flow for one real domain, with a small batch (e.g. 3 clusters).
    **Verify:** on production, at least one post generated from Semrush data is published automatically by the cron on a real domain. It renders in the domain's language with the correct `<html lang>`, canonical, `og:locale`, and JSON-LD, appears in `sitemap.xml`, and has a logged IndexNow 200/202. Report actual cost for the run (tokens + images) against spec §8.

## Out of scope

- Scaling beyond the spec's volume (tens of thousands of posts per day).
- Role-based admin permissions, analytics, and revenue tracking.
- Paid-traffic or social distribution.

## Acceptance Checklist

- [ ] **Step 1:** CI runs lint, typecheck, tests, and a migrated build on every push/PR to `develop` and `main`, and fails on errors
- [ ] **Step 2:** Production uses its own Supabase project with migrations on deploy, push disabled, backups enabled, and separate staging and dev databases
- [ ] **Step 3:** Production media is stored in its own R2 bucket/prefix and served from the production media domain
- [ ] **Step 4:** Staging (`develop`) and production (`main`) deploy automatically, `/api/health` reports the deployed SHA, and staging is noindex
- [ ] **Step 5:** The admin is only reachable on the admin hostname, CORS/CSRF are restricted to it, security headers are set, and no default credentials exist
- [ ] **Step 6:** Real country domains serve over HTTPS with `www` redirects, correct branding and language, absolute https sitemap URLs without language prefixes, and final legal texts
- [ ] **Step 7:** Hosted crons publish a scheduled post and poll generation automatically in production
- [ ] **Step 8:** Live IndexNow submissions return 200/202 from production, and staging stays in dry-run mode
- [ ] **Step 9:** Each domain is verified in Google Search Console and Bing Webmaster Tools, with its sitemap read successfully
- [ ] **Step 10:** Password reset emails deliver from a verified sending domain
- [ ] **Step 11:** Failures, stale crons, expiring batches, and QC issues send de-duplicated alert emails, and errors reach error tracking with release tags
- [ ] **Step 12:** Live pages score ≥ 90 on Performance, SEO, and Accessibility, and the image optimization cost decision is recorded
- [ ] **Step 13:** Runbooks exist, and the "add a new country domain", "add a new language", and "pause publishing" runbooks were proven on staging
- [ ] **Step 14:** A post generated from Semrush data was published automatically on a real production domain, end to end, with cost reported
