import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTodayChallenges, claimChallenge, type Challenge } from "./challenges";
import { useTranslation } from "./i18n";

const TITLE_KEY: Record<string, string> = {
    water_goal: 'ch_water_title',
    calorie_balance: 'ch_calorie_title',
    log_3_meals: 'ch_meals_title',
};

const SPRING = { type: "spring" as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

// ── Iconly-style SVG icons ─────────────────────────────────
function CIcon({
    name,
    size = 18,
    color = 'currentColor',
    fill = 'none',
    strokeWidth = 2,
}: {
    name: 'coin' | 'check' | 'droplet' | 'flame' | 'utensils';
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
        case 'coin':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="8.5" fill={fill} />
                    <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.9-2.5 2s.9 1.7 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6" />
                    <path d="M12 7v10" />
                </svg>
            );
        case 'check':
            return (
                <svg {...common}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            );
        case 'droplet':
            return (
                <svg {...common}>
                    <path d="M12 3.5c2.5 3 6.5 7.2 6.5 11a6.5 6.5 0 11-13 0c0-3.8 4-8 6.5-11z" fill={fill} />
                </svg>
            );
        case 'flame':
            return (
                <svg {...common}>
                    <path d="M12 3c1.5 3 4 5 4 8.5a4 4 0 11-8 0c0-1.5.5-2.5 1.5-3.5C9 9.5 11 7 12 3z" fill={fill} />
                    <path d="M12 14a2 2 0 002 2c0 1-.8 2-2 2s-2-1-2-2c.8 0 1.5-.8 2-2z" fill={fill} />
                </svg>
            );
        case 'utensils':
            return (
                <svg {...common}>
                    <path d="M7 3v8m0 0a2.5 2.5 0 002.5-2.5V3M7 11v10M4.5 3v5.5A2.5 2.5 0 007 11" />
                    <path d="M17.5 14V21M17.5 14c-1.5 0-2.5-1.2-2.5-3 0-4 2.5-8 2.5-8s2.5 4 2.5 8c0 1.8-1 3-2.5 3z" fill={fill} />
                </svg>
            );
    }
}

function challengeIcon(type: string) {
    if (type === 'water_goal') return { name: 'droplet' as const, color: '#3B9DF5' };
    if (type === 'calorie_balance') return { name: 'flame' as const, color: '#EF9F27' };
    if (type === 'log_3_meals') return { name: 'utensils' as const, color: '#5B6AD0' };
    return { name: 'flame' as const, color: '#5B6AD0' };
}

function formatTarget(c: Challenge, t: (k: string) => string): string {
    if (c.type === 'water_goal') return `${Math.round(c.current)} / ${c.target} ${t('ch_water_unit')}`;
    if (c.type === 'log_3_meals') return `${Math.min(c.current, c.target)} / ${c.target} ${t('ch_meals_unit')}`;
    if (c.isOver) return `+${Math.round(c.overAmount)} ${t('ch_calorie_unit')} ${t('ch_calorie_over')}`;
    return `${Math.round(c.current)} / ${c.target} ${t('ch_calorie_unit')}`;
}

type Props = { onClaim?: () => void };

export function ChallengesCard({ onClaim }: Props) {
    const { t } = useTranslation();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState<number | null>(null);

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const data = await getTodayChallenges();
        setChallenges(data);
        setLoading(false);
    }

    async function handleClaim(c: Challenge) {
        if (!c.completed || c.claimed || c.isOver) return;
        setClaiming(c.id);
        const ok = await claimChallenge(c.id, c.rewardCoins);
        if (ok) {
            await refresh();
            onClaim?.();
        }
        setClaiming(null);
    }

    const totalReward = challenges.reduce((s, c) => s + c.rewardCoins, 0);
    const earned = challenges.filter(c => c.claimed).reduce((s, c) => s + c.rewardCoins, 0);
    const allClaimed = challenges.length > 0 && challenges.every(c => c.claimed);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="bg-white dark:bg-[#1E252E] rounded-[1.75rem] p-5 mb-4"
            style={{ boxShadow: "0 8px 24px -10px rgba(91,106,208,0.12)" }}
        >
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{t('challenges_title')}</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">{earned}</span>
                        <span className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                            / {totalReward}
                            <CIcon name="coin" size={14} color="#EF9F27" fill="#FFE8C7" strokeWidth={1.9} />
                        </span>
                    </div>
                </div>
                {allClaimed && (
                    <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ ease: EASE_BACK, duration: 0.4 }}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-green-50 text-green-700"
                    >
                        {t('challenges_all_done')}
                    </motion.div>
                )}
            </div>

            {loading ? (
                <div className="text-center py-6 text-sm text-gray-400">{t('loading')}</div>
            ) : challenges.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">{t('challenges_empty')}</div>
            ) : (
                <div className="space-y-3">
                    {challenges.map((c, idx) => {
                        const cardCls = c.claimed
                            ? "bg-green-50 dark:bg-[#1A2A20]"
                            : c.isOver
                                ? "bg-red-50 dark:bg-[#2A1A1A]"
                                : "bg-[#F5F6FB] dark:bg-[#252D38]";
                        const barColor = c.isOver ? "#EF4444" : c.completed ? "#22C55E" : "#5B6AD0";
                        const ic = challengeIcon(c.type);
                        return (
                            <motion.div
                                key={c.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ ...SPRING, delay: idx * 0.06 }}
                                className={`rounded-2xl p-3 ${cardCls}`}
                            >
                                <div className="flex items-center justify-between mb-2 gap-2">
                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                        <div
                                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ background: 'rgba(255,255,255,0.7)' }}
                                        >
                                            <CIcon name={ic.name} size={18} color={ic.color} fill={ic.color + '33'} strokeWidth={2} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{t(TITLE_KEY[c.type])}</p>
                                            <p className={`text-xs truncate ${c.isOver ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-500 dark:text-slate-400"}`}>
                                                {formatTarget(c, t)}
                                            </p>
                                        </div>
                                    </div>
                                    <ClaimButton c={c} busy={claiming === c.id} onClick={() => handleClaim(c)} overLabel={t('challenges_over')} />
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden bg-white dark:bg-[#0F1419]">
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: barColor }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${c.progress * 100}%` }}
                                        transition={{ duration: 0.6, ease: EASE_BACK }}
                                    />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}

function ClaimButton({ c, busy, onClick, overLabel }: { c: Challenge; busy: boolean; onClick: () => void; overLabel: string }) {
    if (c.isOver) {
        return (
            <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-600 shrink-0">
                {overLabel}
            </div>
        );
    }
    if (c.claimed) {
        return (
            <div className="px-2.5 py-1.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 shrink-0 flex items-center justify-center">
                <CIcon name="check" size={14} strokeWidth={2.5} />
            </div>
        );
    }
    if (c.completed) {
        return (
            <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClick}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-60 shrink-0 flex items-center gap-1"
                style={{ background: "#22C55E" }}
            >
                <span>+{c.rewardCoins}</span>
                <CIcon name="coin" size={12} color="#ffffff" fill="rgba(255,255,255,0.35)" strokeWidth={2} />
            </motion.button>
        );
    }
    return (
        <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-white dark:bg-[#0F1419] text-gray-500 dark:text-slate-400 shrink-0">
            {Math.round(c.progress * 100)}%
        </div>
    );
}

export default ChallengesCard;