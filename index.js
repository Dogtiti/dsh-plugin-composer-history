/**
 * Host half of the composer-history bundle.
 *
 * One authenticated Fetch route answers with the prompts this Session already sent,
 * oldest first, read straight from the Session log. The Client half only binds keys
 * and writes drafts; it never guesses what the conversation contained.
 */

export const name = 'composer-history'

export const inject = ['connection']

/** Route the browser addresses document-relatively. */
const ROUTE_PATH = '/api/composer.history'

/** Per-Session answer cache size; a Session's `seq` invalidates its own entry. */
const CACHE_LIMIT = 64

const DEFAULTS = {
  enabled: true,
  limit: 200,
  maxChars: 2000,
  cacheTtlMs: 30000,
}

/**
 * Register the history route.
 * @param ctx - Host context carrying the Web connection.
 * @param config - row configuration from the bundle patch.
 */
export function apply(ctx, config = {}) {
  const settings = resolveSettings(config)
  const cache = new Map()
  ctx.effect(() => {
    const connection = Reflect.get(ctx, 'connection')
    const dispose = connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => handle(ctx, request, settings, cache),
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'composer-history: fetch route')
}

/**
 * Answer one history request.
 * @param ctx - Host context.
 * @param request - buffered Fetch request whose body is `{ sessionId }`.
 * @param settings - resolved plugin settings.
 * @param cache - per-Session answer cache.
 * @returns a JSON response.
 */
async function handle(ctx, request, settings, cache) {
  if (settings.enabled !== true) return json(503, { items: [], error: 'disabled' })

  let payload
  try {
    payload = await request.json()
  } catch {
    return json(400, { items: [], error: 'invalid-body' })
  }

  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
  if (sessionId === '') return json(400, { items: [], error: 'missing-session' })

  const session = safe(() => ctx.get('sessions')?.get?.(sessionId))
  if (!session) return json(404, { items: [], error: 'session-not-found' })

  const seq = Number(session.seq) || 0
  const cached = cache.get(sessionId)
  if (cached !== undefined && cached.seq === seq && Date.now() - cached.time < settings.cacheTtlMs) {
    return json(200, { items: cached.items })
  }

  const items = promptsOf(session, settings)
  remember(cache, sessionId, { seq, items, time: Date.now() })
  return json(200, { items })
}

/**
 * Collect the prompts the human sent, oldest first.
 * @param session - live Session.
 * @param settings - resolved plugin settings.
 * @returns prompt texts, consecutive duplicates collapsed, capped to `limit`.
 */
function promptsOf(session, settings) {
  const messages = safe(() => session.deriveMessages()) ?? []
  const items = []
  for (const message of messages) {
    if (message?.role !== 'user') continue
    /* A message the runtime injected (system prompt, developer notice, context block)
     * is not something the user typed, so it never becomes history. */
    if (message.source !== undefined && message.source?.kind !== 'user') continue
    const blocks = Array.isArray(message.content) ? message.content : []
    const text = blocks
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (text === '') continue
    if (text.startsWith('<')) continue
    const clipped = clip(text, settings.maxChars)
    if (items[items.length - 1] !== clipped) items.push(clipped)
  }
  return items.slice(-Math.max(1, settings.limit))
}

/**
 * Keep the cache bounded, most recently used last.
 * @param cache - session cache.
 * @param key - Session id.
 * @param entry - cached answer.
 */
function remember(cache, key, entry) {
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done === true) break
    cache.delete(oldest.value)
  }
}

/**
 * Trim one prompt to a usable length, keeping both ends.
 * @param text - prompt text.
 * @param limit - maximum characters.
 * @returns the trimmed text.
 */
function clip(text, limit) {
  if (limit <= 0 || text.length <= limit) return text
  const head = Math.max(1, Math.floor(limit * 0.8))
  const tail = Math.max(1, limit - head - 3)
  return `${text.slice(0, head)} … ${text.slice(-tail)}`
}

/**
 * Read a value without letting an unavailable capability break the route.
 * @param read - thunk returning the value.
 * @returns the value or undefined.
 */
function safe(read) {
  try {
    return read()
  } catch {
    return undefined
  }
}

/**
 * Build one JSON response.
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 * @returns the response.
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Merge row configuration over the defaults.
 * @param config - row configuration.
 * @returns resolved settings.
 */
function resolveSettings(config) {
  const merged = { ...DEFAULTS }
  for (const [key, value] of Object.entries(config ?? {})) {
    if (!(key in DEFAULTS)) continue
    if (typeof DEFAULTS[key] === 'number') {
      const number = Number(value)
      if (Number.isFinite(number) && number >= 0) merged[key] = number
      continue
    }
    if (typeof DEFAULTS[key] === 'boolean') {
      merged[key] = value === true || value === 'true'
      continue
    }
    if (typeof value === 'string') merged[key] = value
  }
  return merged
}
