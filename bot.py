import asyncio
import base64
import hashlib
import os
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from auth import register_auth_routes
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand, LabeledPrice, PreCheckoutQuery
from postgrest import AsyncPostgrestClient
from aiohttp import web
import aiohttp

from gemini_food import analyze_food_image, analyze_nutrition_label
from p2p_handlers import setup_p2p, handle_p2p_receipt_photo
from admin_handlers import setup_admin
from support_handlers import setup_support
from trial_notifications import trial_notifications_loop
load_dotenv()

bot = Bot(token=os.getenv("BOT_TOKEN"))
dp = Dispatcher()
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://kalai-bot.vercel.app")

db = AsyncPostgrestClient(
    base_url=f"{os.getenv('SUPABASE_URL')}/rest/v1",
    headers={
        "apikey": os.getenv("SUPABASE_KEY"),
        "Authorization": f"Bearer {os.getenv('SUPABASE_KEY')}",
    },
)

TASHKENT_TZ = ZoneInfo("Asia/Tashkent")
UTC_TZ = ZoneInfo("UTC")
REMINDER_HOUR = 20
WEEKLY_REPORT_HOUR = 9
WEEKDAYS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]

STARS_PLANS = {
    "weekly": {"stars": 50, "title": "Lokma Premium — Haftalik", "days": 7},
    "monthly": {"stars": 150, "title": "Lokma Premium — Oylik", "days": 30},
    "yearly": {"stars": 1200, "title": "Lokma Premium — Yillik", "days": 365},
}

# ============ Click + Payme plans (UZS) ============
CLICK_PLANS = {
    "weekly":  {"amount": 7900,   "days": 7,   "title": "Lokma Premium — Haftalik"},
    "monthly": {"amount": 19900,  "days": 30,  "title": "Lokma Premium — Oylik"},
    "yearly":  {"amount": 149000, "days": 365, "title": "Lokma Premium — Yillik"},
}

CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SERVICE_ID = os.getenv("CLICK_SERVICE_ID", "")
CLICK_SECRET_KEY = os.getenv("CLICK_SECRET_KEY", "")
CLICK_MERCHANT_USER_ID = os.getenv("CLICK_MERCHANT_USER_ID", "")
BOT_USERNAME = os.getenv("BOT_USERNAME", "kalai_test_bot")

# ============ P2P / Lifetime ENV ============
ADMIN_TELEGRAM_IDS = [int(x) for x in os.getenv("ADMIN_TELEGRAM_IDS", "").split(",") if x.strip()]
ADMIN_CHAT_ID = int(os.getenv("ADMIN_CHAT_ID", "0")) or None
SMS_WEBHOOK_TOKEN = os.getenv("SMS_WEBHOOK_TOKEN", "")

# Payme — narx UZS'da, lekin Payme tiyin yuboradi (1 UZS = 100 tiyin)
PAYME_PLANS = {
    "weekly":  {"amount": 7900,   "days": 7,   "title": "Lokma Premium — Haftalik"},
    "monthly": {"amount": 19900,  "days": 30,  "title": "Lokma Premium — Oylik"},
    "yearly":  {"amount": 149000, "days": 365, "title": "Lokma Premium — Yillik"},
}
PAYME_MERCHANT_ID = os.getenv("PAYME_MERCHANT_ID", "")
PAYME_KEY = os.getenv("PAYME_KEY", "")
PAYME_KEY_TEST = os.getenv("PAYME_KEY_TEST", "")

pending_analyses = {}


async def update_streak(telegram_id: int) -> dict:
    today = datetime.now(TASHKENT_TZ).date()
    res = await db.from_("users").select("current_streak,last_log_date").eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"streak": 0, "increased": False}

    user = res.data[0]
    last_date_str = user.get("last_log_date")
    current_streak = user.get("current_streak") or 0
    last_date = date.fromisoformat(last_date_str) if last_date_str else None

    if last_date == today:
        return {"streak": current_streak, "increased": False}

    if last_date == today - timedelta(days=1):
        new_streak = current_streak + 1
    else:
        new_streak = 1

    await db.from_("users").update({
        "current_streak": new_streak,
        "last_log_date": today.isoformat(),
    }).eq("telegram_id", telegram_id).execute()

    return {"streak": new_streak, "increased": True}


@dp.message(CommandStart())
async def start(message: Message):
    tg_id = message.from_user.id
    name = message.from_user.first_name

    existing = await db.from_("users").select("*").eq("telegram_id", tg_id).execute()

    if existing.data:
        await message.answer(f"Qaytib kelganingdan xursandman, {name}!")
    else:
        await db.from_("users").insert({
            "telegram_id": tg_id,
            "first_name": name,
        }).execute()
        await message.answer(f"Salom, {name}! Lokma'ga xush kelibsiz")


@dp.message(Command("today"))
async def today_cmd(message: Message):
    tg_id = message.from_user.id

    user_res = await db.from_("users").select("daily_calories_goal,current_streak").eq("telegram_id", tg_id).execute()
    if not user_res.data:
        await message.answer("Avval /start bosing.")
        return

    user = user_res.data[0]
    calorie_goal = user.get("daily_calories_goal") or 2000
    streak = user.get("current_streak") or 0

    now_tash = datetime.now(TASHKENT_TZ)
    start_of_day = now_tash.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_of_day.astimezone(UTC_TZ)

    logs_res = (
        await db.from_("food_logs")
        .select("food_name,calories,protein,fat,carbs")
        .eq("user_id", tg_id)
        .gte("logged_at", start_utc.isoformat())
        .execute()
    )
    logs = logs_res.data or []

    if not logs:
        text = (
            f"<b>📊 Bugun</b>\n\n"
            f"Hali hech narsa qo'shilmagan.\n\n"
            f"Maqsad: <b>{calorie_goal}</b> kcal\n"
        )
        if streak > 0:
            text += f"🔥 Streak: <b>{streak}</b> kun"
        await message.answer(text, parse_mode="HTML")
        return

    total_cal = sum((l.get("calories") or 0) for l in logs)
    total_protein = sum((l.get("protein") or 0) for l in logs)
    total_fat = sum((l.get("fat") or 0) for l in logs)
    total_carbs = sum((l.get("carbs") or 0) for l in logs)

    protein_goal = round(calorie_goal * 0.30 / 4)
    fat_goal = round(calorie_goal * 0.25 / 9)
    carbs_goal = round(calorie_goal * 0.45 / 4)

    percent = round(total_cal / calorie_goal * 100) if calorie_goal else 0

    text = (
        f"<b>📊 Bugun</b>\n\n"
        f"Kaloriya: <b>{round(total_cal)}</b> / {calorie_goal} kcal ({percent}%)\n"
        f"Oqsil: {round(total_protein)} / {protein_goal}g\n"
        f"Yog': {round(total_fat)} / {fat_goal}g\n"
        f"Uglevod: {round(total_carbs)} / {carbs_goal}g\n\n"
        f"<b>{len(logs)} ta ovqat:</b>\n"
    )

    for log in logs:
        text += f"• {log['food_name']} — {round(log.get('calories') or 0)} kcal\n"

    if streak > 0:
        text += f"\n🔥 Streak: <b>{streak}</b> kun"

    await message.answer(text, parse_mode="HTML")


@dp.message(Command("streak"))
async def streak_cmd(message: Message):
    tg_id = message.from_user.id

    user_res = await db.from_("users").select("current_streak,last_log_date").eq("telegram_id", tg_id).execute()
    if not user_res.data:
        await message.answer("Avval /start bosing.")
        return

    user = user_res.data[0]
    streak = user.get("current_streak") or 0
    last_date_str = user.get("last_log_date")
    today = datetime.now(TASHKENT_TZ).date()

    logged_today = False
    if last_date_str:
        last_date = date.fromisoformat(last_date_str)
        logged_today = (last_date == today)

    if streak == 0:
        text = (
            f"<b>🔥 Streak: 0 kun</b>\n\n"
            f"Birinchi ovqatingizni qo'shing va streak'ni boshlang!\n\n"
            f"<b>Maqsadlar:</b>\n"
            f"🥉 3 kun\n"
            f"🥈 7 kun\n"
            f"🥇 30 kun"
        )
        await message.answer(text, parse_mode="HTML")
        return

    badges = [(3, "🥉"), (7, "🥈"), (30, "🥇"), (100, "💎")]
    earned = [f"{icon} {n} kun" for n, icon in badges if streak >= n]
    next_badge = next(((n, icon) for n, icon in badges if streak < n), None)

    status_line = "✅ Bugun belgilangan" if logged_today else "⚠️ Bugun hali belgilanmagan"

    text = (
        f"<b>🔥 Streak: {streak} kun</b>\n\n"
        f"{status_line}\n\n"
    )

    if earned:
        text += f"<b>Olingan:</b>\n" + "\n".join(earned) + "\n\n"

    if next_badge:
        n, icon = next_badge
        remaining = n - streak
        text += f"<b>Keyingi:</b>\n{icon} {n} kun (yana {remaining} kun)"
    else:
        text += "Hamma badge'lar olingan! Davom eting 🚀"

    if not logged_today:
        text += "\n\n<i>Streak yo'qolmasligi uchun bugun hech bo'lmasa bitta ovqat qo'shing.</i>"

    await message.answer(text, parse_mode="HTML")


@dp.message(Command("add"))
async def add_cmd(message: Message, command: CommandObject):
    tg_id = message.from_user.id

    user_res = await db.from_("users").select("telegram_id").eq("telegram_id", tg_id).execute()
    if not user_res.data:
        await message.answer("Avval /start bosing.")
        return

    usage_text = (
        "<b>Foydalanish:</b>\n"
        "<code>/add nom kaloriya</code>\n"
        "<code>/add nom kaloriya oqsil yog' uglevod</code>\n\n"
        "<b>Misollar:</b>\n"
        "<code>/add Osh 540</code>\n"
        "<code>/add Qovurilgan tovuq 300 25 18 5</code>"
    )

    args = command.args
    if not args:
        await message.answer(usage_text, parse_mode="HTML")
        return

    parts = args.split()
    nums = []
    name_parts = parts.copy()
    for token in reversed(parts):
        try:
            n = float(token.replace(",", "."))
            nums.insert(0, n)
            name_parts.pop()
        except ValueError:
            break

    if len(nums) not in (1, 4) or not name_parts:
        await message.answer(usage_text, parse_mode="HTML")
        return

    name = " ".join(name_parts)
    calories = nums[0]

    if len(nums) == 4:
        protein, fat, carbs = nums[1], nums[2], nums[3]
    else:
        protein = round(calories * 0.20 / 4, 1)
        fat = round(calories * 0.30 / 9, 1)
        carbs = round(calories * 0.50 / 4, 1)

    name_capitalized = name.capitalize()

    await db.from_("food_logs").insert({
        "user_id": tg_id,
        "food_name": name_capitalized,
        "calories": calories,
        "protein": protein,
        "fat": fat,
        "carbs": carbs,
    }).execute()

    streak_info = await update_streak(tg_id)

    text = (
        f"✅ Saqlandi: <b>{name_capitalized}</b>\n"
        f"{round(calories)} kcal · O:{protein}g · Y:{fat}g · U:{carbs}g"
    )
    if streak_info["increased"]:
        text += f"\n\n🔥 Streak: <b>{streak_info['streak']} kun</b>"

    await message.answer(text, parse_mode="HTML")


@dp.message(F.photo)
async def handle_photo(message: Message):
    print(f"[PHOTO] received from tg_id={message.from_user.id}", flush=True)

    # 1) Avval P2P chek bo'lishi mumkin
    try:
        is_p2p = await handle_p2p_receipt_photo(message)
        print(f"[PHOTO] p2p result={is_p2p}", flush=True)
        if is_p2p:
            return
    except Exception as e:
        print(f"[P2P photo check] {type(e).__name__}: {e}", flush=True)

    # 2) P2P emas — Gemini food scan
    status = await message.answer("Rasmni tahlil qilyapman...")

    photo = message.photo[-1]
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        await bot.download(photo, destination=tmp_path)
        result = await asyncio.to_thread(analyze_food_image, tmp_path)
    except Exception as e:
        await status.edit_text(f"Xato: {e}")
        return
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not result.get("food_name"):
        await status.edit_text("Rasmda ovqat topilmadi.")
        return

    text = (
        f"<b>{result['food_name'].capitalize()}</b>\n\n"
        f"Porsiya: ~{result['estimated_grams']}g\n"
        f"Kaloriya: <b>{result['calories']}</b> kcal\n"
        f"Oqsil: {result['protein']}g\n"
        f"Yog': {result['fat']}g\n"
        f"Uglevod: {result['carbs']}g\n\n"
        f"<i>Aniqlik: {result['confidence']}</i>"
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Saqlash", callback_data="save_photo"),
        InlineKeyboardButton(text="Bekor", callback_data="cancel_photo"),
    ]])

    edited = await status.edit_text(text, parse_mode="HTML", reply_markup=kb)
    pending_analyses[edited.message_id] = result


@dp.callback_query(F.data == "save_photo")
async def save_photo(callback: CallbackQuery):
    msg_id = callback.message.message_id
    result = pending_analyses.pop(msg_id, None)

    if not result:
        await callback.answer("Vaqt o'tdi yoki ma'lumot yo'q.")
        return

    tg_id = callback.from_user.id
    food_name_with_portion = f"{result['food_name'].capitalize()} ({result['estimated_grams']}g)"

    await db.from_("food_logs").insert({
        "user_id": tg_id,
        "food_name": food_name_with_portion,
        "calories": result["calories"],
        "protein": result["protein"],
        "fat": result["fat"],
        "carbs": result["carbs"],
    }).execute()

    streak_info = await update_streak(tg_id)

    text = f"Saqlandi: <b>{food_name_with_portion}</b> — {result['calories']} kcal"
    if streak_info["increased"]:
        text += f"\n\n🔥 Streak: <b>{streak_info['streak']} kun</b>"

    await callback.message.edit_text(text, parse_mode="HTML")
    await callback.answer("Saqlandi!")


@dp.callback_query(F.data == "cancel_photo")
async def cancel_photo(callback: CallbackQuery):
    pending_analyses.pop(callback.message.message_id, None)
    await callback.message.delete()
    await callback.answer("Bekor qilindi")


# ============ Daily reminder loop ============
async def send_daily_reminders():
    today = datetime.now(TASHKENT_TZ).date()
    res = await db.from_("users").select("telegram_id,first_name,last_log_date,current_streak").execute()

    sent = 0
    skipped = 0
    for user in res.data or []:
        tg_id = user.get("telegram_id")
        if not tg_id:
            continue

        last_date_str = user.get("last_log_date")
        last_date = date.fromisoformat(last_date_str) if last_date_str else None

        if last_date == today:
            skipped += 1
            continue

        name = user.get("first_name") or "Do'st"
        streak = user.get("current_streak") or 0

        text = f"🌙 <b>Kechki eslatma</b>\n\nSalom, {name}! Bugun hali ovqat qo'shmagansiz."
        if streak > 0:
            text += f"\n\n🔥 Streak: <b>{streak} kun</b> — yo'qotmang!"
        text += "\n\n/add bilan qo'shing yoki rasm yuboring."

        try:
            await bot.send_message(tg_id, text, parse_mode="HTML")
            sent += 1
        except Exception as e:
            print(f"Reminder yuborilmadi {tg_id}: {e}")

        await asyncio.sleep(0.05)

    print(f"[Reminder] Yuborildi: {sent}, o'tkazib yuborildi: {skipped}")


async def daily_reminder_loop():
    while True:
        try:
            now = datetime.now(TASHKENT_TZ)
            next_run = now.replace(hour=REMINDER_HOUR, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)

            wait_seconds = (next_run - now).total_seconds()
            print(f"[Reminder] Keyingi yuborish: {next_run.strftime('%Y-%m-%d %H:%M')} (~{int(wait_seconds/60)} daqiqa)")
            await asyncio.sleep(wait_seconds)

            await send_daily_reminders()
        except Exception as e:
            print(f"[Reminder] Loop xatosi: {e}")
            await asyncio.sleep(60)


# ============ Weekly report loop ============
async def send_weekly_reports():
    today = datetime.now(TASHKENT_TZ).date()
    last_monday = today - timedelta(days=7)

    start_dt = datetime.combine(last_monday, datetime.min.time()).replace(tzinfo=TASHKENT_TZ)
    end_dt = datetime.combine(today, datetime.min.time()).replace(tzinfo=TASHKENT_TZ)
    start_utc = start_dt.astimezone(UTC_TZ)
    end_utc = end_dt.astimezone(UTC_TZ)

    users_res = await db.from_("users").select("telegram_id,first_name,current_streak,daily_calories_goal").execute()

    sent = 0
    for user in users_res.data or []:
        tg_id = user.get("telegram_id")
        if not tg_id:
            continue

        name = user.get("first_name") or "Do'st"
        goal = user.get("daily_calories_goal") or 2000
        streak = user.get("current_streak") or 0

        logs_res = (
            await db.from_("food_logs")
            .select("calories,logged_at")
            .eq("user_id", tg_id)
            .gte("logged_at", start_utc.isoformat())
            .lt("logged_at", end_utc.isoformat())
            .execute()
        )
        logs = logs_res.data or []

        if not logs:
            continue

        daily_totals = {}
        for log in logs:
            log_dt = datetime.fromisoformat(log["logged_at"].replace("Z", "+00:00")).astimezone(TASHKENT_TZ)
            d = log_dt.date()
            daily_totals[d] = daily_totals.get(d, 0) + (log.get("calories") or 0)

        total_meals = len(logs)
        active_days = len(daily_totals)
        total_cal = sum(daily_totals.values())
        avg_cal = round(total_cal / active_days) if active_days else 0
        on_target = sum(1 for c in daily_totals.values() if goal * 0.9 <= c <= goal * 1.1)

        days_text = ""
        for i in range(7):
            d = last_monday + timedelta(days=i)
            c = daily_totals.get(d, 0)
            wd = WEEKDAYS_UZ[d.weekday()]
            if c == 0:
                days_text += f"{wd}: —\n"
            else:
                mark = " ✅" if goal * 0.9 <= c <= goal * 1.1 else ""
                days_text += f"{wd}: {round(c)} kcal{mark}\n"

        text = (
            f"📈 <b>Haftalik hisobot</b>\n\n"
            f"Salom, {name}!\n\n"
            f"<b>O'tgan hafta:</b>\n"
            f"🍽 {total_meals} ta ovqat\n"
            f"📅 {active_days}/7 kun belgilangan\n"
            f"🎯 {on_target} kun maqsadga erishildi\n"
            f"📊 O'rtacha: <b>{avg_cal}</b> kcal/kun\n"
            f"🎯 Maqsad: {goal} kcal\n\n"
            f"<b>Kunlar:</b>\n{days_text}"
        )
        if streak > 0:
            text += f"\n🔥 Streak: <b>{streak} kun</b>"

        try:
            await bot.send_message(tg_id, text, parse_mode="HTML")
            sent += 1
        except Exception as e:
            print(f"Weekly yuborilmadi {tg_id}: {e}")

        await asyncio.sleep(0.05)

    print(f"[Weekly] Yuborildi: {sent}")


async def weekly_report_loop():
    while True:
        try:
            now = datetime.now(TASHKENT_TZ)
            days_until_monday = (0 - now.weekday()) % 7
            next_run = (now + timedelta(days=days_until_monday)).replace(
                hour=WEEKLY_REPORT_HOUR, minute=0, second=0, microsecond=0
            )
            if next_run <= now:
                next_run += timedelta(days=7)

            wait_seconds = (next_run - now).total_seconds()
            print(f"[Weekly] Keyingi yuborish: {next_run.strftime('%Y-%m-%d %H:%M')} (~{int(wait_seconds/3600)} soat)")
            await asyncio.sleep(wait_seconds)

            await send_weekly_reports()
        except Exception as e:
            print(f"[Weekly] Loop xatosi: {e}")
            await asyncio.sleep(3600)


# ============ CORS middleware ============
@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ============ Web endpoints ============
async def health(request):
    return web.Response(text="Lokma bot ishlayapti")


async def analyze_food_endpoint(request):
    tmp_path = None
    try:
        lang_raw = request.query.get("lang", "uz")
        lang = "ru" if lang_raw == "ru" else "en" if lang_raw == "en" else "uz"
        reader = await request.multipart()
        field = await reader.next()

        if field is None or field.name != "image":
            return web.json_response({"error": "'image' field kerak"}, status=400)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                tmp.write(chunk)

        result = await asyncio.to_thread(analyze_food_image, tmp_path, lang)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


async def analyze_label_endpoint(request):
    """Nutrition label (etiketka) ni Gemini Vision bilan o'qish."""
    tmp_path = None
    try:
        reader = await request.multipart()
        field = await reader.next()

        if field is None or field.name != "image":
            return web.json_response({"error": "'image' field kerak"}, status=400)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                tmp.write(chunk)

        result = await asyncio.to_thread(analyze_nutrition_label, tmp_path)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


# ============ CLICK payment endpoints ============
def click_check_sign(data: dict, action: int) -> bool:
    """Click sign_string MD5 tekshirish."""
    sign_string = data.get("sign_string", "")
    parts = [
        str(data.get("click_trans_id", "")),
        str(data.get("service_id", "")),
        CLICK_SECRET_KEY,
        str(data.get("merchant_trans_id", "")),
    ]
    if action == 1:
        parts.append(str(data.get("merchant_prepare_id", "")))
    parts.extend([
        str(data.get("amount", "")),
        str(action),
        str(data.get("sign_time", "")),
    ])
    calculated = hashlib.md5("".join(parts).encode()).hexdigest()
    return calculated == sign_string


async def click_create_invoice_endpoint(request: web.Request):
    """Frontend chaqiradi → Click to'lov URL qaytaramiz."""
    try:
        data = await request.json()
        tg_id = int(data.get("telegram_id"))
        plan = data.get("plan")

        plan_info = CLICK_PLANS.get(plan)
        if not plan_info:
            return web.json_response({"error": "Noto'g'ri plan"}, status=400)

        ins = await db.from_("transactions").insert({
            "telegram_id": tg_id,
            "provider": "click",
            "amount": plan_info["amount"],
            "currency": "UZS",
            "period_days": plan_info["days"],
            "status": "pending",
        }).execute()
        tx_id = ins.data[0]["id"]

        return_url = f"https://t.me/{BOT_USERNAME}"
        url = (
            f"https://my.click.uz/services/pay"
            f"?service_id={CLICK_SERVICE_ID}"
            f"&merchant_id={CLICK_MERCHANT_ID}"
            f"&amount={plan_info['amount']}"
            f"&transaction_param={tx_id}"
            f"&return_url={return_url}"
        )
        return web.json_response({"invoice_link": url, "tx_id": tx_id})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def click_prepare_endpoint(request: web.Request):
    """Click → bizga prepare so'rovi (action=0)."""
    try:
        form = await request.post()
        data = {k: str(v) for k, v in form.items()}

        if not click_check_sign(data, 0):
            return web.json_response({
                "error": -1, "error_note": "SIGN CHECK FAILED",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": data.get("merchant_trans_id"),
            })

        try:
            tx_id = int(data.get("merchant_trans_id"))
        except (TypeError, ValueError):
            return web.json_response({
                "error": -5, "error_note": "Order id invalid",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": data.get("merchant_trans_id"),
            })

        amount = float(data.get("amount", 0))

        tx_res = await db.from_("transactions").select("*").eq("id", tx_id).execute()
        if not tx_res.data:
            return web.json_response({
                "error": -5, "error_note": "Order not found",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
            })

        tx = tx_res.data[0]
        if float(tx["amount"]) != amount:
            return web.json_response({
                "error": -2, "error_note": "Incorrect amount",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
            })

        if tx["status"] == "paid":
            return web.json_response({
                "error": -4, "error_note": "Already paid",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
            })

        return web.json_response({
            "error": 0, "error_note": "Success",
            "click_trans_id": data.get("click_trans_id"),
            "merchant_trans_id": tx_id,
            "merchant_prepare_id": tx_id,
        })
    except Exception as e:
        return web.json_response({"error": -8, "error_note": str(e)})


async def click_complete_endpoint(request: web.Request):
    """Click → bizga complete so'rovi (action=1)."""
    try:
        form = await request.post()
        data = {k: str(v) for k, v in form.items()}

        if not click_check_sign(data, 1):
            return web.json_response({
                "error": -1, "error_note": "SIGN CHECK FAILED",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": data.get("merchant_trans_id"),
            })

        try:
            tx_id = int(data.get("merchant_trans_id"))
        except (TypeError, ValueError):
            return web.json_response({
                "error": -5, "error_note": "Order id invalid",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": data.get("merchant_trans_id"),
            })

        click_error = int(data.get("error", 0))

        tx_res = await db.from_("transactions").select("*").eq("id", tx_id).execute()
        if not tx_res.data:
            return web.json_response({
                "error": -5, "error_note": "Order not found",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
            })

        tx = tx_res.data[0]

        if click_error < 0:
            await db.from_("transactions").update({
                "status": "cancelled",
                "cancel_time": datetime.now(UTC_TZ).isoformat(),
                "raw_payload": data,
            }).eq("id", tx_id).execute()
            return web.json_response({
                "error": click_error,
                "error_note": data.get("error_note", "cancelled"),
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
                "merchant_confirm_id": tx_id,
            })

        if tx["status"] == "paid":
            return web.json_response({
                "error": 0, "error_note": "Already confirmed",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
                "merchant_confirm_id": tx_id,
            })

        days = tx["period_days"]
        plan_key = next((k for k, v in CLICK_PLANS.items() if v["days"] == days), "monthly")

        try:
            await db.rpc("activate_subscription", {
                "p_telegram_id": tx["telegram_id"],
                "p_plan": plan_key,
                "p_payment_method": "click",
                "p_payment_id": str(data.get("click_trans_id")),
                "p_amount": tx["amount"],
                "p_currency": "UZS",
            }).execute()
        except Exception as e:
            print(f"[Click] activate_subscription xato: {e}")
            return web.json_response({
                "error": -8, "error_note": "Activation failed",
                "click_trans_id": data.get("click_trans_id"),
                "merchant_trans_id": tx_id,
            })

        await db.from_("transactions").update({
            "status": "paid",
            "perform_time": datetime.now(UTC_TZ).isoformat(),
            "provider_tx_id": str(data.get("click_trans_id")),
            "raw_payload": data,
        }).eq("id", tx_id).execute()

        try:
            await bot.send_message(
                tx["telegram_id"],
                f"✅ <b>Premium faollashtirildi!</b>\n\n"
                f"To'lov: Click orqali\n"
                f"Muddat: {days} kun\n\n"
                f"Rahmat! 🐺",
                parse_mode="HTML",
            )
        except Exception as e:
            print(f"[Click] xabar yuborilmadi {tx['telegram_id']}: {e}")

        return web.json_response({
            "error": 0, "error_note": "Success",
            "click_trans_id": data.get("click_trans_id"),
            "merchant_trans_id": tx_id,
            "merchant_confirm_id": tx_id,
        })
    except Exception as e:
        return web.json_response({"error": -8, "error_note": str(e)})


# ============ PAYME merchant JSON-RPC ============
PAYME_STATE_PENDING = 1
PAYME_STATE_PAID = 2
PAYME_STATE_CANCELLED_PENDING = -1
PAYME_STATE_CANCELLED_PAID = -2


def _ts_ms(ts_str) -> int:
    if not ts_str:
        return 0
    if isinstance(ts_str, (int, float)):
        return int(ts_str)
    try:
        dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def _now_ms() -> int:
    return int(datetime.now(UTC_TZ).timestamp() * 1000)


def _tx_to_payme_state(tx: dict) -> int:
    status = tx.get("status")
    if status == "paid":
        return PAYME_STATE_PAID
    if status == "cancelled":
        return PAYME_STATE_CANCELLED_PAID if tx.get("perform_time") else PAYME_STATE_CANCELLED_PENDING
    return PAYME_STATE_PENDING


def payme_auth_ok(request: web.Request) -> bool:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth[6:]).decode()
        login, key = decoded.split(":", 1)
        if login != "Paycom":
            return False
        valid_keys = [k for k in (PAYME_KEY, PAYME_KEY_TEST) if k]
        return key in valid_keys
    except Exception:
        return False


def payme_err(req_id, code, msg_uz="", msg_ru="", msg_en="", data=None):
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {
            "code": code,
            "message": {
                "uz": msg_uz or msg_en or "Xato",
                "ru": msg_ru or msg_en or "Ошибка",
                "en": msg_en or "Error",
            },
        },
    }
    if data is not None:
        payload["error"]["data"] = data
    return web.json_response(payload)


def payme_ok(req_id, result):
    return web.json_response({"jsonrpc": "2.0", "id": req_id, "result": result})


async def _get_tx_by_id(tx_id):
    try:
        tx_id = int(tx_id)
    except (TypeError, ValueError):
        return None
    res = await db.from_("transactions").select("*").eq("id", tx_id).execute()
    return res.data[0] if res.data else None


async def _get_tx_by_payme_id(payme_id: str):
    res = await db.from_("transactions").select("*").eq("provider", "payme").eq("provider_tx_id", payme_id).execute()
    return res.data[0] if res.data else None


async def payme_check_perform(req_id, params):
    account = params.get("account") or {}
    amount = params.get("amount", 0)
    tx_id = account.get("tx_id") or account.get("transaction") or account.get("order_id")

    tx = await _get_tx_by_id(tx_id)
    if not tx:
        return payme_err(req_id, -31050, "Buyurtma topilmadi", "Заказ не найден", "Order not found",
                         data="tx_id")
    if tx.get("provider") not in ("payme", None):
        return payme_err(req_id, -31050, "Provider mos kelmaydi", "Провайдер не совпадает", "Wrong provider",
                         data="tx_id")
    if int(float(tx["amount"])) * 100 != int(amount):
        return payme_err(req_id, -31001, "Summa noto'g'ri", "Неверная сумма", "Invalid amount",
                         data="amount")
    if tx.get("status") == "paid":
        return payme_err(req_id, -31051, "Allaqachon to'langan", "Уже оплачено", "Already paid", data="tx_id")

    return payme_ok(req_id, {"allow": True})


async def payme_create_tx(req_id, params):
    payme_id = params.get("id")
    create_ts = params.get("time") or _now_ms()
    amount = params.get("amount", 0)
    account = params.get("account") or {}
    tx_id = account.get("tx_id") or account.get("transaction") or account.get("order_id")

    # Idempotent: shu Payme id allaqachon mavjudmi?
    existing = await _get_tx_by_payme_id(str(payme_id)) if payme_id else None
    if existing:
        return payme_ok(req_id, {
            "create_time": _ts_ms(existing.get("created_at")),
            "transaction": str(existing["id"]),
            "state": _tx_to_payme_state(existing),
        })

    tx = await _get_tx_by_id(tx_id)
    if not tx:
        return payme_err(req_id, -31050, "Buyurtma topilmadi", "Заказ не найден", "Order not found",
                         data="tx_id")
    if int(float(tx["amount"])) * 100 != int(amount):
        return payme_err(req_id, -31001, "Summa noto'g'ri", "Неверная сумма", "Invalid amount",
                         data="amount")
    if tx.get("status") != "pending":
        return payme_err(req_id, -31008, "Operatsiya bajarib bo'lmaydi", "Невозможно выполнить", "Cannot perform")

    # Bog'lab qo'yamiz
    await db.from_("transactions").update({
        "provider": "payme",
        "provider_tx_id": str(payme_id),
        "raw_payload": params,
    }).eq("id", tx["id"]).execute()

    return payme_ok(req_id, {
        "create_time": create_ts,
        "transaction": str(tx["id"]),
        "state": PAYME_STATE_PENDING,
    })


async def payme_perform_tx(req_id, params):
    payme_id = params.get("id")
    tx = await _get_tx_by_payme_id(str(payme_id)) if payme_id else None
    if not tx:
        return payme_err(req_id, -31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")

    if tx.get("status") == "paid":
        # Idempotent
        return payme_ok(req_id, {
            "transaction": str(tx["id"]),
            "perform_time": _ts_ms(tx.get("perform_time")),
            "state": PAYME_STATE_PAID,
        })

    if tx.get("status") != "pending":
        return payme_err(req_id, -31008, "Operatsiya bajarib bo'lmaydi", "Невозможно выполнить", "Cannot perform")

    days = tx["period_days"]
    plan_key = next((k for k, v in PAYME_PLANS.items() if v["days"] == days), "monthly")
    now_iso = datetime.now(UTC_TZ).isoformat()
    now_ms = _now_ms()

    try:
        await db.rpc("activate_subscription", {
            "p_telegram_id": tx["telegram_id"],
            "p_plan": plan_key,
            "p_payment_method": "payme",
            "p_payment_id": str(payme_id),
            "p_amount": tx["amount"],
            "p_currency": "UZS",
        }).execute()
    except Exception as e:
        print(f"[Payme] activate_subscription xato: {e}")
        return payme_err(req_id, -31008, "Faollashtirish xatosi", "Ошибка активации", "Activation failed")

    await db.from_("transactions").update({
        "status": "paid",
        "perform_time": now_iso,
    }).eq("id", tx["id"]).execute()

    try:
        await bot.send_message(
            tx["telegram_id"],
            f"✅ <b>Premium faollashtirildi!</b>\n\n"
            f"To'lov: Payme orqali\n"
            f"Muddat: {days} kun\n\n"
            f"Rahmat! 🐺",
            parse_mode="HTML",
        )
    except Exception as e:
        print(f"[Payme] xabar yuborilmadi: {e}")

    return payme_ok(req_id, {
        "transaction": str(tx["id"]),
        "perform_time": now_ms,
        "state": PAYME_STATE_PAID,
    })


async def payme_cancel_tx(req_id, params):
    payme_id = params.get("id")
    reason = params.get("reason")
    tx = await _get_tx_by_payme_id(str(payme_id)) if payme_id else None
    if not tx:
        return payme_err(req_id, -31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")

    if tx.get("status") == "cancelled":
        # Idempotent
        return payme_ok(req_id, {
            "transaction": str(tx["id"]),
            "cancel_time": _ts_ms(tx.get("cancel_time")),
            "state": _tx_to_payme_state(tx),
        })

    now_iso = datetime.now(UTC_TZ).isoformat()
    now_ms = _now_ms()

    if tx.get("status") == "paid":
        # Paid'dan keyin bekor — biz refund qilmaymiz, lekin status'ni belgilab qo'yamiz
        await db.from_("transactions").update({
            "status": "cancelled",
            "cancel_time": now_iso,
            "cancel_reason": reason,
        }).eq("id", tx["id"]).execute()
        return payme_ok(req_id, {
            "transaction": str(tx["id"]),
            "cancel_time": now_ms,
            "state": PAYME_STATE_CANCELLED_PAID,
        })

    # pending'dan bekor
    await db.from_("transactions").update({
        "status": "cancelled",
        "cancel_time": now_iso,
        "cancel_reason": reason,
    }).eq("id", tx["id"]).execute()
    return payme_ok(req_id, {
        "transaction": str(tx["id"]),
        "cancel_time": now_ms,
        "state": PAYME_STATE_CANCELLED_PENDING,
    })


async def payme_check_tx(req_id, params):
    payme_id = params.get("id")
    tx = await _get_tx_by_payme_id(str(payme_id)) if payme_id else None
    if not tx:
        return payme_err(req_id, -31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found")

    return payme_ok(req_id, {
        "create_time": _ts_ms(tx.get("created_at")),
        "perform_time": _ts_ms(tx.get("perform_time")),
        "cancel_time": _ts_ms(tx.get("cancel_time")),
        "transaction": str(tx["id"]),
        "state": _tx_to_payme_state(tx),
        "reason": tx.get("cancel_reason"),
    })


async def payme_get_statement(req_id, params):
    from_ms = int(params.get("from", 0))
    to_ms = int(params.get("to", _now_ms()))

    from_iso = datetime.fromtimestamp(from_ms / 1000, tz=UTC_TZ).isoformat()
    to_iso = datetime.fromtimestamp(to_ms / 1000, tz=UTC_TZ).isoformat()

    res = (
        await db.from_("transactions")
        .select("*")
        .eq("provider", "payme")
        .gte("created_at", from_iso)
        .lte("created_at", to_iso)
        .execute()
    )
    rows = res.data or []

    transactions = []
    for tx in rows:
        transactions.append({
            "id": tx.get("provider_tx_id"),
            "time": _ts_ms(tx.get("created_at")),
            "amount": int(float(tx["amount"])) * 100,
            "account": {"tx_id": str(tx["id"])},
            "create_time": _ts_ms(tx.get("created_at")),
            "perform_time": _ts_ms(tx.get("perform_time")),
            "cancel_time": _ts_ms(tx.get("cancel_time")),
            "transaction": str(tx["id"]),
            "state": _tx_to_payme_state(tx),
            "reason": tx.get("cancel_reason"),
        })
    return payme_ok(req_id, {"transactions": transactions})


async def payme_endpoint(request: web.Request):
    if not payme_auth_ok(request):
        return payme_err(None, -32504, "Ruxsat yo'q", "Нет доступа", "Insufficient privilege")

    try:
        body = await request.json()
    except Exception:
        return payme_err(None, -32700, "Parsing error", "Parsing error", "Parsing error")

    req_id = body.get("id")
    method = body.get("method")
    params = body.get("params") or {}

    handlers = {
        "CheckPerformTransaction": payme_check_perform,
        "CreateTransaction": payme_create_tx,
        "PerformTransaction": payme_perform_tx,
        "CancelTransaction": payme_cancel_tx,
        "CheckTransaction": payme_check_tx,
        "GetStatement": payme_get_statement,
    }
    handler = handlers.get(method)
    if not handler:
        return payme_err(req_id, -32601, "Method topilmadi", "Метод не найден", "Method not found")

    try:
        return await handler(req_id, params)
    except Exception as e:
        print(f"[Payme] {method} xato: {e}")
        return payme_err(req_id, -32400, str(e), str(e), str(e))


async def payme_create_invoice_endpoint(request: web.Request):
    """Frontend chaqiradi → Payme checkout URL qaytaramiz."""
    try:
        data = await request.json()
        tg_id = int(data.get("telegram_id"))
        plan = data.get("plan")

        plan_info = PAYME_PLANS.get(plan)
        if not plan_info:
            return web.json_response({"error": "Noto'g'ri plan"}, status=400)

        ins = await db.from_("transactions").insert({
            "telegram_id": tg_id,
            "provider": "payme",
            "amount": plan_info["amount"],
            "currency": "UZS",
            "period_days": plan_info["days"],
            "status": "pending",
        }).execute()
        tx_id = ins.data[0]["id"]

        amount_tiyin = plan_info["amount"] * 100
        callback = f"https://t.me/{BOT_USERNAME}"
        raw = f"m={PAYME_MERCHANT_ID};ac.tx_id={tx_id};a={amount_tiyin};c={callback};l=uz"
        encoded = base64.b64encode(raw.encode()).decode()
        url = f"https://checkout.paycom.uz/{encoded}"

        return web.json_response({"invoice_link": url, "tx_id": tx_id})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def barcode_lookup_endpoint(request: web.Request):
    barcode = request.match_info.get("barcode", "").strip()
    if not barcode or not barcode.isdigit():
        return web.json_response({"error": "invalid barcode"}, status=400)

    # Source 1: UPCitemdb trial (no key, ~100/day per IP)
    try:
        url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("code") == "OK" and data.get("items"):
                        item = data["items"][0]
                        name = item.get("title") or ""
                        if name:
                            return web.json_response({
                                "name": name,
                                "brand": item.get("brand") or "",
                                "image": (item.get("images") or [None])[0],
                                "source": "upcitemdb",
                            })
    except Exception as e:
        print(f"UPCitemdb error: {e}")

    # Source 2: OFF Russia instance (CIS mahsulotlar uchun)
    try:
        url = f"https://ru.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name,brands,image_small_url,nutriments,serving_quantity"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status == 200:
                    data = await r.json()
                    p = data.get("product")
                    if p and p.get("product_name"):
                        n = p.get("nutriments") or {}
                        kcal_raw = n.get("energy-kcal_100g")
                        if kcal_raw is None and n.get("energy_100g"):
                            kcal_raw = n["energy_100g"] / 4.184
                        return web.json_response({
                            "name": p.get("product_name", ""),
                            "brand": (p.get("brands") or "").split(",")[0].strip(),
                            "image": p.get("image_small_url"),
                            "kcal_per_100g": round(kcal_raw) if kcal_raw else None,
                            "protein_per_100g": round((n.get("proteins_100g") or 0) * 10) / 10,
                            "carbs_per_100g": round((n.get("carbohydrates_100g") or 0) * 10) / 10,
                            "fat_per_100g": round((n.get("fat_100g") or 0) * 10) / 10,
                            "source": "off_ru",
                        })
    except Exception as e:
        print(f"OFF-ru error: {e}")

    return web.json_response({"error": "not found"}, status=404)


async def start_web():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", health)
    app.router.add_get("/health", health)
    app.router.add_post("/api/analyze-food", analyze_food_endpoint)
    app.router.add_post("/api/analyze-label", analyze_label_endpoint)
    app.router.add_post("/api/create-invoice", create_invoice_endpoint)
    app.router.add_post("/api/click/create-invoice", click_create_invoice_endpoint)
    app.router.add_post("/click/prepare", click_prepare_endpoint)
    app.router.add_post("/click/complete", click_complete_endpoint)
    app.router.add_post("/api/payme/create-invoice", payme_create_invoice_endpoint)
    app.router.add_post("/payme", payme_endpoint)
    app.router.add_get("/api/barcode-lookup/{barcode}", barcode_lookup_endpoint)
    setup_p2p(dp, bot, db, app, ADMIN_TELEGRAM_IDS, ADMIN_CHAT_ID, SMS_WEBHOOK_TOKEN)
    register_auth_routes(app)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.getenv("PORT", 10000))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"Web server started on port {port}")

async def set_commands():
    await bot.set_my_commands([
        BotCommand(command="start", description="Boshlash"),
        BotCommand(command="today", description="Bugungi statistika"),
        BotCommand(command="streak", description="Streak holati"),
        BotCommand(command="add", description="Qo'lda taom qo'shish"),
    ])


async def main():
    await set_commands()
    setup_admin(dp, db, ADMIN_TELEGRAM_IDS)
    setup_support(dp)
    await start_web()
    asyncio.create_task(daily_reminder_loop())
    asyncio.create_task(weekly_report_loop())
    asyncio.create_task(trial_notifications_loop(bot, db, WEBAPP_URL))

    # Eski Telegram session o'chguncha kutish (Render restart conflict)
    for attempt in range(10):
        try:
            await bot.delete_webhook(drop_pending_updates=True)
            me = await bot.get_me()
            print(f"[Bot] @{me.username} ishga tushdi (urinish {attempt+1})")
            break
        except Exception as e:
            print(f"[Bot] Startup urinishi {attempt+1}/10 xato: {e}")
            await asyncio.sleep(5)

    await dp.start_polling(
        bot,
        drop_pending_updates=True,
        allowed_updates=dp.resolve_used_update_types(),
        handle_signals=False,
    )


# ============ Telegram Stars payments ============
@dp.pre_checkout_query()
async def pre_checkout(pre_checkout_q: PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_q.id, ok=True)


@dp.message(F.successful_payment)
async def successful_payment(message: Message):
    payment = message.successful_payment
    payload = payment.invoice_payload
    parts = payload.split("_")
    if len(parts) != 3 or parts[0] != "premium":
        await message.answer("To'lov qabul qilindi, lekin payload xato. Qo'llab-quvvatlashga yozing.")
        return

    plan = parts[1]
    tg_id = int(parts[2])
    plan_info = STARS_PLANS.get(plan)
    if not plan_info:
        await message.answer("To'lov qabul qilindi, lekin plan topilmadi.")
        return

    try:
        await db.rpc("activate_subscription", {
            "p_telegram_id": tg_id,
            "p_plan": plan,
            "p_payment_method": "stars",
            "p_payment_id": payment.telegram_payment_charge_id,
            "p_amount": payment.total_amount,
            "p_currency": "XTR",
        }).execute()
        await message.answer(
            f"✅ <b>Premium faollashtirildi!</b>\n\n"
            f"Plan: {plan_info['title']}\n"
            f"Muddat: {plan_info['days']} kun\n\n"
            f"Rahmat! 🌟",
            parse_mode="HTML",
        )
    except Exception as e:
        await message.answer(f"To'lov qabul qilindi, lekin faollashtirish xatosi: {e}")


async def create_invoice_endpoint(request):
    try:
        data = await request.json()
        tg_id = int(data.get("telegram_id"))
        plan = data.get("plan")

        plan_info = STARS_PLANS.get(plan)
        if not plan_info:
            return web.json_response({"error": "Noto'g'ri plan"}, status=400)

        link = await bot.create_invoice_link(
            title=plan_info["title"],
            description=f"Lokma Premium — {plan_info['days']} kun",
            payload=f"premium_{plan}_{tg_id}",
            provider_token="",
            currency="XTR",
            prices=[LabeledPrice(label=plan_info["title"], amount=plan_info["stars"])],
        )
        return web.json_response({"invoice_link": link})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


if __name__ == "__main__":
    asyncio.run(main())