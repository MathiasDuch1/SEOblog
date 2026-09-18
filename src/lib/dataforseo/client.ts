import 'server-only'

/**
 * Thin typed wrapper over the DataForSEO Labs keyword endpoints used for research.
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live/
 *
 * - Requests are `POST` with a JSON array of tasks; live endpoints accept one task per call.
 * - Every response has a top-level `status_code` and each task its own; `20000` means OK.
 * - `related_keywords` nests each item's data under `keyword_data`; the other endpoints don't.
 */

export const KEYWORD_ENDPOINTS = ['related_keywords', 'keyword_suggestions', 'keyword_ideas'] as const
export type KeywordEndpoint = (typeof KEYWORD_ENDPOINTS)[number]

export const KEYWORD_INTENTS = ['informational', 'navigational', 'commercial', 'transactional'] as const
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number]

export type KeywordRow = {
  keyword: string
  searchVolume: number | null
  cpc: number | null
  /** Paid-search competition, 0–1 */
  competition: number | null
  /** Organic ranking difficulty, 0–100 */
  keywordDifficulty: number | null
  intent: KeywordIntent | null
  /** DataForSEO's synonym group: close variants of one query share it. `null` when the keyword has none. */
  coreKeyword: string | null
}

export type KeywordResponse = {
  endpoint: KeywordEndpoint
  rows: KeywordRow[]
  costUsd: number
}

export type KeywordRequest = {
  endpoint: KeywordEndpoint
  /** `related_keywords` and `keyword_suggestions` take one seed per call; `keyword_ideas` takes up to 200. */
  seeds: string[]
  locationCode: number
  languageCode: string
  /** Maximum keywords returned by this call (1–1000). Required so every call's cost is bounded. */
  limit: number
}

const OK = 20000
const MAX_LIMIT = 1000
const MAX_IDEAS_SEEDS = 200
/** DataForSEO allows 2,000 calls per minute and 30 simultaneous requests; stay below both. */
const MIN_INTERVAL_MS = 35
const MAX_CONCURRENT = 20

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly statusMessage: string,
    readonly endpoint?: KeywordEndpoint,
  ) {
    super(message)
    this.name = 'DataForSeoError'
  }
}

// ---------------------------------------------------------------- response parsing

type RawStatus = { status_code?: number; status_message?: string; cost?: number }
type RawKeywordData = {
  keyword?: string
  keyword_info?: { search_volume?: number | null; cpc?: number | null; competition?: number | null } | null
  keyword_properties?: { keyword_difficulty?: number | null; core_keyword?: string | null } | null
  search_intent_info?: { main_intent?: string | null } | null
}
type RawItem = RawKeywordData & { keyword_data?: RawKeywordData }
type RawTask = RawStatus & { result?: { items?: RawItem[] | null }[] | null }
export type RawResponse = RawStatus & { tasks?: RawTask[] | null }

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function toKeywordRow(item: RawItem): KeywordRow | null {
  const data = item.keyword_data ?? item
  const keyword = data.keyword?.trim()
  if (!keyword) return null
  const intent = data.search_intent_info?.main_intent
  const coreKeyword = data.keyword_properties?.core_keyword?.trim()
  return {
    keyword,
    searchVolume: num(data.keyword_info?.search_volume),
    cpc: num(data.keyword_info?.cpc),
    competition: num(data.keyword_info?.competition),
    keywordDifficulty: num(data.keyword_properties?.keyword_difficulty),
    intent: (KEYWORD_INTENTS as readonly string[]).includes(intent ?? '') ? (intent as KeywordIntent) : null,
    coreKeyword: coreKeyword || null,
  }
}

/**
 * Checks the top-level and per-task status and maps every item to a typed row. Throws a
 * `DataForSeoError` for any non-20000 status — including a failed task inside a response
 * whose top-level status is OK.
 */
export function parseKeywordResponse(endpoint: KeywordEndpoint, body: RawResponse): KeywordResponse {
  if (body.status_code !== OK) {
    throw new DataForSeoError(
      `DataForSEO ${endpoint} failed: ${body.status_code} ${body.status_message ?? ''}`.trim(),
      body.status_code ?? 0,
      body.status_message ?? '',
      endpoint,
    )
  }
  const tasks = body.tasks ?? []
  if (tasks.length === 0) {
    throw new DataForSeoError(`DataForSEO ${endpoint} returned no tasks`, 0, 'No tasks', endpoint)
  }

  const rows: KeywordRow[] = []
  for (const task of tasks) {
    if (task.status_code !== OK) {
      throw new DataForSeoError(
        `DataForSEO ${endpoint} task failed: ${task.status_code} ${task.status_message ?? ''}`.trim(),
        task.status_code ?? 0,
        task.status_message ?? '',
        endpoint,
      )
    }
    for (const result of task.result ?? []) {
      for (const item of result.items ?? []) {
        const row = toKeywordRow(item)
        if (row) rows.push(row)
      }
    }
  }
  return { endpoint, rows, costUsd: num(body.cost) ?? 0 }
}

// ---------------------------------------------------------------- request body

/** The single-task request body for one live call. */
export function buildTask({ endpoint, seeds, locationCode, languageCode, limit }: KeywordRequest) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer from 1 to ${MAX_LIMIT}`)
  }
  const cleaned = seeds.map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (cleaned.length === 0) throw new Error('At least one seed keyword is required')

  const base = { location_code: locationCode, language_code: languageCode, limit }
  if (endpoint === 'keyword_ideas') {
    if (cleaned.length > MAX_IDEAS_SEEDS) throw new Error(`keyword_ideas takes at most ${MAX_IDEAS_SEEDS} seeds`)
    return { ...base, keywords: cleaned }
  }
  if (cleaned.length !== 1) throw new Error(`${endpoint} takes exactly one seed per call`)
  // related_keywords: depth 2 reaches roughly 70 keywords before `limit` applies.
  return endpoint === 'related_keywords' ? { ...base, keyword: cleaned[0], depth: 2 } : { ...base, keyword: cleaned[0] }
}

// ---------------------------------------------------------------- throttle

let active = 0
let nextStart = 0
const queue: (() => void)[] = []

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  // A released slot is handed straight to the next waiter, so `active` never exceeds the cap.
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.push(resolve))
  else active++
  try {
    const now = Date.now()
    const wait = Math.max(0, nextStart - now)
    nextStart = Math.max(now, nextStart) + MIN_INTERVAL_MS
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return await fn()
  } finally {
    const next = queue.shift()
    if (next) next()
    else active--
  }
}

// ---------------------------------------------------------------- calls

function credentials() {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set')
  const baseUrl = (process.env.DATAFORSEO_BASE_URL || 'https://sandbox.dataforseo.com').replace(/\/+$/, '')
  return { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`, baseUrl }
}

/** Calls one Labs keyword endpoint (one task) and returns typed rows and the reported cost. */
export async function fetchKeywords(request: KeywordRequest): Promise<KeywordResponse> {
  const task = buildTask(request)
  const { authorization, baseUrl } = credentials()
  const url = `${baseUrl}/v3/dataforseo_labs/google/${request.endpoint}/live`

  const body = await throttled(async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify([task]),
      cache: 'no-store',
    })
    const text = await response.text()
    try {
      return JSON.parse(text) as RawResponse
    } catch {
      throw new DataForSeoError(
        `DataForSEO ${request.endpoint} returned HTTP ${response.status} without JSON`,
        response.status,
        text.slice(0, 200),
        request.endpoint,
      )
    }
  })

  const result = parseKeywordResponse(request.endpoint, body)
  console.info(
    `[dataforseo] ${request.endpoint} ${request.locationCode}/${request.languageCode} "${request.seeds.join(', ')}": ${result.rows.length} rows, $${result.costUsd.toFixed(5)} (${baseUrl})`,
  )
  return result
}
