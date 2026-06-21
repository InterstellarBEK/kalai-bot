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
    // Manual fallback comparison
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

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unsupported'

/**
 * Open Telegram Stars / XTR invoice.
 * Returns 'unsupported' if WebApp version < 6.1 — caller should show update message.
 */
export function openInvoice(link: string): Promise<InvoiceStatus> {
    return new Promise((resolve) => {
        // No Telegram context at all (browser dev)
        if (!tg) {
            window.open(link, '_blank')
            resolve('pending')
            return
        }

        // openInvoice requires Bot API 6.1+
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
 * Show a Telegram-native alert (with fallback to browser alert).
 */
export function showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
        if (tg?.showAlert && isVersionAtLeast('6.2')) {
            try {
                tg.showAlert(message, () => resolve())
                return
            } catch { /* fall through */ }
        }
        try { window.alert(message) } catch { }
        resolve()
    })
}