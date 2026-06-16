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
            <span className="text-sm">📍</span>
            <span className="text-stone-800 dark:text-slate-200 text-[12px] font-extrabold whitespace-nowrap">{region.name}</span>
            <span className="text-stone-400 dark:text-slate-500 text-[10px]">▼</span>
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
                <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-4" />
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
                                {active && <span className="text-sm">✓</span>}
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
                <div className="absolute -top-6 -right-6 text-[140px] opacity-10 select-none leading-none">🌙</div>
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
                        <span className="text-sm">🔒</span>
                        <span className="text-stone-600 text-xs font-extrabold uppercase tracking-wider">{t('ram_locked_badge')}</span>
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
                    <FeatureRow icon="🌅" label={`${region.name} ${t('ram_feat_countdown')}`} />
                    <FeatureRow icon="🕌" label={`${region.name} ${t('ram_feat_prayer')}`} />
                    <FeatureRow icon="⏱️" label={t('ram_feat_timer')} />
                    <FeatureRow icon="💡" label={t('ram_feat_tips')} />
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
                <div className="absolute -top-4 -right-4 text-8xl opacity-15 select-none">{isFasting ? '🌙' : '🌅'}</div>
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
            <div className="text-stone-800 dark:text-slate-200 text-[13px] font-extrabold">{label}</div>
            <div className="text-stone-900 dark:text-slate-100 text-base font-extrabold tabular-nums">{time}</div>
        </div>
    );
}

function FeatureRow({ icon, label }: { icon: string; label: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--color-input-bg)' }}>
            <span className="text-xl">{icon}</span>
            <span className=" text-stone-700 dark:text-slate-300 text-[13px] font-bold">{label}</span>
        </div>
    );
}