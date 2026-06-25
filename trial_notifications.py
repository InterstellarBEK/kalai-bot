"""
Trial notification scheduler.
- 24 soat qolganda: eslatma DM
- Trial tugaganda: paywall taklif DM
- Idempotent: trial_warning_sent / trial_ended_sent flaglari bilan
- Faqat trial user'lar (oxirgi tranzaksiya provider='trial')
"""
import asyncio
from datetime import datetime, timedelta, timezone
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


CHECK_INTERVAL_SECONDS = 3600  # har soat


def _premium_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💎 Premium olish", web_app={"url": webapp_url})
    ]])


async def _is_trial_user(db, telegram_id: int) -> bool:
    """Oxirgi completed tranzaksiya provider='trial' bo'lsa — hali trial ichida."""
    res = await db.from_("transactions") \
        .select("provider") \
        .eq("telegram_id", telegram_id) \
        .eq("status", "completed") \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    if not res.data:
        return False
    return res.data[0].get("provider") == "trial"


async def _send_trial_warning(bot: Bot, db, webapp_url: str):
    """Trial tugashiga 24 soat qolganlarga eslatma."""
    now = datetime.now(timezone.utc)
    soon = now + timedelta(hours=24)

    res = await db.from_("users") \
        .select("telegram_id, premium_until") \
        .eq("trial_used", True) \
        .eq("trial_warning_sent", False) \
        .gt("premium_until", now.isoformat()) \
        .lt("premium_until", soon.isoformat()) \
        .execute()

    sent = 0
    for u in (res.data or []):
        tg_id = u["telegram_id"]
        if not await _is_trial_user(db, tg_id):
            # Paid premium — flag yopib qo'yamiz, qayta tekshirilmasin
            await db.from_("users").update({"trial_warning_sent": True}).eq("telegram_id", tg_id).execute()
            continue

        text = (
            "⏳ <b>Trial muddati tugayapti</b>\n\n"
            "Bepul 3 kunlik Premium muddati 24 soat ichida tugaydi.\n\n"
            "Davom etish uchun obuna oling — Bekjon va barcha imkoniyatlar siz bilan qoladi 💪"
        )
        try:
            await bot.send_message(tg_id, text, parse_mode="HTML",
                                    reply_markup=_premium_keyboard(webapp_url))
            await db.from_("users").update({"trial_warning_sent": True}).eq("telegram_id", tg_id).execute()
            sent += 1
        except Exception as e:
            print(f"[TrialWarning] {tg_id}: {e}")
        await asyncio.sleep(0.05)

    if sent:
        print(f"[TrialWarning] Yuborildi: {sent}")


async def _send_trial_ended(bot: Bot, db, webapp_url: str):
    """Trial tugagan user'larga paywall xabari."""
    now = datetime.now(timezone.utc)

    res = await db.from_("users") \
        .select("telegram_id, premium_until") \
        .eq("trial_used", True) \
        .eq("trial_ended_sent", False) \
        .lt("premium_until", now.isoformat()) \
        .execute()

    sent = 0
    for u in (res.data or []):
        tg_id = u["telegram_id"]
        if not await _is_trial_user(db, tg_id):
            await db.from_("users").update({"trial_ended_sent": True}).eq("telegram_id", tg_id).execute()
            continue

        text = (
            "🎁 <b>Bepul Premium muddati tugadi</b>\n\n"
            "3 kun davomida barcha imkoniyatlarni sinab ko'rdingiz.\n"
            "Endi Bekjon, cheksiz AI skan va boshqa Premium funksiyalar bilan davom etish uchun obuna oling 💎"
        )
        try:
            await bot.send_message(tg_id, text, parse_mode="HTML",
                                    reply_markup=_premium_keyboard(webapp_url))
            await db.from_("users").update({"trial_ended_sent": True}).eq("telegram_id", tg_id).execute()
            sent += 1
        except Exception as e:
            print(f"[TrialEnded] {tg_id}: {e}")
        await asyncio.sleep(0.05)

    if sent:
        print(f"[TrialEnded] Yuborildi: {sent}")


async def trial_notifications_loop(bot: Bot, db, webapp_url: str):
    """Har soatda warning + ended DM tekshiradi."""
    print("[TrialNotifications] Loop ishga tushdi")
    while True:
        try:
            await _send_trial_warning(bot, db, webapp_url)
            await _send_trial_ended(bot, db, webapp_url)
        except Exception as e:
            print(f"[TrialNotifications] Loop xatosi: {e}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)