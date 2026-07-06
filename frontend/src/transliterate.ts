// transliterate.ts
// ============================================================
// LOKMA — O'zbek Latin → Cyrillic transliteratsiya
// - Barcha apostrof variantlari (', ʻ, ʼ, ‛, ‘, ’, `)
// - All-caps digraphlar (SH, CH, YO, YU, YA, O', G')
// - Word-boundary E → Э (word start)
// - Ye/ye word-start → Е/е
// - LRU memoization cache (repeated calls tez)
// ============================================================

// Barcha apostrof variantlari — birlashtiruvchi normal forma
// U+0027 ' apostrophe, U+02BB ʻ modifier letter turned comma,
// U+02BC ʼ modifier apostrophe, U+2018 ' left, U+2019 ' right,
// U+201B ‛ reversed, U+0060 ` grave
const APOSTROPHE_CLASS = "['\u02BB\u02BC\u2018\u2019\u201B\u0060]";

// ============================================================
// RULES — tartib muhim: uzunroqlar birinchi, digraphlar SH>S, CH>C
// ============================================================
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
    // O'/G' — apostrof digraphlar (barcha variantlar)
    [new RegExp(`O${APOSTROPHE_CLASS}`, 'g'), 'Ў'],
    [new RegExp(`o${APOSTROPHE_CLASS}`, 'g'), 'ў'],
    [new RegExp(`G${APOSTROPHE_CLASS}`, 'g'), 'Ғ'],
    [new RegExp(`g${APOSTROPHE_CLASS}`, 'g'), 'ғ'],

    // All-caps digraphlar (SHURVA, CHOY, YOGURT, YURT, YASHIL)
    [/SH/g, 'Ш'],
    [/CH/g, 'Ч'],
    [/YO/g, 'Ё'],
    [/YU/g, 'Ю'],
    [/YA/g, 'Я'],

    // Title-case digraphlar
    [/Sh/g, 'Ш'],
    [/Ch/g, 'Ч'],
    [/Yo/g, 'Ё'],
    [/Yu/g, 'Ю'],
    [/Ya/g, 'Я'],

    // Lowercase digraphlar
    [/sh/g, 'ш'],
    [/ch/g, 'ч'],
    [/yo/g, 'ё'],
    [/yu/g, 'ю'],
    [/ya/g, 'я'],

    // Word-initial Ye/ye → Е/е (Yer → Ер, yer → ер)
    [/\bYe/g, 'Е'],
    [/\bye/g, 'е'],

    // Word-initial E → Э (Elektr → Электр)
    [/\bE/g, 'Э'],
    [/\be/g, 'э'],

    // Yakka harflar (alifbo tartibi)
    [/A/g, 'А'], [/a/g, 'а'],
    [/B/g, 'Б'], [/b/g, 'б'],
    [/D/g, 'Д'], [/d/g, 'д'],
    [/E/g, 'Е'], [/e/g, 'е'],
    [/F/g, 'Ф'], [/f/g, 'ф'],
    [/G/g, 'Г'], [/g/g, 'г'],
    [/H/g, 'Ҳ'], [/h/g, 'ҳ'],
    [/I/g, 'И'], [/i/g, 'и'],
    [/J/g, 'Ж'], [/j/g, 'ж'],
    [/K/g, 'К'], [/k/g, 'к'],
    [/L/g, 'Л'], [/l/g, 'л'],
    [/M/g, 'М'], [/m/g, 'м'],
    [/N/g, 'Н'], [/n/g, 'н'],
    [/O/g, 'О'], [/o/g, 'о'],
    [/P/g, 'П'], [/p/g, 'п'],
    [/Q/g, 'Қ'], [/q/g, 'қ'],
    [/R/g, 'Р'], [/r/g, 'р'],
    [/S/g, 'С'], [/s/g, 'с'],
    [/T/g, 'Т'], [/t/g, 'т'],
    [/U/g, 'У'], [/u/g, 'у'],
    [/V/g, 'В'], [/v/g, 'в'],
    [/X/g, 'Х'], [/x/g, 'х'],
    [/Y/g, 'Й'], [/y/g, 'й'],
    [/Z/g, 'З'], [/z/g, 'з'],
];

// ============================================================
// LRU CACHE — tez-tez qaytariladigan matnlar uchun
// ============================================================
const CACHE_MAX_SIZE = 500;
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
    const val = cache.get(key);
    if (val === undefined) return undefined;
    // LRU: qayta joylash (Map insertion order = recency)
    cache.delete(key);
    cache.set(key, val);
    return val;
}

function cacheSet(key: string, val: string): void {
    if (cache.size >= CACHE_MAX_SIZE) {
        // Eng eski entry'ni o'chir (Map birinchi kaliti)
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, val);
}

/** Cache tozalash — testing yoki logout uchun */
export function clearTransliterationCache(): void {
    cache.clear();
}

// ============================================================
// PUBLIC: uzLatinToCyrl
// ============================================================
/**
 * O'zbek Latin matnini Cyrill'ga o'giradi.
 * - Faqat harflar o'zgaradi, raqamlar/tinish belgilari o'zgarmaydi.
 * - Cache'lanadi (500 tagacha entry, LRU).
 *
 * @example
 *   uzLatinToCyrl("Osh") → "Ош"
 *   uzLatinToCyrl("SHURVA") → "ШУРВА"
 *   uzLatinToCyrl("Elektr") → "Электр"
 *   uzLatinToCyrl("Yer") → "Ер"
 *   uzLatinToCyrl("Oʻzbekiston") → "Ўзбекистон"
 */
export function uzLatinToCyrl(s: string): string {
    if (!s) return s;
    if (typeof s !== 'string') return s;

    const cached = cacheGet(s);
    if (cached !== undefined) return cached;

    let out = s;
    for (const [re, rep] of RULES) {
        out = out.replace(re, rep);
    }

    cacheSet(s, out);
    return out;
}

// ============================================================
// PUBLIC: normalizeApostrophes
// Turli apostroflarni standart ʻ ga birlashtirish (Latin qidiruv uchun)
// ============================================================
const APOSTROPHE_NORMALIZE_RE = new RegExp(APOSTROPHE_CLASS, 'g');

export function normalizeApostrophes(s: string): string {
    if (!s) return s;
    return s.replace(APOSTROPHE_NORMALIZE_RE, 'ʻ');
}