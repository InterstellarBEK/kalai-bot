// ramadan.ts — Lokma Ramazon rejimi
// Premium refactoring: Result<T> API, TTL cache, inflight dedup,
// timeout + retry, AbortController support, safe date parsing.
// Yil bo'yi ochiq: namoz vaqtlari va ro'za oynasi doim hisoblanadi.
// isRamadan flag'i faqat kosmetik farq uchun (countdown vs iftor hero).

import {
    type Result,
    LokmaError,
    NetworkError,
    toLokmaError,
} from './supabase'

// ============================================================
// RAMAZON SANALARI (taxminiy, yiliga ~10 kun siljiydi)
// ============================================================
const RAMADAN_DATES = [
    { start: '2026-02-17', end: '2026-03-18' },
    { start: '2027-02-06', end: '2027-03-07' },
    { start: '2028-01-27', end: '2028-02-24' },
    { start: '2029-01-15', end: '2029-02-13' },
    { start: '2030-01-05', end: '2030-02-02' },
] as const

// ============================================================
// TYPES
// ============================================================

export interface Region {
    id: string
    name: string
    lat: number
    lon: number
}

export interface PrayerTimes {
    fajr: string
    sunrise: string
    dhuhr: string
    asr: string
    maghrib: string
    isha: string
    date: string
}

export interface RamadanStatus {
    isRamadan: boolean
    isFasting: boolean
    fajrTime: Date | null
    maghribTime: Date | null
    nextEventLabel: 'iftar' | 'sahur_end' | null
    nextEventTime: Date | null
}

// ============================================================
// REGIONS — 14 O'zbekiston viloyati
// ============================================================
export const UZ_REGIONS: Region[] = [
    { id: 'tashkent_city', name: 'Toshkent sh.', lat: 41.2995, lon: 69.2401 },
    { id: 'tashkent', name: 'Toshkent vil.', lat: 41.0156, lon: 69.3471 },
    { id: 'andijan', name: 'Andijon', lat: 40.7821, lon: 72.3442 },
    { id: 'bukhara', name: 'Buxoro', lat: 39.7681, lon: 64.4556 },
    { id: 'fergana', name: "Farg'ona", lat: 40.3864, lon: 71.7864 },
    { id: 'jizzakh', name: 'Jizzax', lat: 40.1158, lon: 67.8422 },
    { id: 'namangan', name: 'Namangan', lat: 40.9983, lon: 71.6726 },
    { id: 'navoi', name: 'Navoiy', lat: 40.0844, lon: 65.3792 },
    { id: 'kashkadarya', name: 'Qashqadaryo', lat: 38.8606, lon: 65.7886 },
    { id: 'samarkand', name: 'Samarqand', lat: 39.6542, lon: 66.9597 },
    { id: 'sirdarya', name: 'Sirdaryo', lat: 40.4897, lon: 68.7842 },
    { id: 'surkhandarya', name: 'Surxondaryo', lat: 37.2242, lon: 67.2783 },
    { id: 'khorezm', name: 'Xorazm', lat: 41.5500, lon: 60.6333 },
    { id: 'karakalpakstan', name: "Qoraqalpog'iston", lat: 42.4531, lon: 59.6103 },
]

const DEFAULT_REGION_ID = 'tashkent_city'
const REGION_STORAGE_KEY = 'region_id'
const FORCE_STORAGE_KEY = 'ramadan_force'

export function getSelectedRegion(): Region {
    try {
        if (typeof localStorage === 'undefined') return UZ_REGIONS[0]
        const id = localStorage.getItem(REGION_STORAGE_KEY) || DEFAULT_REGION_ID
        return UZ_REGIONS.find((r) => r.id === id) || UZ_REGIONS[0]
    } catch {
        return UZ_REGIONS[0]
    }
}

export function setSelectedRegion(id: string): void {
    try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(REGION_STORAGE_KEY, id)
    } catch { /* ignore quota */ }
}

export function isRamadanForce(): boolean {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(FORCE_STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

// ============================================================
// SAFE DATE UTILS (timezone-aware)
// ============================================================

/** YYYY-MM-DD (local timezone) — timezone-safe */
function toLocalDateStr(date: Date): string {
    const y = date.getFullYear()
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function isRamadanActive(date: Date = new Date()): boolean {
    if (isRamadanForce()) return true
    const ds = toLocalDateStr(date)
    return RAMADAN_DATES.some((r) => ds >= r.start && ds <= r.end)
}

/** Keyingi (yoki hozirgi) Ramazon davri */
export function getNextRamadan(date: Date = new Date()): { start: string; end: string } | null {
    const ds = toLocalDateStr(date)
    const upcoming = RAMADAN_DATES.find((r) => ds <= r.end)
    return upcoming ? { start: upcoming.start, end: upcoming.end } : null
}

/** Keyingi Ramazongacha kun soni (agar hozir Ramazon bo'lsa — 0) */
export function getDaysUntilRamadan(date: Date = new Date()): number {
    if (isRamadanActive(date)) return 0
    const next = getNextRamadan(date)
    if (!next) return -1
    const today = new Date(toLocalDateStr(date) + 'T00:00:00')
    const start = new Date(next.start + 'T00:00:00')
    const diff = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
}

/** HH:MM ni bugungi Date obyektiga aylantirish (timezone-safe) */
export function parseTimeToToday(hhmm: string, baseDate: Date = new Date()): Date {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) {
        // Fallback — noto'g'ri format bo'lsa hozirgi vaqt
        return new Date(baseDate)
    }
    const d = new Date(baseDate)
    d.setHours(h, m, 0, 0)
    return d
}

// ============================================================
// PRAYER TIMES: cache + inflight dedup + timeout + retry
// ============================================================

const PRAYER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 kun (o'tmish uchun deterministik)
const FETCH_TIMEOUT_MS = 10_000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

type CacheEntry = {
    times: PrayerTimes
    savedAt: number
}

const memCache = new Map<string, PrayerTimes>()
const inflight = new Map<string, Promise<Result<PrayerTimes>>>()

function cacheKey(regionId: string, dateStr: string): string {
    return `${regionId}_${dateStr}`
}

function readLocalCache(key: string): PrayerTimes | null {
    try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(`prayer_${key}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as CacheEntry | PrayerTimes
        // Backward-compat: eski format (PrayerTimes to'g'ridan-to'g'ri)
        if ('savedAt' in parsed) {
            if (Date.now() - parsed.savedAt > PRAYER_CACHE_TTL_MS) return null
            return parsed.times
        }
        return parsed as PrayerTimes
    } catch {
        return null
    }
}

function writeLocalCache(key: string, times: PrayerTimes): void {
    try {
        if (typeof localStorage === 'undefined') return
        const entry: CacheEntry = { times, savedAt: Date.now() }
        localStorage.setItem(`prayer_${key}`, JSON.stringify(entry))
    } catch { /* ignore quota */ }
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    // External abort'ni ham qo'llab-quvvatlash
    if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    try {
        return await fetch(url, { signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

async function fetchPrayerTimesOnce(
    region: Region,
    dateStr: string,
    signal?: AbortSignal
): Promise<PrayerTimes> {
    const [y, m, d] = dateStr.split('-')
    const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${region.lat}&longitude=${region.lon}&method=2&school=1`

    const res = await fetchWithTimeout(url, signal)
    if (!res.ok) {
        throw new LokmaError('server', `Aladhan API ${res.status}`, {
            retryable: res.status >= 500,
            context: { url },
        })
    }

    const json = await res.json() as { data?: { timings?: Record<string, string> } }
    const t = json?.data?.timings
    if (!t || !t.Fajr || !t.Maghrib) {
        throw new LokmaError('server', 'Aladhan API: timings yo\'q', { context: { json } })
    }

    return {
        fajr: t.Fajr.slice(0, 5),
        sunrise: (t.Sunrise ?? '00:00').slice(0, 5),
        dhuhr: (t.Dhuhr ?? '00:00').slice(0, 5),
        asr: (t.Asr ?? '00:00').slice(0, 5),
        maghrib: t.Maghrib.slice(0, 5),
        isha: (t.Isha ?? '00:00').slice(0, 5),
        date: dateStr,
    }
}

async function fetchPrayerTimesWithRetry(
    region: Region,
    dateStr: string,
    signal?: AbortSignal
): Promise<Result<PrayerTimes>> {
    let lastErr: LokmaError | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const times = await fetchPrayerTimesOnce(region, dateStr, signal)
            return { ok: true, data: times }
        } catch (e) {
            // AbortError → darhol chiqamiz, retry qilmaymiz
            if (e instanceof Error && e.name === 'AbortError') {
                return {
                    ok: false,
                    error: new NetworkError('So\'rov bekor qilindi', e),
                }
            }
            const lokma = toLokmaError(e, 'network')
            lastErr = lokma
            if (!lokma.retryable || attempt === MAX_RETRIES) break
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200
            await new Promise((r) => setTimeout(r, delay))
        }
    }

    return {
        ok: false,
        error: lastErr ?? new NetworkError('Namoz vaqtlarini yuklab bo\'lmadi'),
    }
}

/**
 * Namoz vaqtlarini olish — cache + inflight dedup bilan.
 * Har xil komponent bir vaqtda so'rasa, bitta network so'rov qilinadi.
 */
export async function getPrayerTimes(
    date: Date = new Date(),
    region?: Region,
    signal?: AbortSignal
): Promise<Result<PrayerTimes>> {
    const r = region || getSelectedRegion()
    const ds = toLocalDateStr(date)
    const key = cacheKey(r.id, ds)

    // 1) In-memory cache
    const memHit = memCache.get(key)
    if (memHit) return { ok: true, data: memHit }

    // 2) localStorage cache (TTL)
    const localHit = readLocalCache(key)
    if (localHit) {
        memCache.set(key, localHit)
        return { ok: true, data: localHit }
    }

    // 3) Inflight dedup — parallel chaqiruvlar bir promise'ga birlashadi
    const existing = inflight.get(key)
    if (existing) return existing

    const promise = fetchPrayerTimesWithRetry(r, ds, signal)
        .then((result) => {
            if (result.ok) {
                memCache.set(key, result.data)
                writeLocalCache(key, result.data)
            }
            return result
        })
        .finally(() => {
            inflight.delete(key)
        })

    inflight.set(key, promise)
    return promise
}

// ============================================================
// RAMAZON STATUS — yuqori darajali API (yil bo'yi ochiq)
// ============================================================

/**
 * Namoz vaqtlari asosida ro'za oynasi va keyingi voqea.
 * Ramazon bo'lmasa ham hisoblanadi — foydalanuvchi doim namoz vaqtlarini
 * va (agar xohlasa) ixtiyoriy ro'zani kuzatishi mumkin.
 * isRamadan flag'i faqat sana asosida — UI ramziy farq uchun ishlatadi.
 */
export async function getRamadanStatus(
    now: Date = new Date(),
    signal?: AbortSignal
): Promise<Result<RamadanStatus>> {
    const region = getSelectedRegion()
    const todayResult = await getPrayerTimes(now, region, signal)
    if (!todayResult.ok) return todayResult

    const today = todayResult.data
    const fajr = parseTimeToToday(today.fajr, now)
    const maghrib = parseTimeToToday(today.maghrib, now)
    const isFasting = now >= fajr && now < maghrib

    let nextEventTime: Date
    let nextEventLabel: 'iftar' | 'sahur_end'

    if (isFasting) {
        nextEventTime = maghrib
        nextEventLabel = 'iftar'
    } else if (now < fajr) {
        nextEventTime = fajr
        nextEventLabel = 'sahur_end'
    } else {
        // Maghrib'dan keyin — ertangi fajr
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowResult = await getPrayerTimes(tomorrow, region, signal)
        if (!tomorrowResult.ok) return tomorrowResult
        nextEventTime = parseTimeToToday(tomorrowResult.data.fajr, tomorrow)
        nextEventLabel = 'sahur_end'
    }

    return {
        ok: true,
        data: {
            isRamadan: isRamadanActive(now),
            isFasting,
            fajrTime: fajr,
            maghribTime: maghrib,
            nextEventLabel,
            nextEventTime,
        },
    }
}

// ============================================================
// FORMATTING
// ============================================================

export function formatCountdown(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

// ============================================================
// CACHE CLEAR (test/dev uchun)
// ============================================================

export function clearPrayerCache(): void {
    memCache.clear()
    inflight.clear()
    try {
        if (typeof localStorage === 'undefined') return
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && k.startsWith('prayer_')) keysToRemove.push(k)
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
}