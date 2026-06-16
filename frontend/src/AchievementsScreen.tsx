import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ACHIEVEMENTS, getUnlocked, getAchTitle, getAchDesc, type Achievement } from './achievements'
import { getTelegramId } from './telegram'
import { useTranslation, type Lang } from './i18n'

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
                <button onClick={onBack} className="w-10 h-10 rounded-full bg-white dark:bg-[#1E252E] grid place-items-center shadow-sm" aria-label={t('back')}>
                    <span className="text-xl">←</span>
                </button>
                <h1 className="text-2xl font-bold text-[#1a1a2e] dark:text-slate-100" style={{ fontFamily: 'Plus Jakarta Sans' }}>{t('ach_title')}</h1>
            </div>

            <div className="mx-5 mb-5 p-5 bg-white dark:bg-[#1E252E] rounded-[1.75rem]" style={{ boxShadow: '0 8px 24px -10px rgba(91,106,208,0.12)' }}>
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <div className="text-sm text-[#6b7280] dark:text-slate-400 dark:text-slate-400
">{t('ach_count_label')}</div>
                        <div className="text-3xl font-bold text-[#1a1a2e] dark:text-slate-100">{done}<span className="text-lg text-[#6b7280] dark:text-slate-400 dark:text-slate-400
 dark:text-slate-400"> / {total}</span></div>
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
                <div className="text-center text-[#6b7280] dark:text-slate-400 dark:text-slate-400
 mt-12">{t('loading')}</div>
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
            <div className="text-[10px] text-[#6b7280] dark:text-slate-400 dark:text-slate-400
 dark:text-slate-400 leading-tight mb-2 min-h-[24px]">{getAchDesc(a, lang)}</div>
            <div className={`text-[10px] font-bold ${unlocked ? 'text-[#5B6AD0]' : 'text-[#9ca3af]'}`}>
                {unlocked ? t('ach_done_badge') : `+${a.coin} 🪙`}
            </div>
            {!unlocked && (
                <div className="absolute top-2 right-2 text-xs">🔒</div>
            )}
        </motion.div>
    )
}