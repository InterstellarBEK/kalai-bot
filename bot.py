import asyncio
import os
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand, LabeledPrice, PreCheckoutQuery
from postgrest import AsyncPostgrestClient
from aiohttp import web

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
UTC_TZ = ZoneInfo("UTC")
REMINDER_HOUR = 20
WEEKLY_REPORT_HOUR = 9
WEEKDAYS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]

# Stars subscription plans
STARS_PLANS = {
    "weekly": {"stars": 50, "title": "Lokma Premium — Haftalik", "days": 7},
    "monthly": {"stars": 150, "title": "Lokma Premium — Oylik", "days": 30},
    "yearly": {"stars": 1200, "title": "Lokma Premium — Yillik", "days": 365},
}

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
            # Keyingi dushanba 09:00 (weekday: Mon=0)
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


async def start_web():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", health)
    app.router.add_get("/health", health)
    app.router.add_post("/api/analyze-food", analyze_food_endpoint)
    app.router.add_post("/api/create-invoice", create_invoice_endpoint)
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
    await start_web()
    asyncio.create_task(daily_reminder_loop())
    asyncio.create_task(weekly_report_loop())
    await dp.start_polling(bot)


# ============ Telegram Stars payments ============
@dp.pre_checkout_query()
async def pre_checkout(pre_checkout_q: PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_q.id, ok=True)


@dp.message(F.successful_payment)
async def successful_payment(message: Message):
    payment = message.successful_payment
    payload = payment.invoice_payload  # format: "premium_{plan}_{telegram_id}"
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