// src/lib/favorites.ts
import { supabase } from '../supabase'

export type FavoriteSource = 'off' | 'usda' | 'local' | 'manual' | 'ai' | 'barcode'

export interface FavoriteFood {
    id: number
    telegram_id: number
    food_name: string
    food_name_normalized: string
    kcal_per_100g: number
    protein_per_100g: number
    fat_per_100g: number
    carbs_per_100g: number
    source: FavoriteSource
    source_id: string | null
    emoji: string | null
    use_count: number
    is_pinned: boolean
    last_used_at: string
    created_at: string
}

export interface UpsertFavoriteInput {
    telegramId: number
    foodName: string
    kcalPer100g: number
    proteinPer100g: number
    fatPer100g: number
    carbsPer100g: number
    source?: FavoriteSource
    sourceId?: string | null
    emoji?: string | null
}

/**
 * Har taom log qilinganda chaqiriladi.
 * Upsert: bor bo'lsa use_count++, yo'q bo'lsa yangi qator.
 */
export async function upsertFavorite(input: UpsertFavoriteInput): Promise<FavoriteFood | null> {
    const { data, error } = await supabase.rpc('upsert_favorite_food', {
        p_telegram_id: input.telegramId,
        p_food_name: input.foodName,
        p_kcal: input.kcalPer100g,
        p_protein: input.proteinPer100g,
        p_fat: input.fatPer100g,
        p_carbs: input.carbsPer100g,
        p_source: input.source ?? 'manual',
        p_source_id: input.sourceId ?? null,
        p_emoji: input.emoji ?? null,
    })

    if (error) {
        console.error('[favorites] upsert error:', error)
        return null
    }
    return (Array.isArray(data) ? data[0] : data) as FavoriteFood | null
}

/**
 * Dashboard "Tez qo'shish" uchun — top 4-8.
 * Pinned tepada, keyin use_count, keyin oxirgi ishlatilgan.
 */
export async function getTopFavorites(
    telegramId: number,
    limit = 8
): Promise<FavoriteFood[]> {
    const { data, error } = await supabase
        .from('favorite_foods')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('is_pinned', { ascending: false })
        .order('use_count', { ascending: false })
        .order('last_used_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('[favorites] getTop error:', error)
        return []
    }
    return (data ?? []) as FavoriteFood[]
}

/**
 * FoodSearch "Sevimlilar" tab — to'liq ro'yxat (oxirgi 50).
 */
export async function getAllFavorites(
    telegramId: number,
    limit = 50
): Promise<FavoriteFood[]> {
    const { data, error } = await supabase
        .from('favorite_foods')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('is_pinned', { ascending: false })
        .order('use_count', { ascending: false })
        .order('last_used_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('[favorites] getAll error:', error)
        return []
    }
    return (data ?? []) as FavoriteFood[]
}

/**
 * Pin/Unpin toggle. Yangi holatni qaytaradi.
 */
export async function toggleFavoritePin(
    telegramId: number,
    favoriteId: number
): Promise<boolean> {
    const { data, error } = await supabase.rpc('toggle_favorite_pin', {
        p_telegram_id: telegramId,
        p_favorite_id: favoriteId,
    })

    if (error) {
        console.error('[favorites] toggle pin error:', error)
        return false
    }
    return Boolean(data)
}

/**
 * Sevimlidan o'chirish (qo'lda).
 */
export async function deleteFavorite(
    telegramId: number,
    favoriteId: number
): Promise<boolean> {
    const { error } = await supabase
        .from('favorite_foods')
        .delete()
        .eq('id', favoriteId)
        .eq('telegram_id', telegramId)

    if (error) {
        console.error('[favorites] delete error:', error)
        return false
    }
    return true
}

/**
 * Search ichida — kiritilgan taom oldin sevimlilarda bormi tekshirish (yulduzcha holati uchun).
 */
export async function isFavorite(
    telegramId: number,
    foodName: string
): Promise<FavoriteFood | null> {
    const normalized = foodName.trim().toLowerCase().replace(/\s+/g, ' ')
    const { data, error } = await supabase
        .from('favorite_foods')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('food_name_normalized', normalized)
        .maybeSingle()

    if (error) {
        console.error('[favorites] isFavorite error:', error)
        return null
    }
    return data as FavoriteFood | null
}

/**
 * Vaqt asosida meal type aniqlash (fallback).
 * Soatlar yondashuvi: 06–10 nonushta, 11–15 tushlik, 17–21 kechki, qolgan vaqt — yengil ovqat.
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export function guessMealTypeByTime(date: Date = new Date()): MealType {
    const h = date.getHours()
    if (h >= 6 && h <= 10) return 'breakfast'
    if (h >= 11 && h <= 15) return 'lunch'
    if (h >= 17 && h <= 21) return 'dinner'
    return 'snack'
}

/**
 * Foydalanuvchining oxirgi 200 ta log'i tahlili — har food_name uchun
 * eng ko'p ishlatilgan meal_type. Map<normalized_food_name, MealType>.
 */
export async function getMealTypeStats(
    telegramId: number,
    sampleSize = 200
): Promise<Map<string, MealType>> {
    const result = new Map<string, MealType>()
    const { data, error } = await supabase
        .from('food_logs')
        .select('food_name, meal_type')
        .eq('user_id', telegramId)
        .not('meal_type', 'is', null)
        .order('id', { ascending: false })
        .limit(sampleSize)

    if (error || !data) {
        if (error) console.error('[favorites] getMealTypeStats error:', error)
        return result
    }

    // food_name → meal_type → count
    const counts = new Map<string, Record<MealType, number>>()
    for (const row of data as { food_name: string; meal_type: MealType | null }[]) {
        if (!row.meal_type) continue
        const norm = (row.food_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
        if (!norm) continue
        const bucket = counts.get(norm) ?? { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
        bucket[row.meal_type] += 1
        counts.set(norm, bucket)
    }

    // Top meal_type for each food
    for (const [norm, bucket] of counts) {
        let top: MealType = 'lunch'
        let topVal = -1
        for (const mt of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
            if (bucket[mt] > topVal) {
                top = mt
                topVal = bucket[mt]
            }
        }
        // Faqat 2+ marta ishlatilganda confident — bo'lmasa map'ga qo'shmaymiz, time fallback ishlaydi
        if (topVal >= 2) result.set(norm, top)
    }
    return result
}

/**
 * Smart suggestion — favoritga mos kelsa history, bo'lmasa vaqtga qarab.
 */
export function suggestMealType(
    fav: FavoriteFood,
    stats: Map<string, MealType>,
    now: Date = new Date()
): MealType {
    const norm = fav.food_name.trim().toLowerCase().replace(/\s+/g, ' ')
    return stats.get(norm) ?? guessMealTypeByTime(now)
}