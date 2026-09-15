---
name: build-guide-progress
description: Keeps the build-guide phase files in docs/build-guide/ (01-scaffold.md through 07-launch.md) in sync with real progress. Use whenever a numbered step under a phase file's "Steps" section is finished — it covers verifying the step actually works, reporting what changed, and checking off the matching Acceptance Checklist items. Also use when a phase's checklist is fully complete, to wrap up that phase and hand it back for review.
---

# Build Guide Progress Tracker

Keep the phase files in `docs/build-guide/` accurate as work happens, and keep the person building this informed without them having to ask "what's done?" or open the files themselves.

## When a step is completed

After finishing any numbered item under a phase file's "Steps" section:

**1. Verify it actually works.** Run the command, load the page, check the file exists — whatever the step requires. Never treat a step as done on the assumption it worked.

**2. Summarize in the session.** A few sentences stating what was built or changed, and confirming it was verified. Don't restate the step's instructions. Tone:

> Done — Domains, KeywordClusters, Posts, and Media collections are registered and appear in the admin sidebar. Localization is configured with en/de, and I confirmed editing a field in `de` doesn't touch the `en` value on the same document.

**3. Check off the matching Acceptance Checklist item(s)** in that same phase file. The checklist is at the bottom of the file. Change:

```
- [ ] `domains`, `keyword-clusters`, `posts`, `media` collections all appear in the admin sidebar
```

to:

```
- [x] `domains`, `keyword-clusters`, `posts`, `media` collections all appear in the admin sidebar
```

Edit **only** the checkbox lines that are now genuinely true. Leave the rest of the file untouched — don't rewrite prose, reorder items, or add commentary inline in the file.

## When something can't be verified yet

If a step is implemented but a checklist item can't be confirmed yet — it depends on a real API key that's still a placeholder, a database that isn't provisioned, etc. — say so explicitly in the summary and **leave that box unchecked**.

An unchecked box must always mean "not yet confirmed working." It must never mean "forgot to update." Never check a box on good faith.

## When a whole phase is complete

Once every item in a phase file's Acceptance Checklist is checked:

1. Give a slightly longer wrap-up of the whole phase — what was built, plus anything worth flagging: workarounds, deviations from the guide, things to revisit later.
2. Explicitly state that the phase file is fully checked off and it's safe to commit and move to the next phase file, per the workflow in `00-overview.md`.
3. **Do not start work from the next phase file in the same session** unless explicitly asked. Each phase is meant to be reviewed by the person before the next one begins.
