import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';
import { getTelegramId, showAlert } from './telegram';
import { addCoinsForLog, COINS_PER_LOG } from './coins';
import Bekjon from './components/Bekjon';
import { useTranslation } from './i18n';
import { uzLatinToCyrl } from './transliterate';
import type { ReactElement } from 'react';
import {
    upsertFavorite,
    getAllFavorites,
    toggleFavoritePin,
    deleteFavorite,
    type FavoriteFood,
} from './lib/favorites';


const DEFAULT_PORTIONS = [50, 100, 150, 200, 300];
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

interface Portion {
    name?: string;
    grams: number;
}

interface Food {
    id: string;
    name_uz: string;
    name_ru?: string | null;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    isLocal?: boolean;
    emoji?: string;
    portions?: Portion[];
}

interface LocalFoodRow {
    id: string;
    name_uz: string;
    name_ru: string | null;
    aliases: string[];
    kcal_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fat_per_100g: number;
    portions: Portion[];
    emoji: string;
}
// ===== Premium taom ikonlari (emoji'ga moslashtirilgan) =====
function FoodIcon({ emoji, size = 22 }: { emoji?: string; size?: number }) {
    if (!emoji) return null;
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        strokeWidth: 1.7,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    // Emoji → SVG mapping
    const map: Record<string, ReactElement> = {
        // 🍲 Osh / shurva / lag'mon — likobcha
        '🍲': (
            <svg {...common}>
                <ellipse cx="12" cy="11" rx="9" ry="2.2" fill="#F59E0B" fillOpacity="0.25" stroke="#F59E0B" />
                <path d="M3 11c0 4 4 8 9 8s9-4 9-8" stroke="#92400E" fill="#FCD34D" fillOpacity="0.4" />
                <path d="M8 7c0-1 1-1.5 1-2.5M12 6.5c0-1 1-1.5 1-2.5M16 7c0-1 1-1.5 1-2.5" stroke="#92400E" />
            </svg>
        ),
        // 🍗 Tandir kabob / tovuq — drumstick
        '🍗': (
            <svg {...common}>
                <path d="M14.5 4.5a4 4 0 0 0-6.5 4.8L4 13.5a2 2 0 1 0 2.8 2.8l4.2-4.2a4 4 0 0 0 5-7.6z" fill="#F59E0B" fillOpacity="0.35" stroke="#9A3412" />
                <path d="M5 14l-1 2M6 15l-2 1" stroke="#9A3412" />
            </svg>
        ),
        // 🥟 Manti / chuchvara — dumpling
        '🥟': (
            <svg {...common}>
                <path d="M4 14c0-4 3.5-7 8-7s8 3 8 7c0 .8-.4 1.5-1.2 1.5H5.2C4.4 15.5 4 14.8 4 14z" fill="#FEF3C7" stroke="#92400E" />
                <path d="M7 12c.5-.5 1-.5 1.5 0M11 11.5c.5-.5 1-.5 1.5 0M15 12c.5-.5 1-.5 1.5 0" stroke="#92400E" />
                <path d="M5 15.5h14l-1 2H6z" fill="#FCD34D" stroke="#92400E" />
            </svg>
        ),
        // 🥘 Somsa / kuza / palov — pan
        '🥘': (
            <svg {...common}>
                <path d="M3 11h18l-1 5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3l-1-5z" fill="#FCD34D" fillOpacity="0.5" stroke="#92400E" />
                <circle cx="9" cy="14" r="1" fill="#9A3412" />
                <circle cx="13" cy="13" r="1" fill="#9A3412" />
                <circle cx="16" cy="15" r="1" fill="#9A3412" />
                <path d="M3 11l-1.5-2M21 11l1.5-2" stroke="#92400E" />
            </svg>
        ),
        // 🍞 Non — bread
        '🍞': (
            <svg {...common}>
                <path d="M4 10c0-3 2-5 5-5h6c3 0 5 2 5 5v2H4v-2z" fill="#FCD34D" stroke="#92400E" />
                <path d="M4 12h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z" fill="#F59E0B" fillOpacity="0.4" stroke="#92400E" />
                <path d="M8 8v3M12 7.5v3.5M16 8v3" stroke="#92400E" />
            </svg>
        ),
        // 🍜 Lag'mon / noodles
        '🍜': (
            <svg {...common}>
                <path d="M3 11h18a9 9 0 0 1-18 0z" fill="#FCD34D" fillOpacity="0.4" stroke="#92400E" />
                <path d="M6 11c.5-2 1.5-3 2-2s-.5 2 0 3M11 11c.5-2 1.5-3 2-2s-.5 2 0 3M16 11c.5-2 1.5-3 2-2s-.5 2 0 3" stroke="#9A3412" />
            </svg>
        ),
        // 🍚 Guruch — rice bowl
        '🍚': (
            <svg {...common}>
                <path d="M3 11h18a9 9 0 0 1-18 0z" fill="#F1F5F9" stroke="#64748B" />
                <circle cx="8" cy="13" r=".7" fill="#64748B" />
                <circle cx="12" cy="14" r=".7" fill="#64748B" />
                <circle cx="16" cy="13" r=".7" fill="#64748B" />
                <circle cx="10" cy="15.5" r=".7" fill="#64748B" />
                <circle cx="14" cy="15.5" r=".7" fill="#64748B" />
            </svg>
        ),
        // ☕ Choy
        '☕': (
            <svg {...common}>
                <path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" fill="#FCD34D" fillOpacity="0.3" stroke="#92400E" />
                <path d="M17 10h2a2 2 0 0 1 0 4h-2" stroke="#92400E" />
                <path d="M8 5c0-1 1-1 1-2M11 5c0-1 1-1 1-2M14 5c0-1 1-1 1-2" stroke="#9A3412" />
            </svg>
        ),
        // 🥗 Salat
        '🥗': (
            <svg {...common}>
                <path d="M3 11h18a9 9 0 0 1-18 0z" fill="#86EFAC" fillOpacity="0.4" stroke="#15803D" />
                <circle cx="8" cy="9" r="2" fill="#EF4444" fillOpacity="0.5" stroke="#991B1B" />
                <circle cx="14" cy="8" r="1.5" fill="#FB923C" fillOpacity="0.6" stroke="#9A3412" />
                <path d="M11 7c.5-1 1.5-1.5 2.5-1" stroke="#15803D" />
            </svg>
        ),
        // 🥩 Go'sht
        '🥩': (
            <svg {...common}>
                <path d="M5 9c1-3 4-5 7-5s6 2 7 5-1 7-4 9-8 1-9-1-2-5-1-8z" fill="#EF4444" fillOpacity="0.35" stroke="#991B1B" />
                <path d="M9 9c1-1 3-2 5-1" stroke="#FCD34D" strokeWidth="2" />
            </svg>
        ),
        // 🐟 Baliq
        '🐟': (
            <svg {...common}>
                <path d="M3 12c0-3 4-6 9-6s8 3 8 6-3 6-8 6-9-3-9-6z" fill="#7DD3FC" fillOpacity="0.4" stroke="#0369A1" />
                <path d="M20 12l3-3v6l-3-3z" fill="#7DD3FC" fillOpacity="0.4" stroke="#0369A1" />
                <circle cx="7" cy="11" r=".8" fill="#0369A1" />
            </svg>
        ),
        // 🥛 Sut
        '🥛': (
            <svg {...common}>
                <path d="M7 4h10l-1 3H8L7 4z" fill="#F1F5F9" stroke="#64748B" />
                <path d="M8 7h8l-.5 12a2 2 0 0 1-2 2H10.5a2 2 0 0 1-2-2L8 7z" fill="#F8FAFC" stroke="#64748B" />
                <path d="M9 13h6" stroke="#64748B" />
            </svg>
        ),
        // 🥚 Tuxum
        '🥚': (
            <svg {...common}>
                <ellipse cx="12" cy="13" rx="6" ry="8" fill="#FEF3C7" stroke="#92400E" />
            </svg>
        ),
        // 🍎 Olma
        '🍎': (
            <svg {...common}>
                <path d="M12 6c-1-2-3-2.5-5-1.5s-2 4-1 7 4 7 6 7 5-4 6-7-1-6-3-7-2 .5-3 1.5z" fill="#EF4444" fillOpacity="0.45" stroke="#991B1B" />
                <path d="M12 6V4c0-1 1-2 2-2" stroke="#15803D" />
            </svg>
        ),
        // 🍌 Banan
        '🍌': (
            <svg {...common}>
                <path d="M5 6c0 8 5 13 13 13 2 0 2-2 1-2-5 0-10-5-10-10 0-1.5-2-1.5-4-1z" fill="#FCD34D" fillOpacity="0.5" stroke="#92400E" />
            </svg>
        ),
        // 🧀 Pishloq
        '🧀': (
            <svg {...common}>
                <path d="M3 11l9-5 9 5v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z" fill="#FCD34D" fillOpacity="0.5" stroke="#92400E" />
                <circle cx="8" cy="14" r=".8" fill="#92400E" />
                <circle cx="13" cy="13" r=".8" fill="#92400E" />
                <circle cx="16" cy="16" r=".8" fill="#92400E" />
            </svg>
        ),
        // 🍅 Pomidor
        '🍅': (
            <svg {...common}>
                <circle cx="12" cy="13" r="7" fill="#EF4444" fillOpacity="0.5" stroke="#991B1B" />
                <path d="M9 6l1 2 2-1 2 1 1-2" fill="#15803D" stroke="#15803D" />
            </svg>
        ),
        // 🥒 Bodring
        '🥒': (
            <svg {...common}>
                <path d="M16 4c2 0 4 2 4 4s-8 12-12 12-4-2-4-4S14 4 16 4z" fill="#86EFAC" fillOpacity="0.5" stroke="#15803D" />
            </svg>
        ),
    };
    return (
        map[emoji] || (
            // Default — generic bowl
            <svg {...common}>
                <ellipse cx="12" cy="11" rx="9" ry="2" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" />
                <path d="M3 11c0 4 4 8 9 8s9-4 9-8" fill="#FCD34D" fillOpacity="0.3" stroke="#92400E" />
            </svg>
        )
    );
}

export default function FoodSearch() {
    const { t, lang } = useTranslation();

    // Lang-aware nom tanlash
    function displayName(food: Food, nameRu?: string | null): string {
        if (lang === 'ru' && nameRu) return nameRu;
        if (lang === 'uz-Cyrl') return uzLatinToCyrl(food.name_uz);
        return food.name_uz;
    }
    function displayPortionName(name?: string): string | undefined {
        if (!name) return undefined;
        const lower = name.toLowerCase().trim();
        // Mahalliy porsiya nomlarini i18n kalitiga map qilish
        const map: Record<string, string> = {
            'kichik porsiya': 'p_small',
            "o'rta porsiya": 'p_medium',
            'katta porsiya': 'p_large',
            'oilaviy lagan': 'p_family',
        };
        if (map[lower]) return t(map[lower]);
        // "1 dona", "1 dona kichik", "2 dona" kabi shablonlar
        const m = lower.match(/^(\d+)\s+dona(?:\s+(kichik|o'rta|katta))?$/);
        if (m) {
            const n = m[1];
            const size = m[2];
            if (!size) return `${n} ${t('p_piece')}`;
            const sizeKey = size === 'kichik' ? 'p_piece_small' : size === "o'rta" ? 'p_piece_medium' : 'p_piece_large';
            return `${n} ${t(sizeKey)}`;
        }
        if (lang === 'uz-Cyrl') return uzLatinToCyrl(name);
        return name;
    }

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Food[]>([]);
    const [portions, setPortions] = useState<Record<string, number>>({});
    const [hasSearched, setHasSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedFood, setSavedFood] = useState<{ name: string; grams: number; cal: number } | null>(null);
    const [localCache, setLocalCache] = useState<LocalFoodRow[]>([]);

    // === Tab tizimi (Faza 2 mukammal) ===
    const [activeTab, setActiveTab] = useState<'search' | 'favorites' | 'local'>('search');
    const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
    const [loadingFavs, setLoadingFavs] = useState(false);
    const [favActionId, setFavActionId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [localQuery, setLocalQuery] = useState('');

    // Mahalliy taomlarni cache'ga yuklash
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from('local_foods').select('*');
            if (!error && data) setLocalCache(data as LocalFoodRow[]);
        })();
    }, []);

    // Tab favorites'ga o'tganda yuklash
    useEffect(() => {
        if (activeTab !== 'favorites') return;
        const telegramId = getTelegramId();
        if (!telegramId) return;
        setLoadingFavs(true);
        getAllFavorites(telegramId, 50)
            .then(setFavorites)
            .finally(() => setLoadingFavs(false));
    }, [activeTab]);

    // === Sevimlidan tezda log qilish ===
    async function addFavoriteFood(fav: FavoriteFood, grams = 100) {
        const telegramId = getTelegramId();
        if (!telegramId) return;
        setFavActionId(fav.id);
        try {
            const ratio = grams / 100;
            const calories = Math.round(fav.kcal_per_100g * ratio);
            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: fav.food_name,
                calories,
                protein: +(fav.protein_per_100g * ratio).toFixed(1),
                fat: +(fav.fat_per_100g * ratio).toFixed(1),
                carbs: +(fav.carbs_per_100g * ratio).toFixed(1),
            });
            if (error) throw error;
            // use_count oshirish
            await upsertFavorite({
                telegramId,
                foodName: fav.food_name,
                kcalPer100g: fav.kcal_per_100g,
                proteinPer100g: fav.protein_per_100g,
                fatPer100g: fav.fat_per_100g,
                carbsPer100g: fav.carbs_per_100g,
                source: fav.source,
                sourceId: fav.source_id,
                emoji: fav.emoji,
            });
            await addCoinsForLog();
            // Lokal state yangilash (use_count++)
            setFavorites((prev) =>
                prev.map((f) => (f.id === fav.id ? { ...f, use_count: f.use_count + 1 } : f))
            );
            setSavedFood({ name: fav.food_name, grams, cal: calories });
            setTimeout(() => setSavedFood(null), 2000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('food_save_error');
            await showAlert(msg);
        } finally {
            setFavActionId(null);
        }
    }

    async function handleTogglePin(fav: FavoriteFood) {
        const telegramId = getTelegramId();
        if (!telegramId) return;
        const newPinned = await toggleFavoritePin(telegramId, fav.id);
        setFavorites((prev) => {
            const updated = prev.map((f) => (f.id === fav.id ? { ...f, is_pinned: newPinned } : f));
            // Re-sort: pinned tepada
            return [...updated].sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                if (a.use_count !== b.use_count) return b.use_count - a.use_count;
                return b.last_used_at.localeCompare(a.last_used_at);
            });
        });
    }

    async function handleDeleteFav(fav: FavoriteFood) {
        const telegramId = getTelegramId();
        if (!telegramId) return;
        setFavActionId(fav.id);
        const ok = await deleteFavorite(telegramId, fav.id);
        if (ok) {
            setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
        }
        setFavActionId(null);
        setConfirmDeleteId(null);
    }

    function filterLocal(q: string): Food[] {
        const qLower = q.toLowerCase().trim();
        if (!qLower) return [];
        return localCache
            .filter((row) => {
                if (row.name_uz.toLowerCase().includes(qLower)) return true;
                if (row.name_ru?.toLowerCase().includes(qLower)) return true;
                return row.aliases.some((a) => a.toLowerCase().includes(qLower));
            })
            .slice(0, 7)
            .map((row) => ({
                id: `local_${row.id}`,
                name_uz: row.name_uz,
                name_ru: row.name_ru,
                calories: Number(row.kcal_per_100g),
                protein: Number(row.protein_per_100g),
                fat: Number(row.fat_per_100g),
                carbs: Number(row.carbs_per_100g),
                isLocal: true,
                emoji: row.emoji,
                portions: row.portions,
            }));
    }

    async function search() {
        const q = query.trim();
        if (!q) {
            setResults([]);
            setHasSearched(false);
            return;
        }
        setSearching(true);
        try {
            const localResults = filterLocal(q);
            const remaining = Math.max(3, 10 - localResults.length);

            const { data: globalData, error } = await supabase
                .from('foods')
                .select('*')
                .ilike('name_uz', `%${q}%`)
                .limit(remaining);
            if (error) throw error;

            const globalResults: Food[] = (globalData || []).map((row: { id: number; name_uz: string; calories: number; protein: number; fat: number; carbs: number }) => ({
                id: `global_${row.id}`,
                name_uz: row.name_uz,
                calories: row.calories,
                protein: row.protein,
                fat: row.fat,
                carbs: row.carbs,
                isLocal: false,
            }));

            setResults([...localResults, ...globalResults]);
            setHasSearched(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('error_prefix');
            await showAlert(msg);
        } finally {
            setSearching(false);
        }
    }

    function setPortion(foodId: string, grams: number) {
        setPortions((p) => ({ ...p, [foodId]: grams }));
    }

    async function addFood(food: Food) {
        const grams = portions[food.id] || 100;
        const ratio = grams / 100;
        const calories = Math.round(food.calories * ratio);

        setSavingId(food.id);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('food_no_telegram'));

            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: food.name_uz,
                calories,
                protein: +(food.protein * ratio).toFixed(1),
                fat: +(food.fat * ratio).toFixed(1),
                carbs: +(food.carbs * ratio).toFixed(1),
            });
            if (error) throw error;

            // Sevimlilarga avtomatik qo'shish / use_count oshirish
            await upsertFavorite({
                telegramId,
                foodName: food.name_uz,
                kcalPer100g: food.calories,
                proteinPer100g: food.protein,
                fatPer100g: food.fat,
                carbsPer100g: food.carbs,
                source: food.isLocal ? 'local' : 'manual',
                sourceId: food.id,
                emoji: food.emoji ?? null,
            });

            await addCoinsForLog();

            setSavedFood({ name: displayName(food, food.name_ru), grams, cal: calories });
            setTimeout(() => setSavedFood(null), 2000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('food_save_error');
            await showAlert(msg);
        } finally {
            setSavingId(null);
        }
    }

    return (
        <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
            <div className="max-w-md mx-auto px-5 pt-7">
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mb-5"
                >
                    <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">{t('food_title')}</h1>
                    <p className="text-[13px] text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                        {t('food_subtitle')}
                    </p>
                </motion.div>

                {/* Tab pill — Qidiruv / Sevimlilar / Mahalliy */}
                <div
                    className="flex p-1 rounded-2xl mb-4 bg-white dark:bg-[#1E252E]"
                    style={{ boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.12)' }}
                >
                    {(['search', 'favorites', 'local'] as const).map((tab) => {
                        const isActive = activeTab === tab;
                        const label =
                            tab === 'search' ? t('fav_tab_search') :
                                tab === 'favorites' ? t('fav_tab_favorites') :
                                    t('fav_tab_local');
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className="relative flex-1 py-2.5 text-[12px] font-extrabold rounded-xl transition-colors"
                                style={{
                                    color: isActive ? '#FFFFFF' : 'var(--color-muted, #78716C)',
                                }}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="foodSearchTabPill"
                                        className="absolute inset-0 rounded-xl"
                                        style={{
                                            background: '#5B6AD0',
                                            boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                        }}
                                        transition={SPRING}
                                    />
                                )}
                                <span className="relative z-10">{label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Global savedFood toast — 3 tab uchun */}
                <AnimatePresence>
                    {savedFood && (
                        <motion.div
                            key="saved-toast"
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={SPRING}
                            className="rounded-2xl p-4 mb-4 flex items-center gap-3"
                            style={{ background: '#E8F5E9' }}
                        >
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-emerald-600">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-extrabold text-emerald-900 capitalize text-sm">
                                    {savedFood.name} {t('food_added_suffix')}
                                </div>
                                <div className="text-xs text-emerald-700 font-semibold mt-0.5">
                                    {savedFood.grams}g · {savedFood.cal} kcal
                                </div>
                            </div>
                            <motion.div
                                initial={{ scale: 0, rotate: -30 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
                                className="px-2.5 py-1 rounded-full text-xs font-extrabold flex items-center gap-1"
                                style={{ background: '#FFF4D6', color: '#854F0B' }}
                            >
                                +{COINS_PER_LOG} 🪙
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {activeTab === 'search' && (<>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...SPRING, delay: 0.05 }}
                        className="relative mb-3"
                    >
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && search()}
                            placeholder={t('food_placeholder')}
                            className="w-full rounded-2xl px-5 py-4 pr-28 bg-white dark:bg-[#1E252E] text-stone-900 dark:text-slate-100 font-semibold placeholder-stone-400 dark:placeholder-slate-500 focus:outline-none transition"
                            style={{
                                border: '2px solid transparent',
                                boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.12)',
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = '#5B6AD0')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                        />
                        <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={search}
                            disabled={searching}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-sm font-extrabold px-4 py-2.5 rounded-xl disabled:opacity-50"
                            style={{
                                background: '#5B6AD0',
                                boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                            }}
                        >
                            {searching ? '...' : t('food_search_btn')}
                        </motion.button>
                    </motion.div>

                    {results.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={SPRING}
                            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-8 flex flex-col items-center text-center"
                            style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                        >
                            <Bekjon mood={hasSearched ? 'sleeping' : 'hungry'} size={120} />
                            <p className="text-sm text-stone-600 dark:text-slate-300 font-semibold mt-3">
                                {hasSearched ? t('food_not_found') : t('food_prompt')}
                            </p>
                            {!hasSearched && localCache.length > 0 && (
                                <p className="text-[11px] text-stone-400 dark:text-slate-500 font-bold mt-2">
                                    {t('food_local_count').replace('{n}', String(localCache.length))}
                                </p>
                            )}
                        </motion.div>
                    )}

                    <div className="space-y-3">
                        <AnimatePresence>
                            {results.map((food, idx) => {
                                const selectedPortion = portions[food.id] || 100;
                                const ratio = selectedPortion / 100;
                                const displayCal = Math.round(food.calories * ratio);
                                const displayP = +(food.protein * ratio).toFixed(1);
                                const displayF = +(food.fat * ratio).toFixed(1);
                                const displayC = +(food.carbs * ratio).toFixed(1);
                                const isSaving = savingId === food.id;

                                const portionList: Portion[] =
                                    food.portions && food.portions.length > 0
                                        ? food.portions
                                        : DEFAULT_PORTIONS.map((g) => ({ grams: g }));

                                return (
                                    <motion.div
                                        key={food.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ ...SPRING, delay: idx * 0.04 }}
                                        className="bg-white dark:bg-[#1E252E] rounded-[1.5rem] p-4"
                                        style={{
                                            boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.10)',
                                            border: food.isLocal ? '1.5px solid rgba(91, 106, 208, 0.15)' : 'none',
                                        }}
                                    >
                                        <div className="flex justify-between items-start mb-3 gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {food.emoji && <FoodIcon emoji={food.emoji} size={22} />}
                                                    <h3 className="font-extrabold text-stone-900 dark:text-slate-100 capitalize text-[15px]">
                                                        {displayName(food, food.name_ru)}
                                                    </h3>
                                                    {food.isLocal && (
                                                        <span
                                                            className="px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap"
                                                            style={{ background: '#FFF4D6', color: '#854F0B' }}
                                                        >
                                                            {t('food_local_badge')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-1.5 mt-1">
                                                    <span className="text-2xl font-extrabold" style={{ color: '#5B6AD0' }}>
                                                        {displayCal}
                                                    </span>
                                                    <span className="text-xs text-stone-400 dark:text-slate-500 font-bold">kcal</span>
                                                </div>
                                            </div>
                                            <motion.button
                                                whileTap={{ scale: 0.94 }}
                                                onClick={() => addFood(food)}
                                                disabled={isSaving}
                                                className="text-white text-sm font-extrabold px-4 py-2.5 rounded-xl disabled:opacity-50 shrink-0"
                                                style={{
                                                    background: '#5B6AD0',
                                                    boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                                }}
                                            >
                                                {isSaving ? '...' : t('food_add_btn')}
                                            </motion.button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            <MacroPill label={t('macro_protein')} value={displayP} cls="bg-[#FFF4D6] dark:bg-[#2A2418]" />
                                            <MacroPill label={t('macro_fat')} value={displayF} cls="bg-[#FAD9C8] dark:bg-[#2A2018]" />
                                            <MacroPill label={t('macro_carbs')} value={displayC} cls="bg-[#DDE3F5] dark:bg-[#1F2330]" />
                                        </div>

                                        <div className="flex gap-1.5 flex-wrap">
                                            {portionList.map((p, pi) => {
                                                const isSel = selectedPortion === p.grams;
                                                return (
                                                    <motion.button
                                                        key={`${food.id}_${p.grams}_${pi}`}
                                                        whileTap={{ scale: 0.93 }}
                                                        onClick={() => setPortion(food.id, p.grams)}
                                                        className={`px-3 py-1.5 text-[11px] font-extrabold rounded-lg transition-colors ${isSel
                                                            ? 'bg-[#5B6AD0] text-white'
                                                            : 'bg-[#F3F4F8] dark:bg-[#252D38] text-gray-700 dark:text-slate-300'
                                                            }`}
                                                    >
                                                        {p.name ? `${displayPortionName(p.name)} · ${p.grams}g` : `${p.grams}g`}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </>)}

                {activeTab === 'favorites' && (
                    <FavoritesView
                        favorites={favorites}
                        loading={loadingFavs}
                        actionId={favActionId}
                        confirmDeleteId={confirmDeleteId}
                        onAdd={addFavoriteFood}
                        onPin={handleTogglePin}
                        onAskDelete={setConfirmDeleteId}
                        onConfirmDelete={handleDeleteFav}
                        t={t}
                        displayLang={lang}
                    />
                )}

                {activeTab === 'local' && (
                    <LocalView
                        localCache={localCache}
                        localQuery={localQuery}
                        setLocalQuery={setLocalQuery}
                        savingId={savingId}
                        portions={portions}
                        setPortion={setPortion}
                        addFood={addFood}
                        t={t}
                        displayLang={lang}
                    />
                )}
            </div>
        </div>
    );
}

function MacroPill({ label, value, cls }: { label: string; value: number; cls: string }) {
    return (
        <div className={`rounded-xl p-2 text-center ${cls}`}>
            <div className="text-[9px] font-extrabold  text-stone-700 dark:text-slate-300 uppercase tracking-wider">
                {label}
            </div>
            <div className="text-sm font-extrabold text-stone-900 dark:text-slate-100 mt-0.5">
                {value}<span className="text-[10px] text-stone-500 dark:text-slate-400 font-semibold">g</span>
            </div>
        </div>
    );
}

// =================================================================
// FavoritesView — Sevimlilar tab (swipe-to-delete + pin)
// =================================================================
interface FavoritesViewProps {
    favorites: FavoriteFood[];
    loading: boolean;
    actionId: number | null;
    confirmDeleteId: number | null;
    onAdd: (fav: FavoriteFood) => void;
    onPin: (fav: FavoriteFood) => void;
    onAskDelete: (id: number | null) => void;
    onConfirmDelete: (fav: FavoriteFood) => void;
    t: (key: string) => string;
    displayLang: string;
}

function FavoritesView({
    favorites,
    loading,
    actionId,
    confirmDeleteId,
    onAdd,
    onPin,
    onAskDelete,
    onConfirmDelete,
    t,
    displayLang,
}: FavoritesViewProps) {
    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-9 h-9 rounded-full border-[3px] border-stone-200 dark:border-slate-700"
                    style={{ borderTopColor: '#5B6AD0' }}
                />
            </div>
        );
    }

    if (favorites.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={SPRING}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-8 flex flex-col items-center text-center"
                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
            >
                <Bekjon mood="hungry" size={120} />
                <h3 className="text-[15px] font-extrabold text-stone-900 dark:text-slate-100 mt-3">
                    {t('fav_empty_title')}
                </h3>
                <p className="text-[12px] text-stone-500 dark:text-slate-400 font-semibold mt-1.5 leading-relaxed">
                    {t('fav_empty_sub')}
                </p>
            </motion.div>
        );
    }

    const targetToDelete = confirmDeleteId
        ? favorites.find((f) => f.id === confirmDeleteId) ?? null
        : null;

    return (
        <>
            <div className="space-y-2.5">
                <AnimatePresence initial={false}>
                    {favorites.map((fav, idx) => (
                        <FavoriteRow
                            key={fav.id}
                            fav={fav}
                            idx={idx}
                            disabled={actionId === fav.id}
                            onAdd={() => onAdd(fav)}
                            onPin={() => onPin(fav)}
                            onAskDelete={() => onAskDelete(fav.id)}
                            t={t}
                            displayLang={displayLang}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Confirm delete modal */}
            <AnimatePresence>
                {targetToDelete && (
                    <motion.div
                        key="delete-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
                        onClick={() => onAskDelete(null)}
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            transition={SPRING}
                            className="w-full max-w-md bg-white dark:bg-[#1E252E] rounded-t-[2rem] p-6 pb-8"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="w-12 h-1.5 bg-stone-300 dark:bg-slate-600 rounded-full mx-auto mb-5" />
                            <div className="flex items-center gap-3 mb-1">
                                <div
                                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl"
                                    style={{ background: '#FEE2E2' }}
                                >
                                    🗑️
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-extrabold text-stone-900 dark:text-slate-100 text-[15px]">
                                        {t('fav_delete_confirm')}
                                    </h3>
                                    <p className="text-[12px] text-stone-500 dark:text-slate-400 font-semibold capitalize truncate">
                                        {targetToDelete.food_name}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-5">
                                <button
                                    onClick={() => onAskDelete(null)}
                                    className="flex-1 py-3 rounded-xl font-extrabold text-[13px] bg-stone-100 dark:bg-[#252D38] text-stone-700 dark:text-slate-300"
                                >
                                    {t('cancel') || '✕'}
                                </button>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => onConfirmDelete(targetToDelete)}
                                    className="flex-1 py-3 rounded-xl font-extrabold text-white text-[13px]"
                                    style={{
                                        background: '#EF4444',
                                        boxShadow: '0 4px 12px -4px rgba(239, 68, 68, 0.5)',
                                    }}
                                >
                                    {t('fav_delete')}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// =================================================================
// FavoriteRow — swipe-to-reveal Pin/Delete tugmalari
// =================================================================
interface FavoriteRowProps {
    fav: FavoriteFood;
    idx: number;
    disabled: boolean;
    onAdd: () => void;
    onPin: () => void;
    onAskDelete: () => void;
    t: (key: string) => string;
    displayLang: string;
}

function FavoriteRow({ fav, idx, disabled, onAdd, onPin, onAskDelete, t, displayLang }: FavoriteRowProps) {
    const [revealed, setRevealed] = useState(false);
    const SWIPE_WIDTH = 130;

    function displayFavName(): string {
        if (displayLang === 'uz-Cyrl') return uzLatinToCyrl(fav.food_name);
        return fav.food_name;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -300, height: 0, marginBottom: 0 }}
            transition={{ ...SPRING, delay: idx * 0.03 }}
            className="relative overflow-hidden rounded-[1.25rem]"
        >
            {/* Background actions — swipe revealed */}
            <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: SWIPE_WIDTH }}>
                <button
                    onClick={onPin}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white font-extrabold"
                    style={{ background: fav.is_pinned ? '#94A3B8' : '#F59E0B' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5M9 10.76V6h6v4.76l3 5.24H6l3-5.24z" />
                    </svg>
                    <span className="text-[10px]">{fav.is_pinned ? t('fav_unpin') : t('fav_pin')}</span>
                </button>
                <button
                    onClick={onAskDelete}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white font-extrabold"
                    style={{ background: '#EF4444' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                    </svg>
                    <span className="text-[10px]">{t('fav_delete')}</span>
                </button>
            </div>

            {/* Foreground — draggable card */}
            <motion.div
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: -SWIPE_WIDTH, right: 0 }}
                dragElastic={0.05}
                dragMomentum={false}
                animate={{ x: revealed ? -SWIPE_WIDTH : 0 }}
                transition={SPRING}
                onDragEnd={(_, info) => {
                    if (info.offset.x < -50) setRevealed(true);
                    else setRevealed(false);
                }}
                className="relative bg-white dark:bg-[#1E252E] p-3.5 flex items-center gap-3"
                style={{
                    boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.10)',
                    touchAction: 'pan-y',
                }}
            >
                {/* Emoji / icon */}
                <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                        background: fav.is_pinned ? '#FFF4D6' : '#F3F4F8',
                    }}
                >
                    {fav.emoji ? (
                        <span className="text-[20px]">{fav.emoji}</span>
                    ) : (
                        <span className="text-[14px] font-extrabold" style={{ color: '#5B6AD0' }}>
                            {fav.food_name.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-[14px] text-stone-900 dark:text-slate-100 capitalize truncate">
                            {displayFavName()}
                        </h4>
                        {fav.is_pinned && (
                            <span
                                className="px-1.5 py-0.5 rounded-md text-[8px] font-extrabold whitespace-nowrap"
                                style={{ background: '#FFF4D6', color: '#854F0B' }}
                            >
                                📌
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[12px] font-extrabold" style={{ color: '#5B6AD0' }}>
                            {Math.round(fav.kcal_per_100g)} kcal/100g
                        </span>
                        {fav.use_count > 1 && (
                            <span className="text-[10px] text-stone-400 dark:text-slate-500 font-bold">
                                · {fav.use_count} {t('fav_uses')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Quick add (100g) */}
                <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (revealed) {
                            setRevealed(false);
                            return;
                        }
                        onAdd();
                    }}
                    disabled={disabled}
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-50"
                    style={{
                        background: '#5B6AD0',
                        boxShadow: '0 3px 10px -3px rgba(91, 106, 208, 0.5)',
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

// =================================================================
// LocalView — 🇺🇿 Mahalliy taomlar (filter + grid)
// =================================================================
interface LocalViewProps {
    localCache: LocalFoodRow[];
    localQuery: string;
    setLocalQuery: (q: string) => void;
    savingId: string | null;
    portions: Record<string, number>;
    setPortion: (id: string, g: number) => void;
    addFood: (food: Food) => void;
    t: (key: string) => string;
    displayLang: string;
}

function LocalView({
    localCache,
    localQuery,
    setLocalQuery,
    savingId,
    portions,
    setPortion,
    addFood,
    t,
    displayLang,
}: LocalViewProps) {
    function localDisplayName(row: LocalFoodRow): string {
        if (displayLang === 'ru' && row.name_ru) return row.name_ru;
        if (displayLang === 'uz-Cyrl') return uzLatinToCyrl(row.name_uz);
        return row.name_uz;
    }

    function displayPortionName(name?: string): string | undefined {
        if (!name) return undefined;
        const lower = name.toLowerCase().trim();
        const map: Record<string, string> = {
            'kichik porsiya': 'p_small',
            "o'rta porsiya": 'p_medium',
            'katta porsiya': 'p_large',
            'oilaviy lagan': 'p_family',
        };
        if (map[lower]) return t(map[lower]);
        const m = lower.match(/^(\d+)\s+dona(?:\s+(kichik|o'rta|katta))?$/);
        if (m) {
            const n = m[1];
            const size = m[2];
            if (!size) return `${n} ${t('p_piece')}`;
            const sizeKey = size === 'kichik' ? 'p_piece_small' : size === "o'rta" ? 'p_piece_medium' : 'p_piece_large';
            return `${n} ${t(sizeKey)}`;
        }
        if (displayLang === 'uz-Cyrl') return uzLatinToCyrl(name);
        return name;
    }

    const qLower = localQuery.toLowerCase().trim();
    const filtered = qLower
        ? localCache.filter((row) => {
            if (row.name_uz.toLowerCase().includes(qLower)) return true;
            if (row.name_ru?.toLowerCase().includes(qLower)) return true;
            return row.aliases.some((a) => a.toLowerCase().includes(qLower));
        })
        : localCache;

    if (localCache.length === 0) {
        return (
            <div className="flex justify-center py-12">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-9 h-9 rounded-full border-[3px] border-stone-200 dark:border-slate-700"
                    style={{ borderTopColor: '#5B6AD0' }}
                />
            </div>
        );
    }

    return (
        <div>
            {/* Filter input */}
            <div className="relative mb-3">
                <input
                    type="text"
                    value={localQuery}
                    onChange={(e) => setLocalQuery(e.target.value)}
                    placeholder={t('food_placeholder')}
                    className="w-full rounded-2xl px-5 py-3.5 bg-white dark:bg-[#1E252E] text-stone-900 dark:text-slate-100 font-semibold placeholder-stone-400 dark:placeholder-slate-500 focus:outline-none"
                    style={{
                        border: '2px solid transparent',
                        boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.12)',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#5B6AD0')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                />
            </div>

            <div className="text-[11px] text-stone-400 dark:text-slate-500 font-extrabold mb-3 px-1">
                {filtered.length} / {localCache.length}
            </div>

            <div className="space-y-3">
                {filtered.slice(0, 50).map((row, idx) => {
                    const food: Food = {
                        id: `local_${row.id}`,
                        name_uz: row.name_uz,
                        name_ru: row.name_ru,
                        calories: Number(row.kcal_per_100g),
                        protein: Number(row.protein_per_100g),
                        fat: Number(row.fat_per_100g),
                        carbs: Number(row.carbs_per_100g),
                        isLocal: true,
                        emoji: row.emoji,
                        portions: row.portions,
                    };
                    const selectedPortion = portions[food.id] || 100;
                    const ratio = selectedPortion / 100;
                    const displayCal = Math.round(food.calories * ratio);
                    const isSaving = savingId === food.id;
                    const portionList: Portion[] =
                        food.portions && food.portions.length > 0
                            ? food.portions
                            : DEFAULT_PORTIONS.map((g) => ({ grams: g }));

                    return (
                        <motion.div
                            key={food.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...SPRING, delay: Math.min(idx * 0.02, 0.3) }}
                            className="bg-white dark:bg-[#1E252E] rounded-[1.5rem] p-4"
                            style={{
                                boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.10)',
                                border: '1.5px solid rgba(91, 106, 208, 0.15)',
                            }}
                        >
                            <div className="flex justify-between items-start mb-3 gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {food.emoji && <FoodIcon emoji={food.emoji} size={22} />}
                                        <h3 className="font-extrabold text-stone-900 dark:text-slate-100 capitalize text-[15px]">
                                            {localDisplayName(row)}
                                        </h3>
                                    </div>
                                    <div className="flex items-baseline gap-1.5 mt-1">
                                        <span className="text-2xl font-extrabold" style={{ color: '#5B6AD0' }}>
                                            {displayCal}
                                        </span>
                                        <span className="text-xs text-stone-400 dark:text-slate-500 font-bold">kcal</span>
                                    </div>
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => addFood(food)}
                                    disabled={isSaving}
                                    className="text-white text-sm font-extrabold px-4 py-2.5 rounded-xl disabled:opacity-50 shrink-0"
                                    style={{
                                        background: '#5B6AD0',
                                        boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                    }}
                                >
                                    {isSaving ? '...' : t('food_add_btn')}
                                </motion.button>
                            </div>

                            <div className="flex gap-1.5 flex-wrap">
                                {portionList.map((p, pi) => {
                                    const isSel = selectedPortion === p.grams;
                                    return (
                                        <motion.button
                                            key={`${food.id}_${p.grams}_${pi}`}
                                            whileTap={{ scale: 0.93 }}
                                            onClick={() => setPortion(food.id, p.grams)}
                                            className={`px-3 py-1.5 text-[11px] font-extrabold rounded-lg transition-colors ${isSel
                                                ? 'bg-[#5B6AD0] text-white'
                                                : 'bg-[#F3F4F8] dark:bg-[#252D38] text-gray-700 dark:text-slate-300'
                                                }`}
                                        >
                                            {p.name ? `${displayPortionName(p.name)} · ${p.grams}g` : `${p.grams}g`}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {filtered.length > 50 && (
                <div className="text-center text-[11px] text-stone-400 dark:text-slate-500 font-bold mt-4">
                    +{filtered.length - 50}
                </div>
            )}
        </div>
    );
}