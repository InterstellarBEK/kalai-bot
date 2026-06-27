import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from './supabase'
import FoodSearch from './FoodSearch'
import Dashboard from './Dashboard'
import Onboarding from './Onboarding'
import Scanner from './pages/Scanner'
import Bekjon from './components/Bekjon'
import WheelPicker from './components/WheelPicker'
import RamadanScreen from './RamadanScreen'
import PaywallScreen from './PaywallScreen'
import PremiumSettingsScreen from './PremiumSettingsScreen'
import ReferralScreen from './ReferralScreen'
import LanguageScriptPicker from './LanguageScriptPicker'
import { initTelegram, getTelegramId, getStartParam } from './telegram'
import { useTranslation, setLanguage, type Lang } from './i18n'
import { getTheme, toggleTheme, type Theme } from './theme'

type Tab = 'today' | 'scanner' | 'foods' | 'profile' | 'ramadan'

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 }

// Validation chegaralari
const AGE_MIN = 13
const AGE_MAX = 100
const WEIGHT_MIN = 30
const WEIGHT_MAX = 300
const WEIGHT_DEFAULT = 70
const HEIGHT_MIN = 100
const HEIGHT_MAX = 250
const HEIGHT_DEFAULT = 170

const LANG_OPTIONS: { key: Lang; flag: string; label: string; sub?: string }[] = [
  { key: 'uz-Latn', flag: '🇺🇿', label: "O'zbek", sub: 'Lotin' },
  { key: 'uz-Cyrl', flag: '🇺🇿', label: 'Ўзбек', sub: 'Кирилл' },
  { key: 'ru', flag: '🇷🇺', label: 'Русский' },
  { key: 'en', flag: '🇬🇧', label: 'English' },
]

function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)
  const [needsLanguage, setNeedsLanguage] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showPremiumSettings, setShowPremiumSettings] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [activity, setActivity] = useState('1.375')
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain')
  const [result, setResult] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    initTelegram()
    checkLanguage()
  }, [])

  async function checkLanguage() {
    const savedLang = localStorage.getItem('lokma_lang')
    if (!savedLang) {
      setNeedsLanguage(true)
      setLoading(false)
      return
    }
    await checkOnboarding()
  }

  async function checkOnboarding() {
    const tgId = getTelegramId()
    const { data } = await supabase
      .from('users')
      .select('daily_calories_goal, trial_used')
      .eq('telegram_id', tgId)
      .maybeSingle()

    if (!data?.trial_used) {
      await supabase.rpc('activate_trial', { p_telegram_id: tgId })

      const startParam = getStartParam()
      if (startParam?.startsWith('ref_')) {
        const referrerId = parseInt(startParam.slice(4), 10)
        if (referrerId && referrerId !== tgId) {
          await supabase.rpc('apply_referral', {
            p_referrer_id: referrerId,
            p_referred_id: tgId,
          })
        }
      }
    }

    if (!data?.daily_calories_goal) setNeedsOnboarding(true)
    setLoading(false)
  }

  const calculate = async () => {
    const a = parseFloat(age)
    const w = parseFloat(weight)
    const h = parseFloat(height)

    // Validation: bo'sh yoki chegara tashqarisida bo'lsa to'xtat
    if (!a || !w || !h) return
    if (a < AGE_MIN || a > AGE_MAX) {
      alert(`Yosh ${AGE_MIN}–${AGE_MAX} oralig'ida bo'lishi kerak`)
      return
    }
    if (w < WEIGHT_MIN || w > WEIGHT_MAX) {
      alert(`Vazn ${WEIGHT_MIN}–${WEIGHT_MAX} kg oralig'ida bo'lishi kerak`)
      return
    }
    if (h < HEIGHT_MIN || h > HEIGHT_MAX) {
      alert(`Bo'y ${HEIGHT_MIN}–${HEIGHT_MAX} cm oralig'ida bo'lishi kerak`)
      return
    }

    let bmr = 10 * w + 6.25 * h - 5 * a
    bmr += gender === 'male' ? 5 : -161
    let tdee = bmr * parseFloat(activity)
    if (goal === 'lose') tdee -= 500
    if (goal === 'gain') tdee += 500

    const finalKcal = Math.round(tdee)
    setResult(finalKcal)
    setSaving(true)
    setSaved(false)

    const { error } = await supabase.from('users').upsert({
      telegram_id: getTelegramId(),
      age: a, weight_kg: w, height_cm: h,
      gender, activity, goal,
      daily_calories_goal: finalKcal,
    }, { onConflict: 'telegram_id' })

    setSaving(false)
    if (error) { alert('Xato: ' + error.message); return }
    setSaved(true)
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[#ECEEF5] dark:bg-[#0F1419]"
        style={{ fontFamily: FONT }}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Bekjon mood="happy" size={120} />
        </motion.div>
      </div>
    )
  }

  if (needsLanguage) {
    return (
      <LanguageScriptPicker
        onComplete={() => {
          setNeedsLanguage(false)
          setLoading(true)
          checkOnboarding()
        }}
      />
    )
  }

  if (needsOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          setNeedsOnboarding(false)
          const seen = localStorage.getItem('lokma_paywall_seen')
          if (!seen) {
            localStorage.setItem('lokma_paywall_seen', '1')
            setTimeout(() => setShowPaywall(true), 600)
          }
        }}
      />
    )
  }

  if (showPaywall) {
    return <PaywallScreen onClose={() => setShowPaywall(false)} />
  }
  if (showReferral) {
    return <ReferralScreen onClose={() => setShowReferral(false)} />
  }
  if (showPremiumSettings) {
    return (
      <PremiumSettingsScreen
        onBack={() => setShowPremiumSettings(false)}
        onUpgrade={() => { setShowPremiumSettings(false); setShowPaywall(true) }}
        onReferral={() => { setShowPremiumSettings(false); setShowReferral(true) }}
      />
    )
  }

  return (
    <div className="bg-[#ECEEF5] dark:bg-[#0F1419] min-h-screen" style={{ fontFamily: FONT }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'today' && <Dashboard />}
          {tab === 'scanner' && <Scanner />}
          {tab === 'foods' && <FoodSearch />}
          {tab === 'ramadan' && <RamadanScreen />}
          {tab === 'profile' && (
            <ProfileForm
              {...{
                gender, setGender, age, setAge, weight, setWeight, height, setHeight,
                activity, setActivity, goal, setGoal, result, saving, saved, calculate,
                onOpenPaywall: () => setShowPremiumSettings(true)
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation()

  const items: { id: Tab; icon: string; label: string }[] = [
    { id: 'today', icon: '📊', label: t('nav_today') },
    { id: 'scanner', icon: '📷', label: t('nav_scanner') },
    { id: 'foods', icon: '🍽️', label: t('nav_foods') },
    { id: 'ramadan', icon: '🌙', label: t('nav_ramadan') },
    { id: 'profile', icon: '👤', label: t('nav_profile') },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="max-w-md mx-auto px-4 pb-4 pt-2 pointer-events-auto">
        <div
          className="bg-white dark:bg-[#1E252E] rounded-3xl flex items-center justify-around p-2"
          style={{ boxShadow: '0 10px 30px -8px rgba(91, 106, 208, 0.18), 0 4px 12px -4px rgba(0,0,0,0.05)' }}
        >
          {items.map((item) => {
            const active = tab === item.id
            return (
              <motion.button
                key={item.id}
                onClick={() => setTab(item.id)}
                whileTap={{ scale: 0.92 }}
                className="relative flex-1 flex items-center justify-center py-2.5 rounded-2xl"
              >
                {active && (
                  <motion.div
                    layoutId="navBubble"
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: '#5B6AD0' }}
                    transition={SPRING}
                  />
                )}
                <span
                  className="relative z-10 flex items-center gap-1.5"
                  style={{ color: active ? '#fff' : 'var(--color-nav-inactive)' }}
                >
                  <span className="text-lg">{item.icon}</span>
                  {active && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      transition={{ duration: 0.25 }}
                      className="text-xs font-extrabold whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

function ProfileForm(props: any) {
  const { t, lang } = useTranslation()
  const {
    gender, setGender, age, setAge, weight, setWeight, height, setHeight,
    activity, setActivity, goal, setGoal, result, saving, saved, calculate, onOpenPaywall
  } = props
  const [theme, setTheme] = useState<Theme>(getTheme())
  function handleThemeToggle() {
    const next = toggleTheme()
    setTheme(next)
  }

  function handleLangChange(opt: typeof LANG_OPTIONS[number]) {
    if (opt.key === 'uz-Latn') setLanguage('uz', 'Latn')
    else if (opt.key === 'uz-Cyrl') setLanguage('uz', 'Cyrl')
    else if (opt.key === 'ru') setLanguage('ru')
    else setLanguage('en')
  }

  // Age string ↔ number bridge
  const ageNum = parseInt(age, 10)
  const ageValue = isNaN(ageNum) ? 19 : Math.max(AGE_MIN, Math.min(AGE_MAX, ageNum))

  // Weight/Height string ↔ number bridge
  const weightNum = parseFloat(weight)
  const weightValue = isNaN(weightNum) ? WEIGHT_DEFAULT : Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, Math.round(weightNum)))
  const heightNum = parseFloat(height)
  const heightValue = isNaN(heightNum) ? HEIGHT_DEFAULT : Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Math.round(heightNum)))

  return (
    <div className="min-h-screen pb-28 bg-[#ECEEF5] dark:bg-[#0F1419]">
      <div className="max-w-md mx-auto px-5 pt-7">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="mb-5"
        >
          <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-1000 leading-tight">{t('profile_title')}</h1>
          <p className="text-[13px]text-stone-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-400 font-medium mt-0.5">{t('profile_subtitle')}</p>
        </motion.div>

        {/* --- Premium tugmasi --- */}
        <motion.button
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenPaywall}
          className="w-full rounded-[1.75rem] p-4 mb-3 flex items-center gap-3 text-left"
          style={{
            background: 'linear-gradient(135deg, #5B6AD0 0%, #7A8AE8 100%)',
            boxShadow: '0 8px 24px -8px rgba(91, 106, 208, 0.4)',
          }}
        >
          <div className="text-3xl">⭐</div>
          <div className="flex-1">
            <div className="text-white font-extrabold text-base">{t('profile_premium_btn')}</div>
            <div className="text-white/80 text-xs font-semibold mt-0.5">
              {t('profile_premium_sub')}
            </div>
          </div>
          <div className="text-white text-xl">→</div>
        </motion.button>

        {/* --- Til tanlash kartochkasi --- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.02 }}
          className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-4 mb-3"
          style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
        >
          <p className="text-xs font-boldtext-stone-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-3">
            {t('lang_section')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LANG_OPTIONS.map((opt) => {
              const active = lang === opt.key
              return (
                <motion.button
                  key={opt.key}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLangChange(opt)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-2xl transition-colors text-left"
                  style={{
                    background: active ? '#5B6AD0' : 'var(--color-input-bg)',
                    color: active ? '#fff' : 'var(--color-input-text)',
                  }}
                >
                  <span className="text-lg leading-none">{opt.flag}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight truncate">{opt.label}</p>
                    {opt.sub && (
                      <p className="text-[10px] font-medium leading-tight" style={{ opacity: active ? 0.8 : 0.5 }}>
                        {opt.sub}
                      </p>
                    )}
                  </div>
                  {active && (
                    <span className="ml-auto text-xs font-black">✓</span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* --- Theme (Light/Dark) --- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.035 }}
          className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-4 mb-3"
          style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
        >
          <p className="text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            {t('section_theme')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { if (theme !== 'light') handleThemeToggle() }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl font-bold text-sm transition ${theme === 'light'
                ? 'bg-[#5B6AD0] text-white'
                : 'bg-[#F3F4F8] dark:bg-[#252D38] text-stone-700 dark:text-slate-300'
                }`}
            >
              ☀️ {t('theme_light')}
              {theme === 'light' && <span className="ml-auto text-xs font-black">✓</span>}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { if (theme !== 'dark') handleThemeToggle() }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl font-bold text-sm transition ${theme === 'dark'
                ? 'bg-[#5B6AD0] text-white'
                : 'bg-[#F3F4F8] dark:bg-[#252D38] text-stone-700 dark:text-slate-300'
                }`}
            >
              🌙 {t('theme_dark')}
              {theme === 'dark' && <span className="ml-auto text-xs font-black">✓</span>}
            </motion.button>
          </div>
        </motion.div>

        {/* --- Maqsad hisoblash kartochkasi --- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.05 }}
          className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-3"
          style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
        >
          <div className="flex flex-col items-center mb-4">
            <Bekjon mood={result ? 'celebration' : 'happy'} size={100} />
            <div className="text-sm font-bold text-stone-700 dark:text-slate-300 mt-2">
              {result ? t('profile_goal_ready') : t('profile_goal_set')}
            </div>
          </div>

          <Section label={t('section_gender')}>
            <div className="grid grid-cols-2 gap-2">
              <PillButton active={gender === 'male'} onClick={() => setGender('male')}>{t('gender_male')}</PillButton>
              <PillButton active={gender === 'female'} onClick={() => setGender('female')}>{t('gender_female')}</PillButton>
            </div>
          </Section>

          <Section label={t('section_age')}>
            <AgeStepper
              value={ageValue}
              onChange={(n) => setAge(String(n))}
              min={AGE_MIN}
              max={AGE_MAX}
            />
          </Section>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
                {t('section_weight')}
              </label>
              <div className="rounded-2xl" style={{ background: 'var(--color-input-bg)' }}>
                <WheelPicker
                  min={WEIGHT_MIN}
                  max={WEIGHT_MAX}
                  value={weightValue}
                  onChange={(n) => setWeight(String(n))}
                  suffix="kg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
                {t('section_height')}
              </label>
              <div className="rounded-2xl" style={{ background: 'var(--color-input-bg)' }}>
                <WheelPicker
                  min={HEIGHT_MIN}
                  max={HEIGHT_MAX}
                  value={heightValue}
                  onChange={(n) => setHeight(String(n))}
                  suffix="cm"
                />
              </div>
            </div>
          </div>

          <Section label={t('section_activity')}>
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

          <Section label={t('section_goal')}>
            <div className="space-y-2">
              {[
                { val: 'lose' as const, label: t('goal_lose'), Icon: IconTrendingDown },
                { val: 'maintain' as const, label: t('goal_maintain'), Icon: IconEqual },
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

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={calculate}
            disabled={saving}
            className="w-full text-white font-extrabold py-4 rounded-2xl mt-2 disabled:opacity-60"
            style={{ background: '#5B6AD0', boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)' }}
          >
            {saving ? t('btn_saving') : t('btn_calculate')}
          </motion.button>
        </motion.div>

        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 text-center"
            style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.18)' }}
          >
            <div className="text-xs font-boldtext-stone-500 dark:text-slate-400 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider">{t('result_title')}</div>
            <div className="text-[44px] font-extrabold mt-1 leading-none" style={{ color: '#5B6AD0' }}>
              {result}
              <span className="text-base text-stone-400 dark:text-slate-500 font-bold ml-1">kcal</span>
            </div>
            {saved && (
              <div className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-extrabold"
                style={{ background: '#E8F5E9', color: '#1D9E75' }}>
                {t('result_saved')}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-boldtext-stone-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
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

/* ─────────── Age Stepper (− 19 +) ─────────── */
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
          if (e.target.value === '') { onChange(''); return }
          const n = parseFloat(e.target.value)
          if (isNaN(n)) return
          if (max !== undefined && n > max) { onChange(String(max)); return }
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        className={`w-full rounded-2xl px-4 py-3.5 font-semibold text-sm focus:outline-none transition ${suffix ? 'pr-12' : ''}`}
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

export default App