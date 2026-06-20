import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { getTelegramId } from './telegram'

const FREE_AI_LIMIT = 3

export interface PremiumState {
    isPremium: boolean
    premiumUntil: Date | null
    daysLeft: number
    trialUsed: boolean
    aiScansUsedToday: number
    aiScansLimit: number
    aiScansRemaining: number
    canScan: boolean
    loading: boolean
    refresh: () => Promise<void>
}

let cache: { data: any; ts: number } | null = null
const CACHE_TTL = 30_000 // 30s

export function usePremium(): PremiumState {
    const [state, setState] = useState({
        isPremium: false,
        premiumUntil: null as Date | null,
        daysLeft: 0,
        trialUsed: false,
        aiScansUsedToday: 0,
        loading: true,
    })

    const load = useCallback(async (force = false) => {
        const tgId = getTelegramId()
        if (!tgId) {
            setState((s) => ({ ...s, loading: false }))
            return
        }

        // cache
        if (!force && cache && Date.now() - cache.ts < CACHE_TTL) {
            setState({ ...cache.data, loading: false })
            return
        }

        const { data } = await supabase
            .from('users')
            .select('premium_until, trial_used, ai_scans_used_today, ai_scans_reset_date')
            .eq('telegram_id', tgId)
            .maybeSingle()

        const now = new Date()
        const premiumUntil = data?.premium_until ? new Date(data.premium_until) : null
        const isPremium = !!premiumUntil && premiumUntil > now
        const daysLeft = isPremium && premiumUntil
            ? Math.ceil((premiumUntil.getTime() - now.getTime()) / 86_400_000)
            : 0

        // kunlik reset check
        const today = now.toISOString().split('T')[0]
        const resetDate = data?.ai_scans_reset_date || null
        const usedToday = resetDate === today ? (data?.ai_scans_used_today || 0) : 0

        const result = {
            isPremium,
            premiumUntil,
            daysLeft,
            trialUsed: !!data?.trial_used,
            aiScansUsedToday: usedToday,
        }
        cache = { data: result, ts: Date.now() }
        setState({ ...result, loading: false })
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const aiScansLimit = state.isPremium ? Infinity : FREE_AI_LIMIT
    const aiScansRemaining = state.isPremium ? Infinity : Math.max(0, FREE_AI_LIMIT - state.aiScansUsedToday)
    const canScan = state.isPremium || state.aiScansUsedToday < FREE_AI_LIMIT

    return {
        ...state,
        aiScansLimit,
        aiScansRemaining,
        canScan,
        refresh: () => load(true),
    }
}

// AI scan'dan keyin chaqir (atomic increment)
export async function incrementAiScan(): Promise<boolean> {
    const tgId = getTelegramId()
    if (!tgId) return false

    const today = new Date().toISOString().split('T')[0]

    const { data: user } = await supabase
        .from('users')
        .select('ai_scans_used_today, ai_scans_reset_date')
        .eq('telegram_id', tgId)
        .maybeSingle()

    const currentCount = user?.ai_scans_reset_date === today ? (user.ai_scans_used_today || 0) : 0

    const { error } = await supabase
        .from('users')
        .update({
            ai_scans_used_today: currentCount + 1,
            ai_scans_reset_date: today,
        })
        .eq('telegram_id', tgId)

    // cache invalidate
    cache = null
    return !error
}