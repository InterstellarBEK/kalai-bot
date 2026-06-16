// Theme: 'light' | 'dark'
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'lokma_theme';

export function getTheme(): Theme {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    // Default: Telegram theme yoki system preference
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.colorScheme === 'dark') return 'dark';
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
}

export function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme(): Theme {
    const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
}

export function initTheme() {
    applyTheme(getTheme());
}