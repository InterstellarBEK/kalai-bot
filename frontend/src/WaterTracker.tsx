import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getTodayWater, addWater, getWaterGoal, removeLastWater } from './water'
import { useTranslation } from './i18n'

// ── Iconly-style SVG icons ────────────────────────────────
function WIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'droplet' | 'undo'
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
        case 'droplet':
            return (
                <svg {...common}>
                    <path
                        d="M12 3.2c2.6 3.1 6.8 7.5 6.8 11.5a6.8 6.8 0 11-13.6 0c0-4 4.2-8.4 6.8-11.5z"
                        fill={fill}
                    />
                    <path
                        d="M9 13.5c-.4 1 .1 2.5 1.5 3"
                        opacity="0.8"
                    />
                </svg>
            )
        case 'undo':
            return (
                <svg {...common}>
                    <path d="M4 10h11a4.5 4.5 0 010 9H10" />
                    <path d="M8 6L4 10l4 4" />
                </svg>
            )
    }
}

export function WaterTracker() {
    const { t } = useTranslation()
    const [todayMl, setTodayMl] = useState(0)
    const [goalMl, setGoalMl] = useState(2000)

    async function load() {
        const [today, goal] = await Promise.all([getTodayWater(), getWaterGoal()])
        setTodayMl(today)
        setGoalMl(goal)
    }

    useEffect(() => { load() }, [])

    async function handleAdd(ml: number) {
        setTodayMl(prev => prev + ml)
        await addWater(ml)
        load()
    }

    async function handleUndo() {
        await removeLastWater()
        load()
    }

    const percent = Math.min(100, Math.round((todayMl / goalMl) * 100))
    const glassSize = 250
    const totalGlasses = Math.ceil(goalMl / glassSize)
    const filledGlasses = Math.floor(todayMl / glassSize)

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 shadow-[0_8px_24px_-10px_rgba(91,106,208,0.12)]"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'rgba(59, 157, 245, 0.12)' }}
                    >
                        <WIcon name="droplet" size={20} color="#3B9DF5" fill="rgba(59, 157, 245, 0.25)" strokeWidth={2} />
                    </div>
                    <h3 className="font-semibold text-[15px] text-gray-900 dark:text-slate-100">{t('water_title')}</h3>
                </div>
                <span className="text-[13px] text-gray-500 dark:text-slate-400 font-medium">
                    {todayMl} / {goalMl} ml
                </span>
            </div>

            <div className="grid grid-cols-8 gap-1.5 mb-4">
                {Array.from({ length: totalGlasses }).map((_, i) => (
                    <motion.div
                        key={i}
                        initial={false}
                        animate={{
                            backgroundColor: i < filledGlasses ? '#5B6AD0' : '#DDE3F5',
                            scale: i < filledGlasses ? 1 : 0.95,
                        }}
                        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        className="aspect-[3/4] rounded-lg"
                    />
                ))}
            </div>

            <div className="mb-4">
                <div className="h-2 bg-[#DDE3F5] dark:bg-[#252D38] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#5B6AD0] rounded-full"
                        initial={false}
                        animate={{ width: `${percent}%` }}
                        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    />
                </div>
            </div>

            <div className="flex gap-2">
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAdd(250)}
                    className="flex-1 py-2.5 rounded-2xl bg-[#5B6AD0] text-white font-medium text-[14px]"
                >
                    {t('water_add_glass')}
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAdd(500)}
                    className="flex-1 py-2.5 rounded-2xl bg-[#DDE3F5] dark:bg-[#252D38] text-[#5B6AD0] font-medium text-[14px]"
                >
                    +500ml
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUndo}
                    disabled={todayMl === 0}
                    className="px-3 py-2.5 rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 font-medium disabled:opacity-40 flex items-center justify-center"
                >
                    <WIcon name="undo" size={16} strokeWidth={2.2} />
                </motion.button>
            </div>
        </motion.div>
    )
}