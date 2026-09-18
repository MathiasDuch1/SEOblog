/**
 * DataForSEO location codes per country (ISO 3166-1 alpha-2), for the countries in
 * `SUPPORTED_LOCALES`. Confirm new codes with `dataforseo_labs/locations_and_languages`.
 *
 * No `server-only` import: the Domains collection config uses this and is loaded by the Payload CLI.
 */
export const DATAFORSEO_LOCATION_CODES: Record<string, number> = {
  US: 2840,
  DK: 2208,
}

/** The expected DataForSEO location code for a locale's country, e.g. `da-DK` → 2208. */
export function locationCodeForCountry(country: string): number | undefined {
  return DATAFORSEO_LOCATION_CODES[country.toUpperCase()]
}
