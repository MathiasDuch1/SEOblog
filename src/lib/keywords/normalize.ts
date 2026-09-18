/**
 * Keyword text normalization shared by research, clustering, and conflict detection.
 *
 * No `server-only` import: pure functions, also used from tests.
 */

/** Lowercase, trimmed, whitespace collapsed. Used to dedupe keyword rows. */
export function normalizeKeyword(keyword: string): string {
  return keyword.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Common function words per language, removed when comparing keywords for cannibalization. */
export const STOP_WORDS: Record<string, readonly string[]> = {
  en: [
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'my',
    'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
  ],
  da: [
    'af', 'at', 'de', 'den', 'der', 'det', 'du', 'en', 'er', 'et', 'for', 'fra', 'hvad',
    'hvem', 'hvilke', 'hvilken', 'hvor', 'hvordan', 'i', 'jeg', 'med', 'min', 'mit', 'og', 'om', 'på', 'som',
    'til', 'ved',
  ],
}

/**
 * Normalized keyword with the language's stop-words removed, for matching near-identical
 * phrasings such as "de bedste tarotkort" and "bedste tarotkort". Falls back to the plain
 * normalized text when every word is a stop-word.
 */
export function normalizeForComparison(keyword: string, language: string): string {
  const normalized = normalizeKeyword(keyword).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const stopWords = new Set(STOP_WORDS[language] ?? [])
  const words = normalized.split(/\s+/).filter(Boolean)
  const kept = words.filter((word) => !stopWords.has(word))
  return (kept.length > 0 ? kept : words).join(' ')
}
