import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from './i18n';

interface Props {
    open: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
}

export default function CameraCapture({ open, onClose, onCapture }: Props) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [flash, setFlash] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        async function start() {
            try {
                setError(null);
                setReady(false);
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                const video = videoRef.current!;
                video.srcObject = stream;
                video.setAttribute('playsinline', 'true');
                video.muted = true;
                await video.play().catch(() => { });
                setReady(true);
            } catch (e: any) {
                console.error('[CameraCapture]', e);
                setError(e?.message || 'camera_error');
            }
        }

        start();
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            setReady(false);
        };
    }, [open]);

    async function snap() {
        const video = videoRef.current;
        if (!video) return;
        setFlash(true);
        try { navigator.vibrate?.(40); } catch { }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.92));
        setTimeout(() => setFlash(false), 200);
        if (!blob) return;
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
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

                    <AnimatePresence>
                        {flash && (
                            <motion.div
                                initial={{ opacity: 0.85 }}
                                animate={{ opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="absolute inset-0 bg-white pointer-events-none"
                            />
                        )}
                    </AnimatePresence>

                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }}
                    />

                    <div className="absolute top-0 left-0 right-0 pt-[max(env(safe-area-inset-top),1rem)] px-4 flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white text-2xl active:scale-95 transition"
                        >
                            ✕
                        </button>
                        <div className="px-4 py-2 rounded-full bg-black/45 backdrop-blur-md text-white text-sm font-medium">
                            {t('cam_title')}
                        </div>
                        <div className="w-10" />
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),2rem)] px-6 flex flex-col items-center gap-5">
                        {error ? (
                            <div className="bg-black/55 backdrop-blur-md rounded-2xl p-4 text-white text-center w-full">
                                <div className="text-sm mb-3">{t('bc_camera_error')}</div>
                                <button onClick={onClose} className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold">
                                    {t('bc_close')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="text-white/85 text-sm text-center">
                                    {t('cam_hint')}
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    onClick={snap}
                                    disabled={!ready}
                                    className="relative w-[78px] h-[78px] rounded-full flex items-center justify-center disabled:opacity-50"
                                >
                                    <div className="absolute inset-0 rounded-full border-[3px] border-white/90" />
                                    <div className="w-[62px] h-[62px] rounded-full bg-white shadow-[0_4px_16px_rgba(255,255,255,0.4)]" />
                                </motion.button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}