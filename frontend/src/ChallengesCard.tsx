import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTodayChallenges, claimChallenge, type Challenge } from "./challenges";
import { useTranslation } from "./i18n";
const TITLE_KEY: Record<string, string> = {
    water_goal: 'ch_water_title',
    calorie_balance: 'ch_calorie_title',
    log_3_meals: 'ch_meals_title',
};

function formatTarget(c: Challenge, t: (k: string) => string): string {
    if (c.type === 'water_goal') return `${Math.round(c.current)} / ${c.target} ${t('ch_water_unit')}`;
    if (c.type === 'log_3_meals') return `${Math.min(c.current, c.target)} / ${c.target} ${t('ch_meals_unit')}`;
    if (c.isOver) return `+${Math.round(c.overAmount)} ${t('ch_calorie_unit')} ${t('ch_calorie_over')}`;
    return `${Math.round(c.current)} / ${c.target} ${t('ch_calorie_unit')}`;
}

const SPRING = { type: "spring" as const, stiffness: 280, damping: 26 };
const EASE_BACK = [0.34, 1.56, 0.64, 1] as const;

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
                        <span className="text-sm text-gray-500 dark:text-slate-400">/ {totalReward} 🪙</span>
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
                        return (
                            <motion.div
                                key={c.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ ...SPRING, delay: idx * 0.06 }}
                                className={`rounded-2xl p-3 ${cardCls}`}
                            >
                                <div className="flex items-center justify-between mb-2 gap-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-xl shrink-0">{c.icon}</span>
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
            <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 shrink-0">✓</div>
        );
    }
    if (c.completed) {
        return (
            <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClick}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-60 shrink-0"
                style={{ background: "#22C55E" }}
            >
                +{c.rewardCoins} 🪙
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