import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from './supabase'
import { getTelegramId, getTelegramFirstName } from './telegram'
import { useTranslation } from './i18n'
import Bekjon from './components/Bekjon'

interface ReferralScreenProps {
    onClose: () => void
}

interface Stats {
    total_referrals: number
    bonus_days_earned: number
    next_tier_needed: number
    current_tier: number
}

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 }
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'kalai_test_bot'

// ── Iconly-style SVG icons ────────────────────────────────
type RIconName =
    | 'sparkle' | 'star' | 'crown' | 'heart' | 'gift' | 'rocket' | 'bolt'
    | 'link' | 'check' | 'clipboard' | 'share' | 'paperPlane'
    | 'arrowLeft' | 'lock'

function RIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: RIconName
    size?: number
    color?: string
    fill?: string
    strokeWidth?: number
}) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    }
    switch (name) {
        case 'sparkle':
            return (
                <svg {...common}>
                    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill={fill} />
                </svg>
            )
        case 'star':
            return (
                <svg {...common}>
                    <path d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.9l6-.9L12 3.5z" fill={fill} />
                </svg>
            )
        case 'crown':
            return (
                <svg {...common}>
                    <path d="M3 7l3.5 4L12 5l5.5 6L21 7v11a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" fill={fill} />
                    <circle cx="3" cy="7" r="1.1" fill={color} stroke="none" />
                    <circle cx="12" cy="5" r="1.1" fill={color} stroke="none" />
                    <circle cx="21" cy="7" r="1.1" fill={color} stroke="none" />
                </svg>
            )
        case 'heart':
            return (
                <svg {...common}>
                    <path
                        d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"
                        fill={fill}
                    />
                </svg>
            )
        case 'gift':
            return (
                <svg {...common}>
                    <rect x="3.5" y="9" width="17" height="11" rx="1.5" fill={fill} />
                    <path d="M3.5 13h17" />
                    <path d="M12 9v11" />
                    <path d="M12 9c-1.5-3.5-5.5-3-5.5-.5 0 1 1 1.5 2 1.5h3.5z" fill={fill} />
                    <path d="M12 9c1.5-3.5 5.5-3 5.5-.5 0 1-1 1.5-2 1.5H12z" fill={fill} />
                </svg>
            )
        case 'rocket':
            return (
                <svg {...common}>
                    <path
                        d="M13.5 3c3 1 5 4 5 7l-3.5 3.5L10 9.5 13.5 3z"
                        fill={fill}
                    />
                    <path d="M10 9.5L5.5 14c-.5.5-.5 1.5 0 2L8 18.5c.5.5 1.5.5 2 0L14.5 14" />
                    <path d="M8 15l-3 5 5-3" fill={fill} />
                    <circle cx="14.5" cy="9.5" r="1.2" fill={color} stroke="none" />
                </svg>
            )
        case 'bolt':
            return (
                <svg {...common}>
                    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill={fill} />
                </svg>
            )
        case 'link':
            return (
                <svg {...common}>
                    <path d="M9 15l6-6" />
                    <path d="M10.5 6L13 3.5a4 4 0 015.5 5.5L16 11.5" fill={fill} />
                    <path d="M13.5 18L11 20.5a4 4 0 01-5.5-5.5L8 12.5" fill={fill} />
                </svg>
            )
        case 'check':
            return (
                <svg {...common}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            )
        case 'clipboard':
            return (
                <svg {...common}>
                    <rect x="6" y="4" width="12" height="17" rx="2" fill={fill} />
                    <rect x="9" y="2.5" width="6" height="4" rx="1" fill={color} stroke="none" />
                    <path d="M9 11h6M9 14.5h6M9 18h4" />
                </svg>
            )
        case 'share':
            return (
                <svg {...common}>
                    <path d="M12 3v13" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5" fill={fill} />
                </svg>
            )
        case 'paperPlane':
            return (
                <svg {...common}>
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 19-4-9-9-4 20-6z" fill={fill} />
                </svg>
            )
        case 'arrowLeft':
            return (
                <svg {...common}>
                    <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
            )
        case 'lock':
            return (
                <svg {...common}>
                    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" fill={fill} />
                    <path d="M7.5 10.5V7a4.5 4.5 0 019 0v3.5" />
                    <circle cx="12" cy="15.5" r="1.3" fill={color} stroke="none" />
                </svg>
            )
    }
}

export default function ReferralScreen({ onClose }: ReferralScreenProps) {
    const { t } = useTranslation()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const [copied, setCopied] = useState(false)
    const [animatedCount, setAnimatedCount] = useState(0)
    const [celebrating, setCelebrating] = useState(false)

    const tgId = getTelegramId()
    const firstName = getTelegramFirstName() || t('ref_friends')
    const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${tgId}`
    const shareText = `${firstName} ${t('ref_share_text')}`

    useEffect(() => {
        loadStats()
    }, [])

    useEffect(() => {
        if (!stats) return
        const target = stats.total_referrals
        if (target === 0) return
        let current = 0
        const step = Math.max(1, Math.ceil(target / 20))
        const timer = setInterval(() => {
            current += step
            if (current >= target) {
                setAnimatedCount(target)
                clearInterval(timer)
                if (stats.current_tier > 0) {
                    setCelebrating(true)
                    setTimeout(() => setCelebrating(false), 2500)
                }
            } else {
                setAnimatedCount(current)
            }
        }, 50)
        return () => clearInterval(timer)
    }, [stats])

    async function loadStats() {
        if (!tgId) { setLoading(false); return }
        const { data, error } = await supabase.rpc('get_referral_stats', {
            p_telegram_id: tgId,
        })
        if (!error && data) setStats(data as Stats)
        setLoading(false)
    }

    function copyLink() {
        navigator.clipboard.writeText(refLink)
        setCopied(true)
        const tg = (window as any).Telegram?.WebApp
        tg?.HapticFeedback?.notificationOccurred?.('success')
        setTimeout(() => setCopied(false), 2000)
    }

    function shareViaTelegram() {
        const url = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`
        const tg = (window as any).Telegram?.WebApp
        tg?.HapticFeedback?.impactOccurred?.('medium')
        if (tg?.openTelegramLink) tg.openTelegramLink(url)
        else window.open(url, '_blank')
    }

    function shareNative() {
        const tg = (window as any).Telegram?.WebApp
        tg?.HapticFeedback?.impactOccurred?.('light')
        if (navigator.share) {
            navigator.share({ title: 'Lokma', text: shareText, url: refLink }).catch(() => { })
        } else {
            copyLink()
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#ECEEF5] dark:bg-[#0F1419]">
                <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <Bekjon mood="happy" size={100} />
                </motion.div>
            </div>
        )
    }

    const total = stats?.total_referrals ?? 0
    const tier1Done = total >= 1
    const tier2Done = total >= 3
    const progress = Math.min(100, (total / 3) * 100)
    const hasNoFriends = total === 0

    const confettiIcons: { name: RIconName; color: string }[] = [
        { name: 'sparkle', color: '#EF9F27' },
        { name: 'star', color: '#FFD700' },
        { name: 'crown', color: '#EF9F27' },
        { name: 'heart', color: '#EC4899' },
        { name: 'bolt', color: '#5B6AD0' },
    ]

    return (
        <div className="min-h-screen bg-[#ECEEF5] dark:bg-[#0F1419] pb-40" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            {/* Confetti burst on celebration */}
            <AnimatePresence>
                {celebrating && (
                    <div className="fixed inset-0 pointer-events-none z-50">
                        {[...Array(24)].map((_, i) => {
                            const ic = confettiIcons[i % confettiIcons.length]
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ x: '50vw', y: '40vh', opacity: 1, scale: 0 }}
                                    animate={{
                                        x: `${50 + (Math.cos(i) * 40)}vw`,
                                        y: `${40 + (Math.sin(i) * 40)}vh`,
                                        opacity: 0,
                                        scale: 1.2,
                                        rotate: Math.random() * 360,
                                    }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                    className="absolute"
                                >
                                    <RIcon name={ic.name} size={24} color={ic.color} fill={ic.color} strokeWidth={1.8} />
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="sticky top-0 z-30 bg-[#ECEEF5]/80 dark:bg-[#0F1419]/80 backdrop-blur-xl">
                <div className="max-w-md mx-auto flex items-center justify-between px-5 py-4">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={onClose}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white dark:bg-[#1E252E] text-stone-700 dark:text-slate-300"
                        style={{ boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.15)' }}
                    >
                        <RIcon name="arrowLeft" size={18} strokeWidth={2.2} />
                    </motion.button>
                    <h1 className="text-base font-extrabold text-stone-900 dark:text-slate-100">
                        {t('ref_title')}
                    </h1>
                    <div className="w-10" />
                </div>
            </div>

            <div className="max-w-md mx-auto px-5 pt-2">

                {/* Hero card */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="relative overflow-hidden rounded-[2rem] p-6 pb-7"
                    style={{
                        background: 'linear-gradient(135deg, #5B6AD0 0%, #8B5CF6 55%, #EC4899 100%)',
                        boxShadow: '0 20px 40px -12px rgba(91, 106, 208, 0.5)',
                    }}
                >
                    {/* Animated shimmer */}
                    <motion.div
                        className="absolute inset-0 opacity-40 pointer-events-none"
                        style={{
                            background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                        }}
                        animate={{ x: ['-120%', '120%'] }}
                        transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Sparkles */}
                    {[...Array(8)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute"
                            style={{
                                top: `${10 + (i * 11) % 75}%`,
                                left: `${8 + (i * 19) % 84}%`,
                            }}
                            animate={{
                                opacity: [0, 1, 0],
                                scale: [0.4, 1.3, 0.4],
                                rotate: [0, 180, 360],
                            }}
                            transition={{
                                duration: 2.5,
                                repeat: Infinity,
                                delay: i * 0.3,
                                ease: 'easeInOut',
                            }}
                        >
                            <RIcon
                                name="sparkle"
                                size={i % 2 === 0 ? 14 : 10}
                                color="#ffffff"
                                fill="#ffffff"
                                strokeWidth={1.8}
                            />
                        </motion.div>
                    ))}

                    <div className="relative flex items-start gap-3">
                        {/* Bekjon mascot */}
                        <motion.div
                            animate={{
                                rotate: [0, -3, 3, 0],
                                y: [0, -4, 0],
                            }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="shrink-0"
                        >
                            <Bekjon mood={total > 0 ? 'celebration' : 'happy'} size={88} />
                        </motion.div>

                        <div className="flex-1 pt-1">
                            <div className="text-white/80 text-[11px] font-extrabold uppercase tracking-wider">
                                {t('ref_your_result')}
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                                <motion.span
                                    key={animatedCount}
                                    initial={{ scale: 1.3, color: '#FFD700' }}
                                    animate={{ scale: 1, color: '#FFFFFF' }}
                                    transition={{ duration: 0.4 }}
                                    className="text-5xl font-black tabular-nums leading-none"
                                >
                                    {animatedCount}
                                </motion.span>
                                <span className="text-white/90 text-sm font-bold">
                                    {t('ref_friends')}
                                </span>
                            </div>

                            {stats && stats.bonus_days_earned > 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-white/25 backdrop-blur-sm border border-white/30"
                                >
                                    <RIcon name="gift" size={14} color="#ffffff" fill="rgba(255,255,255,0.3)" strokeWidth={2} />
                                    <span className="text-white text-xs font-extrabold">
                                        +{stats.bonus_days_earned} {t('ref_premium_earned')}
                                    </span>
                                </motion.div>
                            ) : (
                                <div className="text-white/85 text-xs font-semibold mt-2 leading-snug">
                                    {t('ref_first_friend_hint')} <span className="font-extrabold">{t('ref_premium_3days')}</span> {t('ref_premium_unlock')}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Journey path */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.1 }}
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mt-3"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <p className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider">
                                {t('ref_journey')}
                            </p>
                            <p className="text-base font-extrabold text-stone-900 dark:text-slate-100 mt-0.5">
                                {tier2Done ? t('ref_tier_done') : tier1Done ? t('ref_to_tier2') : t('ref_to_tier1')}
                            </p>
                        </div>
                        <div className="text-2xl font-black text-[#5B6AD0]">
                            {total}/3
                        </div>
                    </div>

                    {/* Path with nodes */}
                    <div className="relative h-16 mb-4">
                        {/* Background line */}
                        <div
                            className="absolute top-1/2 left-6 right-6 h-1.5 -translate-y-1/2 rounded-full"
                            style={{ background: 'var(--color-input-bg)' }}
                        />
                        {/* Progress line */}
                        <motion.div
                            className="absolute top-1/2 left-6 h-1.5 -translate-y-1/2 rounded-full"
                            style={{
                                background: 'linear-gradient(90deg, #5B6AD0, #EC4899)',
                                width: `calc(${progress}% - ${progress > 0 ? '12px' : '0px'})`,
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `calc(${progress}% - ${progress > 0 ? '12px' : '0px'})` }}
                            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                        />

                        {/* Node: Start */}
                        <Node
                            left="0%"
                            done={true}
                            icon="rocket"
                            label={t('ref_node_start')}
                            color="#5B6AD0"
                            current={total === 0}
                        />
                        {/* Node: Tier 1 */}
                        <Node
                            left="50%"
                            done={tier1Done}
                            icon="bolt"
                            label={t('ref_reward_3')}
                            color="#5B6AD0"
                            current={total === 1 || total === 2}
                        />
                        {/* Node: Tier 2 */}
                        <Node
                            left="100%"
                            done={tier2Done}
                            icon="crown"
                            label={t('ref_reward_10')}
                            color="#EC4899"
                            current={tier2Done}
                        />
                    </div>

                    {stats && stats.next_tier_needed > 0 && (
                        <div className="text-center text-xs font-bold text-stone-500 dark:text-slate-400 mt-2">
                            {t('ref_next_reward')}{' '}
                            <span className="text-[#5B6AD0] dark:text-[#7A8AE8] font-black">
                                {stats.next_tier_needed} {t('ref_friends_needed')}
                            </span>
                        </div>
                    )}
                </motion.div>

                {/* Empty state hint */}
                {hasNoFriends && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...SPRING, delay: 0.2 }}
                        className="rounded-[1.75rem] p-5 mt-3 text-center"
                        style={{
                            background: 'linear-gradient(135deg, rgba(91,106,208,0.08), rgba(236,72,153,0.08))',
                            border: '2px dashed rgba(91,106,208,0.3)',
                        }}
                    >
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Bekjon mood="happy" size={48} />
                            <RIcon name="heart" size={24} color="#EC4899" fill="#EC4899" strokeWidth={1.8} />
                        </div>
                        <p className="text-sm font-extrabold text-stone-900 dark:text-slate-100">
                            {t('ref_empty_title')}
                        </p>
                        <p className="text-xs font-semibold text-stone-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {t('ref_empty_sub')}
                        </p>
                    </motion.div>
                )}

                {/* Reward cards */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.15 }}
                    className="grid grid-cols-2 gap-3 mt-3"
                >
                    <RewardCard
                        done={tier1Done}
                        icon="bolt"
                        tier={t('ref_tier1')}
                        requirement={t('ref_req_1')}
                        reward={t('ref_reward_3')}
                        gradient="from-[#5B6AD0] to-[#7A8AE8]"
                    />
                    <RewardCard
                        done={tier2Done}
                        icon="crown"
                        tier={t('ref_tier2')}
                        requirement={t('ref_req_3')}
                        reward={t('ref_reward_10')}
                        gradient="from-[#8B5CF6] to-[#EC4899]"
                    />
                </motion.div>

                {/* Share link box */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.2 }}
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mt-3"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <p className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        {t('ref_your_link')}
                    </p>

                    <motion.div
                        whileTap={{ scale: 0.98 }}
                        onClick={copyLink}
                        className="flex items-center gap-2 p-3 rounded-2xl mb-3 cursor-pointer"
                        style={{ background: 'var(--color-input-bg)' }}
                    >
                        <RIcon name="link" size={18} color="#5B6AD0" strokeWidth={2} />
                        <div className="flex-1 text-xs font-bold truncate text-stone-700 dark:text-slate-300">
                            t.me/{BOT_USERNAME}?start=ref_{tgId}
                        </div>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={copied ? 'done' : 'copy'}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold text-white shrink-0 flex items-center justify-center"
                                style={{ background: copied ? '#10b981' : '#5B6AD0' }}
                            >
                                {copied
                                    ? <RIcon name="check" size={14} color="#ffffff" strokeWidth={2.5} />
                                    : t('ref_copy')}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>

                    {/* Multi-share row */}
                    <div className="grid grid-cols-3 gap-2">
                        <ShareIcon icon="clipboard" label={t('ref_copy')} onClick={copyLink} bg="var(--color-input-bg)" textColor="var(--color-input-text)" />
                        <ShareIcon icon="share" label={t('ref_share')} onClick={shareNative} bg="var(--color-input-bg)" textColor="var(--color-input-text)" />
                        <ShareIcon icon="paperPlane" label={t('ref_telegram')} onClick={shareViaTelegram} bg="linear-gradient(135deg, #229ED9, #1A82B0)" textColor="#fff" />
                    </div>
                </motion.div>

                {/* How it works */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.25 }}
                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mt-3"
                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                >
                    <p className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                        {t('ref_how_it_works')}
                    </p>
                    {([
                        { n: 1, icon: 'share' as RIconName, color: '#5B6AD0', t: t('ref_step1') },
                        { n: 2, icon: null, color: '#EC4899', t: t('ref_step2') },
                        { n: 3, icon: 'gift' as RIconName, color: '#EF9F27', t: t('ref_step3') },
                    ]).map((s, i) => (
                        <motion.div
                            key={s.n}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + i * 0.08 }}
                            className="flex items-center gap-3 py-2"
                        >
                            <div
                                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                                style={{ background: s.color + '22' }}
                            >
                                {s.icon ? (
                                    <RIcon name={s.icon} size={18} color={s.color} fill={s.color + '33'} strokeWidth={2} />
                                ) : (
                                    <Bekjon mood="happy" size={28} />
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="text-[10px] font-extrabold text-[#5B6AD0] dark:text-[#7A8AE8] uppercase tracking-wider">
                                    {s.n}{t('ref_step')}
                                </div>
                                <div className="text-sm font-bold text-stone-900 dark:text-slate-100 leading-tight">
                                    {s.t}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            {/* Sticky bottom CTA */}
            <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
                <div className="max-w-md mx-auto px-5 pb-5 pt-3 pointer-events-auto" style={{
                    background: 'linear-gradient(to top, var(--color-bg, #ECEEF5) 60%, transparent)',
                }}>
                    <motion.button
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ ...SPRING, delay: 0.3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={shareViaTelegram}
                        className="w-full py-4 rounded-2xl font-extrabold text-white text-base flex items-center justify-center gap-2 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #5B6AD0, #8B5CF6, #EC4899)',
                            boxShadow: '0 12px 28px -8px rgba(91, 106, 208, 0.55)',
                        }}
                    >
                        <motion.div
                            className="absolute inset-0 opacity-40"
                            style={{
                                background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
                            }}
                            animate={{ x: ['-120%', '120%'] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                        />
                        <span className="relative">
                            <RIcon name="share" size={20} color="#ffffff" fill="rgba(255,255,255,0.25)" strokeWidth={2} />
                        </span>
                        <span className="relative">{t('ref_send_to_friend')}</span>
                    </motion.button>
                </div>
            </div>
        </div>
    )
}

function Node({ left, done, icon, label, color, current }: {
    left: string
    done: boolean
    icon: RIconName
    label: string
    color: string
    current: boolean
}) {
    return (
        <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ left }}
        >
            <motion.div
                animate={current ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
                style={{
                    background: done ? color : 'var(--color-input-bg)',
                    border: done ? 'none' : '2px dashed rgba(148,163,184,0.4)',
                }}
            >
                {current && done && (
                    <motion.div
                        className="absolute inset-0 rounded-2xl"
                        style={{ background: color, opacity: 0.5 }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                )}
                <span className="relative">
                    <RIcon
                        name={icon}
                        size={20}
                        color={done ? '#ffffff' : '#94a3b8'}
                        fill={done ? 'rgba(255,255,255,0.25)' : 'none'}
                        strokeWidth={2}
                    />
                </span>
            </motion.div>
            <div
                className="text-[10px] font-extrabold mt-1 whitespace-nowrap"
                style={{ color: done ? color : '#94a3b8' }}
            >
                {label}
            </div>
        </div>
    )
}

function RewardCard({ done, icon, tier, requirement, reward, gradient }: {
    done: boolean
    icon: RIconName
    tier: string
    requirement: string
    reward: string
    gradient: string
}) {
    return (
        <motion.div
            whileHover={{ y: -2 }}
            className={`relative rounded-2xl p-4 overflow-hidden ${done ? `bg-gradient-to-br ${gradient}` : 'bg-white dark:bg-[#1E252E]'}`}
            style={{
                boxShadow: done
                    ? '0 8px 20px -6px rgba(91, 106, 208, 0.35)'
                    : '0 8px 24px -10px rgba(91, 106, 208, 0.12)',
                opacity: done ? 1 : 0.7,
            }}
        >
            {done && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/30 backdrop-blur flex items-center justify-center">
                    <RIcon name="check" size={10} color="#ffffff" strokeWidth={3} />
                </div>
            )}
            <div className="mb-1">
                {done ? (
                    <RIcon name={icon} size={26} color="#ffffff" fill="rgba(255,255,255,0.3)" strokeWidth={2} />
                ) : (
                    <RIcon name="lock" size={24} color="#94a3b8" strokeWidth={2} />
                )}
            </div>
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${done ? 'text-white/80' : 'text-stone-500 dark:text-slate-400'}`}>
                {tier}
            </div>
            <div className={`text-sm font-extrabold mt-0.5 ${done ? 'text-white' : 'text-stone-900 dark:text-slate-100'}`}>
                {reward}
            </div>
            <div className={`text-[11px] font-bold mt-1 ${done ? 'text-white/80' : 'text-stone-500 dark:text-slate-400'}`}>
                {requirement}
            </div>
        </motion.div>
    )
}

function ShareIcon({ icon, label, onClick, bg, textColor }: {
    icon: RIconName
    label: string
    onClick: () => void
    bg: string
    textColor: string
}) {
    return (
        <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClick}
            className="py-3 rounded-2xl flex flex-col items-center gap-1"
            style={{ background: bg, color: textColor }}
        >
            <RIcon name={icon} size={20} color={textColor} strokeWidth={2} />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span>
        </motion.button>
    )
}