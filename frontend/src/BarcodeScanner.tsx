import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useTranslation } from './i18n';

interface Props {
    open: boolean;
    onClose: () => void;
    onDetected: (barcode: string) => void;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        async function start() {
            try {
                setError(null);
                setScanning(true);
                const reader = new BrowserMultiFormatReader();
                readerRef.current = reader;

                // Telefon orqa kamerasini afzal ko'rish
                let deviceId: string | undefined;
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const cams = devices.filter(d => d.kind === 'videoinput');
                    const rear = cams.find(d => /back|rear|environment/i.test(d.label));
                    deviceId = rear?.deviceId || cams[cams.length - 1]?.deviceId;
                } catch { }

                const controls = await reader.decodeFromVideoDevice(
                    deviceId,
                    videoRef.current!,
                    (result, _err, ctrl) => {
                        if (cancelled) return;
                        if (result) {
                            const code = result.getText();
                            try { navigator.vibrate?.(80); } catch { }
                            ctrl.stop();
                            onDetected(code);
                        }
                    }
                );
                controlsRef.current = controls;
            } catch (e: any) {
                console.error(e);
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
            setScanning(false);
        };
    }, [open, onDetected]);

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
                        {scanning && !error && (
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
                            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white text-2xl active:scale-95 transition"
                        >
                            ✕
                        </button>
                        <div className="px-4 py-2 rounded-full bg-black/45 backdrop-blur-md text-white text-sm font-medium">
                            {t('bc_title')}
                        </div>
                        <div className="w-10" />
                    </div>

                    {/* Bottom hint / error */}
                    <div className="absolute bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] px-6 text-center">
                        {error ? (
                            <div className="bg-black/55 backdrop-blur-md rounded-2xl p-4 text-white">
                                <div className="text-sm mb-3">{t('bc_camera_error')}</div>
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold"
                                >
                                    {t('bc_close')}
                                </button>
                            </div>
                        ) : (
                            <div className="text-white/85 text-sm">{t('bc_hint')}</div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}