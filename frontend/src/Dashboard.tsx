import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';
import { getTelegramId } from './telegram';
import { getSkinById } from './skins';
import Bekjon from './components/Bekjon';
import type { BekjonMood } from './components/Bekjon';
import SkinShop from './SkinShop';
import { WaterTracker } from './WaterTracker';
import { WeightTracker } from './WeightTracker';
import ChallengesCard from './ChallengesCard';
import { FastingTracker } from './FastingTracker';
import { AchievementsScreen } from './AchievementsScreen';
import { checkAndUnlock } from './achievements';
import { useTranslation } from './i18n';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

export default function Dashboard() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<any[]>([]);
    const [target, setTarget] = useState(2000);
    const [streak, setStreak] = useState(0);
    const [coins, setCoins] = useState(0);
    const [equippedSkinId, setEquippedSkinId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [showShop, setShowShop] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);
    const [newAch, setNewAch] = useState<string | null>(null);
    const telegramId = getTelegramId();

    useEffect(() => {
        loadToday();
        loadUser();
        checkAndUnlock(getTelegramId()).then(newOnes => {
            if (newOnes.length > 0) {
                setNewAch(`${newOnes[0].icon} ${newOnes[0].title} ${t('ach_unlocked')}`);
                setTimeout(() => setNewAch(null), 4000);
                loadUser();
            }
        });
    }, []);

    async function loadUser() {
        const { data } = await supabase
            .from('users')
            .select('daily_calories_goal, current_streak, first_name, coins, equipped_skin')
            .eq('telegram_id', getTelegramId())
            .single();
        if (data?.daily_calories_goal) setTarget(data.daily_calories_goal);
        if (data?.current_streak !== undefined) setStreak(data.current_streak);
        if (data?.coins !== undefined) setCoins(data.coins);
        if (data?.first_name) setName(data.first_name);
        setEquippedSkinId(data?.equipped_skin || null);
    }

    async function loadToday() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from('food_logs')
            .select('*')
            .eq('user_id', getTelegramId())
            .gte('logged_at', start.toISOString())
            .order('logged_at', { ascending: false });
        if (error) {
            alert(t('error_prefix') + error.message);
            return;
        }
        setLogs(data || []);
    }

    async function deleteLog(id: number) {
        if (!confirm(t('confirm_delete'))) return;
        const { error } = await supabase.from('food_logs').delete().eq('id', id);
        if (error) alert(t('error_prefix') + error.message);
        else loadToday();
    }

    const total = logs.reduce(
        (acc, l) => ({
            calories: acc.calories + Number(l.calories || 0),
            protein: acc.protein + Number(l.protein || 0),
            fat: acc.fat + Number(l.fat || 0),
            carbs: acc.carbs + Number(l.carbs || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    const proteinTarget = Math.round((target * 0.30) / 4);
    const fatTarget = Math.round((target * 0.25) / 9);
    const carbsTarget = Math.round((target * 0.45) / 4);

    const rawPercent = (total.calories / target) * 100;
    const percent = Math.min(100, Math.round(rawPercent));
    const remaining = Math.max(0, target - Math.round(total.calories));
    const over = Math.max(0, Math.round(total.calories) - target);

    void getSkinById(equippedSkinId);

    const bekjonMood: BekjonMood = (() => {
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 6) return 'sleeping';
        if (rawPercent > 110) return 'sport';
        if (rawPercent >= 90) return 'celebration';
        if (rawPercent >= 40) return 'happy';
        return 'hungry';
    })();

    const bekjonMessage = ({
        sleeping: t('msg_sleeping'),
        celebration: t('msg_celebration'),
        sport: t('msg_sport'),
        happy: t('msg_happy'),
        hungry: t('msg_hungry'),
    } as Record<BekjonMood, string>)[bekjonMood];

    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const strokeOffset = circumference - (percent / 100) * circumference;

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 6) return t('greeting_night');
        if (h < 12) return t('greeting_morning');
        if (h < 18) return t('greeting_day');
        return t('greeting_evening');
    })();

    return (
        <>
            <div
                className="min-h-screen pb-28 bg-[#ECEEF5] dark:bg-[#0F1419]"
                style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
            >
                <div className="max-w-md mx-auto px-5 pt-7">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={SPRING}
                        className="flex items-center justify-between mb-5"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-stone-500 dark:text-slate-400 font-medium">{greeting}</div>
                            <div className="text-[22px] text-stone-900 dark:text-slate-100 font-extrabold mt-0.5 leading-tight truncate">
                                {name || t('welcome')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={() => setShowShop(true)}
                                className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                                style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                            >
                                <span className="text-base">🪙</span>
                                <span className="text-sm font-extrabold text-stone-800 dark:text-slate-200">{coins}</span>
                            </motion.button>
                            <motion.div
                                whileTap={{ scale: 0.92 }}
                                className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                                style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                            >
                                <span className="text-base">🔥</span>
                                <span className="text-sm font-extrabold text-stone-800 dark:text-slate-200">{streak}</span>
                            </motion.div>
                        </div>
                    </motion.div>
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setShowAchievements(true)}
                        className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                        style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                    >
                        <span className="text-base">🏆</span>
                    </motion.button>

                    {/* Hero card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.05 }}
                        className="bg-white dark:bg-[#1E252E] dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                        style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}
                    >
                        <div className="flex items-center gap-4">
                            <div className="relative flex-shrink-0">
                                <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90">
                                    <circle cx="85" cy="85" r={radius} stroke="var(--color-bg)" strokeWidth="9" fill="none" />
                                    <motion.circle
                                        cx="85"
                                        cy="85"
                                        r={radius}
                                        stroke="#5B6AD0"
                                        strokeWidth="9"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeDasharray={circumference}
                                        initial={{ strokeDashoffset: circumference }}
                                        animate={{ strokeDashoffset: strokeOffset }}
                                        transition={{ duration: 1, ease: EASE_BACK }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Bekjon mood={bekjonMood} size={110} />
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="text-[40px] font-extrabold text-stone-900 dark:text-slate-100 leading-none">
                                    {Math.round(total.calories)}
                                </div>
                                <div className="text-xs text-stone-400 dark:text-slate-500 font-semibold mt-1">/ {target} kcal</div>
                                <div className="text-[13px] text-stone-600 dark:text-slate-300 font-mediummt-3 leading-snug">
                                    {bekjonMessage}
                                </div>
                                {remaining > 0 && (
                                    <div
                                        className="inline-block mt-2 px-2.5 py-1 rounded-full text-[11px] font-extrabold"
                                        style={{ background: '#E8F5E9', color: '#1D9E75' }}
                                    >
                                        +{remaining} kcal
                                    </div>
                                )}
                                {over > 0 && (
                                    <div
                                        className="inline-block mt-2 px-2.5 py-1 rounded-full text-[11px] font-extrabold"
                                        style={{ background: '#FCE4E4', color: '#DC2626' }}
                                    >
                                        +{over} kcal
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Section title */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.12 }}
                        className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200 dark:text-slate-200  dark:text-slate-200  mt-6 mb-3 px-1"
                    >
                        {t('today_balance')}
                    </motion.div>

                    {/* Macros */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <MacroCard label={t('macro_protein')} icon="🥩" value={total.protein} target={proteinTarget} bg="#FFF4D6" delay={0.14} />
                        <MacroCard label={t('macro_fat')} icon="🥑" value={total.fat} target={fatTarget} bg="#FAD9C8" delay={0.18} />
                        <MacroCard label={t('macro_carbs')} icon="🍞" value={total.carbs} target={carbsTarget} bg="#DDE3F5" delay={0.22} />
                    </div>

                    {/* Water tracker */}
                    <div className="mt-2.5">
                        <WaterTracker />
                    </div>

                    {/* Weight tracker */}
                    <div className="mt-2.5">
                        <WeightTracker />
                    </div>

                    {/* Daily challenges */}
                    <div className="mt-2.5">
                        <ChallengesCard onClaim={loadUser} />
                    </div>

                    {/* Fasting tracker */}
                    {telegramId && (
                        <div className="mt-2.5">
                            <FastingTracker telegramId={telegramId} />
                        </div>
                    )}

                    {/* Today's foods */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.30 }}
                        className="mt-6"
                    >
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200 dark:text-slate-200  dark:text-slate-200 ">{t('today_meals')}</h3>
                            <span className="text-xs text-stone-500 dark:text-slate-400 font-bold">
                                {logs.length} {t('logs_count_suffix')}
                            </span>
                        </div>

                        {logs.length === 0 ? (
                            <div className="bg-white dark:bg-[#1E252E] dark:bg-[#1E252E] rounded-2xl p-8 text-center">
                                <div className="text-3xl mb-2">🍽️</div>
                                <div className="text-sm text-stone-500 dark:text-slate-400 font-semibold">{t('no_meals')}</div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {logs.map((l, idx) => (
                                    <motion.div
                                        key={l.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ ...SPRING, delay: 0.32 + idx * 0.05 }}
                                        className="bg-white dark:bg-[#1E252E] dark:bg-[#1E252E] rounded-2xl p-3.5 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div
                                                className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                                                style={{ background: 'var(--color-bg)' }}
                                            >
                                                🍲
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-extrabold text-stone-900 dark:text-slate-100 truncate capitalize text-[15px]">
                                                    {l.food_name}
                                                </div>
                                                <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5 font-semibold">
                                                    {Math.round(l.calories)} kcal · {Math.round(l.protein || 0)}g {t('protein_label')}
                                                </div>
                                            </div>
                                        </div>
                                        <motion.button
                                            whileTap={{ scale: 0.85 }}
                                            onClick={() => deleteLog(l.id)}
                                            className="ml-2 w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors flex-shrink-0 font-bold"
                                        >
                                            ✕
                                        </motion.button>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>

            <AnimatePresence>
                {showShop && (
                    <SkinShop
                        onClose={() => {
                            setShowShop(false);
                            loadUser();
                        }}
                    />
                )}<AnimatePresence>
                    {showAchievements && (
                        <motion.div
                            initial={{ opacity: 0, x: '100%' }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: '100%' }}
                            transition={SPRING}
                            className="fixed inset-0 z-50 bg-[#ECEEF5] dark:bg-[#0F1419] overflow-y-auto"
                        >
                            <AchievementsScreen onBack={() => setShowAchievements(false)} />
                        </motion.div>
                    )}
                    {newAch && (
                        <motion.div
                            initial={{ opacity: 0, y: -30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -30 }}
                            className="fixed top-5 left-1/2 -translate-x-1/2 bg-[#5B6AD0] text-white px-5 py-3 rounded-2xl font-bold z-[60] shadow-lg"
                        >
                            {newAch}
                        </motion.div>
                    )}
                </AnimatePresence>
            </AnimatePresence>
        </>
    );
}

function MacroCard({ label, icon, value, target, bg, delay }: {
    label: string; icon: string; value: number; target: number; bg: string; delay: number;
}) {
    const percent = Math.min(100, (value / target) * 100);
    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26, delay }}
            whileTap={{ scale: 0.96 }}
            className="rounded-[1.25rem] p-3.5"
            style={{ background: bg }}
        >
            <div className="flex items-center justify-between mb-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white">
                    <span className="text-sm">{icon}</span>
                </div>
                <span className="text-[9px] font-extrabold  text-[#44403c] uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-xl font-extrabold text-[#1c1917] mt-2">
                {Math.round(value)}
                <span className="text-xs text-[#78716c] font-semibold ml-0.5">/{target}g</span>
            </div>
            <div className="h-1.5 bg-white/70 rounded-full mt-2 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: EASE_BACK, delay: delay + 0.2 }}
                    className="h-full bg-stone-700 rounded-full"
                />
            </div>
        </motion.div>
    );
}