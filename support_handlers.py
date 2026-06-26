"""
Support handler — FAQ tugmalari + admin eskalatsiya.
AI fallback keyingi qadamda qo'shiladi.
Foydalanuvchi /support yozsa yoki menyudan tanlasa, inline tugmalar chiqadi.
"""
from aiogram import Dispatcher, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup


ADMIN_HANDLE = "@Khalik0vv"

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


def _menu_kb() -> InlineKeyboardMarkup:
    """Asosiy support menyu — 4 ta FAQ + admin"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💎 Premium savollar", callback_data="sup:premium")],
        [InlineKeyboardButton(text="📸 Foto AI",          callback_data="sup:photo")],
        [InlineKeyboardButton(text="💳 To'lov muammosi", callback_data="sup:payment")],
        [InlineKeyboardButton(text="🎁 Trial (3 kun)",   callback_data="sup:trial")],
        [InlineKeyboardButton(text="💬 Boshqa savol",    callback_data="sup:other")],
    ])


def _back_kb() -> InlineKeyboardMarkup:
    """FAQ ichidagi 'Orqaga' + 'Yordam berdimi?' tugmalar"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="👍 Ha", callback_data="sup:ok"),
            InlineKeyboardButton(text="👎 Yo'q", callback_data="sup:no"),
        ],
        [InlineKeyboardButton(text="◀️ Orqaga", callback_data="sup:menu")],
    ])


def _admin_kb() -> InlineKeyboardMarkup:
    """Adminga yo'naltirish"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"💬 {ADMIN_HANDLE}'ga yozish", url=f"https://t.me/{ADMIN_HANDLE.lstrip('@')}")],
        [InlineKeyboardButton(text="◀️ Orqaga", callback_data="sup:menu")],
    ])


def setup_support(dp: Dispatcher):
    """bot.py'da chaqiriladi: setup_support(dp)"""

    # ─────── /support komanda ───────
    @dp.message(Command("support"))
    async def cmd_support(message: Message):
        await message.answer(
            "👋 <b>Lokma yordam markazi</b>\n\n"
            "Savolingiz bo'yicha bo'limni tanlang:",
            parse_mode="HTML",
            reply_markup=_menu_kb(),
        )

    # ─────── Menyuga qaytish ───────
    @dp.callback_query(F.data == "sup:menu")
    async def cb_menu(call: CallbackQuery):
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

    # ─────── FAQ tugmalar ───────
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

    # ─────── "Boshqa savol" — hozircha to'g'ridan adminga ───────
    # (Keyingi qadamda AI suhbat qo'shiladi)
    @dp.callback_query(F.data == "sup:other")
    async def cb_other(call: CallbackQuery):
        await call.message.edit_text(
            "💬 <b>Boshqa savol</b>\n\n"
            f"Sizning savolingizga AI yordamchi tez orada qo'shiladi.\n\n"
            f"Hozircha to'g'ridan-to'g'ri {ADMIN_HANDLE}'ga yozing — "
            "30 daqiqa ichida javob beradi.",
            parse_mode="HTML",
            reply_markup=_admin_kb(),
        )
        await call.answer()

    # ─────── Feedback: yordam bo'ldimi? ───────
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