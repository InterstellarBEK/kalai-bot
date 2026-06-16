import { supabase } from './supabase'
import { uzLatinToCyrl } from './transliterate'
import type { Lang } from './i18n'

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

// === i18n helper'lar ===

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

export async function getUnlocked(telegramId: number): Promise<string[]> {
    const { data, error } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('telegram_id', telegramId)
    if (error) { console.error(error); return [] }
    return (data ?? []).map(r => r.achievement_id)
}

export async function fetchStats(telegramId: number): Promise<Stats> {
    const [user, logs, water, weight, fasting] = await Promise.all([
        supabase.from('users').select('current_streak').eq('telegram_id', telegramId).maybeSingle(),
        supabase.from('food_logs').select('calories', { count: 'exact' }).eq('user_id', telegramId),
        supabase.from('water_logs').select('logged_at').eq('telegram_id', telegramId),
        supabase.from('weight_logs').select('id', { count: 'exact', head: true }).eq('telegram_id', telegramId),
        supabase.from('fasting_sessions').select('id', { count: 'exact', head: true }).eq('telegram_id', telegramId).eq('status', 'completed'),
    ])

    const totalKcal = (logs.data ?? []).reduce((a, r: any) => a + (r.calories ?? 0), 0)
    const waterByDay = new Set((water.data ?? []).map((r: any) => String(r.logged_at).slice(0, 10)))

    return {
        streak: user.data?.current_streak ?? 0,
        totalLogs: logs.count ?? 0,
        totalKcal,
        waterDays: waterByDay.size,
        weightLogs: weight.count ?? 0,
        fastingDone: fasting.count ?? 0,
        challengesDone: 0,
    }
}

export async function checkAndUnlock(telegramId: number): Promise<Achievement[]> {
    const stats = await fetchStats(telegramId)
    const unlocked = new Set(await getUnlocked(telegramId))
    const newOnes = ACHIEVEMENTS.filter(a => !unlocked.has(a.id) && a.check(stats))

    if (newOnes.length === 0) return []

    const rows = newOnes.map(a => ({
        telegram_id: telegramId,
        achievement_id: a.id,
        coin_reward: a.coin,
    }))
    const { error } = await supabase.from('user_achievements').insert(rows)
    if (error) { console.error('unlock insert:', error); return [] }

    const totalCoin = newOnes.reduce((a, x) => a + x.coin, 0)
    if (totalCoin > 0) {
        const { error: coinErr } = await supabase.rpc('add_coins', {
            p_telegram_id: telegramId,
            p_amount: totalCoin,
        })
        if (coinErr) console.error('coin add:', coinErr)
    }

    return newOnes
}