import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from './supabase'
import { getTelegramId, getTelegramFirstName } from './telegram'
import Bekjon from './components/Bekjon'
import { useTranslation } from './i18n'

interface Props { onComplete: () => void }

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'

export default function Onboarding({ onComplete }: Props) {
    const { t } = useTranslation()
    const [step, setStep] = useState(0)
    const [gender, setGender] = useState<'male' | 'female'>('male')
    const [age, setAge] = useState('')
    const [weight, setWeight] = useState('')
    const [height, setHeight] = useState('')
    const [activity, setActivity] = useState('1.375')
    const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain')
    const [saving, setSaving] = useState(false)

    const firstName = getTelegramFirstName() || t('onb_default_name')

    const canNext =
        step === 0 ? true :
            step === 1 ? !!age :
                step === 2 ? !!weight && !!height :
                    true

    const finish = async () => {
        const a = parseFloat(age)
        const w = parseFloat(weight)
        const h = parseFloat(height)

        let bmr = 10 * w + 6.25 * h - 5 * a
        bmr += gender === 'male' ? 5 : -161
        let tdee = bmr * parseFloat(activity)
        if (goal === 'lose') tdee -= 500
        if (goal === 'gain') tdee += 500
        const finalKcal = Math.round(tdee)

        setSaving(true)
        const { error } = await supabase.from('users').upsert({
            telegram_id: getTelegramId(),
            age: a, weight_kg: w, height_cm: h,
            gender, activity, goal,
            daily_calories_goal: finalKcal,
        }, { onConflict: 'telegram_id' })
        await supabase.from('weight_logs').insert({
            telegram_id: getTelegramId(),
            weight_kg: w,
        })
        setSaving(false)

        if (error) { alert(t('error_prefix') + error.message); return }
        onComplete()
    }

    const next = () => {
        if (step < 3) setStep(step + 1)
        else finish()
    }

    const back = () => {
        if (step > 0) setStep(step - 1)
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#ECEEF5] dark:bg-[#0F1419]" style={{ fontFamily: FONT }}>
            <div className="flex gap-2 p-5 pt-7">
                {[0, 1, 2, 3].map(i => (
                    <motion.div
                        key={i}
                        animate={{ background: i <= step ? '#5B6AD0' : 'var(--color-input-bg)' }}
                        transition={{ duration: 0.3 }}
                        className="flex-1 h-1.5 rounded-full"
                    />
                ))}
            </div>

            <div className="flex-1 flex flex-col px-5 max-w-md mx-auto w-full">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                        className="flex-1 flex flex-col"
                    >
                        {step === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <motion.div
                                    animate={{ y: [0, -8, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                    <Bekjon mood="happy" size={180} />
                                </motion.div>
                                <h1 className="text-3xl font-extrabold text-stone-900 dark:text-slate-100 mt-6">
                                    {t('onb_hello')}, {firstName}!
                                </h1>
                                <p className="text-stone-600 dark:text-slate-400dark:text-slate-300 font-semibold mt-3 text-base">
                                    {t('onb_intro_1')} <span style={{ color: '#5B6AD0' }} className="font-extrabold">Bekjon</span>{t('onb_intro_2')}
                                </p>
                                <p className="text-stone-500 dark:text-slate-400 font-medium mt-3 text-sm">
                                    {t('onb_subtitle')}
                                </p>
                            </div>
                        )}

                        {step === 1 && (
                            <div>
                                <div className="flex justify-center mb-5">
                                    <Bekjon mood="happy" size={100} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 dark:text-slate-100 mb-1 text-center">{t('onb_step1_title')}</h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step1_sub')}
                                </p>
                                <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5" style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}>
                                    <Section label={t('section_gender')}>
                                        <div className="grid grid-cols-2 gap-2">
                                            <PillButton active={gender === 'male'} onClick={() => setGender('male')}>{t('gender_male')}</PillButton>
                                            <PillButton active={gender === 'female'} onClick={() => setGender('female')}>{t('gender_female')}</PillButton>
                                        </div>
                                    </Section>
                                    <Section label={t('section_age')}>
                                        <Input value={age} onChange={setAge} placeholder="19" />
                                    </Section>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div>
                                <div className="flex justify-center mb-5">
                                    <Bekjon mood="happy" size={100} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 dark:text-slate-100 mb-1 text-center">{t('onb_step2_title')}</h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step2_sub')}
                                </p>
                                <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5" style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}>
                                    <Section label={t('section_weight')}>
                                        <Input value={weight} onChange={setWeight} placeholder="70" />
                                    </Section>
                                    <Section label={t('section_height')}>
                                        <Input value={height} onChange={setHeight} placeholder="175" />
                                    </Section>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div>
                                <div className="flex justify-center mb-5">
                                    <Bekjon mood="celebration" size={100} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 dark:text-slate-100 mb-1 text-center">{t('onb_step3_title')}</h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step3_sub')}
                                </p>
                                <div className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5" style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}>
                                    <Section label={t('onb_goal_q')}>
                                        <div className="space-y-2">
                                            {[
                                                { val: 'lose', label: t('goal_lose'), emoji: '📉' },
                                                { val: 'maintain', label: t('onb_goal_maintain_long'), emoji: '⚖️' },
                                                { val: 'gain', label: t('goal_gain'), emoji: '📈' },
                                            ].map(opt => (
                                                <motion.button
                                                    key={opt.val}
                                                    whileTap={{ scale: 0.97 }}
                                                    onClick={() => setGoal(opt.val as any)}
                                                    className="w-full py-3.5 px-4 rounded-2xl font-bold flex items-center gap-3 transition-colors"
                                                    style={{
                                                        background: goal === opt.val ? '#5B6AD0' : 'var(--color-input-bg)',
                                                        color: goal === opt.val ? '#fff' : 'var(--color-input-text)',
                                                    }}
                                                >
                                                    <span className="text-xl">{opt.emoji}</span>
                                                    {opt.label}
                                                </motion.button>
                                            ))}
                                        </div>
                                    </Section>
                                    <Section label={t('onb_activity_label')}>
                                        <select
                                            value={activity}
                                            onChange={e => setActivity(e.target.value)}
                                            className="w-full rounded-2xl px-4 py-3.5 font-semibold text-sm appearance-none focus:outline-none transition"
                                            style={{ background: 'var(--color-input-bg)', color: 'var(--color-input-text)', border: '2px solid transparent' }}
                                            onFocus={(e) => (e.currentTarget.style.borderColor = '#5B6AD0')}
                                            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                                        >
                                            <option value="1.2">{t('activity_low')}</option>
                                            <option value="1.375">{t('activity_light')}</option>
                                            <option value="1.55">{t('activity_medium')}</option>
                                            <option value="1.725">{t('activity_high')}</option>
                                        </select>
                                    </Section>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="flex gap-2.5 pb-7 pt-4">
                    {step > 0 && (
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={back}
                            className="flex-1 py-4 rounded-2xl font-bold bg-white dark:bg-[#1E252E] text-stone-700 dark:text-slate-300"
                        >
                            {t('onb_back')}
                        </motion.button>
                    )}
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={next}
                        disabled={!canNext || saving}
                        className="flex-1 py-4 rounded-2xl font-extrabold text-white disabled:opacity-50"
                        style={{ background: '#5B6AD0', boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)' }}
                    >
                        {saving ? t('btn_saving') : step === 3 ? t('onb_finish') : t('onb_continue')}
                    </motion.button>
                </div>
            </div>
        </div>
    )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-3 last:mb-0">
            <label className="block text-xs font-bold text-stone-600 dark:text-slate-400dark:text-slate-300 uppercase tracking-wider mb-1.5">{label}</label>
            {children}
        </div>
    )
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onClick}
            className="py-3 rounded-2xl text-sm font-bold transition-colors"
            style={{ background: active ? '#5B6AD0' : 'var(--color-input-bg)', color: active ? '#fff' : 'var(--color-input-text)' }}
        >
            {children}
        </motion.button>
    )
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl px-4 py-3.5 font-semibold text-sm focus:outline-none transition"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-input-text)', border: '2px solid transparent' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#5B6AD0')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        />
    )
}