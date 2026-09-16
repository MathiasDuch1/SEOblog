import { languageOf } from '../locales'

import { da } from './dictionaries/da'
import { en } from './dictionaries/en'
import type { Dictionary } from './types'

export type { Dictionary, PageType } from './types'

/**
 * UI strings are keyed by **language**, not locale: `en-US` and `en-GB` share `en`.
 * Anything that differs by country — dates, numbers — is formatted with `Intl` using the
 * full locale instead of being duplicated here.
 */
const dictionaries: Record<string, Dictionary> = { en, da }

export function getDictionary(locale: string): Dictionary {
  return dictionaries[languageOf(locale)] ?? en
}

/** Country-aware long date, e.g. `September 15, 2026` (en-US) or `15. september 2026` (da-DK). */
export function formatDate(value: string | Date, locale: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date)
}
