import asyncio
import os
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from postgrest import AsyncPostgrestClient

from gemini_food import analyze_food_image

load_dotenv()

bot = Bot(token=os.getenv("BOT_TOKEN"))
dp = Dispatcher()

db = AsyncPostgrestClient(
    base_url=f"{os.getenv('SUPABASE_URL')}/rest/v1",
    headers={
        "apikey": os.getenv("SUPABASE_KEY"),
        "Authorization": f"Bearer {os.getenv('SUPABASE_KEY')}",
    },
)

TASHKENT_TZ = ZoneInfo("Asia/Tashkent")

# message_id -> analysis dict (rasm natijasini vaqtinchalik saqlash)
pending_analyses = {}


async def update_streak(user_id: int) -> dict:
    """
    Streak'ni yangilaydi.
    Qaytadi: {'streak': int, 'increased': bool}
    increased=True bo'lsa — bugun birinchi marta log qilingan.
    """
    today = datetime.now(TASHKENT_TZ).date()

    res = await db.from_("users").select("current_streak,last_log_date").eq("id", user_id).execute()
    if not res.data:
        return {"streak": 0, "increased": False}

    user = res.data[0]
    last_date_str = user.get("last_log_date")
    current_streak = user.get("current_streak") or 0
    last_date = date.fromisoformat(last_date_str) if last_date_str else None

    if last_date == today:
        # Bugun allaqachon log qilingan — o'zgarish yo'q
        return {"streak": current_streak, "increased": False}

    if last_date == today - timedelta(days=1):
        # Kecha log qilingan — streak davom etadi
        new_streak = current_streak + 1
    else:
        # Streak uzilgan yoki birinchi marta
        new_streak = 1

    await db.from_("users").update({
        "current_streak": new_streak,
        "last_log_date": today.isoformat(),
    }).eq("id", user_id).execute()

    return {"streak": new_streak, "increased": True}


@dp.message(CommandStart())
async def start(message: Message):
    tg_id = message.from_user.id
    name = message.from_user.first_name

    existing = await db.from_("users").select("*").eq("telegram_id", tg_id).execute()

    if existing.data:
        await message.answer(f"Qaytib kelganingdan xursandman, {name}! 🎉")
    else:
        await db.from_("users").insert({
            "telegram_id": tg_id,
            "first_name": name,
        }).execute()
        await message.answer(f"Salom, {name}! KalAI'ga xush kelibsiz ✅")


@dp.message(F.photo)
async def handle_photo(message: Message):
    status = await message.answer("📸 Rasmni tahlil qilyapman...")

    photo = message.photo[-1]
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        await bot.download(photo, destination=tmp_path)
        result = await asyncio.to_thread(analyze_food_image, tmp_path)
    except Exception as e:
        await status.edit_text(f"❌ Xato: {e}")
        return
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not result.get("food_name"):
        await status.edit_text("❌ Rasmda ovqat topilmadi.")
        return

    text = (
        f"🍽 <b>{result['food_name'].capitalize()}</b>\n\n"
        f"⚖ Porsiya: ~{result['estimated_grams']}g\n"
        f"🔥 Kaloriya: <b>{result['calories']}</b> kcal\n"
        f"🥩 Oqsil: {result['protein']}g\n"
        f"🧈 Yog': {result['fat']}g\n"
        f"🍞 Uglevod: {result['carbs']}g\n\n"
        f"<i>Aniqlik: {result['confidence']}</i>"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Saqlash", callback_data="save_photo"),
        InlineKeyboardButton(text="❌ Bekor", callback_data="cancel_photo"),
    ]])

    edited = await status.edit_text(text, parse_mode="HTML", reply_markup=kb)
    pending_analyses[edited.message_id] = result


@dp.callback_query(F.data == "save_photo")
async def save_photo(callback: CallbackQuery):
    msg_id = callback.message.message_id
    result = pending_analyses.pop(msg_id, None)

    if not result:
        await callback.answer("⌛ Vaqt o'tdi yoki ma'lumot yo'q.")
        return

    food_name_with_portion = f"{result['food_name'].capitalize()} ({result['estimated_grams']}g)"

    await db.from_("food_logs").insert({
        "user_id": 1,
        "food_name": food_name_with_portion,
        "calories": result["calories"],
        "protein": result["protein"],
        "fat": result["fat"],
        "carbs": result["carbs"],
    }).execute()

    streak_info = await update_streak(1)

    text = f"✅ Saqlandi: <b>{food_name_with_portion}</b> — {result['calories']} kcal"
    if streak_info["increased"]:
        text += f"\n\n🔥 Streak: <b>{streak_info['streak']} kun</b>"

    await callback.message.edit_text(text, parse_mode="HTML")
    await callback.answer("Saqlandi!")


@dp.callback_query(F.data == "cancel_photo")
async def cancel_photo(callback: CallbackQuery):
    pending_analyses.pop(callback.message.message_id, None)
    await callback.message.delete()
    await callback.answer("Bekor qilindi")


async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())