// weight.ts
// ============================================================
// LOKMA — Weight tracking module (premium refactor)
// - Result<T> everywhere
// - Cache + inflight dedup
// - Atomic writes (weight_logs + users.weight_kg sync)
// - Pure calc helpers (BMI, trend, target progress) — no UI concerns
// - Sanity validation (30..300 kg)
// ============================================================

import { supabase, toLokmaError, type Result } from './supabase';
import { getTelegramId } from './telegram';

// ============================================================
// TYPES
// ============================================================
export interface WeightEntry {
    id: number;
    weight_kg: number;
    logged_at: string;
}

export interface WeightTrend {
    weeklyRateKg: number;
    direction: 'down' | 'up' | 'stable';
    healthStatus: 'good' | 'warning' | 'danger';
    weeksToTarget: number | null;
    pointsUsed: number;
}

export type BMICategory = 'low' | 'normal' | 'over' | 'obese';

export interface BMIInfo {
    value: number;
    category: BMICategory;
}

// ============================================================
// CONSTANTS
// ============================================================
const WEIGHT_MIN_KG = 30;
const WEIGHT_MAX_KG = 300;
const TARGET_MIN_KG = 30;
const TARGET_MAX_KG = 300;
const HEIGHT_MIN_CM = 50;

// Cache TTL
const LATEST_TTL_MS = 30_000;      // 30s
const HISTORY_TTL_MS = 60_000;     // 1min
const TARGET_TTL_MS = 5 * 60_000;  // 5min
const HEIGHT_TTL_MS = 10 * 60_000; // 10min — user height juda kam o'zgaradi

// ============================================================
// CACHE
// ============================================================
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const latestCache = new Map<number, CacheEntry<number | null>>();
const historyCache = new Map<string, CacheEntry<WeightEntry[]>>(); // key: `${telegramId}:${days}`
const targetCache = new Map<number, CacheEntry<number | null>>();
const heightCache = new Map<number, CacheEntry<number | null>>();

const latestInflight = new Map<number, Promise<Result<number | null>>>();
const historyInflight = new Map<string, Promise<Result<WeightEntry[]>>>();
const targetInflight = new Map<number, Promise<Result<number | null>>>();
const heightInflight = new Map<number, Promise<Result<number | null>>>();

function readCache<K, T>(cache: Map<K, CacheEntry<T>>, key: K): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
    }
    return entry.data;
}

function writeCache<K, T>(cache: Map<K, CacheEntry<T>>, key: K, data: T, ttlMs: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function invalidateWeightCaches(telegramId: number): void {
    latestCache.delete(telegramId);
    for (const key of Array.from(historyCache.keys())) {
        if (key.startsWith(`${telegramId}:`)) historyCache.delete(key);
    }
}

function invalidateTargetCache(telegramId: number): void {
    targetCache.delete(telegramId);
}

export function clearWeightCache(): void {
    latestCache.clear();
    historyCache.clear();
    targetCache.clear();
    heightCache.clear();
    latestInflight.clear();
    historyInflight.clear();
    targetInflight.clear();
    heightInflight.clear();
}

// ============================================================
// VALIDATION
// ============================================================
function isValidWeight(kg: number): boolean {
    return Number.isFinite(kg) && kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG;
}

function isValidTarget(kg: number): boolean {
    return Number.isFinite(kg) && kg >= TARGET_MIN_KG && kg <= TARGET_MAX_KG;
}

// ============================================================
// WRITE: addWeight (atomic — log + users sync)
// ============================================================
export async function addWeight(weightKg: number): Promise<Result<null>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return {
            ok: false,
            error: toLokmaError(new Error('Telegram ID mavjud emas'), 'auth'),
        };
    }
    if (!isValidWeight(weightKg)) {
        return {
            ok: false,
            error: toLokmaError(
                new Error(`Noto'g'ri vazn: ${weightKg} kg (${WEIGHT_MIN_KG}..${WEIGHT_MAX_KG} oralig'ida bo'lishi kerak)`),
                'validation'
            ),
        };
    }

    const rounded = Math.round(weightKg * 10) / 10;

    try {
        const { error: insertErr } = await supabase
            .from('weight_logs')
            .insert({ telegram_id: telegramId, weight_kg: rounded });
        if (insertErr) {
            return { ok: false, error: toLokmaError(insertErr, 'database') };
        }

        // users.weight_kg ham sinxron — BMR aktual qoladi
        const { error: updateErr } = await supabase
            .from('users')
            .update({ weight_kg: rounded })
            .eq('telegram_id', telegramId);
        if (updateErr) {
            // Log yozildi lekin sync failed — logga chiqar, foydalanuvchiga aytmasa ham bo'ladi
            console.warn('[weight] users.weight_kg sync failed:', updateErr.message);
        }

        invalidateWeightCaches(telegramId);
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// WRITE: removeLastWeight
// ============================================================
export async function removeLastWeight(): Promise<Result<{ removedId: number } | null>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: null };

    try {
        const { data: lastRow, error: selectErr } = await supabase
            .from('weight_logs')
            .select('id')
            .eq('telegram_id', telegramId)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (selectErr) return { ok: false, error: toLokmaError(selectErr, 'database') };
        if (!lastRow) return { ok: true, data: null };

        const { error: deleteErr } = await supabase
            .from('weight_logs')
            .delete()
            .eq('id', lastRow.id);

        if (deleteErr) return { ok: false, error: toLokmaError(deleteErr, 'database') };

        invalidateWeightCaches(telegramId);
        return { ok: true, data: { removedId: Number(lastRow.id) } };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// WRITE: setTargetWeight
// ============================================================
export async function setTargetWeight(targetKg: number): Promise<Result<null>> {
    const telegramId = getTelegramId();
    if (!telegramId) {
        return {
            ok: false,
            error: toLokmaError(new Error('Telegram ID mavjud emas'), 'auth'),
        };
    }
    if (!isValidTarget(targetKg)) {
        return {
            ok: false,
            error: toLokmaError(
                new Error(`Noto'g'ri maqsad vazn: ${targetKg} kg (${TARGET_MIN_KG}..${TARGET_MAX_KG} oralig'ida bo'lishi kerak)`),
                'validation'
            ),
        };
    }

    const rounded = Math.round(targetKg * 10) / 10;

    try {
        const { error } = await supabase
            .from('users')
            .update({ target_weight_kg: rounded })
            .eq('telegram_id', telegramId);
        if (error) return { ok: false, error: toLokmaError(error, 'database') };

        invalidateTargetCache(telegramId);
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// READ: getLatestWeight (cache + dedup)
// ============================================================
export async function getLatestWeight(
    opts?: { forceRefresh?: boolean }
): Promise<Result<number | null>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: null };

    if (!opts?.forceRefresh) {
        const cached = readCache(latestCache, telegramId);
        if (cached !== undefined) return { ok: true, data: cached };
        const inflight = latestInflight.get(telegramId);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<number | null>> => {
        try {
            const { data, error } = await supabase
                .from('weight_logs')
                .select('weight_kg')
                .eq('telegram_id', telegramId)
                .order('logged_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) return { ok: false, error: toLokmaError(error, 'database') };

            const value = data?.weight_kg != null ? Number(data.weight_kg) : null;
            writeCache(latestCache, telegramId, value, LATEST_TTL_MS);
            return { ok: true, data: value };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            latestInflight.delete(telegramId);
        }
    })();

    latestInflight.set(telegramId, promise);
    return promise;
}

// ============================================================
// READ: getWeightHistory (cache + dedup)
// ============================================================
export async function getWeightHistory(
    days = 30,
    opts?: { forceRefresh?: boolean }
): Promise<Result<WeightEntry[]>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: [] };

    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
    const key = `${telegramId}:${safeDays}`;

    if (!opts?.forceRefresh) {
        const cached = readCache(historyCache, key);
        if (cached !== undefined) return { ok: true, data: cached };
        const inflight = historyInflight.get(key);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<WeightEntry[]>> => {
        try {
            const since = new Date();
            since.setDate(since.getDate() - safeDays);

            const { data, error } = await supabase
                .from('weight_logs')
                .select('id, weight_kg, logged_at')
                .eq('telegram_id', telegramId)
                .gte('logged_at', since.toISOString())
                .order('logged_at', { ascending: true });

            if (error) return { ok: false, error: toLokmaError(error, 'database') };

            const rows: WeightEntry[] = (data ?? []).map(r => ({
                id: Number(r.id),
                weight_kg: Number(r.weight_kg),
                logged_at: String(r.logged_at),
            }));
            writeCache(historyCache, key, rows, HISTORY_TTL_MS);
            return { ok: true, data: rows };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            historyInflight.delete(key);
        }
    })();

    historyInflight.set(key, promise);
    return promise;
}

// ============================================================
// READ: getTargetWeight (cache + dedup)
// ============================================================
export async function getTargetWeight(
    opts?: { forceRefresh?: boolean }
): Promise<Result<number | null>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: null };

    if (!opts?.forceRefresh) {
        const cached = readCache(targetCache, telegramId);
        if (cached !== undefined) return { ok: true, data: cached };
        const inflight = targetInflight.get(telegramId);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<number | null>> => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('target_weight_kg')
                .eq('telegram_id', telegramId)
                .maybeSingle();

            if (error) return { ok: false, error: toLokmaError(error, 'database') };

            const value = data?.target_weight_kg != null ? Number(data.target_weight_kg) : null;
            writeCache(targetCache, telegramId, value, TARGET_TTL_MS);
            return { ok: true, data: value };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            targetInflight.delete(telegramId);
        }
    })();

    targetInflight.set(telegramId, promise);
    return promise;
}

// ============================================================
// READ: getUserHeight (cache + dedup) — BMI hisob uchun
// ============================================================
export async function getUserHeight(
    opts?: { forceRefresh?: boolean }
): Promise<Result<number | null>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: null };

    if (!opts?.forceRefresh) {
        const cached = readCache(heightCache, telegramId);
        if (cached !== undefined) return { ok: true, data: cached };
        const inflight = heightInflight.get(telegramId);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<number | null>> => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('height_cm')
                .eq('telegram_id', telegramId)
                .maybeSingle();

            if (error) return { ok: false, error: toLokmaError(error, 'database') };

            const value = data?.height_cm != null ? Number(data.height_cm) : null;
            writeCache(heightCache, telegramId, value, HEIGHT_TTL_MS);
            return { ok: true, data: value };
        } catch (err) {
            return { ok: false, error: toLokmaError(err, 'database') };
        } finally {
            heightInflight.delete(telegramId);
        }
    })();

    heightInflight.set(telegramId, promise);
    return promise;
}

// ============================================================
// WRITE: seedFromProfile — Onboarding sinxronizatsiyasi
// ============================================================
export async function seedFromProfile(): Promise<Result<{ seeded: boolean }>> {
    const telegramId = getTelegramId();
    if (!telegramId) return { ok: true, data: { seeded: false } };

    const latestRes = await getLatestWeight({ forceRefresh: true });
    if (!latestRes.ok) return latestRes;
    if (latestRes.data !== null) return { ok: true, data: { seeded: false } }; // allaqachon bor

    try {
        const { data, error } = await supabase
            .from('users')
            .select('weight_kg')
            .eq('telegram_id', telegramId)
            .maybeSingle();

        if (error) return { ok: false, error: toLokmaError(error, 'database') };
        if (!data?.weight_kg) return { ok: true, data: { seeded: false } };

        const addRes = await addWeight(Number(data.weight_kg));
        if (!addRes.ok) return addRes;
        return { ok: true, data: { seeded: true } };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

// ============================================================
// PURE HELPERS — kalkulyatsiya (UI-siz, i18n-siz)
// ============================================================

/**
 * So'nggi 14 kunlik trend (yetarli data bo'lmasa butun tarix).
 * `direction`, `healthStatus`, `weeksToTarget` — pure hisob.
 * Threshold'lar: |rate| < 0.1 → stable; 0.1..1.0 good; 1.0..1.5 warning; >1.5 danger.
 */
export function calcWeightTrend(
    entries: WeightEntry[],
    targetKg: number | null
): WeightTrend | null {
    if (entries.length < 2) return null;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const recent = entries.filter(e => new Date(e.logged_at) >= cutoff);
    const pool = recent.length >= 2 ? recent : entries;

    const first = pool[0];
    const last = pool[pool.length - 1];
    const daysDiff =
        (new Date(last.logged_at).getTime() - new Date(first.logged_at).getTime()) /
        (1000 * 60 * 60 * 24);
    if (daysDiff < 1) return null;

    const totalChange = last.weight_kg - first.weight_kg;
    const weeklyRateKg = (totalChange / daysDiff) * 7;
    const absRate = Math.abs(weeklyRateKg);

    let direction: WeightTrend['direction'] = 'stable';
    if (absRate >= 0.1) direction = weeklyRateKg < 0 ? 'down' : 'up';

    let healthStatus: WeightTrend['healthStatus'] = 'good';
    if (absRate > 1.5) healthStatus = 'danger';
    else if (absRate > 1.0) healthStatus = 'warning';

    let weeksToTarget: number | null = null;
    if (targetKg != null && direction !== 'stable') {
        const currentKg = last.weight_kg;
        const distance = targetKg - currentKg;
        const correctDirection =
            (distance < 0 && weeklyRateKg < 0) || (distance > 0 && weeklyRateKg > 0);
        if (correctDirection && absRate > 0.05) {
            weeksToTarget = Math.abs(distance / weeklyRateKg);
        }
    }

    return {
        weeklyRateKg,
        direction,
        healthStatus,
        weeksToTarget,
        pointsUsed: pool.length,
    };
}

/**
 * Boshlang'ich → hozirgi vazn → maqsad tomon qay darajada yaqinlashgan (0..1).
 */
export function calcTargetProgress(
    entries: WeightEntry[],
    targetKg: number | null
): number {
    if (!targetKg || entries.length === 0) return 0;
    const start = entries[0].weight_kg;
    const current = entries[entries.length - 1].weight_kg;
    const totalDistance = Math.abs(targetKg - start);
    if (totalDistance < 0.1) return 1;
    const covered = Math.abs(current - start);
    const movingRightWay =
        (targetKg < start && current < start) || (targetKg > start && current > start);
    if (!movingRightWay) return 0;
    return Math.min(1, covered / totalDistance);
}

/**
 * BMI = weight(kg) / (height(m))^2
 * Kategoriya faqat qaytariladi — label/color UI tarafida i18n bilan.
 */
export function calcBMI(weightKg: number, heightCm: number): BMIInfo | null {
    if (!weightKg || !heightCm || heightCm < HEIGHT_MIN_CM) return null;
    const m = heightCm / 100;
    const value = weightKg / (m * m);

    let category: BMICategory;
    if (value < 18.5) category = 'low';
    else if (value < 25) category = 'normal';
    else if (value < 30) category = 'over';
    else category = 'obese';

    return { value, category };
}

/**
 * users.height_cm dan BMI hisoblaydi (cached height ishlatiladi).
 */
export async function getCurrentBMI(currentWeightKg: number): Promise<Result<BMIInfo | null>> {
    const heightRes = await getUserHeight();
    if (!heightRes.ok) return heightRes;
    if (heightRes.data == null) return { ok: true, data: null };
    return { ok: true, data: calcBMI(currentWeightKg, heightRes.data) };
}