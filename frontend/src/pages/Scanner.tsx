import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabase';
import { getTelegramId } from '../telegram';
import { addCoinsForLog, COINS_PER_LOG } from '../coins';
import Bekjon from '../components/Bekjon';
import { useTranslation } from '../i18n';
import BarcodeScanner from '../BarcodeScanner';
import { lookupBarcode } from '../openfoodfacts';
import { uzLatinToCyrl } from '../transliterate';

interface AnalysisResult {
    food_name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    portion_g: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

export default function Scanner() {
    const { t, lang } = useTranslation();
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhoto(file);
        setPhotoUrl(URL.createObjectURL(file));
        setResult(null);
        setSaved(false);
    };

    const handleAnalyze = async () => {
        if (!photo) return;
        setLoading(true);
        try {
            const apiLang = lang.startsWith('uz') ? 'uz' : lang;
            const formData = new FormData();
            formData.append('image', photo);
            const res = await fetch(`${API_URL}/api/analyze-food?lang=${apiLang}`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('scan_unknown_error'));
            if (!data.food_name) {
                alert(t('scan_no_food'));
                setLoading(false);
                return;
            }
            const displayName = lang === 'uz-Cyrl' ? uzLatinToCyrl(data.food_name) : data.food_name;
            setResult({
                food_name: displayName,
                calories: data.calories,
                protein: data.protein,
                fat: data.fat,
                carbs: data.carbs,
                portion_g: data.estimated_grams,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_unknown_error');
            alert(`${t('error_prefix')}${msg}`);
        } finally {
            setLoading(false);
        }
    };

    async function handleBarcodeDetected(barcode: string) {
        setScannerOpen(false);
        setLookingUp(true);
        try {
            const p = await lookupBarcode(barcode, lang);
            if (!p) {
                alert(t('bc_not_found'));
                return;
            }
            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('scan_tg_missing'));
            const name = p.brand ? `${p.name} · ${p.brand}` : p.name;
            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: `${name} (100g)`,
                calories: p.kcal_per_100g,
                protein: p.protein_per_100g,
                fat: p.fat_per_100g,
                carbs: p.carbs_per_100g,
            });
            if (error) throw error;
            await addCoinsForLog();
            setSaved(true);
            setTimeout(() => handleReset(), 2200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            alert(`${t('error_prefix')}${msg}`);
        } finally {
            setLookingUp(false);
        }
    }

    const handleReset = () => {
        setPhoto(null);
        setPhotoUrl(null);
        setResult(null);
        setSaved(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleSave = async () => {
        if (!result) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('scan_tg_missing'));
            const capitalizedName = result.food_name.charAt(0).toUpperCase() + result.food_name.slice(1);
            const foodNameWithPortion = `${capitalizedName} (${result.portion_g}g)`;
            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: foodNameWithPortion,
                calories: result.calories,
                protein: result.protein,
                fat: result.fat,
                carbs: result.carbs,
            });
            if (error) throw error;

            await addCoinsForLog();

            setSaved(true);
            setTimeout(() => handleReset(), 2200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            alert(`${t('error_prefix')}${msg}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
            <div className="max-w-md mx-auto px-5 pt-7">
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mb-5"
                >
                    <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">
                        {t('scan_title')}
                    </h1>
                    <p className="text-[13px] text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                        {t('scan_subtitle')}
                    </p>
                </motion.div>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                />

                <AnimatePresence mode="wait">
                    {saved && (
                        <motion.div
                            key="saved"
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.92 }}
                            transition={SPRING}
                            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-10 text-center"
                            style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.18)' }}
                        >
                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                                className="text-7xl mb-3"
                            >
                                ✅
                            </motion.div>
                            <h2 className="text-xl font-extrabold text-stone-900 dark:text-slate-100 mb-1">
                                {t('scan_saved_title')}
                            </h2>
                            <p className="text-sm text-stone-500 dark:text-slate-400 font-medium mb-3">
                                {t('scan_saved_sub')}
                            </p>
                            <motion.div
                                initial={{ scale: 0, y: 10 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.25 }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-extrabold"
                                style={{ background: '#FFF4D6', color: '#854F0B' }}
                            >
                                +{COINS_PER_LOG} 🪙
                            </motion.div>
                        </motion.div>
                    )}

                    {!saved && !photoUrl && !lookingUp && (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={SPRING}
                            className="space-y-3"
                        >
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] pt-6 pb-5 flex flex-col items-center"
                                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                            >
                                <Bekjon mood="happy" size={110} />
                                <p className="text-[13px] text-stone-500 dark:text-slate-400 font-semibold mt-2 px-6 text-center">
                                    {t('scan_tip')}
                                </p>
                            </div>

                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => inputRef.current?.click()}
                                className="w-full text-left rounded-[1.5rem] p-5 flex items-center gap-4 relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(135deg, #6B7AE0 0%, #5B6AD0 60%, #4A58B8 100%)',
                                    boxShadow: '0 12px 28px -10px rgba(91, 106, 208, 0.55)',
                                }}
                            >
                                <div
                                    className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-20"
                                    style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
                                />
                                <div
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                                    style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
                                >
                                    📷
                                </div>
                                <div className="flex-1 min-w-0 relative">
                                    <div className="text-white font-extrabold text-[16px] leading-tight">
                                        {t('scan_method_photo_title')}
                                    </div>
                                    <div className="text-white/75 text-[12px] font-medium mt-0.5 leading-snug">
                                        {t('scan_method_photo_sub')}
                                    </div>
                                </div>
                                <div className="text-white/80 text-lg relative">→</div>
                            </motion.button>

                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setScannerOpen(true)}
                                className="w-full text-left rounded-[1.5rem] p-5 flex items-center gap-4 relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(135deg, #FFE7BD 0%, #FAD9C8 55%, #F4C7B0 100%)',
                                    boxShadow: '0 12px 28px -10px rgba(232, 156, 100, 0.45)',
                                }}
                            >
                                <div
                                    className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-25"
                                    style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
                                />
                                <div
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                                    style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(8px)' }}
                                >
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                                        <rect x="3" y="5" width="1.5" height="14" rx="0.4" fill="#854F0B" />
                                        <rect x="6" y="5" width="2.2" height="14" rx="0.4" fill="#854F0B" />
                                        <rect x="10" y="5" width="1.2" height="14" rx="0.4" fill="#854F0B" />
                                        <rect x="13" y="5" width="2.6" height="14" rx="0.4" fill="#854F0B" />
                                        <rect x="17" y="5" width="1.4" height="14" rx="0.4" fill="#854F0B" />
                                        <rect x="20" y="5" width="1" height="14" rx="0.4" fill="#854F0B" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0 relative">
                                    <div className="font-extrabold text-[16px] leading-tight" style={{ color: '#5A3410' }}>
                                        {t('scan_method_barcode_title')}
                                    </div>
                                    <div className="text-[12px] font-medium mt-0.5 leading-snug" style={{ color: 'rgba(90, 52, 16, 0.7)' }}>
                                        {t('scan_method_barcode_sub')}
                                    </div>
                                </div>
                                <div className="text-lg relative" style={{ color: 'rgba(90, 52, 16, 0.6)' }}>→</div>
                            </motion.button>
                        </motion.div>
                    )}

                    {!saved && !photoUrl && lookingUp && (
                        <motion.div
                            key="looking"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={SPRING}
                            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-10 flex flex-col items-center"
                            style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.18)' }}
                        >
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                                className="w-12 h-12 rounded-full border-4 border-stone-200 dark:border-slate-700"
                                style={{ borderTopColor: '#5B6AD0' }}
                            />
                            <p className="text-sm font-bold text-stone-700 dark:text-slate-300 mt-4">
                                {t('bc_looking_up')}
                            </p>
                        </motion.div>
                    )}

                    {!saved && photoUrl && !result && (
                        <motion.div
                            key="preview"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={SPRING}
                            className="space-y-3"
                        >
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] overflow-hidden"
                                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.18)' }}
                            >
                                <img src={photoUrl} alt={t('scan_title')} className="w-full h-64 object-cover" />
                            </div>
                            <div className="flex gap-2.5">
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleReset}
                                    disabled={loading}
                                    className="flex-1 bg-white dark:bg-[#1E252E]  text-stone-700 dark:text-slate-300 font-bold py-3.5 rounded-2xl disabled:opacity-50"
                                >
                                    {t('scan_retry')}
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleAnalyze}
                                    disabled={loading}
                                    className="flex-[2] text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-60"
                                    style={{
                                        background: '#5B6AD0',
                                        boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)',
                                    }}
                                >
                                    {loading ? t('scan_analyzing') : t('scan_analyze')}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {!saved && result && (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={SPRING}
                            className="space-y-3"
                        >
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] overflow-hidden"
                                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.18)' }}
                            >
                                <img src={photoUrl!} alt={t('scan_title')} className="w-full h-40 object-cover" />
                            </div>
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5"
                                style={{ boxShadow: '0 8px 24px -10px rgba(91, 106, 208, 0.12)' }}
                            >
                                <h2 className="text-xl font-extrabold text-stone-900 dark:text-slate-100 capitalize">
                                    {result.food_name}
                                </h2>
                                <p className="text-xs text-stone-500 dark:text-slate-400 font-semibold mt-0.5">
                                    {t('scan_approx')} {result.portion_g}g
                                </p>
                                <div className="mt-3 flex items-baseline gap-1.5">
                                    <span
                                        className="text-[44px] font-extrabold leading-none"
                                        style={{ color: '#5B6AD0' }}
                                    >
                                        {result.calories}
                                    </span>
                                    <span className="text-sm text-stone-400 dark:text-slate-500 font-bold">kcal</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-4">
                                    <MacroPill label={t('macro_protein')} value={result.protein} bg="#FFF4D6" />
                                    <MacroPill label={t('macro_fat')} value={result.fat} bg="#FAD9C8" />
                                    <MacroPill label={t('macro_carbs')} value={result.carbs} bg="#DDE3F5" />
                                </div>
                            </div>
                            <div className="flex gap-2.5">
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleReset}
                                    disabled={saving}
                                    className="flex-1 bg-white dark:bg-[#1E252E]  text-stone-700 dark:text-slate-300 font-bold py-3.5 rounded-2xl disabled:opacity-50"
                                >
                                    {t('scan_cancel')}
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-[2] text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-60"
                                    style={{
                                        background: '#5B6AD0',
                                        boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)',
                                    }}
                                >
                                    {saving ? t('btn_saving') : t('scan_save')}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <BarcodeScanner
                open={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onDetected={handleBarcodeDetected}
            />
        </div>
    );
}

function MacroPill({ label, value, bg }: { label: string; value: number; bg: string }) {
    return (
        <div className="rounded-2xl p-2.5 text-center" style={{ background: bg }}>
            <div
                className="text-[9px] font-extrabold uppercase tracking-wider"
                style={{ color: '#57534e' }}
            >
                {label}
            </div>
            <div className="text-base font-extrabold mt-0.5" style={{ color: '#1c1917' }}>
                {value}<span className="text-xs font-semibold" style={{ color: '#78716c' }}>g</span>
            </div>
        </div>
    );
}