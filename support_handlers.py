"""
Support handler — FAQ tugmalari + Gemini AI fallback + admin eskalatsiya.
Foydalanuvchi /support yozsa yoki menyudan tanlasa, inline tugmalar chiqadi.
"Boshqa savol" tugmasi → AI suhbat (Gemini 2.5 Flash Lite).
"""
import os
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from aiogram import Dispatcher, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from google import genai
from google.genai import types


ADMIN_HANDLE = "@Khalik0vv"
GEMINI_MODEL = "gemini-2.5-flash-lite"
MAX_QUESTIONS_FREE = 5
MAX_QUESTIONS_PREMIUM = 20

# In-memory rate limit (kuniga). Production'da Supabase'ga ko'chiriladi.
# Format: { telegram_id: (date_str, count) }
_rate_limit: dict[int, tuple[str, int]] = {}


# ─────────── Gemini client ───────────
_api_key = os.getenv("GEMINI_API_KEY")
_client = genai.Client(api_key=_api_key) if _api_key else None


# ─────────── SYSTEM PROMPT (Lokma bilimi) ───────────
SYSTEM_PROMPT = """Sen "Lokma" ilovasining yordamchi botisan. Lokma — O'zbek tilidagi kaloriya kuzatish Telegram Mini App.

DOIM o'zbek tilida (lotin yozuvi) javob ber. Qisqa, do'stona, aniq. Maksimum 4-5 jumla.

LOKMA HAQIDA TO'LIQ MA'LUMOT:

1) PREMIUM REJALAR (UZS):
- 7 kun: 5 000 UZS
- 30 kun: 15 000 UZS
- 365 kun: 120 000 UZS (eng foydali)

2) PREMIUM NIMA BERADI:
- Cheksiz AI foto tahlili (bepulda 3/kun)
- Ramazon rejimi (sahar/iftor vaqtlari, suv eslatmasi)
- Adaptiv kaloriya maqsadi (haftalik o'zgaradi)
- Eksport (CSV/PDF)
- Barcha skinlar (21 ta)

3) TRIAL:
- Har yangi foydalanuvchi 3 kunlik bepul Premium oladi (avtomatik)
- Trial tugagach limit qaytadi
- Ilovada Profile → Premium kartochkasida vaqt ko'rsatiladi

4) TO'LOV (P2P):
- Ilovada Premium tanla → reja tanla → karta ko'rsatiladi
- Aynan ko'rsatilgan summani yubor (oxirgi 3 raqam muhim — bu sizning to'lovingizni aniqlash uchun)
- 30 daqiqa ichida to'la
- Chek skrinini yukla → admin 5-30 daqiqada tasdiqlaydi
- Premium avtomatik aktivlashadi
- Click/Payme tez orada qo'shiladi (YaTT ochilgach)

5) FOTO AI:
- Botga taom rasmi yuboriladi
- Gemini Vision tanib, kaloriya/protein/yog'/uglevod hisoblaydi
- O'zbek taomlari uchun standart jadval (osh, manti, somsa, lag'mon, shurva...)
- Bepul: 3/kun, Premium: cheksiz
- Yorqin joyda, taom to'liq ko'rinadigan rasm yaxshi
- "PHOTO_INVALID_DIMENSIONS" xato — rasm juda katta/kichik

6) ASOSIY FUNKSIYALAR:
- Kunlik kaloriya/makro dashboard
- Suv kuzatish
- Vazn kuzatish
- Ro'za (intermittent fasting) timer
- Shtrix-kod skaner (Open Food Facts)
- Mahalliy taomlar bazasi
- Streak, achievements, daily challenges
- Referral (do'st taklif → bonus)
- 4 til: o'zbek lotin/kirill, rus, ingliz
- Dark mode

7) TEXNIK:
- Telegram Mini App (ilova ichida ochiladi)
- Render serverda, ba'zan 15-20 sekund "uyg'onish" kerak
- Supabase ma'lumotlar bazasi

QOIDALAR:
- Faqat Lokma haqida javob ber. Boshqa mavzu (umumiy AI, boshqa ilovalar, siyosat, dinii masalalar...) so'rasa: "Bu savolga javob bera olmayman, Lokma haqida so'rang"
- Agar javobni aniq bilmasangiz: "Bu savolga aniq javob bera olmayman. Iltimos, {ADMIN_HANDLE}'ga yozing"
- Hech qachon narx, sana, kafolat haqida o'zingdan o'ylab gapir
- Refund, qaytarish, bug — adminga yo'naltir
""".replace("{ADMIN_HANDLE}", ADMIN_HANDLE)


# ─────────── FSM ───────────
class SupportStates(StatesGroup):
    waiting_question = State()


# ─────────── FAQ MATNLARI ───────────
FAQ_PREMIUM = (
    "💎 <b>Premium haqida</b>\n\n"
    "<b>Narxlar:</b>\n"
    "• 7 kun — <b>5 000 UZS</b>\n"
    "• 30 kun — <b>15 000 UZS</b>\n"
    "• 365 kun — <b>120 000 UZS</b> <i>(eng foydali)</i>\n\n"
    "<b>Premium nima beradi?</b>\n"
    "• Cheksiz AI foto tahlili (bepulda 3/kun)\n"
    "• Ramazon rejimi to'liq\n"
    "• Adaptiv kaloriya maqsadi\n"
    "• Eksport (CSV/PDF)\n"
    "• Barcha skinlar\n\n"
    "<b>Qanday olish?</b>\n"
    "Ilovada Profile → Premium tugma → reja tanlang → to'lang."
)

FAQ_PHOTO = (
    "📸 <b>Foto AI haqida</b>\n\n"
    "<b>Qanday ishlaydi?</b>\n"
    "Botga taom rasmini yuboring. AI taomni tanib, kaloriya va makro hisoblaydi.\n\n"
    "<b>Limit:</b>\n"
    "• Bepul — kuniga 3 ta\n"
    "• Premium — cheksiz\n\n"
    "<b>Aniqlik uchun:</b>\n"
    "• Yorqin joyda suratga oling\n"
    "• Taomni to'liq ko'rsating\n"
    "• Bitta rasmda 1-3 ta taom\n\n"
    "<b>Xato qaytsa:</b>\n"
    "• \"PHOTO_INVALID_DIMENSIONS\" — rasm juda katta yoki kichik. Qaytadan oling.\n"
    "• \"AI_TIMEOUT\" — internet sekin, qaytadan urinib ko'ring."
)

FAQ_PAYMENT = (
    "💳 <b>To'lov muammosi</b>\n\n"
    "<b>Chek yukladim, premium kelmadi?</b>\n"
    "Admin 5-30 daqiqada tasdiqlaydi. Sabr qiling.\n\n"
    "<b>Summa noto'g'ri yuborildim?</b>\n"
    "Aynan ko'rsatilgan summani yuboring (oxirgi 3 raqam muhim). Xato yuborgan bo'lsangiz, "
    f"qo'shimcha to'lov yoki refund uchun {ADMIN_HANDLE}'ga yozing.\n\n"
    "<b>Karta egasi nima uchun \"Watson X\"?</b>\n"
    "Bu rasmiy YaTT ochilgunga qadar shaxsiy karta. Tez orada Click/Payme bo'ladi.\n\n"
    "<b>Vaqt tugadi (30 daqiqa)?</b>\n"
    "Ilovada qaytadan to'lov boshlang — yangi summa va suffiks beriladi."
)

FAQ_TRIAL = (
    "🎁 <b>Trial (sinov) haqida</b>\n\n"
    "Har yangi foydalanuvchi <b>3 kunlik bepul Premium</b> oladi — avtomatik.\n\n"
    "<b>Trial tugagach:</b>\n"
    "• Limit qaytadi (foto 3/kun)\n"
    "• Premium funksiyalar yopiladi\n"
    "• Davom etish uchun reja sotib oling\n\n"
    "<b>Trial qachon tugashini bilish:</b>\n"
    "Ilovada Profile → Premium kartochkasida vaqt ko'rsatiladi."
)


# ─────────── Helpers ───────────
def _menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💎 Premium savollar", callback_data="sup:premium")],
        [InlineKeyboardButton(text="📸 Foto AI",          callback_data="sup:photo")],
        [InlineKeyboardButton(text="💳 To'lov muammosi", callback_data="sup:payment")],
        [InlineKeyboardButton(text="🎁 Trial (3 kun)",   callback_data="sup:trial")],
        [InlineKeyboardButton(text="💬 Boshqa savol",    callback_data="sup:other")],
    ])


def _back_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="👍 Ha", callback_data="sup:ok"),
            InlineKeyboardButton(text="👎 Yo'q", callback_data="sup:no"),
        ],
        [InlineKeyboardButton(text="◀️ Orqaga", callback_data="sup:menu")],
    ])


def _admin_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"💬 {ADMIN_HANDLE}'ga yozish",
                              url=f"https://t.me/{ADMIN_HANDLE.lstrip('@')}")],
        [InlineKeyboardButton(text="◀️ Orqaga", callback_data="sup:menu")],
    ])


def _ai_answer_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="👍 Yordam berdi", callback_data="sup:ok"),
            InlineKeyboardButton(text="👎 Yo'q", callback_data="sup:no"),
        ],
        [InlineKeyboardButton(text="💬 Yana savol bering", callback_data="sup:other")],
        [InlineKeyboardButton(text="◀️ Menyu", callback_data="sup:menu")],
    ])


async def _check_premium(db, telegram_id: int) -> bool:
    """Premium statusni Supabase'dan tekshir"""
    try:
        res = await db.from_("users").select("premium_until").eq("telegram_id", telegram_id).single().execute()
        until = res.data.get("premium_until") if res.data else None
        if not until:
            return False
        # ISO format → datetime
        dt = datetime.fromisoformat(until.replace("Z", "+00:00"))
        return dt > datetime.now(timezone.utc)
    except Exception:
        return False


def _check_rate_limit(telegram_id: int, is_premium: bool) -> tuple[bool, int]:
    """Returns (allowed, remaining_today)"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    limit = MAX_QUESTIONS_PREMIUM if is_premium else MAX_QUESTIONS_FREE

    stored = _rate_limit.get(telegram_id)
    if stored and stored[0] == today:
        used = stored[1]
    else:
        used = 0

    if used >= limit:
        return False, 0

    _rate_limit[telegram_id] = (today, used + 1)
    return True, limit - used - 1


async def _ask_gemini(question: str) -> str:
    """Gemini'ga savol yuborib javob ol. Retry + fallback model."""
    if not _client:
        return f"AI hozircha sozlanmagan. Iltimos, {ADMIN_HANDLE}'ga yozing."

    # Tartib: avval lite (tez+arzon), 503 bo'lsa asosiy flash'ga o'tish
    models_to_try = [GEMINI_MODEL, "gemini-2.5-flash"]

    def _sync_call(model_name: str):
        response = _client.models.generate_content(
            model=model_name,
            contents=[
                types.Content(role="user", parts=[types.Part(text=question)])
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.3,
                max_output_tokens=500,
            ),
        )
        return response.text or ""

    last_error = None
    for attempt, model_name in enumerate(models_to_try):
        # Har model uchun 2 marta urinish (exponential backoff)
        for retry in range(2):
            try:
                text = await asyncio.wait_for(
                    asyncio.to_thread(_sync_call, model_name),
                    timeout=15.0,
                )
                text = (text or "").strip()
                if text:
                    return text
            except asyncio.TimeoutError:
                last_error = "timeout"
            except Exception as e:
                err_str = str(e)
                last_error = err_str
                print(f"[support AI] {model_name} retry={retry} error: {err_str}", flush=True)
                # 503/429/UNAVAILABLE → retry yoki keyingi modelga o'tish
                if "503" in err_str or "429" in err_str or "UNAVAILABLE" in err_str:
                    if retry == 0:
                        await asyncio.sleep(1.5)  # qisqa kutish
                        continue
                    else:
                        break  # keyingi modelga o'tish
                else:
                    # Boshqa xato — to'g'ridan adminga
                    return f"⚠️ Texnik xato yuz berdi. {ADMIN_HANDLE}'ga yozing."

    # Hammasi muvaffaqiyatsiz
    print(f"[support AI] all models failed. last_error={last_error}", flush=True)
    return (
        "⏱ AI hozir band (Google serverlarida yuklama). "
        f"Bir necha daqiqadan keyin qayta urining yoki {ADMIN_HANDLE}'ga yozing."
    )


# ─────────── Setup ───────────
def setup_support(dp: Dispatcher, db=None):
    """bot.py'da chaqiriladi: setup_support(dp, db)"""

    # ─── /support komanda ───
    @dp.message(Command("support"))
    async def cmd_support(message: Message, state: FSMContext):
        await state.clear()
        await message.answer(
            "👋 <b>Lokma yordam markazi</b>\n\n"
            "Savolingiz bo'yicha bo'limni tanlang:",
            parse_mode="HTML",
            reply_markup=_menu_kb(),
        )

    # ─── Menyuga qaytish ───
    @dp.callback_query(F.data == "sup:menu")
    async def cb_menu(call: CallbackQuery, state: FSMContext):
        await state.clear()
        try:
            await call.message.edit_text(
                "👋 <b>Lokma yordam markazi</b>\n\n"
                "Savolingiz bo'yicha bo'limni tanlang:",
                parse_mode="HTML",
                reply_markup=_menu_kb(),
            )
        except Exception:
            pass
        await call.answer()

    # ─── FAQ tugmalar ───
    @dp.callback_query(F.data == "sup:premium")
    async def cb_premium(call: CallbackQuery):
        await call.message.edit_text(FAQ_PREMIUM, parse_mode="HTML", reply_markup=_back_kb())
        await call.answer()

    @dp.callback_query(F.data == "sup:photo")
    async def cb_photo(call: CallbackQuery):
        await call.message.edit_text(FAQ_PHOTO, parse_mode="HTML", reply_markup=_back_kb())
        await call.answer()

    @dp.callback_query(F.data == "sup:payment")
    async def cb_payment(call: CallbackQuery):
        await call.message.edit_text(FAQ_PAYMENT, parse_mode="HTML", reply_markup=_back_kb())
        await call.answer()

    @dp.callback_query(F.data == "sup:trial")
    async def cb_trial(call: CallbackQuery):
        await call.message.edit_text(FAQ_TRIAL, parse_mode="HTML", reply_markup=_back_kb())
        await call.answer()

    # ─── "Boshqa savol" — AI rejimi ochiladi ───
    @dp.callback_query(F.data == "sup:other")
    async def cb_other(call: CallbackQuery, state: FSMContext):
        await state.set_state(SupportStates.waiting_question)
        try:
            await call.message.edit_text(
                "💬 <b>AI yordamchi</b>\n\n"
                "Savolingizni yozing — Lokma haqida hamma narsa biladi.\n\n"
                "<i>Misol: \"Premium qancha turadi?\" yoki \"Foto AI nima uchun ishlamayapti?\"</i>\n\n"
                f"Murakkab yoki shaxsiy masalalar uchun → {ADMIN_HANDLE}",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="◀️ Bekor qilish", callback_data="sup:menu")],
                ]),
            )
        except Exception:
            pass
        await call.answer()

    # ─── AI suhbat — matn xabari ───
    @dp.message(SupportStates.waiting_question, F.text)
    async def handle_ai_question(message: Message, state: FSMContext):
        question = (message.text or "").strip()

        if len(question) < 3:
            await message.answer("Savol juda qisqa. Batafsilroq yozing.")
            return

        if len(question) > 500:
            await message.answer("Savol juda uzun (max 500 belgi). Qisqaroq yozing.")
            return

        # Premium tekshiruv (db bo'lsa)
        is_premium = False
        if db is not None:
            is_premium = await _check_premium(db, message.from_user.id)

        # Rate limit
        allowed, remaining = _check_rate_limit(message.from_user.id, is_premium)
        if not allowed:
            limit = MAX_QUESTIONS_PREMIUM if is_premium else MAX_QUESTIONS_FREE
            await message.answer(
                f"📊 Kunlik AI savol limiti tugadi ({limit}/kun).\n\n"
                f"Ertaga qaytadan urinib ko'ring yoki {ADMIN_HANDLE}'ga yozing.",
                reply_markup=_admin_kb(),
            )
            await state.clear()
            return

        # Typing indikator
        try:
            await message.bot.send_chat_action(message.chat.id, "typing")
        except Exception:
            pass

        # Gemini'ga yuborish
        answer = await _ask_gemini(question)

        # Limit haqida footer
        footer = f"\n\n<i>Bugun yana {remaining} ta savol bera olasiz.</i>" if remaining > 0 else ""

        await message.answer(
            f"🤖 <b>AI javob:</b>\n\n{answer}{footer}",
            parse_mode="HTML",
            reply_markup=_ai_answer_kb(),
        )
        await state.clear()

    # ─── Feedback ───
    @dp.callback_query(F.data == "sup:ok")
    async def cb_ok(call: CallbackQuery):
        await call.answer("Rahmat! 🙏", show_alert=False)
        try:
            await call.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="◀️ Menyuga", callback_data="sup:menu")]]
            ))
        except Exception:
            pass

    @dp.callback_query(F.data == "sup:no")
    async def cb_no(call: CallbackQuery):
        await call.message.edit_text(
            "😔 Kechirasiz, javob yetarli bo'lmadi.\n\n"
            f"{ADMIN_HANDLE}'ga to'g'ridan-to'g'ri yozing — "
            "savolingizni batafsil ko'rib chiqamiz.",
            parse_mode="HTML",
            reply_markup=_admin_kb(),
        )
        await call.answer()