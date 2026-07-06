// src/MealBreakdownCard.tsx
import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from './i18n';
import { uzLatinToCyrl } from './transliterate';

// ============================================================================
// TYPES
// ============================================================================

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodLog {
    id: number;
    food_name: string;
    calories: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    meal_type?: string | null;
    logged_at: string;
}

interface Props {
    logs: FoodLog[];
    dailyTarget: number;
    onAddMeal?: (mealType: MealKey) => void;
}

interface MealSegment {
    kcal: number;
    p: number;
    f: number;
    c: number;
    items: FoodLog[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MEAL_PERCENTAGES: Record<MealKey, number> = {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.30,
    snack: 0.10,
};

const MEAL_ORDER: readonly MealKey[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_EMOJI: Record<MealKey, string> = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌆',
    snack: '🌙',
};

const MEAL_BG_LIGHT: Record<MealKey, string> = {
    breakfast: '#FFF4D6',
    lunch: '#FAD9C8',
    dinner: '#E5D4F2',
    snack: '#D4E8E0',
};

const MEAL_BG_DARK: Record<MealKey, string> = {
    breakfast: '#2E2415',
    lunch: '#2F1F14',
    dinner: '#241B36',
    snack: '#16291F',
};

const MEAL_ACCENT_LIGHT: Record<MealKey, string> = {
    breakfast: '#B45309',
    lunch: '#C2410C',
    dinner: '#6D28D9',
    snack: '#0F766E',
};

const MEAL_ACCENT_DARK: Record<MealKey, string> = {
    breakfast: '#FBBF24',
    lunch: '#FB923C',
    dinner: '#A78BFA',
    snack: '#2DD4BF',
};

const MEAL_TIME: Record<MealKey, string> = {
    breakfast: '5:00 – 11:00',
    lunch: '11:00 – 15:00',
    dinner: '15:00 – 21:00',
    snack: '21:00 – 5:00',
};

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

// ============================================================================
// HELPERS
// ============================================================================

function safeNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function inferMealByTime(iso: string | Date): MealKey {
    let h: number;
    try {
        h = iso instanceof Date ? iso.getHours() : new Date(iso).getHours();
        if (!Number.isFinite(h)) h = 12;
    } catch {
        h = 12;
    }
    if (h >= 5 && h < 11) return 'breakfast';
    if (h >= 11 && h < 15) return 'lunch';
    if (h >= 15 && h < 21) return 'dinner';
    return 'snack';
}

function useIsDark(): boolean {
    const [dark, setDark] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const target = document.documentElement;
        const update = () => setDark(target.classList.contains('dark'));
        const observer = new MutationObserver(update);
        observer.observe(target, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return dark;
}

function hexAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return `rgba(0,0,0,${alpha})`;
    }
    return `rgba(${r},${g},${b},${alpha})`;
}

// ============================================================================
// ICONS (memoized)
// ============================================================================

const MIcon = memo(function MIcon({ name, color }: { name: 'p' | 'f' | 'c'; color: string }) {
    const common = {
        width: 11,
        height: 11,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    switch (name) {
        case 'p':
            return (
                <svg {...common}>
                    <path d="M15.5 4.5a4.5 4.5 0 0 0-7 5.5L4 14.5a2 2 0 1 0 2.5 2.5l1-1 1 1 1-1 4.5-4.5a4.5 4.5 0 0 0 1.5-7z" />
                </svg>
            );
        case 'f':
            return (
                <svg {...common}>
                    <path d="M12 3c-3 4-6 7-6 10.5a6 6 0 0 0 12 0C18 10 15 7 12 3z" />
                </svg>
            );
        case 'c':
            return (
                <svg {...common}>
                    <path d="M12 21V8M12 8c0-2.5 2-4.5 4.5-4.5C16.5 6 14.5 8 12 8zM12 8c0-2.5-2-4.5-4.5-4.5C7.5 6 9.5 8 12 8z" />
                </svg>
            );
    }
});

const PlusIcon = memo(function PlusIcon({ color }: { color: string }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
});

// ============================================================================
// MACRO PILL (memoized)
// ============================================================================

interface MacroPillProps {
    iconName: 'p' | 'f' | 'c';
    label: string;
    value: number;
    color: string;
    bg: string;
    isDark: boolean;
}

const MacroPill = memo(function MacroPill({ iconName, label, value, color, bg, isDark }: MacroPillProps) {
    return (
        <div
            className="px-2 py-1 rounded-lg flex items-center gap-1"
            style={{
                background: bg,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
            }}
        >
            <MIcon name={iconName} color={color} />
            <span className="text-[9px] font-extrabold" style={{ color: isDark ? '#94A3B8' : '#78716C' }}>
                {label}
            </span>
            <span className="text-[10px] font-extrabold" style={{ color: isDark ? '#F1F5F9' : '#292524' }}>
                {Math.round(value)}g
            </span>
        </div>
    );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function MealBreakdownCardBase({ logs, dailyTarget, onAddMeal }: Props) {
    const { t, lang } = useTranslation();
    const isDark = useIsDark();
    const [expanded, setExpanded] = useState<MealKey | null>(null);

    // Hozirgi vaqt segmenti
    const currentMeal = useMemo(() => inferMealByTime(new Date()), []);

    // ==== Labels (memoized per lang) ====
    const labels = useMemo(() => ({
        title:
            (
                {
                    'uz-Latn': 'Ovqatlar taqsimoti',
                    'uz-Cyrl': 'Овқатлар тақсимоти',
                    ru: 'Распределение по приёмам',
                    en: 'Meal breakdown',
                } as Record<string, string>
            )[lang] || 'Ovqatlar taqsimoti',
        empty:
            (
                {
                    'uz-Latn': "Hali yo'q",
                    'uz-Cyrl': 'Ҳали йўқ',
                    ru: 'Пусто',
                    en: 'Empty',
                } as Record<string, string>
            )[lang] || '—',
        ofTarget:
            (
                {
                    'uz-Latn': 'maqsaddan',
                    'uz-Cyrl': 'мақсаддан',
                    ru: 'от цели',
                    en: 'of target',
                } as Record<string, string>
            )[lang] || '%',
        now:
            (
                {
                    'uz-Latn': 'HOZIR',
                    'uz-Cyrl': 'ҲОЗИР',
                    ru: 'СЕЙЧАС',
                    en: 'NOW',
                } as Record<string, string>
            )[lang] || 'HOZIR',
        add:
            (
                {
                    'uz-Latn': "Qo'shish",
                    'uz-Cyrl': 'Қўшиш',
                    ru: 'Добавить',
                    en: 'Add',
                } as Record<string, string>
            )[lang] || "Qo'shish",
    }), [lang]);

    // ==== Name localizer (memoized) ====
    const localizeName = useCallback((name: string): string => {
        if (lang === 'uz-Cyrl' || lang === 'ru') return uzLatinToCyrl(name);
        return name;
    }, [lang]);

    // ==== Groups computation (memoized) ====
    const groups = useMemo<Record<MealKey, MealSegment>>(() => {
        const g: Record<MealKey, MealSegment> = {
            breakfast: { kcal: 0, p: 0, f: 0, c: 0, items: [] },
            lunch: { kcal: 0, p: 0, f: 0, c: 0, items: [] },
            dinner: { kcal: 0, p: 0, f: 0, c: 0, items: [] },
            snack: { kcal: 0, p: 0, f: 0, c: 0, items: [] },
        };
        for (const l of logs) {
            const mt = l.meal_type as MealKey | undefined;
            const m = mt && g[mt] ? mt : inferMealByTime(l.logged_at);
            g[m].kcal += safeNum(l.calories);
            g[m].p += safeNum(l.protein);
            g[m].f += safeNum(l.fat);
            g[m].c += safeNum(l.carbs);
            g[m].items.push(l);
        }
        return g;
    }, [logs]);

    // ==== Colors (theme-dependent, memoized) ====
    const themeColors = useMemo(() => ({
        trackColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
        pillBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
        dimText: isDark ? '#64748B' : '#A8A29E',
        secondaryText: isDark ? '#94A3B8' : '#78716C',
        itemBg: isDark ? '#1E252E' : '#FFFFFF',
        itemText: isDark ? '#F1F5F9' : '#292524',
        itemTextMuted: isDark ? '#94A3B8' : '#57534E',
        headerText: isDark ? '#F1F5F9' : '#1C1917',
        badgeText: isDark ? '#0F172A' : '#FFFFFF',
    }), [isDark]);

    // ==== Handlers ====
    const handleAdd = useCallback((m: MealKey) => {
        onAddMeal?.(m);
    }, [onAddMeal]);

    const handleToggle = useCallback((m: MealKey) => {
        setExpanded((prev) => (prev === m ? null : m));
    }, []);

    const safeTarget = Math.max(1, safeNum(dailyTarget));

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.24 }}
            className="mt-6"
        >
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[15px] font-extrabold text-stone-800 dark:text-slate-100">
                    {labels.title}
                </h3>
                <span className="text-[11px] font-bold" style={{ color: themeColors.secondaryText }}>
                    {logs.length} {t('logs_count_suffix')}
                </span>
            </div>

            <div className="space-y-2">
                {MEAL_ORDER.map((m, idx) => {
                    const seg = groups[m];
                    const segTarget = Math.max(1, Math.round(safeTarget * MEAL_PERCENTAGES[m]));
                    const percent = Math.min(100, Math.round((seg.kcal / segTarget) * 100));
                    const isEmpty = seg.items.length === 0;
                    const isOpen = expanded === m;
                    const isCurrent = m === currentMeal;
                    const labelKey = `meal_${m}`;
                    const label = (t as (k: string) => string)(labelKey) || m;

                    const accent = isDark ? MEAL_ACCENT_DARK[m] : MEAL_ACCENT_LIGHT[m];
                    const accentLight = isDark ? MEAL_ACCENT_LIGHT[m] : MEAL_ACCENT_DARK[m];
                    const filledBg = isDark ? MEAL_BG_DARK[m] : MEAL_BG_LIGHT[m];
                    const fillGradient = `linear-gradient(90deg, ${accent} 0%, ${hexAlpha(accentLight, 0.85)} 100%)`;

                    // ===== EMPTY CARD — outline only =====
                    if (isEmpty) {
                        const clickable = !!onAddMeal;

                        return (
                            <motion.div
                                key={m}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ ...SPRING, delay: 0.26 + idx * 0.05 }}
                            >
                                <motion.button
                                    whileTap={clickable ? { scale: 0.985 } : undefined}
                                    onClick={clickable ? () => handleAdd(m) : undefined}
                                    className="w-full rounded-[1.25rem] px-3.5 py-2.5 text-left flex items-center justify-between gap-3"
                                    style={{
                                        background: 'transparent',
                                        border: `1.5px dashed ${hexAlpha(accent, isDark ? 0.28 : 0.22)}`,
                                        cursor: clickable ? 'pointer' : 'default',
                                        boxShadow: isCurrent
                                            ? `0 0 0 3px ${hexAlpha(accent, isDark ? 0.10 : 0.07)}`
                                            : 'none',
                                    }}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[19px] flex-shrink-0 opacity-70" style={{ lineHeight: 1 }}>
                                            {MEAL_EMOJI[m]}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="text-[11px] font-extrabold uppercase tracking-wider"
                                                    style={{ color: hexAlpha(accent, 0.75) }}
                                                >
                                                    {label}
                                                </span>
                                                {isCurrent && (
                                                    <motion.span
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={SPRING}
                                                        className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md tracking-wider"
                                                        style={{
                                                            background: accent,
                                                            color: themeColors.badgeText,
                                                        }}
                                                    >
                                                        {labels.now}
                                                    </motion.span>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-bold mt-0.5" style={{ color: themeColors.dimText }}>
                                                {MEAL_TIME[m]}
                                            </div>
                                        </div>
                                    </div>

                                    {clickable ? (
                                        <div
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl flex-shrink-0"
                                            style={{
                                                background: hexAlpha(accent, isDark ? 0.15 : 0.10),
                                                color: accent,
                                            }}
                                        >
                                            <PlusIcon color={accent} />
                                            <span className="text-[11px] font-extrabold">{labels.add}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: themeColors.dimText }}>
                                            {labels.empty}
                                        </span>
                                    )}
                                </motion.button>
                            </motion.div>
                        );
                    }

                    // ===== FILLED CARD =====
                    const boxShadow = isCurrent
                        ? `0 0 0 2px ${hexAlpha(accent, 0.35)}, 0 8px 24px -10px ${hexAlpha(accent, 0.55)}`
                        : `0 1px 0 ${hexAlpha('#FFFFFF', isDark ? 0.04 : 0.4)} inset, 0 6px 18px -10px ${hexAlpha(accent, 0.45)}`;

                    return (
                        <motion.div
                            key={m}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...SPRING, delay: 0.26 + idx * 0.05 }}
                        >
                            <motion.button
                                whileTap={{ scale: 0.985 }}
                                onClick={() => handleToggle(m)}
                                className="w-full rounded-[1.25rem] p-3.5 text-left block relative"
                                style={{
                                    background: filledBg,
                                    border: `1px solid ${hexAlpha(accent, isDark ? 0.22 : 0.14)}`,
                                    boxShadow,
                                    cursor: 'pointer',
                                }}
                            >
                                {/* HOZIR badge */}
                                {isCurrent && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.8 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ ...SPRING, delay: 0.4 }}
                                        className="absolute -top-2 right-3 text-[9px] font-extrabold px-2 py-0.5 rounded-md tracking-wider"
                                        style={{
                                            background: accent,
                                            color: themeColors.badgeText,
                                            boxShadow: `0 4px 12px -3px ${hexAlpha(accent, 0.6)}`,
                                        }}
                                    >
                                        {labels.now}
                                    </motion.div>
                                )}

                                {/* Top row */}
                                <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[22px] flex-shrink-0" style={{ lineHeight: 1 }}>
                                            {MEAL_EMOJI[m]}
                                        </span>
                                        <div className="min-w-0">
                                            <div
                                                className="text-[11px] font-extrabold uppercase tracking-wider"
                                                style={{ color: accent }}
                                            >
                                                {label}
                                            </div>
                                            <div className="text-[10px] font-bold mt-0.5" style={{ color: themeColors.secondaryText }}>
                                                {MEAL_TIME[m]}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <div className="leading-none">
                                            <span
                                                className="text-[20px] font-extrabold leading-none"
                                                style={{ color: themeColors.headerText }}
                                            >
                                                {Math.round(seg.kcal)}
                                            </span>
                                            <span className="text-[11px] font-bold ml-1" style={{ color: themeColors.secondaryText }}>
                                                / {segTarget}
                                            </span>
                                        </div>
                                        <div className="text-[10px] font-extrabold mt-1" style={{ color: accent }}>
                                            {percent}% {labels.ofTarget}
                                        </div>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div
                                    className="h-2 rounded-full overflow-hidden relative"
                                    style={{ background: themeColors.trackColor }}
                                >
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percent}%` }}
                                        transition={{ duration: 1, ease: EASE_BACK, delay: 0.4 + idx * 0.05 }}
                                        className="h-full rounded-full relative"
                                        style={{
                                            background: fillGradient,
                                            boxShadow: `0 0 8px ${hexAlpha(accent, 0.5)}`,
                                        }}
                                    >
                                        <div
                                            className="absolute top-0 left-0 right-0 h-px"
                                            style={{ background: hexAlpha('#FFFFFF', 0.35) }}
                                        />
                                    </motion.div>
                                </div>

                                {/* Macro pills */}
                                <div className="flex items-center gap-1.5 mt-3">
                                    <MacroPill iconName="p" label="P" value={seg.p} color={accent} bg={themeColors.pillBg} isDark={isDark} />
                                    <MacroPill iconName="f" label="F" value={seg.f} color={accent} bg={themeColors.pillBg} isDark={isDark} />
                                    <MacroPill iconName="c" label="C" value={seg.c} color={accent} bg={themeColors.pillBg} isDark={isDark} />
                                    <div className="ml-auto flex items-center gap-1">
                                        <span className="text-[10px] font-extrabold" style={{ color: accent }}>
                                            {seg.items.length}
                                        </span>
                                        <span className="text-[10px] font-bold" style={{ color: themeColors.secondaryText }}>
                                            {t('logs_count_suffix')}
                                        </span>
                                        <motion.svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke={accent}
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            animate={{ rotate: isOpen ? 90 : 0 }}
                                            transition={SPRING}
                                            className="ml-1"
                                        >
                                            <path d="M9 18l6-6-6-6" />
                                        </motion.svg>
                                    </div>
                                </div>
                            </motion.button>

                            {/* Expand */}
                            <AnimatePresence initial={false}>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ ...SPRING, mass: 0.6 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="pt-2 space-y-1.5 px-1">
                                            {seg.items.map((it, j) => (
                                                <motion.div
                                                    key={it.id}
                                                    initial={{ opacity: 0, x: -6 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ ...SPRING, delay: j * 0.04 }}
                                                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                                                    style={{
                                                        background: themeColors.itemBg,
                                                        border: `1px solid ${hexAlpha(accent, isDark ? 0.15 : 0.10)}`,
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span
                                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                            style={{
                                                                background: accent,
                                                                boxShadow: `0 0 6px ${hexAlpha(accent, 0.6)}`,
                                                            }}
                                                        />
                                                        <span
                                                            className="text-[13px] font-bold truncate capitalize"
                                                            style={{ color: themeColors.itemText }}
                                                        >
                                                            {localizeName(it.food_name)}
                                                        </span>
                                                    </div>
                                                    <span
                                                        className="text-[12px] font-extrabold ml-2 flex-shrink-0"
                                                        style={{ color: themeColors.itemTextMuted }}
                                                    >
                                                        {Math.round(safeNum(it.calories))} kcal
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}

const MealBreakdownCard = memo(MealBreakdownCardBase);
export default MealBreakdownCard;