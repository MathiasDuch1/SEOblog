import type { GlobalConfig } from 'payload'

/**
 * Health of the cron-driven work: when the publish dispatcher and the generation poller last
 * ran, and what they did. Written by the cron routes; read-only in the admin. Phase 06 flags a
 * stale dispatcher from these timestamps.
 */
export const SchedulerStatus: GlobalConfig = {
  slug: 'scheduler-status',
  label: 'Scheduler status',
  admin: {
    group: 'Admin',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: () => false,
  },
  fields: [
    { name: 'lastPublishRunAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lastPublishResult', type: 'json', admin: { readOnly: true } },
    { name: 'lastGenerationPollAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lastGenerationPollResult', type: 'json', admin: { readOnly: true } },
  ],
}
