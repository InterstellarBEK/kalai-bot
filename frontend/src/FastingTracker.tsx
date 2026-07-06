// src/FastingTracker.tsx
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FASTING_PRESETS,
    type FastingSession,
    calcElapsedHours,
    calcProgress,
    endFast,
    formatDuration,
    getActiveFast,
    getRecentFasts,
    startFast,
} from './fasting';
import {
    isRamadanActive,
    getRamadanStatus,
    parseTimeToToday,
    getPrayerTimes,
    type RamadanStatus,
} from './ramadan';
import { useTranslation } from './i18n';
import { hapticImpact, hapticNotify } from './telegram';

interface Props {
    telegramId: number;
}

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

// ============================================================================
// HELPERS
// ============================================================================

function safeNum(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// ============================================================================
// ICONS (memoized)
// ============================================================================

const FIcon = memo(function FIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'timer' | 'moon' | 'check' | 'close';
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
        case 'timer':
            return (
                <svg {...common}>
                    <circle cx="12" cy="13.5" r="7.5" fill={fill} />
                    <path d="M12 9.5v4l2.5 1.5" />
                    <path d="M9.5 3h5" />
                    <path d="M12 3v2.5" />
                </svg>
            );
        case 'moon':
            return (
                <svg {...common}>
                    <path
                        d="M20 14.5A8.5 8.5 0 019.5 4a1 1 0 00-1.3-1.2A9 9 0 1021.2 15.8a1 1 0 00-1.2-1.3z"
                        fill={fill}
                    />
                </svg>
            );
        case 'check':
            return (
                <svg {...common}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            );
        case 'close':
            return (
                <svg {...common}>
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            );
    }
});

// ============================================================================
// SKELETON
// ============================================================================

const SkeletonCard = memo(function SkeletonCard() {
    return (
        <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)] animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-[#ECEEF5] dark:bg-[#252D38] rounded-full w-24" />
                    <div className="h-2.5 bg-[#ECEEF5] dark:bg-[#252D38] rounded-full w-36" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#ECEEF5] dark:bg-[#252D38]" />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded-2xl bg-[#ECEEF5] dark:bg-[#252D38]" />
                ))}
            </div>
            <div className="h-12 rounded-2xl bg-[#ECEEF5] dark:bg-[#252D38]" />
        </div>
    );
});

// ============================================================================
// MAIN
// ============================================================================

function FastingTrackerBase({ telegramId }: Props) {
    const { t } = useTranslation();
    const [active, setActive] = useState<FastingSession | null>(null);
    const [recent, setRecent] = useState<FastingSession[]>([]);
    const [selectedHours, setSelectedHours] = useState<number>(16);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const [ramadanStatus, setRamadanStatus] = useState<RamadanStatus | null>(null);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [a, r] = await Promise.all([
                getActiveFast(telegramId),
                getRecentFasts(telegramId, 5),
            ]);
            if (!mountedRef.current) return;
            setActive(a);
            setRecent(Array.isArray(r) ? r : []);

            if (isRamadanActive()) {
                try {
                    const statusRes = await getRamadanStatus();
                    if (!mountedRef.current) return;
                    setRamadanStatus(statusRes.ok ? statusRes.data : null);
                } catch {
                    if (!mountedRef.current) return;
                    setRamadanStatus(null);
                }
            }
        } catch {
            if (!mountedRef.current) return;
            setError(t('error_generic'));
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [telegramId, t]);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        return () => { mountedRef.current = false; };
    }, [refresh]);

    // Live tick — faqat active bo'lganda
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => {
            if (mountedRef.current) setTick((tk) => tk + 1);
        }, 1000);
        return () => clearInterval(id);
    }, [active]);

    const handleStart = useCallback(async () => {
        if (busy) return;
        hapticImpact('light');
        setBusy(true);
        try {
            const s = await startFast(telegramId, selectedHours);
            if (!mountedRef.current) return;
            if (s) {
                setActive(s);
                hapticNotify('success');
            } else {
                hapticNotify('error');
            }
        } catch {
            if (mountedRef.current) hapticNotify('error');
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [busy, telegramId, selectedHours]);

    const handleStartRamadan = useCallback(async () => {
        if (busy) return;
        hapticImpact('light');
        setBusy(true);
        try {
            const timesRes = await getPrayerTimes();
            if (!timesRes.ok) {
                hapticNotify('error');
                if (mountedRef.current) setBusy(false);
                return;
            }
            const times = timesRes.data;
            const fajr = parseTimeToToday(times.fajr);
            const maghrib = parseTimeToToday(times.maghrib);
            const now = new Date();

            let startTime = fajr;
            let endTime = maghrib;
            if (now >= maghrib) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const ttimesRes = await getPrayerTimes(tomorrow);
                if (!ttimesRes.ok) {
                    hapticNotify('error');
                    if (mountedRef.current) setBusy(false);
                    return;
                }
                const ttimes = ttimesRes.data;
                startTime = parseTimeToToday(ttimes.fajr, tomorrow);
                endTime = parseTimeToToday(ttimes.maghrib, tomorrow);
            }

            const targetHours = Math.max(
                1,
                (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
            );
            const s = await startFast(
                telegramId,
                Math.round(targetHours * 10) / 10,
                startTime.toISOString()
            );
            if (!mountedRef.current) return;
            if (s) {
                setActive(s);
                hapticNotify('success');
            } else {
                hapticNotify('error');
            }
        } catch (e) {
            console.error('[fasting] startRamadan error:', e);
            if (mountedRef.current) hapticNotify('error');
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [busy, telegramId]);

    const handleEnd = useCallback(async () => {
        if (!active || busy) return;
        hapticImpact('light');
        setBusy(true);
        try {
            const elapsed = calcElapsedHours(active.start_time);
            const completed = elapsed >= active.target_hours;
            const ok = await endFast(active.id, completed);
            if (!mountedRef.current) return;
            if (ok) {
                setActive(null);
                hapticNotify(completed ? 'success' : 'warning');
                void refresh();
            } else {
                hapticNotify('error');
            }
        } catch {
            if (mountedRef.current) hapticNotify('error');
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [active, busy, refresh]);

    const handleSelectHours = useCallback((h: number) => {
        hapticImpact('light');
        setSelectedHours(h);
    }, []);

    // ── Loading skeleton ──
    if (loading && !active) return <SkeletonCard />;

    // ── Error ──
    if (error && !active) {
        return (
            <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)] text-center">
                <p className="text-sm text-gray-400 dark:text-slate-500 mb-2">{error}</p>
                <button
                    onClick={() => { setLoading(true); void refresh(); }}
                    className="text-sm font-bold text-[#5B6AD0] px-4 py-2 rounded-full bg-[#DDE3F5] dark:bg-[#252D38]"
                >
                    {t('retry')}
                </button>
            </div>
        );
    }

    const showRamadanBanner = isRamadanActive() && !active && ramadanStatus;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)]"
        >
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                        {t('fast_title')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        {active ? t('fast_active') : t('fast_subtitle')}
                    </p>
                </div>
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(91, 106, 208, 0.12)' }}
                >
                    <FIcon name="timer" size={22} color="#5B6AD0" fill="rgba(91, 106, 208, 0.2)" strokeWidth={2} />
                </div>
            </div>

            <AnimatePresence>
                {showRamadanBanner && (
                    <RamadanBanner
                        status={ramadanStatus!}
                        onStart={handleStartRamadan}
                        loading={busy}
                        t={t}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {active ? (
                    <ActiveFastView
                        key="active"
                        session={active}
                        tick={tick}
                        onEnd={handleEnd}
                        loading={busy}
                        t={t}
                    />
                ) : (
                    <StartFastView
                        key="start"
                        selectedHours={selectedHours}
                        onSelectHours={handleSelectHours}
                        onStart={handleStart}
                        loading={busy}
                        t={t}
                    />
                )}
            </AnimatePresence>

            {recent.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#252D38]">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">{t('fast_recent')}</p>
                    <div className="flex gap-1.5">
                        {recent.map((r) => (
                            <div
                                key={r.id}
                                className={`flex-1 h-8 rounded-lg flex items-center justify-center ${r.status === 'completed'
                                    ? 'bg-[#DDE3F5] dark:bg-[#1F2330] text-[#5B6AD0] dark:text-[#8B96E0]'
                                    : 'bg-gray-100 dark:bg-[#252D38] text-gray-400 dark:text-slate-500'
                                    }`}
                                title={`${r.target_hours}s - ${r.status}`}
                            >
                                <FIcon
                                    name={r.status === 'completed' ? 'check' : 'close'}
                                    size={14}
                                    strokeWidth={2.5}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// ============================================================================
// RAMADAN BANNER (memoized)
// ============================================================================

const RamadanBanner = memo(function RamadanBanner({
    status,
    onStart,
    loading,
    t,
}: {
    status: RamadanStatus;
    onStart: () => void;
    loading: boolean;
    t: (k: string) => string;
}) {
    if (!status.fajrTime || !status.maghribTime) return null;

    const fajrStr = status.fajrTime.toTimeString().slice(0, 5);
    const maghribStr = status.maghribTime.toTimeString().slice(0, 5);
    const hours = ((status.maghribTime.getTime() - status.fajrTime.getTime()) / (1000 * 60 * 60)).toFixed(1);

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #3D4FAA 0%, #5B6AD0 100%)' }}
        >
            <div className="absolute -top-3 -right-3 opacity-15 select-none pointer-events-none">
                <FIcon name="moon" size={80} color="#ffffff" fill="#ffffff" strokeWidth={1.5} />
            </div>
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <FIcon name="moon" size={16} color="#ffffff" fill="#ffffff" strokeWidth={2} />
                    <div className="text-white text-sm font-extrabold">{t('fast_ramadan_title')}</div>
                </div>
                <div className="text-white/80 text-[11px] font-semibold mb-2.5">
                    {t('fast_ramadan_sahar')} {fajrStr} → {t('fast_ramadan_iftar')} {maghribStr} · ~{hours} {t('fast_ramadan_hours')}
                </div>
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onStart}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-white dark:bg-[#1E252E] text-[#5B6AD0] font-extrabold text-sm disabled:opacity-50"
                >
                    {loading ? t('fast_starting') : t('fast_ramadan_start')}
                </motion.button>
            </div>
        </motion.div>
    );
});

// ============================================================================
// START VIEW (memoized)
// ============================================================================

const StartFastView = memo(function StartFastView({
    selectedHours,
    onSelectHours,
    onStart,
    loading,
    t,
}: {
    selectedHours: number;
    onSelectHours: (h: number) => void;
    onStart: () => void;
    loading: boolean;
    t: (k: string) => string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="grid grid-cols-4 gap-2 mb-4">
                {FASTING_PRESETS.map((p) => (
                    <motion.button
                        key={p.label}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onSelectHours(p.hours)}
                        className={`py-3 px-2 rounded-2xl text-center transition-colors ${selectedHours === p.hours
                            ? 'bg-[#5B6AD0] text-white'
                            : 'bg-[#ECEEF5] dark:bg-[#252D38] text-gray-700 dark:text-slate-300'
                            }`}
                    >
                        <div className="text-sm font-bold">{p.label}</div>
                        <div
                            className={`text-[10px] mt-0.5 ${selectedHours === p.hours ? 'text-white/80' : 'text-gray-500 dark:text-slate-400'
                                }`}
                        >
                            {t(p.descKey)}
                        </div>
                    </motion.button>
                ))}
            </div>

            <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onStart}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#5B6AD0] text-white font-semibold text-sm disabled:opacity-50"
            >
                {loading ? t('fast_starting') : `${t('fast_start')} (${selectedHours} ${t('fast_start_hours_unit')})`}
            </motion.button>
        </motion.div>
    );
});

// ============================================================================
// ACTIVE VIEW (memoized)
// ============================================================================

const ActiveFastView = memo(function ActiveFastView({
    session,
    onEnd,
    loading,
    t,
}: {
    session: FastingSession;
    tick: number; // eslint-disable-line @typescript-eslint/no-unused-vars
    onEnd: () => void;
    loading: boolean;
    t: (k: string) => string;
}) {
    // useMemo — recalculated on tick change (parent re-renders)
    const { elapsed, progress, remaining, isComplete } = useMemo(() => {
        const el = calcElapsedHours(session.start_time);
        const pr = Math.min(100, Math.max(0, safeNum(calcProgress(session.start_time, session.target_hours))));
        const rem = Math.max(safeNum(session.target_hours) - el, 0);
        return { elapsed: el, progress: pr, remaining: rem, isComplete: pr >= 100 };
    }, [session.start_time, session.target_hours]);

    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
        >
            <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160">
                    <circle
                        cx="80"
                        cy="80"
                        r={radius}
                        className="stroke-[#ECEEF5] dark:stroke-[#252D38]"
                        strokeWidth="10"
                        fill="none"
                    />
                    <motion.circle
                        cx="80"
                        cy="80"
                        r={radius}
                        stroke={isComplete ? '#10B981' : '#5B6AD0'}
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 0.8, ease: EASE_BACK }}
                    />
                </svg>

                <div className="text-center z-10">
                    <div className="text-2xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                        {formatDuration(elapsed)}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                        {session.target_hours}{t('fast_target_suffix')}
                    </div>
                    <div
                        className={`text-[11px] font-semibold mt-1 ${isComplete ? 'text-emerald-600' : 'text-[#5B6AD0]'
                            }`}
                    >
                        {isComplete ? t('fast_complete') : `${formatDuration(remaining)} ${t('fast_remaining')}`}
                    </div>
                </div>
            </div>

            <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onEnd}
                disabled={loading}
                className={`mt-4 w-full py-3 rounded-2xl font-semibold text-sm disabled:opacity-50 ${isComplete
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#FAD9C8] text-orange-700'
                    }`}
            >
                {loading ? t('fast_ending') : isComplete ? t('fast_finish') : t('fast_stop')}
            </motion.button>
        </motion.div>
    );
});

const FastingTracker = memo(FastingTrackerBase);
export { FastingTracker };
export default FastingTracker;