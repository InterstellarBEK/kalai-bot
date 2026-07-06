// achievements.ts — Lokma achievements system
// Premium refactoring: Result<T> API, auth guards, typed queries,
// atomic-ish unlock flow, stats cache (dedup burst calls).

import {
    supabase,
    wrapPgResult,
    type Result,
    LokmaError,
    AuthError,
} from './supabase'
import { uzLatinToCyrl } from './transliterate'
import type { Lang } from './i18n'

// ============================================================
// TYPES
// ============================================================

export type Achievement = {
    id: string
    title: string         // uz-Latn (eski — backward compat)
    title_ru: string
    title_en: string
    desc: string          // uz-Latn (eski)
    desc_ru: string
    desc_en: string
    icon: string
    coin: number
    check: (s: Stats) => boolean
}

export type Stats = {
    streak: number
    totalLogs: number
    totalKcal: number
    waterDays: number
    weightLogs: number
    fastingDone: number
    challengesDone: number
}

interface FoodLogRow { calories: number | null }
interface WaterLogRow { logged_at: string | null }
interface UserRow { current_streak: number | null }
interface UnlockedRow { achievement_id: string }

// ============================================================
// CATALOG
// ============================================================

export const ACHIEVEMENTS: Achievement[] = [
    { id: 'streak_3', title: '3 kun streak', title_ru: '3 дня подряд', title_en: '3-day streak', desc: '3 kun ketma-ket', desc_ru: '3 дня подряд', desc_en: '3 days in a row', icon: '🔥', coin: 50, check: s => s.streak >= 3 },
    { id: 'streak_7', title: '7 kun streak', title_ru: '7 дней подряд', title_en: '7-day streak', desc: 'Bir hafta uzluksiz', desc_ru: 'Неделя без перерыва', desc_en: 'Full week', icon: '🔥', coin: 100, check: s => s.streak >= 7 },
    { id: 'streak_30', title: '30 kun streak', title_ru: '30 дней подряд', title_en: '30-day streak', desc: 'Oy davomida har kuni', desc_ru: 'Целый месяц', desc_en: 'A whole month', icon: '🏆', coin: 500, check: s => s.streak >= 30 },
    { id: 'streak_100', title: '100 kun streak', title_ru: '100 дней подряд', title_en: '100-day streak', desc: 'Afsona', desc_ru: 'Легенда', desc_en: 'Legend', icon: '👑', coin: 2000, check: s => s.streak >= 100 },
    { id: 'logs_10', title: '10 ta yozuv', title_ru: '10 записей', title_en: '10 logs', desc: 'Boshlanish', desc_ru: 'Начало', desc_en: 'Getting started', icon: '📝', coin: 30, check: s => s.totalLogs >= 10 },
    { id: 'logs_50', title: '50 ta yozuv', title_ru: '50 записей', title_en: '50 logs', desc: 'Doimiy odat', desc_ru: 'Привычка', desc_en: 'Habit formed', icon: '📚', coin: 150, check: s => s.totalLogs >= 50 },
    { id: 'logs_100', title: '100 ta yozuv', title_ru: '100 записей', title_en: '100 logs', desc: 'Tracker ustasi', desc_ru: 'Мастер трекинга', desc_en: 'Tracking master', icon: '🎯', coin: 300, check: s => s.totalLogs >= 100 },
    { id: 'kcal_10k', title: '10,000 kcal', title_ru: '10 000 ккал', title_en: '10,000 kcal', desc: 'Jami yozilgan', desc_ru: 'Всего записано', desc_en: 'Total logged', icon: '⚡', coin: 100, check: s => s.totalKcal >= 10000 },
    { id: 'water_7', title: '7 kun suv', title_ru: '7 дней воды', title_en: '7 days of water', desc: '7 kun suv qayd qilindi', desc_ru: 'Вода 7 дней подряд', desc_en: 'Water logged 7 days', icon: '💧', coin: 150, check: s => s.waterDays >= 7 },
    { id: 'weight_first', title: 'Birinchi vazn', title_ru: 'Первый вес', title_en: 'First weight', desc: 'Vaznni qayd qildi', desc_ru: 'Вес записан', desc_en: 'Weight logged', icon: '⚖️', coin: 20, check: s => s.weightLogs >= 1 },
    { id: 'weight_5', title: '5 marta vazn', title_ru: '5 взвешиваний', title_en: '5 weigh-ins', desc: 'Muntazam o\'lchov', desc_ru: 'Регулярный замер', desc_en: 'Regular tracking', icon: '📊', coin: 80, check: s => s.weightLogs >= 5 },
    { id: 'fast_first', title: 'Birinchi ro\'za', title_ru: 'Первый пост', title_en: 'First fast', desc: 'Birinchi fasting tugadi', desc_ru: 'Первый фастинг завершён', desc_en: 'First fasting completed', icon: '⏱️', coin: 50, check: s => s.fastingDone >= 1 },
    { id: 'fast_5', title: '5 ro\'za', title_ru: '5 постов', title_en: '5 fasts', desc: '5 fasting tugatildi', desc_ru: '5 фастингов завершено', desc_en: '5 fastings done', icon: '⏳', coin: 200, check: s => s.fastingDone >= 5 },
]

// ============================================================
// i18n HELPERS
// ============================================================

export function getAchTitle(a: Achievement, lang: Lang): string {
    if (lang === 'ru') return a.title_ru
    if (lang === 'en') return a.title_en
    if (lang === 'uz-Cyrl') return uzLatinToCyrl(a.title)
    return a.title
}

export function getAchDesc(a: Achievement, lang: Lang): string {
    if (lang === 'ru') return a.desc_ru
    if (lang === 'en') return a.desc_en
    if (lang === 'uz-Cyrl') return uzLatinToCyrl(a.desc)
    return a.desc
}

// ============================================================
// AUTH GUARD
// ============================================================

function requireValidId(telegramId: number): number {
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
        throw new AuthError('Telegram ID noto\'g\'ri')
    }
    return telegramId
}

// ============================================================
// STATS (cache burst calls)
// ============================================================

const STATS_TTL_MS = 5_000
interface StatsCache { tgId: number; fetchedAt: number; stats: Stats }
let statsCache: StatsCache | null = null
let statsInflight: Promise<Result<Stats>> | null = null

export function invalidateStatsCache(): void {
    statsCache = null
}

async function fetchStatsOnce(tgId: number): Promise<Result<Stats>> {
    const [user, logs, water, weight, fasting] = await Promise.all([
        supabase.from('users').select('current_streak').eq('telegram_id', tgId).maybeSingle(),
        supabase.from('food_logs').select('calories', { count: 'exact' }).eq('telegram_id', tgId),
        supabase.from('water_logs').select('logged_at').eq('telegram_id', tgId),
        supabase.from('weight_logs').select('id', { count: 'exact', head: true }).eq('telegram_id', tgId),
        supabase.from('fasting_sessions').select('id', { count: 'exact', head: true }).eq('telegram_id', tgId).eq('status', 'completed'),
    ])

    // Har birini alohida wrap qilamiz — biri xato bo'lsa boshqasi ishlaydi
    const errs = [user.error, logs.error, water.error, weight.error, fasting.error].filter(Boolean)
    if (errs.length) {
        const err = new LokmaError('database', `Stats fetch: ${errs.length} xato`, {
            context: { tgId, errors: errs.map(e => e?.message) },
        })
        return { ok: false, error: err }
    }

    const userRow = user.data as UserRow | null
    const logRows = (logs.data ?? []) as FoodLogRow[]
    const waterRows = (water.data ?? []) as WaterLogRow[]

    const totalKcal = logRows.reduce((a, r) => a + (r.calories ?? 0), 0)
    const waterByDay = new Set(
        waterRows
            .map(r => (r.logged_at ? r.logged_at.slice(0, 10) : ''))
            .filter(Boolean)
    )

    const stats: Stats = {
        streak: userRow?.current_streak ?? 0,
        totalLogs: logs.count ?? 0,
        totalKcal,
        waterDays: waterByDay.size,
        weightLogs: weight.count ?? 0,
        fastingDone: fasting.count ?? 0,
        challengesDone: 0, // TODO: daily_challenges completed count
    }

    statsCache = { tgId, fetchedAt: Date.now(), stats }
    return { ok: true, data: stats }
}

/** Kanonik Result API. */
export async function fetchStatsResult(
    telegramId: number,
    opts: { force?: boolean } = {}
): Promise<Result<Stats>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    if (
        !opts.force &&
        statsCache &&
        statsCache.tgId === tgId &&
        Date.now() - statsCache.fetchedAt < STATS_TTL_MS
    ) {
        return { ok: true, data: statsCache.stats }
    }

    if (statsInflight) return statsInflight

    statsInflight = fetchStatsOnce(tgId).finally(() => {
        statsInflight = null
    })
    return statsInflight
}

/** @deprecated `fetchStatsResult` ishlating. */
export async function fetchStats(telegramId: number): Promise<Stats> {
    const r = await fetchStatsResult(telegramId)
    if (r.ok) return r.data
    // Backward-compat: xato bo'lsa nol stats
    return {
        streak: 0, totalLogs: 0, totalKcal: 0, waterDays: 0,
        weightLogs: 0, fastingDone: 0, challengesDone: 0,
    }
}

// ============================================================
// UNLOCKED LIST
// ============================================================

export async function getUnlockedResult(telegramId: number): Promise<Result<string[]>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const resp = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('telegram_id', tgId)

    const result = wrapPgResult<UnlockedRow[]>(resp, 'getUnlocked', { tgId })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: result.data.map(r => r.achievement_id) }
}

/** @deprecated `getUnlockedResult` ishlating. */
export async function getUnlocked(telegramId: number): Promise<string[]> {
    const r = await getUnlockedResult(telegramId)
    return r.ok ? r.data : []
}

// ============================================================
// CHECK & UNLOCK
// ============================================================

/**
 * Yangi ochilgan achievement'larni qo'shadi va coin beradi.
 *
 * TODO: idealda atomic RPC `unlock_achievements(p_tg_id, p_ids, p_coins)` —
 * insert + add_coins bitta tranzaksiyada. Hozir insert + rpc alohida:
 * insert muvaffaqiyatli bo'lib, coin RPC xato bersa — foydalanuvchi
 * achievement'ni oladi lekin coin'siz qoladi.
 */
export async function checkAndUnlockResult(
    telegramId: number
): Promise<Result<Achievement[]>> {
    let tgId: number
    try {
        tgId = requireValidId(telegramId)
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const statsRes = await fetchStatsResult(tgId, { force: true })
    if (!statsRes.ok) return { ok: false, error: statsRes.error }

    const unlockedRes = await getUnlockedResult(tgId)
    if (!unlockedRes.ok) return { ok: false, error: unlockedRes.error }

    const unlocked = new Set(unlockedRes.data)
    const newOnes = ACHIEVEMENTS.filter(a => !unlocked.has(a.id) && a.check(statsRes.data))
    if (newOnes.length === 0) return { ok: true, data: [] }

    const rows = newOnes.map(a => ({
        telegram_id: tgId,
        achievement_id: a.id,
        coin_reward: a.coin,
    }))

    // upsert + ignoreDuplicates — race condition'da ikkinchi call xato bermaydi
    const insertResp = await supabase
        .from('user_achievements')
        .upsert(rows, { onConflict: 'telegram_id,achievement_id', ignoreDuplicates: true })
        .select('achievement_id')

    const insertResult = wrapPgResult<Array<{ achievement_id: string }>>(
        insertResp,
        'unlockAchievements',
        { tgId, count: newOnes.length }
    )
    if (!insertResult.ok) return { ok: false, error: insertResult.error }

    // Faqat haqiqatan qo'shilgan achievement'lar uchun coin ber
    const insertedIds = new Set(insertResult.data.map(r => r.achievement_id))
    const actuallyUnlocked = newOnes.filter(a => insertedIds.has(a.id))
    if (actuallyUnlocked.length === 0) return { ok: true, data: [] }

    const totalCoin = actuallyUnlocked.reduce((a, x) => a + x.coin, 0)
    if (totalCoin > 0) {
        const coinResp = await supabase.rpc('add_coins', {
            p_telegram_id: tgId,
            p_amount: totalCoin,
        })
        if (coinResp.error) {
            // Achievement ochildi lekin coin qo'shilmadi — log, davom et
            console.error('[lokma:achievements] coin add failed', {
                tgId, totalCoin, error: coinResp.error.message,
            })
        }
    }

    // Cache invalidate — keyingi UI ochilishida yangi state
    invalidateStatsCache()

    return { ok: true, data: actuallyUnlocked }
}

/** @deprecated `checkAndUnlockResult` ishlating. */
export async function checkAndUnlock(telegramId: number): Promise<Achievement[]> {
    const r = await checkAndUnlockResult(telegramId)
    return r.ok ? r.data : []
}