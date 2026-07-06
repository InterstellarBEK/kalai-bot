// coins.ts — Lokma coin economy & skin ownership
// Premium refactoring: Result<T> API, auth guards, input validation,
// inflight dedup, cache invalidation, atomic RPC.
//
// Eski API'lar (addCoinsForLog, purchaseSkin, equipSkin, getOwnedSkins)
// backward-compatible — Result API'ning ustidan yupqa wrapper.

import { supabase, wrapPgResult, type Result, LokmaError, AuthError } from './supabase'
import { getTelegramId } from './telegram'

// ============================================================
// CONSTANTS
// ============================================================

export const COINS_PER_LOG = 5
const OWNED_SKINS_TTL_MS = 30_000

// ============================================================
// TYPES
// ============================================================

export interface PurchaseResult {
    success: boolean
    new_coins?: number
    error?: string
}

interface RpcPurchaseRow {
    success: boolean
    new_coins?: number
    error?: string
}

// ============================================================
// AUTH GUARD
// ============================================================

function requireTelegramId(): number {
    const id = getTelegramId()
    if (!id || typeof id !== 'number') {
        throw new AuthError('Telegram ID topilmadi')
    }
    return id
}

// ============================================================
// COIN OPERATIONS
// ============================================================

/**
 * Log uchun coin qo'shadi (atomic RPC).
 * Kanonik Result API.
 */
export async function addCoinsForLogResult(): Promise<Result<number>> {
    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const resp = await supabase.rpc('add_coins', {
        p_telegram_id: tgId,
        p_amount: COINS_PER_LOG,
    })
    const result = wrapPgResult<number>(resp, 'addCoinsForLog', { tgId, amount: COINS_PER_LOG })
    // Coin o'zgarganda cache invalidate (SkinShop coin balansi eskirmasin)
    if (result.ok) invalidateOwnedSkinsCache()
    return result
}

/**
 * @deprecated `addCoinsForLogResult` ishlating. Backward-compat wrapper.
 */
export async function addCoinsForLog(): Promise<number | null> {
    const r = await addCoinsForLogResult()
    return r.ok ? r.data : null
}

// ============================================================
// SKIN PURCHASE
// ============================================================

/**
 * Skin sotib olish (atomic RPC: coin check + deduct + insert user_skins).
 */
export async function purchaseSkinResult(
    skinId: string,
    price: number
): Promise<Result<PurchaseResult>> {
    // Input validation
    if (!skinId || typeof skinId !== 'string') {
        return {
            ok: false,
            error: new LokmaError('validation', 'skinId noto\'g\'ri', { context: { skinId } }),
        }
    }
    if (!Number.isFinite(price) || price < 0) {
        return {
            ok: false,
            error: new LokmaError('validation', 'Narx noto\'g\'ri', { context: { price } }),
        }
    }

    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const resp = await supabase.rpc('purchase_skin', {
        p_telegram_id: tgId,
        p_skin_id: skinId,
        p_price: price,
    })
    const result = wrapPgResult<RpcPurchaseRow>(resp, 'purchaseSkin', { tgId, skinId, price })

    if (!result.ok) return result

    // Muvaffaqiyatli xarid — cache invalidate
    if (result.data.success) invalidateOwnedSkinsCache()

    return { ok: true, data: result.data }
}

/**
 * @deprecated `purchaseSkinResult` ishlating. Backward-compat wrapper.
 */
export async function purchaseSkin(skinId: string, price: number): Promise<PurchaseResult> {
    const r = await purchaseSkinResult(skinId, price)
    if (!r.ok) return { success: false, error: r.error.message }
    return r.data
}

// ============================================================
// SKIN EQUIP
// ============================================================

/**
 * Skin kiyish. null → default Bekjon.
 */
export async function equipSkinResult(skinId: string | null): Promise<Result<true>> {
    if (skinId !== null && (!skinId || typeof skinId !== 'string')) {
        return {
            ok: false,
            error: new LokmaError('validation', 'skinId noto\'g\'ri', { context: { skinId } }),
        }
    }

    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    const resp = await supabase
        .from('users')
        .update({ equipped_skin: skinId })
        .eq('telegram_id', tgId)
        .select('telegram_id')
        .single()

    const result = wrapPgResult(resp, 'equipSkin', { tgId, skinId })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: true }
}

/**
 * @deprecated `equipSkinResult` ishlating. Backward-compat wrapper.
 */
export async function equipSkin(skinId: string | null): Promise<boolean> {
    const r = await equipSkinResult(skinId)
    return r.ok
}

// ============================================================
// OWNED SKINS (cache + inflight dedup)
// ============================================================

interface OwnedSkinsCache {
    tgId: number
    fetchedAt: number
    skins: string[]
}

let ownedSkinsCache: OwnedSkinsCache | null = null
let ownedSkinsInflight: Promise<Result<string[]>> | null = null

export function invalidateOwnedSkinsCache(): void {
    ownedSkinsCache = null
}

async function fetchOwnedSkinsOnce(tgId: number): Promise<Result<string[]>> {
    const resp = await supabase
        .from('user_skins')
        .select('skin_id')
        .eq('telegram_id', tgId)

    const result = wrapPgResult<Array<{ skin_id: string }>>(resp, 'getOwnedSkins', { tgId })
    if (!result.ok) return { ok: false, error: result.error }

    const skins = result.data.map(r => r.skin_id).filter((s): s is string => typeof s === 'string')
    ownedSkinsCache = { tgId, fetchedAt: Date.now(), skins }
    return { ok: true, data: skins }
}

/**
 * Foydalanuvchi egallagan skin'lar ro'yxati.
 * Cache TTL 30s, inflight dedup.
 */
export async function getOwnedSkinsResult(
    opts: { force?: boolean } = {}
): Promise<Result<string[]>> {
    let tgId: number
    try {
        tgId = requireTelegramId()
    } catch (e) {
        return { ok: false, error: e as LokmaError }
    }

    // Cache hit
    if (
        !opts.force &&
        ownedSkinsCache &&
        ownedSkinsCache.tgId === tgId &&
        Date.now() - ownedSkinsCache.fetchedAt < OWNED_SKINS_TTL_MS
    ) {
        return { ok: true, data: ownedSkinsCache.skins }
    }

    // Inflight dedup
    if (ownedSkinsInflight) return ownedSkinsInflight

    ownedSkinsInflight = fetchOwnedSkinsOnce(tgId).finally(() => {
        ownedSkinsInflight = null
    })
    return ownedSkinsInflight
}

/**
 * @deprecated `getOwnedSkinsResult` ishlating. Backward-compat wrapper.
 */
export async function getOwnedSkins(): Promise<string[]> {
    const r = await getOwnedSkinsResult()
    return r.ok ? r.data : []
}