// src/P2PPaymentModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTelegramId, hapticImpact, hapticNotify } from './telegram';
import { useTranslation } from './i18n';

// ============================================================================
// CONSTANTS
// ============================================================================

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const BOT_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BOT_URL || 'https://kalai-bot.onrender.com';

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const COPY_FEEDBACK_MS = 1800;
const UPLOAD_SUCCESS_DELAY = 1500;
const CREATE_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

// ============================================================================
// TYPES
// ============================================================================

type Plan = 'weekly' | 'monthly' | 'yearly';
type CopyKind = 'card' | 'amount';
type UploadStatus = 'idle' | 'success' | 'error';

interface Props {
    plan: Plan;
    onClose: () => void;
    onReceiptUploaded?: () => void;
}

interface PaymentData {
    payment_id: number;
    card_number: string;
    card_holder: string;
    bank_name: string;
    total_amount: number;
    base_amount: number;
    suffix: number;
    expires_at: string;
}

// ============================================================================
// ICONS (memoized)
// ============================================================================

const PIcon = memo(function PIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'close' | 'errorCircle' | 'camera' | 'check';
    size?: number;
    color?: string;
    fill?: string;
    strokeWidth?: number;
}) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    };
    switch (name) {
        case 'close':
            return (
                <svg {...common}>
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            );
        case 'errorCircle':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="9.5" fill={fill} />
                    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
                </svg>
            );
        case 'camera':
            return (
                <svg {...common}>
                    <path
                        d="M3.5 8h3l1.5-2.5h8L17.5 8h3a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 18.5v-9A1.5 1.5 0 013.5 8z"
                        fill={fill}
                    />
                    <circle cx="12" cy="13.5" r="3.5" />
                </svg>
            );
        case 'check':
            return (
                <svg {...common}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            );
    }
});

// ============================================================================
// HELPERS
// ============================================================================

function fmt(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

function safeNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function formatCard(card: string): string {
    return card.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', onExternalAbort);
    }

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}

/**
 * Rasmni Canvas API orqali resize qiladi.
 * - max 1280×1280 (aspect ratio saqlanadi)
 * - EXIF orientation avtomatik (createImageBitmap)
 * - JPEG 0.85 quality
 * - Fallback: xato bo'lsa original file qaytadi
 */
async function resizeImage(file: File): Promise<File> {
    let bitmap: ImageBitmap | null = null;
    try {
        // EXIF orientation'ni avtomatik qo'llaydi (modern browserlarda)
        try {
            bitmap = await createImageBitmap(file, {
                imageOrientation: 'from-image',
            } as ImageBitmapOptions);
        } catch {
            // Safari eski versiyalar uchun fallback
            bitmap = await createImageBitmap(file);
        }

        const { width: srcW, height: srcH } = bitmap;

        const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
        const dstW = Math.max(1, Math.round(srcW * scale));
        const dstH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = dstW;
        canvas.height = dstH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas_ctx_failed');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, dstW, dstH);

        const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('canvas_toblob_failed'))),
                'image/jpeg',
                JPEG_QUALITY
            );
        });

        return new File([blob], 'receipt.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch (err) {
        console.warn('[resizeImage] fallback to original:', err);
        return file;
    } finally {
        bitmap?.close?.();
    }
}

// ============================================================================
// MAIN
// ============================================================================

function P2PPaymentModalBase({ plan, onClose, onReceiptUploaded }: Props) {
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<PaymentData | null>(null);
    const [copied, setCopied] = useState<CopyKind | null>(null);
    const [secondsLeft, setSecondsLeft] = useState<number>(0);
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
    const [uploadMessage, setUploadMessage] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const uploadSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const createAbortRef = useRef<AbortController | null>(null);
    const uploadAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    // Stable ref — parent callback identity o'zgarsa qayta upload trigger bo'lmasin
    const onReceiptUploadedRef = useRef(onReceiptUploaded);
    onReceiptUploadedRef.current = onReceiptUploaded;

    // ==== Lifecycle & cleanup ====
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            if (uploadSuccessTimerRef.current) clearTimeout(uploadSuccessTimerRef.current);
            createAbortRef.current?.abort();
            uploadAbortRef.current?.abort();
        };
    }, []);

    // ==== Create payment session ====
    useEffect(() => {
        const controller = new AbortController();
        createAbortRef.current?.abort();
        createAbortRef.current = controller;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const telegramId = getTelegramId();
                if (!telegramId) {
                    throw new Error(t('scan_tg_missing') || 'Telegram ID topilmadi');
                }

                const res = await fetchWithTimeout(
                    `${BOT_URL}/api/p2p/create`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ telegram_id: telegramId, plan }),
                    },
                    CREATE_TIMEOUT_MS,
                    controller.signal
                );

                let json: any = null;
                try {
                    json = await res.json();
                } catch {
                    throw new Error(t('p2p_network_error'));
                }

                if (!mountedRef.current) return;
                if (!res.ok || json?.error) {
                    throw new Error(json?.error || json?.message || t('p2p_network_error'));
                }
                setData(json);
            } catch (e) {
                if (!mountedRef.current) return;
                if (e instanceof Error && e.name === 'AbortError') return;
                const msg = e instanceof Error ? e.message : t('p2p_network_error');
                setError(msg);
            } finally {
                if (mountedRef.current) setLoading(false);
            }
        })();

        return () => {
            controller.abort();
        };
    }, [plan, t]);

    // ==== Countdown timer ====
    useEffect(() => {
        if (!data?.expires_at) return;
        const target = new Date(data.expires_at).getTime();
        if (!Number.isFinite(target)) return;

        const tick = () => {
            if (!mountedRef.current) return;
            const ms = target - Date.now();
            setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [data?.expires_at]);

    // ==== Derived (memoized) ====
    const { mm, ss, amountStr, expired, cardFormatted } = useMemo(() => {
        const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const ss = (secondsLeft % 60).toString().padStart(2, '0');
        const amountStr = data ? safeNum(data.total_amount).toLocaleString('ru') : '';
        const expired = secondsLeft <= 0 && data !== null;
        const cardFormatted = data ? formatCard(data.card_number) : '';
        return { mm, ss, amountStr, expired, cardFormatted };
    }, [secondsLeft, data]);

    // ==== Copy ====
    const copy = useCallback(async (value: string, kind: CopyKind) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                // Fallback — legacy execCommand
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            hapticNotify('success');
            if (!mountedRef.current) return;
            setCopied(kind);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                if (mountedRef.current) setCopied(null);
            }, COPY_FEEDBACK_MS);
        } catch {
            hapticNotify('error');
        }
    }, []);

    // ==== File select ====
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Input value clear — bir xil rasmni qayta tanlash mumkin bo'lsin
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (!file || !data) return;

        // Original size tekshiruvi
        if (file.size > MAX_FILE_SIZE) {
            hapticNotify('error');
            setUploadStatus('error');
            setUploadMessage(t('p2p_upload_too_large') || "Rasm hajmi 10MB dan oshmasligi kerak");
            return;
        }

        // MIME sanity check
        if (!file.type.startsWith('image/')) {
            hapticNotify('error');
            setUploadStatus('error');
            setUploadMessage(t('p2p_upload_bad_type') || 'Faqat rasm yuboring');
            return;
        }

        // Avvalgi upload'ni bekor qilamiz
        uploadAbortRef.current?.abort();
        const controller = new AbortController();
        uploadAbortRef.current = controller;

        hapticImpact('light');
        setUploading(true);
        setUploadStatus('idle');
        setUploadMessage('');

        try {
            // 1. Canvas resize
            const resized = await resizeImage(file);
            if (!mountedRef.current || controller.signal.aborted) return;

            if (resized.size > MAX_FILE_SIZE) {
                throw new Error(t('p2p_upload_too_large') || "Rasm hajmi 10MB dan oshmasligi kerak");
            }

            const telegramId = getTelegramId();
            if (!telegramId) throw new Error(t('scan_tg_missing') || 'Telegram ID topilmadi');

            // 2. Yuborish
            const formData = new FormData();
            formData.append('telegram_id', String(telegramId));
            formData.append('payment_id', String(data.payment_id));
            formData.append('image', resized);

            const res = await fetchWithTimeout(
                `${BOT_URL}/api/p2p/upload-receipt`,
                { method: 'POST', body: formData },
                UPLOAD_TIMEOUT_MS,
                controller.signal
            );

            let json: any = null;
            try {
                json = await res.json();
            } catch {
                throw new Error(t('p2p_network_error'));
            }

            if (!mountedRef.current) return;
            if (!res.ok || json?.error) {
                throw new Error(json?.message || json?.error || 'Upload failed');
            }

            hapticNotify('success');
            setUploadStatus('success');
            setUploadMessage(t('p2p_upload_success') || 'Chek qabul qilindi! Admin tekshiradi.');

            // Parent signal — 1.5s kechikish (user "Yuklandi"ni ko'rsin)
            if (uploadSuccessTimerRef.current) clearTimeout(uploadSuccessTimerRef.current);
            uploadSuccessTimerRef.current = setTimeout(() => {
                if (mountedRef.current) onReceiptUploadedRef.current?.();
            }, UPLOAD_SUCCESS_DELAY);
        } catch (err) {
            if (!mountedRef.current) return;
            if (err instanceof Error && err.name === 'AbortError') return;
            hapticNotify('error');
            setUploadStatus('error');
            setUploadMessage(err instanceof Error ? err.message : 'Yuklashda xato');
        } finally {
            if (mountedRef.current) setUploading(false);
        }
    }, [data, t]);

    const openFilePicker = useCallback(() => {
        if (uploading || expired || uploadStatus === 'success') return;
        hapticImpact('light');
        fileInputRef.current?.click();
    }, [uploading, expired, uploadStatus]);

    const handleClose = useCallback(() => {
        hapticImpact('light');
        onClose();
    }, [onClose]);

    const handleBackdropClick = useCallback(() => {
        onClose();
    }, [onClose]);

    const stopPropagation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    const copyAmount = useCallback(() => {
        if (data) copy(String(data.total_amount), 'amount');
    }, [data, copy]);

    const copyCard = useCallback(() => {
        if (data) copy(data.card_number.replace(/\s/g, ''), 'card');
    }, [data, copy]);

    // ESC — modal yopish
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
                onClick={handleBackdropClick}
                style={{ fontFamily: FONT }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="p2p-title"
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={SPRING}
                    onClick={stopPropagation}
                    className="w-full max-w-md bg-[#ECEEF5] dark:bg-[#0F1419] rounded-t-[2rem] sm:rounded-[2rem] p-5 pb-8 max-h-[92vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2
                            id="p2p-title"
                            className="text-lg font-extrabold text-stone-900 dark:text-slate-100"
                        >
                            {t('p2p_title')}
                        </h2>
                        <button
                            onClick={handleClose}
                            className="w-8 h-8 rounded-full bg-white dark:bg-[#1E252E] flex items-center justify-center text-stone-600 dark:text-slate-300 active:scale-95 transition"
                            aria-label={t('p2p_close') || 'Yopish'}
                        >
                            <PIcon name="close" size={16} strokeWidth={2.2} />
                        </button>
                    </div>

                    {/* Loading skeleton */}
                    {loading && (
                        <div className="space-y-3 animate-pulse">
                            <div className="h-12 rounded-2xl bg-white/50 dark:bg-[#1E252E]" />
                            <div className="h-20 rounded-2xl bg-white/50 dark:bg-[#1E252E]" />
                            <div className="h-24 rounded-2xl bg-white/50 dark:bg-[#1E252E]" />
                            <div className="h-24 rounded-2xl bg-white/50 dark:bg-[#1E252E]" />
                            <div className="h-14 rounded-2xl bg-white/50 dark:bg-[#1E252E]" />
                        </div>
                    )}

                    {/* Error */}
                    {error && !loading && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-2xl p-4 text-sm font-semibold flex items-center justify-center gap-2">
                            <PIcon
                                name="errorCircle"
                                size={18}
                                color="#DC2626"
                                fill="rgba(220, 38, 38, 0.15)"
                                strokeWidth={2}
                            />
                            <span>{error}</span>
                        </div>
                    )}

                    {data && !loading && (
                        <>
                            {/* Timer */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 mb-4 flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                    {t('p2p_timer_label')}
                                </span>
                                <span className="text-base font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                                    {mm}:{ss}
                                </span>
                            </div>

                            {/* Amount */}
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-3"
                                style={{ border: '1.5px solid #E4E7F0' }}
                            >
                                <div className="text-[10px] font-extrabold text-stone-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                    {t('p2p_amount_label')}
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 tabular-nums">
                                        {amountStr}{' '}
                                        <span className="text-sm font-bold text-stone-500">UZS</span>
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={copyAmount}
                                        className="px-3 py-2 rounded-xl text-xs font-extrabold text-white"
                                        style={{ background: 'linear-gradient(135deg,#5B6AD0,#7A8AE8)' }}
                                        aria-label={t('p2p_copy')}
                                    >
                                        {copied === 'amount' ? t('p2p_copied') : t('p2p_copy')}
                                    </motion.button>
                                </div>
                                <div className="text-[11px] text-stone-500 dark:text-slate-400 mt-2 font-semibold">
                                    {fmt(t('p2p_amount_hint'), {
                                        amount: amountStr,
                                        suffix: data.suffix,
                                    })}
                                </div>
                            </div>

                            {/* Card */}
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-3"
                                style={{ border: '1.5px solid #E4E7F0' }}
                            >
                                <div className="text-[10px] font-extrabold text-stone-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                    {fmt(t('p2p_card_label'), { bank: data.bank_name })}
                                </div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-lg font-extrabold text-stone-900 dark:text-slate-100 tracking-wider tabular-nums">
                                        {cardFormatted}
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={copyCard}
                                        className="px-3 py-2 rounded-xl text-xs font-extrabold text-white"
                                        style={{ background: 'linear-gradient(135deg,#5B6AD0,#7A8AE8)' }}
                                        aria-label={t('p2p_copy')}
                                    >
                                        {copied === 'card' ? t('p2p_copied') : t('p2p_copy')}
                                    </motion.button>
                                </div>
                                <div className="text-sm font-bold text-stone-700 dark:text-slate-300">
                                    {data.card_holder}
                                </div>
                            </div>

                            {/* Instructions */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 mb-3">
                                <div className="text-xs font-extrabold text-blue-700 dark:text-blue-300 mb-2">
                                    {t('p2p_instructions_title')}
                                </div>
                                <ol className="text-[12px] text-blue-800 dark:text-blue-200 space-y-1.5 list-decimal pl-4 font-semibold">
                                    <li>{fmt(t('p2p_step1'), { amount: amountStr })}</li>
                                    <li>{t('p2p_step2')}</li>
                                    <li>{t('p2p_step3')}</li>
                                </ol>
                            </div>

                            {/* Upload Receipt */}
                            <div
                                className="bg-white dark:bg-[#1E252E] rounded-2xl p-4 mb-3"
                                style={{ border: '1.5px solid #E4E7F0' }}
                            >
                                <div className="text-xs font-extrabold text-stone-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                                    <PIcon
                                        name="camera"
                                        size={16}
                                        color="#5B6AD0"
                                        fill="rgba(91, 106, 208, 0.15)"
                                        strokeWidth={2}
                                    />
                                    <span>{t('p2p_upload_title') || "To'lov chekini yuklang"}</span>
                                </div>
                                <div className="text-[11px] text-stone-500 dark:text-slate-400 mb-3 font-semibold">
                                    {t('p2p_upload_hint') ||
                                        "To'lov qilganingizdan keyin chek skrinshotini yuklang. Admin 5-30 daqiqada tasdiqlaydi."}
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    disabled={uploading || expired || uploadStatus === 'success'}
                                />

                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={openFilePicker}
                                    disabled={uploading || expired || uploadStatus === 'success'}
                                    className="w-full py-3 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{
                                        background:
                                            uploadStatus === 'success'
                                                ? 'linear-gradient(135deg,#10B981,#34D399)'
                                                : 'linear-gradient(135deg,#5B6AD0,#7A8AE8)',
                                    }}
                                >
                                    {uploading ? (
                                        <>
                                            <motion.span
                                                animate={{ rotate: 360 }}
                                                transition={{
                                                    duration: 0.9,
                                                    repeat: Infinity,
                                                    ease: 'linear',
                                                }}
                                                className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                                            />
                                            <span>{t('p2p_upload_loading') || 'Yuklanmoqda...'}</span>
                                        </>
                                    ) : uploadStatus === 'success' ? (
                                        <>
                                            <PIcon
                                                name="check"
                                                size={16}
                                                color="#ffffff"
                                                strokeWidth={2.5}
                                            />
                                            <span>{t('p2p_upload_done') || 'Yuklandi'}</span>
                                        </>
                                    ) : expired ? (
                                        <span>{t('p2p_expired') || 'Vaqt tugadi'}</span>
                                    ) : (
                                        <span>{t('p2p_upload_button') || 'Chek rasmini tanlash'}</span>
                                    )}
                                </motion.button>

                                {uploadMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`mt-3 text-xs font-semibold text-center p-2 rounded-xl ${uploadStatus === 'success'
                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                            }`}
                                    >
                                        {uploadMessage}
                                    </motion.div>
                                )}
                            </div>

                            <div className="text-[10px] text-center text-stone-400 dark:text-slate-500 font-semibold">
                                {fmt(t('p2p_footer'), {
                                    id: data.payment_id,
                                    suffix: data.suffix,
                                })}
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

const P2PPaymentModal = memo(P2PPaymentModalBase);
export default P2PPaymentModal;