import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './supabase'
import { getTelegramId } from './telegram'
import { useTranslation, getLang } from './i18n'

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 }

interface Props {
    onBack: () => void
    onUpgrade: () => void
    onReferral: () => void
}

interface PremiumInfo {
    isPremium: boolean
    isTrial: boolean
    plan: string | null
    premiumUntil: string | null
    daysLeft: number
    totalDays: number
}

const PLAN_EMOJI: Record<string, string> = {
    weekly: '⚡',
    monthly: '🌙',
    yearly: '👑',
    trial: '🎁',
}

const PLAN_DAYS: Record<string, number> = {
    weekly: 7,
    monthly: 30,
    yearly: 365,
    trial: 7,
}

export default function PremiumSettingsScreen({ onBack, onUpgrade, onReferral }: Props) {
    const { t } = useTranslation()
    const [info, setInfo] = useState<PremiumInfo | null>(null)
    const [loading, setLoading] = useState(true)

    const planLabel = (key: string | null) => {
        if (!key) return ''
        switch (key) {
            case 'weekly': return t('prem_plan_weekly')
            case 'monthly': return t('prem_plan_monthly')
            case 'yearly': return t('prem_plan_yearly')
            case 'trial': return t('prem_plan_trial')
            default: return ''
        }
    }

    const COMPARE = [
        { icon: '🤖', label: t('prem_feat_ai'), free: `3${t('prem_per_day')}`, premium: t('prem_unlimited') },
        { icon: '📊', label: t('prem_feat_forecast'), free: '—', premium: '✓' },
        { icon: '✨', label: t('prem_feat_skins'), free: t('prem_skin_free'), premium: t('prem_skin_premium') },
        { icon: '📅', label: t('prem_feat_export'), free: '—', premium: '✓' },
        { icon: '🎯', label: t('prem_feat_goals'), free: '—', premium: '✓' },
    ]

    const REFERRAL_TIERS = [
        { count: 1, label: `+3 ${t('prem_days')}` },
        { count: 3, label: `+7 ${t('prem_days')}` },
    ]

    useEffect(() => {
        (async () => {
            const tgId = getTelegramId()
            if (!tgId) { setLoading(false); return }

            const { data: user } = await supabase
                .from('users')
                .select('premium_until, subscription_plan, trial_used')
                .eq('telegram_id', tgId)
                .maybeSingle()

            if (!user) { setLoading(false); return }

            const until = user.premium_until ? new Date(user.premium_until) : null
            const now = new Date()
            const isActive = until ? until > now : false
            const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86400000)) : 0
            const planKey = user.subscription_plan || (user.trial_used ? 'trial' : null)
            const totalDays = planKey ? (PLAN_DAYS[planKey] ?? 30) : 30

            setInfo({
                isPremium: isActive,
                isTrial: !user.subscription_plan && !!user.trial_used && isActive,
                plan: planKey,
                premiumUntil: user.premium_until || null,
                daysLeft,
                totalDays,
            })
            setLoading(false)
        })()
    }, [])

    const formatDate = (iso: string | null) => {
        if (!iso) return '—'
        const lang = getLang()
        const localeMap: Record<string, string> = {
            'uz-Latn': 'uz-UZ',
            'uz-Cyrl': 'uz-UZ',
            'ru': 'ru-RU',
            'en': 'en-US',
        }
        return new Date(iso).toLocaleDateString(localeMap[lang] || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    }

    const progress = info && info.totalDays > 0 ? Math.min(100, (info.daysLeft / info.totalDays) * 100) : 0
    const planEmoji = info?.plan ? PLAN_EMOJI[info.plan] : null

    return (
        <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--color-bg)', fontFamily: FONT }}>
            <div className="pointer-events-none absolute -top-32 -right-24 w-72 h-72 rounded-full blur-3xl opacity-30"
                style={{ background: 'radial-gradient(circle, #5B6AD0 0%, transparent 70%)' }} />
            <div className="pointer-events-none absolute top-40 -left-20 w-60 h-60 rounded-full blur-3xl opacity-20"
                style={{ background: 'radial-gradient(circle, #EC4899 0%, transparent 70%)' }} />

            <div className="sticky top-0 z-20 backdrop-blur-xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}>
                <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="p-1 text-2xl text-[#1c1917] dark:text-white">
                    ‹
                </motion.button>
                <h1 className="text-lg font-bold text-[#1c1917] dark:text-white">{t('prem_title')}</h1>
            </div>

            {loading ? (
                <div className="p-10 flex justify-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-8 h-8 border-2 border-[#5B6AD0] border-t-transparent rounded-full" />
                </div>
            ) : (
                <div className="px-4 py-4 space-y-3 relative max-w-md mx-auto">

                    {/* Status card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={SPRING}
                        className="relative rounded-3xl p-6 overflow-hidden"
                        style={{
                            background: info?.isPremium
                                ? 'linear-gradient(135deg, #5B6AD0 0%, #7C5BD0 50%, #D05BC2 100%)'
                                : 'linear-gradient(135deg, #2A3340 0%, #3A4350 100%)',
                            boxShadow: info?.isPremium
                                ? '0 20px 60px -15px rgba(91, 106, 208, 0.5)'
                                : '0 10px 30px -10px rgba(0,0,0,0.2)',
                        }}
                    >
                        {info?.isPremium && (
                            <motion.div
                                className="absolute inset-0 opacity-30"
                                style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)' }}
                                animate={{ backgroundPositionX: ['-200%', '200%'] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            />
                        )}

                        {info?.isPremium && [0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute text-white/80"
                                style={{ top: `${15 + i * 25}%`, right: `${10 + i * 12}%`, fontSize: `${14 + i * 2}px` }}
                                animate={{ y: [-4, 4, -4], opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 2 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                            >
                                ✨
                            </motion.div>
                        ))}

                        <div className="relative">
                            <div className="flex items-start justify-between mb-4">
                                <motion.div
                                    initial={{ rotate: -10, scale: 0.8 }}
                                    animate={{ rotate: 0, scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                                    style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)' }}
                                >
                                    👑
                                </motion.div>
                                {planEmoji && <div className="text-3xl">{planEmoji}</div>}
                            </div>

                            <div className="text-white/80 text-sm font-medium mb-1">
                                {info?.isPremium ? (planLabel(info.plan) || t('prem_title')) : t('prem_free_plan')}
                            </div>
                            <div className="text-white text-2xl font-bold mb-4">
                                {info?.isPremium ? (info.isTrial ? t('prem_trial_active') : t('prem_active')) : t('prem_upgrade_title')}
                            </div>

                            {info?.isPremium && info.premiumUntil && (
                                <>
                                    <div className="flex items-end justify-between mb-2">
                                        <div>
                                            <div className="text-white/70 text-xs">{t('prem_remaining')}</div>
                                            <div className="text-white text-3xl font-bold leading-none">
                                                {info.daysLeft}<span className="text-base font-medium text-white/70 ml-1">{t('prem_days')}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white/70 text-xs">{t('prem_expires')}</div>
                                            <div className="text-white text-sm font-semibold">{formatDate(info.premiumUntil)}</div>
                                        </div>
                                    </div>

                                    <div className="h-2 rounded-full bg-white/20 overflow-hidden mt-3">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                                            className="h-full rounded-full"
                                            style={{ background: 'linear-gradient(90deg, #FFD93D 0%, #FFA800 100%)' }}
                                        />
                                    </div>
                                </>
                            )}

                            {!info?.isPremium && (
                                <div className="text-white/70 text-sm">
                                    {t('prem_upgrade_sub')}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* CTA */}
                    {!info?.isPremium && (
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={onUpgrade}
                            className="relative w-full rounded-2xl py-4 font-bold text-white overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #5B6AD0 0%, #7C5BD0 100%)',
                                boxShadow: '0 10px 30px -10px rgba(91, 106, 208, 0.6)',
                            }}
                        >
                            <motion.div
                                className="absolute inset-0 opacity-40"
                                style={{ background: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)' }}
                                animate={{ backgroundPositionX: ['-200%', '200%'] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                            />
                            <span className="relative">{t('prem_cta')}</span>
                        </motion.button>
                    )}

                    {/* Compare card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="rounded-2xl p-4 bg-white dark:bg-[#2A3340]"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="font-bold text-[#1c1917] dark:text-white">{t('prem_features')}</div>
                            <div className="flex gap-3 text-[10px] font-semibold uppercase tracking-wide">
                                <span className="text-[#78716c] w-12 text-right">{t('prem_free')}</span>
                                <span className="text-[#5B6AD0] w-12 text-right">{t('prem_premium')}</span>
                            </div>
                        </div>
                        <div className="space-y-2.5">
                            {COMPARE.map((c, i) => (
                                <motion.div
                                    key={c.label}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.25 + i * 0.04 }}
                                    className="flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-lg">{c.icon}</span>
                                        <span className="text-sm text-[#1c1917] dark:text-white">{c.label}</span>
                                    </div>
                                    <div className="flex gap-3 text-sm">
                                        <span className="text-[#78716c] w-12 text-right">{c.free}</span>
                                        <span className="text-[#5B6AD0] dark:text-[#7C8AE0] font-bold w-12 text-right">{c.premium}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Referral card with tiers */}
                    <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onReferral}
                        className="relative w-full rounded-2xl p-4 overflow-hidden text-left"
                        style={{ background: 'linear-gradient(135deg, #FFF4D6 0%, #FAD9C8 100%)' }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <motion.div
                                animate={{ rotate: [0, -10, 10, -10, 0] }}
                                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                                className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white text-2xl"
                            >
                                🎁
                            </motion.div>
                            <div className="flex-1">
                                <div className="font-bold text-[#1c1917]">{t('prem_referral_title')}</div>
                                <div className="text-xs text-[#78716c] mt-0.5">{t('prem_referral_sub')}</div>
                            </div>
                            <div className="text-2xl text-[#78716c]">›</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {REFERRAL_TIERS.map((tier) => (
                                <div key={tier.count} className="bg-white/70 rounded-xl p-2 text-center">
                                    <div className="text-base font-bold text-[#1c1917]">{tier.count} {t('prem_referral_friend')}</div>
                                    <div className="text-[11px] text-[#D97706] font-semibold mt-0.5">{tier.label}</div>
                                </div>
                            ))}
                        </div>
                    </motion.button>

                    {/* Manage info */}
                    {info?.isPremium && info.plan && info.plan !== 'trial' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="rounded-2xl p-4 bg-white/60 dark:bg-[#2A3340]/60 backdrop-blur"
                        >
                            <div className="text-xs text-[#78716c] leading-relaxed">
                                {t('prem_manage_note')}
                            </div>
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    )
}