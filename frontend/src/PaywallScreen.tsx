import { useState, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import Bekjon from './components/Bekjon'
import { supabase } from './supabase'
import { getTelegramId, openInvoice } from './telegram'
import { useTranslation } from './i18n'
import P2PPaymentModal from './P2PPaymentModal'

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 }
const BOT_URL = import.meta.env.VITE_BOT_URL || 'https://kalai-bot.onrender.com'

type Plan = 'weekly' | 'monthly' | 'yearly'

interface PlanData {
    id: Plan
    title: string
    stars: number
    uzs: number
    uzsOld: number
    days: number
    badge?: string
    perDay: string
    save?: string
}

function AnimatedCount({ to }: { to: number }) {
    const count = useMotionValue(0)
    const rounded = useTransform(count, (v) => Math.round(v).toLocaleString('ru'))
    useEffect(() => {
        const controls = animate(count, to, { duration: 1.8, ease: 'easeOut' })
        return controls.stop
    }, [to])
    return <motion.span>{rounded}</motion.span>
}

export default function PaywallScreen({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation()
    const [selected, setSelected] = useState<Plan>('monthly')
    const [loading, setLoading] = useState(false)
    const [trialLoading, setTrialLoading] = useState(false)
    const [trialUsed, setTrialUsed] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [showP2P, setShowP2P] = useState(false)

    const PLANS: PlanData[] = [
        { id: 'weekly', title: t('paywall_plan_weekly'), stars: 50, uzs: 5000, uzsOld: 7000, days: 7, perDay: t('paywall_per_day_w') },
        { id: 'monthly', title: t('paywall_plan_monthly'), stars: 150, uzs: 15000, uzsOld: 25000, days: 30, badge: t('paywall_badge_popular'), perDay: t('paywall_per_day_m'), save: '40%' },
        { id: 'yearly', title: t('paywall_plan_yearly'), stars: 1200, uzs: 120000, uzsOld: 300000, days: 365, badge: t('paywall_badge_discount'), perDay: t('paywall_per_day_y'), save: '60%' },
    ]

    const COMPARE = [
        { feature: t('paywall_feat_ai'), free: t('paywall_per_day_free'), premium: t('paywall_unlimited') },
        { feature: t('paywall_feat_local'), free: '✓', premium: '✓' },
        { feature: t('paywall_feat_streak'), free: '✓', premium: '✓' },
        { feature: t('paywall_feat_analytics'), free: '—', premium: t('paywall_analytics_value') },
        { feature: t('paywall_feat_goals'), free: '—', premium: '✓' },
        { feature: t('paywall_feat_export'), free: '—', premium: '✓' },
        { feature: t('paywall_feat_skins'), free: '—', premium: t('paywall_all') },
        { feature: t('paywall_feat_ads'), free: t('paywall_yes'), premium: t('paywall_no') },
    ]

    const selectedPlan = PLANS.find((p) => p.id === selected)!

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('users')
                .select('trial_used')
                .eq('telegram_id', getTelegramId())
                .maybeSingle()
            setTrialUsed(!!data?.trial_used)
        })()
    }, [])

    async function handleTrial() {
        setTrialLoading(true)
        setError(null)
        try {
            const { data, error } = await supabase.rpc('activate_trial', {
                p_telegram_id: getTelegramId(),
            })
            if (error) throw error
            if (data?.success) {
                setSuccess(t('paywall_trial_success'))
                setTrialUsed(true)
                setTimeout(() => onClose?.(), 2000)
            } else {
                setError(t('paywall_trial_used'))
                setTrialUsed(true)
            }
        } catch (e: any) {
            setError(e.message || t('paywall_error'))
        } finally {
            setTrialLoading(false)
        }
    }

    async function handleBuy() {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${BOT_URL}/api/create-invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id: getTelegramId(), plan: selected }),
            })
            const data = await res.json()
            if (!res.ok || !data.invoice_link) {
                throw new Error(data.error || t('paywall_invoice_error'))
            }
            const status = await openInvoice(data.invoice_link)
            if (status === 'paid') {
                setError(null)
                onClose?.()
            } else if (status === 'failed') {
                setError(t('paywall_payment_failed'))
            }
        } catch (e: any) {
            setError(e.message || t('paywall_error'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="min-h-screen bg-[#ECEEF5] dark:bg-[#0F1419] pb-32 relative" style={{ fontFamily: FONT }}>
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/80 dark:bg-[#1E252E]/80 backdrop-blur flex items-center justify-center text-stone-600 dark:text-slate-300 font-bold text-lg"
                    style={{ boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)' }}
                >
                    ✕
                </button>
            )}

            {/* --- HERO --- */}
            <div className="relative overflow-hidden">
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(180deg, rgba(91,106,208,0.22) 0%, rgba(91,106,208,0) 100%)',
                    }}
                />
                {[...Array(10)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute text-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0], y: [0, -25, -50] }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            delay: i * 0.35,
                            ease: 'easeOut',
                        }}
                        style={{
                            left: `${5 + i * 9.5}%`,
                            top: `${25 + (i % 3) * 18}%`,
                        }}
                    >
                        ✨
                    </motion.div>
                ))}

                <div className="max-w-md mx-auto px-5 pt-12 pb-4 relative">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={SPRING}
                        className="flex flex-col items-center"
                    >
                        <div className="relative">
                            <div
                                className="absolute inset-0 blur-3xl rounded-full"
                                style={{ background: 'radial-gradient(circle, rgba(91,106,208,0.5) 0%, transparent 70%)' }}
                            />
                            <motion.div
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                                className="relative"
                            >
                                <Bekjon mood="celebration" size={130} />
                            </motion.div>
                        </div>

                        <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ ...SPRING, delay: 0.1 }}
                            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
                            style={{ background: 'linear-gradient(135deg, #5B6AD0 0%, #7A8AE8 100%)' }}
                        >
                            <span className="text-xs">👑</span>
                            <span className="text-white text-[11px] font-extrabold uppercase tracking-wider">
                                {t('prem_premium')}
                            </span>
                        </motion.div>

                        <h1 className="text-[28px] font-extrabold mt-3 text-stone-900 dark:text-slate-100 leading-tight text-center">
                            {t('paywall_hero_pre')}<br />
                            <span style={{ background: 'linear-gradient(135deg, #5B6AD0, #EF9F27)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {t('paywall_hero_emphasis')}
                            </span>
                            {t('paywall_hero_post') ? <> {t('paywall_hero_post')}</> : null}
                        </h1>
                        <p className="text-sm font-semibold text-stone-500 dark:text-slate-400 mt-2 text-center px-4">
                            {t('paywall_hero_sub')}
                        </p>
                    </motion.div>

                    {/* SOCIAL PROOF BAR */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...SPRING, delay: 0.2 }}
                        className="bg-white dark:bg-[#1E252E] rounded-2xl px-4 py-3 mt-5 flex items-center justify-around"
                        style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.18)' }}
                    >
                        <div className="text-center">
                            <div className="text-lg font-extrabold" style={{ color: '#5B6AD0' }}>
                                <AnimatedCount to={1247} />+
                            </div>
                            <div className="text-[10px] font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wide">
                                {t('paywall_stat1_label')}
                            </div>
                        </div>
                        <div className="w-px h-8 bg-stone-200 dark:bg-slate-700" />
                        <div className="text-center">
                            <div className="text-lg font-extrabold flex items-center justify-center gap-0.5" style={{ color: '#EF9F27' }}>
                                4.9 <span className="text-sm">★</span>
                            </div>
                            <div className="text-[10px] font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wide">
                                {t('paywall_stat2_label')}
                            </div>
                        </div>
                        <div className="w-px h-8 bg-stone-200 dark:bg-slate-700" />
                        <div className="text-center">
                            <div className="text-lg font-extrabold" style={{ color: '#1D9E75' }}>
                                <AnimatedCount to={89} />%
                            </div>
                            <div className="text-[10px] font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wide">
                                {t('paywall_stat3_label')}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-md mx-auto px-4 mt-4">
                {/* --- TRIAL CTA --- */}
                {trialUsed === false && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.25 }}
                        className="rounded-2xl p-4 mb-4 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #1D9E75 0%, #2BC18C 100%)',
                            boxShadow: '0 10px 28px -10px rgba(29, 158, 117, 0.5)',
                        }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="text-3xl">🎁</div>
                            <div className="flex-1">
                                <div className="text-white text-base font-extrabold leading-tight">
                                    {t('paywall_trial_title')}
                                </div>
                                <div className="text-white/85 text-xs font-semibold mt-0.5">
                                    {t('paywall_trial_sub')}
                                </div>
                            </div>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleTrial}
                            disabled={trialLoading}
                            className="w-full bg-white font-extrabold py-3 rounded-xl disabled:opacity-60"
                            style={{ color: '#1D9E75' }}
                        >
                            {trialLoading ? t('paywall_loading') : t('paywall_trial_btn')}
                        </motion.button>
                    </motion.div>
                )}

                {/* --- COMPARISON TABLE --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.3 }}
                    className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-4"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.15)' }}
                >
                    <div className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider mb-3 text-center">
                        {t('paywall_compare_title')}
                    </div>
                    <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr] gap-x-2 gap-y-2 items-center">
                        <div></div>
                        <div className="text-center text-[11px] font-extrabold text-stone-500 dark:text-slate-400 uppercase">
                            {t('paywall_free')}
                        </div>
                        <div className="text-center text-[11px] font-extrabold uppercase" style={{ color: '#5B6AD0' }}>
                            {t('paywall_premium')}
                        </div>
                        {COMPARE.map((row) => (
                            <div key={row.feature} className="contents">
                                <div className="text-[12px] font-semibold text-stone-700 dark:text-slate-300">
                                    {row.feature}
                                </div>
                                <div className="text-center text-[12px] font-bold text-stone-400 dark:text-slate-500">
                                    {row.free}
                                </div>
                                <div className="text-center text-[12px] font-extrabold" style={{ color: '#5B6AD0' }}>
                                    {row.premium}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* --- TESTIMONIAL --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.35 }}
                    className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-4"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.15)' }}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #EF9F27, #FFC56F)' }}
                        >
                            MA
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-extrabold text-stone-900 dark:text-slate-100">Mansur A.</span>
                                <span className="text-[11px] font-semibold text-stone-400">·</span>
                                <span className="text-[11px] text-yellow-500">★★★★★</span>
                            </div>
                            <p className="text-[13px] font-medium text-stone-700 dark:text-slate-300 leading-snug">
                                {t('paywall_testimonial_text')}
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* --- PLANS --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.4 }}
                    className="mb-4"
                >
                    <div className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
                        {t('paywall_select_plan')}
                    </div>
                    <div className="space-y-2.5">
                        {PLANS.map((p) => {
                            const active = selected === p.id
                            return (
                                <motion.button
                                    key={p.id}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelected(p.id)}
                                    className="w-full rounded-2xl p-4 pt-5 text-left transition-all relative overflow-hidden bg-white dark:bg-[#1E252E]"
                                    style={{
                                        background: active
                                            ? 'linear-gradient(135deg, #5B6AD0 0%, #7A8AE8 100%)'
                                            : undefined,
                                        border: active ? '2px solid #5B6AD0' : '2px solid transparent',
                                        boxShadow: active
                                            ? '0 10px 28px -10px rgba(91, 106, 208, 0.5)'
                                            : '0 4px 12px -6px rgba(91, 106, 208, 0.12)',
                                    }}
                                >
                                    {p.badge && (
                                        <div
                                            className="absolute top-0 right-4 px-2.5 py-1 rounded-b-xl text-[10px] font-extrabold"
                                            style={{
                                                background: active ? '#fff' : '#EF9F27',
                                                color: active ? '#5B6AD0' : '#fff',
                                            }}
                                        >
                                            {p.badge}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{
                                                    background: active ? '#fff' : 'transparent',
                                                    border: `2px solid ${active ? '#fff' : '#CBD0DE'}`,
                                                }}
                                            >
                                                {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#5B6AD0' }} />}
                                            </div>

                                            <div>
                                                <div className={`text-base font-extrabold flex items-center gap-2 ${active ? 'text-white' : 'text-stone-900 dark:text-slate-100'}`}>
                                                    {p.title}
                                                    {p.save && (
                                                        <span
                                                            className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md"
                                                            style={{
                                                                background: active ? 'rgba(255,255,255,0.25)' : '#FFE8C7',
                                                                color: active ? '#fff' : '#B8650F',
                                                            }}
                                                        >
                                                            -{p.save}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`text-xs font-semibold mt-0.5 ${active ? 'text-white/85' : 'text-stone-500 dark:text-slate-400'}`}>
                                                    {p.perDay}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className={`text-base font-extrabold flex items-center justify-end gap-1 ${active ? 'text-white' : 'text-stone-900 dark:text-slate-100'}`}>
                                                <span>⭐</span>
                                                <span>{p.stars}</span>
                                            </div>
                                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                                <span className={`text-[10px] font-semibold line-through ${active ? 'text-white/60' : 'text-stone-400 dark:text-slate-500'}`}>
                                                    {p.uzsOld.toLocaleString('ru')}
                                                </span>
                                                <span className={`text-[11px] font-extrabold ${active ? 'text-white' : 'text-stone-700 dark:text-slate-300'}`}>
                                                    {p.uzs.toLocaleString('ru')} {t('paywall_currency')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.button>
                            )
                        })}
                    </div>
                </motion.div>

                {/* --- ALTERNATIVE PAYMENT METHODS (COMING SOON) --- */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.45 }}
                    className="mb-4"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-px bg-stone-200 dark:bg-slate-700/60" />
                        <span className="text-[10px] font-extrabold text-stone-400 dark:text-slate-500 uppercase tracking-wider px-2">
                            yoki UZS bilan to'lash
                        </span>
                        <div className="flex-1 h-px bg-stone-200 dark:bg-slate-700/60" />
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                        {/* P2P Card */}
                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowP2P(true)}
                            className="relative rounded-2xl p-4 overflow-hidden bg-white dark:bg-[#1E252E] text-left"
                            style={{
                                border: '1.5px solid #5B6AD0',
                                boxShadow: '0 6px 16px -6px rgba(91, 106, 208, 0.25)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg"
                                    style={{ background: 'linear-gradient(135deg, #5B6AD0, #7A8AE8)' }}
                                >
                                    💳
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-extrabold text-stone-900 dark:text-slate-100">
                                        Karta orqali to'lash
                                    </div>
                                    <div className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">
                                        Uzcard · Humo · {selectedPlan.uzs.toLocaleString('ru')} UZS
                                    </div>
                                </div>
                                <div className="text-stone-400 dark:text-slate-500 text-lg font-bold">›</div>
                            </div>
                        </motion.button>

                        {/* Click/Payme (Coming soon) */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <div
                                className="relative rounded-2xl p-3.5 overflow-hidden bg-white dark:bg-[#1E252E] cursor-not-allowed"
                                style={{
                                    border: '1.5px solid #E4E7F0',
                                    boxShadow: '0 4px 12px -6px rgba(91, 106, 208, 0.08)',
                                }}
                            >
                                <div className="absolute inset-0 bg-white/60 dark:bg-[#1E252E]/70 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-1.5">
                                    <div className="text-base">🔒</div>
                                    <div
                                        className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                                        style={{ background: 'linear-gradient(135deg, #EF9F27, #FFC56F)' }}
                                    >
                                        Tez orada
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-[11px]"
                                        style={{ background: 'linear-gradient(135deg, #00AEEF, #0086C9)' }}
                                    >
                                        C
                                    </div>
                                    <span className="text-sm font-extrabold text-stone-900 dark:text-slate-100">
                                        Click
                                    </span>
                                </div>
                                <div className="text-[10px] font-semibold text-stone-500 dark:text-slate-400 leading-tight">
                                    Karta yoki Click hisob
                                </div>
                            </div>

                            {/* Payme */}
                            <div
                                className="relative rounded-2xl p-3.5 overflow-hidden bg-white dark:bg-[#1E252E] cursor-not-allowed"
                                style={{
                                    border: '1.5px solid #E4E7F0',
                                    boxShadow: '0 4px 12px -6px rgba(91, 106, 208, 0.08)',
                                }}
                            >
                                <div className="absolute inset-0 bg-white/60 dark:bg-[#1E252E]/70 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-1.5">
                                    <div className="text-base">🔒</div>
                                    <div
                                        className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                                        style={{ background: 'linear-gradient(135deg, #EF9F27, #FFC56F)' }}
                                    >
                                        Tez orada
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-[11px]"
                                        style={{ background: 'linear-gradient(135deg, #33CCCC, #1FA8A8)' }}
                                    >
                                        P
                                    </div>
                                    <span className="text-sm font-extrabold text-stone-900 dark:text-slate-100">
                                        Payme
                                    </span>
                                </div>
                                <div className="text-[10px] font-semibold text-stone-500 dark:text-slate-400 leading-tight">
                                    Humo, Uzcard, Visa
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] text-center text-stone-400 dark:text-slate-500 mt-2.5 font-semibold">
                        Karta orqali — manual, 5 daqiqada avtomatik faollashadi
                    </p>
                </motion.div>

                {/* --- TRUST LINE --- */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-center justify-center gap-3 mb-4 text-[10px] font-bold text-stone-500 dark:text-slate-400 flex-wrap"
                >
                    <span>{t('paywall_trust_secure')}</span>
                    <span>{t('paywall_trust_instant')}</span>
                    <span>{t('paywall_trust_norenew')}</span>
                </motion.div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-2xl p-3 mb-3 text-sm font-semibold text-center">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-2xl p-3 mb-3 text-sm font-semibold text-center">
                        {success}
                    </div>
                )}
            </div>

            {/* --- STICKY CTA --- */}
            <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                transition={{ ...SPRING, delay: 0.2 }}
                className="fixed bottom-0 left-0 right-0 z-10"
            >
                <div
                    className="max-w-md mx-auto px-4 pb-4 pt-6"
                    style={{ background: 'linear-gradient(180deg, transparent 0%, #ECEEF5 40%)' }}
                >
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={handleBuy}
                        disabled={loading}
                        className="w-full text-white font-extrabold py-4 rounded-2xl disabled:opacity-60 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #5B6AD0 0%, #7A8AE8 100%)',
                            boxShadow: '0 12px 28px -8px rgba(91, 106, 208, 0.55)',
                        }}
                    >
                        <motion.div
                            className="absolute inset-0 opacity-30"
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
                                width: '50%',
                            }}
                        />
                        <span className="relative flex items-center justify-center gap-2 text-base">
                            {loading ? (
                                t('paywall_loading')
                            ) : (
                                <>
                                    <span>⭐ {selectedPlan.stars} Stars</span>
                                    <span className="opacity-60">·</span>
                                    <span>{selectedPlan.title} {t('paywall_subscription')}</span>
                                </>
                            )}
                        </span>
                    </motion.button>
                    <p className="text-[10px] text-center text-stone-400 dark:text-slate-500 mt-2 font-medium">
                        {t('paywall_footer')}
                    </p>
                </div>
            </motion.div>
            {showP2P && (
                <P2PPaymentModal plan={selected} onClose={() => setShowP2P(false)} />
            )}
        </motion.div>
    )
}