// telegram.ts — Lokma Telegram WebApp premium wrapper
// Mavjud chaqiruvchilar buzilmaydi — barcha eski export'lar saqlangan.

// ============================================================
// TYPES — minimal official surface
// ============================================================
type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type HapticNotify = 'error' | 'success' | 'warning'
type ColorScheme = 'light' | 'dark'
type Platform = 'android' | 'android_x' | 'ios' | 'macos' | 'tdesktop' | 'weba' | 'webk' | 'unigram' | 'unknown'

interface TelegramWebApp {
    initData: string
    initDataUnsafe: {
        user?: { id: number; first_name?: string; username?: string; language_code?: string; is_premium?: boolean }
        start_param?: string
        auth_date?: number
        hash?: string
    }
    version: string
    platform: Platform
    colorScheme: ColorScheme
    themeParams: Record<string, string>
    viewportHeight: number
    viewportStableHeight: number
    isExpanded: boolean
    isClosingConfirmationEnabled: boolean

    ready: () => void
    expand: () => void
    close: () => void
    isVersionAtLeast: (v: string) => boolean

    HapticFeedback?: {
        impactOccurred?: (s: HapticStyle) => void
        notificationOccurred?: (t: HapticNotify) => void
        selectionChanged?: () => void
    }
    BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void }
    MainButton?: {
        show: () => void; hide: () => void; enable: () => void; disable: () => void
        setText: (t: string) => void; setParams: (p: Record<string, unknown>) => void
        onClick: (cb: () => void) => void; offClick: (cb: () => void) => void
        showProgress: (leaveActive?: boolean) => void; hideProgress: () => void
    }
    CloudStorage?: {
        setItem: (k: string, v: string, cb?: (err: unknown, ok: boolean) => void) => void
        getItem: (k: string, cb: (err: unknown, v: string | null) => void) => void
        removeItem: (k: string, cb?: (err: unknown, ok: boolean) => void) => void
        getKeys: (cb: (err: unknown, keys: string[]) => void) => void
    }

    openInvoice?: (link: string, cb: (status: string) => void) => void
    showAlert?: (msg: string, cb?: () => void) => void
    showConfirm?: (msg: string, cb: (ok: boolean) => void) => void
    showPopup?: (params: unknown, cb: (id: string) => void) => void
    sendData?: (data: string) => void
    enableClosingConfirmation?: () => void
    disableClosingConfirmation?: () => void
    onEvent?: (event: string, cb: (...args: unknown[]) => void) => void
    offEvent?: (event: string, cb: (...args: unknown[]) => void) => void
    requestWriteAccess?: (cb: (ok: boolean) => void) => void
    setHeaderColor?: (color: string) => void
    setBackgroundColor?: (color: string) => void
}

// ============================================================
// TG ACCESS — hot reload'ga chidamli
// ============================================================
const DEV_TELEGRAM_ID = Number(import.meta.env.VITE_DEV_TELEGRAM_ID) || 6398568198

function getTg(): TelegramWebApp | null {
    if (typeof window === 'undefined') return null
    return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null
}

/** In-Telegram muhitmi? */
export function isInTelegram(): boolean {
    const tg = getTg()
    return !!tg && !!tg.initData
}

// ============================================================
// INIT
// ============================================================
export function initTelegram() {
    const tg = getTg()
    if (!tg) return
    try {
        tg.ready()
        tg.expand()
    } catch (e) {
        console.warn('[telegram] init xato', e)
    }
}

// ============================================================
// USER INFO
// ============================================================
export function getTelegramId(): number {
    return getTg()?.initDataUnsafe?.user?.id ?? DEV_TELEGRAM_ID
}

export function getTelegramFirstName(): string | undefined {
    return getTg()?.initDataUnsafe?.user?.first_name
}

export function getTelegramUsername(): string | undefined {
    return getTg()?.initDataUnsafe?.user?.username
}

export function getTelegramLanguageCode(): string | undefined {
    return getTg()?.initDataUnsafe?.user?.language_code
}

export function isTelegramPremiumUser(): boolean {
    return !!getTg()?.initDataUnsafe?.user?.is_premium
}

export function getStartParam(): string | null {
    return getTg()?.initDataUnsafe?.start_param ?? null
}

// ============================================================
// VERSION / PLATFORM
// ============================================================
export function getTelegramVersion(): string {
    return getTg()?.version ?? '6.0'
}

export function getTelegramPlatform(): Platform {
    return getTg()?.platform ?? 'unknown'
}

export function isVersionAtLeast(target: string): boolean {
    const tg = getTg()
    if (!tg) return false
    if (typeof tg.isVersionAtLeast === 'function') {
        try { return tg.isVersionAtLeast(target) } catch { /* fall through */ }
    }
    const a = String(tg.version ?? '6.0').split('.').map(Number)
    const b = target.split('.').map(Number)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0
        const y = b[i] ?? 0
        if (x > y) return true
        if (x < y) return false
    }
    return true
}

// ============================================================
// VIEWPORT (klaviatura tracking)
// ============================================================
export function getViewportHeight(): number {
    return getTg()?.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
}

export function getViewportStableHeight(): number {
    return getTg()?.viewportStableHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
}

/** Viewport o'zgarishini kuzatish (klaviatura ochilishi/yopilishi). */
export function onViewportChange(cb: (h: number) => void): () => void {
    const tg = getTg()
    if (!tg?.onEvent) return () => { }
    const handler = () => cb(tg.viewportHeight)
    tg.onEvent('viewportChanged', handler)
    return () => { tg.offEvent?.('viewportChanged', handler) }
}

// ============================================================
// THEME
// ============================================================
export function getColorScheme(): ColorScheme {
    return getTg()?.colorScheme ?? 'light'
}

export function onThemeChange(cb: (scheme: ColorScheme) => void): () => void {
    const tg = getTg()
    if (!tg?.onEvent) return () => { }
    const handler = () => cb(tg.colorScheme)
    tg.onEvent('themeChanged', handler)
    return () => { tg.offEvent?.('themeChanged', handler) }
}

// ============================================================
// HAPTICS
// ============================================================
export function hapticImpact(style: HapticStyle = 'light') {
    try { getTg()?.HapticFeedback?.impactOccurred?.(style) } catch { /* noop */ }
}
export function hapticNotify(type: HapticNotify) {
    try { getTg()?.HapticFeedback?.notificationOccurred?.(type) } catch { /* noop */ }
}
export function hapticSelection() {
    try { getTg()?.HapticFeedback?.selectionChanged?.() } catch { /* noop */ }
}

// ============================================================
// BACK BUTTON
// ============================================================
/** BackButton'ni ko'rsatish + handler. Unsubscribe qaytaradi. */
export function showBackButton(onClick: () => void): () => void {
    const tg = getTg()
    if (!tg?.BackButton || !isVersionAtLeast('6.1')) return () => { }
    try {
        tg.BackButton.onClick(onClick)
        tg.BackButton.show()
    } catch { /* noop */ }
    return () => {
        try {
            tg.BackButton?.offClick(onClick)
            tg.BackButton?.hide()
        } catch { /* noop */ }
    }
}

// ============================================================
// MAIN BUTTON
// ============================================================
export interface MainButtonOptions {
    text: string
    onClick: () => void
    color?: string
    textColor?: string
    isActive?: boolean
    showProgress?: boolean
}
/** MainButton'ni ko'rsatish + konfiguratsiya. Unsubscribe qaytaradi. */
export function showMainButton(opts: MainButtonOptions): () => void {
    const tg = getTg()
    if (!tg?.MainButton || !isVersionAtLeast('6.1')) return () => { }
    try {
        tg.MainButton.setParams({
            text: opts.text,
            color: opts.color,
            text_color: opts.textColor,
            is_active: opts.isActive ?? true,
            is_visible: true,
        })
        tg.MainButton.onClick(opts.onClick)
        if (opts.showProgress) tg.MainButton.showProgress(false)
        tg.MainButton.show()
    } catch { /* noop */ }
    return () => {
        try {
            tg.MainButton?.offClick(opts.onClick)
            tg.MainButton?.hideProgress()
            tg.MainButton?.hide()
        } catch { /* noop */ }
    }
}

// ============================================================
// CLOSING CONFIRMATION
// ============================================================
export function enableClosingConfirmation() {
    try { getTg()?.enableClosingConfirmation?.() } catch { /* noop */ }
}
export function disableClosingConfirmation() {
    try { getTg()?.disableClosingConfirmation?.() } catch { /* noop */ }
}

// ============================================================
// CLOUD STORAGE (Telegram 6.9+) — Telegram serverida saqlash
// ============================================================
export function isCloudStorageSupported(): boolean {
    return !!getTg()?.CloudStorage && isVersionAtLeast('6.9')
}

export function cloudSetItem(key: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
        const cs = getTg()?.CloudStorage
        if (!cs) return resolve(false)
        try {
            cs.setItem(key, value, (err, ok) => resolve(!err && ok))
        } catch { resolve(false) }
    })
}

export function cloudGetItem(key: string): Promise<string | null> {
    return new Promise((resolve) => {
        const cs = getTg()?.CloudStorage
        if (!cs) return resolve(null)
        try {
            cs.getItem(key, (err, v) => resolve(err ? null : v))
        } catch { resolve(null) }
    })
}

export function cloudRemoveItem(key: string): Promise<boolean> {
    return new Promise((resolve) => {
        const cs = getTg()?.CloudStorage
        if (!cs) return resolve(false)
        try {
            cs.removeItem(key, (err, ok) => resolve(!err && ok))
        } catch { resolve(false) }
    })
}

// ============================================================
// INVOICE (Stars / XTR)
// ============================================================
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unsupported'

export function openInvoice(link: string): Promise<InvoiceStatus> {
    return new Promise((resolve) => {
        const tg = getTg()
        if (!tg) {
            try { window.open(link, '_blank') } catch { /* noop */ }
            resolve('pending')
            return
        }
        if (!isVersionAtLeast('6.1') || typeof tg.openInvoice !== 'function') {
            resolve('unsupported')
            return
        }
        try {
            tg.openInvoice(link, (status: string) => {
                resolve((status as InvoiceStatus) ?? 'failed')
            })
        } catch {
            resolve('unsupported')
        }
    })
}

// ============================================================
// DIALOGS
// ============================================================
export function showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
        const tg = getTg()
        if (tg?.showAlert && isVersionAtLeast('6.2')) {
            try {
                tg.showAlert(message, () => resolve())
                return
            } catch { /* fall through */ }
        }
        try { window.alert(message) } catch { /* noop */ }
        resolve()
    })
}

export function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const tg = getTg()
        if (tg?.showConfirm && isVersionAtLeast('6.2')) {
            try {
                tg.showConfirm(message, (ok: boolean) => resolve(!!ok))
                return
            } catch { /* fall through */ }
        }
        try { resolve(!!window.confirm(message)) } catch { resolve(false) }
    })
}

export type PopupButton = {
    id?: string
    type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'
    text?: string
}

export function showPopup(opts: {
    title?: string
    message: string
    buttons?: PopupButton[]
}): Promise<string | null> {
    return new Promise((resolve) => {
        const tg = getTg()
        const buttons = opts.buttons ?? [{ type: 'ok', id: 'ok' }]

        if (tg?.showPopup && isVersionAtLeast('6.2')) {
            try {
                tg.showPopup(
                    {
                        title: opts.title?.slice(0, 64),
                        message: opts.message.slice(0, 256),
                        buttons: buttons.slice(0, 3).map((b, i) => ({
                            id: b.id ?? String(i),
                            type: b.type ?? 'default',
                            text: b.text?.slice(0, 64),
                        })),
                    },
                    (id: string) => resolve(id ?? null)
                )
                return
            } catch { /* fall through */ }
        }

        const primary = buttons.find(b => b.type !== 'cancel' && b.type !== 'close')
        const cancel = buttons.find(b => b.type === 'cancel' || b.type === 'close')
        if (primary && cancel) {
            const ok = window.confirm(opts.message)
            resolve(ok ? (primary.id ?? '0') : (cancel.id ?? null))
        } else {
            window.alert(opts.message)
            resolve(primary?.id ?? 'ok')
        }
    })
}

// ============================================================
// MISC
// ============================================================
export function closeTelegramApp() {
    try { getTg()?.close() } catch { /* noop */ }
}

export function setHeaderColor(color: string) {
    try { getTg()?.setHeaderColor?.(color) } catch { /* noop */ }
}

export function setBackgroundColor(color: string) {
    try { getTg()?.setBackgroundColor?.(color) } catch { /* noop */ }
}