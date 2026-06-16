import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from './supabase';
import { getTelegramId } from './telegram';
import { purchaseSkin, equipSkin, getOwnedSkins } from './coins';
import { SKINS, CATEGORIES, getSkinName, getSkinDescription, getCategoryLabel, type SkinCategory, type Skin } from './skins';
import { useTranslation } from './i18n';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

interface Props {
    onClose: () => void;
}

export default function SkinShop({ onClose }: Props) {
    const { t, lang } = useTranslation();
    const [coins, setCoins] = useState(0);
    const [equipped, setEquipped] = useState<string | null>(null);
    const [owned, setOwned] = useState<string[]>([]);
    const [category, setCategory] = useState<SkinCategory>('national');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [userRes, ownedSkins] = await Promise.all([
            supabase
                .from('users')
                .select('coins, equipped_skin')
                .eq('telegram_id', getTelegramId())
                .single(),
            getOwnedSkins(),
        ]);
        if (userRes.data) {
            setCoins(userRes.data.coins || 0);
            setEquipped(userRes.data.equipped_skin || null);
        }
        setOwned(ownedSkins);
        setLoading(false);
    }

    async function handlePurchase(skin: Skin) {
        if (processingId) return;
        if (coins < skin.price) {
            alert(t('shop_no_coins'));
            return;
        }
        setProcessingId(skin.id);
        const result = await purchaseSkin(skin.id, skin.price);
        if (result.success) {
            setCoins(result.new_coins ?? coins - skin.price);
            setOwned(prev => [...prev, skin.id]);
        } else {
            alert(result.error || t('shop_purchase_err'));
        }
        setProcessingId(null);
    }

    async function handleEquip(skin: Skin) {
        if (processingId) return;
        setProcessingId(skin.id);
        const newSkin = equipped === skin.id ? null : skin.id;
        const ok = await equipSkin(newSkin);
        if (ok) setEquipped(newSkin);
        setProcessingId(null);
    }

    const filtered = SKINS.filter(s => s.category === category);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto"
            style={{
                background: 'var(--color-bg)',
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            }}
        >
            <div className="max-w-md mx-auto px-5 pt-7 pb-10">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="flex items-center justify-between mb-5"
                >
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[22px] font-extrabold text-stone-900 dark:text-slate-100 leading-tight">
                            {t('shop_title')}
                        </h1>
                        <p className="text-[13px] text-stone-500 dark:text-slate-400 font-medium mt-0.5">
                            {t('shop_subtitle')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div
                            className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                            style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                        >
                            <span className="text-base">🪙</span>
                            <span className="text-sm font-extrabold text-stone-800 dark:text-slate-200">{coins}</span>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={onClose}
                            className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1E252E]  text-stone-700 dark:text-slate-300 font-extrabold flex items-center justify-center"
                            style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                        >
                            ✕
                        </motion.button>
                    </div>
                </motion.div>

                {/* Category tabs */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
                    {(Object.keys(CATEGORIES) as SkinCategory[]).map(cat => {
                        const isActive = category === cat;
                        return (
                            <motion.button
                                key={cat}
                                whileTap={{ scale: 0.94 }}
                                onClick={() => setCategory(cat)}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-extrabold whitespace-nowrap transition-colors flex-shrink-0"
                                style={{
                                    background: isActive ? '#5B6AD0' : '#FFFFFF',
                                    color: isActive ? '#FFFFFF' : '#374151',
                                    boxShadow: isActive
                                        ? '0 4px 12px -4px rgba(91, 106, 208, 0.5)'
                                        : '0 2px 8px rgba(91, 106, 208, 0.08)',
                                }}
                            >
                                <span>{CATEGORIES[cat].icon}</span>
                                <span>{getCategoryLabel(cat, lang)}</span>
                            </motion.button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="text-center py-16 text-stone-500 dark:text-slate-400 font-semibold">
                        {t('loading')}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {filtered.map((skin, idx) => {
                            const isOwned = owned.includes(skin.id);
                            const isEquipped = equipped === skin.id;
                            const canAfford = coins >= skin.price;
                            const isProcessing = processingId === skin.id;

                            return (
                                <motion.div
                                    key={skin.id}
                                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ ...SPRING, delay: idx * 0.05 }}
                                    className="relative bg-white dark:bg-[#1E252E] rounded-[1.5rem] p-4 flex flex-col items-center text-center"
                                    style={{
                                        boxShadow: isEquipped
                                            ? '0 0 0 2px #5B6AD0, 0 8px 20px -8px rgba(91, 106, 208, 0.3)'
                                            : '0 4px 14px -6px rgba(91, 106, 208, 0.10)',
                                    }}
                                >
                                    {isEquipped && (
                                        <div
                                            className="absolute -top-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white whitespace-nowrap"
                                            style={{ background: '#5B6AD0' }}
                                        >
                                            {t('shop_equipped')}
                                        </div>
                                    )}
                                    <div className="text-5xl mb-2">{skin.emoji}</div>
                                    <h3 className="font-extrabold text-stone-900 dark:text-slate-100 text-sm leading-tight">
                                        {getSkinName(skin, lang)}
                                    </h3>
                                    <p className="text-[11px] text-stone-500 dark:text-slate-400 font-semibold mt-1 leading-snug min-h-[28px]">
                                        {getSkinDescription(skin, lang)}
                                    </p>

                                    {isOwned ? (
                                        <motion.button
                                            whileTap={{ scale: 0.94 }}
                                            onClick={() => handleEquip(skin)}
                                            disabled={isProcessing}
                                            className="w-full mt-3 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
                                            style={{
                                                background: isEquipped ? '#F3F4F8' : '#5B6AD0',
                                                color: isEquipped ? '#374151' : '#FFFFFF',
                                                boxShadow: isEquipped
                                                    ? 'none'
                                                    : '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                            }}
                                        >
                                            {isProcessing ? '...' : isEquipped ? t('shop_unequip') : t('shop_equip')}
                                        </motion.button>
                                    ) : (
                                        <motion.button
                                            whileTap={{ scale: 0.94 }}
                                            onClick={() => handlePurchase(skin)}
                                            disabled={!canAfford || isProcessing}
                                            className="w-full mt-3 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50 flex items-center justify-center gap-1"
                                            style={{
                                                background: canAfford ? '#5B6AD0' : '#F3F4F8',
                                                color: canAfford ? '#FFFFFF' : '#9CA3AF',
                                                boxShadow: canAfford
                                                    ? '0 4px 12px -4px rgba(91, 106, 208, 0.5)'
                                                    : 'none',
                                            }}
                                        >
                                            {isProcessing ? '...' : (
                                                <>
                                                    <span>{skin.price}</span>
                                                    <span>🪙</span>
                                                </>
                                            )}
                                        </motion.button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}