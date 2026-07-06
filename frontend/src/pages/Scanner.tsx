import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, LokmaError, NetworkError, DatabaseError, toLokmaError, type Result } from '../supabase';
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

// ============================================================
// TYPES
// ============================================================
interface AnalysisResult {
    food_name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    portion_g: number;
}

interface AnalysisResponse {
    food_name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    estimated_grams: number;
}

interface FoodLogEntry {
    food_name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
}

interface FavoritePer100g {
    foodName: string;
    kcalPer100g: number;
    proteinPer100g: number;
    fatPer100g: number;
    carbsPer100g: number;
    source: 'ai' | 'barcode';
    sourceId: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const ANALYZE_TIMEOUT_MS = 45_000; // AI vision can be slow
const SAVED_TOAST_MS = 2_200;

// ============================================================
// TYPE GUARDS
// ============================================================
function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isValidAnalysis(data: unknown): data is AnalysisResponse {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
        typeof d.food_name === 'string' &&
        d.food_name.length > 0 &&
        isFiniteNumber(d.calories) &&
        isFiniteNumber(d.protein) &&
        isFiniteNumber(d.fat) &&
        isFiniteNumber(d.carbs) &&
        isFiniteNumber(d.estimated_grams) &&
        d.estimated_grams > 0
    );
}

// ============================================================
// API HELPERS
// ============================================================
async function analyzeImageAPI(
    photo: File,
    lang: string,
    signal: AbortSignal
): Promise<Result<AnalysisResponse | null>> {
    try {
        const apiLang = lang.startsWith('uz') ? 'uz' : lang;
        const formData = new FormData();
        formData.append('image', photo);

        const res = await fetch(`${API_URL}/api/analyze-food?lang=${apiLang}`, {
            method: 'POST',
            body: formData,
            signal,
        });

        let data: unknown = null;
        try {
            data = await res.json();
        } catch {
            return {
                ok: false,
                error: new NetworkError(`Serverdan yaroqsiz javob keldi (${res.status})`),
            };
        }

        if (!res.ok) {
            const msg =
                data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
                    ? (data as { error: string }).error
                    : `Server xatosi (${res.status})`;
            return { ok: false, error: new NetworkError(msg) };
        }

        // Server "food not detected" ni bo'sh food_name bilan qaytaradi
        if (data && typeof data === 'object' && !(data as Record<string, unknown>).food_name) {
            return { ok: true, data: null };
        }

        if (!isValidAnalysis(data)) {
            return {
                ok: false,
                error: new NetworkError('Server javobi kutilgan formatga mos emas'),
            };
        }

        return { ok: true, data };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            return { ok: false, error: new LokmaError('unknown', 'Bekor qilindi') };
        }
        return { ok: false, error: toLokmaError(err, 'network') };
    }
}

async function insertFoodLog(
    telegramId: number,
    entry: FoodLogEntry
): Promise<Result<null>> {
    try {
        const resp = await supabase.from('food_logs').insert({
            user_id: telegramId,
            ...entry,
        });
        if (resp.error) {
            return {
                ok: false,
                error: new DatabaseError(resp.error.message, resp.error, {
                    scope: 'scanner.insertFoodLog',
                }),
            };
        }
        return { ok: true, data: null };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}

async function saveFoodAndFavorite(
    telegramId: number,
    entry: FoodLogEntry,
    fav: FavoritePer100g
): Promise<Result<null>> {
    const insertRes = await insertFoodLog(telegramId, entry);
    if (!insertRes.ok) return insertRes;

    // Coin va favorite fonda ishlaydi — biri xato bo'lsa log qilishga to'sqinlik qilmaydi
    await addCoinsForLog();
    try {
        await upsertFavorite({
            telegramId,
            foodName: fav.foodName,
            kcalPer100g: fav.kcalPer100g,
            proteinPer100g: fav.proteinPer100g,
            fatPer100g: fav.fatPer100g,
            carbsPer100g: fav.carbsPer100g,
            source: fav.source,
            sourceId: fav.sourceId,
            emoji: null,
        });
    } catch (err) {
        // Favorite fail bo'lsa log muvaffaqiyatli bo'lgani muhimroq — sukut saqlaymiz
        console.warn('[scanner] upsertFavorite failed', err);
    }

    return { ok: true, data: null };
}

// ============================================================
// COMPONENT
// ============================================================
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
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const analyzeAbortRef = useRef<AbortController | null>(null);
    const photoUrlRef = useRef<string | null>(null);
    const mountedRef = useRef(true);

    // ------------------------------------------------------------
    // Lifecycle & cleanup
    // ------------------------------------------------------------
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            if (analyzeAbortRef.current) analyzeAbortRef.current.abort();
            if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        };
    }, []);

    const setPhotoWithUrl = useCallback((file: File | null) => {
        // Eskisini revoke qilamiz — memory leak'ni oldini olish
        if (photoUrlRef.current) {
            URL.revokeObjectURL(photoUrlRef.current);
            photoUrlRef.current = null;
        }
        if (file) {
            const url = URL.createObjectURL(file);
            photoUrlRef.current = url;
            setPhoto(file);
            setPhotoUrl(url);
        } else {
            setPhoto(null);
            setPhotoUrl(null);
        }
    }, []);

    const triggerSavedToast = useCallback((onExpire?: () => void) => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setSaved(false);
            onExpire?.();
        }, SAVED_TOAST_MS);
    }, []);

    // ------------------------------------------------------------
    // Handlers — photo pick / capture
    // ------------------------------------------------------------
    const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoWithUrl(file);
        setResult(null);
        setSaved(false);
    }, [setPhotoWithUrl]);

    const handleCameraCapture = useCallback((file: File) => {
        setCameraOpen(false);
        setPhotoWithUrl(file);
        setResult(null);
        setSaved(false);
    }, [setPhotoWithUrl]);

    const handleReset = useCallback(() => {
        // Ketayotgan AI so'rovni bekor qilamiz
        if (analyzeAbortRef.current) {
            analyzeAbortRef.current.abort();
            analyzeAbortRef.current = null;
        }
        setPhotoWithUrl(null);
        setResult(null);
        setSaved(false);
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    }, [setPhotoWithUrl]);

    // ------------------------------------------------------------
    // AI analyze
    // ------------------------------------------------------------
    const handleAnalyze = useCallback(async () => {
        if (!photo || loading) return;

        // Oldingi so'rovni bekor qilamiz
        if (analyzeAbortRef.current) analyzeAbortRef.current.abort();
        const controller = new AbortController();
        analyzeAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

        setLoading(true);
        try {
            const res = await analyzeImageAPI(photo, lang, controller.signal);

            if (!mountedRef.current) return;

            if (!res.ok) {
                // Bekor qilingan bo'lsa alert ko'rsatmaymiz
                if (res.error.code === 'unknown' && res.error.message === 'Bekor qilindi') return;
                await showAlert(`${t('error_prefix')}${res.error.message || t('scan_unknown_error')}`);
                return;
            }

            if (res.data === null) {
                await showAlert(t('scan_no_food'));
                return;
            }

            const data = res.data;
            const displayName = lang === 'uz-Cyrl' ? uzLatinToCyrl(data.food_name) : data.food_name;
            setResult({
                food_name: displayName,
                calories: Math.max(0, Math.round(data.calories)),
                protein: Math.max(0, Math.round(data.protein * 10) / 10),
                fat: Math.max(0, Math.round(data.fat * 10) / 10),
                carbs: Math.max(0, Math.round(data.carbs * 10) / 10),
                portion_g: Math.max(1, Math.round(data.estimated_grams)),
            });
        } finally {
            clearTimeout(timeoutId);
            if (analyzeAbortRef.current === controller) analyzeAbortRef.current = null;
            if (mountedRef.current) setLoading(false);
        }
    }, [photo, loading, lang, t]);

    // ------------------------------------------------------------
    // Save AI-analyzed food
    // ------------------------------------------------------------
    const handleSave = useCallback(async () => {
        if (!result || saving) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) {
                await showAlert(`${t('error_prefix')}${t('scan_tg_missing')}`);
                return;
            }

            const capitalizedName = result.food_name.charAt(0).toUpperCase() + result.food_name.slice(1);
            const foodNameWithPortion = `${capitalizedName} (${result.portion_g}g)`;

            // Per-100g nisbatni hisoblash (portion_g > 0 kafolatlangan)
            const per100Ratio = 100 / result.portion_g;

            const saveRes = await saveFoodAndFavorite(
                telegramId,
                {
                    food_name: foodNameWithPortion,
                    calories: result.calories,
                    protein: result.protein,
                    fat: result.fat,
                    carbs: result.carbs,
                },
                {
                    foodName: capitalizedName,
                    kcalPer100g: Math.max(0, Math.round(result.calories * per100Ratio)),
                    proteinPer100g: Math.max(0, +(result.protein * per100Ratio).toFixed(1)),
                    fatPer100g: Math.max(0, +(result.fat * per100Ratio).toFixed(1)),
                    carbsPer100g: Math.max(0, +(result.carbs * per100Ratio).toFixed(1)),
                    source: 'ai',
                    sourceId: null,
                }
            );

            if (!mountedRef.current) return;

            if (!saveRes.ok) {
                await showAlert(`${t('error_prefix')}${saveRes.error.message || t('scan_save_error')}`);
                return;
            }

            triggerSavedToast(() => handleReset());
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [result, saving, t, triggerSavedToast, handleReset]);

    // ------------------------------------------------------------
    // Barcode flow
    // ------------------------------------------------------------
    const handleBarcodeDetected = useCallback(async (barcode: string) => {
        setScannerOpen(false);
        setLookingUp(true);
        try {
            const telegramId = getTelegramId() ?? undefined;
            const res = await lookupBarcode(barcode, lang, telegramId);
            if (!mountedRef.current) return;

            if (!res.ok) {
                await showAlert(`${t('error_prefix')}${res.error.message || t('scan_save_error')}`);
                return;
            }
            const p = res.data;
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
            if (!mountedRef.current) return;
            const lokma = toLokmaError(err, 'network');
            await showAlert(`${t('error_prefix')}${lokma.message || t('scan_save_error')}`);
        } finally {
            if (mountedRef.current) setLookingUp(false);
        }
    }, [lang, t]);

    const handleApproveProduct = useCallback(async (portionG: number) => {
        if (!pendingProduct || saving) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) {
                await showAlert(`${t('error_prefix')}${t('scan_tg_missing')}`);
                return;
            }

            const ratio = portionG / 100;
            const fullName = pendingProduct.brand
                ? `${pendingProduct.name} · ${pendingProduct.brand}`
                : pendingProduct.name;

            const saveRes = await saveFoodAndFavorite(
                telegramId,
                {
                    food_name: `${fullName} (${portionG}g)`,
                    calories: Math.max(0, Math.round(pendingProduct.kcal_per_100g * ratio)),
                    protein: Math.max(0, Math.round(pendingProduct.protein_per_100g * ratio * 10) / 10),
                    fat: Math.max(0, Math.round(pendingProduct.fat_per_100g * ratio * 10) / 10),
                    carbs: Math.max(0, Math.round(pendingProduct.carbs_per_100g * ratio * 10) / 10),
                },
                {
                    foodName: fullName,
                    kcalPer100g: pendingProduct.kcal_per_100g,
                    proteinPer100g: pendingProduct.protein_per_100g,
                    fatPer100g: pendingProduct.fat_per_100g,
                    carbsPer100g: pendingProduct.carbs_per_100g,
                    source: 'barcode',
                    sourceId: pendingProduct.barcode ?? null,
                }
            );

            if (!mountedRef.current) return;

            if (!saveRes.ok) {
                await showAlert(`${t('error_prefix')}${saveRes.error.message || t('scan_save_error')}`);
                return;
            }

            setPendingProduct(null);
            triggerSavedToast();
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [pendingProduct, saving, t, triggerSavedToast]);

    const handleManualSubmit = useCallback(async (input: ManualProductInput) => {
        if (!unknownBarcode || saving) return;
        setSaving(true);
        try {
            const telegramId = getTelegramId();
            if (!telegramId) {
                await showAlert(`${t('error_prefix')}${t('scan_tg_missing')}`);
                return;
            }

            // Foydalanuvchi mahsulotini saqlash (crowd-sourced OFF cache)
            let productSaveFailed = false;
            try {
                const saveResult = await saveUserProduct({
                    barcode: unknownBarcode,
                    name: input.name,
                    brand: input.brand,
                    kcal_per_100g: input.kcal,
                    protein_per_100g: input.protein,
                    fat_per_100g: input.fat,
                    carbs_per_100g: input.carbs,
                }, telegramId);
                if (!saveResult.ok) productSaveFailed = true;
            } catch (err) {
                console.warn('[scanner] saveUserProduct failed', err);
                productSaveFailed = true;
            }

            if (productSaveFailed) {
                if (mountedRef.current) {
                    await showAlert(`${t('error_prefix')}${t('bc_save_failed')}`);
                }
                return;
            }

            const ratio = input.portion / 100;
            const fullName = input.brand ? `${input.name} · ${input.brand}` : input.name;

            const saveRes = await saveFoodAndFavorite(
                telegramId,
                {
                    food_name: `${fullName} (${input.portion}g)`,
                    calories: Math.max(0, Math.round(input.kcal * ratio)),
                    protein: Math.max(0, Math.round(input.protein * ratio * 10) / 10),
                    fat: Math.max(0, Math.round(input.fat * ratio * 10) / 10),
                    carbs: Math.max(0, Math.round(input.carbs * ratio * 10) / 10),
                },
                {
                    foodName: fullName,
                    kcalPer100g: input.kcal,
                    proteinPer100g: input.protein,
                    fatPer100g: input.fat,
                    carbsPer100g: input.carbs,
                    source: 'barcode',
                    sourceId: unknownBarcode,
                }
            );

            if (!mountedRef.current) return;

            if (!saveRes.ok) {
                await showAlert(`${t('error_prefix')}${saveRes.error.message || t('scan_save_error')}`);
                return;
            }

            setUnknownBarcode(null);
            setPrefill(null);
            triggerSavedToast();
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [unknownBarcode, saving, t, triggerSavedToast]);

    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------
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