// src/Dashboard.tsx
import { useEffect, useState, useRef, useMemo } from 'react';
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
import { uzLatinToCyrl } from './transliterate';
import MealBreakdownCard from './MealBreakdownCard';
import { addCoinsForLog, COINS_PER_LOG } from './coins';
import {
    getAllFavorites,
    upsertFavorite,
    toggleFavoritePin,
    type FavoriteFood,
} from './lib/favorites';

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type DashTab = 'today' | 'favorites' | 'local';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;
const PORTION_PRESETS = [50, 100, 150, 200, 300];

const MEAL_EMOJI: Record<MealKey, string> = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌆',
    snack: '🌙',
};

function inferMealByTime(d: Date): MealKey {
    const h = d.getHours();
    if (h >= 5 && h < 11) return 'breakfast';
    if (h >= 11 && h < 15) return 'lunch';
    if (h >= 15 && h < 21) return 'dinner';
    return 'snack';
}

interface LocalFoodRow {
    id: string;
    name_uz: string;
    name_ru: string | null;
    aliases: string[];
    kcal_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fat_per_100g: number;
    portions: { grams: number }[];
    emoji: string;
}

// Portion picker uchun universal element
interface PortionTarget {
    name: string;
    emoji?: string | null;
    kcalPer100g: number;
    proteinPer100g: number;
    fatPer100g: number;
    carbsPer100g: number;
    source: 'favorite' | 'local';
    sourceId?: string;
    presetPortions?: { grams: number }[];
    favoriteRef?: FavoriteFood; // sevimli tab uchun use_count yangilash
}

// ===== Premium SVG ikonlar (Iconly uslubi) =====
type IconName =
    | 'coin' | 'flame' | 'trophy' | 'protein' | 'fat' | 'carbs'
    | 'utensils' | 'bowl' | 'search' | 'star' | 'pin' | 'globe' | 'plus' | 'minus' | 'close' | 'clock';

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
                    <path d="M12 13c1.1 1.1 1.7 2 1.7 3 0 1-.8 1.7-1.7 1.7s-1.7-.7-1.7-1.7c0-1 .6-1.9 1.7-3z" fill={color} />
                    <path d="M10.5 19.5c0 1.4 0.7 2 1.5 2s1.5-.6 1.5-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
                </svg>
            );
        case 'trophy':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path d="M7 3.5h10v6.5a5 5 0 0 1-10 0V3.5z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M7 5.5H4.8a1.5 1.5 0 0 0 0 3c.5 1.4 1.4 2.4 2.4 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M17 5.5h2.2a1.5 1.5 0 0 1 0 3c-.5 1.4-1.4 2.4-2.4 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M10 15h4l-.4 3h-3.2L10 15z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M7.5 20.5h9" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M12 5.5l.75 1.6 1.75.2-1.3 1.25.35 1.7L12 9.4l-1.55.85.35-1.7L9.5 7.3l1.75-.2L12 5.5z" fill={color} />
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
        case 'star':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 3l2.6 5.7 6.2.6-4.7 4.4 1.4 6.3L12 16.9 6.5 20l1.4-6.3L3.2 9.3l6.2-.6L12 3z"
                        fill={color}
                        fillOpacity="0.25"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        case 'pin':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 17v5M8 3h8l-1.5 4 2.5 5H7l2.5-5L8 3z"
                        fill={color}
                        fillOpacity="0.25"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        case 'globe':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3c2.8 3 4 6 4 9s-1.2 6-4 9c-2.8-3-4-6-4-9s1.2-6 4-9z" />
                </svg>
            );
        case 'plus':
            return (
                <svg {...common}>
                    <path d="M12 5v14M5 12h14" />
                </svg>
            );
        case 'minus':
            return (
                <svg {...common}>
                    <path d="M5 12h14" />
                </svg>
            );
        case 'close':
            return (
                <svg {...common}>
                    <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
            );
        case 'clock':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
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

    // === 3-tab layout state ===
    const [activeTab, setActiveTab] = useState<DashTab>('today');
    const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
    const [favLoading, setFavLoading] = useState(false);
    const [localFoods, setLocalFoods] = useState<LocalFoodRow[]>([]);
    const [localLoading, setLocalLoading] = useState(false);

    // === Portion picker bottom sheet ===
    const [portionTarget, setPortionTarget] = useState<PortionTarget | null>(null);
    const [portionGrams, setPortionGrams] = useState(100);
    const [portionSaving, setPortionSaving] = useState(false);

    const telegramId = getTelegramId();
    const tabsRef = useRef<HTMLDivElement>(null);
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

    // Sevimli tab tanlanganda yuklash
    useEffect(() => {
        if (activeTab !== 'favorites' || !telegramId) return;
        setFavLoading(true);
        getAllFavorites(telegramId, 50)
            .then(setFavorites)
            .catch(() => setFavorites([]))
            .finally(() => setFavLoading(false));
    }, [activeTab, telegramId]);

    // Mahalliy tab tanlanganda yuklash (faqat birinchi marta)
    useEffect(() => {
        if (activeTab !== 'local' || localFoods.length > 0) return;
        setLocalLoading(true);
        supabase
            .from('local_foods')
            .select('*')
            .then(({ data, error }) => {
                if (!error && data) setLocalFoods(data as LocalFoodRow[]);
                setLocalLoading(false);
            });
    }, [activeTab, localFoods.length]);

    function handleAddMeal(meal: MealKey) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.notificationOccurred?.('success');

        setMealHint(meal);
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = window.setTimeout(() => setMealHint(null), 4500);

        setTimeout(() => {
            tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    function openSearchTab(meal: MealKey) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.impactOccurred?.('medium');
        window.dispatchEvent(new CustomEvent('lokma:open-search', { detail: { mealType: meal } }));
        setMealHint(null);
    }

    function switchTab(tab: DashTab) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.selectionChanged?.();
        setActiveTab(tab);
    }

    function openPortionPicker(target: PortionTarget, initialGrams = 100) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.impactOccurred?.('light');
        setPortionTarget(target);
        setPortionGrams(initialGrams);
    }

    function closePortionPicker() {
        if (portionSaving) return;
        setPortionTarget(null);
    }

    async function confirmPortion() {
        if (!portionTarget || !telegramId || portionSaving) return;
        setPortionSaving(true);
        try {
            const ratio = portionGrams / 100;
            const calories = Math.round(portionTarget.kcalPer100g * ratio);
            const meal_type = inferMealByTime(new Date());

            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: portionTarget.name,
                grams: portionGrams,
                calories,
                protein: +(portionTarget.proteinPer100g * ratio).toFixed(1),
                fat: +(portionTarget.fatPer100g * ratio).toFixed(1),
                carbs: +(portionTarget.carbsPer100g * ratio).toFixed(1),
                meal_type,
            });
            if (error) {
                await showAlert(t('error_prefix') + error.message);
                return;
            }

            // Mahalliy taom — sevimliga upsert
            if (portionTarget.source === 'local') {
                try {
                    await upsertFavorite({
                        telegramId,
                        foodName: portionTarget.name,
                        kcalPer100g: portionTarget.kcalPer100g,
                        proteinPer100g: portionTarget.proteinPer100g,
                        fatPer100g: portionTarget.fatPer100g,
                        carbsPer100g: portionTarget.carbsPer100g,
                        source: 'local',
                        sourceId: portionTarget.sourceId,
                        emoji: portionTarget.emoji,
                    });
                } catch { /* ignore */ }
            } else if (portionTarget.source === 'favorite' && portionTarget.favoriteRef) {
                // Sevimli — use_count yangilash optimistik
                setFavorites((prev) =>
                    prev.map((f) =>
                        f.id === portionTarget.favoriteRef!.id ? { ...f, use_count: f.use_count + 1 } : f
                    )
                );
                // Re-upsert sevimliga (use_count backend orqali)
                try {
                    await upsertFavorite({
                        telegramId,
                        foodName: portionTarget.name,
                        kcalPer100g: portionTarget.kcalPer100g,
                        proteinPer100g: portionTarget.proteinPer100g,
                        fatPer100g: portionTarget.fatPer100g,
                        carbsPer100g: portionTarget.carbsPer100g,
                        source: portionTarget.favoriteRef.source,
                        sourceId: portionTarget.favoriteRef.source_id ?? undefined,
                        emoji: portionTarget.emoji,
                    });
                } catch { /* ignore */ }
            }

            // Coins
            try { await addCoinsForLog(); } catch { /* ignore */ }

            // Haptic success + dashboard refresh
            const tg = (window as any).Telegram?.WebApp;
            tg?.HapticFeedback?.notificationOccurred?.('success');
            window.dispatchEvent(new CustomEvent('lokma:log-added'));

            setPortionTarget(null);
        } finally {
            setPortionSaving(false);
        }
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

    async function togglePin(fav: FavoriteFood) {
        if (!telegramId) return;
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.impactOccurred?.('light');
        const newPinned = await toggleFavoritePin(telegramId, fav.id);
        setFavorites((prev) => {
            const updated = prev.map((f) => (f.id === fav.id ? { ...f, is_pinned: newPinned } : f));
            updated.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                return b.use_count - a.use_count;
            });
            return updated;
        });
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

    // === Tab metadata ===
    const TAB_LIST: { key: DashTab; iconName: IconName; label: string }[] = [
        { key: 'today', iconName: 'utensils', label: t('tab_today') },
        { key: 'favorites', iconName: 'star', label: t('tab_favorites') },
        { key: 'local', iconName: 'globe', label: t('tab_local') },
    ];

    // === Mahalliy taomlar — saralangan ko'rinishi ===
    const sortedLocalFoods = useMemo(() => {
        // food_logs name'lariga ko'ra use_count hisoblash
        const counts: Record<string, number> = {};
        for (const l of logs) {
            const n = (l.food_name || '').toLowerCase();
            counts[n] = (counts[n] || 0) + 1;
        }
        return [...localFoods].sort((a, b) => {
            const ca = counts[a.name_uz.toLowerCase()] || 0;
            const cb = counts[b.name_uz.toLowerCase()] || 0;
            if (cb !== ca) return cb - ca;
            return a.name_uz.localeCompare(b.name_uz);
        });
    }, [localFoods, logs]);

    function localFoodDisplayName(f: LocalFoodRow): string {
        if (lang === 'ru' && f.name_ru) return f.name_ru;
        if (lang === 'uz-Cyrl') return uzLatinToCyrl(f.name_uz);
        return f.name_uz;
    }

    function favDisplayName(f: FavoriteFood): string {
        if (lang === 'uz-Cyrl') return uzLatinToCyrl(f.food_name);
        return f.food_name;
    }

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

                    {/* Mealtime breakdown */}
                    <MealBreakdownCard logs={logs} dailyTarget={target} onAddMeal={handleAddMeal} />

                    {/* Water tracker */}
                    <div className="mt-2.5"><WaterTracker /></div>
                    <div className="mt-2.5"><WeightTracker /></div>
                    <div className="mt-2.5"><ChallengesCard onClaim={loadUser} /></div>
                    {telegramId && (
                        <div className="mt-2.5"><FastingTracker telegramId={telegramId} /></div>
                    )}

                    {/* === 3-TAB PANEL: Bugun / Sevimli / Mahalliy === */}
                    <motion.div
                        ref={tabsRef}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.30 }}
                        className="mt-6"
                    >
                        {/* Hint banner — meal qo'shish ko'rsatmasi */}
                        <AnimatePresence>
                            {mealHint && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                    transition={SPRING}
                                    className="mb-3 rounded-2xl p-3.5 flex items-center justify-between gap-3"
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

                        {/* Tab bar — floating pill */}
                        <div
                            className="relative flex p-1 rounded-2xl bg-white dark:bg-[#1E252E]"
                            style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                        >
                            {TAB_LIST.map((tab) => {
                                const isActive = activeTab === tab.key;
                                return (
                                    <motion.button
                                        key={tab.key}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => switchTab(tab.key)}
                                        className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl"
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="dashTabBubble"
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                                                    boxShadow: '0 6px 18px -4px rgba(91, 106, 208, 0.45)',
                                                }}
                                                transition={SPRING}
                                            />
                                        )}
                                        <span className={`relative z-10 ${isActive ? 'text-white' : 'text-stone-500 dark:text-slate-400'}`}>
                                            <DIcon name={tab.iconName} size={15} />
                                        </span>
                                        <span
                                            className={`relative z-10 text-[12.5px] font-extrabold ${isActive ? 'text-white' : 'text-stone-500 dark:text-slate-400'
                                                }`}
                                        >
                                            {tab.label}
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Tab content */}
                        <div className="mt-4 min-h-[120px]">
                            <AnimatePresence mode="wait">
                                {activeTab === 'today' && (
                                    <motion.div
                                        key="tab-today"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={SPRING}
                                    >
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200">
                                                {t('today_meals')}
                                            </h3>
                                            <span className="text-xs text-stone-500 dark:text-slate-400 font-bold">
                                                {logs.length} {t('logs_count_suffix')}
                                            </span>
                                        </div>

                                        {logs.length === 0 ? (
                                            <EmptyState iconName="utensils" title={t('no_meals')} subtitle="" />
                                        ) : (
                                            <div className="space-y-2">
                                                {logs.map((l, idx) => {
                                                    const mt = (l.meal_type as MealKey | null | undefined)
                                                        || inferMealByTime(new Date(l.logged_at));
                                                    return (
                                                        <motion.div
                                                            key={l.id}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ ...SPRING, delay: 0.02 + idx * 0.04 }}
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
                                                                    <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5 font-semibold flex items-center gap-1.5">
                                                                        <span className="text-[13px] leading-none">{MEAL_EMOJI[mt]}</span>
                                                                        <span>
                                                                            {Math.round(l.calories)} kcal · {Math.round(l.protein || 0)}g {t('protein_label')}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <motion.button
                                                                whileTap={{ scale: 0.85 }}
                                                                onClick={() => deleteLog(l.id)}
                                                                className="ml-2 w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex-shrink-0 font-bold"
                                                            >
                                                                ✕
                                                            </motion.button>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {activeTab === 'favorites' && (
                                    <motion.div
                                        key="tab-favorites"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={SPRING}
                                    >
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200">
                                                {t('favorites_title')}
                                            </h3>
                                            <span className="text-xs text-stone-500 dark:text-slate-400 font-bold">
                                                {favorites.length}
                                            </span>
                                        </div>

                                        {favLoading ? (
                                            <SkeletonList />
                                        ) : favorites.length === 0 ? (
                                            <EmptyState
                                                iconName="star"
                                                title={t('empty_favorites_title')}
                                                subtitle={t('empty_favorites_subtitle')}
                                            />
                                        ) : (
                                            <div className="space-y-2">
                                                {favorites.map((fav, idx) => (
                                                    <motion.div
                                                        key={fav.id}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ ...SPRING, delay: 0.02 + idx * 0.04 }}
                                                        className="bg-white dark:bg-[#1E252E] rounded-2xl p-3.5 flex items-center justify-between gap-2"
                                                    >
                                                        <button
                                                            onClick={() =>
                                                                openPortionPicker({
                                                                    name: fav.food_name,
                                                                    emoji: fav.emoji,
                                                                    kcalPer100g: fav.kcal_per_100g,
                                                                    proteinPer100g: fav.protein_per_100g,
                                                                    fatPer100g: fav.fat_per_100g,
                                                                    carbsPer100g: fav.carbs_per_100g,
                                                                    source: 'favorite',
                                                                    favoriteRef: fav,
                                                                }, 100)
                                                            }
                                                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                                        >
                                                            <div
                                                                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-[20px]"
                                                                style={{ background: 'var(--color-bg)' }}
                                                            >
                                                                {fav.emoji || '🍽️'}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    {fav.is_pinned && (
                                                                        <span className="text-[#F59E0B]"><DIcon name="pin" size={12} color="#F59E0B" /></span>
                                                                    )}
                                                                    <div className="font-extrabold text-stone-900 dark:text-slate-100 truncate capitalize text-[15px]">
                                                                        {favDisplayName(fav)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5 font-semibold">
                                                                    {Math.round(fav.kcal_per_100g)} kcal / 100g · {t('used_n_times').replace('{n}', String(fav.use_count))}
                                                                </div>
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <motion.button
                                                                whileTap={{ scale: 0.85 }}
                                                                onClick={() => togglePin(fav)}
                                                                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${fav.is_pinned
                                                                        ? 'bg-[#FEF3C7] text-[#B45309] dark:bg-amber-950/40 dark:text-amber-400'
                                                                        : 'bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-500'
                                                                    }`}
                                                                aria-label="pin"
                                                            >
                                                                <DIcon name="pin" size={14} />
                                                            </motion.button>
                                                            <motion.button
                                                                whileTap={{ scale: 0.85 }}
                                                                onClick={() =>
                                                                    openPortionPicker({
                                                                        name: fav.food_name,
                                                                        emoji: fav.emoji,
                                                                        kcalPer100g: fav.kcal_per_100g,
                                                                        proteinPer100g: fav.protein_per_100g,
                                                                        fatPer100g: fav.fat_per_100g,
                                                                        carbsPer100g: fav.carbs_per_100g,
                                                                        source: 'favorite',
                                                                        favoriteRef: fav,
                                                                    }, 100)
                                                                }
                                                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                                                                style={{
                                                                    background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                                                                    boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                                                }}
                                                                aria-label="add"
                                                            >
                                                                <DIcon name="plus" size={16} color="#fff" />
                                                            </motion.button>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {activeTab === 'local' && (
                                    <motion.div
                                        key="tab-local"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={SPRING}
                                    >
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-200">
                                                {t('local_title')}
                                            </h3>
                                            <span className="text-xs text-stone-500 dark:text-slate-400 font-bold">
                                                {localFoods.length}
                                            </span>
                                        </div>

                                        {localLoading ? (
                                            <SkeletonList />
                                        ) : localFoods.length === 0 ? (
                                            <EmptyState
                                                iconName="globe"
                                                title={t('empty_local_title')}
                                                subtitle={t('empty_local_subtitle')}
                                            />
                                        ) : (
                                            <div className="space-y-2">
                                                {sortedLocalFoods.map((f, idx) => {
                                                    const defaultGrams = f.portions?.[0]?.grams || 100;
                                                    return (
                                                        <motion.button
                                                            key={f.id}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ ...SPRING, delay: 0.02 + idx * 0.025 }}
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={() =>
                                                                openPortionPicker({
                                                                    name: f.name_uz,
                                                                    emoji: f.emoji,
                                                                    kcalPer100g: f.kcal_per_100g,
                                                                    proteinPer100g: f.protein_per_100g,
                                                                    fatPer100g: f.fat_per_100g,
                                                                    carbsPer100g: f.carbs_per_100g,
                                                                    source: 'local',
                                                                    sourceId: f.id,
                                                                    presetPortions: f.portions,
                                                                }, defaultGrams)
                                                            }
                                                            className="w-full bg-white dark:bg-[#1E252E] rounded-2xl p-3.5 flex items-center justify-between text-left"
                                                        >
                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                <div
                                                                    className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-[20px]"
                                                                    style={{ background: 'var(--color-bg)' }}
                                                                >
                                                                    {f.emoji || '🥘'}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-extrabold text-stone-900 dark:text-slate-100 truncate capitalize text-[15px]">
                                                                        {localFoodDisplayName(f)}
                                                                    </div>
                                                                    <div className="text-xs text-stone-500 dark:text-slate-400 mt-0.5 font-semibold">
                                                                        {Math.round(f.kcal_per_100g)} kcal / 100g
                                                                        {f.portions?.length > 0 && (
                                                                            <span> · {f.portions.length} {t('portion_options_suffix')}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div
                                                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                                                                style={{
                                                                    background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                                                                    boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                                                }}
                                                            >
                                                                <DIcon name="plus" size={16} color="#fff" />
                                                            </div>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Portion Picker Bottom Sheet */}
            <AnimatePresence>
                {portionTarget && (
                    <PortionPickerSheet
                        target={portionTarget}
                        grams={portionGrams}
                        onGramsChange={setPortionGrams}
                        onClose={closePortionPicker}
                        onConfirm={confirmPortion}
                        saving={portionSaving}
                        t={t}
                        coinsPerLog={COINS_PER_LOG}
                    />
                )}
            </AnimatePresence>

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

// ===== Macro Card =====
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

// ===== Empty State =====
function EmptyState({ iconName, title, subtitle }: { iconName: IconName; title: string; subtitle?: string }) {
    return (
        <div className="bg-white dark:bg-[#1E252E] rounded-2xl p-8 text-center">
            <div className="flex justify-center mb-2 text-stone-400 dark:text-slate-500">
                <DIcon name={iconName} size={32} />
            </div>
            <div className="text-sm text-stone-600 dark:text-slate-300 font-extrabold">{title}</div>
            {subtitle && (
                <div className="text-xs text-stone-500 dark:text-slate-400 font-semibold mt-1">{subtitle}</div>
            )}
        </div>
    );
}

// ===== Skeleton List (loading shimmer) =====
function SkeletonList() {
    return (
        <div className="space-y-2">
            {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white dark:bg-[#1E252E] rounded-2xl p-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-stone-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                    <div className="flex-1">
                        <div className="h-3.5 w-1/2 rounded bg-stone-200 dark:bg-slate-700 animate-pulse" />
                        <div className="h-3 w-1/3 rounded bg-stone-200 dark:bg-slate-700 animate-pulse mt-2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ===== Portion Picker Bottom Sheet =====
function PortionPickerSheet({
    target, grams, onGramsChange, onClose, onConfirm, saving, t, coinsPerLog,
}: {
    target: PortionTarget;
    grams: number;
    onGramsChange: (g: number) => void;
    onClose: () => void;
    onConfirm: () => void;
    saving: boolean;
    t: (k: string) => string;
    coinsPerLog: number;
}) {
    const ratio = grams / 100;
    const kcal = Math.round(target.kcalPer100g * ratio);
    const protein = +(target.proteinPer100g * ratio).toFixed(1);
    const fat = +(target.fatPer100g * ratio).toFixed(1);
    const carbs = +(target.carbsPer100g * ratio).toFixed(1);

    const presets = target.presetPortions && target.presetPortions.length > 0
        ? target.presetPortions
        : PORTION_PRESETS.map((g) => ({ grams: g }));

    function step(delta: number) {
        const next = Math.max(10, Math.min(2000, grams + delta));
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.selectionChanged?.();
        onGramsChange(next);
    }

    function selectPreset(g: number) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.HapticFeedback?.impactOccurred?.('light');
        onGramsChange(g);
    }

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]"
            />
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={SPRING}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.15}
                onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
                className="fixed bottom-0 left-0 right-0 z-[80] bg-white dark:bg-[#1E252E] rounded-t-[2rem] px-5 pt-3 pb-6 max-w-md mx-auto"
                style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)' }}
            >
                {/* Drag handle */}
                <div className="flex justify-center mb-3">
                    <div className="w-10 h-1.5 rounded-full bg-stone-300 dark:bg-slate-600" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-[22px]"
                            style={{ background: 'var(--color-bg)' }}
                        >
                            {target.emoji || (target.source === 'local' ? '🥘' : '🍽️')}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-extrabold text-[#5B6AD0] uppercase tracking-wider">
                                {t('portion_picker_title')}
                            </div>
                            <div className="text-[17px] font-extrabold text-stone-900 dark:text-slate-100 truncate capitalize">
                                {target.name}
                            </div>
                        </div>
                    </div>
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={onClose}
                        disabled={saving}
                        className="w-9 h-9 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-500 dark:text-slate-400 flex items-center justify-center flex-shrink-0"
                        aria-label="close"
                    >
                        <DIcon name="close" size={16} />
                    </motion.button>
                </div>

                {/* Live kcal display */}
                <div
                    className="rounded-[1.5rem] p-4 mb-4"
                    style={{
                        background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                        boxShadow: '0 8px 24px -8px rgba(91, 106, 208, 0.4)',
                    }}
                >
                    <div className="flex items-end justify-between">
                        <div>
                            <div className="text-[10px] font-extrabold text-white/70 uppercase tracking-wider">
                                {t('portion_calories')}
                            </div>
                            <div className="text-[36px] font-extrabold text-white leading-none mt-1">
                                {kcal}
                                <span className="text-base text-white/70 font-bold ml-1">kcal</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-extrabold text-white/70 uppercase tracking-wider">
                                {t('portion_weight_label')}
                            </div>
                            <div className="text-[28px] font-extrabold text-white leading-none mt-1">
                                {grams}
                                <span className="text-sm text-white/70 font-bold ml-0.5">g</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/15">
                        <MacroPill label={t('macro_protein_short')} value={protein} />
                        <MacroPill label={t('macro_fat_short')} value={fat} />
                        <MacroPill label={t('macro_carbs_short')} value={carbs} />
                    </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center justify-between gap-3 mb-4">
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => step(-25)}
                        disabled={saving || grams <= 10}
                        className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-40"
                    >
                        <DIcon name="minus" size={18} />
                    </motion.button>

                    <div className="flex-1 flex items-center justify-center gap-2 bg-stone-50 dark:bg-[#151B22] rounded-2xl py-3">
                        <input
                            type="number"
                            inputMode="numeric"
                            value={grams}
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v)) onGramsChange(Math.max(10, Math.min(2000, v)));
                            }}
                            disabled={saving}
                            className="bg-transparent text-center w-20 text-[20px] font-extrabold text-stone-900 dark:text-slate-100 focus:outline-none"
                        />
                        <span className="text-sm font-bold text-stone-400 dark:text-slate-500">g</span>
                    </div>

                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => step(25)}
                        disabled={saving || grams >= 2000}
                        className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-40"
                    >
                        <DIcon name="plus" size={18} />
                    </motion.button>
                </div>

                {/* Presets */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {presets.map((p, idx) => {
                        const isActive = grams === p.grams;
                        return (
                            <motion.button
                                key={`${p.grams}-${idx}`}
                                whileTap={{ scale: 0.94 }}
                                onClick={() => selectPreset(p.grams)}
                                disabled={saving}
                                className={`px-4 py-2 rounded-xl flex-shrink-0 transition-colors ${isActive
                                        ? 'bg-[#5B6AD0] text-white'
                                        : 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300'
                                    }`}
                                style={isActive ? { boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)' } : undefined}
                            >
                                <span className="text-[13px] font-extrabold whitespace-nowrap">
                                    {p.grams}g
                                </span>
                            </motion.button>
                        );
                    })}
                </div>

                {/* Confirm CTA */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onConfirm}
                    disabled={saving}
                    className="w-full py-4 rounded-2xl text-white font-extrabold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{
                        background: 'linear-gradient(135deg, #5B6AD0 0%, #7C8EE8 100%)',
                        boxShadow: '0 8px 24px -8px rgba(91, 106, 208, 0.5)',
                    }}
                >
                    {saving ? (
                        <span>{t('saving')}</span>
                    ) : (
                        <>
                            <DIcon name="plus" size={16} color="#fff" />
                            <span>{t('btn_add_portion')}</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-extrabold">
                                +{coinsPerLog} 🪙
                            </span>
                        </>
                    )}
                </motion.button>
            </motion.div>
        </>
    );
}

function MacroPill({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold text-white leading-none">
                {value}<span className="text-[10px] text-white/70 font-bold">g</span>
            </div>
            <div className="text-[9px] font-extrabold text-white/60 uppercase tracking-wider mt-1">{label}</div>
        </div>
    );
}