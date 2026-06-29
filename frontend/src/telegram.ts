// Telegram WebApp helper
// Brauzerda test qilganda DEV_TELEGRAM_ID ishlaydi
const tg = (window as any).Telegram?.WebApp

const DEV_TELEGRAM_ID = 6398568198

export function initTelegram() {
    if (tg) {
        tg.ready()
        tg.expand()
    }
}

export function getTelegramId(): number {
    return tg?.initDataUnsafe?.user?.id ?? DEV_TELEGRAM_ID
}

export function getTelegramFirstName(): string | undefined {
    return tg?.initDataUnsafe?.user?.first_name
}

export function getStartParam(): string | null {
    return tg?.initDataUnsafe?.start_param ?? null
}

export function getTelegramVersion(): string {
    return tg?.version ?? '6.0'
}

export function isVersionAtLeast(target: string): boolean {
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

/** Haptic feedback wrapper (no-op outside Telegram or unsupported versions) */
export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
    try { tg?.HapticFeedback?.impactOccurred?.(style) } catch { /* noop */ }
}

export function hapticNotify(type: 'error' | 'success' | 'warning') {
    try { tg?.HapticFeedback?.notificationOccurred?.(type) } catch { /* noop */ }
}

export function hapticSelection() {
    try { tg?.HapticFeedback?.selectionChanged?.() } catch { /* noop */ }
}

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unsupported'

/**
 * Open Telegram Stars / XTR invoice.
 * Returns 'unsupported' if WebApp version < 6.1 — caller should show update message.
 */
export function openInvoice(link: string): Promise<InvoiceStatus> {
    return new Promise((resolve) => {
        if (!tg) {
            window.open(link, '_blank')
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

/**
 * Show a Telegram-native alert. Falls back to window.alert outside Telegram.
 * Use for error / info / success messages with a single OK button.
 */
export function showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
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

/**
 * Show a Telegram-native Yes/No confirm dialog.
 * Telegram localizes the buttons by user's Telegram language.
 * Returns true if user pressed OK/Yes, false if Cancel/No.
 * Falls back to window.confirm outside Telegram.
 */
export function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
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

/**
 * Show a Telegram-native popup with custom buttons (up to 3).
 * Returns the id of the pressed button, or null if dismissed.
 * Use for destructive confirms (e.g. delete) where button text needs to match app language.
 * Falls back to window.confirm outside Telegram (returns first non-cancel button id).
 */
export function showPopup(opts: {
    title?: string
    message: string
    buttons?: PopupButton[]
}): Promise<string | null> {
    return new Promise((resolve) => {
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

        // Browser fallback: if there's a destructive/non-cancel button, ask confirm
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