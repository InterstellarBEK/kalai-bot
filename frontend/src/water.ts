import { supabase } from './supabase'
import { getTelegramId } from './telegram'

// Bugungi jami suv (ml)
export async function getTodayWater(): Promise<number> {
    const telegramId = getTelegramId()
    if (!telegramId) return 0

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('telegram_id', telegramId)
        .gte('logged_at', today.toISOString())

    if (error || !data) return 0
    return data.reduce((sum, row) => sum + row.amount_ml, 0)
}

// Suv qo'shish
export async function addWater(amountMl: number): Promise<boolean> {
    const telegramId = getTelegramId()
    if (!telegramId) return false

    const { error } = await supabase
        .from('water_logs')
        .insert({ telegram_id: telegramId, amount_ml: amountMl })

    return !error
}

// Suv maqsadi (default 2000ml)
export async function getWaterGoal(): Promise<number> {
    const telegramId = getTelegramId()
    if (!telegramId) return 2000

    const { data } = await supabase
        .from('users')
        .select('water_goal_ml')
        .eq('telegram_id', telegramId)
        .single()

    return data?.water_goal_ml ?? 2000
}

// Bugungi log'larni o'chirish (undo uchun — oxirgi log)
export async function removeLastWater(): Promise<boolean> {
    const telegramId = getTelegramId()
    if (!telegramId) return false

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data } = await supabase
        .from('water_logs')
        .select('id')
        .eq('telegram_id', telegramId)
        .gte('logged_at', today.toISOString())
        .order('logged_at', { ascending: false })
        .limit(1)
        .single()

    if (!data) return false

    const { error } = await supabase
        .from('water_logs')
        .delete()
        .eq('id', data.id)

    return !error
}