import { supabase } from "./supabase";
import { getTelegramId } from "./telegram";

export type WeightEntry = {
    id: number;
    weight_kg: number;
    logged_at: string;
};

export type WeightTrend = {
    weeklyRateKg: number;
    direction: "down" | "up" | "stable";
    healthStatus: "good" | "warning" | "danger";
    weeksToTarget: number | null;
    pointsUsed: number;
};

export async function addWeight(weightKg: number): Promise<boolean> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return false;

    const { error } = await supabase
        .from("weight_logs")
        .insert({ telegram_id, weight_kg: weightKg });
    if (error) return false;

    // Sinxron: users.weight_kg ham yangilanadi → BMR aktual qoladi
    await supabase
        .from("users")
        .update({ weight_kg: weightKg })
        .eq("telegram_id", telegram_id);

    return true;
}

export async function getWeightHistory(days = 30): Promise<WeightEntry[]> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return [];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
        .from("weight_logs")
        .select("id, weight_kg, logged_at")
        .eq("telegram_id", telegram_id)
        .gte("logged_at", since.toISOString())
        .order("logged_at", { ascending: true });
    if (error || !data) return [];
    return data;
}

export async function getLatestWeight(): Promise<number | null> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return null;
    const { data, error } = await supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("telegram_id", telegram_id)
        .order("logged_at", { ascending: false })
        .limit(1)
        .single();
    if (error || !data) return null;
    return data.weight_kg;
}

export async function removeLastWeight(): Promise<boolean> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return false;
    const { data } = await supabase
        .from("weight_logs")
        .select("id")
        .eq("telegram_id", telegram_id)
        .order("logged_at", { ascending: false })
        .limit(1)
        .single();
    if (!data) return false;
    const { error } = await supabase
        .from("weight_logs")
        .delete()
        .eq("id", data.id);
    return !error;
}

export async function getTargetWeight(): Promise<number | null> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return null;
    const { data, error } = await supabase
        .from("users")
        .select("target_weight_kg")
        .eq("telegram_id", telegram_id)
        .single();
    if (error || !data || data.target_weight_kg == null) return null;
    return Number(data.target_weight_kg);
}

export async function setTargetWeight(targetKg: number): Promise<boolean> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return false;
    const { error } = await supabase
        .from("users")
        .update({ target_weight_kg: targetKg })
        .eq("telegram_id", telegram_id);
    return !error;
}

export function calcWeightTrend(
    entries: WeightEntry[],
    targetKg: number | null
): WeightTrend | null {
    if (entries.length < 2) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const recent = entries.filter((e) => new Date(e.logged_at) >= cutoff);
    const pool = recent.length >= 2 ? recent : entries;

    const first = pool[0];
    const last = pool[pool.length - 1];
    const daysDiff =
        (new Date(last.logged_at).getTime() -
            new Date(first.logged_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 1) return null;

    const totalChange = last.weight_kg - first.weight_kg;
    const weeklyRateKg = (totalChange / daysDiff) * 7;
    const absRate = Math.abs(weeklyRateKg);

    let direction: "down" | "up" | "stable" = "stable";
    if (absRate >= 0.1) direction = weeklyRateKg < 0 ? "down" : "up";

    let healthStatus: "good" | "warning" | "danger" = "good";
    if (absRate <= 1.0) healthStatus = "good";
    else if (absRate <= 1.5) healthStatus = "warning";
    else healthStatus = "danger";

    let weeksToTarget: number | null = null;
    if (targetKg != null && direction !== "stable") {
        const currentKg = last.weight_kg;
        const distance = targetKg - currentKg;
        const correctDirection =
            (distance < 0 && weeklyRateKg < 0) ||
            (distance > 0 && weeklyRateKg > 0);
        if (correctDirection && absRate > 0.05) {
            weeksToTarget = Math.abs(distance / weeklyRateKg);
        }
    }

    return { weeklyRateKg, direction, healthStatus, weeksToTarget, pointsUsed: pool.length };
}

export function calcTargetProgress(
    entries: WeightEntry[],
    targetKg: number | null
): number {
    if (!targetKg || entries.length === 0) return 0;
    const start = entries[0].weight_kg;
    const current = entries[entries.length - 1].weight_kg;
    const totalDistance = Math.abs(targetKg - start);
    if (totalDistance < 0.1) return 1;
    const covered = Math.abs(current - start);
    const movingRightWay =
        (targetKg < start && current < start) ||
        (targetKg > start && current > start);
    if (!movingRightWay) return 0;
    return Math.min(1, covered / totalDistance);
}
// === V2.1: AUTO-SEED + BMI ===

/**
 * weight_logs bo'sh bo'lsa, users.weight_kg dan birinchi entry yaratadi.
 * Onboarding va Tracker sinxron bo'lishini ta'minlaydi.
 * Return: seed qilindimi (true) yoki kerak bo'lmadi (false).
 */
export async function seedFromProfile(): Promise<boolean> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return false;

    const existing = await getLatestWeight();
    if (existing !== null) return false; // allaqachon entry bor

    const { data } = await supabase
        .from("users")
        .select("weight_kg")
        .eq("telegram_id", telegram_id)
        .single();

    if (!data?.weight_kg) return false;
    return await addWeight(Number(data.weight_kg));
}

export type BMIInfo = {
    value: number;
    category: "low" | "normal" | "over" | "obese";
    label: string;
    color: string; // bg className
    textColor: string;
};

/**
 * BMI = weight(kg) / (height(m))^2
 * Kategoriya: <18.5 kam · 18.5-25 normal · 25-30 ortiq · 30+ semizlik
 */
export function calcBMI(weightKg: number, heightCm: number): BMIInfo | null {
    if (!weightKg || !heightCm || heightCm < 50) return null;
    const m = heightCm / 100;
    const value = weightKg / (m * m);

    if (value < 18.5)
        return { value, category: "low", label: "Kam vazn", color: "bg-blue-50", textColor: "text-blue-700" };
    if (value < 25)
        return { value, category: "normal", label: "Normal", color: "bg-green-50", textColor: "text-green-700" };
    if (value < 30)
        return { value, category: "over", label: "Ortiqcha", color: "bg-yellow-50", textColor: "text-yellow-700" };
    return { value, category: "obese", label: "Semizlik", color: "bg-red-50", textColor: "text-red-700" };
}

/**
 * users.height_cm dan BMI hisoblaydi (current vazn bilan).
 */
export async function getCurrentBMI(currentWeightKg: number): Promise<BMIInfo | null> {
    const telegram_id = getTelegramId();
    if (!telegram_id) return null;
    const { data } = await supabase
        .from("users")
        .select("height_cm")
        .eq("telegram_id", telegram_id)
        .single();
    if (!data?.height_cm) return null;
    return calcBMI(currentWeightKg, Number(data.height_cm));
}