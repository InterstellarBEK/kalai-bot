import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getTodayWater, addWater, getWaterGoal, removeLastWater } from './water'
import { useTranslation } from './i18n'

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
                    <span className="text-2xl">💧</span>
                    <h3 className="font-semibold text-[15px] text-gray-900">{t('water_title')}</h3>
                </div>
                <span className="text-[13px] text-gray-500 font-medium">
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
                <div className="h-2 bg-[#DDE3F5] rounded-full overflow-hidden">
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
                    className="flex-1 py-2.5 rounded-2xl bg-[#DDE3F5] text-[#5B6AD0] font-medium text-[14px]"
                >
                    +500ml
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUndo}
                    disabled={todayMl === 0}
                    className="px-3 py-2.5 rounded-2xl bg-gray-100 text-gray-500 font-medium text-[14px] disabled:opacity-40"
                >
                    ↩
                </motion.button>
            </div>
        </motion.div>
    )
}