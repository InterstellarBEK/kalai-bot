// WaterTracker.tsx
// ============================================================
// LOKMA — Water tracker card (premium refactor)
// - Result<T> API integration
// - Optimistic update + rollback on error
// - Race-safe: mountedRef + busy guard
// - Loading skeleton + error state
// - Haptic feedback
// - useCallback stable refs
// ============================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getTodayWaterSummary,
    addWater,
    getWaterGoal,
    removeLastWater,
    type TodayWaterSummary,
} from './water';
import { showAlert } from './telegram';
import { useTranslation } from './i18n';

// ============================================================
// CONSTANTS
// ============================================================
const GLASS_SIZE_ML = 250;
const HALF_LITER_ML = 500;
const MAX_GLASSES_DISPLAY = 24; // UI hard limit — juda ko'p stakan ko'rsatmaymiz
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const ACCENT_BLUE = '#3B9DF5';
const ACCENT_PRIMARY = '#5B6AD0';

// ============================================================
// UTILS
// ============================================================
function tryHaptic(style: 'light' | 'medium' | 'soft' = 'light'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
        tg?.impactOccurred?.(style);
    } catch {
        /* Telegram WebApp mavjud emas — silent */
    }
}

function tryNotifyHaptic(kind: 'success' | 'error' | 'warning'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
        tg?.notificationOccurred?.(kind);
    } catch {
        /* silent */
    }
}

// ============================================================
// ICONS (Iconly-style)
// ============================================================
function WIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'droplet' | 'undo';
    size?: number;
    color?: string;
    fill?: string;
    strokeWidth?: number;
}) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    switch (name) {
        case 'droplet':
            return (
                <svg {...common}>
                    <path
                        d="M12 3.2c2.6 3.1 6.8 7.5 6.8 11.5a6.8 6.8 0 11-13.6 0c0-4 4.2-8.4 6.8-11.5z"
                        fill={fill}
                    />
                    <path d="M9 13.5c-.4 1 .1 2.5 1.5 3" opacity="0.8" />
                </svg>
            );
        case 'undo':
            return (
                <svg {...common}>
                    <path d="M4 10h11a4.5 4.5 0 010 9H10" />
                    <path d="M8 6L4 10l4 4" />
                </svg>
            );
    }
}

// ============================================================
// COMPONENT
// ============================================================
type LoadState = 'loading' | 'ready' | 'error';

export function WaterTracker() {
    const { t } = useTranslation();

    const [summary, setSummary] = useState<TodayWaterSummary>({ total_ml: 0, logs_count: 0 });
    const [goalMl, setGoalMl] = useState<number>(2000);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [busy, setBusy] = useState<boolean>(false);

    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ------------------------------------------------------------
    // Data loading
    // ------------------------------------------------------------
    const load = useCallback(async (opts?: { forceRefresh?: boolean }): Promise<void> => {
        const [summaryRes, goalRes] = await Promise.all([
            getTodayWaterSummary({ forceRefresh: opts?.forceRefresh }),
            getWaterGoal({ forceRefresh: opts?.forceRefresh }),
        ]);
        if (!mountedRef.current) return;

        if (!summaryRes.ok || !goalRes.ok) {
            setLoadState('error');
            return;
        }
        setSummary(summaryRes.data);
        setGoalMl(goalRes.data);
        setLoadState('ready');
    }, []);

    useEffect(() => {
        setLoadState('loading');
        void load();
    }, [load]);

    // ------------------------------------------------------------
    // Handlers — optimistic + rollback
    // ------------------------------------------------------------
    const handleAdd = useCallback(
        async (ml: number): Promise<void> => {
            if (busy || loadState !== 'ready') return;

            tryHaptic('light');
            setBusy(true);

            // Optimistic bump
            setSummary(prev => ({
                total_ml: prev.total_ml + ml,
                logs_count: prev.logs_count + 1,
            }));

            const res = await addWater(ml);
            if (!mountedRef.current) return;

            if (!res.ok) {
                // Rollback
                setSummary(prev => ({
                    total_ml: Math.max(0, prev.total_ml - ml),
                    logs_count: Math.max(0, prev.logs_count - 1),
                }));
                tryNotifyHaptic('error');
                showAlert(res.error.message || t('water_error_add'));
                setBusy(false);
                return;
            }

            tryNotifyHaptic('success');
            setBusy(false);
            // Server bilan sync — cache water.ts'da invalidate qilingan
            void load({ forceRefresh: true });
        },
        [busy, loadState, load, t]
    );

    const handleUndo = useCallback(async (): Promise<void> => {
        if (busy || summary.logs_count === 0 || loadState !== 'ready') return;

        tryHaptic('soft');
        setBusy(true);

        const res = await removeLastWater();
        if (!mountedRef.current) return;

        if (!res.ok) {
            tryNotifyHaptic('error');
            showAlert(res.error.message || t('water_error_undo'));
            setBusy(false);
            return;
        }

        if (res.data === null) {
            // Log topilmadi — jim rebuild
            setBusy(false);
            void load({ forceRefresh: true });
            return;
        }

        setBusy(false);
        void load({ forceRefresh: true });
    }, [busy, summary.logs_count, loadState, load, t]);

    const handleRetry = useCallback((): void => {
        setLoadState('loading');
        void load({ forceRefresh: true });
    }, [load]);

    // ------------------------------------------------------------
    // Derived
    // ------------------------------------------------------------
    const percent = useMemo(() => {
        if (goalMl <= 0) return 0;
        return Math.min(100, Math.round((summary.total_ml / goalMl) * 100));
    }, [summary.total_ml, goalMl]);

    const { totalGlasses, filledGlasses, overflow } = useMemo(() => {
        const total = Math.max(1, Math.ceil(goalMl / GLASS_SIZE_ML));
        const filled = Math.floor(summary.total_ml / GLASS_SIZE_ML);
        const capped = Math.min(total, MAX_GLASSES_DISPLAY);
        return {
            totalGlasses: capped,
            filledGlasses: Math.min(filled, capped),
            overflow: total > MAX_GLASSES_DISPLAY,
        };
    }, [goalMl, summary.total_ml]);

    // ------------------------------------------------------------
    // Render
    // ------------------------------------------------------------
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)]"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'rgba(59, 157, 245, 0.12)' }}
                    >
                        <WIcon
                            name="droplet"
                            size={20}
                            color={ACCENT_BLUE}
                            fill="rgba(59, 157, 245, 0.25)"
                            strokeWidth={2}
                        />
                    </div>
                    <h3 className="font-semibold text-[15px] text-gray-900 dark:text-slate-100">
                        {t('water_title')}
                    </h3>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                    {loadState === 'ready' && (
                        <motion.span
                            key="stats"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-[13px] text-gray-500 dark:text-slate-400 font-medium tabular-nums"
                        >
                            {summary.total_ml} / {goalMl} ml
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait" initial={false}>
                {loadState === 'loading' && (
                    <motion.div
                        key="skeleton"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="grid grid-cols-8 gap-1.5 mb-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="aspect-[3/4] rounded-lg bg-[#DDE3F5] dark:bg-[#252D38] animate-pulse"
                                />
                            ))}
                        </div>
                        <div className="h-2 bg-[#DDE3F5] dark:bg-[#252D38] rounded-full mb-4 animate-pulse" />
                        <div className="flex gap-2">
                            <div className="flex-1 h-10 rounded-2xl bg-[#DDE3F5] dark:bg-[#252D38] animate-pulse" />
                            <div className="flex-1 h-10 rounded-2xl bg-[#DDE3F5] dark:bg-[#252D38] animate-pulse" />
                            <div className="w-12 h-10 rounded-2xl bg-[#DDE3F5] dark:bg-[#252D38] animate-pulse" />
                        </div>
                    </motion.div>
                )}

                {loadState === 'error' && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-6"
                    >
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3 text-center">
                            {t('water_error_load')}
                        </p>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleRetry}
                            className="px-5 py-2 rounded-2xl bg-[#5B6AD0] text-white font-medium text-[13px]"
                        >
                            {t('btn_retry')}
                        </motion.button>
                    </motion.div>
                )}

                {loadState === 'ready' && (
                    <motion.div
                        key="ready"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {/* Glasses grid */}
                        <div className="grid grid-cols-8 gap-1.5 mb-4">
                            {Array.from({ length: totalGlasses }).map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={false}
                                    animate={{
                                        backgroundColor: i < filledGlasses ? ACCENT_PRIMARY : '#DDE3F5',
                                        scale: i < filledGlasses ? 1 : 0.95,
                                    }}
                                    transition={SPRING}
                                    className="aspect-[3/4] rounded-lg"
                                />
                            ))}
                        </div>
                        {overflow && (
                            <p className="text-[11px] text-gray-400 dark:text-slate-500 -mt-2 mb-3 text-center">
                                {t('water_glasses_capped')}
                            </p>
                        )}

                        {/* Progress bar */}
                        <div className="mb-4">
                            <div className="h-2 bg-[#DDE3F5] dark:bg-[#252D38] rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-[#5B6AD0] rounded-full"
                                    initial={false}
                                    animate={{ width: `${percent}%` }}
                                    transition={SPRING}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => void handleAdd(GLASS_SIZE_ML)}
                                disabled={busy}
                                className="flex-1 py-2.5 rounded-2xl bg-[#5B6AD0] text-white font-medium text-[14px] disabled:opacity-60 transition-opacity"
                            >
                                {t('water_add_glass')}
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => void handleAdd(HALF_LITER_ML)}
                                disabled={busy}
                                className="flex-1 py-2.5 rounded-2xl bg-[#DDE3F5] dark:bg-[#252D38] text-[#5B6AD0] font-medium text-[14px] disabled:opacity-60 transition-opacity"
                            >
                                +{HALF_LITER_ML}ml
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => void handleUndo()}
                                disabled={busy || summary.logs_count === 0}
                                className="px-3 py-2.5 rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 font-medium disabled:opacity-40 flex items-center justify-center transition-opacity"
                                aria-label={t('btn_undo')}
                            >
                                <WIcon name="undo" size={16} strokeWidth={2.2} />
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}