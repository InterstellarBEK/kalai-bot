import os
import json
import sys
import time
from google import genai
from google.genai import types
from dotenv import load_dotenv
from PIL import Image

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("XATO: .env faylida GEMINI_API_KEY topilmadi!")
    print(".env faylini och va shu qatorni qo'sh: GEMINI_API_KEY=...")
    sys.exit(1)

client = genai.Client(api_key=api_key)

PROMPT = """Sen O'zbek ovqat tahlilchisisan. Rasmdagi ovqatni aniqla va STANDART qiymatlarni qaytar.

QAT'IY QOIDA: ovqatni aniqlaganingda quyidagi standart jadvaldan foydalan. Sen har safar bir xil ovqat uchun BIR XIL natija qaytarishing shart.

STANDART JADVAL (1 kishilik porsiya):
- osh: 300g, 540 kcal, 18g protein, 22g fat, 65g carbs
- dimlama: 350g, 490 kcal, 28g protein, 24g fat, 38g carbs
- manti (4 dona): 280g, 560 kcal, 24g protein, 28g fat, 50g carbs
- somsa (1 dona): 150g, 410 kcal, 14g protein, 22g fat, 38g carbs
- lag'mon: 400g, 480 kcal, 22g protein, 18g fat, 58g carbs
- shashlik (2 sixcha): 200g, 540 kcal, 38g protein, 42g fat, 2g carbs
- shurva: 400g, 320 kcal, 18g protein, 14g fat, 30g carbs
- norin: 300g, 540 kcal, 30g protein, 22g fat, 55g carbs
- chuchvara: 300g, 600 kcal, 26g protein, 24g fat, 60g carbs
- mastava: 400g, 360 kcal, 16g protein, 12g fat, 48g carbs
- non (1 dona): 150g, 390 kcal, 12g protein, 4g fat, 78g carbs

Agar porsiya jadvaldagidan kichik/katta bo'lsa — proporsional ko'paytir/kamaytir.
Jadvalda yo'q ovqat bo'lsa — o'zing baholang, lekin har safar bir xil javob ber.

Faqat JSON qaytar:
{
  "food_name": "ovqat nomi o'zbekcha kichik harf",
  "estimated_grams": 250,
  "calories": 400,
  "protein": 12,
  "fat": 18,
  "carbs": 45,
  "confidence": "high"
}

- food_name: kichik harfda (osh, dimlama, manti, somsa, lag'mon, ...)
- estimated_grams: butun son (50-600)
- calories/protein/fat/carbs: butun son, JADVALDAN olingan
- confidence: "high" agar jadvalda bor | "medium" agar yo'q
- Ovqat yo'q bo'lsa: {"food_name": null, "error": "ovqat aniqlanmadi"}
"""

LANG_INSTRUCTIONS = {
    "uz": "",
    "ru": '\n\nВАЖНО: верни поле "food_name" на русском языке маленькими буквами (например: "плов", "манты", "самса", "лагман", "шашлык", "шурпа", "норин", "чучвара", "мастава", "хлеб", "димлама"). Все остальные поля — без изменений.',
    "en": '\n\nIMPORTANT: return "food_name" in English lowercase (e.g. "pilaf", "manti", "samsa", "lagman", "kebab", "shurpa", "norin", "chuchvara", "mastava", "bread", "dimlama"). All other fields stay the same.',
}

GENERATION_CONFIG = types.GenerateContentConfig(
    temperature=0,
    response_mime_type="application/json",
)


def analyze_food_image(image_path: str, lang: str = "uz", max_retries: int = 3) -> dict:
    img = Image.open(image_path)
    prompt = PROMPT + LANG_INSTRUCTIONS.get(lang, "")
    last_error = None

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-lite",
                contents=[prompt, img],
                config=GENERATION_CONFIG,
            )
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            return json.loads(text)
        except Exception as e:
            last_error = e
            err = str(e)
            if any(code in err for code in ("503", "UNAVAILABLE", "500")):
                if attempt < max_retries - 1:
                    time.sleep(2 * (attempt + 1))
                    continue
            raise

    raise last_error


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Foydalanish: python gemini_food.py <rasm_yo'li>")
        sys.exit(1)
    result = analyze_food_image(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))