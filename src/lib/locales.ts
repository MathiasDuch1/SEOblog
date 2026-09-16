/**
 * BCP 47 language-country codes a domain can publish in. Each domain uses exactly one.
 * Adding a country or language means editing this list — no database migration.
 */
export const SUPPORTED_LOCALES = ['en-US', 'da-DK'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** `da-DK` → `da` */
export function languageOf(locale: string): string {
  return locale.split('-')[0]
}

/** `da-DK` → `DK` */
export function countryOf(locale: string): string {
  return locale.split('-')[1]
}

/** `da-DK` → `da_DK` (Open Graph format) */
export function ogLocaleOf(locale: string): string {
  return locale.replace('-', '_')
}
