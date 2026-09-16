/**
 * BCP 47 language-country codes a domain can publish in. Each domain uses exactly one.
 * Adding a country or language means editing this list — no database migration.
 */
export const SUPPORTED_LOCALES = ['en-GB', 'en-US', 'de-DE'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** `de-DE` → `de` */
export function languageOf(locale: string): string {
  return locale.split('-')[0]
}

/** `de-DE` → `DE` */
export function countryOf(locale: string): string {
  return locale.split('-')[1]
}

/** `de-DE` → `de_DE` (Open Graph format) */
export function ogLocaleOf(locale: string): string {
  return locale.replace('-', '_')
}
