// openfoodfacts.ts
// ============================================================
// LOKMA — Barcode lookup module (premium refactor)
// - Result<T> API (Supabase + fetch xatolarini yashirmaymiz)
// - Memory cache (10min TTL) + inflight dedup
// - AbortSignal support — unmount'da cancel
// - Timeout wrapper (8s har fetch)
// - Retry bir marta 5xx/network xato'da
// - Lang: uz-Latn | uz-Cyrl | ru | en (typed)
// - Qatlamli fallback: Supabase → OFF → Backend → OFF name search → skeleton
// ============================================================

import { uzLatinToCyrl } from './transliterate';
import { supabase, toLokmaError, type Result } from './supabase';

// ============================================================
// CONSTANTS
// ============================================================
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60_000; // 10 min
const OFF_BASE = 'https://world.openfoodfacts.org';

// ============================================================
// TYPES
// ============================================================
export type Lang = 'uz-Latn' | 'uz-Cyrl' | 'ru' | 'en';

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

export interface UserProductInput {
    barcode: string;
    name: string;
    brand?: string;
    kcal_per_100g: number;
    protein_per_100g?: number;
    fat_per_100g?: number;
    carbs_per_100g?: number;
}

interface BackendLookupData {
    name: string;
    brand?: string;
    image?: string;
    kcal_per_100g?: number;
    protein_per_100g?: number;
    carbs_per_100g?: number;
    fat_per_100g?: number;
}

interface NutritionData {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
}

// ============================================================
// CACHE + INFLIGHT DEDUP
// ============================================================
interface CacheEntry {
    data: OFFProduct | null;
    expiresAt: number;
}

const barcodeCache = new Map<string, CacheEntry>();
const barcodeInflight = new Map<string, Promise<Result<OFFProduct | null>>>();

function cacheKey(barcode: string, lang: Lang): string {
    return `${barcode}::${lang}`;
}

function getCached(key: string): OFFProduct | null | undefined {
    const entry = barcodeCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        barcodeCache.delete(key);
        return undefined;
    }
    return entry.data;
}

function setCached(key: string, data: OFFProduct | null): void {
    barcodeCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Testing / logout uchun */
export function clearBarcodeCache(): void {
    barcodeCache.clear();
    barcodeInflight.clear();
}

// ============================================================
// FETCH UTILITIES — timeout + retry + abort
// ============================================================
class NetworkError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'NetworkError';
        this.status = status;
    }
}

/** AbortSignal + timeout combine — biri firing bo'lsa fetch abort */
async function fetchWithTimeout(
    url: string,
    externalSignal?: AbortSignal,
    timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new NetworkError('timeout')), timeoutMs);

    // Tashqi signal bo'lsa link qilamiz
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timer);
            throw new NetworkError('aborted');
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
        const res = await fetch(url, { signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}

/** Bir marta retry — network xato yoki 5xx uchun */
async function fetchJsonWithRetry(
    url: string,
    signal?: AbortSignal,
    timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<unknown | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetchWithTimeout(url, signal, timeoutMs);
            if (res.status >= 500 && attempt === 0) {
                // 5xx — bir marta qayta urinamiz
                continue;
            }
            if (!res.ok) return null; // 4xx — mahsulot yo'q, retry bermaymiz
            return await res.json();
        } catch (err) {
            // Foydalanuvchi abort qildi — darrov chiqamiz
            if (signal?.aborted) throw err;
            // Timeout / network — 1 marta retry
            if (attempt === 0) continue;
            console.warn('[barcode] fetch failed:', url, err);
            return null;
        }
    }
    return null;
}

// ============================================================
// LAYER 1 — Supabase community DB
// ============================================================
async function lookupSupabase(barcode: string): Promise<OFFProduct | null> {
    try {
        const { data, error } = await supabase
            .from('lokma_products')
            .select('*')
            .eq('barcode', barcode)
            .maybeSingle();

        if (error) {
            console.warn('[barcode] supabase read failed:', error.message);
            return null;
        }
        if (!data) return null;

        return {
            barcode: String(data.barcode),
            name: String(data.name),
            brand: data.brand ? String(data.brand) : undefined,
            kcal_per_100g: Number(data.kcal_per_100g),
            protein_per_100g: Number(data.protein_per_100g) || 0,
            carbs_per_100g: Number(data.carbs_per_100g) || 0,
            fat_per_100g: Number(data.fat_per_100g) || 0,
            source: 'lokma',
        };
    } catch (err) {
        console.warn('[barcode] supabase exception:', err);
        return null;
    }
}

// ============================================================
// LAYER 2 — Open Food Facts world
// ============================================================
interface OFFApiProduct {
    product_name?: string;
    product_name_uz?: string;
    product_name_ru?: string;
    product_name_en?: string;
    brands?: string;
    image_small_url?: string;
    serving_quantity?: string | number;
    nutriments?: Record<string, number | undefined>;
}

interface OFFApiResponse {
    status?: number;
    product?: OFFApiProduct;
}

function pickName(p: OFFApiProduct, lang: Lang): string {
    const preferred =
        lang === 'ru' ? p.product_name_ru :
            lang === 'en' ? p.product_name_en :
                p.product_name_uz;
    const raw =
        preferred ||
        p.product_name ||
        p.product_name_en ||
        p.product_name_ru ||
        'Mahsulot';
    return lang === 'uz-Cyrl' ? uzLatinToCyrl(raw) : raw;
}

function extractKcal(n: Record<string, number | undefined>): number | null {
    const kcalDirect = n['energy-kcal_100g'];
    if (kcalDirect != null && Number.isFinite(kcalDirect)) return kcalDirect;
    const kjPer100 = n['energy_100g'];
    if (kjPer100 != null && Number.isFinite(kjPer100)) return kjPer100 / 4.184;
    return null;
}

async function lookupOFF(
    barcode: string,
    lang: Lang,
    signal?: AbortSignal
): Promise<OFFProduct | null> {
    const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_uz,product_name_ru,product_name_en,brands,image_small_url,nutriments,serving_quantity`;

    const json = (await fetchJsonWithRetry(url, signal)) as OFFApiResponse | null;
    if (!json || json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments || {};
    const kcal = extractKcal(n);
    if (kcal == null) return null;

    return {
        barcode,
        name: pickName(p, lang),
        brand: p.brands?.split(',')[0]?.trim() || undefined,
        image: p.image_small_url,
        kcal_per_100g: Math.round(kcal),
        protein_per_100g: Math.round((n.proteins_100g ?? 0) * 10) / 10,
        carbs_per_100g: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
        fat_per_100g: Math.round((n.fat_100g ?? 0) * 10) / 10,
        serving_size_g:
            p.serving_quantity != null && Number.isFinite(Number(p.serving_quantity))
                ? Number(p.serving_quantity)
                : undefined,
        source: 'off',
    };
}

// ============================================================
// LAYER 3 — Backend proxy (UPCitemdb + OFF Russia)
// ============================================================
async function lookupBackend(
    barcode: string,
    signal?: AbortSignal
): Promise<BackendLookupData | null> {
    const url = `${API_URL}/api/barcode-lookup/${encodeURIComponent(barcode)}`;
    const json = (await fetchJsonWithRetry(url, signal)) as Partial<BackendLookupData> | null;
    if (!json || !json.name) return null;
    return {
        name: json.name,
        brand: json.brand || undefined,
        image: json.image || undefined,
        kcal_per_100g: json.kcal_per_100g ?? undefined,
        protein_per_100g: json.protein_per_100g ?? undefined,
        carbs_per_100g: json.carbs_per_100g ?? undefined,
        fat_per_100g: json.fat_per_100g ?? undefined,
    };
}

// ============================================================
// LAYER 4 — OFF name search (nutrition topish urinishi)
// ============================================================
interface OFFSearchResponse {
    products?: Array<{ nutriments?: Record<string, number | undefined> }>;
}

async function searchOFFByName(
    name: string,
    signal?: AbortSignal
): Promise<NutritionData | null> {
    const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1&fields=nutriments`;
    const json = (await fetchJsonWithRetry(url, signal)) as OFFSearchResponse | null;
    const p = json?.products?.[0];
    if (!p) return null;

    const n = p.nutriments || {};
    const kcal = extractKcal(n);
    if (kcal == null) return null;

    return {
        kcal: Math.round(kcal),
        protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
        fat: Math.round((n.fat_100g ?? 0) * 10) / 10,
    };
}

// ============================================================
// CACHE WRITE-BACK: Supabase upsert (best-effort)
// ⚠️ wrapPgResult ISHLATILMAYDI — upsert `.select()` siz `data: null` qaytaradi
//    → wrapPgResult buni yolg'on xato deb hisoblaydi. To'g'ridan-to'g'ri error tekshiramiz.
// ============================================================
async function cacheToSupabase(product: OFFProduct, telegramId: number): Promise<void> {
    try {
        const { error } = await supabase.from('lokma_products').upsert(
            {
                barcode: product.barcode,
                name: product.name,
                brand: product.brand,
                kcal_per_100g: product.kcal_per_100g,
                protein_per_100g: product.protein_per_100g,
                fat_per_100g: product.fat_per_100g,
                carbs_per_100g: product.carbs_per_100g,
                contributed_by_telegram_id: telegramId,
                source: 'off',
            },
            { onConflict: 'barcode' }
        );
        if (error) {
            console.warn('[barcode] cache write failed:', error.message);
        }
    } catch (err) {
        console.warn('[barcode] cache exception:', err);
    }
}

// ============================================================
// PUBLIC: lookupBarcode
// ============================================================
export interface LookupOptions {
    lang?: Lang;
    telegramId?: number;
    signal?: AbortSignal;
    forceRefresh?: boolean;
}

/**
 * Qatlamli qidiruv:
 *   1) Supabase community DB
 *   2) OFF world (to'liq nutrition)
 *   3) Backend proxy (UPCitemdb + OFF Russia)
 *   4) OFF name search (fallback nutrition)
 *   5) Faqat nom bilan (incomplete=true → manual entry)
 *
 * `data === null` → mahsulot topilmadi (400/404 kabi expected holat).
 * `!ok` → real xato (abort, network umuman ishlamadi).
 */
export async function lookupBarcode(
    barcode: string,
    optsOrLang: LookupOptions | string = {},
    legacyTelegramId?: number
): Promise<Result<OFFProduct | null>> {
    // Backward-compat: (barcode, lang?, telegramId?)
    const opts: LookupOptions =
        typeof optsOrLang === 'string'
            ? { lang: optsOrLang as Lang, telegramId: legacyTelegramId }
            : optsOrLang;

    const lang: Lang = opts.lang ?? 'uz-Latn';
    const { telegramId, signal, forceRefresh } = opts;

    if (!barcode || typeof barcode !== 'string') {
        return {
            ok: false,
            error: toLokmaError(new Error("Barcode noto'g'ri"), 'validation'),
        };
    }

    const key = cacheKey(barcode, lang);

    // Cache
    if (!forceRefresh) {
        const cached = getCached(key);
        if (cached !== undefined) return { ok: true, data: cached };
        const inflight = barcodeInflight.get(key);
        if (inflight) return inflight;
    }

    const promise = (async (): Promise<Result<OFFProduct | null>> => {
        try {
            // Layer 1 — Supabase
            const cached = await lookupSupabase(barcode);
            if (cached) {
                setCached(key, cached);
                return { ok: true, data: cached };
            }

            if (signal?.aborted) throw new NetworkError('aborted');

            // Layer 2 — OFF world
            const offResult = await lookupOFF(barcode, lang, signal);
            if (offResult) {
                if (telegramId) void cacheToSupabase(offResult, telegramId);
                setCached(key, offResult);
                return { ok: true, data: offResult };
            }

            if (signal?.aborted) throw new NetworkError('aborted');

            // Layer 3 — Backend
            const upc = await lookupBackend(barcode, signal);
            if (!upc) {
                setCached(key, null);
                return { ok: true, data: null };
            }

            // Backend nutrition topgan bo'lsa — darrov qaytar
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
                if (telegramId) void cacheToSupabase(full, telegramId);
                setCached(key, full);
                return { ok: true, data: full };
            }

            if (signal?.aborted) throw new NetworkError('aborted');

            // Layer 4 — OFF name search
            const nutrition = await searchOFFByName(upc.name, signal);
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
                if (telegramId) void cacheToSupabase(full, telegramId);
                setCached(key, full);
                return { ok: true, data: full };
            }

            // Layer 5 — faqat nom bilan (manual entry pre-filled)
            const skeleton: OFFProduct = {
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
            // Skeleton'ni cache qilmaymiz — foydalanuvchi to'ldirishi kerak
            return { ok: true, data: skeleton };
        } catch (err) {
            const code =
                err instanceof NetworkError || (err instanceof Error && err.name === 'AbortError')
                    ? 'network'
                    : 'database';
            return { ok: false, error: toLokmaError(err, code) };
        } finally {
            barcodeInflight.delete(key);
        }
    })();

    barcodeInflight.set(key, promise);
    return promise;
}

// ============================================================
// PUBLIC: saveUserProduct
// ⚠️ wrapPgResult ISHLATILMAYDI — upsert uchun error to'g'ridan-to'g'ri tekshiramiz.
//    `.select().single()` bilan ham wrapPgResult ba'zan `data: null` bilan false-positive
//    beradi (RLS yoki row not visible). Xavfsizroq: error tekshirish + data null-check.
// ============================================================
export async function saveUserProduct(
    input: UserProductInput,
    telegramId: number
): Promise<Result<OFFProduct>> {
    // Input validation
    if (!input.barcode || !input.name) {
        return {
            ok: false,
            error: toLokmaError(
                new Error("Barcode va nomi majburiy"),
                'validation'
            ),
        };
    }
    if (!Number.isFinite(input.kcal_per_100g) || input.kcal_per_100g < 0) {
        return {
            ok: false,
            error: toLokmaError(
                new Error("Kaloriya noto'g'ri"),
                'validation'
            ),
        };
    }
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
        return {
            ok: false,
            error: toLokmaError(
                new Error("Telegram ID noto'g'ri"),
                'validation'
            ),
        };
    }

    try {
        const { data, error } = await supabase
            .from('lokma_products')
            .upsert(
                {
                    barcode: input.barcode,
                    name: input.name,
                    brand: input.brand || null,
                    kcal_per_100g: input.kcal_per_100g,
                    protein_per_100g: input.protein_per_100g ?? 0,
                    fat_per_100g: input.fat_per_100g ?? 0,
                    carbs_per_100g: input.carbs_per_100g ?? 0,
                    contributed_by_telegram_id: telegramId,
                    source: 'user',
                },
                { onConflict: 'barcode' }
            )
            .select()
            .single();

        if (error) {
            return { ok: false, error: toLokmaError(error, 'database') };
        }
        if (!data) {
            return {
                ok: false,
                error: toLokmaError(
                    new Error("Mahsulot saqlandi lekin qaytarilmadi"),
                    'database'
                ),
            };
        }

        const product: OFFProduct = {
            barcode: String(data.barcode),
            name: String(data.name),
            brand: data.brand ? String(data.brand) : undefined,
            kcal_per_100g: Number(data.kcal_per_100g),
            protein_per_100g: Number(data.protein_per_100g),
            carbs_per_100g: Number(data.carbs_per_100g),
            fat_per_100g: Number(data.fat_per_100g),
            source: 'user',
        };

        // Yangi cache — barcha lang variantlariga
        (['uz-Latn', 'uz-Cyrl', 'ru', 'en'] as Lang[]).forEach(l => {
            setCached(cacheKey(product.barcode, l), product);
        });

        return { ok: true, data: product };
    } catch (err) {
        return { ok: false, error: toLokmaError(err, 'database') };
    }
}