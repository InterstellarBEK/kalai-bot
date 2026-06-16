import { uzLatinToCyrl } from './transliterate';
import type { Lang } from './i18n';

export type SkinCategory = 'national' | 'sport' | 'universal' | 'seasonal';

export interface Skin {
    id: string;
    name_uz: string;
    name_ru: string;
    name_en: string;
    emoji: string;
    category: SkinCategory;
    price: number;
    description: string;     // uz-Latn (eski — backward compat)
    description_ru: string;
    description_en: string;
}

export const SKINS: Skin[] = [
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
];

export interface CategoryInfo {
    label: string;       // uz-Latn (eski)
    label_ru: string;
    label_en: string;
    icon: string;
}

export const CATEGORIES: Record<SkinCategory, CategoryInfo> = {
    national: { label: 'Milliy', label_ru: 'Национальные', label_en: 'National', icon: '🏛️' },
    sport: { label: 'Sport', label_ru: 'Спорт', label_en: 'Sports', icon: '⚽' },
    universal: { label: 'Universal', label_ru: 'Универсальные', label_en: 'Universal', icon: '✨' },
    seasonal: { label: 'Mavsumiy', label_ru: 'Сезонные', label_en: 'Seasonal', icon: '🎉' },
};

export function getSkinById(id: string | null): Skin | null {
    if (!id) return null;
    return SKINS.find(s => s.id === id) || null;
}

// === i18n helper'lar ===

export function getSkinName(skin: Skin, lang: Lang): string {
    if (lang === 'ru') return skin.name_ru;
    if (lang === 'en') return skin.name_en;
    if (lang === 'uz-Cyrl') return uzLatinToCyrl(skin.name_uz);
    return skin.name_uz;
}

export function getSkinDescription(skin: Skin, lang: Lang): string {
    if (lang === 'ru') return skin.description_ru;
    if (lang === 'en') return skin.description_en;
    if (lang === 'uz-Cyrl') return uzLatinToCyrl(skin.description);
    return skin.description;
}

export function getCategoryLabel(cat: SkinCategory, lang: Lang): string {
    const info = CATEGORIES[cat];
    if (lang === 'ru') return info.label_ru;
    if (lang === 'en') return info.label_en;
    if (lang === 'uz-Cyrl') return uzLatinToCyrl(info.label);
    return info.label;
}