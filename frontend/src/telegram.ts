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