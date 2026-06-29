import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabase';
import { getTelegramId, showAlert } from '../telegram';
import { addCoinsForLog, COINS_PER_LOG } from '../coins';
import Bekjon from '../components/Bekjon';
import { useTranslation } from '../i18n';
import BarcodeScanner from '../BarcodeScanner';
import CameraCapture from "../components/CameraCapture";
import { lookupBarcode, saveUserProduct, type OFFProduct } from '../openfoodfacts';
import { upsertFavorite } from '../lib/favorites';
import BarcodeApproveModal from '../components/BarcodeApproveModal';
import BarcodeManualEntryModal, { type ManualProductInput } from '../components/BarcodeManualEntryModal';
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
    const [cameraOpen, setCameraOpen] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<OFFProduct | null>(null);
    const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
    const [prefill, setPrefill] = useState<{ name: string; brand?: string } | null>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhoto(file);
        setPhotoUrl(URL.createObjectURL(file));
        setResult(null);
        setSaved(false);
    };

    const handleCameraCapture = (file: File) => {
        setCameraOpen(false);
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
                await showAlert(t('scan_no_food'));
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
            await showAlert(`${t('error_prefix')}${msg}`);
        } finally {
            setLoading(false);
        }
    };

    async function handleBarcodeDetected(barcode: string) {
        setScannerOpen(false);
        setLookingUp(true);
        try {
            const telegramId = getTelegramId() ?? undefined;
            const p = await lookupBarcode(barcode, lang, telegramId);
            if (!p) {
                setPrefill(null);
                setUnknownBarcode(barcode);
                return;
            }
            if (p.incomplete) {
                setPrefill({ name: p.name, brand: p.brand });
                setUnknownBarcode(barcode);
                return;
            }
            setPendingProduct(p);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            await showAlert(`${t('error_prefix')}${msg}`);
        } finally {
            setLookingUp(false);
        }
    }

    async function handleApproveProduct(portionG: number) {
        if (!pendingProduct) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('scan_tg_missing'));
            const ratio = portionG / 100;
            const fullName = pendingProduct.brand ? `${pendingProduct.name} · ${pendingProduct.brand}` : pendingProduct.name;
            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: `${fullName} (${portionG}g)`,
                calories: Math.round(pendingProduct.kcal_per_100g * ratio),
                protein: Math.round(pendingProduct.protein_per_100g * ratio * 10) / 10,
                fat: Math.round(pendingProduct.fat_per_100g * ratio * 10) / 10,
                carbs: Math.round(pendingProduct.carbs_per_100g * ratio * 10) / 10,
            });
            if (error) throw error;
            await addCoinsForLog();

            // Sevimlilarga avtomatik qo'shish
            await upsertFavorite({
                telegramId,
                foodName: fullName,
                kcalPer100g: pendingProduct.kcal_per_100g,
                proteinPer100g: pendingProduct.protein_per_100g,
                fatPer100g: pendingProduct.fat_per_100g,
                carbsPer100g: pendingProduct.carbs_per_100g,
                source: 'barcode',
                sourceId: pendingProduct.barcode ?? null,
                emoji: null,
            });

            setPendingProduct(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            await showAlert(`${t('error_prefix')}${msg}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleManualSubmit(input: ManualProductInput) {
        if (!unknownBarcode) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('scan_tg_missing'));
            const result = await saveUserProduct({
                barcode: unknownBarcode,
                name: input.name,
                brand: input.brand,
                kcal_per_100g: input.kcal,
                protein_per_100g: input.protein,
                fat_per_100g: input.fat,
                carbs_per_100g: input.carbs,
            }, telegramId);
            if (!result) throw new Error(t('bc_save_failed'));

            const ratio = input.portion / 100;
            const fullName = input.brand ? `${input.name} · ${input.brand}` : input.name;
            const { error } = await supabase.from('food_logs').insert({
                user_id: telegramId,
                food_name: `${fullName} (${input.portion}g)`,
                calories: Math.round(input.kcal * ratio),
                protein: Math.round(input.protein * ratio * 10) / 10,
                fat: Math.round(input.fat * ratio * 10) / 10,
                carbs: Math.round(input.carbs * ratio * 10) / 10,
            });
            if (error) throw error;
            await addCoinsForLog();

            // Sevimlilarga avtomatik qo'shish
            await upsertFavorite({
                telegramId,
                foodName: fullName,
                kcalPer100g: input.kcal,
                proteinPer100g: input.protein,
                fatPer100g: input.fat,
                carbsPer100g: input.carbs,
                source: 'barcode',
                sourceId: unknownBarcode,
                emoji: null,
            });

            setUnknownBarcode(null);
            setPrefill(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            await showAlert(`${t('error_prefix')}${msg}`);
        } finally {
            setSaving(false);
        }
    }

    const handleReset = () => {
        setPhoto(null);
        setPhotoUrl(null);
        setResult(null);
        setSaved(false);
        if (galleryInputRef.current) galleryInputRef.current.value = '';
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

            // Sevimlilarga avtomatik qo'shish (AI tahlil natijasi)
            if (result.portion_g > 0) {
                const per100Ratio = 100 / result.portion_g;
                await upsertFavorite({
                    telegramId,
                    foodName: capitalizedName,
                    kcalPer100g: Math.round(result.calories * per100Ratio),
                    proteinPer100g: +(result.protein * per100Ratio).toFixed(1),
                    fatPer100g: +(result.fat * per100Ratio).toFixed(1),
                    carbsPer100g: +(result.carbs * per100Ratio).toFixed(1),
                    source: 'ai',
                    sourceId: null,
                    emoji: null,
                });
            }

            setSaved(true);
            setTimeout(() => handleReset(), 2200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('scan_save_error');
            await showAlert(`${t('error_prefix')}${msg}`);
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
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
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

                            <div className="grid grid-cols-[1fr_auto] gap-2.5">
                                <motion.button
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setCameraOpen(true)}
                                    className="text-left rounded-[1.5rem] p-5 flex items-center gap-4 relative overflow-hidden"
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
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.4-2h4.8l1.4 2h1.7A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8z" fill="#fff" fillOpacity="0.25" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                                            <circle cx="12" cy="13" r="3.8" fill="#fff" fillOpacity="0.4" stroke="#fff" strokeWidth="1.8" />
                                            <circle cx="12" cy="13" r="1.5" fill="#fff" />
                                            <circle cx="17" cy="9" r=".8" fill="#fff" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0 relative">
                                        <div className="text-white font-extrabold text-[16px] leading-tight">
                                            {t('scan_method_photo_title')}
                                        </div>
                                        <div className="text-white/75 text-[12px] font-medium mt-0.5 leading-snug">
                                            {t('scan_method_photo_sub')}
                                        </div>
                                    </div>
                                </motion.button>

                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => galleryInputRef.current?.click()}
                                    aria-label={t('scan_gallery')}
                                    className="rounded-[1.5rem] flex flex-col items-center justify-center px-4 gap-1.5 relative overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(135deg, #F4F1FF 0%, #E8E4FA 100%)',
                                        boxShadow: '0 8px 22px -10px rgba(91, 106, 208, 0.35), inset 0 0 0 1px rgba(91, 106, 208, 0.12)',
                                    }}
                                >
                                    <div
                                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl"
                                        style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F0EDFF 100%)',
                                            boxShadow: '0 4px 10px -4px rgba(91, 106, 208, 0.3)',
                                        }}
                                    >
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                                            <rect x="3" y="4" width="18" height="16" rx="3" fill="#5B6AD0" fillOpacity="0.35" stroke="#4A58B8" strokeWidth="2" />
                                            <circle cx="8.5" cy="9.5" r="1.8" fill="#4A58B8" />
                                            <path d="M3.5 17.5l4.5-4.5 3.5 3.5 3.5-3.5 5 5" stroke="#4A58B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                        </svg>
                                    </div>
                                    <div className="text-[11px] font-extrabold leading-none" style={{ color: '#4A58B8' }}>
                                        {t('scan_gallery')}
                                    </div>
                                </motion.button>
                            </div>

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

            <CameraCapture
                open={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onCapture={handleCameraCapture}
            />

            <BarcodeApproveModal
                product={pendingProduct}
                saving={saving}
                onApprove={handleApproveProduct}
                onCancel={() => setPendingProduct(null)}
            />

            <BarcodeManualEntryModal
                barcode={unknownBarcode}
                saving={saving}
                prefillName={prefill?.name}
                prefillBrand={prefill?.brand}
                onSubmit={handleManualSubmit}
                onCancel={() => { setUnknownBarcode(null); setPrefill(null); }}
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