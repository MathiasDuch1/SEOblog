import 'server-only'

import { createHash, timingSafeEqual } from 'crypto'

/**
 * True when the request carries `Authorization: Bearer ${CRON_SECRET}`. Compared in constant
 * time; both sides are hashed first so their lengths always match. An unset secret rejects
 * every request.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}
