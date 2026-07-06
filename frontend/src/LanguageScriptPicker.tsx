// src/LanguageScriptPicker.tsx
import { useCallback, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Bekjon from './components/Bekjon';
import { setLanguage } from './i18n';
import { hapticImpact, hapticSelection } from './telegram';

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

type Step = 'lang' | 'script';
type LangCode = 'uz' | 'ru' | 'en';
type Script = 'Latn' | 'Cyrl';

interface Props {
    onComplete: () => void;
}

// Har bir tilda "Tilni tanlang" matni — user qaysisi o'zinikini tushunadi
const WELCOME_TEXTS: readonly { lang: string; text: string }[] = [
    { lang: "O'zbekcha", text: 'Tilni tanlang' },
    { lang: 'Русский', text: 'Выберите язык' },
    { lang: 'English', text: 'Choose language' },
];

// ============================================================================
// LANG BUTTON (memoized)
// ============================================================================

interface LangButtonProps {
    emoji: string;
    label: string;
    sublabel?: string;
    onClick: () => void;
}

const LangButton = memo(function LangButton({ emoji, label, sublabel, onClick }: LangButtonProps) {
    return (
        <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClick}
            className="w-full bg-white dark:bg-[#1E252E] rounded-[1.5rem] py-4 px-5 flex items-center gap-4 text-left"
            style={{ boxShadow: '0 4px 16px -6px rgba(91, 106, 208, 0.12)' }}
            aria-label={label}
        >
            <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-extrabold"
                style={{ background: 'var(--color-input-bg)', color: '#5B6AD0' }}
            >
                {emoji}
            </div>
            <div className="flex-1">
                <div className="text-[15px] font-extrabold text-stone-900 dark:text-slate-100">
                    {label}
                </div>
                {sublabel && (
                    <div className="text-[12px] font-semibold text-stone-500 dark:text-slate-400">
                        {sublabel}
                    </div>
                )}
            </div>
            <div className="text-stone-300 text-xl">›</div>
        </motion.button>
    );
});

// ============================================================================
// MAIN
// ============================================================================

function LanguageScriptPickerBase({ onComplete }: Props) {
    const [step, setStep] = useState<Step>('lang');
    const [busy, setBusy] = useState(false);

    const handleLangSelect = useCallback((lang: LangCode) => {
        if (busy) return;
        hapticSelection();
        if (lang === 'uz') {
            setStep('script'); // O'zbek → yozuv tanlash
            return;
        }
        try {
            setBusy(true);
            setLanguage(lang);
            onComplete();
        } catch (err) {
            console.error('[lang-picker] setLanguage failed:', err);
            setBusy(false);
        }
    }, [busy, onComplete]);

    const handleScriptSelect = useCallback((script: Script) => {
        if (busy) return;
        hapticSelection();
        try {
            setBusy(true);
            setLanguage('uz', script);
            onComplete();
        } catch (err) {
            console.error('[lang-picker] setLanguage failed:', err);
            setBusy(false);
        }
    }, [busy, onComplete]);

    const handleBack = useCallback(() => {
        if (busy) return;
        hapticImpact('light');
        setStep('lang');
    }, [busy]);

    // Individual selectors (stable — deps never change during pick)
    const pickUz = useCallback(() => handleLangSelect('uz'), [handleLangSelect]);
    const pickRu = useCallback(() => handleLangSelect('ru'), [handleLangSelect]);
    const pickEn = useCallback(() => handleLangSelect('en'), [handleLangSelect]);
    const pickLatn = useCallback(() => handleScriptSelect('Latn'), [handleScriptSelect]);
    const pickCyrl = useCallback(() => handleScriptSelect('Cyrl'), [handleScriptSelect]);

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center px-6"
            style={{ background: 'var(--color-bg)', fontFamily: FONT }}
        >
            <AnimatePresence mode="wait">
                {step === 'lang' && (
                    <motion.div
                        key="lang"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={SPRING}
                        className="w-full max-w-md flex flex-col items-center"
                    >
                        <motion.div
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <Bekjon mood="happy" size={140} />
                        </motion.div>

                        <div className="mt-6 mb-8 text-center">
                            <h1 className="text-[24px] font-extrabold text-stone-900 dark:text-slate-100">
                                Lokma
                            </h1>
                            <div className="mt-3 space-y-1">
                                {WELCOME_TEXTS.map((w) => (
                                    <div
                                        key={w.lang}
                                        className="text-[13px] font-semibold text-stone-500 dark:text-slate-400"
                                    >
                                        {w.text}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="w-full space-y-3">
                            <LangButton emoji="🇺🇿" label="O'zbekcha" onClick={pickUz} />
                            <LangButton emoji="🇷🇺" label="Русский" onClick={pickRu} />
                            <LangButton emoji="🇬🇧" label="English" onClick={pickEn} />
                        </div>
                    </motion.div>
                )}

                {step === 'script' && (
                    <motion.div
                        key="script"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={SPRING}
                        className="w-full max-w-md flex flex-col items-center"
                    >
                        <Bekjon mood="happy" size={120} />

                        <div className="mt-6 mb-8 text-center">
                            <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-100">
                                Yozuvni tanlang
                            </h1>
                            <div className="text-[13px] font-semibold text-stone-500 dark:text-slate-400 mt-1">
                                Ёзувни танланг
                            </div>
                        </div>

                        <div className="w-full space-y-3">
                            <LangButton
                                emoji="Aa"
                                label="Lotincha"
                                sublabel="O'zbekcha"
                                onClick={pickLatn}
                            />
                            <LangButton
                                emoji="Аа"
                                label="Кириллча"
                                sublabel="Ўзбекча"
                                onClick={pickCyrl}
                            />
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleBack}
                            className="mt-5 text-[13px] font-bold text-stone-500 dark:text-slate-400"
                        >
                            ← Orqaga
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const LanguageScriptPicker = memo(LanguageScriptPickerBase);
export default LanguageScriptPicker;