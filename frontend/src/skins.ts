// skins.ts
// ============================================================
// LOKMA — Bekjon skin catalog (premium refactor)
// - Immutable data (Object.freeze + as const)
// - Pre-indexed Map lookups (O(1) getSkinById / getSkinsByCategory)
// - DRY i18n picker (extract shared logic)
// - Type-safe convenience helpers
// - Data integrity check (dev-only warning)
// ============================================================

import { uzLatinToCyrl } from './transliterate';
import type { Lang } from './i18n';

// ============================================================
// TYPES
// ============================================================
export type SkinCategory = 'national' | 'sport' | 'universal' | 'seasonal';

export interface Skin {
    readonly id: string;
    readonly name_uz: string;
    readonly name_ru: string;
    readonly name_en: string;
    readonly emoji: string;
    readonly category: SkinCategory;
    readonly price: number;
    /** uz-Latn description (eski nom — backward compat) */
    readonly description: string;
    readonly description_ru: string;
    readonly description_en: string;
}

export interface CategoryInfo {
    /** uz-Latn label (eski nom — backward compat) */
    readonly label: string;
    readonly label_ru: string;
    readonly label_en: string;
    readonly icon: string;
}

// ============================================================
// DATA — immutable
// ============================================================
export const SKINS: ReadonlyArray<Skin> = Object.freeze([
    // Milliy (6 ta)
    { id: 'dopi', name_uz: "Chust do'ppisi", name_ru: 'Чустская тюбетейка', name_en: 'Chust skullcap', emoji: '🎩', category: 'national', price: 50, description: "An'anaviy do'ppi", description_ru: 'Традиционная тюбетейка', description_en: 'Traditional skullcap' },
    { id: 'telpak', name_uz: 'Telpak', name_ru: 'Тельпак', name_en: 'Telpak', emoji: '🪖', category: 'national', price: 80, description: 'Qishki teri telpak', description_ru: 'Зимняя меховая шапка', description_en: 'Winter fur hat' },
    { id: 'chopon', name_uz: 'Chopon', name_ru: 'Чапан', name_en: 'Chapan robe', emoji: '🥋', category: 'national', price: 150, description: "An'anaviy kiyim", description_ru: 'Традиционная одежда', description_en: 'Traditional robe' },
    { id: 'belbog', name_uz: "Belbog'", name_ru: 'Бельбог', name_en: 'Sash belt', emoji: '🎗️', category: 'national', price: 70, description: 'Bel atrofiga', description_ru: 'Пояс на талию', description_en: 'Waist sash' },
    { id: 'mahsi', name_uz: 'Mahsi', name_ru: 'Махси', name_en: 'Mahsi boots', emoji: '👞', category: 'national', price: 100, description: 'Charm poyabzal', description_ru: 'Кожаная обувь', description_en: 'Leather footwear' },
    { id: 'piyola', name_uz: 'Sopol piyola', name_ru: 'Глиняная пиала', name_en: 'Clay piyala', emoji: '🍵', category: 'national', price: 60, description: "An'anaviy idish", description_ru: 'Традиционная посуда', description_en: 'Traditional bowl' },

    // Sport (6 ta)
    { id: 'football', name_uz: 'Terma majosi', name_ru: 'Форма сборной', name_en: 'National team kit', emoji: '⚽', category: 'sport', price: 100, description: 'Milliy futbol', description_ru: 'Национальный футбол', description_en: 'National football' },
    { id: 'boxing', name_uz: "Boks qo'lqop", name_ru: 'Боксёрские перчатки', name_en: 'Boxing gloves', emoji: '🥊', category: 'sport', price: 120, description: 'Chempion uchun', description_ru: 'Для чемпиона', description_en: 'For champions' },
    { id: 'kurash', name_uz: 'Kurash kiyimi', name_ru: 'Форма кураша', name_en: 'Kurash uniform', emoji: '🤼', category: 'sport', price: 150, description: 'Milliy kurash', description_ru: 'Национальная борьба', description_en: 'National wrestling' },
    { id: 'running', name_uz: 'Krossovka', name_ru: 'Кроссовки', name_en: 'Sneakers', emoji: '👟', category: 'sport', price: 80, description: 'Yugurish uchun', description_ru: 'Для бега', description_en: 'For running' },
    { id: 'gym', name_uz: 'Sport zal', name_ru: 'Спортзал', name_en: 'Gym gear', emoji: '🏋️', category: 'sport', price: 100, description: 'Kuch mashqlari', description_ru: 'Силовые тренировки', description_en: 'Strength training' },
    { id: 'medal', name_uz: 'Oltin medal', name_ru: 'Золотая медаль', name_en: 'Gold medal', emoji: '🥇', category: 'sport', price: 200, description: 'Chempion uchun', description_ru: 'Для чемпиона', description_en: 'For champions' },

    // Universal (5 ta)
    { id: 'glasses', name_uz: "Ko'zoynak", name_ru: 'Очки', name_en: 'Glasses', emoji: '👓', category: 'universal', price: 30, description: 'Intellektual', description_ru: 'Интеллектуальные', description_en: 'Intellectual look' },
    { id: 'scarf', name_uz: 'Sharf', name_ru: 'Шарф', name_en: 'Scarf', emoji: '🧣', category: 'universal', price: 40, description: 'Qish uchun', description_ru: 'Для зимы', description_en: 'For winter' },
    { id: 'crown', name_uz: 'Toj', name_ru: 'Корона', name_en: 'Crown', emoji: '👑', category: 'universal', price: 250, description: "Eng zo'r", description_ru: 'Лучшим', description_en: 'For the best' },
    { id: 'watch', name_uz: 'Soat', name_ru: 'Часы', name_en: 'Watch', emoji: '⌚', category: 'universal', price: 90, description: 'Vaqtga aniq', description_ru: 'Пунктуальность', description_en: 'Stay on time' },
    { id: 'bow', name_uz: 'Kapalak galstuk', name_ru: 'Галстук-бабочка', name_en: 'Bow tie', emoji: '🎀', category: 'universal', price: 50, description: 'Rasmiy stil', description_ru: 'Формальный стиль', description_en: 'Formal style' },

    // Mavsumiy (4 ta)
    { id: 'navruz', name_uz: "Navro'z guli", name_ru: 'Цветок Навруза', name_en: 'Navruz flower', emoji: '🌷', category: 'seasonal', price: 200, description: 'Bahor bayrami', description_ru: 'Весенний праздник', description_en: 'Spring festival' },
    { id: 'newyear', name_uz: 'Archa', name_ru: 'Ёлка', name_en: 'Christmas tree', emoji: '🎄', category: 'seasonal', price: 200, description: 'Yangi yil', description_ru: 'Новый год', description_en: 'New Year' },
    { id: 'ramadan', name_uz: 'Ramazon oyi', name_ru: 'Месяц Рамадан', name_en: 'Ramadan', emoji: '🌙', category: 'seasonal', price: 250, description: 'Muqaddas oy', description_ru: 'Священный месяц', description_en: 'Holy month' },
    { id: 'cake', name_uz: "Tug'ilgan kun", name_ru: 'День рождения', name_en: 'Birthday', emoji: '🎂', category: 'seasonal', price: 180, description: 'Bayramga', description_ru: 'К празднику', description_en: 'For celebration' },
].map(s => Object.freeze(s)) as Skin[]);

export const CATEGORIES: Readonly<Record<SkinCategory, CategoryInfo>> = Object.freeze({
    national: Object.freeze({ label: 'Milliy', label_ru: 'Национальные', label_en: 'National', icon: '🏛️' }),
    sport: Object.freeze({ label: 'Sport', label_ru: 'Спорт', label_en: 'Sports', icon: '⚽' }),
    universal: Object.freeze({ label: 'Universal', label_ru: 'Универсальные', label_en: 'Universal', icon: '✨' }),
    seasonal: Object.freeze({ label: 'Mavsumiy', label_ru: 'Сезонные', label_en: 'Seasonal', icon: '🎉' }),
});

export const CATEGORY_ORDER: ReadonlyArray<SkinCategory> = Object.freeze([
    'national',
    'sport',
    'universal',
    'seasonal',
]);

// ============================================================
// PRE-INDEXED LOOKUPS — module-level, one-time build
// ============================================================
const SKINS_BY_ID: ReadonlyMap<string, Skin> = new Map(SKINS.map(s => [s.id, s]));

const SKINS_BY_CATEGORY: ReadonlyMap<SkinCategory, ReadonlyArray<Skin>> = new Map(
    CATEGORY_ORDER.map(cat => [cat, Object.freeze(SKINS.filter(s => s.category === cat))])
);

// ============================================================
// DEV-ONLY DATA INTEGRITY CHECK
// ============================================================
if (import.meta.env.DEV) {
    // Duplicate ID check
    const ids = new Set<string>();
    for (const s of SKINS) {
        if (ids.has(s.id)) console.error(`[skins] Duplicate id: ${s.id}`);
        ids.add(s.id);
        if (s.price < 0) console.error(`[skins] Negative price: ${s.id}`);
        if (!s.name_uz || !s.name_ru || !s.name_en) console.warn(`[skins] Missing name locale: ${s.id}`);
        if (!s.description || !s.description_ru || !s.description_en) console.warn(`[skins] Missing description locale: ${s.id}`);
    }
}

// ============================================================
// CONSTANTS
// ============================================================
export const TOTAL_SKINS_COUNT = SKINS.length;

// ============================================================
// LOOKUP HELPERS — O(1)
// ============================================================
export function getSkinById(id: string | null | undefined): Skin | null {
    if (!id) return null;
    return SKINS_BY_ID.get(id) ?? null;
}

export function getSkinsByCategory(category: SkinCategory): ReadonlyArray<Skin> {
    return SKINS_BY_CATEGORY.get(category) ?? [];
}

export function isValidSkinId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SKINS_BY_ID.has(id);
}

export function getSkinPrice(id: string | null | undefined): number | null {
    const skin = getSkinById(id);
    return skin ? skin.price : null;
}

// ============================================================
// i18n — DRY picker
// ============================================================
type Localized = {
    _uz: string;
    _ru: string;
    _en: string;
};

/** Berilgan uz-Latn/ru/en tuple'dan tanlangan lang uchun string qaytaradi. */
function pickLocale(v: Localized, lang: Lang): string {
    switch (lang) {
        case 'ru': return v._ru;
        case 'en': return v._en;
        case 'uz-Cyrl': return uzLatinToCyrl(v._uz);
        case 'uz-Latn':
        default: return v._uz;
    }
}

// ============================================================
// PUBLIC i18n HELPERS
// ============================================================
export function getSkinName(skin: Skin, lang: Lang): string {
    return pickLocale({ _uz: skin.name_uz, _ru: skin.name_ru, _en: skin.name_en }, lang);
}

export function getSkinDescription(skin: Skin, lang: Lang): string {
    return pickLocale(
        { _uz: skin.description, _ru: skin.description_ru, _en: skin.description_en },
        lang
    );
}

export function getCategoryLabel(cat: SkinCategory, lang: Lang): string {
    const info = CATEGORIES[cat];
    return pickLocale({ _uz: info.label, _ru: info.label_ru, _en: info.label_en }, lang);
}

export function getCategoryIcon(cat: SkinCategory): string {
    return CATEGORIES[cat].icon;
}