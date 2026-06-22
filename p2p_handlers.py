"""
p2p_handlers.py — Manual P2P payment + SMS auto-verify + Lifetime
"""
import os
import re
import hashlib
import asyncio
from datetime import datetime
from typing import Optional
from aiohttp import web
from aiogram import Dispatcher, Bot, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.filters import Command

_db = None
_bot: Optional[Bot] = None
_admin_ids: set = set()
_admin_chat_id: Optional[int] = None
_sms_token: str = ""

P2P_PLANS = {
    'weekly':  {'title': 'Premium 7 kun',   'amount': 5000,   'days': 7},
    'monthly': {'title': 'Premium 30 kun',  'amount': 15000,  'days': 30},
    'yearly':  {'title': 'Premium 365 kun', 'amount': 120000, 'days': 365},
}

SMS_AMOUNT_PATTERNS = [
    re.compile(r'(?:postuplenie|tushdi|otkazma|prixod|поступление|kirim|hisobga)\s*\+?\s*([\d\s.,]+)\s*(?:UZS|so\'?m|сум)', re.IGNORECASE),
    re.compile(r'\+\s*([\d\s.,]+)\s*(?:UZS|so\'?m|сум)', re.IGNORECASE),
    re.compile(r'summa[:\s]+([\d\s.,]+)\s*(?:UZS|so\'?m|сум)', re.IGNORECASE),
]
SMS_CARD_PATTERN = re.compile(r'\*+(\d{4})')


async def _rpc(name: str, params: dict = None):
    return await _db.rpc(name, params=params or {}).execute()


def parse_bank_sms(text: str) -> dict:
    amount = None
    for pat in SMS_AMOUNT_PATTERNS:
        m = pat.search(text)
        if m:
            raw = m.group(1).replace(' ', '').replace(',', '').replace('.', '')
            try:
                val = int(raw)
                if val >= 1000:
                    amount = val
                    break
            except ValueError:
                continue
    last4 = None
    m = SMS_CARD_PATTERN.search(text)
    if m:
        last4 = m.group(1)
    return {'amount': amount, 'last4': last4}


# ============ SMS endpoint ============
async def bank_sms_endpoint(request: web.Request):
    token = request.headers.get('X-SMS-Token') or request.query.get('token')
    if not _sms_token or token != _sms_token:
        return web.json_response({'error': 'unauthorized'}, status=401)

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'invalid_json'}, status=400)

    raw_text = (data.get('text') or '').strip()
    if not raw_text:
        return web.json_response({'error': 'empty_text'}, status=400)

    parsed = parse_bank_sms(raw_text)
    raw_hash = hashlib.sha256(raw_text.encode()).hexdigest()

    if not parsed['amount']:
        try:
            await _db.from_('bank_sms_logs').insert({
                'raw_text': raw_text, 'raw_hash': raw_hash, 'status': 'ignored'
            }).execute()
        except Exception:
            pass
        return web.json_response({'status': 'ignored', 'reason': 'no_amount'})

    res = await _rpc('auto_verify_by_bank_sms', {
        'p_raw_text': raw_text,
        'p_amount': parsed['amount'],
        'p_card_last4': parsed['last4'],
        'p_raw_hash': raw_hash,
    })
    result = res.data or {}

    if result.get('status') == 'matched':
        tg_id = result.get('telegram_id')
        plan = result.get('plan')
        try:
            await _bot.send_message(
                tg_id,
                f"✅ <b>Premium faollashtirildi!</b>\n\n"
                f"Plan: {P2P_PLANS.get(plan, {}).get('title', plan)}\n"
                f"To'lov avtomatik tasdiqlandi.\n\n"
                f"Rahmat! 🌟",
                parse_mode='HTML'
            )
        except Exception as e:
            print(f"[P2P] notify user failed: {e}", flush=True)
        if _admin_chat_id:
            try:
                await _bot.send_message(
                    _admin_chat_id,
                    f"🤖 SMS auto-verify\n"
                    f"User: <code>{tg_id}</code>\nPlan: {plan}\n"
                    f"Summa: {parsed['amount']:,} UZS",
                    parse_mode='HTML'
                )
            except Exception:
                pass

    return web.json_response(result)


# ============ P2P invoice create ============
async def p2p_create_endpoint(request: web.Request):
    try:
        data = await request.json()
        tg_id = int(data.get('telegram_id'))
        plan = data.get('plan')
        plan_info = P2P_PLANS.get(plan)
        if not plan_info:
            return web.json_response({'error': 'invalid_plan'}, status=400)
        res = await _rpc('create_p2p_payment', {
            'p_telegram_id': tg_id,
            'p_plan': plan,
            'p_base_amount': plan_info['amount'],
            'p_period_days': plan_info['days'],
        })
        result = res.data or {}
        if isinstance(result, dict) and result.get('error'):
            return web.json_response(result, status=400)
        return web.json_response(result)
    except Exception as e:
        print(f"[P2P create] ERROR: {type(e).__name__}: {e}", flush=True)
        return web.json_response({'error': str(e)}, status=500)


# ============ User screenshot fallback ============
# QAYTARADI: True — chek qabul qilindi (Gemini scan o'tkazib yuboriladi)
#            False — pending payment yo'q (Gemini scan davom etadi)
async def handle_p2p_receipt_photo(message: Message) -> bool:
    print(f"[P2P RECEIPT] called for tg_id={message.from_user.id} has_photo={bool(message.photo)}", flush=True)
    if not message.photo:
        return False
    tg_id = message.from_user.id

    # DEBUG: pending paymentlar ro'yxati
    try:
        debug_res = await _db.from_('p2p_payments').select('id,status,expires_at,created_at') \
            .eq('telegram_id', tg_id).eq('status', 'pending') \
            .order('created_at', desc=True).limit(3).execute()
        print(f"[P2P DEBUG] tg_id={tg_id} pending rows: {debug_res.data}", flush=True)
    except Exception as e:
        print(f"[P2P DEBUG] query error: {e}", flush=True)

    # Asosiy query — timezone bilan
    from datetime import timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await _db.from_('p2p_payments').select('*') \
        .eq('telegram_id', tg_id).eq('status', 'pending') \
        .gt('expires_at', now_iso) \
        .order('created_at', desc=True).limit(1).execute()

    print(f"[P2P DEBUG] now={now_iso} matched={len(res.data) if res.data else 0}", flush=True)

    if not res.data:
        return False

    payment = res.data[0]
    file_id = message.photo[-1].file_id
    photo_hash = hashlib.sha256(file_id.encode()).hexdigest()

    rpc_res = await _rpc('submit_p2p_receipt', {
        'p_payment_id': payment['id'],
        'p_telegram_id': tg_id,
        'p_receipt_file_id': file_id,
        'p_receipt_hash': photo_hash,
    })
    result = rpc_res.data or {}

    if result.get('error'):
        if result['error'] == 'duplicate_receipt':
            await message.answer("⚠️ Bu chek allaqachon ishlatilgan.")
        else:
            await message.answer(f"❌ {result.get('message', result['error'])}")
        return True

    await message.answer(
        "✅ Chek qabul qilindi! Admin tekshirib chiqadi.\n"
        "Odatda 5-30 daqiqada tasdiqlanadi."
    )

    if _admin_chat_id:
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text='✅ Tasdiqlash', callback_data=f'p2p_ok:{payment["id"]}'),
            InlineKeyboardButton(text='❌ Rad etish', callback_data=f'p2p_no:{payment["id"]}'),
        ]])
        caption = (
            f"💳 <b>Yangi to'lov</b>\n\n"
            f"ID: #{payment['id']}\n"
            f"User: <code>{tg_id}</code>\n"
            f"Plan: {payment['plan']}\n"
            f"Summa: <b>{payment['total_amount']:,} UZS</b>"
        )
        try:
            await _bot.send_photo(_admin_chat_id, photo=file_id, caption=caption,
                                  reply_markup=kb, parse_mode='HTML')
        except Exception as e:
            print(f"[P2P] admin notify failed: {e}", flush=True)

    return True


# ============ Admin callbacks ============
async def admin_approve_callback(callback: CallbackQuery):
    if callback.from_user.id not in _admin_ids:
        await callback.answer("Ruxsat yo'q", show_alert=True)
        return
    payment_id = int(callback.data.split(':')[1])
    res = await _rpc('verify_p2p_payment', {
        'p_payment_id': payment_id,
        'p_admin_id': callback.from_user.id,
    })
    result = res.data or {}
    if result.get('error'):
        await callback.answer(f"Xato: {result['error']}", show_alert=True)
        return
    tg_id = result.get('telegram_id')
    plan = result.get('plan')
    try:
        await _bot.send_message(
            tg_id,
            f"✅ <b>Premium faollashtirildi!</b>\n\n"
            f"Plan: {P2P_PLANS.get(plan, {}).get('title', plan)}\n\nRahmat! 🌟",
            parse_mode='HTML'
        )
    except Exception:
        pass
    try:
        await callback.message.edit_caption(
            (callback.message.caption or "") + f"\n\n✅ <b>Tasdiqlandi</b> ({callback.from_user.first_name})",
            parse_mode='HTML'
        )
    except Exception:
        pass
    await callback.answer("Tasdiqlandi ✅")


async def admin_reject_callback(callback: CallbackQuery):
    if callback.from_user.id not in _admin_ids:
        await callback.answer("Ruxsat yo'q", show_alert=True)
        return
    payment_id = int(callback.data.split(':')[1])
    res = await _rpc('reject_p2p_payment', {
        'p_payment_id': payment_id,
        'p_admin_id': callback.from_user.id,
        'p_reason': 'Admin rad etdi',
    })
    result = res.data or {}
    if result.get('error'):
        await callback.answer(f"Xato: {result['error']}", show_alert=True)
        return
    try:
        await _bot.send_message(
            result['telegram_id'],
            "❌ <b>To'lov rad etildi.</b>\n\nQaytadan urinib ko'ring yoki qo'llab-quvvatlashga yozing.",
            parse_mode='HTML'
        )
    except Exception:
        pass
    try:
        await callback.message.edit_caption(
            (callback.message.caption or "") + f"\n\n❌ <b>Rad etildi</b> ({callback.from_user.first_name})",
            parse_mode='HTML'
        )
    except Exception:
        pass
    await callback.answer("Rad etildi")


# ============ Lifetime commands ============
async def grant_lifetime_command(message: Message):
    if message.from_user.id not in _admin_ids:
        await message.answer(
            f"⛔ Admin emas.\nSening ID: <code>{message.from_user.id}</code>\n"
            f"Admin ro'yxati: <code>{sorted(_admin_ids)}</code>",
            parse_mode='HTML'
        )
        return
    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("Format: <code>/grant TELEGRAM_ID [sabab]</code>", parse_mode='HTML')
        return
    try:
        target_id = int(parts[1])
    except ValueError:
        await message.answer("telegram_id raqam bo'lishi kerak")
        return
    reason = ' '.join(parts[2:]) if len(parts) > 2 else None
    try:
        res = await _rpc('grant_lifetime_premium', {
            'p_telegram_id': target_id,
            'p_granted_by': message.from_user.id,
            'p_reason': reason,
        })
        raw = res.data
        if isinstance(raw, list):
            result = raw[0] if raw else {}
        elif isinstance(raw, dict):
            result = raw
        else:
            result = {}
        if isinstance(result, dict) and result.get('error'):
            await message.answer(f"❌ DB xato: <code>{result.get('error')}</code>\nMessage: {result.get('message','')}", parse_mode='HTML')
            return
        await message.answer(
            f"✅ <code>{target_id}</code> ga umrbod Premium berildi.\n"
            f"Natija: <code>{result}</code>",
            parse_mode='HTML'
        )
    except Exception as e:
        await message.answer(
            f"❌ Exception:\n<code>{type(e).__name__}: {str(e)[:500]}</code>",
            parse_mode='HTML'
        )
        return
    try:
        await _bot.send_message(
            target_id,
            "🎁 <b>Sizga umrbod Premium berildi!</b>\n\n"
            "Endi barcha Premium funksiyalardan cheksiz foydalanishingiz mumkin. 🌟",
            parse_mode='HTML'
        )
    except Exception:
        pass


async def revoke_lifetime_command(message: Message):
    if message.from_user.id not in _admin_ids:
        return
    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("Format: <code>/revoke TELEGRAM_ID</code>", parse_mode='HTML')
        return
    try:
        target_id = int(parts[1])
    except ValueError:
        await message.answer("telegram_id raqam bo'lishi kerak")
        return
    res = await _rpc('revoke_lifetime_premium', {
        'p_telegram_id': target_id,
        'p_revoked_by': message.from_user.id,
    })
    result = res.data or {}
    if result.get('error'):
        await message.answer(f"❌ {result['error']}")
        return
    await message.answer(f"✅ <code>{target_id}</code> dan umrbod Premium olib qo'yildi.", parse_mode='HTML')


# ============ Expire loop ============
async def expire_loop():
    while True:
        try:
            res = await _rpc('expire_old_p2p_payments', {})
            if res.data:
                for row in res.data:
                    try:
                        await _bot.send_message(
                            row['telegram_id'],
                            "⏰ To'lov vaqti tugadi (30 daqiqa).\nQaytadan urinib ko'ring."
                        )
                    except Exception:
                        pass
        except Exception as e:
            print(f"[P2P expire] {e}", flush=True)
        await asyncio.sleep(300)


# ============ Setup ============
def setup_p2p(dp: Dispatcher, bot: Bot, db, app: web.Application,
              admin_ids, admin_chat_id, sms_token):
    global _db, _bot, _admin_ids, _admin_chat_id, _sms_token
    _db = db
    _bot = bot
    _admin_ids = set(admin_ids or [])
    _admin_chat_id = admin_chat_id
    _sms_token = sms_token or ""

    app.router.add_post('/api/bank-sms', bank_sms_endpoint)
    app.router.add_post('/api/p2p/create', p2p_create_endpoint)

    # NOTE: handle_p2p_receipt_photo bot.py'dagi handle_photo ichidan chaqiriladi
    dp.callback_query.register(admin_approve_callback, F.data.startswith('p2p_ok:'))
    dp.callback_query.register(admin_reject_callback, F.data.startswith('p2p_no:'))
    dp.message.register(grant_lifetime_command, Command('grant'))
    dp.message.register(revoke_lifetime_command, Command('revoke'))

    asyncio.create_task(expire_loop())
    print("[P2P] handlers registered", flush=True)