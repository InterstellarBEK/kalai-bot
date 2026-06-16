import { supabase } from './supabase';
import { getTelegramId } from './telegram';

export const COINS_PER_LOG = 5;

export async function addCoinsForLog(): Promise<number | null> {
    const { data, error } = await supabase.rpc('add_coins', {
        p_telegram_id: getTelegramId(),
        p_amount: COINS_PER_LOG,
    });
    if (error) {
        console.error("Coin qo'shishda xato:", error);
        return null;
    }
    return data as number;
}

export interface PurchaseResult {
    success: boolean;
    new_coins?: number;
    error?: string;
}

export async function purchaseSkin(skinId: string, price: number): Promise<PurchaseResult> {
    const { data, error } = await supabase.rpc('purchase_skin', {
        p_telegram_id: getTelegramId(),
        p_skin_id: skinId,
        p_price: price,
    });
    if (error) {
        console.error('Sotib olishda xato:', error);
        return { success: false, error: error.message };
    }
    return data as PurchaseResult;
}

export async function equipSkin(skinId: string | null): Promise<boolean> {
    const { error } = await supabase
        .from('users')
        .update({ equipped_skin: skinId })
        .eq('telegram_id', getTelegramId());
    if (error) {
        console.error('Skin kiyishda xato:', error);
        return false;
    }
    return true;
}

export async function getOwnedSkins(): Promise<string[]> {
    const { data, error } = await supabase
        .from('user_skins')
        .select('skin_id')
        .eq('telegram_id', getTelegramId());
    if (error || !data) return [];
    return data.map(r => r.skin_id);
}