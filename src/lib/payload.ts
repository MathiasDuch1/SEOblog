import 'server-only'

import config from '@payload-config'
import { getPayload } from 'payload'

/** Server-side Payload Local API client. Import Payload through this module, never from the browser. */
export function getPayloadClient() {
  return getPayload({ config })
}
