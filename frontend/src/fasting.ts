import { supabase } from './supabase';

export type FastingStatus = 'active' | 'completed' | 'broken';

export interface FastingSession {
    id: number;
    telegram_id: number;
    start_time: string;
    end_time: string | null;
    target_hours: number;
    status: FastingStatus;
    created_at: string;
}

export const FASTING_PRESETS = [
    { label: '16:8', hours: 16, descKey: 'fast_preset_popular' },
    { label: '18:6', hours: 18, descKey: 'fast_preset_mid' },
    { label: '20:4', hours: 20, descKey: 'fast_preset_warrior' },
    { label: '23:1', hours: 23, descKey: 'fast_preset_omad' },
];

export async function getActiveFast(telegramId: number): Promise<FastingSession | null> {
    const { data, error } = await supabase
        .from('fasting_sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1);

    if (error) {
        console.error('getActiveFast error:', error);
        return null;
    }
    return data && data.length > 0 ? (data[0] as FastingSession) : null;
}

export async function startFast(
    telegramId: number,
    targetHours: number,
    customStartTime?: string
): Promise<FastingSession | null> {
    const existing = await getActiveFast(telegramId);
    if (existing) return existing;

    const payload: Record<string, unknown> = {
        telegram_id: telegramId,
        target_hours: targetHours,
        status: 'active',
    };
    if (customStartTime) payload.start_time = customStartTime;

    const { data, error } = await supabase
        .from('fasting_sessions')
        .insert(payload)
        .select();

    if (error) {
        console.error('startFast error:', error);
        return null;
    }
    return data && data.length > 0 ? (data[0] as FastingSession) : null;
}

export async function endFast(
    sessionId: number,
    completed: boolean
): Promise<boolean> {
    const { error } = await supabase
        .from('fasting_sessions')
        .update({
            end_time: new Date().toISOString(),
            status: completed ? 'completed' : 'broken',
        })
        .eq('id', sessionId);

    if (error) {
        console.error('endFast error:', error);
        return false;
    }
    return true;
}

export function calcElapsedHours(startTime: string): number {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    return (now - start) / (1000 * 60 * 60);
}

export function calcProgress(startTime: string, targetHours: number): number {
    const elapsed = calcElapsedHours(startTime);
    return Math.min((elapsed / targetHours) * 100, 100);
}

export function formatDuration(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = Math.floor(((hours - h) * 60 - m) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function getRecentFasts(
    telegramId: number,
    limit: number = 7
): Promise<FastingSession[]> {
    const { data, error } = await supabase
        .from('fasting_sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .neq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getRecentFasts error:', error);
        return [];
    }
    return (data as FastingSession[]) || [];
}