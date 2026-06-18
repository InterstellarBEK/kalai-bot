import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';
import CameraCapture from './CameraCapture';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';

export interface ManualProductInput {
    name: string;
    brand?: string;
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
    portion: number;
}

interface Props {
    barcode: string | null;
    saving: boolean;
    onSubmit: (input: ManualProductInput) => void;
    onCancel: () => void;
    prefillName?: string;
    prefillBrand?: string;
}

export default function BarcodeManualEntryModal({ barcode, saving, onSubmit, onCancel, prefillName, prefillBrand }: Props) {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    const [kcal, setKcal] = useState('');
    const [protein, setProtein] = useState('');
    const [fat, setFat] = useState('');
    const [carbs, setCarbs] = useState('');
    const [portion, setPortion] = useState('100');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [scanningLabel, setScanningLabel] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => {
        if (barcode) {
            setName(prefillName || '');
            setBrand(prefillBrand || '');
            setKcal('');
            setProtein('');
            setFat('');
            setCarbs('');
            setPortion('100');
            setScanError(null);
        }
    }, [barcode, prefillName, prefillBrand]);

    if (!barcode) return null;

    const canSubmit = name.trim().length >= 2 && parseFloat(kcal) > 0 && parseFloat(portion) > 0;

    const handleSubmit = () => {
        if (!canSubmit) return;
        onSubmit({
            name: name.trim(),
            brand: brand.trim() || undefined,
            kcal: parseFloat(kcal),
            protein: parseFloat(protein) || 0,
            fat: parseFloat(fat) || 0,
            carbs: parseFloat(carbs) || 0,
            portion: parseFloat(portion),
        });
    };

    const handleLabelCapture = async (file: File) => {
        setCameraOpen(false);
        setScanningLabel(true);
        setScanError(null);
        try {
            const fd = new FormData();
            fd.append('image', file, 'label.jpg');
            const res = await fetch(`${API_URL}/api/analyze-label`, {
                method: 'POST',
                body: fd,
            });
            const data = await res.json();
            if (data.error) {
                setScanError(data.error);
            } else {
                if (data.product_name && !name) setName(data.product_name);
                if (data.brand && !brand) setBrand(data.brand);
                if (data.kcal_per_100g) setKcal(String(data.kcal_per_100g));
                if (data.protein_per_100g != null) setProtein(String(data.protein_per_100g));
                if (data.fat_per_100g != null) setFat(String(data.fat_per_100g));
                if (data.carbs_per_100g != null) setCarbs(String(data.carbs_per_100g));
            }
        } catch (e: any) {
            setScanError(e?.message || 'Network error');
        } finally {
            setScanningLabel(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={onCancel}
            >
                <motion.div
                    initial={{ y: 40, scale: 0.96, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: 40, scale: 0.96, opacity: 0 }}
                    transition={SPRING}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-white dark:bg-[#1E252E] rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8 max-h-[92vh] overflow-y-auto"
                    style={{ boxShadow: '0 -10px 40px -8px rgba(0,0,0,0.2)' }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <span
                            className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: '#FAD9C8', color: '#A04B1E' }}
                        >
                            {t('bc_new_product')}
                        </span>
                    </div>
                    <h2 className="text-[20px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">
                        {t('bc_manual_title')}
                    </h2>
                    <p className="text-[13px] font-semibold text-stone-500 dark:text-slate-400 mt-1">
                        {t('bc_manual_sub')}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-stone-100 dark:bg-slate-800 rounded-full px-3 py-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-slate-400">{t('bc_label')}</span>
                        <span className="text-[12px] font-mono font-bold text-stone-700 dark:text-slate-300">{barcode}</span>
                    </div>

                    {/* AI Label Scan CTA */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setCameraOpen(true)}
                        disabled={scanningLabel}
                        className="w-full mt-4 relative overflow-hidden rounded-2xl p-[1.5px] disabled:opacity-60"
                        style={{
                            background: 'linear-gradient(135deg, #5B6AD0 0%, #8B5BD0 50%, #D05BAA 100%)',
                        }}
                    >
                        <div className="bg-white dark:bg-[#1E252E] rounded-[14px] px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                                    style={{ background: 'linear-gradient(135deg, #5B6AD0, #8B5BD0)' }}
                                >
                                    {scanningLabel ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                                        />
                                    ) : (
                                        <span>✨</span>
                                    )}
                                </div>
                                <div className="text-left">
                                    <div className="text-[14px] font-extrabold text-stone-900 dark:text-slate-100">
                                        {scanningLabel ? t('bc_scanning_label') : t('bc_scan_label')}
                                    </div>
                                    <div className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">
                                        {t('bc_scan_label_hint')}
                                    </div>
                                </div>
                            </div>
                            <span className="text-stone-400 dark:text-slate-500 text-lg">›</span>
                        </div>
                    </motion.button>

                    {scanError && (
                        <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl text-[12px] font-semibold text-red-700 dark:text-red-300">
                            {t('bc_label_failed')}: {scanError}
                        </div>
                    )}

                    <div className="mt-5 space-y-3">
                        <Field label={t('bc_field_name')} required>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('bc_ph_name')}
                                maxLength={80}
                                className="w-full bg-stone-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 text-[15px] font-semibold text-stone-900 dark:text-slate-100 outline-none border-2 border-transparent focus:border-[#5B6AD0]"
                            />
                        </Field>
                        <Field label={t('bc_field_brand')}>
                            <input
                                value={brand}
                                onChange={(e) => setBrand(e.target.value)}
                                placeholder={t('bc_ph_brand')}
                                maxLength={60}
                                className="w-full bg-stone-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 text-[15px] font-semibold text-stone-900 dark:text-slate-100 outline-none border-2 border-transparent focus:border-[#5B6AD0]"
                            />
                        </Field>

                        <div className="bg-stone-50 dark:bg-slate-800/60 rounded-2xl p-3.5 mt-1">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-slate-400 mb-2.5">
                                {t('bc_per_100g')}
                            </div>
                            <NumField label={t('bc_field_kcal')} value={kcal} onChange={setKcal} required suffix="kcal" />
                            <div className="grid grid-cols-3 gap-2 mt-2.5">
                                <NumField compact label={t('macro_protein')} value={protein} onChange={setProtein} suffix="g" />
                                <NumField compact label={t('macro_fat')} value={fat} onChange={setFat} suffix="g" />
                                <NumField compact label={t('macro_carbs')} value={carbs} onChange={setCarbs} suffix="g" />
                            </div>
                        </div>

                        <Field label={t('bc_portion')}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={portion}
                                    onChange={(e) => setPortion(e.target.value)}
                                    className="flex-1 bg-stone-50 dark:bg-slate-800 rounded-xl px-3.5 py-3 text-[15px] font-semibold text-stone-900 dark:text-slate-100 outline-none border-2 border-transparent focus:border-[#5B6AD0]"
                                />
                                <span className="text-sm font-bold text-stone-500 dark:text-slate-400">g</span>
                            </div>
                        </Field>
                    </div>

                    <div className="flex gap-2.5 mt-6">
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={onCancel}
                            disabled={saving}
                            className="flex-1 bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 font-bold py-3.5 rounded-2xl disabled:opacity-50"
                        >
                            {t('scan_cancel')}
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={handleSubmit}
                            disabled={saving || !canSubmit}
                            className="flex-[2] text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-40"
                            style={{
                                background: '#5B6AD0',
                                boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)',
                            }}
                        >
                            {saving ? t('btn_saving') : t('bc_save_share')}
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>

            {cameraOpen && (
                <CameraCapture
                    open={cameraOpen}
                    onClose={() => setCameraOpen(false)}
                    onCapture={handleLabelCapture}
                />
            )}
        </AnimatePresence>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-slate-400 mb-1.5">
                {label}{required && <span style={{ color: '#5B6AD0' }}> *</span>}
            </div>
            {children}
        </label>
    );
}

function NumField({ label, value, onChange, suffix, required, compact }:
    { label: string; value: string; onChange: (v: string) => void; suffix: string; required?: boolean; compact?: boolean }) {
    return (
        <label className="block">
            <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-extrabold uppercase tracking-wider text-stone-500 dark:text-slate-400 mb-1`}>
                {label}{required && <span style={{ color: '#5B6AD0' }}> *</span>}
            </div>
            <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl px-3 py-2.5 border-2 border-transparent focus-within:border-[#5B6AD0]">
                <input
                    type="number"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent outline-none text-[15px] font-extrabold text-stone-900 dark:text-slate-100"
                />
                <span className="text-[11px] font-bold text-stone-400 dark:text-slate-500 ml-1">{suffix}</span>
            </div>
        </label>
    );
}