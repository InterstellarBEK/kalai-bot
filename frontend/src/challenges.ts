import { supabase } from "./supabase";
import { getTelegramId } from "./telegram";
import { getTodayWater, getWaterGoal } from "./water";

export type ChallengeType = "water_goal" | "calorie_balance" | "log_3_meals";

export type Challenge = {
    id: number;
    type: ChallengeType;
    icon: string;
    current: number;
    target: number;
    isOver: boolean;
    overAmount: number;
    progress: number;
    rewardCoins: number;
    completed: boolean;
    claimed: boolean;
};

const META: Record<ChallengeType, { icon: string; reward: number }> = {
    water_goal: { icon: "💧", reward: 10 },
    calorie_balance: { icon: "🎯", reward: 15 },
    log_3_meals: { icon: "🍽️", reward: 10 },
};

const ALL_TYPES: ChallengeType[] = ["water_goal", "calorie_balance", "log_3_meals"];

function todayDateStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function ensureTodayChallenges(): Promise<void> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return;
    const date = todayDateStr();
    const { data: existing } = await supabase
        .from("daily_challenges")
        .select("challenge_type")
        .eq("telegram_id", telegram_id)
        .eq("challenge_date", date);
    const have = new Set((existing ?? []).map(r => r.challenge_type as ChallengeType));
    const toInsert = ALL_TYPES.filter(t => !have.has(t)).map(t => ({
        telegram_id,
        challenge_date: date,
        challenge_type: t,
        reward_coins: META[t].reward,
    }));
    if (toInsert.length > 0) {
        await supabase.from("daily_challenges").insert(toInsert);
    }
}

async function getTodayMealCount(): Promise<number> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
        .from("food_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", telegram_id)
        .gte("logged_at", start.toISOString());
    return count ?? 0;
}

async function getTodayCalories(): Promise<{ total: number; target: number }> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return { total: 0, target: 2000 };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [foodRes, userRes] = await Promise.all([
        supabase.from("food_logs").select("calories").eq("user_id", telegram_id).gte("logged_at", start.toISOString()),
        supabase.from("users").select("daily_calories_goal").eq("telegram_id", telegram_id).single(),
    ]);
    const total = (foodRes.data ?? []).reduce((s, r) => s + Number(r.calories || 0), 0);
    const target = Number(userRes.data?.daily_calories_goal) || 2000;
    return { total, target };
}

export async function getTodayChallenges(): Promise<Challenge[]> {
    await ensureTodayChallenges();
    const telegram_id = getTelegramId();
    if (!telegram_id) return [];
    const date = todayDateStr();

    const { data } = await supabase
        .from("daily_challenges")
        .select("id, challenge_type, reward_coins, completed")
        .eq("telegram_id", telegram_id)
        .eq("challenge_date", date);
    if (!data) return [];

    const [waterMl, waterGoalMl, mealCount, cal] = await Promise.all([
        getTodayWater(), getWaterGoal(), getTodayMealCount(), getTodayCalories(),
    ]);

    const result: Challenge[] = data.map(row => {
        const type = row.challenge_type as ChallengeType;
        let progress = 0;
        let completed = false;
        let isOver = false;
        let overAmount = 0;
        let current = 0;
        let target = 0;

        if (type === "water_goal") {
            current = waterMl;
            target = waterGoalMl;
            progress = waterGoalMl > 0 ? Math.min(1, waterMl / waterGoalMl) : 0;
            completed = waterMl >= waterGoalMl;
        } else if (type === "calorie_balance") {
            current = cal.total;
            target = cal.target;
            const ratio = cal.target > 0 ? cal.total / cal.target : 0;
            if (ratio >= 0.8 && ratio <= 1.1) {
                progress = 1;
                completed = true;
            } else if (ratio < 0.8) {
                progress = ratio / 0.8;
            } else {
                progress = 1;
                isOver = true;
                overAmount = cal.total - cal.target;
            }
        } else if (type === "log_3_meals") {
            current = mealCount;
            target = 3;
            progress = Math.min(1, mealCount / 3);
            completed = mealCount >= 3;
        }

        return {
            id: row.id,
            type,
            icon: META[type].icon,
            current,
            target,
            isOver,
            overAmount,
            progress,
            rewardCoins: row.reward_coins,
            completed,
            claimed: row.completed === true,
        };
    });

    const order: ChallengeType[] = ["water_goal", "log_3_meals", "calorie_balance"];
    result.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    return result;
}

export async function claimChallenge(challengeId: number, rewardCoins: number): Promise<boolean> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return false;
    const { data: updated, error: updErr } = await supabase
        .from("daily_challenges")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", challengeId)
        .eq("telegram_id", telegram_id)
        .eq("completed", false)
        .select("id");
    if (updErr || !updated || updated.length === 0) return false;

    const { error: coinErr } = await supabase.rpc("add_coins", {
        p_telegram_id: telegram_id,
        p_amount: rewardCoins,
    });
    if (coinErr) {
        await supabase.from("daily_challenges").update({ completed: false, completed_at: null }).eq("id", challengeId);
        return false;
    }
    return true;
}