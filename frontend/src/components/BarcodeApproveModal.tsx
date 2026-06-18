import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import type { OFFProduct } from '../openfoodfacts';
import { useTranslation } from '../i18n';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

interface Props {
    product: OFFProduct | null;
    saving: boolean;
    onApprove: (portionG: number) => void;
    onCancel: () => void;
}

export default function BarcodeApproveModal({ product, saving, onApprove, onCancel }: Props) {
    const { t } = useTranslation();
    const [portion, setPortion] = useState(100);

    useEffect(() => {
        if (product?.serving_size_g) setPortion(Math.round(product.serving_size_g));
        else setPortion(100);
    }, [product]);

    if (!product) return null;
    const ratio = portion / 100;
    const kcal = Math.round(product.kcal_per_100g * ratio);
    const protein = Math.round(product.protein_per_100g * ratio * 10) / 10;
    const fat = Math.round(product.fat_per_100g * ratio * 10) / 10;
    const carbs = Math.round(product.carbs_per_100g * ratio * 10) / 10;

    const sourceBadge =
        product.source === 'lokma' ? { label: t('bc_src_community'), bg: '#DDE3F5', color: '#3B4DAB' } :
            product.source === 'off' ? { label: t('bc_src_off'), bg: '#FFF4D6', color: '#8A6D14' } :
                { label: t('bc_src_user'), bg: '#FAD9C8', color: '#A04B1E' };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
                onClick={onCancel}
            >
                <motion.div
                    initial={{ y: 40, scale: 0.96, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: 40, scale: 0.96, opacity: 0 }}
                    transition={SPRING}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-white dark:bg-[#1E252E] rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8"
                    style={{ boxShadow: '0 -10px 40px -8px rgba(0,0,0,0.2)' }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span
                                    className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                    style={{ background: sourceBadge.bg, color: sourceBadge.color }}
                                >
                                    {sourceBadge.label}
                                </span>
                            </div>
                            <h2 className="text-[20px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">
                                {product.name}
                            </h2>
                            {product.brand && (
                                <p className="text-[13px] font-semibold text-stone-500 dark:text-slate-400 mt-0.5">
                                    {product.brand}
                                </p>
                            )}
                        </div>
                        {product.image && (
                            <img src={product.image} alt={product.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
                        )}
                    </div>

                    <div className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-[44px] font-extrabold leading-none" style={{ color: '#5B6AD0' }}>{kcal}</span>
                        <span className="text-sm text-stone-400 dark:text-slate-500 font-bold">kcal</span>
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[12px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-slate-400">
                                {t('bc_portion')}
                            </label>
                            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-slate-800 rounded-full px-1 py-1">
                                <button
                                    onClick={() => setPortion((p) => Math.max(10, p - 10))}
                                    className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 font-extrabold text-stone-700 dark:text-slate-200"
                                >−</button>
                                <input
                                    type="number"
                                    value={portion}
                                    onChange={(e) => setPortion(Math.max(1, Math.min(2000, parseInt(e.target.value) || 0)))}
                                    className="w-14 text-center font-extrabold text-stone-900 dark:text-slate-100 bg-transparent outline-none"
                                />
                                <span className="text-xs font-bold text-stone-500 dark:text-slate-400 pr-1">g</span>
                                <button
                                    onClick={() => setPortion((p) => Math.min(2000, p + 10))}
                                    className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 font-extrabold text-stone-700 dark:text-slate-200"
                                >+</button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                        <Pill label={t('macro_protein')} value={protein} bg="#FFF4D6" />
                        <Pill label={t('macro_fat')} value={fat} bg="#FAD9C8" />
                        <Pill label={t('macro_carbs')} value={carbs} bg="#DDE3F5" />
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
                            onClick={() => onApprove(portion)}
                            disabled={saving}
                            className="flex-[2] text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-60"
                            style={{
                                background: '#5B6AD0',
                                boxShadow: '0 8px 20px -6px rgba(91, 106, 208, 0.5)',
                            }}
                        >
                            {saving ? t('btn_saving') : t('bc_approve_add')}
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function Pill({ label, value, bg }: { label: string; value: number; bg: string }) {
    return (
        <div className="rounded-2xl p-2.5 text-center" style={{ background: bg }}>
            <div className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: '#57534e' }}>{label}</div>
            <div className="text-base font-extrabold mt-0.5" style={{ color: '#1c1917' }}>
                {value}<span className="text-xs font-semibold" style={{ color: '#78716c' }}>g</span>
            </div>
        </div>
    );
}