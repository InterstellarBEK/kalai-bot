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

    return (
        <div className="min-h-screen bg-[#ECEEF5] dark:bg-[#0F1419] pb-40" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            {/* Confetti burst on celebration */}
            <AnimatePresence>
                {celebrating && (
                    <div className="fixed inset-0 pointer-events-none z-50">
                        {[...Array(24)].map((_, i) => (
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
                                className="absolute text-2xl"
                            >
                                {['🎉', '✨', '⭐', '🎊', '💜'][i % 5]}
                            </motion.div>
                        ))}
                    </div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="sticky top-0 z-30 bg-[#ECEEF5]/80 dark:bg-[#0F1419]/80 backdrop-blur-xl">
                <div className="max-w-md mx-auto flex items-center justify-between px-5 py-4">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={onClose}
                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white dark:bg-[#1E252E] text-lg font-bold"
                        style={{ boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.15)' }}
                    >
                        ←
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
                            className="absolute text-white"
                            style={{
                                top: `${10 + (i * 11) % 75}%`,
                                left: `${8 + (i * 19) % 84}%`,
                                fontSize: i % 2 === 0 ? '14px' : '10px',
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
                            ✨
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
                                    <span className="text-sm">🎁</span>
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
                            icon="🚀"
                            label={t('ref_node_start')}
                            color="#5B6AD0"
                            current={total === 0}
                        />
                        {/* Node: Tier 1 */}
                        <Node
                            left="50%"
                            done={tier1Done}
                            icon="⚡"
                            label={t('ref_reward_3')}
                            color="#5B6AD0"
                            current={total === 1 || total === 2}
                        />
                        {/* Node: Tier 2 */}
                        <Node
                            left="100%"
                            done={tier2Done}
                            icon="👑"
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
                        <div className="text-3xl mb-2">🐺💜</div>
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
                        icon="⚡"
                        tier={t('ref_tier1')}
                        requirement={t('ref_req_1')}
                        reward={t('ref_reward_3')}
                        gradient="from-[#5B6AD0] to-[#7A8AE8]"
                    />
                    <RewardCard
                        done={tier2Done}
                        icon="👑"
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
                        <span className="text-lg">🔗</span>
                        <div className="flex-1 text-xs font-bold truncate text-stone-700 dark:text-slate-300">
                            t.me/{BOT_USERNAME}?start=ref_{tgId}
                        </div>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={copied ? 'done' : 'copy'}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold text-white shrink-0"
                                style={{ background: copied ? '#10b981' : '#5B6AD0' }}
                            >
                                {copied ? '✓' : t('ref_copy')}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>

                    {/* Multi-share row */}
                    <div className="grid grid-cols-3 gap-2">
                        <ShareIcon icon="📋" label={t('ref_copy')} onClick={copyLink} bg="var(--color-input-bg)" textColor="var(--color-input-text)" />
                        <ShareIcon icon="📤" label={t('ref_share')} onClick={shareNative} bg="var(--color-input-bg)" textColor="var(--color-input-text)" />
                        <ShareIcon icon="✈️" label={t('ref_telegram')} onClick={shareViaTelegram} bg="linear-gradient(135deg, #229ED9, #1A82B0)" textColor="#fff" />
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
                    {[
                        { n: 1, icon: '📤', t: t('ref_step1') },
                        { n: 2, icon: '🐺', t: t('ref_step2') },
                        { n: 3, icon: '🎁', t: t('ref_step3') },
                    ].map((s, i) => (
                        <motion.div
                            key={s.n}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + i * 0.08 }}
                            className="flex items-center gap-3 py-2"
                        >
                            <div
                                className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0"
                                style={{ background: 'var(--color-input-bg)' }}
                            >
                                {s.icon}
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
                        <span className="relative text-xl">📤</span>
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
    icon: string
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
                className="relative w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-lg"
                style={{
                    background: done ? color : 'var(--color-input-bg)',
                    color: done ? '#fff' : '#94a3b8',
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
                <span className="relative">{icon}</span>
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
    icon: string
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
                    <span className="text-[10px] font-black text-white">✓</span>
                </div>
            )}
            <div className="text-2xl mb-1">{done ? icon : '🔒'}</div>
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
    icon: string
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
            <span className="text-xl">{icon}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span>
        </motion.button>
    )
}