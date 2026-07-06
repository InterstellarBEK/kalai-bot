// usePremium.ts — Lokma premium subscription state
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, toLokmaError, LokmaError } from './supabase'
import { getTelegramId } from './telegram'

const FREE_AI_LIMIT = 3
const CACHE_TTL_MS = 30_000
const PREMIUM_EVENT = 'lokma:premium-changed'

// ============================================================
// TYPES
// ============================================================
export interface PremiumSnapshot {
    isPremium: boolean
    premiumUntil: Date | null
    daysLeft: number
    trialUsed: boolean
    aiScansUsedToday: number
}

export interface PremiumState extends PremiumSnapshot {
    aiScansLimit: number
    aiScansRemaining: number
    canScan: boolean
    loading: boolean
    error: LokmaError | null
    refresh: () => Promise<void>
}

interface UserRow {
    premium_until: string | null
    trial_used: boolean | null
    ai_scans_used_today: number | null
    ai_scans_reset_date: string | null
}

// ============================================================
// HELPERS
// ============================================================
/** Lokal kun (YYYY-MM-DD) — foydalanuvchi timezone'idagi kun boshi. */
function getLocalDayKey(d: Date = new Date()): string {
    // en-CA locale ISO-like YYYY-MM-DD beradi, lokal TZ'da
    return d.toLocaleDateString('en-CA')
}

function parseSnapshot(row: UserRow | null): PremiumSnapshot {
    const now = new Date()
    const premiumUntil = row?.premium_until ? new Date(row.premium_until) : null
    const isPremium = !!premiumUntil && premiumUntil > now
    const daysLeft = isPremium && premiumUntil
        ? Math.ceil((premiumUntil.getTime() - now.getTime()) / 86_400_000)
        : 0
    const today = getLocalDayKey(now)
    const usedToday = row?.ai_scans_reset_date === today ? (row.ai_scans_used_today ?? 0) : 0
    return {
        isPremium,
        premiumUntil,
        daysLeft,
        trialUsed: !!row?.trial_used,
        aiScansUsedToday: usedToday,
    }
}

const EMPTY_SNAPSHOT: PremiumSnapshot = {
    isPremium: false,
    premiumUntil: null,
    daysLeft: 0,
    trialUsed: false,
    aiScansUsedToday: 0,
}

// ============================================================
// SHARED CACHE + INFLIGHT DEDUP
// ============================================================
interface CacheEntry {
    snapshot: PremiumSnapshot
    ts: number
    telegramId: number
}
let cache: CacheEntry | null = null
let inflight: Promise<PremiumSnapshot> | null = null

function invalidateCache() {
    cache = null
}

/** Barcha `usePremium()` instance'larini yangilash uchun event. */
function broadcastChange() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PREMIUM_EVENT))
    }
}

async function fetchSnapshot(tgId: number): Promise<PremiumSnapshot> {
    const resp = await supabase
        .from('users')
        .select('premium_until, trial_used, ai_scans_used_today, ai_scans_reset_date')
        .eq('telegram_id', tgId)
        .maybeSingle()

    if (resp.error) {
        throw toLokmaError(resp.error)
    }
    return parseSnapshot(resp.data as UserRow | null)
}

async function loadSnapshot(tgId: number, force: boolean): Promise<PremiumSnapshot> {
    if (
        !force &&
        cache &&
        cache.telegramId === tgId &&
        Date.now() - cache.ts < CACHE_TTL_MS
    ) {
        return cache.snapshot
    }
    if (inflight) return inflight

    inflight = fetchSnapshot(tgId)
        .then(snap => {
            cache = { snapshot: snap, ts: Date.now(), telegramId: tgId }
            return snap
        })
        .finally(() => { inflight = null })

    return inflight
}

// ============================================================
// HOOK
// ============================================================
export function usePremium(): PremiumState {
    const [snapshot, setSnapshot] = useState<PremiumSnapshot>(() => {
        // Cache'dan darhol sinxron o'qish (flash oldini olish)
        return cache?.snapshot ?? EMPTY_SNAPSHOT
    })
    const [loading, setLoading] = useState<boolean>(!cache)
    const [error, setError] = useState<LokmaError | null>(null)
    const mountedRef = useRef(true)

    const load = useCallback(async (force = false) => {
        const tgId = getTelegramId()
        if (!tgId) {
            if (mountedRef.current) {
                setSnapshot(EMPTY_SNAPSHOT)
                setLoading(false)
            }
            return
        }
        if (mountedRef.current && !cache) setLoading(true)
        try {
            const snap = await loadSnapshot(tgId, force)
            if (mountedRef.current) {
                setSnapshot(snap)
                setError(null)
            }
        } catch (e) {
            const lokma = toLokmaError(e)
            console.error('[usePremium]', lokma.code, lokma.message)
            if (mountedRef.current) setError(lokma)
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        mountedRef.current = true
        load()

        // Boshqa hook instance'lar yoki incrementAiScan chaqirsa — yangilash
        const onChange = () => load(true)
        if (typeof window !== 'undefined') {
            window.addEventListener(PREMIUM_EVENT, onChange)
        }
        return () => {
            mountedRef.current = false
            if (typeof window !== 'undefined') {
                window.removeEventListener(PREMIUM_EVENT, onChange)
            }
        }
    }, [load])

    const aiScansLimit = snapshot.isPremium ? Infinity : FREE_AI_LIMIT
    const aiScansRemaining = snapshot.isPremium
        ? Infinity
        : Math.max(0, FREE_AI_LIMIT - snapshot.aiScansUsedToday)
    const canScan = snapshot.isPremium || snapshot.aiScansUsedToday < FREE_AI_LIMIT

    return {
        ...snapshot,
        aiScansLimit,
        aiScansRemaining,
        canScan,
        loading,
        error,
        refresh: () => load(true),
    }
}

// ============================================================
// AI SCAN INCREMENT
// ============================================================
/**
 * AI scan hisoblagichini oshirish.
 * Optimistic: read + increment + write. Race uchun: agar boshqa scan parallel bo'lsa
 * cache invalidate + refresh event tarqatiladi.
 *
 * TODO(schema): production'da atomic RPC `increment_ai_scan(p_telegram_id, p_today)` yozilsin.
 */
export async function incrementAiScan(): Promise<{ ok: boolean; error?: LokmaError }> {
    const tgId = getTelegramId()
    if (!tgId) {
        return { ok: false, error: new LokmaError('auth', 'Telegram ID topilmadi') }
    }
    const today = getLocalDayKey()

    try {
        const readResp = await supabase
            .from('users')
            .select('ai_scans_used_today, ai_scans_reset_date')
            .eq('telegram_id', tgId)
            .maybeSingle()

        if (readResp.error) throw toLokmaError(readResp.error)

        const row = readResp.data as { ai_scans_used_today: number | null; ai_scans_reset_date: string | null } | null
        const currentCount = row?.ai_scans_reset_date === today ? (row.ai_scans_used_today ?? 0) : 0
        const nextCount = currentCount + 1

        const writeResp = await supabase
            .from('users')
            .update({
                ai_scans_used_today: nextCount,
                ai_scans_reset_date: today,
            })
            .eq('telegram_id', tgId)

        if (writeResp.error) throw toLokmaError(writeResp.error)

        invalidateCache()
        broadcastChange()
        return { ok: true }
    } catch (e) {
        const lokma = toLokmaError(e)
        console.error('[incrementAiScan]', lokma.code, lokma.message)
        return { ok: false, error: lokma }
    }
}

/** Premium status o'zgargani haqida signal (Stars/P2P to'lovdan keyin chaqir). */
export function notifyPremiumChanged() {
    invalidateCache()
    broadcastChange()
}