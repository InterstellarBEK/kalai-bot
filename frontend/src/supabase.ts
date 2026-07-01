import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const API_URL = import.meta.env.VITE_API_URL || 'https://kalai-bot.onrender.com'

// ===== Auth token cache =====
type AuthCache = {
    token: string
    expiresAt: number   // epoch seconds
    telegramId: number
}

const TOKEN_STORAGE_KEY = 'lokma_auth_token'
const REFRESH_BEFORE_EXPIRY_SEC = 300  // Tokenni tugashiga 5 daqiqa qolganda yangilash

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
        ) {
            return parsed
        }
    } catch {
        // ignore
    }
    return null
}

function writeCacheToStorage(cache: AuthCache) {
    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(cache))
    } catch {
        // ignore
    }
}

function clearCache() {
    inMemoryCache = null
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch {
        // ignore
    }
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

async function fetchNewToken(): Promise<string | null> {
    const initData = getInitData()
    if (!initData) {
        console.warn('[auth] Telegram.WebApp.initData yo\'q — auth qilinmadi')
        return null
    }

    try {
        const res = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData }),
        })

        if (!res.ok) {
            console.error('[auth] /auth/verify xato:', res.status, await res.text())
            return null
        }

        const data = await res.json() as {
            access_token: string
            telegram_id: number
            expires_in: number
        }

        const now = Math.floor(Date.now() / 1000)
        const cache: AuthCache = {
            token: data.access_token,
            expiresAt: now + data.expires_in,
            telegramId: data.telegram_id,
        }
        inMemoryCache = cache
        writeCacheToStorage(cache)
        return cache.token
    } catch (e) {
        console.error('[auth] Tarmoq xatosi:', e)
        return null
    }
}

/**
 * JWT token oling. Cache valid bo'lsa cache'dan, aks holda yangi mint.
 * Parallel chaqiruvlar bir vaqtda faqat bitta network so'rov qiladi.
 */
export async function getAuthToken(): Promise<string | null> {
    // Memory cache
    if (isCacheValid(inMemoryCache)) {
        return inMemoryCache!.token
    }

    // localStorage cache
    if (!inMemoryCache) {
        inMemoryCache = readCacheFromStorage()
        if (isCacheValid(inMemoryCache)) {
            return inMemoryCache!.token
        }
    }

    // Bir vaqtda faqat bitta refresh so'rovi
    if (inflightAuth) return inflightAuth

    inflightAuth = fetchNewToken().finally(() => {
        inflightAuth = null
    })
    return inflightAuth
}

/**
 * Telegram user ID ni cache'dan olish (network'siz).
 */
export function getCachedTelegramId(): number | null {
    if (!inMemoryCache) inMemoryCache = readCacheFromStorage()
    return inMemoryCache?.telegramId ?? null
}

/**
 * Auth cache ni tozalash (logout yoki xato holatida).
 */
export function clearAuthCache() {
    clearCache()
}

// ===== Supabase client =====
// supabase-js v2 `accessToken` callback'ni qo'llab-quvvatlaydi — har so'rovda avtomatik chaqiriladi.
// DEV rejimda (localhost, Telegram WebApp yo'q) — anon key ishlatiladi (RLS o'chirilgan holatda ishlaydi).
export const supabase = createClient(supabaseUrl, supabaseKey, {
    accessToken: async () => {
        const token = await getAuthToken()
        // Agar Telegram JWT olinmasa (dev/browser test) — anon key qaytarish
        // Bu localhost'da "Empty JWT" xatosini oldini oladi
        return token ?? supabaseKey
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
})

// ===== Foods search =====
export async function searchFoods(query: string) {
    const { data, error } = await supabase
        .from('foods')
        .select('*')
        .ilike('name_uz', `%${query}%`)
        .limit(20)

    if (error) {
        console.error('Search error:', error)
        return []
    }
    return data
}