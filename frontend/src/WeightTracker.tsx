// WeightTracker.tsx
// ============================================================
// LOKMA — Weight tracker card (premium refactor)
// - Result<T> API integration
// - mountedRef safety + busy guard
// - Loading skeleton + error retry
// - Haptic feedback + real-time input validation
// - useCallback / useMemo — stable refs, chart pre-compute
// - BMI kategoriya → i18n label + color map (UI tarafida)
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    addWeight,
    getWeightHistory,
    removeLastWeight,
    getTargetWeight,
    setTargetWeight,
    calcWeightTrend,
    calcTargetProgress,
    seedFromProfile,
    getCurrentBMI,
    type WeightEntry,
    type WeightTrend,
    type BMIInfo,
    type BMICategory,
} from './weight';
import { useTranslation } from './i18n';
import { showAlert } from './telegram';

// ============================================================
// CONSTANTS
// ============================================================
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const WEIGHT_MIN = 30;
const WEIGHT_MAX = 300;
const HISTORY_DAYS = 30;
const CHART_W = 300;
const CHART_H = 120;
const CHART_PAD = 12;

// ============================================================
// UTILS
// ============================================================
function tryHaptic(style: 'light' | 'medium' | 'soft' = 'light'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style);
    } catch {
        /* silent */
    }
}

function tryNotifyHaptic(kind: 'success' | 'error' | 'warning'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind);
    } catch {
        /* silent */
    }
}

function parseWeightInput(raw: string): number | null {
    const cleaned = raw.replace(',', '.').trim();
    const val = parseFloat(cleaned);
    if (!Number.isFinite(val)) return null;
    return Math.round(val * 10) / 10;
}

// ============================================================
// ICONS
// ============================================================
type IconName =
    | 'target'
    | 'close'
    | 'undo'
    | 'plus'
    | 'arrowDown'
    | 'arrowUp'
    | 'arrowRight';

function WIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: IconName;
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
        case 'target':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="9" fill={fill} />
                    <circle cx="12" cy="12" r="5.5" />
                    <circle cx="12" cy="12" r="2" fill={color} stroke="none" />
                </svg>
            );
        case 'close':
            return (
                <svg {...common}>
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            );
        case 'undo':
            return (
                <svg {...common}>
                    <path d="M4 10h11a4.5 4.5 0 010 9H10" />
                    <path d="M8 6L4 10l4 4" />
                </svg>
            );
        case 'plus':
            return (
                <svg {...common}>
                    <path d="M12 5v14M5 12h14" />
                </svg>
            );
        case 'arrowDown':
            return (
                <svg {...common}>
                    <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
            );
        case 'arrowUp':
            return (
                <svg {...common}>
                    <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
            );
        case 'arrowRight':
            return (
                <svg {...common}>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
            );
    }
}

// ============================================================
// COMPONENT
// ============================================================
type LoadState = 'loading' | 'ready' | 'error';
type Mode = 'idle' | 'add' | 'target';

export function WeightTracker() {
    const { t } = useTranslation();

    const [history, setHistory] = useState<WeightEntry[]>([]);
    const [target, setTargetState] = useState<number | null>(null);
    const [trend, setTrend] = useState<WeightTrend | null>(null);
    const [bmi, setBmi] = useState<BMIInfo | null>(null);
    const [input, setInput] = useState<string>('');
    const [targetInput, setTargetInput] = useState<string>('');
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [busy, setBusy] = useState<boolean>(false);
    const [mode, setMode] = useState<Mode>('idle');

    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ------------------------------------------------------------
    // BMI kategoriya → i18n label + Tailwind color
    // ------------------------------------------------------------
    const BMI_STYLES: Record<BMICategory, { bg: string; text: string; label: string }> = useMemo(
        () => ({
            low: {
                bg: 'bg-blue-50 dark:bg-blue-900/20',
                text: 'text-blue-700 dark:text-blue-300',
                label: t('bmi_low'),
            },
            normal: {
                bg: 'bg-green-50 dark:bg-green-900/20',
                text: 'text-green-700 dark:text-green-300',
                label: t('bmi_normal'),
            },
            over: {
                bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                text: 'text-yellow-700 dark:text-yellow-300',
                label: t('bmi_over'),
            },
            obese: {
                bg: 'bg-red-50 dark:bg-red-900/20',
                text: 'text-red-700 dark:text-red-300',
                label: t('bmi_obese'),
            },
        }),
        [t]
    );

    const HEALTH_STYLES = useMemo(
        () => ({
            good: {
                bg: 'bg-green-50 dark:bg-green-900/20',
                text: 'text-green-700 dark:text-green-300',
                label: t('weight_health_good'),
            },
            warning: {
                bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                text: 'text-yellow-700 dark:text-yellow-300',
                label: t('weight_health_warning'),
            },
            danger: {
                bg: 'bg-red-50 dark:bg-red-900/20',
                text: 'text-red-700 dark:text-red-300',
                label: t('weight_health_danger'),
            },
        }),
        [t]
    );

    // ------------------------------------------------------------
    // Data loading (Result<T> pattern)
    // ------------------------------------------------------------
    const refresh = useCallback(
        async (opts?: { forceRefresh?: boolean }): Promise<boolean> => {
            const [historyRes, targetRes] = await Promise.all([
                getWeightHistory(HISTORY_DAYS, { forceRefresh: opts?.forceRefresh }),
                getTargetWeight({ forceRefresh: opts?.forceRefresh }),
            ]);
            if (!mountedRef.current) return false;

            if (!historyRes.ok || !targetRes.ok) {
                setLoadState('error');
                return false;
            }

            const newHistory = historyRes.data;
            const newTarget = targetRes.data;

            setHistory(newHistory);
            setTargetState(newTarget);
            setTrend(calcWeightTrend(newHistory, newTarget));

            // BMI — faqat oxirgi vazn bo'lsa
            const latest =
                newHistory.length > 0 ? newHistory[newHistory.length - 1].weight_kg : null;

            if (latest !== null) {
                const bmiRes = await getCurrentBMI(latest);
                if (!mountedRef.current) return true;
                setBmi(bmiRes.ok ? bmiRes.data : null);
            } else {
                setBmi(null);
            }

            setLoadState('ready');
            return true;
        },
        []
    );

    // Initial load — seed profile bilan
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadState('loading');
            const seedRes = await seedFromProfile();
            if (cancelled || !mountedRef.current) return;
            if (!seedRes.ok) {
                console.warn('[weight] seedFromProfile failed:', seedRes.error.message);
            }
            await refresh({ forceRefresh: true });
        })();
        return () => {
            cancelled = true;
        };
    }, [refresh]);

    // ------------------------------------------------------------
    // Input validation (real-time)
    // ------------------------------------------------------------
    const parsedInput = useMemo(() => parseWeightInput(input), [input]);
    const parsedTargetInput = useMemo(() => parseWeightInput(targetInput), [targetInput]);

    const isInputValid = useMemo(
        () =>
            parsedInput !== null && parsedInput >= WEIGHT_MIN && parsedInput <= WEIGHT_MAX,
        [parsedInput]
    );
    const isTargetValid = useMemo(
        () =>
            parsedTargetInput !== null &&
            parsedTargetInput >= WEIGHT_MIN &&
            parsedTargetInput <= WEIGHT_MAX,
        [parsedTargetInput]
    );

    // ------------------------------------------------------------
    // Handlers
    // ------------------------------------------------------------
    const handleSave = useCallback(async (): Promise<void> => {
        if (busy) return;
        if (!isInputValid || parsedInput === null) {
            await showAlert(t('weight_invalid'));
            tryNotifyHaptic('error');
            return;
        }

        setBusy(true);
        tryHaptic('light');

        const res = await addWeight(parsedInput);
        if (!mountedRef.current) return;

        if (!res.ok) {
            tryNotifyHaptic('error');
            await showAlert(res.error.message || t('save_error'));
            setBusy(false);
            return;
        }

        tryNotifyHaptic('success');
        setInput('');
        setMode('idle');
        await refresh({ forceRefresh: true });
        if (!mountedRef.current) return;
        setBusy(false);
    }, [busy, isInputValid, parsedInput, refresh, t]);

    const handleSaveTarget = useCallback(async (): Promise<void> => {
        if (busy) return;
        if (!isTargetValid || parsedTargetInput === null) {
            await showAlert(t('weight_target_invalid'));
            tryNotifyHaptic('error');
            return;
        }

        setBusy(true);
        tryHaptic('light');

        const res = await setTargetWeight(parsedTargetInput);
        if (!mountedRef.current) return;

        if (!res.ok) {
            tryNotifyHaptic('error');
            await showAlert(res.error.message || t('save_error'));
            setBusy(false);
            return;
        }

        tryNotifyHaptic('success');
        setTargetInput('');
        setMode('idle');
        await refresh({ forceRefresh: true });
        if (!mountedRef.current) return;
        setBusy(false);
    }, [busy, isTargetValid, parsedTargetInput, refresh, t]);

    const handleUndo = useCallback(async (): Promise<void> => {
        if (busy || history.length === 0) return;
        setBusy(true);
        tryHaptic('soft');

        const res = await removeLastWeight();
        if (!mountedRef.current) return;

        if (!res.ok) {
            tryNotifyHaptic('error');
            await showAlert(res.error.message || t('save_error'));
            setBusy(false);
            return;
        }

        await refresh({ forceRefresh: true });
        if (!mountedRef.current) return;
        setBusy(false);
    }, [busy, history.length, refresh, t]);

    const handleRetry = useCallback((): void => {
        setLoadState('loading');
        void refresh({ forceRefresh: true });
    }, [refresh]);

    const enterAddMode = useCallback((): void => {
        tryHaptic('light');
        setMode('add');
    }, []);

    const enterTargetMode = useCallback((): void => {
        tryHaptic('light');
        setTargetInput(target !== null ? target.toString() : '');
        setMode('target');
    }, [target]);

    const cancelMode = useCallback((): void => {
        setMode('idle');
        setInput('');
        setTargetInput('');
    }, []);

    // ------------------------------------------------------------
    // Derived: chart + stats
    // ------------------------------------------------------------
    const { current, delta, progress } = useMemo(() => {
        const currentVal = history.length > 0 ? history[history.length - 1].weight_kg : null;
        const firstVal = history.length > 0 ? history[0].weight_kg : null;
        const deltaVal = currentVal !== null && firstVal !== null ? currentVal - firstVal : 0;
        const progressVal = calcTargetProgress(history, target);
        return { current: currentVal, first: firstVal, delta: deltaVal, progress: progressVal };
    }, [history, target]);

    const { points, pathD, areaD } = useMemo(() => {
        if (history.length === 0) return { points: [], pathD: '', areaD: '' };

        const weights = history.map(h => h.weight_kg);
        const minW = Math.min(...weights) - 1;
        const maxW = Math.max(...weights) + 1;
        const range = maxW - minW || 1;

        const pts = history.map((h, i) => ({
            x: CHART_PAD + (i / Math.max(history.length - 1, 1)) * (CHART_W - CHART_PAD * 2),
            y: CHART_H - CHART_PAD - ((h.weight_kg - minW) / range) * (CHART_H - CHART_PAD * 2),
        }));

        const path =
            pts.length > 1
                ? pts.reduce((acc, p, i) => {
                    if (i === 0) return `M ${p.x} ${p.y}`;
                    const prev = pts[i - 1];
                    const cx = (prev.x + p.x) / 2;
                    return `${acc} Q ${cx} ${prev.y}, ${cx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
                }, '')
                : '';

        const area =
            pts.length > 1
                ? `${path} L ${pts[pts.length - 1].x} ${CHART_H - CHART_PAD} L ${pts[0].x} ${CHART_H - CHART_PAD} Z`
                : '';

        return { points: pts, pathD: path, areaD: area };
    }, [history]);

    const health = trend ? HEALTH_STYLES[trend.healthStatus] : null;
    const bmiStyle = bmi ? BMI_STYLES[bmi.category] : null;

    // ------------------------------------------------------------
    // Render — LOADING
    // ------------------------------------------------------------
    if (loadState === 'loading') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
                style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}
            >
                <div className="mb-4">
                    <div className="h-3 w-16 bg-[#F5F6FB] dark:bg-[#252D38] rounded animate-pulse mb-2" />
                    <div className="h-9 w-24 bg-[#F5F6FB] dark:bg-[#252D38] rounded animate-pulse" />
                </div>
                <div className="h-28 bg-[#F5F6FB] dark:bg-[#252D38] rounded-2xl animate-pulse mb-4" />
                <div className="flex gap-2">
                    <div className="flex-1 h-11 bg-[#F5F6FB] dark:bg-[#252D38] rounded-2xl animate-pulse" />
                    <div className="w-11 h-11 bg-[#F5F6FB] dark:bg-[#252D38] rounded-2xl animate-pulse" />
                </div>
            </motion.div>
        );
    }

    // ------------------------------------------------------------
    // Render — ERROR
    // ------------------------------------------------------------
    if (loadState === 'error') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
                style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}
            >
                <div className="flex flex-col items-center py-6">
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-3 text-center">
                        {t('weight_error_load')}
                    </p>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRetry}
                        className="px-5 py-2 rounded-2xl bg-[#5B6AD0] text-white font-medium text-[13px]"
                    >
                        {t('btn_retry')}
                    </motion.button>
                </div>
            </motion.div>
        );
    }

    // ------------------------------------------------------------
    // Render — READY
    // ------------------------------------------------------------
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
            style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                        {t('weight_title')}
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-3xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                            {current !== null ? current.toFixed(1) : '—'}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-slate-400">kg</span>
                        {target !== null && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 ml-1 tabular-nums">
                                / {target.toFixed(1)} kg
                            </span>
                        )}
                    </div>
                </div>
                {history.length > 1 && (
                    <div
                        className={`px-3 py-1.5 rounded-full text-xs font-bold tabular-nums ${delta < 0
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            : delta > 0
                                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                            }`}
                    >
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)} kg
                    </div>
                )}
            </div>

            {/* BMI chip */}
            {bmi && bmiStyle && (
                <div className="mb-4 flex items-center gap-2">
                    <div
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${bmiStyle.bg} ${bmiStyle.text}`}
                    >
                        BMI {bmi.value.toFixed(1)} · {bmiStyle.label}
                    </div>
                </div>
            )}

            {/* Target progress */}
            {target !== null && history.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400 mb-1.5">
                        <span>{t('weight_target_label')}</span>
                        <span className="font-semibold text-gray-700 dark:text-slate-300 tabular-nums">
                            {Math.round(progress * 100)}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-[#F5F6FB] dark:bg-[#252D38]">
                        <motion.div
                            className="h-full rounded-full"
                            style={{ background: '#5B6AD0' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                        />
                    </div>
                </div>
            )}

            {/* Chart */}
            {history.length > 0 ? (
                <div className="mb-4 rounded-2xl p-3 bg-[#F5F6FB] dark:bg-[#252D38]">
                    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
                        <defs>
                            <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#5B6AD0" stopOpacity="0.28" />
                                <stop offset="100%" stopColor="#5B6AD0" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {points.length > 1 && (
                            <>
                                <motion.path
                                    d={areaD}
                                    fill="url(#weightGrad)"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.6, delay: 0.3 }}
                                />
                                <motion.path
                                    d={pathD}
                                    fill="none"
                                    stroke="#5B6AD0"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
                                />
                            </>
                        )}
                        {points.map((p, i) => (
                            <motion.circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r="3.5"
                                fill="#fff"
                                stroke="#5B6AD0"
                                strokeWidth="2"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.5 + i * 0.04, ...SPRING }}
                            />
                        ))}
                    </svg>
                </div>
            ) : (
                <div className="mb-4 rounded-2xl p-6 text-center text-sm text-gray-400 dark:text-slate-500 bg-[#F5F6FB] dark:bg-[#252D38]">
                    {t('weight_empty')}
                </div>
            )}

            {/* Trend badges */}
            {trend && health && (
                <div className="mb-4 flex flex-wrap gap-2">
                    <div
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${health.bg} ${health.text} flex items-center gap-1.5`}
                    >
                        <WIcon
                            name={
                                trend.direction === 'down'
                                    ? 'arrowDown'
                                    : trend.direction === 'up'
                                        ? 'arrowUp'
                                        : 'arrowRight'
                            }
                            size={12}
                            strokeWidth={2.5}
                        />
                        <span className="tabular-nums">
                            {Math.abs(trend.weeklyRateKg).toFixed(2)} {t('weight_per_week')}
                        </span>
                    </div>
                    <div
                        className={`px-3 py-1.5 rounded-full text-xs font-medium ${health.bg} ${health.text}`}
                    >
                        {health.label}
                    </div>
                    {trend.weeksToTarget !== null && (
                        <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">
                            ~{Math.ceil(trend.weeksToTarget)} {t('weight_weeks_left')}
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <AnimatePresence mode="wait">
                {mode === 'idle' && (
                    <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex gap-2"
                    >
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={enterAddMode}
                            disabled={busy}
                            className="flex-1 py-3 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
                            style={{ background: '#5B6AD0' }}
                        >
                            <WIcon name="plus" size={16} strokeWidth={2.4} />
                            <span>{t('weight_add')}</span>
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={enterTargetMode}
                            disabled={busy}
                            className="px-4 py-3 rounded-2xl text-gray-600 dark:text-slate-300 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center disabled:opacity-60"
                            aria-label={t('weight_target_label')}
                        >
                            <WIcon
                                name="target"
                                size={18}
                                color="#5B6AD0"
                                fill="rgba(91, 106, 208, 0.15)"
                                strokeWidth={2}
                            />
                        </motion.button>
                        {history.length > 0 && (
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => void handleUndo()}
                                disabled={busy}
                                className="px-4 py-3 rounded-2xl text-gray-600 dark:text-slate-300 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center disabled:opacity-40"
                                aria-label={t('btn_undo')}
                            >
                                <WIcon name="undo" size={16} strokeWidth={2.2} />
                            </motion.button>
                        )}
                    </motion.div>
                )}

                {mode === 'add' && (
                    <motion.div
                        key="add"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={SPRING}
                        className="flex gap-2"
                    >
                        <input
                            type="number"
                            step="0.1"
                            inputMode="decimal"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="70.5"
                            autoFocus
                            className="flex-1 px-4 py-3 rounded-2xl text-sm font-medium outline-none bg-[#F5F6FB] dark:bg-[#252D38] text-gray-900 dark:text-slate-100 tabular-nums"
                        />
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => void handleSave()}
                            disabled={busy || !isInputValid}
                            className="px-4 py-3 rounded-2xl font-semibold text-white text-sm disabled:opacity-50"
                            style={{ background: '#5B6AD0' }}
                        >
                            {busy ? '…' : t('btn_save')}
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={cancelMode}
                            disabled={busy}
                            className="px-3 py-3 rounded-2xl text-gray-500 dark:text-slate-400 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center disabled:opacity-60"
                            aria-label={t('btn_cancel')}
                        >
                            <WIcon name="close" size={16} strokeWidth={2.2} />
                        </motion.button>
                    </motion.div>
                )}

                {mode === 'target' && (
                    <motion.div
                        key="target"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={SPRING}
                    >
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 px-1">
                            {t('weight_target_input')}
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.1"
                                inputMode="decimal"
                                value={targetInput}
                                onChange={e => setTargetInput(e.target.value)}
                                placeholder="65.0"
                                autoFocus
                                className="flex-1 px-4 py-3 rounded-2xl text-sm font-medium outline-none bg-[#F5F6FB] dark:bg-[#252D38] text-gray-900 dark:text-slate-100 tabular-nums"
                            />
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => void handleSaveTarget()}
                                disabled={busy || !isTargetValid}
                                className="px-4 py-3 rounded-2xl font-semibold text-white text-sm disabled:opacity-50"
                                style={{ background: '#5B6AD0' }}
                            >
                                {busy ? '…' : t('btn_save')}
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={cancelMode}
                                disabled={busy}
                                className="px-3 py-3 rounded-2xl text-gray-500 dark:text-slate-400 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center disabled:opacity-60"
                                aria-label={t('btn_cancel')}
                            >
                                <WIcon name="close" size={16} strokeWidth={2.2} />
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default WeightTracker;