import { ValidationError } from 'payload'
import type { CollectionBeforeValidateHook } from 'payload'

import type { Domain } from '@/payload-types'

import { countryOf, languageOf } from '../locales'
import { locationCodeForCountry } from './locations'

/**
 * Domains `beforeValidate` hook: DataForSEO research must run in the domain's own language
 * and country. A language that doesn't match the locale is rejected; a location code that
 * doesn't match the locale's country is only warned about, since a country can have
 * several valid DataForSEO locations.
 *
 * No `server-only` import: collection configs are loaded by the Payload CLI too.
 */
export const validateDomainTarget: CollectionBeforeValidateHook<Domain> = ({ collection, data, originalDoc, req }) => {
  if (!data) return data
  const locale = data.locale ?? originalDoc?.locale
  const target = { ...originalDoc?.dataforseo, ...data.dataforseo }
  if (!locale) return data

  const languageCode = typeof target.languageCode === 'string' ? target.languageCode.trim() : target.languageCode
  if (languageCode && languageCode !== languageOf(locale)) {
    throw new ValidationError({
      collection: collection.slug,
      errors: [
        {
          path: 'dataforseo.languageCode',
          message: `DataForSEO language "${languageCode}" doesn't match the domain locale ${locale}; use "${languageOf(locale)}"`,
        },
      ],
      req,
    })
  }

  const expected = locationCodeForCountry(countryOf(locale))
  if (typeof target.locationCode === 'number' && expected !== undefined && target.locationCode !== expected) {
    req.payload.logger.warn(
      `Domain ${data.hostname ?? originalDoc?.hostname}: DataForSEO location ${target.locationCode} differs from ${expected}, the usual code for ${countryOf(locale)}`,
    )
  }

  return data
}
