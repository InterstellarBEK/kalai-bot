# gemini_food.py
import os
import json
import sys
import time
from google import genai
from dotenv import load_dotenv
from PIL import Image

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("XATO: .env faylida GEMINI_API_KEY topilmadi!")
    print(".env faylini och va shu qatorni qo'sh: GEMINI_API_KEY=...")
    sys.exit(1)

client = genai.Client(api_key=api_key)

PROMPT = """Sen O'zbek ovqat tahlilchisisan. Rasmdagi ovqatni aniqla.

Faqat JSON qaytar, boshqa hech narsa yo'q:
{
  "food_name": "ovqat nomi o'zbekcha",
  "estimated_grams": 250,
  "calories": 400,
  "protein": 12,
  "fat": 18,
  "carbs": 45,
  "confidence": "high"
}

Qoidalar:
- food_name: o'zbekcha nom (osh, manti, somsa, lag'mon, shashlik, shurva, norin, dimlama, ...)
- estimated_grams: porsiyaning taxminiy og'irligi grammda (50-500)
- calories: butun porsiya uchun jami kaloriya
- protein/fat/carbs: gramm (butun porsiya)
- confidence: "high" | "medium" | "low"
- Rasmda ovqat yo'q bo'lsa: {"food_name": null, "error": "ovqat aniqlanmadi"}
"""


def analyze_food_image(image_path: str, max_retries: int = 3) -> dict:
    img = Image.open(image_path)
    last_error = None

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
               model="gemini-2.5-flash-lite",
                contents=[PROMPT, img]
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
            # 503/UNAVAILABLE/500 — modeli band, qayta urinish
            if any(code in err for code in ("503", "UNAVAILABLE", "500")):
                if attempt < max_retries - 1:
                    time.sleep(2 * (attempt + 1))  # 2s, 4s, 6s
                    continue
            raise

    raise last_error


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Foydalanish: python gemini_food.py <rasm_yo'li>")
        sys.exit(1)
    result = analyze_food_image(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))