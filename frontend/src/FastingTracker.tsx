import { useEffect, useState } from 'react';
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

interface Props {
    telegramId: number;
}

const spring = { type: 'spring', stiffness: 280, damping: 26 } as const;

export function FastingTracker({ telegramId }: Props) {
    const { t } = useTranslation();
    const [active, setActive] = useState<FastingSession | null>(null);
    const [recent, setRecent] = useState<FastingSession[]>([]);
    const [selectedHours, setSelectedHours] = useState<number>(16);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);
    const [ramadanStatus, setRamadanStatus] = useState<RamadanStatus | null>(null);

    async function refresh() {
        const a = await getActiveFast(telegramId);
        setActive(a);
        const r = await getRecentFasts(telegramId, 5);
        setRecent(r);
        if (isRamadanActive()) {
            try {
                setRamadanStatus(await getRamadanStatus());
            } catch {
                setRamadanStatus(null);
            }
        }
        setLoading(false);
    }

    useEffect(() => {
        refresh();
    }, [telegramId]);

    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setTick((tk) => tk + 1), 1000);
        return () => clearInterval(id);
    }, [active]);

    async function handleStart() {
        setLoading(true);
        const s = await startFast(telegramId, selectedHours);
        if (s) setActive(s);
        setLoading(false);
    }

    async function handleStartRamadan() {
        setLoading(true);
        try {
            const times = await getPrayerTimes();
            const fajr = parseTimeToToday(times.fajr);
            const maghrib = parseTimeToToday(times.maghrib);
            const now = new Date();

            let startTime = fajr;
            let endTime = maghrib;
            if (now < fajr) {
                startTime = fajr;
                endTime = maghrib;
            } else if (now >= maghrib) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const ttimes = await getPrayerTimes(tomorrow);
                startTime = parseTimeToToday(ttimes.fajr, tomorrow);
                endTime = parseTimeToToday(ttimes.maghrib, tomorrow);
            }

            const targetHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
            const s = await startFast(telegramId, Math.round(targetHours * 10) / 10, startTime.toISOString());
            if (s) setActive(s);
        } catch (e) {
            console.error('handleStartRamadan error:', e);
        }
        setLoading(false);
    }

    async function handleEnd() {
        if (!active) return;
        setLoading(true);
        const elapsed = calcElapsedHours(active.start_time);
        const completed = elapsed >= active.target_hours;
        const ok = await endFast(active.id, completed);
        if (ok) {
            setActive(null);
            await refresh();
        }
        setLoading(false);
    }

    if (loading && !active) {
        return (
            <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)]">
                <p className="text-sm text-gray-400">{t('loading')}</p>
            </div>
        );
    }

    const showRamadanBanner = isRamadanActive() && !active && ramadanStatus;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)]"
        >
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{t('fast_title')}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        {active ? t('fast_active') : t('fast_subtitle')}
                    </p>
                </div>
                <span className="text-2xl">⏱️</span>
            </div>

            <AnimatePresence>
                {showRamadanBanner && (
                    <RamadanBanner
                        status={ramadanStatus!}
                        onStart={handleStartRamadan}
                        loading={loading}
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
                        loading={loading}
                        t={t}
                    />
                ) : (
                    <StartFastView
                        key="start"
                        selectedHours={selectedHours}
                        setSelectedHours={setSelectedHours}
                        onStart={handleStart}
                        loading={loading}
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
                                className={`flex-1 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold ${r.status === 'completed'
                                    ? 'bg-[#DDE3F5] dark:bg-[#1F2330] text-[#5B6AD0] dark:text-[#8B96E0]'
                                    : 'bg-gray-100 dark:bg-[#252D38] text-gray-400 dark:text-slate-500'
                                    }`}
                                title={`${r.target_hours}s - ${r.status}`}
                            >
                                {r.status === 'completed' ? '✓' : '✕'}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function RamadanBanner({
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
            <div className="absolute -top-2 -right-2 text-5xl opacity-15 select-none">🌙</div>
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🌙</span>
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
}

function StartFastView({
    selectedHours,
    setSelectedHours,
    onStart,
    loading,
    t,
}: {
    selectedHours: number;
    setSelectedHours: (h: number) => void;
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
                        onClick={() => setSelectedHours(p.hours)}
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
}

function ActiveFastView({
    session,
    onEnd,
    loading,
    t,
}: {
    session: FastingSession;
    tick: number;
    onEnd: () => void;
    loading: boolean;
    t: (k: string) => string;
}) {
    const elapsed = calcElapsedHours(session.start_time);
    const progress = calcProgress(session.start_time, session.target_hours);
    const remaining = Math.max(session.target_hours - elapsed, 0);
    const isComplete = progress >= 100;

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
                    <circle cx="80" cy="80" r={radius} className="stroke-[#ECEEF5] dark:stroke-[#252D38]" strokeWidth="10" fill="none" />
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
                        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
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
}