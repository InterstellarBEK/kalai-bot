// src/QuickAddCard.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';
import { getTelegramId } from './telegram';
import {
    getTopFavorites,
    toggleFavoritePin,
    getMealTypeStats,
    suggestMealType,
    type FavoriteFood,
    type MealType,
} from './lib/favorites';
import { addCoinsForLog } from './coins';
import { useTranslation } from './i18n';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

interface Props {
    onLogged?: () => void;
}

// ============ SVG ikonlar ============
function QIcon({ name, size = 18 }: { name: 'bolt' | 'pin' | 'star' | 'plus' | 'close' | 'chevron'; size?: number }) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    switch (name) {
        case 'bolt':
            return (
                <svg {...common}>
                    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" fillOpacity="0.18" />
                </svg>
            );
        case 'pin':
            return (
                <svg {...common}>
                    <path d="M12 2l2.5 6 6.5.5-5 4.5 1.5 6.5L12 16.5 6.5 19.5 8 13 3 8.5 9.5 8z" fill="currentColor" fillOpacity="0.18" />
                </svg>
            );
        case 'star':
            return (
                <svg {...common}>
                    <path d="M12 2l3 7 7 .5-5.5 4.5 2 7L12 17l-6.5 4 2-7L2 9.5 9 9z" />
                </svg>
            );
        case 'plus':
            return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
        case 'close':
            return <svg {...common}><path d="M18 6L6 18M6 6l12 12" /></svg>;
        case 'chevron':
            return <svg {...common}><path d="M9 18l6-6-6-6" /></svg>;
    }
}

// ============ Meal type modal ============
function MealTypeModal({
    fav,
    suggestedMeal,
    onClose,
    onPick,
}: {
    fav: FavoriteFood;
    suggestedMeal: MealType;
    onClose: () => void;
    onPick: (mealType: MealType, grams: number) => void;
}) {
    const { t } = useTranslation();
    const [grams, setGrams] = useState<number>(100);

    const meals: { id: MealType; label: string; emoji: string }[] = [
        { id: 'breakfast', label: t('meal_breakfast') || 'Nonushta', emoji: '🌅' },
        { id: 'lunch', label: t('meal_lunch') || 'Tushlik', emoji: '☀️' },
        { id: 'dinner', label: t('meal_dinner') || 'Kechki ovqat', emoji: '🌙' },
        { id: 'snack', label: t('meal_snack') || 'Yengil ovqat', emoji: '🍎' },
    ];

    const portions = [50, 100, 150, 200, 250, 300];
    const ratio = grams / 100;
    const kcal = Math.round(fav.kcal_per_100g * ratio);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-[2rem] p-5 shadow-2xl"
                style={{ background: 'var(--color-card)' }}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{fav.emoji || '🍽️'}</span>
                        <div>
                            <div className="font-extrabold text-[15px] text-stone-900 dark:text-slate-100 capitalize">
                                {fav.food_name}
                            </div>
                            <div className="text-[11px] font-bold text-stone-500 dark:text-slate-400">
                                {kcal} kcal · {grams}g
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500 dark:text-slate-400"
                        style={{ background: 'var(--color-bg)' }}
                    >
                        <QIcon name="close" size={18} />
                    </button>
                </div>

                {/* Porsiya */}
                <div className="mb-4">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-slate-400 mb-2">
                        {t('portion_label') || 'Porsiya'}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {portions.map((g) => (
                            <button
                                key={g}
                                onClick={() => setGrams(g)}
                                className={`py-2 rounded-xl text-[13px] font-bold transition ${grams === g
                                    ? 'bg-[#5B6AD0] text-white'
                                    : 'text-stone-700 dark:text-slate-200'
                                    }`}
                                style={grams === g ? {} : { background: 'var(--color-bg)' }}
                            >
                                {g}g
                            </button>
                        ))}
                    </div>
                </div>

                {/* Meal type */}
                <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-slate-400 mb-2">
                        {t('meal_type_label') || 'Qaysi ovqatga?'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {meals.map((m) => {
                            const isSuggested = m.id === suggestedMeal;
                            return (
                                <motion.button
                                    key={m.id}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => onPick(m.id, grams)}
                                    className="relative flex items-center gap-2 p-3 rounded-2xl text-left font-extrabold text-[13px] text-stone-800 dark:text-slate-100"
                                    style={{
                                        background: isSuggested ? '#FFF4D6' : 'var(--color-bg)',
                                        border: isSuggested ? '2px solid #F59E0B' : '2px solid transparent',
                                    }}
                                >
                                    {isSuggested && (
                                        <span
                                            className="absolute -top-1.5 -right-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold"
                                            style={{ background: '#F59E0B', color: 'white' }}
                                        >
                                            ✨
                                        </span>
                                    )}
                                    <span className="text-xl">{m.emoji}</span>
                                    <span style={isSuggested ? { color: '#854F0B' } : undefined}>{m.label}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ============ Long-press hook ============
function useLongPress(onLongPress: () => void, ms = 500) {
    const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const start = () => {
        const tm = setTimeout(() => {
            onLongPress();
            try { (navigator as any).vibrate?.(20); } catch { }
        }, ms);
        setTimer(tm);
    };
    const clear = () => {
        if (timer) clearTimeout(timer);
        setTimer(null);
    };

    return {
        onMouseDown: start,
        onTouchStart: start,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchEnd: clear,
        onTouchCancel: clear,
    };
}

// ============ Asosiy card ============
export default function QuickAddCard({ onLogged }: Props) {
    const { t } = useTranslation();
    const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<FavoriteFood | null>(null);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [mealStats, setMealStats] = useState<Map<string, MealType>>(new Map());

    useEffect(() => {
        load();
    }, []);

    async function load() {
        const tid = getTelegramId();
        if (!tid) return;
        setLoading(true);
        // Parallel: favorites + meal stats
        const [favs, stats] = await Promise.all([
            getTopFavorites(tid, 6),
            getMealTypeStats(tid),
        ]);
        setFavorites(favs);
        setMealStats(stats);
        setLoading(false);
    }

    async function handleLog(fav: FavoriteFood, mealType: MealType, grams: number) {
        const tid = getTelegramId();
        if (!tid) return;
        setSavingId(fav.id);

        const ratio = grams / 100;
        try {
            const { error } = await supabase.from('food_logs').insert({
                user_id: tid,
                food_name: fav.food_name,
                calories: Math.round(fav.kcal_per_100g * ratio),
                protein: +(fav.protein_per_100g * ratio).toFixed(1),
                fat: +(fav.fat_per_100g * ratio).toFixed(1),
                carbs: +(fav.carbs_per_100g * ratio).toFixed(1),
                meal_type: mealType,
            });
            if (error) throw error;

            await supabase.rpc('upsert_favorite_food', {
                p_telegram_id: tid,
                p_food_name: fav.food_name,
                p_kcal: fav.kcal_per_100g,
                p_protein: fav.protein_per_100g,
                p_fat: fav.fat_per_100g,
                p_carbs: fav.carbs_per_100g,
                p_source: fav.source,
                p_source_id: fav.source_id,
                p_emoji: fav.emoji,
            });

            await addCoinsForLog();
            setSelected(null);
            setToast(`✓ ${fav.food_name} · ${Math.round(fav.kcal_per_100g * ratio)} kcal`);
            setTimeout(() => setToast(null), 2200);
            await load();
            onLogged?.();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Xato';
            alert(msg);
        } finally {
            setSavingId(null);
        }
    }

    async function handlePin(fav: FavoriteFood) {
        const tid = getTelegramId();
        if (!tid) return;
        await toggleFavoritePin(tid, fav.id);
        await load();
    }

    // Hech qachon log qilmagan foydalanuvchi uchun ko'rsatmaymiz
    if (!loading && favorites.length === 0) return null;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.22 }}
                className="mt-5"
            >
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#5B6AD0]"><QIcon name="bolt" size={16} /></span>
                        <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200">
                            {t('quick_add_title') || 'Tez qo\'shish'}
                        </h3>
                    </div>
                    <span className="text-[11px] font-bold text-stone-500 dark:text-slate-400">
                        {favorites.length} {t('quick_add_count_suffix') || 'sevimli'}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {favorites.slice(0, 4).map((fav, idx) => (
                        <FavTile
                            key={fav.id}
                            fav={fav}
                            index={idx}
                            saving={savingId === fav.id}
                            onTap={() => setSelected(fav)}
                            onLongPress={() => handlePin(fav)}
                        />
                    ))}
                </div>
            </motion.div>

            <AnimatePresence>
                {selected && (
                    <MealTypeModal
                        fav={selected}
                        suggestedMeal={suggestMealType(selected, mealStats)}
                        onClose={() => setSelected(null)}
                        onPick={(mealType, grams) => handleLog(selected, mealType, grams)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.9 }}
                        transition={SPRING}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl bg-[#5B6AD0] text-white font-extrabold text-[13px] shadow-2xl"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// ============ Tile ============
function FavTile({
    fav,
    index,
    saving,
    onTap,
    onLongPress,
}: {
    fav: FavoriteFood;
    index: number;
    saving: boolean;
    onTap: () => void;
    onLongPress: () => void;
}) {
    const longPressHandlers = useLongPress(onLongPress, 500);

    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.24 + index * 0.04 }}
            whileTap={{ scale: 0.96 }}
            disabled={saving}
            onClick={onTap}
            {...longPressHandlers}
            className="relative p-3 rounded-2xl flex items-center gap-2.5 text-left overflow-hidden disabled:opacity-50"
            style={{ background: 'var(--color-card)' }}
        >
            {fav.is_pinned && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#FAD9C8] dark:bg-[#5B6AD0]/30 flex items-center justify-center text-[#EF6C3A] dark:text-[#FAD9C8]">
                    <QIcon name="pin" size={11} />
                </div>
            )}

            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                style={{ background: 'var(--color-bg)' }}
            >
                {fav.emoji || '🍽️'}
            </div>

            <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[13px] text-stone-900 dark:text-slate-100 truncate capitalize">
                    {fav.food_name}
                </div>
                <div className="text-[10.5px] font-bold text-stone-500 dark:text-slate-400 mt-0.5">
                    {Math.round(fav.kcal_per_100g)} kcal · ×{fav.use_count}
                </div>
            </div>
        </motion.button>
    );
}