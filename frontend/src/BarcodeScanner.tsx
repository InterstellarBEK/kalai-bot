import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useTranslation } from './i18n';

interface Props {
    open: boolean;
    onClose: () => void;
    onDetected: (barcode: string) => void;
}

// ── Iconly-style SVG icons ────────────────────────────────
function BIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'close' | 'keyboard';
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
    }
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [manualCode, setManualCode] = useState('');

    useEffect(() => {
        if (!open || manualOpen) return;
        let cancelled = false;

        async function start() {
            try {
                setError(null);
                setScanning(true);

                // 1. Kamera stream'ni qo'lda olamiz (Telegram WebView uchun ishonchli)
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;

                const video = videoRef.current!;
                video.srcObject = stream;
                video.setAttribute('playsinline', 'true');
                video.muted = true;
                await video.play().catch(() => { });

                // 2. ZXing'ni shu stream ustida ishga tushiramiz
                const reader = new BrowserMultiFormatReader();
                readerRef.current = reader;
                const controls = await reader.decodeFromVideoElement(video, (result, _err, ctrl) => {
                    if (cancelled) return;
                    if (result) {
                        const code = result.getText();
                        try { navigator.vibrate?.(80); } catch { }
                        ctrl.stop();
                        onDetected(code);
                    }
                });
                controlsRef.current = controls;
            } catch (e: any) {
                console.error('[BarcodeScanner]', e);
                setError(e?.message || 'camera_error');
                setScanning(false);
            }
        }

        start();

        return () => {
            cancelled = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
            readerRef.current = null;
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            setScanning(false);
        };
    }, [open, manualOpen, onDetected]);

    function submitManual() {
        const code = manualCode.trim();
        if (!/^\d{6,14}$/.test(code)) return;
        onDetected(code);
        setManualCode('');
        setManualOpen(false);
    }

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
                        {['tl', 'tr', 'bl', 'br'].map(p => (
                            <span
                                key={p}
                                className={`absolute w-8 h-8 border-white ${p === 'tl' ? 'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl' :
                                    p === 'tr' ? 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl' :
                                        p === 'bl' ? 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl' :
                                            'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl'
                                    }`}
                            />
                        ))}
                        {scanning && !error && !manualOpen && (
                            <motion.div
                                initial={{ top: '8%' }}
                                animate={{ top: ['8%', '88%', '8%'] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                                className="absolute left-4 right-4 h-[2px] bg-[#5B6AD0] shadow-[0_0_12px_#5B6AD0]"
                            />
                        )}
                    </div>

                    {/* Top bar */}
                    <div className="absolute top-0 left-0 right-0 pt-[max(env(safe-area-inset-top),1rem)] px-4 flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition"
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
                        {error && (
                            <div className="bg-black/55 backdrop-blur-md rounded-2xl p-4 text-white">
                                <div className="text-sm mb-3">{t('bc_camera_error')}</div>
                            </div>
                        )}
                        {!error && !manualOpen && (
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
                                    onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="8690000000000"
                                    className="w-full px-4 py-3 rounded-xl bg-white/10 text-white text-center text-lg tracking-widest placeholder-white/40 focus:outline-none focus:bg-white/15"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setManualOpen(false); setManualCode(''); }}
                                        className="flex-1 py-3 rounded-xl bg-white/15 text-white text-sm font-medium active:scale-95 transition"
                                    >
                                        {t('bc_close')}
                                    </button>
                                    <button
                                        onClick={submitManual}
                                        disabled={!/^\d{6,14}$/.test(manualCode.trim())}
                                        className="flex-1 py-3 rounded-xl bg-[#5B6AD0] text-white text-sm font-semibold active:scale-95 transition disabled:opacity-40"
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setManualOpen(true)}
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