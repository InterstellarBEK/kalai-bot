import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from './supabase'
import { getTelegramId, getTelegramFirstName } from './telegram'
import Bekjon from './components/Bekjon'
import { useTranslation } from './i18n'

interface Props { onComplete: () => void }

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'

// Yosh chegaralari
const AGE_MIN = 13
const AGE_MAX = 100
const AGE_DEFAULT = 19

// Vazn/bo'y chegaralari (validation uchun)
const WEIGHT_MIN = 30
const WEIGHT_MAX = 300
const HEIGHT_MIN = 100
const HEIGHT_MAX = 250

export default function Onboarding({ onComplete }: Props) {
    const { t } = useTranslation()
    const [step, setStep] = useState(0)
    const [gender, setGender] = useState<'male' | 'female'>('male')
    const [age, setAge] = useState<number>(AGE_DEFAULT)
    const [weight, setWeight] = useState('')
    const [height, setHeight] = useState('')
    const [activity, setActivity] = useState('1.375')
    const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain')
    const [saving, setSaving] = useState(false)

    const firstName = getTelegramFirstName() || t('onb_default_name')

    // Vazn/bo'y validation
    const weightValid = (() => {
        const n = parseFloat(weight)
        return !isNaN(n) && n >= WEIGHT_MIN && n <= WEIGHT_MAX
    })()
    const heightValid = (() => {
        const n = parseFloat(height)
        return !isNaN(n) && n >= HEIGHT_MIN && n <= HEIGHT_MAX
    })()

    const canNext =
        step === 0 ? true :
            step === 1 ? age >= AGE_MIN && age <= AGE_MAX :
                step === 2 ? weightValid && heightValid :
                    true

    const finish = async () => {
        const a = age
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
                                        <AgeStepper value={age} onChange={setAge} min={AGE_MIN} max={AGE_MAX} />
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
                                        <Input
                                            value={weight}
                                            onChange={setWeight}
                                            placeholder="70"
                                            min={WEIGHT_MIN}
                                            max={WEIGHT_MAX}
                                            suffix="kg"
                                        />
                                    </Section>
                                    <Section label={t('section_height')}>
                                        <Input
                                            value={height}
                                            onChange={setHeight}
                                            placeholder="175"
                                            min={HEIGHT_MIN}
                                            max={HEIGHT_MAX}
                                            suffix="cm"
                                        />
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
                                                { val: 'lose' as const, label: t('goal_lose'), Icon: IconTrendingDown },
                                                { val: 'maintain' as const, label: t('onb_goal_maintain_long'), Icon: IconEqual },
                                                { val: 'gain' as const, label: t('goal_gain'), Icon: IconTrendingUp },
                                            ].map(opt => {
                                                const active = goal === opt.val
                                                return (
                                                    <motion.button
                                                        key={opt.val}
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => setGoal(opt.val)}
                                                        className="w-full py-3.5 px-4 rounded-2xl font-bold flex items-center gap-3 transition-colors"
                                                        style={{
                                                            background: active ? '#5B6AD0' : 'var(--color-input-bg)',
                                                            color: active ? '#fff' : 'var(--color-input-text)',
                                                        }}
                                                    >
                                                        <opt.Icon color={active ? '#fff' : '#5B6AD0'} />
                                                        {opt.label}
                                                    </motion.button>
                                                )
                                            })}
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

/* ─────────── Yangi Age Stepper (− 19 +) ─────────── */
function AgeStepper({
    value, onChange, min, max,
}: { value: number; onChange: (n: number) => void; min: number; max: number }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(String(value))

    const dec = () => onChange(Math.max(min, value - 1))
    const inc = () => onChange(Math.min(max, value + 1))

    const commit = () => {
        const n = parseInt(draft, 10)
        if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        setEditing(false)
    }

    return (
        <div
            className="flex items-center justify-between rounded-2xl px-2 py-2"
            style={{ background: 'var(--color-input-bg)' }}
        >
            <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={dec}
                disabled={value <= min}
                className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-2xl disabled:opacity-30"
                style={{ background: '#5B6AD0', color: '#fff' }}
                aria-label="minus"
            >
                −
            </motion.button>

            {editing ? (
                <input
                    type="number"
                    autoFocus
                    inputMode="numeric"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => { if (e.key === 'Enter') commit() }}
                    className="flex-1 mx-2 text-center text-2xl font-extrabold bg-transparent outline-none"
                    style={{ color: 'var(--color-input-text)' }}
                />
            ) : (
                <button
                    onClick={() => { setDraft(String(value)); setEditing(true) }}
                    className="flex-1 mx-2 text-center text-2xl font-extrabold tabular-nums"
                    style={{ color: 'var(--color-input-text)' }}
                >
                    {value}
                </button>
            )}

            <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={inc}
                disabled={value >= max}
                className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-2xl disabled:opacity-30"
                style={{ background: '#5B6AD0', color: '#fff' }}
                aria-label="plus"
            >
                +
            </motion.button>
        </div>
    )
}

function Input({
    value, onChange, placeholder, min, max, suffix,
}: {
    value: string
    onChange: (v: string) => void
    placeholder: string
    min?: number
    max?: number
    suffix?: string
}) {
    return (
        <div className="relative">
            <input
                type="number"
                inputMode="numeric"
                value={value}
                min={min}
                max={max}
                onChange={e => {
                    // Bo'sh stringga ruxsat (kiritish jarayonida)
                    if (e.target.value === '') { onChange(''); return }
                    const n = parseFloat(e.target.value)
                    if (isNaN(n)) return
                    // Max chegara — clamp
                    if (max !== undefined && n > max) { onChange(String(max)); return }
                    onChange(e.target.value)
                }}
                placeholder={placeholder}
                className="w-full rounded-2xl px-4 py-3.5 font-semibold text-sm focus:outline-none transition pr-12"
                style={{ background: 'var(--color-input-bg)', color: 'var(--color-input-text)', border: '2px solid transparent' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B6AD0')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            />
            {suffix && (
                <span
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none"
                    style={{ color: 'var(--color-input-text)', opacity: 0.5 }}
                >
                    {suffix}
                </span>
            )}
        </div>
    )
}

/* ─────────── SVG ikonlar (lucide-style) ─────────── */
function IconTrendingDown({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            <polyline points="16 17 22 17 22 11" />
        </svg>
    )
}

function IconEqual({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="9" x2="19" y2="9" />
            <line x1="5" y1="15" x2="19" y2="15" />
        </svg>
    )
}

function IconTrendingUp({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
        </svg>
    )
}