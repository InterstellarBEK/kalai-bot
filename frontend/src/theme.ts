// theme.ts
// ============================================================
// LOKMA — Theme management (premium refactor)
// - 3 mode: 'auto' | 'light' | 'dark'
//   auto → Telegram colorScheme yoki system preference
// - Safe localStorage (try/catch — quota/private mode)
// - Subscriber pattern — komponent'lar theme o'zgarishini kuzatadi
// - Auto sync: Telegram themeChanged va system prefers-color-scheme
// - Typed Telegram wrapper (telegram.ts orqali)
// ============================================================

import { getColorScheme, onThemeChange as onTelegramThemeChange } from './telegram';

// ============================================================
// TYPES
// ============================================================
export type Theme = 'light' | 'dark';
export type ThemeMode = 'auto' | 'light' | 'dark';

// ============================================================
// CONSTANTS
// ============================================================
const STORAGE_KEY = 'lokma_theme';        // Backward-compat (v1: 'light'|'dark')
const MODE_STORAGE_KEY = 'lokma_theme_mode'; // v2: 'auto'|'light'|'dark'

// ============================================================
// SAFE STORAGE — private mode / quota'ga chidamli
// ============================================================
function safeGetItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Private mode yoki quota — jimgina o'tamiz
    }
}

// ============================================================
// SYSTEM / TELEGRAM RESOLUTION
// ============================================================
function getSystemTheme(): Theme {
    try {
        if (typeof window === 'undefined') return 'light';
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

function getTelegramTheme(): Theme | null {
    try {
        const scheme = getColorScheme();
        return scheme === 'dark' ? 'dark' : scheme === 'light' ? 'light' : null;
    } catch {
        return null;
    }
}

/** Auto rejimida qaysi theme tanlanadi — Telegram > system > light */
function resolveAutoTheme(): Theme {
    return getTelegramTheme() ?? getSystemTheme();
}

// ============================================================
// MODE (persisted) + THEME (derived)
// ============================================================
export function getThemeMode(): ThemeMode {
    const saved = safeGetItem(MODE_STORAGE_KEY);
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved;

    // Backward-compat: eski 'lokma_theme' key'i bo'lsa migratsiya
    const legacy = safeGetItem(STORAGE_KEY);
    if (legacy === 'light' || legacy === 'dark') {
        safeSetItem(MODE_STORAGE_KEY, legacy);
        return legacy;
    }

    return 'auto';
}

/** Effektiv theme — DOM'da hozir qo'llanadigan */
export function getTheme(): Theme {
    const mode = getThemeMode();
    if (mode === 'auto') return resolveAutoTheme();
    return mode;
}

// ============================================================
// APPLY (DOM + persist)
// ============================================================
function applyThemeToDOM(theme: Theme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    // Telegram WebApp CSS variables uchun ham
    root.setAttribute('data-theme', theme);
}

/** Rejim tanlash — DOM'ga qo'llanadi, saqlanadi va subscriberlar chaqiriladi */
export function setThemeMode(mode: ThemeMode): Theme {
    safeSetItem(MODE_STORAGE_KEY, mode);
    // Backward-compat — eski key ni ham yangilaymiz agar qat'iy tanlangan bo'lsa
    if (mode !== 'auto') safeSetItem(STORAGE_KEY, mode);

    const theme = mode === 'auto' ? resolveAutoTheme() : mode;
    applyThemeToDOM(theme);
    notifySubscribers(theme);
    return theme;
}

/** @deprecated setThemeMode() ishlating. Backward-compat uchun qoldirildi. */
export function applyTheme(theme: Theme): void {
    setThemeMode(theme);
}

/** Toggle — auto/light/dark tsikli emas, oddiy light↔dark almashtirish */
export function toggleTheme(): Theme {
    const current = getTheme();
    return setThemeMode(current === 'dark' ? 'light' : 'dark');
}

/** 3-holatli tsikl: auto → light → dark → auto */
export function cycleThemeMode(): ThemeMode {
    const current = getThemeMode();
    const next: ThemeMode =
        current === 'auto' ? 'light' :
            current === 'light' ? 'dark' : 'auto';
    setThemeMode(next);
    return next;
}

// ============================================================
// SUBSCRIBERS — komponentlar theme'ni kuzatadi
// ============================================================
type ThemeListener = (theme: Theme) => void;
const listeners = new Set<ThemeListener>();

function notifySubscribers(theme: Theme): void {
    for (const listener of listeners) {
        try {
            listener(theme);
        } catch (err) {
            console.warn('[theme] listener error:', err);
        }
    }
}

/** Theme o'zgarishini kuzatish. Unsubscribe qaytaradi. */
export function onThemeChange(listener: ThemeListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

// ============================================================
// AUTO SYNC — system + Telegram theme'ni kuzatib avto yangilash
// ============================================================
let cleanupSystemListener: (() => void) | null = null;
let cleanupTelegramListener: (() => void) | null = null;

function setupAutoSync(): void {
    // Bir marta o'rnatamiz
    if (cleanupSystemListener || cleanupTelegramListener) return;

    // System prefers-color-scheme kuzatuvchi
    try {
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (mq) {
            const handler = () => {
                if (getThemeMode() === 'auto') {
                    const theme = resolveAutoTheme();
                    applyThemeToDOM(theme);
                    notifySubscribers(theme);
                }
            };
            // addEventListener yangi API, addListener eski (Safari <14)
            if (mq.addEventListener) {
                mq.addEventListener('change', handler);
                cleanupSystemListener = () => mq.removeEventListener('change', handler);
            } else if ((mq as MediaQueryList).addListener) {
                (mq as MediaQueryList).addListener(handler);
                cleanupSystemListener = () => (mq as MediaQueryList).removeListener(handler);
            }
        }
    } catch {
        /* noop */
    }

    // Telegram themeChanged kuzatuvchi
    try {
        cleanupTelegramListener = onTelegramThemeChange(() => {
            if (getThemeMode() === 'auto') {
                const theme = resolveAutoTheme();
                applyThemeToDOM(theme);
                notifySubscribers(theme);
            }
        });
    } catch {
        /* noop */
    }
}

/** Auto sync listener'larini o'chirish — SPA unmount / testing uchun */
export function teardownThemeAutoSync(): void {
    cleanupSystemListener?.();
    cleanupTelegramListener?.();
    cleanupSystemListener = null;
    cleanupTelegramListener = null;
}

// ============================================================
// INIT — App boot vaqtida chaqiriladi
// ============================================================
export function initTheme(): Theme {
    const theme = getTheme();
    applyThemeToDOM(theme);
    setupAutoSync();
    return theme;
}