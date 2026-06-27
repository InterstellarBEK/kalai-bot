import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface WheelPickerProps {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
    suffix?: string;
    step?: number;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // markaz + 2 yuqori + 2 pastki
const CENTER_OFFSET = Math.floor(VISIBLE_ITEMS / 2);

export default function WheelPicker({
    min,
    max,
    value,
    onChange,
    suffix = '',
    step = 1,
}: WheelPickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<number | null>(null);
    const isScrollingRef = useRef(false);
    const isMountedRef = useRef(false);
    const [activeValue, setActiveValue] = useState(value);

    // ✅ FIX 1: items'ni memoize qilish — har render'da qayta yaratilmasin
    const items = useMemo(() => {
        const arr: number[] = [];
        for (let i = min; i <= max; i += step) arr.push(i);
        return arr;
    }, [min, max, step]);

    // ✅ FIX 2: value tashqaridan o'zgarsa scroll'ni yangila (faqat value o'zgarsa)
    useEffect(() => {
        if (!containerRef.current) return;
        if (isScrollingRef.current) return;
        const idx = items.indexOf(value);
        if (idx === -1) return;
        // Mount paytida instant, keyin smooth
        containerRef.current.scrollTo({
            top: idx * ITEM_HEIGHT,
            behavior: isMountedRef.current ? 'smooth' : 'auto',
        });
        setActiveValue(value);
        isMountedRef.current = true;
    }, [value, items]);

    // Telegram haptic
    const triggerHaptic = useCallback(() => {
        try {
            // @ts-ignore
            const tg = window.Telegram?.WebApp;
            tg?.HapticFeedback?.selectionChanged?.();
        } catch { }
    }, []);

    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;
        isScrollingRef.current = true;

        const scrollTop = containerRef.current.scrollTop;
        const idx = Math.round(scrollTop / ITEM_HEIGHT);
        const clampedIdx = Math.max(0, Math.min(items.length - 1, idx));
        const newValue = items[clampedIdx];

        setActiveValue((prev) => {
            if (prev !== newValue) {
                triggerHaptic();
                return newValue;
            }
            return prev;
        });

        if (scrollTimeoutRef.current) {
            window.clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = window.setTimeout(() => {
            if (!containerRef.current) return;
            const finalIdx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT);
            const finalClamped = Math.max(0, Math.min(items.length - 1, finalIdx));
            const finalValue = items[finalClamped];
            const targetTop = finalClamped * ITEM_HEIGHT;
            if (Math.abs(containerRef.current.scrollTop - targetTop) > 1) {
                containerRef.current.scrollTo({
                    top: targetTop,
                    behavior: 'smooth',
                });
            }
            isScrollingRef.current = false;
            if (finalValue !== value) onChange(finalValue);
        }, 150);
    }, [items, onChange, triggerHaptic, value]);

    const handleItemClick = (idx: number) => {
        if (!containerRef.current) return;
        containerRef.current.scrollTo({
            top: idx * ITEM_HEIGHT,
            behavior: 'smooth',
        });
    };

    // ✅ FIX 3: cleanup timeout
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                window.clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    const containerHeight = ITEM_HEIGHT * VISIBLE_ITEMS;
    const padding = ITEM_HEIGHT * CENTER_OFFSET;

    return (
        <div
            className="relative w-full select-none"
            style={{ height: containerHeight }}
        >
            {/* Markaziy chiziqlar */}
            <div
                className="pointer-events-none absolute inset-x-0 z-10 border-y border-[#5B6AD0]/30"
                style={{
                    top: padding,
                    height: ITEM_HEIGHT,
                }}
            />

            {/* Yuqori va pastki fade */}
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20"
                style={{
                    height: padding,
                    background:
                        'linear-gradient(to bottom, var(--color-input-bg, #F3F4F8) 0%, transparent 100%)',
                }}
            />
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
                style={{
                    height: padding,
                    background:
                        'linear-gradient(to top, var(--color-input-bg, #F3F4F8) 0%, transparent 100%)',
                }}
            />

            {/* ✅ FIX 4: Scroll container — Telegram WebView uchun touch optimizatsiyalar */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-scroll scrollbar-hide"
                style={{
                    scrollSnapType: 'y mandatory',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain', // Parent scroll'ga tarqalmasin
                    touchAction: 'pan-y',          // Telegram gesture'iga ustun bersin
                }}
            >
                <div style={{ paddingTop: padding, paddingBottom: padding }}>
                    {items.map((item, idx) => {
                        const isActive = item === activeValue;
                        const distance = Math.abs(item - activeValue);
                        const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.25);
                        const scale = isActive ? 1 : Math.max(0.85, 1 - distance * 0.05);

                        return (
                            <div
                                key={item}
                                onClick={() => handleItemClick(idx)}
                                className="flex items-center justify-center cursor-pointer transition-all"
                                style={{
                                    height: ITEM_HEIGHT,
                                    scrollSnapAlign: 'center',
                                    // ✅ FIX 5: scrollSnapStop 'always' → 'normal' (mobile uchun yumshoqroq)
                                    scrollSnapStop: 'normal',
                                    opacity,
                                    transform: `scale(${scale})`,
                                }}
                            >
                                <span
                                    className={`text-2xl font-semibold tabular-nums ${isActive
                                        ? 'text-[#5B6AD0] dark:text-[#7A8AE8]'
                                        : 'text-stone-700 dark:text-stone-300'
                                        }`}
                                >
                                    {item}
                                    {suffix && (
                                        <span className="ml-1 text-base font-normal text-stone-500 dark:text-stone-400">
                                            {suffix}
                                        </span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
        </div>
    );
}