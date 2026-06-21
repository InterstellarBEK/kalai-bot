import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getTelegramId } from './telegram'
import { useTranslation } from './i18n'

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 }
const BOT_URL = import.meta.env.VITE_BOT_URL || 'https://kalai-bot.onrender.com'

type Plan = 'weekly' | 'monthly' | 'yearly'

interface Props {
    plan: Plan
    onClose: () => void
}

interface PaymentData {
    payment_id: number
    card_number: string
    card_holder: string
    bank_name: string
    total_amount: number
    base_amount: number
    suffix: number
    expires_at: string
}

function fmt(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export default function P2PPaymentModal({ plan, onClose }: Props) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<PaymentData | null>(null)
    const [copied, setCopied] = useState<'card' | 'amount' | null>(null)
    const [secondsLeft, setSecondsLeft] = useState<number>(0)

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${BOT_URL}/api/p2p/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegram_id: getTelegramId(), plan }),
                })
                const json = await res.json()
                if (!res.ok || json.error) throw new Error(json.error || json.message || t('p2p_network_error'))
                setData(json)
            } catch (e: any) {
                setError(e.message || t('p2p_network_error'))
            } finally {
                setLoading(false)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan])

    useEffect(() => {
        if (!data?.expires_at) return
        const tick = () => {
            const ms = new Date(data.expires_at).getTime() - Date.now()
            setSecondsLeft(Math.max(0, Math.floor(ms / 1000)))
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [data?.expires_at])

    const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
    const ss = (secondsLeft % 60).toString().padStart(2, '0')

    async function copy(value: string, kind: 'card' | 'amount') {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(kind)
            setTimeout(() => setCopied(null), 1800)
        } catch { }
    }

    const amountStr = data ? data.total_amount.toLocaleString('ru') : ''

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
                onClick={onClose}
                style={{ fontFamily: FONT }}
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={SPRING}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-[#ECEEF5] dark:bg-[#0F1419] rounded-t-[2rem] sm:rounded-[2rem] p-5 pb-8 max-h-[92vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-extrabold text-stone-900 dark:text-slate-100">
                            {t('p2p_title')}
                        </h2>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-white dark:bg-[#1E252E] flex items-center justify-center text-stone-600 dark:text-slate-300 font-bold"
                        >
                            ✕
                        </button>
                    </div>

                    {loading && (
                        <div className="py-12 text-center text-stone-500 dark:text-slate-400 font-semibold">
                            {t('p2p_loading')}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-2xl p-4 text-sm font-semibold text-center">
                            ❌ {error}
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Timer */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 mb-4 flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                    {t('p2p_timer_label')}
                                </span>
                                <span className="text-base font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                                    {mm}:{ss}
                                </span>
                            </div>

                            {/* Amount */}
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-3"
                                style={{ border: '1.5px solid #E4E7F0' }}
                            >
                                <div className="text-[10px] font-extrabold text-stone-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                    {t('p2p_amount_label')}
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 tabular-nums">
                                        {amountStr} <span className="text-sm font-bold text-stone-500">UZS</span>
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => copy(String(data.total_amount), 'amount')}
                                        className="px-3 py-2 rounded-xl text-xs font-extrabold text-white"
                                        style={{ background: 'linear-gradient(135deg,#5B6AD0,#7A8AE8)' }}
                                    >
                                        {copied === 'amount' ? t('p2p_copied') : t('p2p_copy')}
                                    </motion.button>
                                </div>
                                <div className="text-[11px] text-stone-500 dark:text-slate-400 mt-2 font-semibold">
                                    {fmt(t('p2p_amount_hint'), { amount: amountStr, suffix: data.suffix })}
                                </div>
                            </div>

                            {/* Card */}
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-3"
                                style={{ border: '1.5px solid #E4E7F0' }}
                            >
                                <div className="text-[10px] font-extrabold text-stone-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                    {fmt(t('p2p_card_label'), { bank: data.bank_name })}
                                </div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-lg font-extrabold text-stone-900 dark:text-slate-100 tracking-wider tabular-nums">
                                        {data.card_number.replace(/(\d{4})/g, '$1 ').trim()}
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => copy(data.card_number.replace(/\s/g, ''), 'card')}
                                        className="px-3 py-2 rounded-xl text-xs font-extrabold text-white"
                                        style={{ background: 'linear-gradient(135deg,#5B6AD0,#7A8AE8)' }}
                                    >
                                        {copied === 'card' ? t('p2p_copied') : t('p2p_copy')}
                                    </motion.button>
                                </div>
                                <div className="text-sm font-bold text-stone-700 dark:text-slate-300">
                                    {data.card_holder}
                                </div>
                            </div>

                            {/* Instructions */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 mb-3">
                                <div className="text-xs font-extrabold text-blue-700 dark:text-blue-300 mb-2">
                                    {t('p2p_instructions_title')}
                                </div>
                                <ol className="text-[12px] text-blue-800 dark:text-blue-200 space-y-1.5 list-decimal pl-4 font-semibold">
                                    <li>{fmt(t('p2p_step1'), { amount: amountStr })}</li>
                                    <li>{t('p2p_step2')}</li>
                                    <li>{t('p2p_step3')}</li>
                                </ol>
                            </div>

                            <div className="text-[10px] text-center text-stone-400 dark:text-slate-500 font-semibold">
                                {fmt(t('p2p_footer'), { id: data.payment_id, suffix: data.suffix })}
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}