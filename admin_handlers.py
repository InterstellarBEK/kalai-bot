"""
Admin komandalari — premium o'chirish, berish, tekshirish.
Faqat ADMIN_TELEGRAM_IDS ro'yxatidagi userlar foydalana oladi.
"""
from datetime import datetime
from aiogram import Dispatcher, F
from aiogram.filters import Command, CommandObject
from aiogram.types import Message
from postgrest import AsyncPostgrestClient


def is_admin(telegram_id: int, admin_ids: list[int]) -> bool:
    return telegram_id in admin_ids


def setup_admin(dp: Dispatcher, db: AsyncPostgrestClient, admin_ids: list[int]):
    """bot.py'da chaqiriladi: setup_admin(dp, db, ADMIN_TELEGRAM_IDS)"""

    # ───── /revoke_premium <telegram_id> [reason] ─────
    @dp.message(Command("revoke_premium"))
    async def cmd_revoke(message: Message, command: CommandObject):
        print(f"[ADMIN] /revoke_premium called by {message.from_user.id}", flush=True)

        if not is_admin(message.from_user.id, admin_ids):
            await message.answer("⛔ Bu komanda faqat admin uchun.")
            return

        args = (command.args or "").strip().split(maxsplit=1)
        if not args or not args[0].lstrip("-").isdigit():
            await message.answer(
                "❌ Foydalanish:\n"
                "<code>/revoke_premium 123456789</code>\n"
                "<code>/revoke_premium 123456789 sabab matni</code>",
                parse_mode="HTML",
            )
            return

        target_id = int(args[0])
        reason = args[1] if len(args) > 1 else "admin_revoke"

        try:
            res = await db.rpc("revoke_premium", {
                "p_telegram_id": target_id,
                "p_admin_id": message.from_user.id,
                "p_reason": reason,
            }).execute()

            data = res.data if isinstance(res.data, dict) else (res.data or {})

            if not data.get("success"):
                await message.answer(f"❌ Xato: {data.get('error', 'noma`lum')}")
                return

            old_until = data.get("old_premium_until") or "yo'q edi"
            await message.answer(
                f"✅ <b>Premium o'chirildi</b>\n\n"
                f"👤 User: <code>{target_id}</code>\n"
                f"📅 Eski muddat: {old_until}\n"
                f"📝 Sabab: {reason}",
                parse_mode="HTML",
            )

            # User'ga DM
            try:
                from aiogram import Bot
                bot: Bot = message.bot
                await bot.send_message(
                    target_id,
                    "ℹ️ <b>Premium obunangiz bekor qilindi</b>\n\n"
                    "Administrator tomonidan obunangiz to'xtatildi.\n\n"
                    "Savol yoki shikoyatlar bo'lsa @Khalik0vv ga yozing.",
                    parse_mode="HTML",
                )
            except Exception as e:
                await message.answer(f"⚠️ DM yuborilmadi: {e}")

        except Exception as e:
            await message.answer(f"❌ Xato: <code>{e}</code>", parse_mode="HTML")

    # ───── /grant_lifetime <telegram_id> [reason] ─────
    @dp.message(Command("grant_lifetime"))
    async def cmd_grant_lifetime(message: Message, command: CommandObject):
        print(f"[ADMIN] /grant_lifetime called by {message.from_user.id}", flush=True)

        if not is_admin(message.from_user.id, admin_ids):
            await message.answer("⛔ Bu komanda faqat admin uchun.")
            return

        args = (command.args or "").strip().split(maxsplit=1)
        if not args or not args[0].lstrip("-").isdigit():
            await message.answer(
                "❌ Foydalanish:\n"
                "<code>/grant_lifetime 123456789</code>\n"
                "<code>/grant_lifetime 123456789 sabab</code>",
                parse_mode="HTML",
            )
            return

        target_id = int(args[0])
        reason = args[1] if len(args) > 1 else "admin_grant"

        try:
            res = await db.rpc("grant_lifetime", {
                "p_telegram_id": target_id,
                "p_admin_id": message.from_user.id,
                "p_reason": reason,
            }).execute()

            data = res.data if isinstance(res.data, dict) else (res.data or {})

            if not data.get("success"):
                await message.answer(f"❌ Xato: {data.get('error', 'noma`lum')}")
                return

            await message.answer(
                f"👑 <b>Lifetime Premium berildi</b>\n\n"
                f"👤 User: <code>{target_id}</code>\n"
                f"📅 Muddat: 2099-12-31 gacha\n"
                f"📝 Sabab: {reason}",
                parse_mode="HTML",
            )

            # User'ga DM
            try:
                from aiogram import Bot
                bot: Bot = message.bot
                await bot.send_message(
                    target_id,
                    "🎉 <b>Tabriklaymiz!</b>\n\n"
                    "Sizga umrbod Lokma Premium taqdim etildi! 👑\n"
                    "Endi barcha imkoniyatlar siz uchun ochiq.\n\n"
                    "Savol yoki yordam kerak bo'lsa @Khalik0vv ga yozing.",
                    parse_mode="HTML",
                )
            except Exception as e:
                await message.answer(f"⚠️ DM yuborilmadi: {e}")

        except Exception as e:
            await message.answer(f"❌ Xato: <code>{e}</code>", parse_mode="HTML")

    # ───── /check_premium <telegram_id> ─────
    @dp.message(Command("check_premium"))
    async def cmd_check(message: Message, command: CommandObject):
        print(f"[ADMIN] /check_premium called by {message.from_user.id}", flush=True)

        if not is_admin(message.from_user.id, admin_ids):
            await message.answer("⛔ Bu komanda faqat admin uchun.")
            return

        args = (command.args or "").strip()
        # Agar argument yo'q bo'lsa, o'z statusi
        target_id = int(args) if args.lstrip("-").isdigit() else message.from_user.id

        try:
            res = await db.rpc("check_premium_status", {
                "p_telegram_id": target_id,
            }).execute()

            data = res.data if isinstance(res.data, dict) else (res.data or {})

            if not data.get("found"):
                await message.answer(f"❌ User <code>{target_id}</code> topilmadi.", parse_mode="HTML")
                return

            is_prem = data.get("is_premium")
            until = data.get("premium_until") or "—"
            days = data.get("days_left", 0)
            trial = data.get("trial_used")
            created = data.get("user_created", "—")
            sub = data.get("last_subscription") or {}

            status_emoji = "👑" if is_prem else "🆓"
            status_text = "PREMIUM" if is_prem else "BEPUL"

            text = (
                f"{status_emoji} <b>{status_text}</b>\n\n"
                f"👤 ID: <code>{target_id}</code>\n"
                f"📅 Premium until: <code>{until}</code>\n"
                f"⏳ Kun qoldi: <b>{days}</b>\n"
                f"🎁 Trial: {'ishlatilgan' if trial else 'yo`q'}\n"
                f"📆 Ro'yxat: {created}\n"
            )

            if sub:
                text += (
                    f"\n<b>Oxirgi obuna:</b>\n"
                    f"  Plan: <code>{sub.get('plan')}</code>\n"
                    f"  Status: <code>{sub.get('status')}</code>\n"
                    f"  Method: <code>{sub.get('payment_method')}</code>\n"
                )

            await message.answer(text, parse_mode="HTML")

        except Exception as e:
            await message.answer(f"❌ Xato: <code>{e}</code>", parse_mode="HTML")

    print("[ADMIN] Admin handlers registered", flush=True)