"""
Support handler — FAQ tugmalari + Gemini AI fallback + admin eskalatsiya.
4 til: uz-Latn (default), uz-Cyrl, ru, en.
Foydalanuvchi /support yozsa yoki menyudan tanlasa, inline tugmalar chiqadi.
"Boshqa savol" tugmasi → AI suhbat (Gemini 2.5 Flash Lite).
"""
import os
import asyncio
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

# Qo'llab-quvvatlanadigan tillar
LANGS = ("uz-Latn", "uz-Cyrl", "ru", "en")
DEFAULT_LANG = "uz-Latn"

# In-memory rate limit (kuniga). { telegram_id: (date_str, count) }
_rate_limit: dict[int, tuple[str, int]] = {}

# Foydalanuvchi tanlagan til (sessiya davomida). { telegram_id: lang_code }
_user_lang: dict[int, str] = {}


# ─────────── Gemini client ───────────
_api_key = os.getenv("GEMINI_API_KEY")
_client = genai.Client(api_key=_api_key) if _api_key else None


# ─────────── Til aniqlash ───────────
def _detect_lang(telegram_lang_code: str | None, telegram_id: int) -> str:
    """Avval saqlangan tanlovni qaytaradi, bo'lmasa Telegram language_code'dan."""
    if telegram_id in _user_lang:
        return _user_lang[telegram_id]
    code = (telegram_lang_code or "").lower()
    if code.startswith("ru"):
        return "ru"
    if code.startswith("en"):
        return "en"
    if code.startswith("uz"):
        return "uz-Latn"
    return DEFAULT_LANG


# ─────────── SYSTEM PROMPT (universal, til ko'rsatma bilan) ───────────
LANG_NAME = {
    "uz-Latn": "Uzbek (Latin script)",
    "uz-Cyrl": "Uzbek (Cyrillic script)",
    "ru": "Russian",
    "en": "English",
}


def _build_system_prompt(lang: str) -> str:
    lang_name = LANG_NAME.get(lang, "Uzbek (Latin script)")
    return f"""You are the support assistant for "Lokma" — an Uzbek-language calorie tracking Telegram Mini App.

ALWAYS reply in {lang_name}. Be short, friendly, precise. Maximum 4-5 sentences. Finish sentences fully — never cut off.

LOKMA INFORMATION:

1) PREMIUM PLANS (UZS):
- 7 days: 5,000 UZS
- 30 days: 15,000 UZS
- 365 days: 120,000 UZS (best value)

2) PREMIUM FEATURES:
- Unlimited AI photo analysis (free: 3/day)
- Ramadan mode (suhoor/iftar, water reminders)
- Adaptive calorie goal (weekly recalibration)
- Export (CSV/PDF)
- All skins (21 total)

3) TRIAL:
- Every new user gets 3-day free Premium automatically
- After trial: limits return
- Time shown in Profile → Premium card

4) PAYMENT (P2P):
- App → Premium → pick plan → card shown
- Send EXACT amount (last 3 digits matter — they identify your payment)
- Pay within 30 minutes
- Upload receipt screenshot → admin confirms in 5-30 min
- Premium activates automatically
- Click/Payme coming soon (after YaTT registration)

5) PHOTO AI:
- Send food photo to bot
- Gemini Vision detects food, calculates calories/protein/fat/carbs
- Uzbek dishes have standard table (osh, manti, somsa, lag'mon, shurva...)
- Free: 3/day, Premium: unlimited
- Best results: bright light, full dish visible
- "PHOTO_INVALID_DIMENSIONS" — image too big/small

6) MAIN FEATURES:
- Daily calorie/macro dashboard
- Water tracking, weight tracking
- Intermittent fasting timer
- Barcode scanner (Open Food Facts)
- Local foods database
- Streak, achievements, daily challenges
- Referral system
- 4 languages: Uzbek Latin/Cyrillic, Russian, English
- Dark mode

7) TECH:
- Telegram Mini App
- Render server, sometimes 15-20s "wake up"
- Supabase database

RULES:
- Answer any Lokma-related question: brand, features, prices, technical issues, food/nutrition.
- Answer general nutrition and calorie questions (user tracks in Lokma).
- REJECT only completely unrelated topics: politics, religion, other AI assistants, other companies.
- If you don't know: redirect to {ADMIN_HANDLE} in the user's language.
- Prices, dates, guarantees — only from data above.
- Refund, bugs, personal account issues — redirect to admin.
- Always finish your sentences completely.
"""


# ─────────── FSM ───────────
class SupportStates(StatesGroup):
    waiting_question = State()


# ═══════════════════════════════════════════════════════════
# TARJIMALAR (UI matnlar)
# ═══════════════════════════════════════════════════════════
TEXTS: dict[str, dict[str, str]] = {
    # ───────────── UZ LATIN ─────────────
    "uz-Latn": {
        "menu_title": "👋 <b>Lokma yordam markazi</b>\n\nSavolingiz bo'yicha bo'limni tanlang:",
        "btn_premium": "💎 Premium savollar",
        "btn_photo": "📸 Foto AI",
        "btn_payment": "💳 To'lov muammosi",
        "btn_trial": "🎁 Trial (3 kun)",
        "btn_other": "💬 Boshqa savol",
        "btn_change_lang": "🌐 Til / Language",
        "btn_back": "◀️ Orqaga",
        "btn_menu": "◀️ Menyu",
        "btn_yes": "👍 Ha",
        "btn_no": "👎 Yo'q",
        "btn_helped": "👍 Yordam berdi",
        "btn_no_help": "👎 Yo'q",
        "btn_ask_more": "💬 Yana savol bering",
        "btn_cancel": "◀️ Bekor qilish",
        "btn_msg_admin": f"💬 {ADMIN_HANDLE}'ga yozish",
        "ai_prompt": (
            "💬 <b>AI yordamchi</b>\n\n"
            "Savolingizni yozing — Lokma haqida hamma narsa biladi.\n\n"
            "<i>Misol: \"Premium qancha turadi?\" yoki \"Foto AI nima uchun ishlamayapti?\"</i>\n\n"
            f"Murakkab yoki shaxsiy masalalar uchun → {ADMIN_HANDLE}"
        ),
        "too_short": "Savol juda qisqa. Batafsilroq yozing.",
        "too_long": "Savol juda uzun (max 500 belgi). Qisqaroq yozing.",
        "rate_limit": "📊 Kunlik AI savol limiti tugadi ({limit}/kun).\n\nErtaga qaytadan urinib ko'ring yoki {admin}'ga yozing.",
        "ai_label": "🤖 <b>AI javob:</b>",
        "ai_footer": "<i>Bugun yana {n} ta savol bera olasiz.</i>",
        "thanks": "Rahmat! 🙏",
        "not_enough": (
            "😔 Kechirasiz, javob yetarli bo'lmadi.\n\n"
            f"{ADMIN_HANDLE}'ga to'g'ridan-to'g'ri yozing — savolingizni batafsil ko'rib chiqamiz."
        ),
        "ai_not_set": f"AI hozircha sozlanmagan. Iltimos, {ADMIN_HANDLE}'ga yozing.",
        "ai_tech_error": f"⚠️ Texnik xato yuz berdi. {ADMIN_HANDLE}'ga yozing.",
        "ai_busy": f"⏱ AI hozir band (Google serverlarida yuklama). Bir necha daqiqadan keyin qayta urining yoki {ADMIN_HANDLE}'ga yozing.",
        "lang_picker": "🌐 <b>Tilni tanlang / Choose language:</b>",
        "lang_changed": "✅ Til o'zgartirildi.",
        "faq_premium": (
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
        ),
        "faq_photo": (
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
        ),
        "faq_payment": (
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
        ),
        "faq_trial": (
            "🎁 <b>Trial (sinov) haqida</b>\n\n"
            "Har yangi foydalanuvchi <b>3 kunlik bepul Premium</b> oladi — avtomatik.\n\n"
            "<b>Trial tugagach:</b>\n"
            "• Limit qaytadi (foto 3/kun)\n"
            "• Premium funksiyalar yopiladi\n"
            "• Davom etish uchun reja sotib oling\n\n"
            "<b>Trial qachon tugashini bilish:</b>\n"
            "Ilovada Profile → Premium kartochkasida vaqt ko'rsatiladi."
        ),
    },

    # ───────────── UZ CYRILLIC ─────────────
    "uz-Cyrl": {
        "menu_title": "👋 <b>Локма ёрдам маркази</b>\n\nСаволингиз бўйича бўлимни танланг:",
        "btn_premium": "💎 Премиум саволлар",
        "btn_photo": "📸 Фото AI",
        "btn_payment": "💳 Тўлов муаммоси",
        "btn_trial": "🎁 Трайл (3 кун)",
        "btn_other": "💬 Бошқа савол",
        "btn_change_lang": "🌐 Тил / Language",
        "btn_back": "◀️ Орқага",
        "btn_menu": "◀️ Меню",
        "btn_yes": "👍 Ҳа",
        "btn_no": "👎 Йўқ",
        "btn_helped": "👍 Ёрдам берди",
        "btn_no_help": "👎 Йўқ",
        "btn_ask_more": "💬 Яна савол беринг",
        "btn_cancel": "◀️ Бекор қилиш",
        "btn_msg_admin": f"💬 {ADMIN_HANDLE}'га ёзиш",
        "ai_prompt": (
            "💬 <b>AI ёрдамчи</b>\n\n"
            "Саволингизни ёзинг — Локма ҳақида ҳамма нарса билади.\n\n"
            "<i>Мисол: \"Премиум қанча туради?\" ёки \"Фото AI нима учун ишламаяпти?\"</i>\n\n"
            f"Мураккаб ёки шахсий масалалар учун → {ADMIN_HANDLE}"
        ),
        "too_short": "Савол жуда қисқа. Батафсилроқ ёзинг.",
        "too_long": "Савол жуда узун (макс 500 белги). Қисқароқ ёзинг.",
        "rate_limit": "📊 Кунлик AI савол лимити тугади ({limit}/кун).\n\nЭртага қайтадан уриниб кўринг ёки {admin}'га ёзинг.",
        "ai_label": "🤖 <b>AI жавоб:</b>",
        "ai_footer": "<i>Бугун яна {n} та савол бера оласиз.</i>",
        "thanks": "Раҳмат! 🙏",
        "not_enough": (
            "😔 Кечирасиз, жавоб етарли бўлмади.\n\n"
            f"{ADMIN_HANDLE}'га тўғридан-тўғри ёзинг — саволингизни батафсил кўриб чиқамиз."
        ),
        "ai_not_set": f"AI ҳозирча созланмаган. Илтимос, {ADMIN_HANDLE}'га ёзинг.",
        "ai_tech_error": f"⚠️ Техник хато юз берди. {ADMIN_HANDLE}'га ёзинг.",
        "ai_busy": f"⏱ AI ҳозир банд (Google серверларида юклама). Бир неча дақиқадан кейин қайта уринг ёки {ADMIN_HANDLE}'га ёзинг.",
        "lang_picker": "🌐 <b>Тилни танланг / Choose language:</b>",
        "lang_changed": "✅ Тил ўзгартирилди.",
        "faq_premium": (
            "💎 <b>Премиум ҳақида</b>\n\n"
            "<b>Нархлар:</b>\n"
            "• 7 кун — <b>5 000 UZS</b>\n"
            "• 30 кун — <b>15 000 UZS</b>\n"
            "• 365 кун — <b>120 000 UZS</b> <i>(энг фойдали)</i>\n\n"
            "<b>Премиум нима беради?</b>\n"
            "• Чексиз AI фото таҳлили (бепулда 3/кун)\n"
            "• Рамазон режими тўлиқ\n"
            "• Адаптив калория мақсади\n"
            "• Экспорт (CSV/PDF)\n"
            "• Барча скинлар\n\n"
            "<b>Қандай олиш?</b>\n"
            "Иловада Profile → Премиум тугма → режа танланг → тўланг."
        ),
        "faq_photo": (
            "📸 <b>Фото AI ҳақида</b>\n\n"
            "<b>Қандай ишлайди?</b>\n"
            "Ботга таом расмини юборинг. AI таомни таниб, калория ва макро ҳисоблайди.\n\n"
            "<b>Лимит:</b>\n"
            "• Бепул — кунига 3 та\n"
            "• Премиум — чексиз\n\n"
            "<b>Аниқлик учун:</b>\n"
            "• Ёрқин жойда суратга олинг\n"
            "• Таомни тўлиқ кўрсатинг\n"
            "• Битта расмда 1-3 та таом\n\n"
            "<b>Хато қайтса:</b>\n"
            "• \"PHOTO_INVALID_DIMENSIONS\" — расм жуда катта ёки кичик. Қайтадан олинг.\n"
            "• \"AI_TIMEOUT\" — интернет секин, қайтадан уриниб кўринг."
        ),
        "faq_payment": (
            "💳 <b>Тўлов муаммоси</b>\n\n"
            "<b>Чек юкладим, премиум келмади?</b>\n"
            "Админ 5-30 дақиқада тасдиқлайди. Сабр қилинг.\n\n"
            "<b>Сумма нотўғри юбордим?</b>\n"
            "Айнан кўрсатилган суммани юборинг (охирги 3 рақам муҳим). Хато юборган бўлсангиз, "
            f"қўшимча тўлов ёки рефунд учун {ADMIN_HANDLE}'га ёзинг.\n\n"
            "<b>Карта эгаси нима учун \"Watson X\"?</b>\n"
            "Бу расмий ЯТТ очилгунга қадар шахсий карта. Тез орада Click/Payme бўлади.\n\n"
            "<b>Вақт тугади (30 дақиқа)?</b>\n"
            "Иловада қайтадан тўлов бошланг — янги сумма ва суффикс берилади."
        ),
        "faq_trial": (
            "🎁 <b>Трайл (синов) ҳақида</b>\n\n"
            "Ҳар янги фойдаланувчи <b>3 кунлик бепул Премиум</b> олади — автоматик.\n\n"
            "<b>Трайл тугагач:</b>\n"
            "• Лимит қайтади (фото 3/кун)\n"
            "• Премиум функциялар ёпилади\n"
            "• Давом этиш учун режа сотиб олинг\n\n"
            "<b>Трайл қачон тугашини билиш:</b>\n"
            "Иловада Profile → Премиум карточкасида вақт кўрсатилади."
        ),
    },

    # ───────────── RUSSIAN ─────────────
    "ru": {
        "menu_title": "👋 <b>Центр поддержки Lokma</b>\n\nВыберите раздел по вашему вопросу:",
        "btn_premium": "💎 Вопросы по Premium",
        "btn_photo": "📸 Фото AI",
        "btn_payment": "💳 Проблема с оплатой",
        "btn_trial": "🎁 Триал (3 дня)",
        "btn_other": "💬 Другой вопрос",
        "btn_change_lang": "🌐 Язык / Language",
        "btn_back": "◀️ Назад",
        "btn_menu": "◀️ Меню",
        "btn_yes": "👍 Да",
        "btn_no": "👎 Нет",
        "btn_helped": "👍 Помогло",
        "btn_no_help": "👎 Нет",
        "btn_ask_more": "💬 Задать ещё вопрос",
        "btn_cancel": "◀️ Отмена",
        "btn_msg_admin": f"💬 Написать {ADMIN_HANDLE}",
        "ai_prompt": (
            "💬 <b>AI помощник</b>\n\n"
            "Напишите ваш вопрос — он знает всё о Lokma.\n\n"
            "<i>Пример: \"Сколько стоит Premium?\" или \"Почему не работает Фото AI?\"</i>\n\n"
            f"По сложным или личным вопросам → {ADMIN_HANDLE}"
        ),
        "too_short": "Вопрос слишком короткий. Напишите подробнее.",
        "too_long": "Вопрос слишком длинный (макс 500 символов). Сократите.",
        "rate_limit": "📊 Дневной лимит AI вопросов исчерпан ({limit}/день).\n\nПопробуйте завтра или напишите {admin}.",
        "ai_label": "🤖 <b>Ответ AI:</b>",
        "ai_footer": "<i>Сегодня вы можете задать ещё {n} вопросов.</i>",
        "thanks": "Спасибо! 🙏",
        "not_enough": (
            "😔 Извините, ответ не помог.\n\n"
            f"Напишите напрямую {ADMIN_HANDLE} — мы подробно разберём ваш вопрос."
        ),
        "ai_not_set": f"AI пока не настроен. Пожалуйста, напишите {ADMIN_HANDLE}.",
        "ai_tech_error": f"⚠️ Произошла техническая ошибка. Напишите {ADMIN_HANDLE}.",
        "ai_busy": f"⏱ AI сейчас занят (нагрузка на серверах Google). Попробуйте через несколько минут или напишите {ADMIN_HANDLE}.",
        "lang_picker": "🌐 <b>Выберите язык / Choose language:</b>",
        "lang_changed": "✅ Язык изменён.",
        "faq_premium": (
            "💎 <b>О Premium</b>\n\n"
            "<b>Цены:</b>\n"
            "• 7 дней — <b>5 000 UZS</b>\n"
            "• 30 дней — <b>15 000 UZS</b>\n"
            "• 365 дней — <b>120 000 UZS</b> <i>(самый выгодный)</i>\n\n"
            "<b>Что даёт Premium?</b>\n"
            "• Безлимит AI анализа фото (бесплатно 3/день)\n"
            "• Полный режим Рамадана\n"
            "• Адаптивная цель калорий\n"
            "• Экспорт (CSV/PDF)\n"
            "• Все скины\n\n"
            "<b>Как получить?</b>\n"
            "В приложении: Профиль → кнопка Premium → выберите тариф → оплатите."
        ),
        "faq_photo": (
            "📸 <b>О Фото AI</b>\n\n"
            "<b>Как работает?</b>\n"
            "Отправьте фото блюда в бот. AI распознаёт блюдо и считает калории и макросы.\n\n"
            "<b>Лимит:</b>\n"
            "• Бесплатно — 3 в день\n"
            "• Premium — безлимит\n\n"
            "<b>Для точности:</b>\n"
            "• Снимайте при хорошем свете\n"
            "• Показывайте блюдо полностью\n"
            "• 1-3 блюда на одном фото\n\n"
            "<b>Если ошибка:</b>\n"
            "• \"PHOTO_INVALID_DIMENSIONS\" — фото слишком большое или маленькое. Снимите заново.\n"
            "• \"AI_TIMEOUT\" — медленный интернет, попробуйте снова."
        ),
        "faq_payment": (
            "💳 <b>Проблема с оплатой</b>\n\n"
            "<b>Загрузил чек, Premium не пришёл?</b>\n"
            "Админ подтверждает за 5-30 минут. Подождите.\n\n"
            "<b>Отправил не ту сумму?</b>\n"
            "Отправляйте ровно указанную сумму (последние 3 цифры важны). Если ошиблись, "
            f"для доплаты или возврата напишите {ADMIN_HANDLE}.\n\n"
            "<b>Почему владелец карты \"Watson X\"?</b>\n"
            "Это личная карта до регистрации ЯТТ. Скоро будут Click/Payme.\n\n"
            "<b>Время вышло (30 минут)?</b>\n"
            "Начните оплату заново в приложении — новая сумма и суффикс."
        ),
        "faq_trial": (
            "🎁 <b>О триале</b>\n\n"
            "Каждый новый пользователь получает <b>3 дня бесплатного Premium</b> — автоматически.\n\n"
            "<b>После окончания триала:</b>\n"
            "• Возвращаются лимиты (фото 3/день)\n"
            "• Premium функции закрываются\n"
            "• Для продолжения купите тариф\n\n"
            "<b>Когда заканчивается триал:</b>\n"
            "В приложении: Профиль → карточка Premium показывает время."
        ),
    },

    # ───────────── ENGLISH ─────────────
    "en": {
        "menu_title": "👋 <b>Lokma Help Center</b>\n\nChoose a topic for your question:",
        "btn_premium": "💎 Premium questions",
        "btn_photo": "📸 Photo AI",
        "btn_payment": "💳 Payment issue",
        "btn_trial": "🎁 Trial (3 days)",
        "btn_other": "💬 Other question",
        "btn_change_lang": "🌐 Language / Til",
        "btn_back": "◀️ Back",
        "btn_menu": "◀️ Menu",
        "btn_yes": "👍 Yes",
        "btn_no": "👎 No",
        "btn_helped": "👍 Helped",
        "btn_no_help": "👎 Didn't help",
        "btn_ask_more": "💬 Ask another question",
        "btn_cancel": "◀️ Cancel",
        "btn_msg_admin": f"💬 Message {ADMIN_HANDLE}",
        "ai_prompt": (
            "💬 <b>AI Assistant</b>\n\n"
            "Write your question — it knows everything about Lokma.\n\n"
            "<i>Example: \"How much does Premium cost?\" or \"Why isn't Photo AI working?\"</i>\n\n"
            f"For complex or personal issues → {ADMIN_HANDLE}"
        ),
        "too_short": "Question too short. Please write more detail.",
        "too_long": "Question too long (max 500 characters). Please shorten.",
        "rate_limit": "📊 Daily AI question limit reached ({limit}/day).\n\nTry again tomorrow or message {admin}.",
        "ai_label": "🤖 <b>AI answer:</b>",
        "ai_footer": "<i>You can ask {n} more questions today.</i>",
        "thanks": "Thanks! 🙏",
        "not_enough": (
            "😔 Sorry the answer didn't help.\n\n"
            f"Message {ADMIN_HANDLE} directly — we'll review your question in detail."
        ),
        "ai_not_set": f"AI is not configured yet. Please message {ADMIN_HANDLE}.",
        "ai_tech_error": f"⚠️ A technical error occurred. Message {ADMIN_HANDLE}.",
        "ai_busy": f"⏱ AI is busy (Google server load). Try again in a few minutes or message {ADMIN_HANDLE}.",
        "lang_picker": "🌐 <b>Choose language / Tilni tanlang:</b>",
        "lang_changed": "✅ Language changed.",
        "faq_premium": (
            "💎 <b>About Premium</b>\n\n"
            "<b>Prices:</b>\n"
            "• 7 days — <b>5,000 UZS</b>\n"
            "• 30 days — <b>15,000 UZS</b>\n"
            "• 365 days — <b>120,000 UZS</b> <i>(best value)</i>\n\n"
            "<b>What you get:</b>\n"
            "• Unlimited AI photo analysis (free: 3/day)\n"
            "• Full Ramadan mode\n"
            "• Adaptive calorie goal\n"
            "• Export (CSV/PDF)\n"
            "• All skins\n\n"
            "<b>How to get it?</b>\n"
            "In the app: Profile → Premium button → choose plan → pay."
        ),
        "faq_photo": (
            "📸 <b>About Photo AI</b>\n\n"
            "<b>How it works:</b>\n"
            "Send a food photo to the bot. AI detects the dish and calculates calories and macros.\n\n"
            "<b>Limit:</b>\n"
            "• Free — 3 per day\n"
            "• Premium — unlimited\n\n"
            "<b>For accuracy:</b>\n"
            "• Take photo in bright light\n"
            "• Show the dish fully\n"
            "• 1-3 dishes per photo\n\n"
            "<b>If error:</b>\n"
            "• \"PHOTO_INVALID_DIMENSIONS\" — image too big or small. Retake.\n"
            "• \"AI_TIMEOUT\" — slow internet, try again."
        ),
        "faq_payment": (
            "💳 <b>Payment issue</b>\n\n"
            "<b>Uploaded receipt, Premium didn't arrive?</b>\n"
            "Admin confirms in 5-30 minutes. Please wait.\n\n"
            "<b>Sent wrong amount?</b>\n"
            "Send the exact amount shown (last 3 digits matter). If you made a mistake, "
            f"message {ADMIN_HANDLE} for additional payment or refund.\n\n"
            "<b>Why is the cardholder \"Watson X\"?</b>\n"
            "This is a personal card until official business registration. Click/Payme coming soon.\n\n"
            "<b>Time expired (30 minutes)?</b>\n"
            "Start payment again in the app — new amount and suffix will be issued."
        ),
        "faq_trial": (
            "🎁 <b>About Trial</b>\n\n"
            "Every new user gets <b>3 days of free Premium</b> — automatically.\n\n"
            "<b>After trial ends:</b>\n"
            "• Limits return (photo 3/day)\n"
            "• Premium features close\n"
            "• Buy a plan to continue\n\n"
            "<b>When trial ends:</b>\n"
            "In the app: Profile → Premium card shows the time."
        ),
    },
}


def T(lang: str, key: str, **kwargs) -> str:
    """Lokalizatsiya helper. Til topilmasa default'ga qaytadi."""
    data = TEXTS.get(lang) or TEXTS[DEFAULT_LANG]
    txt = data.get(key) or TEXTS[DEFAULT_LANG].get(key, key)
    if kwargs:
        try:
            return txt.format(**kwargs)
        except Exception:
            return txt
    return txt


# ─────────── Klaviaturalar ───────────
def _menu_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=T(lang, "btn_premium"), callback_data="sup:premium")],
        [InlineKeyboardButton(text=T(lang, "btn_photo"),   callback_data="sup:photo")],
        [InlineKeyboardButton(text=T(lang, "btn_payment"), callback_data="sup:payment")],
        [InlineKeyboardButton(text=T(lang, "btn_trial"),   callback_data="sup:trial")],
        [InlineKeyboardButton(text=T(lang, "btn_other"),   callback_data="sup:other")],
        [InlineKeyboardButton(text=T(lang, "btn_change_lang"), callback_data="sup:lang")],
    ])


def _back_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=T(lang, "btn_yes"), callback_data="sup:ok"),
            InlineKeyboardButton(text=T(lang, "btn_no"),  callback_data="sup:no"),
        ],
        [InlineKeyboardButton(text=T(lang, "btn_back"), callback_data="sup:menu")],
    ])


def _admin_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=T(lang, "btn_msg_admin"),
                              url=f"https://t.me/{ADMIN_HANDLE.lstrip('@')}")],
        [InlineKeyboardButton(text=T(lang, "btn_back"), callback_data="sup:menu")],
    ])


def _ai_answer_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=T(lang, "btn_helped"), callback_data="sup:ok"),
            InlineKeyboardButton(text=T(lang, "btn_no_help"), callback_data="sup:no"),
        ],
        [InlineKeyboardButton(text=T(lang, "btn_ask_more"), callback_data="sup:other")],
        [InlineKeyboardButton(text=T(lang, "btn_menu"),     callback_data="sup:menu")],
    ])


def _lang_picker_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🇺🇿 O'zbekcha (Lotin)", callback_data="sup:set:uz-Latn")],
        [InlineKeyboardButton(text="🇺🇿 Ўзбекча (Кирилл)",  callback_data="sup:set:uz-Cyrl")],
        [InlineKeyboardButton(text="🇷🇺 Русский",            callback_data="sup:set:ru")],
        [InlineKeyboardButton(text="🇬🇧 English",            callback_data="sup:set:en")],
    ])


def _cancel_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=T(lang, "btn_cancel"), callback_data="sup:menu")],
    ])


# ─────────── Premium tekshiruv ───────────
async def _check_premium(db, telegram_id: int) -> bool:
    """Premium statusni Supabase'dan tekshir"""
    try:
        result = await db.users.get_by_telegram_id(telegram_id)
        if not result:
            return False
        premium_until = result.get("premium_until")
        if not premium_until:
            return False
        if isinstance(premium_until, str):
            premium_until = datetime.fromisoformat(premium_until.replace("Z", "+00:00"))
        return premium_until > datetime.now(timezone.utc)
    except Exception as e:
        print(f"[support] _check_premium error: {e}", flush=True)
        return False


# ─────────── Rate limit ───────────
def _check_rate_limit(telegram_id: int, is_premium: bool) -> tuple[bool, int]:
    """Returns (allowed, remaining)."""
    today = datetime.now(timezone.utc).date().isoformat()
    limit = MAX_QUESTIONS_PREMIUM if is_premium else MAX_QUESTIONS_FREE

    prev_date, used = _rate_limit.get(telegram_id, (today, 0))
    if prev_date != today:
        used = 0

    if used >= limit:
        return False, 0

    _rate_limit[telegram_id] = (today, used + 1)
    return True, limit - used - 1


# ─────────── Gemini chaqiruv ───────────
async def _ask_gemini(question: str, lang: str) -> str:
    """Gemini'ga savol yuborib javob ol. Retry + fallback model. Til system prompt orqali."""
    if not _client:
        return T(lang, "ai_not_set")

    models_to_try = [GEMINI_MODEL, "gemini-2.5-flash"]
    system_prompt = _build_system_prompt(lang)

    def _sync_call(model_name: str):
        response = _client.models.generate_content(
            model=model_name,
            contents=[
                types.Content(role="user", parts=[types.Part(text=question)])
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.4,
                max_output_tokens=1500,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return response.text or ""

    last_error = None
    for model_name in models_to_try:
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
                if "503" in err_str or "429" in err_str or "UNAVAILABLE" in err_str:
                    if retry == 0:
                        await asyncio.sleep(1.5)
                        continue
                    else:
                        break
                else:
                    return T(lang, "ai_tech_error")

    print(f"[support AI] all models failed. last_error={last_error}", flush=True)
    return T(lang, "ai_busy")


# ═══════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════
def setup_support(dp: Dispatcher, db=None):
    """bot.py'da chaqiriladi: setup_support(dp, db)"""

    # ─── /support komanda ───
    @dp.message(Command("support"))
    async def cmd_support(message: Message, state: FSMContext):
        await state.clear()
        lang = _detect_lang(message.from_user.language_code, message.from_user.id)
        await message.answer(
            T(lang, "menu_title"),
            parse_mode="HTML",
            reply_markup=_menu_kb(lang),
        )

    # ─── Menyuga qaytish ───
    @dp.callback_query(F.data == "sup:menu")
    async def cb_menu(call: CallbackQuery, state: FSMContext):
        await state.clear()
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        try:
            await call.message.edit_text(
                T(lang, "menu_title"),
                parse_mode="HTML",
                reply_markup=_menu_kb(lang),
            )
        except Exception:
            pass
        await call.answer()

    # ─── Til tanlash ekrani ───
    @dp.callback_query(F.data == "sup:lang")
    async def cb_lang(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        try:
            await call.message.edit_text(
                T(lang, "lang_picker"),
                parse_mode="HTML",
                reply_markup=_lang_picker_kb(),
            )
        except Exception:
            pass
        await call.answer()

    # ─── Til o'rnatish ───
    @dp.callback_query(F.data.startswith("sup:set:"))
    async def cb_set_lang(call: CallbackQuery):
        new_lang = call.data.split(":", 2)[2]
        if new_lang not in LANGS:
            new_lang = DEFAULT_LANG
        _user_lang[call.from_user.id] = new_lang
        try:
            await call.message.edit_text(
                f"{T(new_lang, 'lang_changed')}\n\n{T(new_lang, 'menu_title')}",
                parse_mode="HTML",
                reply_markup=_menu_kb(new_lang),
            )
        except Exception:
            pass
        await call.answer(T(new_lang, "lang_changed"))

    # ─── FAQ tugmalar ───
    @dp.callback_query(F.data == "sup:premium")
    async def cb_premium(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.message.edit_text(T(lang, "faq_premium"), parse_mode="HTML", reply_markup=_back_kb(lang))
        await call.answer()

    @dp.callback_query(F.data == "sup:photo")
    async def cb_photo(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.message.edit_text(T(lang, "faq_photo"), parse_mode="HTML", reply_markup=_back_kb(lang))
        await call.answer()

    @dp.callback_query(F.data == "sup:payment")
    async def cb_payment(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.message.edit_text(T(lang, "faq_payment"), parse_mode="HTML", reply_markup=_back_kb(lang))
        await call.answer()

    @dp.callback_query(F.data == "sup:trial")
    async def cb_trial(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.message.edit_text(T(lang, "faq_trial"), parse_mode="HTML", reply_markup=_back_kb(lang))
        await call.answer()

    # ─── "Boshqa savol" — AI rejimi ochiladi ───
    @dp.callback_query(F.data == "sup:other")
    async def cb_other(call: CallbackQuery, state: FSMContext):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await state.set_state(SupportStates.waiting_question)
        try:
            await call.message.edit_text(
                T(lang, "ai_prompt"),
                parse_mode="HTML",
                reply_markup=_cancel_kb(lang),
            )
        except Exception:
            pass
        await call.answer()

    # ─── AI suhbat — matn xabari ───
    @dp.message(SupportStates.waiting_question, F.text)
    async def handle_ai_question(message: Message, state: FSMContext):
        lang = _detect_lang(message.from_user.language_code, message.from_user.id)
        question = (message.text or "").strip()

        if len(question) < 3:
            await message.answer(T(lang, "too_short"))
            return

        if len(question) > 500:
            await message.answer(T(lang, "too_long"))
            return

        is_premium = False
        if db is not None:
            is_premium = await _check_premium(db, message.from_user.id)

        allowed, remaining = _check_rate_limit(message.from_user.id, is_premium)
        if not allowed:
            limit = MAX_QUESTIONS_PREMIUM if is_premium else MAX_QUESTIONS_FREE
            await message.answer(
                T(lang, "rate_limit", limit=limit, admin=ADMIN_HANDLE),
                reply_markup=_admin_kb(lang),
            )
            await state.clear()
            return

        try:
            await message.bot.send_chat_action(message.chat.id, "typing")
        except Exception:
            pass

        answer = await _ask_gemini(question, lang)

        footer = f"\n\n{T(lang, 'ai_footer', n=remaining)}" if remaining > 0 else ""

        await message.answer(
            f"{T(lang, 'ai_label')}\n\n{answer}{footer}",
            parse_mode="HTML",
            reply_markup=_ai_answer_kb(lang),
        )
        await state.clear()

    # ─── Feedback ───
    @dp.callback_query(F.data == "sup:ok")
    async def cb_ok(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.answer(T(lang, "thanks"), show_alert=False)
        try:
            await call.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=T(lang, "btn_menu"), callback_data="sup:menu")]]
            ))
        except Exception:
            pass

    @dp.callback_query(F.data == "sup:no")
    async def cb_no(call: CallbackQuery):
        lang = _detect_lang(call.from_user.language_code, call.from_user.id)
        await call.message.edit_text(
            T(lang, "not_enough"),
            parse_mode="HTML",
            reply_markup=_admin_kb(lang),
        )
        await call.answer()