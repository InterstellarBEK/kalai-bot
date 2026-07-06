// supabase.ts — Lokma premium error handling
import { createClient, PostgrestError } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const API_URL = import.meta.env.VITE_API_URL || 'https://kalai-bot.onrender.com'

// Localhost / dev fallback uchun
const IS_DEV = import.meta.env.DEV
const DEV_TELEGRAM_ID = Number(import.meta.env.VITE_DEV_TELEGRAM_ID) || 6398568198

// ============================================================
// ERROR TAXONOMY
// ============================================================
// UI shu code'lar bo'yicha i18n key tanlaydi (errors.network, errors.auth, ...)

export type LokmaErrorCode =
    | 'network'         // Tarmoq yo'q yoki timeout
    | 'auth'            // initData yo'q / /auth/verify 401
    | 'auth_expired'    // JWT tugagan, qayta login kerak
    | 'forbidden'       // 403, RLS violation
    | 'not_found'       // 404
    | 'rate_limit'      // 429
    | 'server'          // 5xx
    | 'validation'      // Client-side noto'g'ri input
    | 'database'        // Postgrest xato
    | 'unknown'

export class LokmaError extends Error {
    readonly code: LokmaErrorCode
    readonly userMessageKey: string   // i18n key, masalan 'errors.network'
    readonly cause?: unknown
    readonly context?: Record<string, unknown>
    readonly retryable: boolean

    constructor(
        code: LokmaErrorCode,
        message: string,
        opts: {
            userMessageKey?: string
            cause?: unknown
            context?: Record<string, unknown>
            retryable?: boolean
        } = {}
    ) {
        super(message)
        this.name = 'LokmaError'
        this.code = code
        this.userMessageKey = opts.userMessageKey ?? `errors.${code}`
        this.cause = opts.cause
        this.context = opts.context
        this.retryable = opts.retryable ?? (code === 'network' || code === 'server' || code === 'rate_limit')
    }
}

export class AuthError extends LokmaError {
    constructor(message: string, opts: { cause?: unknown; expired?: boolean } = {}) {
        super(opts.expired ? 'auth_expired' : 'auth', message, {
            cause: opts.cause,
            retryable: false,
        })
        this.name = 'AuthError'
    }
}

export class NetworkError extends LokmaError {
    constructor(message: string, cause?: unknown) {
        super('network', message, { cause, retryable: true })
        this.name = 'NetworkError'
    }
}

export class DatabaseError extends LokmaError {
    constructor(message: string, cause?: PostgrestError | unknown, context?: Record<string, unknown>) {
        // Postgrest error code tahlili
        const pgErr = cause as PostgrestError | undefined
        let code: LokmaErrorCode = 'database'
        if (pgErr?.code === 'PGRST301' || pgErr?.code === '42501') code = 'forbidden'
        else if (pgErr?.code === 'PGRST116') code = 'not_found'
        super(code, message, { cause, context, retryable: false })
        this.name = 'DatabaseError'
    }
}

/** Har qanday exception'ni LokmaError'ga aylantirish. */
export function toLokmaError(e: unknown, fallback: LokmaErrorCode = 'unknown'): LokmaError {
    if (e instanceof LokmaError) return e
    if (e instanceof Error) {
        // AbortError → timeout
        if (e.name === 'AbortError') {
            return new NetworkError('So\'rov vaqti tugadi', e)
        }
        // fetch tarmoq xatosi
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            return new NetworkError(e.message, e)
        }
        return new LokmaError(fallback, e.message, { cause: e })
    }
    return new LokmaError(fallback, String(e), { cause: e })
}

// ============================================================
// LOGGER (production'da Sentry'ga ulash oson)
// ============================================================
const logger = {
    info: (scope: string, ...args: unknown[]) => console.log(`[lokma:${scope}]`, ...args),
    warn: (scope: string, ...args: unknown[]) => console.warn(`[lokma:${scope}]`, ...args),
    error: (scope: string, err: unknown, extra?: Record<string, unknown>) => {
        const lokma = err instanceof LokmaError ? err : toLokmaError(err)
        console.error(`[lokma:${scope}]`, {
            code: lokma.code,
            message: lokma.message,
            context: lokma.context,
            extra,
            cause: lokma.cause,
        })
    },
}

// ============================================================
// FETCH HELPERS: timeout + retry
// ============================================================
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 400

async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(t)
    }
}

/** Exponential backoff bilan retry. Faqat retryable xatolar uchun. */
async function withRetry<T>(
    fn: () => Promise<T>,
    opts: { maxRetries?: number; scope: string } = { scope: 'op' }
): Promise<T> {
    const max = opts.maxRetries ?? MAX_RETRIES
    let lastErr: unknown
    for (let attempt = 0; attempt <= max; attempt++) {
        try {
            return await fn()
        } catch (e) {
            lastErr = e
            const lokma = toLokmaError(e)
            if (!lokma.retryable || attempt === max) throw lokma
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200
            logger.warn(opts.scope, `retry ${attempt + 1}/${max} after ${Math.round(delay)}ms`, lokma.code)
            await new Promise(r => setTimeout(r, delay))
        }
    }
    throw toLokmaError(lastErr)
}

// ============================================================
// AUTH TOKEN CACHE
// ============================================================
type AuthCache = {
    token: string
    expiresAt: number   // epoch seconds
    telegramId: number
}

const TOKEN_STORAGE_KEY = 'lokma_auth_token'
const REFRESH_BEFORE_EXPIRY_SEC = 300

// Auth xatosini vaqtincha keshlash — log spam'ni to'xtatadi
const AUTH_FAILURE_COOLDOWN_MS = 30_000
let lastAuthFailureAt = 0

let inMemoryCache: AuthCache | null = null
let inflightAuth: Promise<string | null> | null = null

function readCacheFromStorage(): AuthCache | null {
    try {
        const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as AuthCache
        if (
            typeof parsed.token === 'string' &&
            typeof parsed.expiresAt === 'number' &&
            typeof parsed.telegramId === 'number'
        ) return parsed
    } catch (e) {
        logger.warn('auth', 'localStorage parse xato', e)
    }
    return null
}

function writeCacheToStorage(cache: AuthCache) {
    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(cache))
    } catch (e) {
        logger.warn('auth', 'localStorage yozib bo\'lmadi', e)
    }
}

function clearCache() {
    inMemoryCache = null
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch { /* ignore */ }
}

function isCacheValid(cache: AuthCache | null): boolean {
    if (!cache) return false
    const now = Math.floor(Date.now() / 1000)
    return cache.expiresAt - now > REFRESH_BEFORE_EXPIRY_SEC
}

function getInitData(): string {
    const tg = (window as any).Telegram?.WebApp
    return tg?.initData || ''
}

async function fetchNewTokenOnce(): Promise<AuthCache> {
    const initData = getInitData()

    // DEV FALLBACK: localhost'da initData bo'lmasa, mock cache yaratamiz
    // Bu Supabase'ga anon key bilan ulanishga imkon beradi (RLS off dev'da)
    if (!initData) {
        if (IS_DEV) {
            logger.info('auth', 'DEV mode — initData yo\'q, mock token bilan davom etamiz')
            const now = Math.floor(Date.now() / 1000)
            return {
                token: supabaseKey,        // anon key ishlatiladi
                expiresAt: now + 3600,     // 1 soat
                telegramId: DEV_TELEGRAM_ID,
            }
        }
        throw new AuthError('Telegram.WebApp.initData yo\'q')
    }

    let res: Response
    try {
        res = await fetchWithTimeout(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData }),
        })
    } catch (e) {
        throw toLokmaError(e)
    }

    if (res.status === 401 || res.status === 403) {
        throw new AuthError(`/auth/verify ${res.status}`, { expired: true })
    }
    if (res.status === 429) {
        throw new LokmaError('rate_limit', '/auth/verify rate limited', { retryable: true })
    }
    if (res.status >= 500) {
        throw new LokmaError('server', `/auth/verify ${res.status}`, { retryable: true })
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new LokmaError('unknown', `/auth/verify ${res.status}: ${body}`)
    }

    const data = await res.json() as {
        access_token: string
        telegram_id: number
        expires_in: number
    }
    const now = Math.floor(Date.now() / 1000)
    return {
        token: data.access_token,
        expiresAt: now + data.expires_in,
        telegramId: data.telegram_id,
    }
}

async function fetchNewToken(): Promise<string | null> {
    try {
        const cache = await withRetry(fetchNewTokenOnce, { scope: 'auth' })
        inMemoryCache = cache
        writeCacheToStorage(cache)
        lastAuthFailureAt = 0
        return cache.token
    } catch (e) {
        logger.error('auth', e)
        // Auth xatosida cache tozalash + cooldown belgilash
        if (e instanceof AuthError) clearCache()
        lastAuthFailureAt = Date.now()
        return null
    }
}

/** JWT token oling. Parallel chaqiruvlar dedup qilinadi. */
export async function getAuthToken(): Promise<string | null> {
    if (isCacheValid(inMemoryCache)) return inMemoryCache!.token
    if (!inMemoryCache) {
        inMemoryCache = readCacheFromStorage()
        if (isCacheValid(inMemoryCache)) return inMemoryCache!.token
    }
    // Cooldown — oxirgi auth xatosidan 30s o'tmagan bo'lsa, qayta urinmaymiz
    if (lastAuthFailureAt && Date.now() - lastAuthFailureAt < AUTH_FAILURE_COOLDOWN_MS) {
        return null
    }
    if (inflightAuth) return inflightAuth
    inflightAuth = fetchNewToken().finally(() => { inflightAuth = null })
    return inflightAuth
}

/** Tokenni majburiy yangilash (401 javobidan keyin). */
export async function refreshAuthToken(): Promise<string | null> {
    clearCache()
    lastAuthFailureAt = 0
    return getAuthToken()
}

export function getCachedTelegramId(): number | null {
    if (!inMemoryCache) inMemoryCache = readCacheFromStorage()
    return inMemoryCache?.telegramId ?? (IS_DEV ? DEV_TELEGRAM_ID : null)
}

export function clearAuthCache() {
    clearCache()
    lastAuthFailureAt = 0
}

// ============================================================
// SUPABASE CLIENT
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseKey, {
    accessToken: async () => {
        const token = await getAuthToken()
        return token ?? supabaseKey
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
})

// ============================================================
// RESULT TYPE — throw'siz API (tanlash mumkin)
// ============================================================
export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: LokmaError }

/** Postgrest javobini Result'ga o'rash. */
export function wrapPgResult<T>(
    resp: { data: T | null; error: PostgrestError | null },
    scope: string,
    context?: Record<string, unknown>
): Result<T> {
    if (resp.error) {
        const err = new DatabaseError(resp.error.message, resp.error, context)
        logger.error(scope, err)
        return { ok: false, error: err }
    }
    if (resp.data === null) {
        const err = new DatabaseError('Ma\'lumot topilmadi', undefined, context)
        return { ok: false, error: err }
    }
    return { ok: true, data: resp.data }
}

// ============================================================
// FOODS SEARCH
// ============================================================
export type FoodRow = {
    id: string
    name_uz: string
    [k: string]: unknown
}

export async function searchFoods(query: string): Promise<FoodRow[]> {
    const q = query.trim()
    if (!q) return []
    // Ilike wildcard'larini escape qilish (SQL injection'dan himoya emas — bu client, lekin xato natijaga qarshi)
    const safe = q.replace(/[%_\\]/g, ch => `\\${ch}`)

    try {
        const resp = await supabase
            .from('foods')
            .select('*')
            .ilike('name_uz', `%${safe}%`)
            .limit(20)

        const result = wrapPgResult<FoodRow[]>(resp, 'searchFoods', { query: q })
        return result.ok ? result.data : []
    } catch (e) {
        logger.error('searchFoods', e, { query: q })
        return []
    }
}