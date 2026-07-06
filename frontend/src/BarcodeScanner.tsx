// src/BarcodeScanner.tsx
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useTranslation } from './i18n';
import { hapticNotify, hapticImpact } from './telegram';

// ============================================================================
// CONSTANTS
// ============================================================================

const BARCODE_REGEX = /^\d{6,14}$/;
const SCAN_SWEEP_MS = 2400;
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
    },
    audio: false,
};

// ============================================================================
// TYPES
// ============================================================================

type CameraErrorKind = 'permission' | 'not_found' | 'busy' | 'unsupported' | 'generic';

interface Props {
    open: boolean;
    onClose: () => void;
    onDetected: (barcode: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function classifyCameraError(err: unknown): CameraErrorKind {
    if (typeof err === 'object' && err !== null && 'name' in err) {
        const name = (err as { name: string }).name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'permission';
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'not_found';
        if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy';
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'unsupported';
    }
    return 'generic';
}

// ============================================================================
// ICONS (memoized)
// ============================================================================

const BIcon = memo(function BIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'close' | 'keyboard' | 'camera' | 'shield';
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
        case 'keyboard':
            return (
                <svg {...common}>
                    <rect x="2.5" y="6" width="19" height="13" rx="2" fill={fill} />
                    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01" />
                    <path d="M6 13.5h.01M9.5 13.5h.01M13 13.5h.01M16.5 13.5h.01" />
                    <path d="M7.5 16.5h9" />
                </svg>
            );
        case 'camera':
            return (
                <svg {...common}>
                    <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                    <circle cx="12" cy="13" r="3.5" />
                </svg>
            );
        case 'shield':
            return (
                <svg {...common}>
                    <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" />
                </svg>
            );
    }
});

// ============================================================================
// CORNER POSITIONS (static)
// ============================================================================

const CORNER_CLASSES: Record<string, string> = {
    tl: 'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
    tr: 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
    bl: 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
    br: 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
};
const CORNER_KEYS = Object.keys(CORNER_CLASSES);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function BarcodeScannerBase({ open, onClose, onDetected }: Props) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    // Stable ref — parent onDetected identity o'zgarsa scanner qayta ochilmasin
    const onDetectedRef = useRef(onDetected);
    onDetectedRef.current = onDetected;

    const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
    const [scanning, setScanning] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [manualCode, setManualCode] = useState('');

    const manualValid = useMemo(() => BARCODE_REGEX.test(manualCode.trim()), [manualCode]);

    // ==== Cleanup helper ====
    const stopCamera = useCallback(() => {
        controlsRef.current?.stop();
        controlsRef.current = null;
        readerRef.current = null;
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        const video = videoRef.current;
        if (video) video.srcObject = null;
        setScanning(false);
    }, []);

    // ==== Handlers (useCallback) ====
    const handleClose = useCallback(() => {
        hapticImpact('light');
        onClose();
    }, [onClose]);

    const openManual = useCallback(() => {
        hapticImpact('light');
        setManualOpen(true);
    }, []);

    const closeManual = useCallback(() => {
        hapticImpact('light');
        setManualOpen(false);
        setManualCode('');
    }, []);

    const submitManual = useCallback(() => {
        const code = manualCode.trim();
        if (!BARCODE_REGEX.test(code)) {
            hapticNotify('error');
            return;
        }
        hapticNotify('success');
        onDetectedRef.current(code);
        setManualCode('');
        setManualOpen(false);
    }, [manualCode]);

    const handleManualInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setManualCode(e.target.value.replace(/\D/g, '').slice(0, 14));
    }, []);

    const handleManualKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const code = manualCode.trim();
            if (BARCODE_REGEX.test(code)) {
                hapticNotify('success');
                onDetectedRef.current(code);
                setManualCode('');
                setManualOpen(false);
            }
        }
    }, [manualCode]);

    // ==== Error message ====
    const errorMessage = useCallback((kind: CameraErrorKind): string => {
        switch (kind) {
            case 'permission': return t('bc_error_permission') || t('bc_camera_error');
            case 'not_found': return t('bc_error_not_found') || t('bc_camera_error');
            case 'busy': return t('bc_error_busy') || t('bc_camera_error');
            case 'unsupported': return t('bc_error_unsupported') || t('bc_camera_error');
            default: return t('bc_camera_error');
        }
    }, [t]);

    // ==== ESC — modal yopish (a11y) ====
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                if (manualOpen) {
                    setManualOpen(false);
                    setManualCode('');
                } else {
                    onClose();
                }
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, manualOpen, onClose]);

    // ==== Kamera + ZXing ishga tushirish ====
    useEffect(() => {
        if (!open || manualOpen) return;
        let cancelled = false;

        async function start() {
            try {
                setErrorKind(null);
                setScanning(true);

                if (!navigator.mediaDevices?.getUserMedia) {
                    setErrorKind('unsupported');
                    setScanning(false);
                    return;
                }

                // 1. Kamera stream'ni qo'lda olamiz (Telegram WebView uchun ishonchli)
                const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
                if (cancelled) {
                    stream.getTracks().forEach((tr) => tr.stop());
                    return;
                }
                streamRef.current = stream;

                const video = videoRef.current;
                if (!video) {
                    stream.getTracks().forEach((tr) => tr.stop());
                    return;
                }
                video.srcObject = stream;
                video.setAttribute('playsinline', 'true');
                video.muted = true;
                try { await video.play(); } catch { /* autoplay policy — ignore */ }

                if (cancelled) return;

                // 2. ZXing'ni shu stream ustida ishga tushiramiz
                const reader = new BrowserMultiFormatReader();
                readerRef.current = reader;
                const controls = await reader.decodeFromVideoElement(video, (result, _err, ctrl) => {
                    if (cancelled) return;
                    if (result) {
                        const code = result.getText();
                        try { navigator.vibrate?.(80); } catch { /* ignore */ }
                        hapticNotify('success');
                        ctrl.stop();
                        onDetectedRef.current(code);
                    }
                });
                if (cancelled) {
                    controls.stop();
                    return;
                }
                controlsRef.current = controls;
            } catch (e) {
                if (cancelled) return;
                console.error('[BarcodeScanner]', e);
                setErrorKind(classifyCameraError(e));
                setScanning(false);
            }
        }

        void start();

        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [open, manualOpen, stopCamera]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100] bg-black"
                >
                    <video
                        ref={videoRef}
                        className="absolute inset-0 w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                    />

                    {/* Dark overlay with cutout */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-black/55" />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] aspect-[4/3] rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
                    </div>

                    {/* Scan frame corners */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] aspect-[4/3] pointer-events-none">
                        {CORNER_KEYS.map((p) => (
                            <span
                                key={p}
                                className={`absolute w-8 h-8 border-white ${CORNER_CLASSES[p]}`}
                            />
                        ))}
                        {scanning && !errorKind && !manualOpen && (
                            <motion.div
                                initial={{ top: '8%' }}
                                animate={{ top: ['8%', '88%', '8%'] }}
                                transition={{ duration: SCAN_SWEEP_MS / 1000, repeat: Infinity, ease: 'easeInOut' }}
                                className="absolute left-4 right-4 h-[2px] bg-[#5B6AD0] shadow-[0_0_12px_#5B6AD0]"
                            />
                        )}
                    </div>

                    {/* Top bar */}
                    <div className="absolute top-0 left-0 right-0 pt-[max(env(safe-area-inset-top),1rem)] px-4 flex items-center justify-between">
                        <button
                            onClick={handleClose}
                            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition"
                            aria-label={t('bc_close')}
                        >
                            <BIcon name="close" size={20} strokeWidth={2.2} />
                        </button>
                        <div className="px-4 py-2 rounded-full bg-black/45 backdrop-blur-md text-white text-sm font-medium">
                            {t('bc_title')}
                        </div>
                        <div className="w-10" />
                    </div>

                    {/* Bottom area */}
                    <div className="absolute bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] px-6 text-center space-y-3">
                        {errorKind && !manualOpen && (
                            <div className="bg-black/55 backdrop-blur-md rounded-2xl p-4 text-white flex items-start gap-3 text-left">
                                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 text-white/80">
                                    <BIcon
                                        name={errorKind === 'permission' ? 'shield' : 'camera'}
                                        size={18}
                                        strokeWidth={2}
                                    />
                                </div>
                                <div className="text-sm leading-snug">{errorMessage(errorKind)}</div>
                            </div>
                        )}
                        {!errorKind && !manualOpen && (
                            <div className="text-white/85 text-sm">{t('bc_hint')}</div>
                        )}

                        {/* Manual barcode entry */}
                        {manualOpen ? (
                            <div className="bg-black/65 backdrop-blur-md rounded-2xl p-4 space-y-3">
                                <input
                                    autoFocus
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={manualCode}
                                    onChange={handleManualInput}
                                    onKeyDown={handleManualKeyDown}
                                    placeholder="8690000000000"
                                    className="w-full px-4 py-3 rounded-xl bg-white/10 text-white text-center text-lg tracking-widest placeholder-white/40 focus:outline-none focus:bg-white/15"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={closeManual}
                                        className="flex-1 py-3 rounded-xl bg-white/15 text-white text-sm font-medium active:scale-95 transition"
                                    >
                                        {t('bc_close')}
                                    </button>
                                    <button
                                        onClick={submitManual}
                                        disabled={!manualValid}
                                        className="flex-1 py-3 rounded-xl bg-[#5B6AD0] text-white text-sm font-semibold active:scale-95 transition disabled:opacity-40"
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={openManual}
                                className="px-5 py-2.5 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-medium active:scale-95 transition inline-flex items-center gap-2"
                            >
                                <BIcon name="keyboard" size={16} strokeWidth={2} />
                                <span>{t('bc_manual') || "Qo'lda kiritish"}</span>
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const BarcodeScanner = memo(BarcodeScannerBase);
export default BarcodeScanner;