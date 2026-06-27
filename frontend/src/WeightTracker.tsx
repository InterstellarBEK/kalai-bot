import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    addWeight, getWeightHistory, removeLastWeight,
    getTargetWeight, setTargetWeight,
    calcWeightTrend, calcTargetProgress,
    seedFromProfile, getCurrentBMI,
    type WeightEntry, type WeightTrend, type BMIInfo,
} from "./weight";
import { useTranslation } from "./i18n";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 26 };

// ── Iconly-style SVG icons ────────────────────────────────
function WIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'target' | 'close' | 'undo' | 'plus' | 'arrowDown' | 'arrowUp' | 'arrowRight';
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
        case 'target':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="9" fill={fill} />
                    <circle cx="12" cy="12" r="5.5" />
                    <circle cx="12" cy="12" r="2" fill={color} stroke="none" />
                </svg>
            );
        case 'close':
            return (
                <svg {...common}>
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            );
        case 'undo':
            return (
                <svg {...common}>
                    <path d="M4 10h11a4.5 4.5 0 010 9H10" />
                    <path d="M8 6L4 10l4 4" />
                </svg>
            );
        case 'plus':
            return (
                <svg {...common}>
                    <path d="M12 5v14M5 12h14" />
                </svg>
            );
        case 'arrowDown':
            return (
                <svg {...common}>
                    <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
            );
        case 'arrowUp':
            return (
                <svg {...common}>
                    <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
            );
        case 'arrowRight':
            return (
                <svg {...common}>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
            );
    }
}

export function WeightTracker() {
    const { t } = useTranslation();
    const [history, setHistory] = useState<WeightEntry[]>([]);
    const [target, setTarget] = useState<number | null>(null);
    const [trend, setTrend] = useState<WeightTrend | null>(null);
    const [bmi, setBmi] = useState<BMIInfo | null>(null);
    const [input, setInput] = useState("");
    const [targetInput, setTargetInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<"idle" | "add" | "target">("idle");

    useEffect(() => {
        (async () => {
            await seedFromProfile();
            await refresh();
        })();
    }, []);

    async function refresh() {
        const [data, tgt] = await Promise.all([
            getWeightHistory(30),
            getTargetWeight(),
        ]);
        setHistory(data);
        setTarget(tgt);
        setTrend(calcWeightTrend(data, tgt));

        const latest = data.length > 0 ? data[data.length - 1].weight_kg : null;
        setBmi(latest !== null ? await getCurrentBMI(latest) : null);
    }

    async function handleSave() {
        const val = parseFloat(input);
        if (!val || val < 20 || val > 300) {
            alert(t('weight_invalid'));
            return;
        }
        setLoading(true);
        const ok = await addWeight(val);
        if (!ok) { alert(t('save_error')); setLoading(false); return; }
        setInput(""); setMode("idle");
        await refresh();
        setLoading(false);
    }

    async function handleSaveTarget() {
        const val = parseFloat(targetInput);
        if (!val || val < 20 || val > 300) {
            alert(t('weight_target_invalid'));
            return;
        }
        setLoading(true);
        const ok = await setTargetWeight(val);
        if (!ok) { alert(t('save_error')); setLoading(false); return; }
        setTargetInput(""); setMode("idle");
        await refresh();
        setLoading(false);
    }

    async function handleUndo() {
        setLoading(true);
        await removeLastWeight();
        await refresh();
        setLoading(false);
    }

    const HEALTH_STYLES = {
        good: { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", label: t('weight_health_good') },
        warning: { bg: "bg-yellow-50 dark:bg-yellow-900/20", text: "text-yellow-700 dark:text-yellow-300", label: t('weight_health_warning') },
        danger: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", label: t('weight_health_danger') },
    };

    const current = history.length > 0 ? history[history.length - 1].weight_kg : null;
    const first = history.length > 0 ? history[0].weight_kg : null;
    const delta = current !== null && first !== null ? current - first : 0;
    const progress = calcTargetProgress(history, target);

    const chartW = 300, chartH = 120, pad = 12;
    const weights = history.map(h => h.weight_kg);
    const minW = weights.length ? Math.min(...weights) - 1 : 0;
    const maxW = weights.length ? Math.max(...weights) + 1 : 1;
    const range = maxW - minW || 1;

    const points = history.map((h, i) => ({
        x: pad + (i / Math.max(history.length - 1, 1)) * (chartW - pad * 2),
        y: chartH - pad - ((h.weight_kg - minW) / range) * (chartH - pad * 2),
    }));

    const pathD = points.length > 1
        ? points.reduce((acc, p, i) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = points[i - 1];
            const cx = (prev.x + p.x) / 2;
            return `${acc} Q ${cx} ${prev.y}, ${cx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
        }, "")
        : "";

    const areaD = points.length > 1
        ? `${pathD} L ${points[points.length - 1].x} ${chartH - pad} L ${points[0].x} ${chartH - pad} Z`
        : "";

    const health = trend ? HEALTH_STYLES[trend.healthStatus] : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
            style={{ boxShadow: "0 8px 24px -10px rgba(91,106,208,0.12)" }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{t('weight_title')}</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                            {current !== null ? current.toFixed(1) : "—"}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-slate-400">kg</span>
                        {target !== null && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">/ {target.toFixed(1)} kg</span>
                        )}
                    </div>
                </div>
                {history.length > 1 && (
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${delta < 0 ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" : delta > 0 ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)} kg
                    </div>
                )}
            </div>

            {/* BMI chip */}
            {bmi && (
                <div className="mb-4 flex items-center gap-2">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${bmi.color} ${bmi.textColor}`}>
                        BMI {bmi.value.toFixed(1)} · {bmi.label}
                    </div>
                </div>
            )}

            {/* Target progress */}
            {target !== null && history.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400 mb-1.5">
                        <span>{t('weight_target_label')}</span>
                        <span className="font-semibold text-gray-700 dark:text-slate-300">{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-[#F5F6FB] dark:bg-[#252D38]">
                        <motion.div
                            className="h-full rounded-full"
                            style={{ background: "#5B6AD0" }}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
                        />
                    </div>
                </div>
            )}

            {/* Chart */}
            {history.length > 0 ? (
                <div className="mb-4 rounded-2xl p-3 bg-[#F5F6FB] dark:bg-[#252D38]">
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto">
                        <defs>
                            <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#5B6AD0" stopOpacity="0.28" />
                                <stop offset="100%" stopColor="#5B6AD0" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {points.length > 1 && (
                            <>
                                <motion.path d={areaD} fill="url(#weightGrad)"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    transition={{ duration: 0.6, delay: 0.3 }} />
                                <motion.path d={pathD} fill="none" stroke="#5B6AD0"
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                                    transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }} />
                            </>
                        )}
                        {points.map((p, i) => (
                            <motion.circle key={i} cx={p.x} cy={p.y} r="3.5"
                                fill="#fff" stroke="#5B6AD0" strokeWidth="2"
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ delay: 0.5 + i * 0.04, ...SPRING }} />
                        ))}
                    </svg>
                </div>
            ) : (
                <div className="mb-4 rounded-2xl p-6 text-center text-sm text-gray-400 dark:text-slate-500 bg-[#F5F6FB] dark:bg-[#252D38]">
                    {t('weight_empty')}
                </div>
            )}

            {/* Trend badges */}
            {trend && health && (
                <div className="mb-4 flex flex-wrap gap-2">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${health.bg} ${health.text} flex items-center gap-1.5`}>
                        <WIcon
                            name={trend.direction === 'down' ? 'arrowDown' : trend.direction === 'up' ? 'arrowUp' : 'arrowRight'}
                            size={12}
                            strokeWidth={2.5}
                        />
                        <span>{Math.abs(trend.weeklyRateKg).toFixed(2)} {t('weight_per_week')}</span>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${health.bg} ${health.text}`}>
                        {health.label}
                    </div>
                    {trend.weeksToTarget !== null && (
                        <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">
                            ~{Math.ceil(trend.weeksToTarget)} {t('weight_weeks_left')}
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <AnimatePresence mode="wait">
                {mode === "idle" && (
                    <motion.div key="idle"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex gap-2">
                        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setMode("add")}
                            className="flex-1 py-3 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-1.5"
                            style={{ background: "#5B6AD0" }}>
                            <WIcon name="plus" size={16} strokeWidth={2.4} />
                            <span>{t('weight_add')}</span>
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.96 }}
                            onClick={() => { setMode("target"); setTargetInput(target?.toString() ?? ""); }}
                            className="px-4 py-3 rounded-2xl text-gray-600 dark:text-slate-300 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center">
                            <WIcon name="target" size={18} color="#5B6AD0" fill="rgba(91, 106, 208, 0.15)" strokeWidth={2} />
                        </motion.button>
                        {history.length > 0 && (
                            <motion.button whileTap={{ scale: 0.96 }} onClick={handleUndo} disabled={loading}
                                className="px-4 py-3 rounded-2xl text-gray-600 dark:text-slate-300 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center">
                                <WIcon name="undo" size={16} strokeWidth={2.2} />
                            </motion.button>
                        )}
                    </motion.div>
                )}

                {mode === "add" && (
                    <motion.div key="add"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={SPRING} className="flex gap-2">
                        <input type="number" step="0.1" value={input}
                            onChange={(e) => setInput(e.target.value)} placeholder="70.5" autoFocus
                            className="flex-1 px-4 py-3 rounded-2xl text-sm font-medium outline-none bg-[#F5F6FB] dark:bg-[#252D38] text-gray-900 dark:text-slate-100" />
                        <motion.button whileTap={{ scale: 0.96 }} onClick={handleSave} disabled={loading || !input}
                            className="px-4 py-3 rounded-2xl font-semibold text-white text-sm disabled:opacity-50"
                            style={{ background: "#5B6AD0" }}>
                            {t('btn_save')}
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.96 }}
                            onClick={() => { setMode("idle"); setInput(""); }}
                            className="px-3 py-3 rounded-2xl text-gray-500 dark:text-slate-400 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center">
                            <WIcon name="close" size={16} strokeWidth={2.2} />
                        </motion.button>
                    </motion.div>
                )}

                {mode === "target" && (
                    <motion.div key="target"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={SPRING}>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 px-1">{t('weight_target_input')}</p>
                        <div className="flex gap-2">
                            <input type="number" step="0.1" value={targetInput}
                                onChange={(e) => setTargetInput(e.target.value)} placeholder="65.0" autoFocus
                                className="flex-1 px-4 py-3 rounded-2xl text-sm font-medium outline-none bg-[#F5F6FB] dark:bg-[#252D38] text-gray-900 dark:text-slate-100" />
                            <motion.button whileTap={{ scale: 0.96 }} onClick={handleSaveTarget} disabled={loading || !targetInput}
                                className="px-4 py-3 rounded-2xl font-semibold text-white text-sm disabled:opacity-50"
                                style={{ background: "#5B6AD0" }}>
                                {t('btn_save')}
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.96 }}
                                onClick={() => { setMode("idle"); setTargetInput(""); }}
                                className="px-3 py-3 rounded-2xl text-gray-500 dark:text-slate-400 bg-[#F5F6FB] dark:bg-[#252D38] flex items-center justify-center">
                                <WIcon name="close" size={16} strokeWidth={2.2} />
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default WeightTracker;