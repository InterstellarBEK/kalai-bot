import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ACHIEVEMENTS, getUnlocked, getAchTitle, getAchDesc, type Achievement } from './achievements'
import { getTelegramId } from './telegram'
import { useTranslation, type Lang } from './i18n'

// ── Iconly-style SVG icons ────────────────────────────────
function AIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'arrowLeft' | 'coin' | 'lock'
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
        case 'arrowLeft':
            return (
                <svg {...common}>
                    <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
            )
        case 'coin':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="8.5" fill={fill} />
                    <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.9-2.5 2s.9 1.7 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6" />
                    <path d="M12 7v10" />
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

export function AchievementsScreen({ onBack }: { onBack: () => void }) {
    const { t, lang } = useTranslation()
    const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getUnlocked(getTelegramId()).then(ids => {
            setUnlocked(new Set(ids))
            setLoading(false)
        })
    }, [])

    const total = ACHIEVEMENTS.length
    const done = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).length
    const pct = total ? Math.round((done / total) * 100) : 0

    return (
        <div className="min-h-screen pb-32" style={{ background: 'var(--color-bg)' }}>
            <div className="px-5 pt-6 pb-4 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-white dark:bg-[#1E252E] grid place-items-center shadow-sm text-stone-700 dark:text-slate-300"
                    aria-label={t('back')}
                >
                    <AIcon name="arrowLeft" size={18} strokeWidth={2.2} />
                </button>
                <h1 className="text-2xl font-bold text-[#1a1a2e] dark:text-slate-100" style={{ fontFamily: 'Plus Jakarta Sans' }}>{t('ach_title')}</h1>
            </div>

            <div className="mx-5 mb-5 p-5 bg-white dark:bg-[#1E252E] rounded-[1.75rem]" style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}>
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <div className="text-sm text-[#6b7280] dark:text-slate-400">{t('ach_count_label')}</div>
                        <div className="text-3xl font-bold text-[#1a1a2e] dark:text-slate-100">
                            {done}<span className="text-lg text-[#6b7280] dark:text-slate-400"> / {total}</span>
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-[#5B6AD0]">{pct}%</div>
                </div>
                <div className="h-2 bg-[#ECEEF5] dark:bg-[#0F1419] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#5B6AD0]"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center text-[#6b7280] dark:text-slate-400 mt-12">{t('loading')}</div>
            ) : (
                <div className="px-5 grid grid-cols-3 gap-3">
                    {ACHIEVEMENTS.map((a, i) => (
                        <Card key={a.id} a={a} unlocked={unlocked.has(a.id)} delay={i * 0.04} t={t} lang={lang} />
                    ))}
                </div>
            )}
        </div>
    )
}

function Card({ a, unlocked, delay, t, lang }: { a: Achievement; unlocked: boolean; delay: number; t: (k: string) => string; lang: Lang }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: 'spring', stiffness: 280, damping: 26 }}
            className={`relative p-3 rounded-2xl bg-white dark:bg-[#1E252E] text-center ${unlocked ? '' : 'opacity-50 grayscale'}`}
            style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}
        >
            <div className="text-3xl mb-1">{a.icon}</div>
            <div className="text-[11px] font-semibold text-[#1a1a2e] dark:text-slate-100 leading-tight mb-1">{getAchTitle(a, lang)}</div>
            <div className="text-[10px] text-[#6b7280] dark:text-slate-400 leading-tight mb-2 min-h-[24px]">{getAchDesc(a, lang)}</div>
            <div className={`text-[10px] font-bold flex items-center justify-center gap-1 ${unlocked ? 'text-[#5B6AD0]' : 'text-[#9ca3af]'}`}>
                {unlocked ? (
                    <span>{t('ach_done_badge')}</span>
                ) : (
                    <>
                        <span>+{a.coin}</span>
                        <AIcon name="coin" size={11} color="#EF9F27" fill="#FFE8C7" strokeWidth={2} />
                    </>
                )}
            </div>
            {!unlocked && (
                <div className="absolute top-2 right-2">
                    <AIcon name="lock" size={12} color="#78716C" strokeWidth={2} />
                </div>
            )}
        </motion.div>
    )
}