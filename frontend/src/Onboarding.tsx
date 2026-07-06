import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, toLokmaError, type Result } from './supabase';
import { getTelegramId, getTelegramFirstName, showAlert } from './telegram';
import Bekjon from './components/Bekjon';
import WheelPicker from './components/WheelPicker';
import { useTranslation } from './i18n';

// ============================================================
// TYPES
// ============================================================
interface Props {
    onComplete: () => void;
}

type Gender = 'male' | 'female';
type Goal = 'lose' | 'maintain' | 'gain';
type ActivityLevel = '1.2' | '1.375' | '1.55' | '1.725';

interface OnboardingData {
    gender: Gender;
    age: number;
    weight: number;
    height: number;
    activity: ActivityLevel;
    goal: Goal;
}

// ============================================================
// CONSTANTS
// ============================================================
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const SPRING = { duration: 0.25 } as const;
const TOTAL_STEPS = 4; // 0..3

const AGE_MIN = 13;
const AGE_MAX = 100;
const AGE_DEFAULT = 19;

const WEIGHT_MIN = 30;
const WEIGHT_MAX = 300;
const WEIGHT_DEFAULT = 70;

const HEIGHT_MIN = 100;
const HEIGHT_MAX = 250;
const HEIGHT_DEFAULT = 170;

const GOAL_KCAL_DELTA: Record<Goal, number> = {
    lose: -500,
    maintain: 0,
    gain: 500,
};

const ACTIVITY_VALUES: readonly ActivityLevel[] = ['1.2', '1.375', '1.55', '1.725'] as const;

// ============================================================
// PURE HELPERS
// ============================================================
function clamp(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

/**
 * Mifflin-St Jeor formulasi (BMR) + activity multiplier + goal delta.
 * Nafis va qayta-testlashga qulay bo'lishi uchun ajratildi.
 */
function calculateDailyCalories(data: OnboardingData): number {
    const { gender, age, weight, height, activity, goal } = data;
    const bmr = 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161);
    const multiplier = parseFloat(activity);
    // parseFloat NaN bo'lsa, xavfsiz fallback
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.375;
    const tdee = bmr * safeMultiplier + GOAL_KCAL_DELTA[goal];
    return Math.max(800, Math.round(tdee)); // safety floor — hech qachon <800 kcal tavsiya qilmaymiz
}

function isValidActivity(v: string): v is ActivityLevel {
    return (ACTIVITY_VALUES as readonly string[]).includes(v);
}

// ============================================================
// SAVE LOGIC
// ============================================================
async function saveOnboarding(
    telegramId: number,
    data: OnboardingData,
    dailyKcal: number
): Promise<Result<null>> {
    // 1) Upsert user profile
    try {
        const upsertRes = await supabase.from('users').upsert(
            {
                telegram_id: telegramId,
                age: data.age,
                weight_kg: data.weight,
                height_cm: data.height,
                gender: data.gender,
                activity: data.activity,
                goal: data.goal,
                daily_calories_goal: dailyKcal,
            },
            { onConflict: 'telegram_id' }
        );
        if (upsertRes.error) {
            return { ok: false, error: toLokmaError(upsertRes.error, 'database') };
        }
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }

    // 2) Initial weight log — bu ikkinchi darajali, xato bo'lsa jim log qilamiz
    try {
        const wRes = await supabase
            .from('weight_logs')
            .insert({ telegram_id: telegramId, weight_kg: data.weight });
        if (wRes.error) {
            console.warn('[onboarding] weight_logs insert failed:', wRes.error.message);
        }
    } catch (err) {
        console.warn('[onboarding] weight_logs exception:', err);
    }

    return { ok: true, data: null };
}

// ============================================================
// COMPONENT
// ============================================================
export default function Onboarding({ onComplete }: Props) {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);
    const [gender, setGender] = useState<Gender>('male');
    const [age, setAge] = useState<number>(AGE_DEFAULT);
    const [weight, setWeight] = useState<number>(WEIGHT_DEFAULT);
    const [height, setHeight] = useState<number>(HEIGHT_DEFAULT);
    const [activity, setActivity] = useState<ActivityLevel>('1.375');
    const [goal, setGoal] = useState<Goal>('maintain');
    const [saving, setSaving] = useState(false);

    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const firstName = useMemo(
        () => getTelegramFirstName() || t('onb_default_name'),
        [t]
    );

    // ------------------------------------------------------------
    // Validation — har qadam uchun
    // ------------------------------------------------------------
    const canNext = useMemo(() => {
        switch (step) {
            case 0:
                return true;
            case 1:
                return age >= AGE_MIN && age <= AGE_MAX;
            case 2:
                return (
                    weight >= WEIGHT_MIN &&
                    weight <= WEIGHT_MAX &&
                    height >= HEIGHT_MIN &&
                    height <= HEIGHT_MAX
                );
            case 3:
                return isValidActivity(activity);
            default:
                return true;
        }
    }, [step, age, weight, height, activity]);

    // ------------------------------------------------------------
    // Finish — final save
    // ------------------------------------------------------------
    const finish = useCallback(async () => {
        if (saving) return;

        const telegramId = getTelegramId();
        if (!telegramId) {
            await showAlert(t('scan_tg_missing'));
            return;
        }

        // Xavfsiz clamp — WheelPicker allaqachon chegara ushlaydi, lekin defense-in-depth
        const data: OnboardingData = {
            gender,
            age: clamp(age, AGE_MIN, AGE_MAX),
            weight: clamp(weight, WEIGHT_MIN, WEIGHT_MAX),
            height: clamp(height, HEIGHT_MIN, HEIGHT_MAX),
            activity: isValidActivity(activity) ? activity : '1.375',
            goal,
        };
        const dailyKcal = calculateDailyCalories(data);

        setSaving(true);
        try {
            const res = await saveOnboarding(telegramId, data, dailyKcal);
            if (!mountedRef.current) return;

            if (!res.ok) {
                await showAlert(`${t('error_prefix')}${res.error.message}`);
                return;
            }
            onComplete();
        } catch (err) {
            if (!mountedRef.current) return;
            const lokma = toLokmaError(err, 'database');
            await showAlert(`${t('error_prefix')}${lokma.message}`);
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [saving, gender, age, weight, height, activity, goal, t, onComplete]);

    // ------------------------------------------------------------
    // Navigation
    // ------------------------------------------------------------
    const next = useCallback(() => {
        if (!canNext || saving) return;
        setStep(prev => {
            if (prev < TOTAL_STEPS - 1) return prev + 1;
            // Oxirgi qadamda — saqlash boshlanadi, step o'zgarmaydi
            void finish();
            return prev;
        });
    }, [canNext, saving, finish]);

    const back = useCallback(() => {
        if (saving) return;
        setStep(prev => (prev > 0 ? prev - 1 : prev));
    }, [saving]);

    const handleActivityChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        if (isValidActivity(v)) setActivity(v);
    }, []);

    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------
    return (
        <div
            className="min-h-screen flex flex-col bg-[#ECEEF5] dark:bg-[#0F1419]"
            style={{ fontFamily: FONT }}
        >
            <div className="flex gap-2 p-5 pt-7">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
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
                        transition={SPRING}
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
                                <p className="text-stone-600 dark:text-slate-300 font-semibold mt-3 text-base">
                                    {t('onb_intro_1')}{' '}
                                    <span style={{ color: '#5B6AD0' }} className="font-extrabold">
                                        Bekjon
                                    </span>
                                    {t('onb_intro_2')}
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
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 mb-1 text-center">
                                    {t('onb_step1_title')}
                                </h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step1_sub')}
                                </p>
                                <div
                                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                                >
                                    <Section label={t('section_gender')}>
                                        <div className="grid grid-cols-2 gap-2">
                                            <PillButton
                                                active={gender === 'male'}
                                                onClick={() => setGender('male')}
                                            >
                                                {t('gender_male')}
                                            </PillButton>
                                            <PillButton
                                                active={gender === 'female'}
                                                onClick={() => setGender('female')}
                                            >
                                                {t('gender_female')}
                                            </PillButton>
                                        </div>
                                    </Section>
                                    <Section label={t('section_age')}>
                                        <div
                                            className="rounded-2xl"
                                            style={{ background: 'var(--color-input-bg)' }}
                                        >
                                            <WheelPicker
                                                min={AGE_MIN}
                                                max={AGE_MAX}
                                                value={age}
                                                onChange={setAge}
                                                step={1}
                                            />
                                        </div>
                                    </Section>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div>
                                <div className="flex justify-center mb-5">
                                    <Bekjon mood="happy" size={100} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 mb-1 text-center">
                                    {t('onb_step2_title')}
                                </h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step2_sub')}
                                </p>
                                <div
                                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                                >
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-stone-600 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
                                                {t('section_weight')}
                                            </label>
                                            <div
                                                className="rounded-2xl"
                                                style={{ background: 'var(--color-input-bg)' }}
                                            >
                                                <WheelPicker
                                                    min={WEIGHT_MIN}
                                                    max={WEIGHT_MAX}
                                                    value={weight}
                                                    onChange={setWeight}
                                                    suffix="kg"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-stone-600 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
                                                {t('section_height')}
                                            </label>
                                            <div
                                                className="rounded-2xl"
                                                style={{ background: 'var(--color-input-bg)' }}
                                            >
                                                <WheelPicker
                                                    min={HEIGHT_MIN}
                                                    max={HEIGHT_MAX}
                                                    value={height}
                                                    onChange={setHeight}
                                                    suffix="cm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div>
                                <div className="flex justify-center mb-5">
                                    <Bekjon mood="celebration" size={100} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 mb-1 text-center">
                                    {t('onb_step3_title')}
                                </h2>
                                <p className="text-stone-500 dark:text-slate-400 font-medium text-sm text-center mb-6">
                                    {t('onb_step3_sub')}
                                </p>
                                <div
                                    className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                                    style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                                >
                                    <Section label={t('onb_goal_q')}>
                                        <div className="space-y-2">
                                            {(
                                                [
                                                    { val: 'lose', label: t('goal_lose'), Icon: IconTrendingDown },
                                                    { val: 'maintain', label: t('onb_goal_maintain_long'), Icon: IconEqual },
                                                    { val: 'gain', label: t('goal_gain'), Icon: IconTrendingUp },
                                                ] as const
                                            ).map(opt => {
                                                const active = goal === opt.val;
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
                                                );
                                            })}
                                        </div>
                                    </Section>
                                    <Section label={t('onb_activity_label')}>
                                        <select
                                            value={activity}
                                            onChange={handleActivityChange}
                                            className="w-full rounded-2xl px-4 py-3.5 font-semibold text-sm appearance-none focus:outline-none transition"
                                            style={{
                                                background: 'var(--color-input-bg)',
                                                color: 'var(--color-input-text)',
                                                border: '2px solid transparent',
                                            }}
                                            onFocus={e => (e.currentTarget.style.borderColor = '#5B6AD0')}
                                            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
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
                            disabled={saving}
                            className="flex-1 py-4 rounded-2xl font-bold bg-white dark:bg-[#1E252E] text-stone-700 dark:text-slate-300 disabled:opacity-50"
                        >
                            {t('onb_back')}
                        </motion.button>
                    )}
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={next}
                        disabled={!canNext || saving}
                        className="flex-1 py-4 rounded-2xl font-extrabold text-white disabled:opacity-50"
                        style={{
                            background: '#5B6AD0',
                            boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)',
                        }}
                    >
                        {saving ? t('btn_saving') : step === TOTAL_STEPS - 1 ? t('onb_finish') : t('onb_continue')}
                    </motion.button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-3 last:mb-0">
            <label className="block text-xs font-bold text-stone-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {label}
            </label>
            {children}
        </div>
    );
}

function PillButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onClick}
            className="py-3 rounded-2xl text-sm font-bold transition-colors"
            style={{
                background: active ? '#5B6AD0' : 'var(--color-input-bg)',
                color: active ? '#fff' : 'var(--color-input-text)',
            }}
        >
            {children}
        </motion.button>
    );
}

function IconTrendingDown({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            <polyline points="16 17 22 17 22 11" />
        </svg>
    );
}

function IconEqual({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="9" x2="19" y2="9" />
            <line x1="5" y1="15" x2="19" y2="15" />
        </svg>
    );
}

function IconTrendingUp({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
        </svg>
    );
}