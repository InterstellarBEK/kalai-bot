// QuickAddCard.tsx
// ============================================================
// LOKMA — Quick add (favorites) card (premium refactor v2)
// - Result<T> API (food_logs insert + rpc + coins)
// - AbortController — cancellable load
// - Module-level cache + TTL + inflight deduplication
// - mountedRef safety + savingId guard
// - useLongPress with useRef (no re-render, no memory leak)
// - Toast timer cleanup on unmount
// - Skeleton loading + error retry
// - Haptic feedback
// - useCallback / useMemo stable refs
// ============================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, toLokmaError, type Result } from './supabase';
import { getTelegramId, showAlert } from './telegram';
import {
    getTopFavorites,
    toggleFavoritePin,
    getMealTypeStats,
    suggestMealType,
    type FavoriteFood,
    type MealType,
} from './lib/favorites';
import { addCoinsForLogResult } from './coins';
import { useTranslation } from './i18n';

// ============================================================
// CONSTANTS
// ============================================================
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const TOAST_DURATION_MS = 2200;
const LONG_PRESS_MS = 500;
const MAX_TILES = 4;
const CACHE_TTL_MS = 30_000; // 30s — Dashboard tez-tez remount qilinadi

// ============================================================
// MODULE-LEVEL CACHE + INFLIGHT DEDUPLICATION
// ============================================================
interface CachedData {
    favorites: FavoriteFood[];
    mealStats: Map<string, MealType>;
    cachedAt: number;
}

const cache = new Map<number, CachedData>();
const inflight = new Map<number, Promise<CachedData>>();

function invalidateCache(tid: number): void {
    cache.delete(tid);
    inflight.delete(tid);
}

async function fetchFavoritesData(tid: number, signal?: AbortSignal): Promise<CachedData> {
    // Cache hit
    const cached = cache.get(tid);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached;
    }

    // Inflight dedup
    const pending = inflight.get(tid);
    if (pending) return pending;

    const promise = (async (): Promise<CachedData> => {
        const [favs, stats] = await Promise.all([
            getTopFavorites(tid, 6),
            getMealTypeStats(tid),
        ]);
        if (signal?.aborted) throw new Error('aborted');

        const data: CachedData = {
            favorites: favs,
            mealStats: stats,
            cachedAt: Date.now(),
        };
        cache.set(tid, data);
        return data;
    })();

    inflight.set(tid, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(tid);
    }
}

// ============================================================
// UTILS
// ============================================================
function tryHaptic(style: 'light' | 'medium' | 'soft' = 'light'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style);
    } catch { /* silent */ }
}

function tryNotifyHaptic(kind: 'success' | 'error' | 'warning'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind);
    } catch { /* silent */ }
}

function tryVibrate(ms: number): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).vibrate?.(ms);
    } catch { /* silent */ }
}

// ============================================================
// INLINE: insert food log + upsert favorite (Result<T>)
// ============================================================
interface LogPayload {
    telegram_id: number;
    food_name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    meal_type: MealType;
}

async function insertFoodLog(payload: LogPayload): Promise<Result<null>> {
    try {
        const { error } = await supabase.from('food_logs').insert(payload);
        if (error) {
            return { ok: false, error: toLokmaError(error, 'database') };
        }
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err) };
    }
}

interface UpsertFavPayload {
    telegramId: number;
    fav: FavoriteFood;
}

async function upsertFavorite({ telegramId, fav }: UpsertFavPayload): Promise<Result<null>> {
    try {
        const { error } = await supabase.rpc('upsert_favorite_food', {
            p_telegram_id: telegramId,
            p_food_name: fav.food_name,
            p_kcal: fav.kcal_per_100g,
            p_protein: fav.protein_per_100g,
            p_fat: fav.fat_per_100g,
            p_carbs: fav.carbs_per_100g,
            p_source: fav.source,
            p_source_id: fav.source_id,
            p_emoji: fav.emoji,
        });
        if (error) {
            return { ok: false, error: toLokmaError(error, 'database') };
        }
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err) };
    }
}

// ============================================================
// ICONS
// ============================================================
type IconName = 'bolt' | 'pin' | 'star' | 'plus' | 'close' | 'chevron';

function QIcon({ name, size = 18 }: { name: IconName; size?: number }) {
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

// ============================================================
// LONG PRESS HOOK — useRef, no re-render, unmount-safe
// ============================================================
function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackRef = useRef(onLongPress);

    useEffect(() => {
        callbackRef.current = onLongPress;
    }, [onLongPress]);

    const clear = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        clear();
        timerRef.current = setTimeout(() => {
            callbackRef.current();
            tryVibrate(20);
            timerRef.current = null;
        }, ms);
    }, [ms, clear]);

    useEffect(() => clear, [clear]);

    return useMemo(
        () => ({
            onMouseDown: start,
            onTouchStart: start,
            onMouseUp: clear,
            onMouseLeave: clear,
            onTouchEnd: clear,
            onTouchCancel: clear,
        }),
        [start, clear]
    );
}

// ============================================================
// MEAL TYPE MODAL
// ============================================================
function MealTypeModal({
    fav,
    suggestedMeal,
    saving,
    onClose,
    onPick,
}: {
    fav: FavoriteFood;
    suggestedMeal: MealType;
    saving: boolean;
    onClose: () => void;
    onPick: (mealType: MealType, grams: number) => void;
}) {
    const { t } = useTranslation();
    const [grams, setGrams] = useState<number>(100);

    const meals = useMemo(
        () => [
            { id: 'breakfast' as MealType, label: t('meal_breakfast') || 'Nonushta', emoji: '🌅' },
            { id: 'lunch' as MealType, label: t('meal_lunch') || 'Tushlik', emoji: '☀️' },
            { id: 'dinner' as MealType, label: t('meal_dinner') || 'Kechki ovqat', emoji: '🌙' },
            { id: 'snack' as MealType, label: t('meal_snack') || 'Yengil ovqat', emoji: '🍎' },
        ],
        [t]
    );

    const portions = useMemo(() => [50, 100, 150, 200, 250, 300], []);
    const ratio = grams / 100;
    const kcal = Math.round(fav.kcal_per_100g * ratio);

    const handleGramClick = useCallback((g: number) => {
        tryHaptic('soft');
        setGrams(g);
    }, []);

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
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm rounded-[2rem] p-5 shadow-2xl"
                style={{ background: 'var(--color-card)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl flex-shrink-0">{fav.emoji || '🍽️'}</span>
                        <div className="min-w-0">
                            <div className="font-extrabold text-[15px] text-stone-900 dark:text-slate-100 capitalize truncate">
                                {fav.food_name}
                            </div>
                            <div className="text-[11px] font-bold text-stone-500 dark:text-slate-400 tabular-nums">
                                {kcal} kcal · {grams}g
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500 dark:text-slate-400 disabled:opacity-50 flex-shrink-0 ml-2"
                        style={{ background: 'var(--color-bg)' }}
                        aria-label={t('btn_cancel') || 'Yopish'}
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
                        {portions.map(g => (
                            <button
                                key={g}
                                onClick={() => handleGramClick(g)}
                                disabled={saving}
                                className={`py-2 rounded-xl text-[13px] font-bold transition disabled:opacity-50 tabular-nums ${grams === g
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
                        {meals.map(m => {
                            const isSuggested = m.id === suggestedMeal;
                            return (
                                <motion.button
                                    key={m.id}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => onPick(m.id, grams)}
                                    disabled={saving}
                                    className="relative flex items-center gap-2 p-3 rounded-2xl text-left font-extrabold text-[13px] text-stone-800 dark:text-slate-100 disabled:opacity-50"
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
                                    <span style={isSuggested ? { color: '#854F0B' } : undefined}>
                                        {saving ? '…' : m.label}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
type LoadState = 'loading' | 'ready' | 'error' | 'empty';

interface Props {
    onLogged?: () => void;
}

export default function QuickAddCard({ onLogged }: Props) {
    const { t } = useTranslation();

    const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
    const [mealStats, setMealStats] = useState<Map<string, MealType>>(new Map());
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [selected, setSelected] = useState<FavoriteFood | null>(null);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const mountedRef = useRef(true);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Mount / unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
        };
    }, []);

    // ------------------------------------------------------------
    // Data loading — AbortController + cache + inflight dedup
    // ------------------------------------------------------------
    const load = useCallback(async (force = false): Promise<void> => {
        const tid = getTelegramId();
        if (!tid) {
            setLoadState('empty');
            return;
        }

        if (force) invalidateCache(tid);

        // Previous inflight'ni bekor qilamiz
        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const data = await fetchFavoritesData(tid, ctrl.signal);
            if (!mountedRef.current || ctrl.signal.aborted) return;

            setFavorites(data.favorites);
            setMealStats(data.mealStats);
            setLoadState(data.favorites.length === 0 ? 'empty' : 'ready');
        } catch (err) {
            if (!mountedRef.current || ctrl.signal.aborted) return;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === 'aborted') return;
            console.warn('[QuickAdd] load failed:', err);
            setLoadState('error');
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    }, []);

    useEffect(() => {
        setLoadState('loading');
        void load();
    }, [load]);

    // ------------------------------------------------------------
    // Toast helper
    // ------------------------------------------------------------
    const showToast = useCallback((msg: string): void => {
        setToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setToast(null);
            toastTimerRef.current = null;
        }, TOAST_DURATION_MS);
    }, []);

    // ------------------------------------------------------------
    // Log handler
    // ------------------------------------------------------------
    const handleLog = useCallback(
        async (fav: FavoriteFood, mealType: MealType, grams: number): Promise<void> => {
            const tid = getTelegramId();
            if (!tid) {
                await showAlert(t('save_error') || 'Xato');
                return;
            }

            tryHaptic('medium');
            setSavingId(fav.id);

            const ratio = grams / 100;
            const kcal = Math.round(fav.kcal_per_100g * ratio);

            // 1. Food log insert (kritik)
            const logRes = await insertFoodLog({
                telegram_id: tid,
                food_name: fav.food_name,
                calories: kcal,
                protein: +(fav.protein_per_100g * ratio).toFixed(1),
                fat: +(fav.fat_per_100g * ratio).toFixed(1),
                carbs: +(fav.carbs_per_100g * ratio).toFixed(1),
                meal_type: mealType,
            });
            if (!mountedRef.current) return;

            if (!logRes.ok) {
                tryNotifyHaptic('error');
                await showAlert(logRes.error.message || t('save_error') || 'Xato');
                setSavingId(null);
                return;
            }

            // 2. Favorite upsert (non-critical)
            const favRes = await upsertFavorite({ telegramId: tid, fav });
            if (!favRes.ok) {
                console.warn('[QuickAdd] upsert_favorite failed:', favRes.error.message);
            }

            // 3. Coin qo'shish (non-critical)
            const coinRes = await addCoinsForLogResult();
            if (!coinRes.ok) {
                console.warn('[QuickAdd] addCoins failed:', coinRes.error.message);
            }

            if (!mountedRef.current) return;

            tryNotifyHaptic('success');
            setSelected(null);
            showToast(`✓ ${fav.food_name} · ${kcal} kcal`);
            setSavingId(null);
            // Cache'ni invalidate — favorite use_count o'zgardi
            invalidateCache(tid);
            void load(true);
            onLogged?.();
        },
        [t, load, onLogged, showToast]
    );

    // ------------------------------------------------------------
    // Pin handler
    // ------------------------------------------------------------
    const handlePin = useCallback(
        async (fav: FavoriteFood): Promise<void> => {
            const tid = getTelegramId();
            if (!tid) return;

            tryHaptic('light');

            // Optimistic — darhol UI'da pinlangan
            setFavorites(prev =>
                prev.map(f => (f.id === fav.id ? { ...f, is_pinned: !f.is_pinned } : f))
            );

            try {
                await toggleFavoritePin(tid, fav.id);
                invalidateCache(tid);
            } catch (err) {
                console.warn('[QuickAdd] toggleFavoritePin failed:', err);
                // Rollback
                if (mountedRef.current) {
                    setFavorites(prev =>
                        prev.map(f => (f.id === fav.id ? { ...f, is_pinned: fav.is_pinned } : f))
                    );
                }
            }
            if (!mountedRef.current) return;
            void load(true);
        },
        [load]
    );

    const handleTileTap = useCallback((fav: FavoriteFood): void => {
        tryHaptic('light');
        setSelected(fav);
    }, []);

    const handleModalClose = useCallback((): void => {
        if (savingId !== null) return;
        setSelected(null);
    }, [savingId]);

    const handleRetry = useCallback((): void => {
        setLoadState('loading');
        void load(true);
    }, [load]);

    // ------------------------------------------------------------
    // Empty / error — hech narsa render qilmaymiz (Dashboard toza qoladi)
    // ------------------------------------------------------------
    if (loadState === 'empty') return null;

    // ------------------------------------------------------------
    // Render
    // ------------------------------------------------------------
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
                    {loadState === 'ready' && (
                        <span className="text-[11px] font-bold text-stone-500 dark:text-slate-400 tabular-nums">
                            {favorites.length} {t('quick_add_count_suffix') || 'sevimli'}
                        </span>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    {loadState === 'loading' && (
                        <motion.div
                            key="skeleton"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-2 gap-2"
                        >
                            {Array.from({ length: MAX_TILES }).map((_, i) => (
                                <div
                                    key={i}
                                    className="p-3 rounded-2xl h-[62px] animate-pulse"
                                    style={{ background: 'var(--color-card)' }}
                                />
                            ))}
                        </motion.div>
                    )}

                    {loadState === 'error' && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="p-4 rounded-2xl text-center"
                            style={{ background: 'var(--color-card)' }}
                        >
                            <p className="text-[13px] text-stone-500 dark:text-slate-400 font-semibold mb-2">
                                {t('quick_add_error') || 'Sevimlilar yuklanmadi'}
                            </p>
                            <button
                                onClick={handleRetry}
                                className="text-[12px] font-extrabold text-[#5B6AD0]"
                            >
                                {t('btn_retry') || 'Qayta urinish'}
                            </button>
                        </motion.div>
                    )}

                    {loadState === 'ready' && (
                        <motion.div
                            key="ready"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-2 gap-2"
                        >
                            {favorites.slice(0, MAX_TILES).map((fav, idx) => (
                                <FavTile
                                    key={fav.id}
                                    fav={fav}
                                    index={idx}
                                    saving={savingId === fav.id}
                                    disabled={savingId !== null && savingId !== fav.id}
                                    onTap={() => handleTileTap(fav)}
                                    onLongPress={() => void handlePin(fav)}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Modal */}
            <AnimatePresence>
                {selected && (
                    <MealTypeModal
                        fav={selected}
                        suggestedMeal={suggestMealType(selected, mealStats)}
                        saving={savingId !== null}
                        onClose={handleModalClose}
                        onPick={(mealType, grams) => void handleLog(selected, mealType, grams)}
                    />
                )}
            </AnimatePresence>

            {/* Toast */}
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

// ============================================================
// TILE
// ============================================================
function FavTile({
    fav,
    index,
    saving,
    disabled,
    onTap,
    onLongPress,
}: {
    fav: FavoriteFood;
    index: number;
    saving: boolean;
    disabled: boolean;
    onTap: () => void;
    onLongPress: () => void;
}) {
    const longPressHandlers = useLongPress(onLongPress, LONG_PRESS_MS);

    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.24 + index * 0.04 }}
            whileTap={{ scale: 0.96 }}
            disabled={saving || disabled}
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
                <div className="text-[10.5px] font-bold text-stone-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {saving ? '…' : `${Math.round(fav.kcal_per_100g)} kcal · ×${fav.use_count}`}
                </div>
            </div>
        </motion.button>
    );
}