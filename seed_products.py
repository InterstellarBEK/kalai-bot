"""
Lokma seed script — Open Food Facts'dan CIS region + RU keyword mahsulotlarini
lokma_products jadvaliga yuklash.

Ishga tushirish:
    python seed_products.py
"""
import os
import time
import requests
from dotenv import load_dotenv
from postgrest import SyncPostgrestClient

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # service_role kerak (RLS bypass)
ADMIN_TG_ID = 0  # 0 = system seed

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("SUPABASE_URL va SUPABASE_KEY .env'da bo'lishi kerak")

db = SyncPostgrestClient(
    f"{SUPABASE_URL}/rest/v1",
    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
)

# CIS countries — O'zbek bozorida bor mahsulotlar shu yerda
COUNTRIES = ["uzbekistan", "russia", "belarus", "kazakhstan", "kyrgyzstan", "tajikistan"]
PAGE_SIZE = 100
MAX_PAGES_PER_COUNTRY = 30  # 30 × 100 = 3,000 ta mahsulot har country
MAX_PAGES_PER_KEYWORD = 10  # 10 × 100 = 1,000 har keyword

# Rus tilida keng tarqalgan mahsulot kategoriyalari + brendlar
RU_KEYWORDS = [
    # Sut mahsulotlari
    "молоко", "кефир", "йогурт", "сметана", "творог", "сыр", "масло сливочное",
    "ряженка", "снежок", "айран",
    # Non va shirinliklar
    "хлеб", "батон", "печенье", "вафли", "пряники", "конфеты", "шоколад",
    "зефир", "халва", "торт",
    # Ichimliklar
    "сок", "вода", "газированный напиток", "чай", "кофе", "квас", "морс",
    # Go'sht
    "колбаса", "сосиски", "ветчина", "тушёнка", "пельмени", "котлеты",
    # Don va makaron
    "крупа", "гречка", "рис", "макароны", "мука", "сахар", "соль", "овсянка",
    # Boshqa
    "майонез", "кетчуп", "масло подсолнечное", "консервы рыбные",
    "мороженое", "сухарики", "чипсы", "семечки", "орехи",
    # Mashhur MDH brendlar
    "Простоквашино", "Домик в деревне", "Чудо", "Активиа", "Растишка",
    "Альпен Голд", "Милка", "Нестле", "Danone", "Веселый молочник",
]

OFF_BASE = "https://world.openfoodfacts.org/cgi/search.pl"


def fetch_by_country(country: str, page: int, retries: int = 4):
    params = {
        "action": "process",
        "tagtype_0": "countries",
        "tag_contains_0": "contains",
        "tag_0": country,
        "page_size": PAGE_SIZE,
        "page": page,
        "json": 1,
        "fields": "code,product_name,product_name_en,product_name_ru,brands,nutriments,serving_quantity",
    }
    return _fetch_with_retry(params, retries, f"{country} p{page}")


def fetch_by_keyword(keyword: str, page: int, retries: int = 4):
    params = {
        "search_terms": keyword,
        "search_simple": 1,
        "action": "process",
        "page_size": PAGE_SIZE,
        "page": page,
        "json": 1,
        "fields": "code,product_name,product_name_en,product_name_ru,brands,nutriments,serving_quantity",
    }
    return _fetch_with_retry(params, retries, f"'{keyword}' p{page}")


def _fetch_with_retry(params: dict, retries: int, label: str):
    for attempt in range(retries):
        try:
            r = requests.get(OFF_BASE, params=params, timeout=45,
                             headers={"User-Agent": "LokmaBot/1.0 (https://lokma.uz)"})
            if r.status_code == 503:
                wait = (attempt + 1) * 8
                print(f"  ⏳ 503 — kutamiz {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json().get("products", [])
        except Exception as e:
            if attempt == retries - 1:
                print(f"  ❌ {label} error: {e}")
                return []
            time.sleep(5)
    return []


def transform(p: dict) -> dict | None:
    code = (p.get("code") or "").strip()
    if not code or not code.isdigit() or len(code) < 6:
        return None
    name = p.get("product_name_ru") or p.get("product_name") or p.get("product_name_en")
    if not name or len(name.strip()) < 2:
        return None

    n = p.get("nutriments") or {}
    kcal = n.get("energy-kcal_100g")
    if kcal is None and n.get("energy_100g"):
        kcal = n["energy_100g"] / 4.184
    if not kcal or kcal <= 0:
        return None

    brand = None
    if p.get("brands"):
        brand = p["brands"].split(",")[0].strip()[:60]

    return {
        "barcode": code,
        "name": name.strip()[:120],
        "brand": brand,
        "kcal_per_100g": round(float(kcal)),
        "protein_per_100g": round(float(n.get("proteins_100g") or 0), 1),
        "fat_per_100g": round(float(n.get("fat_100g") or 0), 1),
        "carbs_per_100g": round(float(n.get("carbohydrates_100g") or 0), 1),
        "contributed_by_telegram_id": ADMIN_TG_ID,
        "source": "off",
    }


def upsert_batch(rows: list[dict]):
    if not rows:
        return 0
    try:
        db.from_("lokma_products").upsert(rows, on_conflict="barcode").execute()
        return len(rows)
    except Exception as e:
        print(f"  ❌ upsert error: {e}")
        return 0


def main():
    seen_codes: set[str] = set()
    total_inserted = 0

    # 1-bosqich: country-based
    for country in COUNTRIES:
        print(f"\n🌍 {country.upper()}")
        country_count = 0
        for page in range(1, MAX_PAGES_PER_COUNTRY + 1):
            products = fetch_by_country(country, page)
            if not products:
                break

            batch = []
            for p in products:
                row = transform(p)
                if not row:
                    continue
                if row["barcode"] in seen_codes:
                    continue
                seen_codes.add(row["barcode"])
                batch.append(row)

            inserted = upsert_batch(batch)
            country_count += inserted
            total_inserted += inserted
            print(f"  p{page}: {len(products)} fetched → {inserted} new (total: {total_inserted})")

            if len(products) < PAGE_SIZE:
                break
            time.sleep(2)

        print(f"  ✅ {country}: {country_count} mahsulot")

    # 2-bosqich: keyword-based (rus tilida)
    print(f"\n\n🔍 RU KEYWORDS ({len(RU_KEYWORDS)} ta)")
    for kw in RU_KEYWORDS:
        kw_count = 0
        for page in range(1, MAX_PAGES_PER_KEYWORD + 1):
            products = fetch_by_keyword(kw, page)
            if not products:
                break

            batch = []
            for p in products:
                row = transform(p)
                if not row:
                    continue
                if row["barcode"] in seen_codes:
                    continue
                seen_codes.add(row["barcode"])
                batch.append(row)

            inserted = upsert_batch(batch)
            kw_count += inserted
            total_inserted += inserted

            if len(products) < PAGE_SIZE:
                break
            time.sleep(2)

        print(f"  '{kw}': +{kw_count} (total: {total_inserted})")

    print(f"\n🎉 YAKUN: {total_inserted} ta unique mahsulot lokma_products'ga yuklandi")


if __name__ == "__main__":
    main()