// challenges.ts — Lokma daily challenges
// Premium refactoring: Result<T> API, auth guards, race-safe upsert,
// atomic-ish claim (revert on coin failure), local-day key (en-CA).

import {
    supabase,
    wrapPgResult,
    type Result,
    LokmaError,
    AuthError,
} from './supabase'
import { getTelegramId } from './telegram'
import { getTodayWater, getWaterGoal } from './water'

// ============================================================
// TYPES
// ============================================================

export type ChallengeType = 'water_goal' | 'calorie_balance' | 'log_3_meals'

export type Challenge = {
    id: number
    type: ChallengeType
    icon: string
    current: number
    target: number
    isOver: boolean
    overAmount: number
    progress: number
    rewardCoins: number
    completed: boolean
    claimed: boolean
}

interface ChallengeRow {
    id: number
    challenge_type: string
    reward_coins: number | null
    completed: boolean | null
}

interface FoodLogRow { calories: number | null }
interface UserGoalRow { daily_calories_goal: number | null }

// ============================================================
// META
// ============================================================

const META: Record<ChallengeType, { icon: string; reward: number }> = {
    water_goal: { icon: '💧', reward: 10 },
    calorie_balance: { icon: '🎯', reward: 15 },
    log_3_meals: { icon: '🍽️', reward: 10 },
}

const ALL_TYPES: ChallengeType[] = ['water_goal', 'calorie_balance', 'log_3_meals']
const DISPLAY_ORDER: ChallengeType[] = ['water_goal', 'log_3_meals', 'calorie_balance']
const CALORIE_BALANCE_MIN = 0.8
const CALORIE_BALANCE_MAX = 1.1
const DEFAULT_CALORIE_GOAL = 2000

// ============================================================
// AUTH & DATE HELPERS
// ============================================================

function requireTelegramId(): number {
    const id = getTelegramId()
    if (!id || typeof id !== 'number') {
        throw new AuthError('Telegram ID topilmadi')
    }
    return id
}

/** Local kunning YYYY-MM-DD kaliti. en-CA hardcoded → doim ISO format. */
function getLocalDayKey(d: Date = new Date()): string {
    return d.toLocaleDateString('en-CA') // "2026-07-02"
}

/** Local kunning boshlanish ISO (UTC). */
function todayStartIso(): string {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
}

// ============================================================
// ENSURE TODAY (race-safe)
// ============================================================

async function ensureTodayChallenges(tgId: number): Promise<Result<true>> {
    const date = getLocalDayKey()

    const existResp = await supabase
        .from('daily_challenges')
        .select('challenge_type')
        .eq('telegram_id', tgId)
        .eq('challenge_date', date)

    const existRes = wrapPgResult<Array<{ challenge_type: string }>>(
        existResp,
        'ensureTodayChallenges:select',
        { tgId, date }
    )
    if (!existRes.ok) return { ok: false, error: existRes.error }

    const have = new Set(existRes.data.map(r => r.challenge_type))
    const toInsert = ALL_TYPES.filter(t => !have.has(t)).map(t => ({
        telegram_id: tgId,
        challenge_date: date,
        challenge_type: t,
        reward_coins: META[t].reward,
    }))

    if (toInsert.length === 0) return { ok: true, data: true }

    // upsert + ignoreDuplicates → parallel poll'lar xato bermaydi
    const insertResp = await supabase
        .from('daily_challenges')
        .upsert(toInsert, {
            onConflict: 'telegram_id,challenge_date,challenge_type',
            ignoreDuplicates: true,
        })

    if (insertResp.error) {
        return {
            ok: false,
            error: new LokmaError('database', insertResp.error.message, {
                cause: insertResp.error,
                context: { tgId, date, count: toInsert.length },
            }),
        }
    }
    return { ok: true, data: true }
}

// ============================================================
// PROGRESS SOURCES
// ============================================================

async function getTodayMealCount(tgId: number): Promise<number> {
    const resp = await supabase
        .from('food_logs')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_id', tgId)
        .gte('logged_at', todayStartIso())
    return resp.count ?? 0
}

async function getTodayCalories(tgId: number): Promise<{ total: number; target: number }> {
    const [foodRes, userRes] = await Promise.all([
        supabase
            .from('food_logs')
            .select('calories')
            .eq('telegram_id', tgId)
            .gte('logged_at', todayStartIso()),
        supabase
            .from('users')
            .select('daily_calories_goal')
            .eq('telegram_id', tgId)
            .maybeSingle(),
    ])

    const rows = (foodRes.data ?? []) as FoodLogRow[]
    const total = rows.reduce((s, r) => s + Number(r.calories ?? 0), 0)
    const user = userRes.data as UserGoalRow | null
    const target = Number(user?.daily_calories_goal) || DEFAULT_CALORIE_GOAL
    return { total, target }
}

// ============================================================
// PROGRESS CALC
// ============================================================

function computeChallenge(
    row: ChallengeRow,
    ctx: { waterMl: number; waterGoalMl: number; mealCount: number; cal: { total: number; target: number } }
): Challenge | null {
    const type = row.challenge_type as ChallengeType
    if (!ALL_TYPES.includes(type)) return null

    let current = 0
    let target = 0
    let progress = 0
    let completed = false
    let isOver = false
    let overAmount = 0

    if (type === 'water_goal') {
        current = ctx.waterMl
        target = ctx.waterGoalMl
        progress = ctx.waterGoalMl > 0 ? Math.min(1, ctx.waterMl / ctx.waterGoalMl) : 0
        completed = ctx.waterMl >= ctx.waterGoalMl
    } else if (type === 'calorie_balance') {
        current = ctx.cal.total
        target = ctx.cal.target
        const ratio = ctx.cal.target > 0 ? ctx.cal.total / ctx.cal.target : 0
        if (ratio >= CALORIE_BALANCE_MIN && ratio <= CALORIE_BALANCE_MAX) {
            progress = 1
            completed = true
        } else if (ratio < CALORIE_BALANCE_MIN) {
            progress = ratio / CALORIE_BALANCE_MIN
        } else {
            progress = 1
            isOver = true
            overAmount = ctx.cal.total - ctx.cal.target
        }
    } else if (type === 'log_3_meals') {
        current = ctx.mealCount
        target = 3
        progress = Math.min(1, ctx.mealCount / 3)
        completed = ctx.mealCount >= 3
    }

    return {
        id: row.id,
        type,
        icon: META[type].icon,
        current,
        target,
        isOver,
        overAmount,
        progress,
        rewardCoins: row.reward_coins ?? META[type].reward,
        completed,
        claimed: row.completed === true,
    }
}

// ============================================================
// PUBLIC: GET TODAY
// ============================================================

export async function getTodayChallengesResult(): Promise<Result<Challenge[]>> {
    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const ensureRes = await ensureTodayChallenges(tgId)
    if (!ensureRes.ok) return { ok: false, error: ensureRes.error }

    const date = getLocalDayKey()
    const rowsResp = await supabase
        .from('daily_challenges')
        .select('id, challenge_type, reward_coins, completed')
        .eq('telegram_id', tgId)
        .eq('challenge_date', date)

    const rowsRes = wrapPgResult<ChallengeRow[]>(rowsResp, 'getTodayChallenges', { tgId, date })
    if (!rowsRes.ok) return { ok: false, error: rowsRes.error }

    const [waterMl, waterGoalMl, mealCount, cal] = await Promise.all([
        getTodayWater(),
        getWaterGoal(),
        getTodayMealCount(tgId),
        getTodayCalories(tgId),
    ])

    const ctx = { waterMl, waterGoalMl, mealCount, cal }
    const result = rowsRes.data
        .map(r => computeChallenge(r, ctx))
        .filter((c): c is Challenge => c !== null)

    result.sort((a, b) => DISPLAY_ORDER.indexOf(a.type) - DISPLAY_ORDER.indexOf(b.type))
    return { ok: true, data: result }
}

/** @deprecated `getTodayChallengesResult` ishlating. */
export async function getTodayChallenges(): Promise<Challenge[]> {
    const r = await getTodayChallengesResult()
    return r.ok ? r.data : []
}

// ============================================================
// PUBLIC: CLAIM
// ============================================================

/**
 * Challenge'ni claim qiladi + coin beradi.
 * Coin RPC xato bersa — completed flag'ni qaytaradi (compensating action).
 *
 * TODO: atomic RPC `claim_challenge(p_tg_id, p_id)` — update + coin bir tranzaksiyada.
 */
export async function claimChallengeResult(
    challengeId: number,
    rewardCoins: number
): Promise<Result<true>> {
    if (!Number.isFinite(challengeId) || challengeId <= 0) {
        return {
            ok: false,
            error: new LokmaError('validation', 'challengeId noto\'g\'ri', { context: { challengeId } }),
        }
    }
    if (!Number.isFinite(rewardCoins) || rewardCoins < 0) {
        return {
            ok: false,
            error: new LokmaError('validation', 'rewardCoins noto\'g\'ri', { context: { rewardCoins } }),
        }
    }

    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    // 1) Atomic mark completed (WHERE completed=false — double-claim'dan himoya)
    const updateResp = await supabase
        .from('daily_challenges')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', challengeId)
        .eq('telegram_id', tgId)
        .eq('completed', false)
        .select('id')

    const updateRes = wrapPgResult<Array<{ id: number }>>(
        updateResp,
        'claimChallenge:update',
        { tgId, challengeId }
    )
    if (!updateRes.ok) return { ok: false, error: updateRes.error }

    if (updateRes.data.length === 0) {
        return {
            ok: false,
            error: new LokmaError('validation', 'Challenge allaqachon claim qilingan yoki topilmadi', {
                context: { challengeId, tgId },
            }),
        }
    }

    // 2) Coin qo'shish
    if (rewardCoins > 0) {
        const coinResp = await supabase.rpc('add_coins', {
            p_telegram_id: tgId,
            p_amount: rewardCoins,
        })
        if (coinResp.error) {
            // Compensating action: mark'ni orqaga qaytar
            await supabase
                .from('daily_challenges')
                .update({ completed: false, completed_at: null })
                .eq('id', challengeId)
                .eq('telegram_id', tgId)

            return {
                ok: false,
                error: new LokmaError('database', 'Coin qo\'shishda xato', {
                    cause: coinResp.error,
                    context: { tgId, challengeId, rewardCoins },
                }),
            }
        }
    }

    return { ok: true, data: true }
}

/** @deprecated `claimChallengeResult` ishlating. */
export async function claimChallenge(
    challengeId: number,
    rewardCoins: number
): Promise<boolean> {
    const r = await claimChallengeResult(challengeId, rewardCoins)
    return r.ok
}