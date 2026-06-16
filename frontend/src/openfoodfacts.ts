// Open Food Facts API — bepul, dunyo bo'yicha mahsulot bazasi
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/

import { uzLatinToCyrl } from './transliterate';

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
}

export async function lookupBarcode(barcode: string, lang: string = 'uz-Latn'): Promise<OFFProduct | null> {
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
        };
    } catch (e) {
        console.error('OFF lookup error:', e);
        return null;
    }
}