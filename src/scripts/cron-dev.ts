/**
 * Local stand-in for the hosted cron (phase 07): calls the cron routes on the admin host with
 * the bearer secret until stopped — publish every 60s, generation every 5 minutes.
 *
 *   npm run dev          # in one terminal
 *   npm run cron:dev     # in another
 */
export {} // a module, so top-level await is allowed

const secret = process.env.CRON_SECRET
if (!secret) {
  console.error('Error: CRON_SECRET is not set')
  process.exit(1)
}

const port = process.env.PUBLIC_URL_PORT
const adminOrigin = `http://${process.env.ADMIN_HOSTNAME || 'localhost'}${port ? `:${port}` : ''}`

const jobs = [
  { path: '/api/cron/publish', everyMs: 60_000 },
  { path: '/api/cron/generation', everyMs: 5 * 60_000 },
]

async function call(path: string) {
  const startedAt = new Date().toISOString()
  try {
    const response = await fetch(`${adminOrigin}${path}`, { headers: { Authorization: `Bearer ${secret}` } })
    console.log(`${startedAt} ${path} → ${response.status} ${await response.text()}`)
  } catch (error) {
    console.error(`${startedAt} ${path} → ${(error as Error).message}`)
  }
}

/** Calls one route forever. Never resolves, which also keeps `payload run` from exiting. */
async function loop(path: string, everyMs: number): Promise<never> {
  for (;;) {
    await call(path)
    await new Promise((resolve) => setTimeout(resolve, everyMs))
  }
}

console.log(`cron:dev calling ${adminOrigin} — publish every 60s, generation every 5 min. Ctrl+C to stop.`)
await Promise.all(jobs.map(({ path, everyMs }) => loop(path, everyMs)))
