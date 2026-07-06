// water.ts
// ============================================================
// LOKMA — Water tracking module (premium refactor)
// - Result<T> error handling
// - Module-level cache + inflight dedup
// - Invalidation on writes
// - Xato yashirilmaydi, hammasi type-safe
// ============================================================

import { supabase, toLokmaError, type Result } from './supabase';
import { getTelegramId } from './telegram';

// ============================================================
// TYPES
// ============================================================
export interface WaterLog {
    id: string;
    telegram_id: number;
    amount_ml: number;
    logged_at: string;
}

export interface TodayWaterSummary {
    total_ml: number;
    logs_count: number;
}

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_WATER_GOAL_ML = 2000;
const MIN_WATER_ML = 1;
const MAX_WATER_ML = 5000; // sanity — bir marta 5L dan ortiq bo'lmaydi
const MIN_GOAL_ML = 500;
const MAX_GOAL_ML = 10_000;

// Cache TTL
const TODAY_CACHE_TTL_MS = 30_000;   // 30s — real-time'ga yaqin
const GOAL_CACHE_TTL_MS = 5 * 60_000; // 5min — kam o'zgaradi

// ============================================================
// CACHE + INFLIGHT DEDUP
// ============================================================
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const todayCache = new Map<number, CacheEntry<TodayWaterSummary>>();
const goalCache = new Map<number, CacheEntry<number>>();

const todayInflight = new Map<number, Promise<Result<TodayWaterSummary>>>();
const goalInflight = new Map<number, Promise<Result<number>>>();

function getCached<T>(cache: Map<number, CacheEntry<T>>, key: number): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCached<T>(cache: Map<number, CacheEntry<T>>, key: number, data: T, ttlMs: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Bugungi cache'ni invalidate qilish — har write'dan keyin */
function invalidateTodayCache(telegramId: number): void {
    todayCache.delete(telegramId);
}

/** Goal cache'ni invalidate qilish — setWaterGoal'dan keyin */
function invalidateGoalCache(telegramId: number): void {
    goalCache.delete(telegramId);
}

/** Testing / logout uchun to'liq tozalash */
export function clearWaterCache(): void {
    todayCache.clear();
    goalCache.clear();
    todayInflight.clear();
    goalInflight.clear();
}

// ============================================================
// PURE HELPERS
// ============================================================
function startOfTodayISO(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function isValidAmount(ml: number): boolean {
    return Number.isFinite(ml) && ml >= MIN_WATER_ML && ml <= MAX_WATER_ML;
}

function isValidGoal(ml: number): boolean {
    return Number.isFinite(ml) && ml >= MIN_GOAL_ML && ml <= MAX_GOAL_ML;
}

// ============================================================
// READ: getTodayWaterSummary (cache + dedup)
// ============================================================
export async function getTodayWaterSummary(
    opts?: { forceRefresh?: boolean }
): Promise<Result<TodayWaterSummary>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return { ok: true, data: { total_ml: 0, logs_count: 0 } };
    }

    if (!opts?.forceRefresh) {
        const cached = getCached(todayCache, telegramId);
        if (cached) return { ok: true, data: cached };

        const inflight = todayInflight.get(telegramId);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<TodayWaterSummary>> => {
        try {
            const { data, error } = await supabase
                .from('water_logs')
                .select('amount_ml')
                .eq('telegram_id', telegramId)
                .gte('logged_at', startOfTodayISO());

            if (error) {
                return { ok: false, error: toLokmaError(error, 'database') };
            }

            const rows = data ?? [];
            const summary: TodayWaterSummary = {
                total_ml: rows.reduce((sum, r) => sum + (Number(r.amount_ml) || 0), 0),
                logs_count: rows.length,
            };
            setCached(todayCache, telegramId, summary, TODAY_CACHE_TTL_MS);
            return { ok: true, data: summary };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            todayInflight.delete(telegramId);
        }
    })();

    todayInflight.set(telegramId, promise);
    return promise;
}

/** Backward-compat helper — faqat total ml */
export async function getTodayWater(): Promise<Result<number>> {
    const res = await getTodayWaterSummary();
    if (!res.ok) return res;
    return { ok: true, data: res.data.total_ml };
}

// ============================================================
// READ: getWaterGoal (cache + dedup)
// ============================================================
export async function getWaterGoal(
    opts?: { forceRefresh?: boolean }
): Promise<Result<number>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return { ok: true, data: DEFAULT_WATER_GOAL_ML };
    }

    if (!opts?.forceRefresh) {
        const cached = getCached(goalCache, telegramId);
        if (cached !== null) return { ok: true, data: cached };

        const inflight = goalInflight.get(telegramId);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<number>> => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('water_goal_ml')
                .eq('telegram_id', telegramId)
                .maybeSingle();

            if (error) {
                return { ok: false, error: toLokmaError(error, 'database') };
            }

            const goal =
                typeof data?.water_goal_ml === 'number' && data.water_goal_ml > 0
                    ? data.water_goal_ml
                    : DEFAULT_WATER_GOAL_ML;

            setCached(goalCache, telegramId, goal, GOAL_CACHE_TTL_MS);
            return { ok: true, data: goal };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            goalInflight.delete(telegramId);
        }
    })();

    goalInflight.set(telegramId, promise);
    return promise;
}

// ============================================================
// WRITE: addWater
// ============================================================
export async function addWater(amountMl: number): Promise<Result<{ id: string }>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return {
            ok: false,
            error: toLokmaError(new Error('Telegram ID mavjud emas'), 'auth'),
        };
    }

    if (!isValidAmount(amountMl)) {
        return {
            ok: false,
            error: toLokmaError(
                new Error(`Noto'g'ri suv miqdori: ${amountMl} ml (${MIN_WATER_ML}-${MAX_WATER_ML} oralig'ida bo'lishi kerak)`),
                'validation'
            ),
        };
    }

    try {
        const { data, error } = await supabase
            .from('water_logs')
            .insert({ telegram_id: telegramId, amount_ml: Math.round(amountMl) })
            .select('id')
            .single();

        if (error) {
            return { ok: false, error: toLokmaError(error, 'database') };
        }
        if (!data) {
            return {
                ok: false,
                error: toLokmaError(
                    new Error("Suv qo'shildi lekin ID qaytmadi"),
                    'database'
                ),
            };
        }

        invalidateTodayCache(telegramId);
        return { ok: true, data: { id: String(data.id) } };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// WRITE: removeLastWater (undo — bugungi oxirgi log)
// ============================================================
export async function removeLastWater(): Promise<Result<{ removedId: string } | null>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return { ok: true, data: null };
    }

    try {
        const { data: lastRow, error: selectErr } = await supabase
            .from('water_logs')
            .select('id')
            .eq('telegram_id', telegramId)
            .gte('logged_at', startOfTodayISO())
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (selectErr) {
            return { ok: false, error: toLokmaError(selectErr, 'database') };
        }
        if (!lastRow) {
            return { ok: true, data: null };
        }

        const { error: deleteErr } = await supabase
            .from('water_logs')
            .delete()
            .eq('id', lastRow.id);

        if (deleteErr) {
            return { ok: false, error: toLokmaError(deleteErr, 'database') };
        }

        invalidateTodayCache(telegramId);
        return { ok: true, data: { removedId: String(lastRow.id) } };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// WRITE: setWaterGoal (Premium settings uchun)
// ============================================================
export async function setWaterGoal(goalMl: number): Promise<Result<null>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return {
            ok: false,
            error: toLokmaError(new Error('Telegram ID mavjud emas'), 'auth'),
        };
    }

    if (!isValidGoal(goalMl)) {
        return {
            ok: false,
            error: toLokmaError(
                new Error(`Noto'g'ri suv maqsadi: ${goalMl} ml (${MIN_GOAL_ML}-${MAX_GOAL_ML} oralig'ida bo'lishi kerak)`),
                'validation'
            ),
        };
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ water_goal_ml: Math.round(goalMl) })
            .eq('telegram_id', telegramId);

        if (error) {
            return { ok: false, error: toLokmaError(error, 'database') };
        }

        invalidateGoalCache(telegramId);
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}