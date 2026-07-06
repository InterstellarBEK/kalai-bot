import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getPrayerTimes,
    getRamadanStatus,
    getNextRamadan,
    getDaysUntilRamadan,
    getSelectedRegion,
    setSelectedRegion,
    UZ_REGIONS,
    type RamadanStatus,
    type PrayerTimes,
    type Region,
} from './ramadan';
import { hapticImpact, hapticSelection, } from './telegram';
import Bekjon from './components/Bekjon';
import { useTranslation, type Lang } from './i18n';
import type { LokmaError } from './supabase';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const SPRING_SOFT = { type: 'spring' as const, stiffness: 220, damping: 28 };

const MONTHS: Record<Lang, string[]> = {
    'uz-Latn': ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
    'uz-Cyrl': ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
    'ru': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    'en': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
const PRAYER_ORDER: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const FARZ_PRAYERS: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_AR: Record<PrayerKey, string> = {
    fajr: 'الفجر',
    sunrise: 'الشروق',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء',
};

const RAMADAN_STARTS: [number, number, number][] = [
    [2025, 1, 28],
    [2026, 1, 17],
    [2027, 1, 6],
    [2028, 0, 27],
    [2029, 0, 16],
    [2030, 0, 5],
];

const DUAS = {
    sahar: {
        arabic: 'نَوَيْتُ صَوْمَ غَدٍ عَنْ أَدَاءِ فَرْضِ شَهْرِ رَمَضَانَ',
        translit: "Nawaytu sawma ghadin an ada'i fardi shahri Ramadana",
        translations: {
            'uz-Latn': "Ertangi kunni Ramazon oyi farzini ado etish uchun ro'za tutmoqni niyat qildim.",
            'uz-Cyrl': "Эртанги кунни Рамазон ойи фарзини адо этиш учун рўза тутмоқни ният қилдим.",
            'ru': "Я намереваюсь завтра поститься для исполнения обязательного поста месяца Рамадан.",
            'en': "I intend to fast tomorrow to fulfill the obligatory fast of the month of Ramadan.",
        },
    },
    iftar: {
        arabic: 'اَللّٰهُمَّ إِنِّي لَكَ صُمْتُ وَبِكَ آمَنْتُ وَعَلَيْكَ تَوَكَّلْتُ وَعَلَىٰ رِزْقِكَ أَفْطَرْتُ',
        translit: 'Allahumma inni laka sumtu wa bika amantu wa alayka tawakkaltu wa ala rizqika aftartu',
        translations: {
            'uz-Latn': "Ey Alloh! Sen uchun ro'za tutdim, Senga imon keltirdim, Senga tavakkul qildim va Sening rizqing bilan iftor qildim.",
            'uz-Cyrl': "Эй Аллоҳ! Сен учун рўза тутдим, Сенга имон келтирдим, Сенга таваккул қилдим ва Сенинг ризқинг билан ифтор қилдим.",
            'ru': "О Аллах! Ради Тебя я постился, в Тебя уверовал, на Тебя уповал и Твоим уделом разговелся.",
            'en': "O Allah! For You I fasted, in You I believed, upon You I relied, and with Your provision I break my fast.",
        },
    },
};

// ── Icons ─────────────────────────────────────────────────
type RIconName = 'pin' | 'chevronDown' | 'check' | 'moon' | 'lock' | 'sunrise' | 'mosque' | 'timer' | 'bulb' | 'star' | 'sparkle' | 'book';

function RIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: RIconName;
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
        case 'pin':
            return (
                <svg {...common}>
                    <path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" fill={fill} />
                    <circle cx="12" cy="9" r="2.5" fill={color} stroke="none" />
                </svg>
            );
        case 'chevronDown':
            return (
                <svg {...common}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            );
        case 'check':
            return (
                <svg {...common}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
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
        case 'lock':
            return (
                <svg {...common}>
                    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" fill={fill} />
                    <path d="M7.5 10.5V7a4.5 4.5 0 019 0v3.5" />
                    <circle cx="12" cy="15.5" r="1.3" fill={color} stroke="none" />
                </svg>
            );
        case 'sunrise':
            return (
                <svg {...common}>
                    <path d="M3 18h18" />
                    <path d="M5.5 15a6.5 6.5 0 0113 0" fill={fill} />
                    <path d="M12 3v4M5 7l2 2M19 7l-2 2" />
                </svg>
            );
        case 'mosque':
            return (
                <svg {...common}>
                    <path d="M4 20V11a8 8 0 0116 0v9" fill={fill} />
                    <path d="M4 20h16" />
                    <path d="M9 20v-5a3 3 0 016 0v5" />
                    <path d="M12 3v2.5" />
                    <circle cx="12" cy="2" r="1" fill={color} stroke="none" />
                </svg>
            );
        case 'timer':
            return (
                <svg {...common}>
                    <circle cx="12" cy="13.5" r="7.5" fill={fill} />
                    <path d="M12 9.5v4l2.5 1.5" />
                    <path d="M9.5 3h5" />
                    <path d="M12 3v2.5" />
                </svg>
            );
        case 'bulb':
            return (
                <svg {...common}>
                    <path d="M9 18h6" />
                    <path d="M10 21h4" />
                    <path d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6V17h5.4v-1.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" fill={fill} />
                </svg>
            );
        case 'star':
            return (
                <svg {...common}>
                    <path d="M12 2l1.7 5.6L19 9l-5.3 1.6L12 16l-1.7-5.4L5 9l5.3-1.4L12 2z" fill={fill} stroke="none" />
                </svg>
            );
        case 'sparkle':
            return (
                <svg {...common}>
                    <path d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" fill={fill} stroke="none" />
                    <circle cx="19" cy="5" r="1.2" fill={color} stroke="none" />
                    <circle cx="5" cy="19" r="1" fill={color} stroke="none" />
                </svg>
            );
        case 'book':
            return (
                <svg {...common}>
                    <path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5v-15z" fill={fill} />
                    <path d="M4 20.5A2.5 2.5 0 016.5 18H19v3H6.5A2.5 2.5 0 014 18.5" />
                </svg>
            );
    }
}

// ── Helpers ───────────────────────────────────────────────
function pad2(n: number): string {
    return n.toString().padStart(2, '0');
}

function formatDate(iso: string, lang: Lang): string {
    const [y, m, d] = iso.split('-').map(Number);
    const month = MONTHS[lang][m - 1];
    if (lang === 'en') return `${month} ${d}, ${y}`;
    return `${d} ${month} ${y}`;
}

function nowHHMM(): string {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getCurrentPrayer(allTimes: PrayerTimes | null): PrayerKey | null {
    if (!allTimes) return null;
    const t = nowHHMM();
    let current: PrayerKey | null = null;
    for (const k of PRAYER_ORDER) {
        if ((allTimes[k] as string) <= t) current = k;
    }
    return current;
}

function computeWindowProgress(status: RamadanStatus): number {
    if (!status.fajrTime || !status.maghribTime || !status.nextEventTime) return 0;
    const now = Date.now();
    if (status.isFasting) {
        const start = status.fajrTime.getTime();
        const end = status.maghribTime.getTime();
        if (end <= start) return 0;
        return Math.max(0, Math.min(1, (now - start) / (end - start)));
    }
    const end = status.nextEventTime.getTime();
    const start = end - 10 * 60 * 60 * 1000;
    if (end <= start) return 0;
    return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

function getRamadanDay(now: Date): number | null {
    const t = now.getTime();
    for (const [y, m, d] of RAMADAN_STARTS) {
        const start = new Date(y, m, d).getTime();
        const end = start + 30 * 24 * 60 * 60 * 1000;
        if (t >= start && t < end) {
            return Math.floor((t - start) / (24 * 60 * 60 * 1000)) + 1;
        }
    }
    return null;
}

type CompletedMap = Record<PrayerKey, boolean>;
const EMPTY_COMPLETED: CompletedMap = { fajr: false, sunrise: false, dhuhr: false, asr: false, maghrib: false, isha: false };

function loadCompleted(): CompletedMap {
    try {
        const raw = localStorage.getItem(`lokma_prayers_${todayKey()}`);
        if (!raw) return { ...EMPTY_COMPLETED };
        const parsed = JSON.parse(raw) as Partial<CompletedMap>;
        return { ...EMPTY_COMPLETED, ...parsed };
    } catch {
        return { ...EMPTY_COMPLETED };
    }
}

function saveCompleted(c: CompletedMap): void {
    try {
        localStorage.setItem(`lokma_prayers_${todayKey()}`, JSON.stringify(c));
    } catch {
        // ignore
    }
}

// ── Live countdown with pulsing colons ────────────────────
function LiveCountdown({ seconds, className, style }: { seconds: number; className?: string; style?: React.CSSProperties }) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const anim = { opacity: [1, 0.25, 1] };
    const tr = { duration: 1, repeat: Infinity, ease: 'easeInOut' as const };
    return (
        <div className={className} style={style}>
            <span className="tabular-nums">{pad2(h)}</span>
            <motion.span className="inline-block" animate={anim} transition={tr}>:</motion.span>
            <span className="tabular-nums">{pad2(m)}</span>
            <motion.span className="inline-block" animate={anim} transition={{ ...tr, delay: 0.3 }}>:</motion.span>
            <span className="tabular-nums">{pad2(s)}</span>
        </div>
    );
}

// ── Live pulse dot ────────────────────────────────────────
function LivePulseDot({ color = '#ffffff', size = 6 }: { color?: string; size?: number }) {
    return (
        <div className="relative inline-block" style={{ width: size, height: size }}>
            <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: color }}
                animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <div className="absolute inset-0 rounded-full" style={{ background: color }} />
        </div>
    );
}

// ── Star field ────────────────────────────────────────────
function StarField() {
    const stars = [
        { top: 6, left: 18, size: 9, delay: 0 },
        { top: 22, left: 82, size: 6, delay: 0.4 },
        { top: 55, left: 8, size: 7, delay: 0.8 },
        { top: 68, left: 88, size: 5, delay: 1.2 },
        { top: 12, left: 60, size: 4, delay: 0.6 },
        { top: 86, left: 42, size: 6, delay: 1.5 },
        { top: 40, left: 92, size: 4, delay: 1.0 },
    ];
    return (
        <div className="absolute inset-0 pointer-events-none">
            {stars.map((st, i) => (
                <motion.div
                    key={i}
                    className="absolute"
                    style={{ top: `${st.top}%`, left: `${st.left}%` }}
                    animate={{ opacity: [0.15, 0.85, 0.15], scale: [0.75, 1.15, 0.75] }}
                    transition={{ duration: 2.4, repeat: Infinity, delay: st.delay, ease: 'easeInOut' }}
                >
                    <RIcon name="star" size={st.size} color="#ffffff" fill="#ffffff" strokeWidth={0} />
                </motion.div>
            ))}
        </div>
    );
}

// ── Shimmer ──────────────────────────────────────────────
function ShimmerOverlay() {
    return (
        <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-120%', '120%'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)' }}
        />
    );
}

// ── Hero Halo — radial pulse glow behind ring ─────────────
function HeroHalo({ color, imminent = false }: { color: string; imminent?: boolean }) {
    return (
        <>
            {/* Outer halo — soft glow expanding */}
            <motion.div
                className="absolute inset-0 m-auto rounded-full pointer-events-none"
                style={{
                    width: 300,
                    height: 300,
                    background: `radial-gradient(circle, ${color} 0%, transparent 62%)`,
                    filter: 'blur(24px)',
                }}
                animate={{
                    scale: imminent ? [1, 1.12, 1] : [1, 1.06, 1],
                    opacity: imminent ? [0.55, 0.85, 0.55] : [0.35, 0.55, 0.35],
                }}
                transition={{
                    duration: imminent ? 1.8 : 3.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />
            {/* Inner sheen — brighter core */}
            <motion.div
                className="absolute inset-0 m-auto rounded-full pointer-events-none"
                style={{
                    width: 200,
                    height: 200,
                    background: 'radial-gradient(circle, rgba(255,255,255,0.28) 0%, transparent 55%)',
                    filter: 'blur(16px)',
                }}
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            />
        </>
    );
}

// ── Circular progress ring ───────────────────────────────
function CircularRing({ progress, imminent = false, size = 240 }: { progress: number; imminent?: boolean; size?: number }) {
    const R = 108;
    const C = 2 * Math.PI * R;
    const offset = C * (1 - Math.max(0, Math.min(1, progress)));
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 240 240"
            className="absolute inset-0 m-auto pointer-events-none"
            style={imminent ? { filter: 'drop-shadow(0 0 14px rgba(255, 200, 80, 0.75))' } : undefined}
        >
            <circle cx="120" cy="120" r={R} strokeWidth="6" stroke="rgba(255,255,255,0.15)" fill="none" />
            <motion.circle
                cx="120"
                cy="120"
                r={R}
                strokeWidth="6"
                stroke="rgba(255,255,255,0.95)"
                fill="none"
                strokeLinecap="round"
                transform="rotate(-90 120 120)"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            {imminent && (
                <motion.circle
                    cx="120"
                    cy="120"
                    r={R}
                    strokeWidth="6"
                    stroke="rgba(255, 220, 130, 0.9)"
                    fill="none"
                    strokeLinecap="round"
                    transform="rotate(-90 120 120)"
                    strokeDasharray={C}
                    strokeDashoffset={offset}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
            )}
        </svg>
    );
}

// ── Check-circle for prayer completion ───────────────────
function CheckMark({ done, color, size = 22 }: { done: boolean; color: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2} fill={done ? color : 'none'} />
            {done && (
                <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    d="M8 12.5l2.5 2.5L16 9"
                    stroke="#ffffff"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            )}
        </svg>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function RamadanScreen() {
    const { t, lang } = useTranslation();
    const [status, setStatus] = useState<RamadanStatus | null>(null);
    const [allTimes, setAllTimes] = useState<PrayerTimes | null>(null);
    const [region, setRegion] = useState<Region>(getSelectedRegion());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [error, setError] = useState<LokmaError | null>(null);
    const [loading, setLoading] = useState(true);
    const [, setTick] = useState(0);
    const [completed, setCompleted] = useState<CompletedMap>(() => loadCompleted());

    const mountedRef = useRef(true);
    const abortRef = useRef<AbortController | null>(null);
    const dayRef = useRef<string>(todayKey());

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
        };
    }, []);

    const refresh = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        const statusResult = await getRamadanStatus(new Date(), controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        if (!statusResult.ok) {
            setError(statusResult.error);
            setStatus(null);
            setAllTimes(null);
            setLoading(false);
            return;
        }

        setStatus(statusResult.data);

        // Namoz vaqtlari doim yuklanadi — Ramazon bo'lmasa ham
        const timesResult = await getPrayerTimes(new Date(), region, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;
        if (timesResult.ok) {
            setAllTimes(timesResult.data);
        } else {
            setAllTimes(null);
        }

        setLoading(false);
    }, [region]);

    useEffect(() => {
        refresh();
        const id = setInterval(() => {
            if (!mountedRef.current) return;
            const nowKey = todayKey();
            if (nowKey !== dayRef.current) {
                dayRef.current = nowKey;
                setCompleted(loadCompleted());
            }
            setTick((tk) => tk + 1);
        }, 1000);
        return () => clearInterval(id);
    }, [refresh]);

    const selectRegion = useCallback((r: Region) => {
        hapticSelection();
        setSelectedRegion(r.id);
        setRegion(r);
        setPickerOpen(false);
    }, []);

    const openPicker = useCallback(() => {
        hapticImpact('light');
        setPickerOpen(true);
    }, []);

    const togglePrayer = useCallback((key: PrayerKey) => {
        if (key === 'sunrise') return;
        setCompleted((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            saveCompleted(next);
            const doneCount = FARZ_PRAYERS.filter((k) => next[k]).length;
            if (next[key]) {
                if (doneCount === FARZ_PRAYERS.length) hapticImpact('heavy');
                else hapticImpact('medium');
            } else {
                hapticSelection();
            }
            return next;
        });
    }, []);

    if (loading && !status) {
        return (
            <div className="min-h-screen pb-28 flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-stone-400 dark:text-slate-500 font-bold text-sm">{t('loading')}</div>
            </div>
        );
    }

    if (error && !status) {
        return (
            <div className="min-h-screen pb-28 flex items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
                <div
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-6 max-w-sm w-full text-center"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <div className="text-stone-900 dark:text-slate-100 font-extrabold text-base mb-1">
                        {t(error.userMessageKey) || t('errors.network')}
                    </div>
                    <div className="text-stone-500 dark:text-slate-400 text-[13px] font-semibold mb-4">{t('errors.retry_hint')}</div>
                    <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => {
                            hapticImpact('medium');
                            refresh();
                        }}
                        className="w-full rounded-2xl py-3 text-white font-extrabold text-sm"
                        style={{ background: '#5B6AD0' }}
                    >
                        {t('retry')}
                    </motion.button>
                </div>
            </div>
        );
    }

    if (!status) return null;

    const nowLabel = lang === 'ru' ? 'СЕЙЧАС' : lang === 'en' ? 'NOW' : 'HOZIR';

    return (
        <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
            <div className="max-w-md mx-auto px-5 pt-7">
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mb-5 flex items-center justify-between gap-3"
                >
                    <div>
                        <h1 className="text-[24px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight tracking-tight">
                            {t('ram_title')}
                        </h1>
                        <p className="text-[13px] text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                            {status.isRamadan ? t('ram_sub_active') : t('ram_sub_locked')}
                        </p>
                    </div>
                    <RegionChip region={region} onClick={openPicker} />
                </motion.div>

                <ActiveView
                    status={status}
                    allTimes={allTimes}
                    region={region}
                    t={t}
                    lang={lang}
                    nowLabel={nowLabel}
                    completed={completed}
                    onTogglePrayer={togglePrayer}
                />
            </div>

            <AnimatePresence>
                {pickerOpen && (
                    <RegionPicker
                        selected={region.id}
                        onSelect={selectRegion}
                        onClose={() => setPickerOpen(false)}
                        t={t}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function RegionChip({ region, onClick }: { region: Region; onClick: () => void }) {
    return (
        <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onClick}
            className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] rounded-2xl px-3 py-2"
            style={{ boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.15)' }}
        >
            <RIcon name="pin" size={14} color="#5B6AD0" fill="rgba(91, 106, 208, 0.25)" strokeWidth={2} />
            <span className="text-stone-800 dark:text-slate-200 text-[12px] font-extrabold whitespace-nowrap">{region.name}</span>
            <RIcon name="chevronDown" size={12} color="#94A3B8" strokeWidth={2.4} />
        </motion.button>
    );
}

function RegionPicker({
    selected,
    onSelect,
    onClose,
    t,
}: {
    selected: string;
    onSelect: (r: Region) => void;
    onClose: () => void;
    t: (k: string) => string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-[#1E252E] w-full max-w-md rounded-t-[2rem] p-5 pb-8 max-h-[80vh] overflow-y-auto"
            >
                <div className="w-10 h-1 bg-stone-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                <h2 className="text-stone-900 dark:text-slate-100 text-base font-extrabold mb-3">{t('ram_region_pick')}</h2>
                <div className="space-y-1.5">
                    {UZ_REGIONS.map((r) => {
                        const active = r.id === selected;
                        return (
                            <motion.button
                                key={r.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSelect(r)}
                                className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-colors ${active
                                    ? 'bg-indigo-500 text-white'
                                    : 'bg-stone-100 dark:bg-slate-800/60 text-stone-800 dark:text-slate-200'
                                    }`}
                            >
                                <span className="text-sm font-extrabold">{r.name}</span>
                                {active && <RIcon name="check" size={16} color="#ffffff" strokeWidth={2.5} />}
                            </motion.button>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Countdown Hero — Ramazon bo'lmagan davr uchun ─────────
function CountdownHero({ lang, t }: { lang: Lang; t: (k: string) => string }) {
    const next = getNextRamadan();
    const days = getDaysUntilRamadan();

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="rounded-[1.75rem] p-6 mb-4 relative overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, #2E3B8F 0%, #5B6AD0 55%, #7C8AE0 100%)',
                boxShadow: '0 12px 32px -10px rgba(91, 106, 208, 0.55)',
            }}
        >
            <StarField />
            <ShimmerOverlay />
            <motion.div
                className="absolute -top-8 -right-8 opacity-15 select-none"
                animate={{ rotate: [0, 8, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            >
                <RIcon name="moon" size={150} color="#ffffff" fill="#ffffff" strokeWidth={1.4} />
            </motion.div>
            <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                    <LivePulseDot color="#ffffff" size={5} />
                    <div className="text-white/80 text-[11px] font-extrabold uppercase tracking-wider">
                        {t('ram_days_until')}
                    </div>
                </div>
                <div className="text-white text-[68px] font-extrabold tabular-nums leading-none">{days}</div>
                <div className="text-white/90 text-sm font-extrabold mt-1">{t('ram_days_unit')}</div>
                {next && (
                    <div
                        className="mt-4 inline-block backdrop-blur-md rounded-xl px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.15)' }}
                    >
                        <div className="text-white/70 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_starts')}</div>
                        <div className="text-white text-sm font-extrabold">{formatDate(next.start, lang)}</div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ─── Fasting Hero — Ramazon davri uchun ─────────
function FastingHero({
    status,
    t,
    lang,
}: {
    status: RamadanStatus;
    t: (k: string) => string;
    lang: Lang;
}) {
    const seconds = status.nextEventTime
        ? Math.max(0, Math.floor((status.nextEventTime.getTime() - Date.now()) / 1000))
        : 0;
    const isFasting = status.isFasting;
    const iftarImminent = status.nextEventLabel === 'iftar' && seconds > 0 && seconds < 30 * 60;
    const label = iftarImminent
        ? (lang === 'ru' ? 'СКОРО ИФТАР!' : lang === 'en' ? 'IFTAR SOON!' : "IFTAR YAQIN!")
        : status.nextEventLabel === 'iftar'
            ? t('ram_until_iftar')
            : t('ram_until_sahar');
    const progress = computeWindowProgress(status);
    const ramDay = getRamadanDay(new Date());

    const heroGradient = iftarImminent
        ? 'linear-gradient(135deg, #B84A1F 0%, #E67E1B 55%, #F59E0B 100%)'
        : isFasting
            ? 'linear-gradient(135deg, #2E3B8F 0%, #5B6AD0 55%, #7C8AE0 100%)'
            : 'linear-gradient(135deg, #E67E1B 0%, #F59E0B 55%, #FBBF6E 100%)';

    const haloColor = iftarImminent
        ? 'rgba(255, 210, 140, 0.55)'
        : isFasting
            ? 'rgba(180, 195, 255, 0.42)'
            : 'rgba(255, 220, 150, 0.48)';

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="rounded-[1.75rem] p-6 mb-4 relative overflow-hidden"
            style={{
                background: heroGradient,
                boxShadow: iftarImminent
                    ? '0 14px 36px -10px rgba(230, 126, 27, 0.65)'
                    : isFasting
                        ? '0 12px 32px -10px rgba(91, 106, 208, 0.55)'
                        : '0 12px 32px -10px rgba(245, 158, 11, 0.55)',
            }}
        >
            {isFasting && !iftarImminent ? <StarField /> : null}
            <ShimmerOverlay />
            <motion.div
                className="absolute -top-6 -right-6 opacity-15 select-none"
                animate={{ rotate: isFasting && !iftarImminent ? [0, 6, 0] : [0, -6, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            >
                <RIcon
                    name={isFasting && !iftarImminent ? 'moon' : 'sunrise'}
                    size={120}
                    color="#ffffff"
                    fill="#ffffff"
                    strokeWidth={1.4}
                />
            </motion.div>

            {/* Ring + inner content */}
            <div className="relative flex items-center justify-center" style={{ height: 240 }}>
                <HeroHalo color={haloColor} imminent={iftarImminent} />
                <CircularRing progress={progress} imminent={iftarImminent} size={240} />
                <div className="relative z-10 text-center px-4">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <LivePulseDot color="#ffffff" size={5} />
                        <div className="text-white/85 text-[10px] font-extrabold uppercase tracking-widest">{label}</div>
                    </div>
                    <LiveCountdown
                        seconds={seconds}
                        className="text-white text-[38px] font-extrabold leading-none mb-3"
                        style={{ letterSpacing: '-0.02em' }}
                    />
                    {ramDay !== null && (
                        <div
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md"
                            style={{ background: 'rgba(255,255,255,0.18)' }}
                        >
                            <RIcon name="moon" size={10} color="#ffffff" fill="#ffffff" strokeWidth={1.5} />
                            <span className="text-white text-[10px] font-extrabold uppercase tracking-wider tabular-nums">
                                {t('ram_day')} {ramDay}/30
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sahar / Iftar chips */}
            <div className="relative flex gap-2 mt-2">
                {status.fajrTime && (
                    <div
                        className="backdrop-blur-md rounded-2xl px-3 py-2.5 flex-1"
                        style={{ background: 'rgba(255,255,255,0.16)' }}
                    >
                        <div className="text-white/75 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_fajr_ends')}</div>
                        <div className="text-white text-base font-extrabold tabular-nums">
                            {status.fajrTime.toTimeString().slice(0, 5)}
                        </div>
                    </div>
                )}
                {status.maghribTime && (
                    <div
                        className="backdrop-blur-md rounded-2xl px-3 py-2.5 flex-1"
                        style={{ background: 'rgba(255,255,255,0.16)' }}
                    >
                        <div className="text-white/75 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_iftar')}</div>
                        <div className="text-white text-base font-extrabold tabular-nums">
                            {status.maghribTime.toTimeString().slice(0, 5)}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function ActiveView({
    status,
    allTimes,
    region,
    t,
    lang,
    nowLabel,
    completed,
    onTogglePrayer,
}: {
    status: RamadanStatus;
    allTimes: PrayerTimes | null;
    region: Region;
    t: (k: string) => string;
    lang: Lang;
    nowLabel: string;
    completed: CompletedMap;
    onTogglePrayer: (k: PrayerKey) => void;
}) {
    const seconds = status.nextEventTime
        ? Math.max(0, Math.floor((status.nextEventTime.getTime() - Date.now()) / 1000))
        : 0;
    const isFasting = status.isFasting;
    const iftarImminent = status.isRamadan && status.nextEventLabel === 'iftar' && seconds > 0 && seconds < 30 * 60;
    const currentPrayer = getCurrentPrayer(allTimes);
    const doneCount = FARZ_PRAYERS.filter((k) => completed[k]).length;
    const allDone = doneCount === FARZ_PRAYERS.length;

    // Bekjon mood — Ramazon holatiga qarab
    const bekjonMood: 'sleeping' | 'hungry' | 'happy' | 'celebration' = iftarImminent
        ? 'hungry'
        : status.isRamadan && isFasting
            ? 'sleeping'
            : allDone
                ? 'celebration'
                : 'happy';

    const bekjonGlow = iftarImminent
        ? 'rgba(239, 159, 39, 0.42)'
        : status.isRamadan && isFasting
            ? 'rgba(91, 106, 208, 0.32)'
            : allDone
                ? 'rgba(29, 158, 117, 0.38)'
                : 'rgba(239, 159, 39, 0.32)';

    // Tip matni
    const tipText = iftarImminent
        ? t('ram_tip_imminent')
        : status.isRamadan && isFasting
            ? t('ram_tip_fasting')
            : t('ram_tip_eating');

    return (
        <>
            {/* ─── HERO — Ramazon bo'lsa ro'za countdown, bo'lmasa Ramazongacha kunlar ─── */}
            {status.isRamadan ? (
                <FastingHero status={status} t={t} lang={lang} />
            ) : (
                <CountdownHero lang={lang} t={t} />
            )}

            {/* ─── Prayer times card with completion tracking ─── */}
            {allTimes && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.05 }}
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-stone-900 dark:text-slate-100 text-sm font-extrabold uppercase tracking-wider">
                            {t('ram_today_times')}
                        </h2>
                        <motion.div
                            animate={allDone ? { scale: [1, 1.08, 1] } : {}}
                            transition={{ duration: 1.6, repeat: allDone ? Infinity : 0 }}
                            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${allDone
                                ? 'bg-emerald-500 dark:bg-emerald-500'
                                : 'bg-stone-100 dark:bg-slate-800/60'
                                }`}
                        >
                            {allDone && <RIcon name="sparkle" size={10} color="#ffffff" fill="#ffffff" strokeWidth={0} />}
                            <span
                                className={`text-[10px] font-extrabold tabular-nums ${allDone ? 'text-white' : 'text-stone-600 dark:text-slate-300'
                                    }`}
                            >
                                {doneCount}/{FARZ_PRAYERS.length} {t('ram_prayed')}
                            </span>
                        </motion.div>
                    </div>

                    <div className="space-y-1.5">
                        {PRAYER_ORDER.map((key, i) => (
                            <motion.div
                                key={key}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ ...SPRING_SOFT, delay: 0.08 + i * 0.04 }}
                            >
                                <PrayerRow
                                    prayerKey={key}
                                    label={t(`ram_prayer_${key}`)}
                                    time={allTimes[key] as string}
                                    isCurrent={currentPrayer === key}
                                    nowLabel={nowLabel}
                                    tone={key === 'fajr' ? 'sahar' : key === 'maghrib' ? 'iftar' : 'neutral'}
                                    isDone={key === 'sunrise' ? false : completed[key]}
                                    canToggle={key !== 'sunrise'}
                                    onToggle={() => onTogglePrayer(key)}
                                />
                            </motion.div>
                        ))}
                    </div>

                    <div className="flex items-center justify-center gap-1.5 mt-3">
                        <RIcon name="pin" size={10} color="#94A3B8" fill="rgba(148,163,184,0.25)" strokeWidth={2} />
                        <div className="text-[10px] text-stone-400 dark:text-slate-500 font-bold">
                            {region.name} · {t('ram_madhab')}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ─── Duolar card ─── */}
            <DuasCard t={t} lang={lang} defaultTab={isFasting ? 'iftar' : 'sahar'} />

            {/* ─── Bekjon tip card ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.16 }}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mt-4 relative overflow-hidden"
                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
            >
                <div className="flex items-start gap-4 relative">
                    <div className="shrink-0 -mt-1 -ml-1 relative">
                        {/* Bekjon glow — mood-adaptive radial */}
                        <motion.div
                            className="absolute inset-0 pointer-events-none rounded-full"
                            style={{
                                background: `radial-gradient(circle, ${bekjonGlow} 0%, transparent 65%)`,
                                filter: 'blur(14px)',
                                transform: 'scale(1.5)',
                            }}
                            animate={{ opacity: [0.6, 1, 0.6], scale: [1.4, 1.55, 1.4] }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div className="relative">
                            <Bekjon mood={bekjonMood} size={64} />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                            <RIcon name="bulb" size={12} color="#EF9F27" fill="rgba(239,159,39,0.25)" strokeWidth={2} />
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                {t('ram_tip_title')}
                            </div>
                        </div>
                        <div className="text-stone-700 dark:text-slate-300 text-[13px] font-semibold leading-relaxed">
                            {tipText}
                        </div>
                    </div>
                </div>
            </motion.div>
        </>
    );
}

// ─── Prayer row ────────────────────────────────────────
function PrayerRow({
    prayerKey,
    label,
    time,
    isCurrent,
    nowLabel,
    tone,
    isDone,
    canToggle,
    onToggle,
}: {
    prayerKey: PrayerKey;
    label: string;
    time: string;
    isCurrent: boolean;
    nowLabel: string;
    tone: 'sahar' | 'iftar' | 'neutral';
    isDone: boolean;
    canToggle: boolean;
    onToggle: () => void;
}) {
    // Boyroq tone gradient — dark modeda o'qib bo'ladigan
    const toneClasses =
        tone === 'sahar'
            ? 'bg-gradient-to-br from-indigo-50/95 to-indigo-100/60 dark:from-indigo-500/18 dark:to-indigo-500/8 border-indigo-100/80 dark:border-indigo-400/30'
            : tone === 'iftar'
                ? 'bg-gradient-to-br from-amber-50/95 to-amber-100/60 dark:from-amber-500/18 dark:to-amber-500/8 border-amber-100/80 dark:border-amber-400/30'
                : 'bg-gradient-to-br from-stone-50 to-stone-100/70 dark:from-slate-800/60 dark:to-slate-800/30 border-stone-100/70 dark:border-slate-700/50';

    const currentRing = isCurrent
        ? tone === 'sahar'
            ? 'ring-2 ring-indigo-400/70 dark:ring-indigo-400/60 shadow-lg shadow-indigo-500/10'
            : tone === 'iftar'
                ? 'ring-2 ring-amber-400/70 dark:ring-amber-400/60 shadow-lg shadow-amber-500/10'
                : 'ring-2 ring-slate-400/60 dark:ring-slate-500/60 shadow-lg shadow-slate-500/10'
        : '';

    const checkColor = tone === 'sahar' ? '#5B6AD0' : tone === 'iftar' ? '#EF9F27' : '#1D9E75';
    const badgeColor = tone === 'sahar' ? '#5B6AD0' : tone === 'iftar' ? '#EF9F27' : '#64748B';

    // Arabic script rang — tone bilan mos
    const arabicColor =
        tone === 'sahar'
            ? 'text-indigo-400/70 dark:text-indigo-300/60'
            : tone === 'iftar'
                ? 'text-amber-500/70 dark:text-amber-300/60'
                : 'text-stone-400 dark:text-slate-500';

    // Time rang — current va done ga qarab
    const timeColor = isDone
        ? 'text-stone-500 dark:text-slate-400'
        : isCurrent
            ? tone === 'sahar'
                ? 'text-indigo-700 dark:text-indigo-200'
                : tone === 'iftar'
                    ? 'text-amber-700 dark:text-amber-200'
                    : 'text-stone-900 dark:text-slate-100'
            : 'text-stone-900 dark:text-slate-100';

    const rowInner = (
        <div className="flex items-center gap-3 min-w-0 flex-1">
            {canToggle ? (
                <motion.div whileTap={{ scale: 0.88 }} className="shrink-0 relative">
                    {/* Subtle glow behind checkmark when done */}
                    {isDone && (
                        <div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{
                                background: `radial-gradient(circle, ${checkColor}55 0%, transparent 70%)`,
                                filter: 'blur(6px)',
                                transform: 'scale(1.8)',
                            }}
                        />
                    )}
                    <div className="relative">
                        <CheckMark done={isDone} color={checkColor} size={22} />
                    </div>
                </motion.div>
            ) : (
                <div className="shrink-0 w-[22px] h-[22px] flex items-center justify-center">
                    <RIcon name="sunrise" size={16} color="#94A3B8" fill="rgba(148,163,184,0.2)" strokeWidth={2} />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <div
                        className={`text-[13px] font-extrabold leading-tight ${isDone
                            ? 'text-stone-500 dark:text-slate-400 line-through decoration-1'
                            : 'text-stone-900 dark:text-slate-100'
                            }`}
                    >
                        {label}
                    </div>
                    {isCurrent && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={SPRING}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                            style={{ background: badgeColor }}
                        >
                            <motion.div
                                className="w-1 h-1 rounded-full bg-white"
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                            />
                            <span className="text-white text-[8.5px] font-extrabold uppercase tracking-wider">{nowLabel}</span>
                        </motion.div>
                    )}
                </div>
                <div
                    className={`text-[10.5px] font-bold leading-none mt-0.5 ${arabicColor}`}
                    style={{ fontFamily: 'Amiri, "Noto Naskh Arabic", "Traditional Arabic", serif' }}
                >
                    {PRAYER_AR[prayerKey]}
                </div>
            </div>
            <div className={`text-base font-extrabold tabular-nums shrink-0 ml-2 ${timeColor}`}>
                {time}
            </div>
        </div>
    );

    if (!canToggle) {
        return (
            <div className={`flex items-center rounded-2xl px-3.5 py-2.5 border ${toneClasses} ${currentRing}`}>
                {rowInner}
            </div>
        );
    }

    return (
        <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onToggle}
            className={`w-full flex items-center rounded-2xl px-3.5 py-2.5 border transition-all ${toneClasses} ${currentRing}`}
        >
            {rowInner}
        </motion.button>
    );
}

// ─── Duas card (Sahar / Iftar tabs) ────────────────────
function DuasCard({ t, lang, defaultTab }: { t: (k: string) => string; lang: Lang; defaultTab: 'sahar' | 'iftar' }) {
    const [tab, setTab] = useState<'sahar' | 'iftar'>(defaultTab);
    const dua = DUAS[tab];
    const translation = dua.translations[lang] || dua.translations['uz-Latn'];

    const changeTab = (newTab: 'sahar' | 'iftar') => {
        if (newTab === tab) return;
        hapticSelection();
        setTab(newTab);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.1 }}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-0 relative overflow-hidden"
            style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
        >
            <div
                className="absolute -top-8 -right-8 opacity-[0.04] dark:opacity-[0.06] select-none pointer-events-none"
                aria-hidden
            >
                <RIcon name="book" size={130} color="#1D9E75" fill="#1D9E75" strokeWidth={1.5} />
            </div>

            {/* Header row — title alone */}
            <div className="flex items-center gap-1.5 mb-3 relative">
                <RIcon name="book" size={14} color="#1D9E75" fill="rgba(29,158,117,0.25)" strokeWidth={2} />
                <h2 className="text-stone-900 dark:text-slate-100 text-sm font-extrabold uppercase tracking-wider">
                    {t('ram_duas_title')}
                </h2>
            </div>

            {/* Tabs row — full-width, flex-1 each */}
            <div className="flex bg-stone-100 dark:bg-slate-800/70 rounded-full p-1 relative mb-4">
                <motion.div
                    layout
                    transition={SPRING}
                    className="absolute inset-y-1 rounded-full bg-white dark:bg-[#2A3340]"
                    style={{
                        left: tab === 'sahar' ? '4px' : '50%',
                        width: 'calc(50% - 4px)',
                        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.2)',
                    }}
                />
                <button
                    onClick={() => changeTab('sahar')}
                    className={`relative flex-1 py-2 rounded-full text-[11.5px] font-extrabold uppercase tracking-wider transition-colors ${tab === 'sahar'
                        ? 'text-indigo-600 dark:text-indigo-300'
                        : 'text-stone-500 dark:text-slate-400'
                        }`}
                >
                    🌙 {t('ram_dua_sahar')}
                </button>
                <button
                    onClick={() => changeTab('iftar')}
                    className={`relative flex-1 py-2 rounded-full text-[11.5px] font-extrabold uppercase tracking-wider transition-colors ${tab === 'iftar'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-stone-500 dark:text-slate-400'
                        }`}
                >
                    🌅 {t('ram_dua_iftar')}
                </button>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="relative"
                >
                    <div
                        className="rounded-2xl p-4 mb-3 relative overflow-hidden"
                        style={{
                            background:
                                tab === 'sahar'
                                    ? 'linear-gradient(135deg, rgba(91,106,208,0.10) 0%, rgba(91,106,208,0.03) 100%)'
                                    : 'linear-gradient(135deg, rgba(239,159,39,0.10) 0%, rgba(239,159,39,0.03) 100%)',
                        }}
                    >
                        {/* Subtle inner glow at top */}
                        <div
                            className="absolute -top-6 left-1/2 -translate-x-1/2 w-40 h-8 rounded-full pointer-events-none"
                            style={{
                                background:
                                    tab === 'sahar'
                                        ? 'radial-gradient(ellipse, rgba(91,106,208,0.35) 0%, transparent 70%)'
                                        : 'radial-gradient(ellipse, rgba(239,159,39,0.35) 0%, transparent 70%)',
                                filter: 'blur(12px)',
                            }}
                        />
                        <div
                            className="relative text-stone-900 dark:text-slate-100 text-[22px] leading-relaxed font-bold text-center"
                            dir="rtl"
                            style={{ fontFamily: 'Amiri, "Noto Naskh Arabic", "Traditional Arabic", serif' }}
                        >
                            {dua.arabic}
                        </div>
                    </div>
                    <div className="text-stone-600 dark:text-slate-400 text-[12px] font-semibold italic text-center leading-relaxed mb-2.5 px-2">
                        {dua.translit}
                    </div>
                    <div className="h-px bg-stone-100 dark:bg-slate-800/70 mx-4 mb-3" />
                    <div className="text-stone-700 dark:text-slate-300 text-[13px] font-semibold leading-relaxed text-center px-1">
                        {translation}
                    </div>
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}