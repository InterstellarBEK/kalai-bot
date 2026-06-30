// src/Dashboard.tsx
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';
import { getTelegramId, showAlert, showPopup } from './telegram';
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
import QuickAddCard from './QuickAddCard';
import MealBreakdownCard from './MealBreakdownCard';

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

const MEAL_EMOJI: Record<MealKey, string> = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌆',
    snack: '🌙',
};

// ===== Premium SVG ikonlar (Iconly uslubi) =====
type IconName = 'coin' | 'flame' | 'trophy' | 'protein' | 'fat' | 'carbs' | 'utensils' | 'bowl' | 'search';

function DIcon({ name, size = 18, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: 1.9,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    switch (name) {
        case 'coin':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" fill={color} fillOpacity="0.18" />
                    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
                    <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.2" strokeOpacity="0.45" />
                    <path
                        d="M12 8v8M14.2 10.2c0-.9-1-1.5-2.2-1.5s-2.2.6-2.2 1.5c0 1.9 4.4 1 4.4 3 0 .9-1 1.5-2.2 1.5s-2.2-.7-2.2-1.6"
                        stroke={color}
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            );
        case 'flame':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 2.5c.8 3.2 4.5 4.8 4.5 9 0 3.6-2 6.5-4.5 6.5S7.5 15.1 7.5 11.5c0-1.3.6-2.3 1.3-3.1-.4 1.6.2 2.8 1 3.3-.5-2 .6-4.1 2.2-9.2z"
                        fill={color}
                        fillOpacity="0.2"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M12 13c1.1 1.1 1.7 2 1.7 3 0 1-.8 1.7-1.7 1.7s-1.7-.7-1.7-1.7c0-1 .6-1.9 1.7-3z"
                        fill={color}
                    />
                    <path
                        d="M10.5 19.5c0 1.4 0.7 2 1.5 2s1.5-.6 1.5-2"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            );
        case 'trophy':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M7 3.5h10v6.5a5 5 0 0 1-10 0V3.5z"
                        fill={color}
                        fillOpacity="0.2"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M7 5.5H4.8a1.5 1.5 0 0 0 0 3c.5 1.4 1.4 2.4 2.4 3"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                    <path
                        d="M17 5.5h2.2a1.5 1.5 0 0 1 0 3c-.5 1.4-1.4 2.4-2.4 3"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                    <path
                        d="M10 15h4l-.4 3h-3.2L10 15z"
                        fill={color}
                        fillOpacity="0.3"
                        stroke={color}
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                    />
                    <path d="M7.5 20.5h9" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
                    <path
                        d="M12 5.5l.75 1.6 1.75.2-1.3 1.25.35 1.7L12 9.4l-1.55.85.35-1.7L9.5 7.3l1.75-.2L12 5.5z"
                        fill={color}
                    />
                </svg>
            );
        case 'protein':
            return (
                <svg {...common}>
                    <path d="M15.5 4.5a4.5 4.5 0 0 0-7 5.5L4 14.5a2 2 0 1 0 2.5 2.5l1-1 1 1 1-1 4.5-4.5a4.5 4.5 0 0 0 1.5-7z" />
                </svg>
            );
        case 'fat':
            return (
                <svg {...common}>
                    <path d="M12 3c-3 4-6 7-6 10.5a6 6 0 0 0 12 0C18 10 15 7 12 3z" />
                </svg>
            );
        case 'carbs':
            return (
                <svg {...common}>
                    <path d="M12 21V8" />
                    <path d="M12 8c0-2.5 2-4.5 4.5-4.5C16.5 6 14.5 8 12 8z" />
                    <path d="M12 8c0-2.5-2-4.5-4.5-4.5C7.5 6 9.5 8 12 8z" />
                    <path d="M12 13c0-2 2-3.5 4-3.5 0 2-2 3.5-4 3.5z" />
                    <path d="M12 13c0-2-2-3.5-4-3.5 0 2 2 3.5 4 3.5z" />
                    <path d="M12 18c0-2 2-3.5 4-3.5 0 2-2 3.5-4 3.5z" />
                    <path d="M12 18c0-2-2-3.5-4-3.5 0 2 2 3.5 4 3.5z" />
                </svg>
            );
        case 'utensils':
            return (
                <svg {...common}>
                    <path d="M7 3v8a2 2 0 0 0 2 2v8" />
                    <path d="M11 3v8" />
                    <path d="M9 3v6" />
                    <path d="M17 3c-1.5 0-3 2-3 5s1.5 4 3 4v9" />
                </svg>
            );
        case 'bowl':
            return (
                <svg {...common}>
                    <path d="M3 11h18" />
                    <path d="M4 11a8 8 0 0 0 16 0" />
                    <path d="M9 7c0-1 1-2 1-2s-1-1-1-2" />
                    <path d="M13 7c0-1 1-2 1-2s-1-1-1-2" />
                </svg>
            );
        case 'search':
            return (
                <svg {...common}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                </svg>
            );
    }
}

export default function Dashboard() {
    const { t, lang } = useTranslation();
    const [logs, setLogs] = useState<any[]>([]);
    const [target, setTarget] = useState(2000);
    const [streak, setStreak] = useState(0);
    const [coins, setCoins] = useState(0);
    const [equippedSkinId, setEquippedSkinId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [showShop, setShowShop] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);
    const [newAch, setNewAch] = useState<string | null>(null);
    const [mealHint, setMealHint] = useState<MealKey | null>(null);
    const telegramId = getTelegramId();
    const quickAddRef = useRef<HTMLDivElement>(null);
    const hintTimerRef = useRef<number | null>(null);

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
        return () => {
            if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
        };
    }, []);

    // FoodSearch'dan yangi log qo'shilsa Dashboard'ni darhol yangilash
    useEffect(() => {
        function handleLogAdded() {
            loadToday();
            loadUser();
            // Yangi achievement ochilishi mumkin (masalan 50-log, streak)
            checkAndUnlock(getTelegramId()).then(newOnes => {
                if (newOnes.length > 0) {
                    setNewAch(`${newOnes[0].icon} ${newOnes[0].title} ${t('ach_unlocked')}`);
                    setTimeout(() => setNewAch(null), 4000);
                    loadUser();
                }
            });
        }
        window.addEventListener('lokma:log-added', handleLogAdded);
        return () => window.removeEventListener('lokma:log-added', handleLogAdded);
    }, []);

    // Empty meal card tap qilinsa
    function handleAddMeal(meal: MealKey) {
        // Haptic
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.notificationOccurred?.('success');

        // Hint banner ko'rsatish
        setMealHint(meal);
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = window.setTimeout(() => setMealHint(null), 4500);

        // Smooth scroll QuickAddCard'ga
        setTimeout(() => {
            quickAddRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    // Search tabga o'tish (App.tsx event listener bilan keyingi qadamda ulanadi)
    function openSearchTab(meal: MealKey) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.impactOccurred?.('medium');
        window.dispatchEvent(new CustomEvent('lokma:open-search', { detail: { mealType: meal } }));
        setMealHint(null);
    }

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
            await showAlert(t('error_prefix') + error.message);
            return;
        }
        setLogs(data || []);
    }

    async function deleteLog(id: number) {
        const pressed = await showPopup({
            message: t('confirm_delete'),
            buttons: [
                { id: 'cancel', type: 'cancel', text: t('btn_cancel') },
                { id: 'delete', type: 'destructive', text: t('btn_delete') },
            ],
        });
        if (pressed !== 'delete') return;
        const { error } = await supabase.from('food_logs').delete().eq('id', id);
        if (error) await showAlert(t('error_prefix') + error.message);
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

    // Hint banner label
    const hintLabel = (() => {
        if (!mealHint) return '';
        const map = {
            'uz-Latn': { breakfast: 'Nonushta', lunch: 'Tushlik', dinner: 'Kechki ovqat', snack: 'Tamaddi' },
            'uz-Cyrl': { breakfast: 'Нонушта', lunch: 'Тушлик', dinner: 'Кечки овқат', snack: 'Тамадди' },
            ru: { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' },
            en: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' },
        } as Record<string, Record<MealKey, string>>;
        return (map[lang] || map['uz-Latn'])[mealHint];
    })();

    const hintMessage = (() => {
        if (!mealHint) return '';
        const msg = ({
            'uz-Latn': `${hintLabel} uchun ovqat tanlang`,
            'uz-Cyrl': `${hintLabel} учун овқат танланг`,
            ru: `Выберите еду для: ${hintLabel}`,
            en: `Pick a food for ${hintLabel}`,
        } as Record<string, string>)[lang];
        return msg || `${hintLabel} uchun ovqat tanlang`;
    })();

    const searchCta = (
        {
            'uz-Latn': 'Qidirish',
            'uz-Cyrl': 'Қидириш',
            ru: 'Найти',
            en: 'Search',
        } as Record<string, string>
    )[lang] || 'Qidirish';

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
                        className="flex items-center justify-between mb-5 gap-3"
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
                                <span className="text-[#F59E0B]"><DIcon name="coin" size={18} /></span>
                                <span className="text-sm font-extrabold text-stone-800 dark:text-slate-200">{coins}</span>
                            </motion.button>
                            <motion.div
                                whileTap={{ scale: 0.92 }}
                                className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                                style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                            >
                                <span className="text-[#EF4444]"><DIcon name="flame" size={18} /></span>
                                <span className="text-sm font-extrabold text-stone-800 dark:text-slate-200">{streak}</span>
                            </motion.div>
                            <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={() => setShowAchievements(true)}
                                className="flex items-center justify-center bg-white dark:bg-[#1E252E] w-11 h-11 rounded-2xl"
                                style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                                aria-label="Achievements"
                            >
                                <span className="text-[#F59E0B]"><DIcon name="trophy" size={18} /></span>
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Hero card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.05 }}
                        className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
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
                                <div className="text-[13px] text-stone-600 dark:text-slate-300 font-medium mt-3 leading-snug">
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
                        className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200 mt-6 mb-3 px-1"
                    >
                        {t('today_balance')}
                    </motion.div>

                    {/* Macros */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <MacroCard label={t('macro_protein')} iconName="protein" iconColor="#B45309" value={total.protein} target={proteinTarget} bg="#FFF4D6" delay={0.14} />
                        <MacroCard label={t('macro_fat')} iconName="fat" iconColor="#C2410C" value={total.fat} target={fatTarget} bg="#FAD9C8" delay={0.18} />
                        <MacroCard label={t('macro_carbs')} iconName="carbs" iconColor="#3730A3" value={total.carbs} target={carbsTarget} bg="#DDE3F5" delay={0.22} />
                    </div>

                    {/* Mealtime breakdown — 4 segment */}
                    <MealBreakdownCard logs={logs} dailyTarget={target} onAddMeal={handleAddMeal} />

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

                    {/* Quick Add / Sevimlilar — ref + hint banner */}
                    <div ref={quickAddRef} className="relative">
                        <AnimatePresence>
                            {mealHint && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                    transition={SPRING}
                                    className="mt-6 mb-2 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                                    style={{
                                        background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                                        boxShadow: '0 8px 24px -8px rgba(91, 106, 208, 0.5)',
                                    }}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[22px] flex-shrink-0">{MEAL_EMOJI[mealHint]}</span>
                                        <span className="text-[13px] font-extrabold text-white truncate leading-tight">
                                            {hintMessage}
                                        </span>
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => openSearchTab(mealHint)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 bg-white/95 text-[#5B6AD0]"
                                    >
                                        <DIcon name="search" size={14} color="#5B6AD0" />
                                        <span className="text-[12px] font-extrabold">{searchCta}</span>
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <QuickAddCard onLogged={loadToday} />
                    </div>

                    {/* Today's foods */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.30 }}
                        className="mt-6"
                    >
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200">{t('today_meals')}</h3>
                            <span className="text-xs text-stone-500 dark:text-slate-400 font-bold">
                                {logs.length} {t('logs_count_suffix')}
                            </span>
                        </div>

                        {logs.length === 0 ? (
                            <div className="bg-white dark:bg-[#1E252E] rounded-2xl p-8 text-center">
                                <div className="flex justify-center mb-2 text-stone-400 dark:text-slate-500">
                                    <DIcon name="utensils" size={32} />
                                </div>
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
                                        className="bg-white dark:bg-[#1E252E] rounded-2xl p-3.5 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div
                                                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-[#5B6AD0]"
                                                style={{ background: 'var(--color-bg)' }}
                                            >
                                                <DIcon name="bowl" size={22} />
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
                )}
            </AnimatePresence>

            <AnimatePresence>
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
            </AnimatePresence>

            <AnimatePresence>
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
        </>
    );
}

function MacroCard({ label, iconName, iconColor, value, target, bg, delay }: {
    label: string; iconName: IconName; iconColor: string; value: number; target: number; bg: string; delay: number;
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
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white" style={{ color: iconColor }}>
                    <DIcon name={iconName} size={16} color={iconColor} />
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