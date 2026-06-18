// Lokma barcode lookup — Supabase → OFF → Backend proxy (UPCitemdb + OFF-ru) → OFF name search
import { uzLatinToCyrl } from './transliterate';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';

export interface OFFProduct {
    barcode: string;
    name: string;
    brand?: string;
    image?: string;
    kcal_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fat_per_100g: number;
    serving_size_g?: number;
    source?: 'lokma' | 'off' | 'user';
    incomplete?: boolean;
}

async function lookupSupabase(barcode: string): Promise<OFFProduct | null> {
    try {
        const { data, error } = await supabase
            .from('lokma_products')
            .select('*')
            .eq('barcode', barcode)
            .maybeSingle();
        if (error || !data) return null;
        return {
            barcode: data.barcode,
            name: data.name,
            brand: data.brand || undefined,
            kcal_per_100g: Number(data.kcal_per_100g),
            protein_per_100g: Number(data.protein_per_100g) || 0,
            carbs_per_100g: Number(data.carbs_per_100g) || 0,
            fat_per_100g: Number(data.fat_per_100g) || 0,
            source: 'lokma',
        };
    } catch {
        return null;
    }
}

async function lookupOFF(barcode: string, lang: string): Promise<OFFProduct | null> {
    try {
        const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_uz,product_name_ru,product_name_en,brands,image_small_url,nutriments,serving_quantity`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 1 || !data.product) return null;

        const p = data.product;
        const n = p.nutriments || {};
        const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
        if (kcal == null) return null;

        const preferred =
            lang === 'ru' ? p.product_name_ru :
                lang === 'en' ? p.product_name_en :
                    p.product_name_uz;
        const rawName = preferred || p.product_name || p.product_name_en || p.product_name_ru || 'Mahsulot';
        const name = lang === 'uz-Cyrl' ? uzLatinToCyrl(rawName) : rawName;

        return {
            barcode,
            name,
            brand: p.brands?.split(',')[0]?.trim(),
            image: p.image_small_url,
            kcal_per_100g: Math.round(kcal),
            protein_per_100g: Math.round((n.proteins_100g ?? 0) * 10) / 10,
            carbs_per_100g: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
            fat_per_100g: Math.round((n.fat_100g ?? 0) * 10) / 10,
            serving_size_g: p.serving_quantity ? Number(p.serving_quantity) : undefined,
            source: 'off',
        };
    } catch (e) {
        console.error('OFF lookup error:', e);
        return null;
    }
}

// Backend proxy — UPCitemdb + OFF Russia (CORS chetlab o'tish)
async function lookupBackend(barcode: string): Promise<{
    name: string;
    brand?: string;
    image?: string;
    kcal_per_100g?: number;
    protein_per_100g?: number;
    carbs_per_100g?: number;
    fat_per_100g?: number;
} | null> {
    try {
        const res = await fetch(`${API_URL}/api/barcode-lookup/${barcode}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.name) return null;
        return {
            name: data.name,
            brand: data.brand || undefined,
            image: data.image || undefined,
            kcal_per_100g: data.kcal_per_100g ?? undefined,
            protein_per_100g: data.protein_per_100g ?? undefined,
            carbs_per_100g: data.carbs_per_100g ?? undefined,
            fat_per_100g: data.fat_per_100g ?? undefined,
        };
    } catch (e) {
        console.error('Backend lookup error:', e);
        return null;
    }
}

async function searchOFFByName(name: string): Promise<{ kcal: number; protein: number; carbs: number; fat: number } | null> {
    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1&fields=nutriments`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const p = data.products?.[0];
        if (!p) return null;
        const n = p.nutriments || {};
        const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
        if (kcal == null) return null;
        return {
            kcal: Math.round(kcal),
            protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
            carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
            fat: Math.round((n.fat_100g ?? 0) * 10) / 10,
        };
    } catch (e) {
        console.error('OFF name search error:', e);
        return null;
    }
}

async function cacheToSupabase(product: OFFProduct, telegramId: number): Promise<void> {
    try {
        await supabase.from('lokma_products').upsert({
            barcode: product.barcode,
            name: product.name,
            brand: product.brand,
            kcal_per_100g: product.kcal_per_100g,
            protein_per_100g: product.protein_per_100g,
            fat_per_100g: product.fat_per_100g,
            carbs_per_100g: product.carbs_per_100g,
            contributed_by_telegram_id: telegramId,
            source: 'off',
        }, { onConflict: 'barcode' });
    } catch (e) {
        console.error('Supabase cache error:', e);
    }
}

export async function lookupBarcode(
    barcode: string,
    lang: string = 'uz-Latn',
    telegramId?: number
): Promise<OFFProduct | null> {
    // Qatlam 1: Supabase community DB
    const cached = await lookupSupabase(barcode);
    if (cached) return cached;

    // Qatlam 2: OFF world (to'liq nutrition)
    const offResult = await lookupOFF(barcode, lang);
    if (offResult) {
        if (telegramId) cacheToSupabase(offResult, telegramId);
        return offResult;
    }

    // Qatlam 3: Backend proxy (UPCitemdb + OFF Russia)
    const upc = await lookupBackend(barcode);
    if (!upc) return null;

    // Agar backend OFF Russia'dan nutrition topgan bo'lsa — to'liq qaytar
    if (upc.kcal_per_100g != null) {
        const full: OFFProduct = {
            barcode,
            name: upc.name,
            brand: upc.brand,
            image: upc.image,
            kcal_per_100g: upc.kcal_per_100g,
            protein_per_100g: upc.protein_per_100g ?? 0,
            carbs_per_100g: upc.carbs_per_100g ?? 0,
            fat_per_100g: upc.fat_per_100g ?? 0,
            source: 'off',
        };
        if (telegramId) cacheToSupabase(full, telegramId);
        return full;
    }

    // Qatlam 4: OFF name search — nutrition topish urinish
    const nutrition = await searchOFFByName(upc.name);
    if (nutrition) {
        const full: OFFProduct = {
            barcode,
            name: upc.name,
            brand: upc.brand,
            image: upc.image,
            kcal_per_100g: nutrition.kcal,
            protein_per_100g: nutrition.protein,
            carbs_per_100g: nutrition.carbs,
            fat_per_100g: nutrition.fat,
            source: 'off',
        };
        if (telegramId) cacheToSupabase(full, telegramId);
        return full;
    }

    // Faqat name topildi — manual entry pre-filled
    return {
        barcode,
        name: upc.name,
        brand: upc.brand,
        image: upc.image,
        kcal_per_100g: 0,
        protein_per_100g: 0,
        carbs_per_100g: 0,
        fat_per_100g: 0,
        source: 'user',
        incomplete: true,
    };
}

export interface UserProductInput {
    barcode: string;
    name: string;
    brand?: string;
    kcal_per_100g: number;
    protein_per_100g?: number;
    fat_per_100g?: number;
    carbs_per_100g?: number;
}

export async function saveUserProduct(
    input: UserProductInput,
    telegramId: number
): Promise<OFFProduct | null> {
    try {
        const { data, error } = await supabase.from('lokma_products').upsert({
            barcode: input.barcode,
            name: input.name,
            brand: input.brand || null,
            kcal_per_100g: input.kcal_per_100g,
            protein_per_100g: input.protein_per_100g ?? 0,
            fat_per_100g: input.fat_per_100g ?? 0,
            carbs_per_100g: input.carbs_per_100g ?? 0,
            contributed_by_telegram_id: telegramId,
            source: 'user',
        }, { onConflict: 'barcode' }).select().single();

        if (error || !data) return null;
        return {
            barcode: data.barcode,
            name: data.name,
            brand: data.brand || undefined,
            kcal_per_100g: Number(data.kcal_per_100g),
            protein_per_100g: Number(data.protein_per_100g),
            carbs_per_100g: Number(data.carbs_per_100g),
            fat_per_100g: Number(data.fat_per_100g),
            source: 'user',
        };
    } catch (e) {
        console.error('saveUserProduct error:', e);
        return null;
    }
}