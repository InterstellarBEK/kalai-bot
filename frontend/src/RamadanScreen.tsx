import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getPrayerTimes,
    getRamadanStatus,
    formatCountdown,
    getNextRamadan,
    getDaysUntilRamadan,
    getSelectedRegion,
    setSelectedRegion,
    UZ_REGIONS,
    type RamadanStatus,
    type PrayerTimes,
    type Region,
} from './ramadan';
import Bekjon from './components/Bekjon';
import { useTranslation, type Lang } from './i18n';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

const MONTHS: Record<Lang, string[]> = {
    'uz-Latn': ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
    'uz-Cyrl': ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
    'ru': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    'en': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

// ── Iconly-style SVG icons ────────────────────────────────
type RIconName = 'pin' | 'chevronDown' | 'check' | 'moon' | 'lock' | 'sunrise' | 'mosque' | 'timer' | 'bulb';

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
    }
}

function formatDate(iso: string, lang: Lang): string {
    const [y, m, d] = iso.split('-').map(Number);
    const month = MONTHS[lang][m - 1];
    if (lang === 'en') return `${month} ${d}, ${y}`;
    return `${d} ${month} ${y}`;
}

export default function RamadanScreen() {
    const { t, lang } = useTranslation();
    const [status, setStatus] = useState<RamadanStatus | null>(null);
    const [allTimes, setAllTimes] = useState<PrayerTimes | null>(null);
    const [region, setRegion] = useState<Region>(getSelectedRegion());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [, setTick] = useState(0);

    useEffect(() => {
        refresh();
        const id = setInterval(() => setTick((tk) => tk + 1), 1000);
        return () => clearInterval(id);
    }, [region]);

    async function refresh() {
        try {
            const s = await getRamadanStatus();
            setStatus(s);
            if (s.isRamadan) setAllTimes(await getPrayerTimes(new Date(), region));
            else setAllTimes(null);
        } catch {
            setStatus(null);
        }
    }

    function selectRegion(r: Region) {
        setSelectedRegion(r.id);
        setRegion(r);
        setPickerOpen(false);
    }

    if (!status) {
        return (
            <div className="min-h-screen pb-28 flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-stone-400 dark:text-slate-500 font-bold text-sm">{t('loading')}</div>
            </div>
        );
    }

    const isLocked = !status.isRamadan;

    return (
        <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
            <div className="max-w-md mx-auto px-5 pt-7">
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">{t('ram_title')}</h1>
                        <p className="text-[13px] text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                            {isLocked ? t('ram_sub_locked') : t('ram_sub_active')}
                        </p>
                    </div>
                    <RegionChip region={region} onClick={() => setPickerOpen(true)} />
                </motion.div>

                {isLocked ? (
                    <LockedView region={region} lang={lang} t={t} />
                ) : (
                    <ActiveView status={status} allTimes={allTimes} region={region} t={t} />
                )}
            </div>

            <AnimatePresence>
                {pickerOpen && (
                    <RegionPicker selected={region.id} onSelect={selectRegion} onClose={() => setPickerOpen(false)} t={t} />
                )}
            </AnimatePresence>
        </div>
    );
}

function RegionChip({ region, onClick }: { region: Region; onClick: () => void }) {
    return (
        <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onClick}
            className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] rounded-2xl px-3 py-2"
            style={{ boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.15)' }}
        >
            <RIcon name="pin" size={14} color="#5B6AD0" fill="rgba(91, 106, 208, 0.2)" strokeWidth={2} />
            <span className="text-stone-800 dark:text-slate-200 text-[12px] font-extrabold whitespace-nowrap">{region.name}</span>
            <RIcon name="chevronDown" size={12} color="#94A3B8" strokeWidth={2.4} />
        </motion.button>
    );
}

function RegionPicker({ selected, onSelect, onClose, t }: { selected: string; onSelect: (r: Region) => void; onClose: () => void; t: (k: string) => string }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.4)' }}
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
                                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-colors"
                                style={{
                                    background: active ? '#5B6AD0' : '#F3F4F8',
                                    color: active ? '#fff' : '#1F2937',
                                }}
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

function LockedView({ region, lang, t }: { region: Region; lang: Lang; t: (k: string) => string }) {
    const next = getNextRamadan();
    const days = getDaysUntilRamadan();

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="rounded-[1.75rem] p-6 mb-4 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, #3D4FAA 0%, #5B6AD0 100%)',
                    boxShadow: '0 10px 28px -10px rgba(91, 106, 208, 0.45)',
                }}
            >
                <div className="absolute -top-6 -right-6 opacity-10 select-none">
                    <RIcon name="moon" size={140} color="#ffffff" fill="#ffffff" strokeWidth={1.5} />
                </div>
                <div className="relative">
                    <div className="text-white/80 text-[11px] font-extrabold uppercase tracking-wider mb-2">{t('ram_days_until')}</div>
                    <div className="text-white text-[64px] font-extrabold tabular-nums leading-none">{days}</div>
                    <div className="text-white/90 text-sm font-extrabold mt-1">{t('ram_days_unit')}</div>
                    {next && (
                        <div className="mt-4 inline-block bg-white dark:bg-[#1E252E]/15 backdrop-blur rounded-xl px-3 py-2">
                            <div className="text-white/70 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_starts')}</div>
                            <div className="text-white text-sm font-extrabold">{formatDate(next.start, lang)}</div>
                        </div>
                    )}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.05 }}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-6 mb-4"
                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
            >
                <div className="flex flex-col items-center text-center">
                    <div style={{ filter: 'grayscale(0.6) opacity(0.7)' }}>
                        <Bekjon mood="sleeping" size={90} />
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'var(--color-input-bg)' }}>
                        <RIcon name="lock" size={12} color="#78716C" strokeWidth={2} />
                        <span className="text-stone-600 dark:text-slate-300 text-xs font-extrabold uppercase tracking-wider">{t('ram_locked_badge')}</span>
                    </div>
                    <div className="text-stone-900 dark:text-slate-100 font-extrabold text-base mt-3">{t('ram_locked_title')}</div>
                    <div className="text-stone-500 dark:text-slate-400 text-[13px] font-semibold mt-1 leading-relaxed max-w-[280px]">
                        {t('ram_locked_desc')}
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.1 }}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
            >
                <h2 className="text-stone-900 dark:text-slate-100 text-sm font-extrabold uppercase tracking-wider mb-3">{t('ram_what')}</h2>
                <div className="space-y-2.5">
                    <FeatureRow icon="sunrise" color="#EF9F27" label={`${region.name} ${t('ram_feat_countdown')}`} />
                    <FeatureRow icon="mosque" color="#5B6AD0" label={`${region.name} ${t('ram_feat_prayer')}`} />
                    <FeatureRow icon="timer" color="#1D9E75" label={t('ram_feat_timer')} />
                    <FeatureRow icon="bulb" color="#EF9F27" label={t('ram_feat_tips')} />
                </div>
            </motion.div>
        </>
    );
}

function ActiveView({ status, allTimes, region, t }: { status: RamadanStatus; allTimes: PrayerTimes | null; region: Region; t: (k: string) => string }) {
    const seconds = status.nextEventTime
        ? Math.max(0, Math.floor((status.nextEventTime.getTime() - Date.now()) / 1000))
        : 0;
    const isFasting = status.isFasting;
    const label = status.nextEventLabel === 'iftar' ? t('ram_until_iftar') : t('ram_until_sahar');

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="rounded-[1.75rem] p-6 mb-4 relative overflow-hidden"
                style={{
                    background: isFasting
                        ? 'linear-gradient(135deg, #3D4FAA 0%, #5B6AD0 100%)'
                        : 'linear-gradient(135deg, #F59E0B 0%, #FBA85B 100%)',
                    boxShadow: '0 10px 28px -10px rgba(91, 106, 208, 0.45)',
                }}
            >
                <div className="absolute -top-4 -right-4 opacity-15 select-none">
                    <RIcon
                        name={isFasting ? 'moon' : 'sunrise'}
                        size={100}
                        color="#ffffff"
                        fill="#ffffff"
                        strokeWidth={1.5}
                    />
                </div>
                <div className="relative">
                    <div className="text-white/80 text-[12px] font-bold mb-1">{label}</div>
                    <div className="text-white text-[44px] font-extrabold tabular-nums leading-none mb-4">
                        {formatCountdown(seconds)}
                    </div>
                    <div className="flex gap-2">
                        {status.fajrTime && (
                            <div className="bg-white dark:bg-[#1E252E]/15 backdrop-blur rounded-xl px-3 py-2 flex-1">
                                <div className="text-white/70 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_fajr_ends')}</div>
                                <div className="text-white text-base font-extrabold tabular-nums">{status.fajrTime.toTimeString().slice(0, 5)}</div>
                            </div>
                        )}
                        {status.maghribTime && (
                            <div className="bg-white dark:bg-[#1E252E]/15 backdrop-blur rounded-xl px-3 py-2 flex-1">
                                <div className="text-white/70 text-[9px] font-extrabold uppercase tracking-wider">{t('ram_iftar')}</div>
                                <div className="text-white text-base font-extrabold tabular-nums">{status.maghribTime.toTimeString().slice(0, 5)}</div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {allTimes && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.05 }}
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <h2 className="text-stone-900 dark:text-slate-100 text-sm font-extrabold uppercase tracking-wider mb-3">{t('ram_today_times')}</h2>
                    <div className="space-y-2">
                        <PrayerRow label={t('ram_prayer_fajr')} time={allTimes.fajr} highlight="sahar" />
                        <PrayerRow label={t('ram_prayer_sunrise')} time={allTimes.sunrise} />
                        <PrayerRow label={t('ram_prayer_dhuhr')} time={allTimes.dhuhr} />
                        <PrayerRow label={t('ram_prayer_asr')} time={allTimes.asr} />
                        <PrayerRow label={t('ram_prayer_maghrib')} time={allTimes.maghrib} highlight="iftar" />
                        <PrayerRow label={t('ram_prayer_isha')} time={allTimes.isha} />
                    </div>
                    <div className="text-[10px] text-stone-400 dark:text-slate-500 font-bold text-center mt-3">{region.name} · {t('ram_madhab')}</div>
                </motion.div>
            )}

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.1 }}
                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
            >
                <h2 className="text-stone-900 dark:text-slate-100 text-sm font-extrabold uppercase tracking-wider mb-3">{t('ram_tip_title')}</h2>
                <div className=" text-stone-700 dark:text-slate-300 text-[13px] font-semibold leading-relaxed">
                    {isFasting ? t('ram_tip_fasting') : t('ram_tip_eating')}
                </div>
            </motion.div>
        </>
    );
}

function PrayerRow({ label, time, highlight }: { label: string; time: string; highlight?: 'sahar' | 'iftar' }) {
    const bg = highlight === 'iftar' ? '#FFF4D6' : highlight === 'sahar' ? '#DDE3F5' : '#F3F4F8';
    return (
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: bg }}>
            <div className="text-stone-800 text-[13px] font-extrabold">{label}</div>
            <div className="text-stone-900 text-base font-extrabold tabular-nums">{time}</div>
        </div>
    );
}

function FeatureRow({ icon, color, label }: { icon: RIconName; color: string; label: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--color-input-bg)' }}>
            <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: color + '22' }}
            >
                <RIcon name={icon} size={18} color={color} fill={color + '33'} strokeWidth={2} />
            </div>
            <span className=" text-stone-700 dark:text-slate-300 text-[13px] font-bold">{label}</span>
        </div>
    );
}