// fasting.ts — Lokma intermittent fasting sessions
// Premium refactoring: Result<T> API, auth & input validation,
// double-close guard, safe date parsing.

import {
    supabase,
    wrapPgResult,
    type Result,
    LokmaError,
    AuthError,
} from './supabase'

// ============================================================
// TYPES
// ============================================================

export type FastingStatus = 'active' | 'completed' | 'broken'

export interface FastingSession {
    id: number
    telegram_id: number
    start_time: string
    end_time: string | null
    target_hours: number
    status: FastingStatus
    created_at: string
}

export const FASTING_PRESETS = [
    { label: '16:8', hours: 16, descKey: 'fast_preset_popular' },
    { label: '18:6', hours: 18, descKey: 'fast_preset_mid' },
    { label: '20:4', hours: 20, descKey: 'fast_preset_warrior' },
    { label: '23:1', hours: 23, descKey: 'fast_preset_omad' },
] as const

// Chegaralar
const MIN_TARGET_HOURS = 1
const MAX_TARGET_HOURS = 72
const DEFAULT_RECENT_LIMIT = 7
const MAX_RECENT_LIMIT = 100

// ============================================================
// VALIDATION HELPERS
// ============================================================

function requireValidId(telegramId: number): number {
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
        throw new AuthError('Telegram ID noto\'g\'ri')
    }
    return telegramId
}

function validateTargetHours(hours: number): LokmaError | null {
    if (!Number.isFinite(hours) || hours < MIN_TARGET_HOURS || hours > MAX_TARGET_HOURS) {
        return new LokmaError(
            'validation',
            `Target hours ${MIN_TARGET_HOURS}-${MAX_TARGET_HOURS} oralig'ida bo'lishi kerak`,
            { context: { hours } }
        )
    }
    return null
}

function validateSessionId(id: number): LokmaError | null {
    if (!Number.isFinite(id) || id <= 0) {
        return new LokmaError('validation', 'Session ID noto\'g\'ri', { context: { id } })
    }
    return null
}

function validateIsoDate(iso: string, field: string): LokmaError | null {
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) {
        return new LokmaError('validation', `${field} noto'g'ri sana`, { context: { iso } })
    }
    // Kelajakdagi startTime — 1 daqiqagacha tolerable clock skew
    if (t > Date.now() + 60_000) {
        return new LokmaError('validation', `${field} kelajakda`, { context: { iso } })
    }
    return null
}

// ============================================================
// GET ACTIVE FAST
// ============================================================

export async function getActiveFastResult(
    telegramId: number
): Promise<Result<FastingSession | null>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const resp = await supabase
        .from('fasting_sessions')
        .select('*')
        .eq('telegram_id', tgId)
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()

    // maybeSingle: row bo'lmasa data=null, error=null
    if (resp.error) {
        return {
            ok: false,
            error: new LokmaError('database', resp.error.message, {
                cause: resp.error,
                context: { tgId },
            }),
        }
    }
    return { ok: true, data: (resp.data as FastingSession | null) ?? null }
}

/** @deprecated `getActiveFastResult` ishlating. */
export async function getActiveFast(telegramId: number): Promise<FastingSession | null> {
    const r = await getActiveFastResult(telegramId)
    return r.ok ? r.data : null
}

// ============================================================
// START FAST
// ============================================================

export async function startFastResult(
    telegramId: number,
    targetHours: number,
    customStartTime?: string
): Promise<Result<FastingSession>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const hoursErr = validateTargetHours(targetHours)
    if (hoursErr) return { ok: false, error: hoursErr }

    if (customStartTime) {
        const dateErr = validateIsoDate(customStartTime, 'customStartTime')
        if (dateErr) return { ok: false, error: dateErr }
    }

    // Faol sessiya bor bo'lsa — uni qaytar (idempotent)
    const activeRes = await getActiveFastResult(tgId)
    if (!activeRes.ok) return { ok: false, error: activeRes.error }
    if (activeRes.data) return { ok: true, data: activeRes.data }

    const payload: Record<string, unknown> = {
        telegram_id: tgId,
        target_hours: targetHours,
        status: 'active',
    }
    if (customStartTime) payload.start_time = customStartTime

    const resp = await supabase
        .from('fasting_sessions')
        .insert(payload)
        .select()
        .single()

    const result = wrapPgResult<FastingSession>(resp, 'startFast', { tgId, targetHours })
    return result
}

/** @deprecated `startFastResult` ishlating. */
export async function startFast(
    telegramId: number,
    targetHours: number,
    customStartTime?: string
): Promise<FastingSession | null> {
    const r = await startFastResult(telegramId, targetHours, customStartTime)
    return r.ok ? r.data : null
}

// ============================================================
// END FAST
// ============================================================

/**
 * Faol sessiyani yakunlaydi. WHERE status='active' — double-close'dan himoya.
 */
export async function endFastResult(
    sessionId: number,
    completed: boolean
): Promise<Result<true>> {
    const idErr = validateSessionId(sessionId)
    if (idErr) return { ok: false, error: idErr }

    const resp = await supabase
        .from('fasting_sessions')
        .update({
            end_time: new Date().toISOString(),
            status: completed ? 'completed' : 'broken',
        })
        .eq('id', sessionId)
        .eq('status', 'active')
        .select('id')

    const result = wrapPgResult<Array<{ id: number }>>(
        resp,
        'endFast',
        { sessionId, completed }
    )
    if (!result.ok) return { ok: false, error: result.error }

    if (result.data.length === 0) {
        return {
            ok: false,
            error: new LokmaError('not_found', 'Faol sessiya topilmadi yoki allaqachon yakunlangan', {
                context: { sessionId },
            }),
        }
    }
    return { ok: true, data: true }
}

/** @deprecated `endFastResult` ishlating. */
export async function endFast(sessionId: number, completed: boolean): Promise<boolean> {
    const r = await endFastResult(sessionId, completed)
    return r.ok
}

// ============================================================
// RECENT FASTS
// ============================================================

export async function getRecentFastsResult(
    telegramId: number,
    limit: number = DEFAULT_RECENT_LIMIT
): Promise<Result<FastingSession[]>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const safeLimit = Math.max(1, Math.min(MAX_RECENT_LIMIT, Math.floor(limit) || DEFAULT_RECENT_LIMIT))

    const resp = await supabase
        .from('fasting_sessions')
        .select('*')
        .eq('telegram_id', tgId)
        .neq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(safeLimit)

    return wrapPgResult<FastingSession[]>(resp, 'getRecentFasts', { tgId, limit: safeLimit })
}

/** @deprecated `getRecentFastsResult` ishlating. */
export async function getRecentFasts(
    telegramId: number,
    limit: number = DEFAULT_RECENT_LIMIT
): Promise<FastingSession[]> {
    const r = await getRecentFastsResult(telegramId, limit)
    return r.ok ? r.data : []
}

// ============================================================
// PURE HELPERS (safe against invalid input)
// ============================================================

export function calcElapsedHours(startTime: string): number {
    const start = Date.parse(startTime)
    if (!Number.isFinite(start)) return 0
    const elapsed = (Date.now() - start) / (1000 * 60 * 60)
    return elapsed < 0 ? 0 : elapsed
}

export function calcProgress(startTime: string, targetHours: number): number {
    if (!Number.isFinite(targetHours) || targetHours <= 0) return 0
    const elapsed = calcElapsedHours(startTime)
    return Math.min((elapsed / targetHours) * 100, 100)
}

export function formatDuration(hours: number): string {
    if (!Number.isFinite(hours) || hours < 0) return '00:00:00'
    const h = Math.floor(hours)
    const m = Math.floor((hours - h) * 60)
    const s = Math.floor(((hours - h) * 60 - m) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}