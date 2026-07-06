// SkinShop.tsx
// ============================================================
// LOKMA — Skin shop screen (premium refactor)
// - Result<T> API integration (purchaseSkinResult, equipSkinResult, getOwnedSkinsResult)
// - Loading skeleton + error retry
// - Optimistic equip + rollback on failure
// - mountedRef safety + busy guard (processingId)
// - Haptic feedback
// - useCallback / useMemo — stable refs
// - Dark mode fix (category tabs)
// ============================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    supabase,
    wrapPgResult,
    toLokmaError,
    type Result,
} from './supabase';
import { getTelegramId, showAlert } from './telegram';
import {
    purchaseSkinResult,
    equipSkinResult,
    getOwnedSkinsResult,
} from './coins';
import {
    SKINS,
    CATEGORIES,
    getSkinName,
    getSkinDescription,
    getCategoryLabel,
    type SkinCategory,
    type Skin,
} from './skins';
import { useTranslation } from './i18n';

// ============================================================
// CONSTANTS
// ============================================================
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const ACCENT = '#5B6AD0';

// ============================================================
// UTILS — haptic
// ============================================================
function tryHaptic(style: 'light' | 'medium' | 'soft' = 'light'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style);
    } catch {
        /* silent */
    }
}

function tryNotifyHaptic(kind: 'success' | 'error' | 'warning'): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind);
    } catch {
        /* silent */
    }
}

// ============================================================
// INLINE: getUserCoinsAndEquipped (Result<T> style)
// ============================================================
interface UserWalletData {
    coins: number;
    equipped_skin: string | null;
}

async function getUserWallet(): Promise<Result<UserWalletData>> {
    const tgId = getTelegramId();
    if (!tgId) {
        return {
            ok: false,
            error: toLokmaError(new Error('Telegram ID mavjud emas'), 'database'),
        };
    }

    const resp = await supabase
        .from('users')
        .select('coins, equipped_skin')
        .eq('telegram_id', tgId)
        .maybeSingle();

    const wrapped = wrapPgResult<{ coins: number | null; equipped_skin: string | null } | null>(
        resp,
        'getUserWallet',
        { tgId }
    );
    if (!wrapped.ok) return wrapped;

    return {
        ok: true,
        data: {
            coins: wrapped.data?.coins ?? 0,
            equipped_skin: wrapped.data?.equipped_skin ?? null,
        },
    };
}

// ============================================================
// COMPONENT
// ============================================================
type LoadState = 'loading' | 'ready' | 'error';

interface Props {
    onClose: () => void;
}

export default function SkinShop({ onClose }: Props) {
    const { t, lang } = useTranslation();

    const [coins, setCoins] = useState<number>(0);
    const [equipped, setEquipped] = useState<string | null>(null);
    const [owned, setOwned] = useState<string[]>([]);
    const [category, setCategory] = useState<SkinCategory>('national');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [loadState, setLoadState] = useState<LoadState>('loading');

    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ------------------------------------------------------------
    // Data loading
    // ------------------------------------------------------------
    const loadData = useCallback(async (opts?: { forceRefresh?: boolean }): Promise<void> => {
        const [walletRes, ownedRes] = await Promise.all([
            getUserWallet(),
            getOwnedSkinsResult({ force: opts?.forceRefresh }),
        ]);
        if (!mountedRef.current) return;

        if (!walletRes.ok || !ownedRes.ok) {
            setLoadState('error');
            return;
        }

        setCoins(walletRes.data.coins);
        setEquipped(walletRes.data.equipped_skin);
        setOwned(ownedRes.data);
        setLoadState('ready');
    }, []);

    useEffect(() => {
        setLoadState('loading');
        void loadData();
    }, [loadData]);

    const handleRetry = useCallback((): void => {
        setLoadState('loading');
        void loadData({ forceRefresh: true });
    }, [loadData]);

    // ------------------------------------------------------------
    // Purchase handler
    // ------------------------------------------------------------
    const handlePurchase = useCallback(
        async (skin: Skin): Promise<void> => {
            if (processingId) return;
            if (coins < skin.price) {
                tryNotifyHaptic('warning');
                await showAlert(t('shop_no_coins'));
                return;
            }

            tryHaptic('medium');
            setProcessingId(skin.id);

            const res = await purchaseSkinResult(skin.id, skin.price);
            if (!mountedRef.current) return;

            if (!res.ok) {
                tryNotifyHaptic('error');
                await showAlert(res.error.message || t('shop_purchase_err'));
                setProcessingId(null);
                return;
            }

            if (!res.data.success) {
                tryNotifyHaptic('error');
                await showAlert(res.data.error || t('shop_purchase_err'));
                setProcessingId(null);
                return;
            }

            // Muvaffaqiyat
            tryNotifyHaptic('success');
            setCoins(res.data.new_coins ?? coins - skin.price);
            setOwned(prev => (prev.includes(skin.id) ? prev : [...prev, skin.id]));
            setProcessingId(null);
        },
        [processingId, coins, t]
    );

    // ------------------------------------------------------------
    // Equip handler (optimistic + rollback)
    // ------------------------------------------------------------
    const handleEquip = useCallback(
        async (skin: Skin): Promise<void> => {
            if (processingId) return;

            tryHaptic('light');
            setProcessingId(skin.id);

            const newSkinId = equipped === skin.id ? null : skin.id;
            const prevEquipped = equipped;

            // Optimistic update
            setEquipped(newSkinId);

            const res = await equipSkinResult(newSkinId);
            if (!mountedRef.current) return;

            if (!res.ok) {
                // Rollback
                setEquipped(prevEquipped);
                tryNotifyHaptic('error');
                await showAlert(res.error.message || t('save_error'));
                setProcessingId(null);
                return;
            }

            tryNotifyHaptic('success');
            setProcessingId(null);
        },
        [processingId, equipped, t]
    );

    // ------------------------------------------------------------
    // Derived
    // ------------------------------------------------------------
    const filtered = useMemo(
        () => SKINS.filter(s => s.category === category),
        [category]
    );

    const categoryKeys = useMemo(
        () => Object.keys(CATEGORIES) as SkinCategory[],
        []
    );

    // ------------------------------------------------------------
    // Render
    // ------------------------------------------------------------
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
                        <motion.div
                            layout
                            className="flex items-center gap-1.5 bg-white dark:bg-[#1E252E] px-3 py-2.5 rounded-2xl"
                            style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                        >
                            <span className="text-base">🪙</span>
                            <motion.span
                                key={coins}
                                initial={{ scale: 1.15 }}
                                animate={{ scale: 1 }}
                                transition={SPRING}
                                className="text-sm font-extrabold text-stone-800 dark:text-slate-200 tabular-nums"
                            >
                                {coins}
                            </motion.span>
                        </motion.div>
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={onClose}
                            className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1E252E] text-stone-700 dark:text-slate-300 font-extrabold flex items-center justify-center"
                            style={{ boxShadow: '0 4px 12px rgba(91, 106, 208, 0.10)' }}
                            aria-label={t('btn_cancel')}
                        >
                            ✕
                        </motion.button>
                    </div>
                </motion.div>

                {/* Category tabs */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
                    {categoryKeys.map(cat => {
                        const isActive = category === cat;
                        return (
                            <motion.button
                                key={cat}
                                whileTap={{ scale: 0.94 }}
                                onClick={() => {
                                    tryHaptic('soft');
                                    setCategory(cat);
                                }}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-extrabold whitespace-nowrap flex-shrink-0 ${isActive
                                        ? 'text-white'
                                        : 'bg-white dark:bg-[#1E252E] text-gray-700 dark:text-slate-300'
                                    }`}
                                style={{
                                    background: isActive ? ACCENT : undefined,
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

                {/* Content */}
                <AnimatePresence mode="wait">
                    {loadState === 'loading' && (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-2 gap-3"
                        >
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="bg-white dark:bg-[#1E252E] rounded-[1.5rem] p-4 h-[180px] animate-pulse"
                                    style={{ boxShadow: '0 4px 14px -6px rgba(91, 106, 208, 0.10)' }}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-[#F5F6FB] dark:bg-[#252D38] mx-auto mb-3" />
                                    <div className="h-3 bg-[#F5F6FB] dark:bg-[#252D38] rounded mb-2" />
                                    <div className="h-2 bg-[#F5F6FB] dark:bg-[#252D38] rounded w-3/4 mx-auto" />
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {loadState === 'error' && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center py-16"
                        >
                            <p className="text-sm text-stone-500 dark:text-slate-400 mb-4 text-center px-6">
                                {t('shop_error_load')}
                            </p>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={handleRetry}
                                className="px-5 py-2.5 rounded-2xl text-white font-bold text-[13px]"
                                style={{
                                    background: ACCENT,
                                    boxShadow: '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                }}
                            >
                                {t('btn_retry')}
                            </motion.button>
                        </motion.div>
                    )}

                    {loadState === 'ready' && (
                        <motion.div
                            key="ready"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-2 gap-3"
                        >
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
                                        transition={{ ...SPRING, delay: idx * 0.04 }}
                                        className="relative bg-white dark:bg-[#1E252E] rounded-[1.5rem] p-4 flex flex-col items-center text-center"
                                        style={{
                                            boxShadow: isEquipped
                                                ? '0 0 0 2px #5B6AD0, 0 8px 20px -8px rgba(91, 106, 208, 0.3)'
                                                : '0 4px 14px -6px rgba(91, 106, 208, 0.10)',
                                        }}
                                    >
                                        {isEquipped && (
                                            <motion.div
                                                layoutId="equippedBadge"
                                                initial={{ opacity: 0, y: -4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="absolute -top-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white whitespace-nowrap"
                                                style={{ background: ACCENT }}
                                            >
                                                {t('shop_equipped')}
                                            </motion.div>
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
                                                onClick={() => void handleEquip(skin)}
                                                disabled={isProcessing || processingId !== null}
                                                className="w-full mt-3 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
                                                style={{
                                                    background: isEquipped ? '#F3F4F8' : ACCENT,
                                                    color: isEquipped ? '#374151' : '#FFFFFF',
                                                    boxShadow: isEquipped
                                                        ? 'none'
                                                        : '0 4px 12px -4px rgba(91, 106, 208, 0.5)',
                                                }}
                                            >
                                                {isProcessing
                                                    ? '…'
                                                    : isEquipped
                                                        ? t('shop_unequip')
                                                        : t('shop_equip')}
                                            </motion.button>
                                        ) : (
                                            <motion.button
                                                whileTap={{ scale: 0.94 }}
                                                onClick={() => void handlePurchase(skin)}
                                                disabled={
                                                    !canAfford ||
                                                    isProcessing ||
                                                    processingId !== null
                                                }
                                                className="w-full mt-3 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50 flex items-center justify-center gap-1"
                                                style={{
                                                    background: canAfford ? ACCENT : '#F3F4F8',
                                                    color: canAfford ? '#FFFFFF' : '#9CA3AF',
                                                    boxShadow: canAfford
                                                        ? '0 4px 12px -4px rgba(91, 106, 208, 0.5)'
                                                        : 'none',
                                                }}
                                            >
                                                {isProcessing ? (
                                                    '…'
                                                ) : (
                                                    <>
                                                        <span className="tabular-nums">{skin.price}</span>
                                                        <span>🪙</span>
                                                    </>
                                                )}
                                            </motion.button>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}