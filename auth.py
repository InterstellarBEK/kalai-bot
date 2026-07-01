"""
auth.py — Telegram WebApp initData HMAC tekshirish + Supabase JWT yaratish.

Workflow:
1. Frontend Telegram.WebApp.initData (URL-encoded string) yuboradi
2. Biz HMAC-SHA256 bilan tekshiramiz (Telegram official algoritmi)
3. auth_date 24 soatdan eski bo'lmasligi kerak (replay attack himoyasi)
4. Telegram user.id ni olib, Supabase JWT (HS256) mint qilamiz
5. Frontend bu JWT'ni Supabase client'ga inject qiladi → RLS ishlaydi

Telegram official spec:
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hmac
import hashlib
import json
import time
import os
import logging
from urllib.parse import parse_qsl
from typing import Optional

import jwt as pyjwt
from aiohttp import web

log = logging.getLogger("auth")

# ===== Konfiguratsiya =====
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
JWT_SECRET = os.getenv("JWT_SECRET", "")  # Supabase JWT secret (Dashboard → Settings → API)
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 3600  # 1 soat
INITDATA_MAX_AGE_SECONDS = 86400  # 24 soat
ALLOWED_ORIGINS = [
    "https://kalai-bot.vercel.app",
    "https://lokma.uz",
    "http://localhost:5173",
    "http://localhost:3000",
]


def verify_telegram_init_data(init_data: str, bot_token: str) -> Optional[dict]:
    """
    Telegram initData ni HMAC-SHA256 bilan tekshirish.
    Muvaffaqiyatli bo'lsa parsed dict qaytaradi, aks holda None.
    """
    if not init_data or not bot_token:
        return None

    # Query string ni parse qilish (encoding saqlanadi)
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception as e:
        log.warning("initData parse xatosi: %s", e)
        return None

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        log.warning("initData hash maydoni yo'q")
        return None

    # data_check_string: kalitlar alfavit tartibida, har biri yangi qatorda
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))

    # secret_key = HMAC(key="WebAppData", data=bot_token)
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()

    # calculated_hash = HMAC(secret_key, data_check_string).hex()
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # Timing-safe taqqoslash
    if not hmac.compare_digest(calculated_hash, received_hash):
        log.warning("initData hash mos kelmadi")
        return None

    # auth_date eskirgan emasligini tekshirish (replay attack himoyasi)
    auth_date_str = pairs.get("auth_date", "0")
    try:
        auth_date = int(auth_date_str)
    except ValueError:
        log.warning("initData auth_date noto'g'ri: %s", auth_date_str)
        return None

    age = int(time.time()) - auth_date
    if age > INITDATA_MAX_AGE_SECONDS:
        log.warning("initData eskirgan (yoshi=%ds)", age)
        return None
    if age < -300:  # Soat noto'g'ri sozlangan client uchun 5 daqiqa tolerans
        log.warning("initData kelajakdan (yoshi=%ds)", age)
        return None

    return pairs


def extract_telegram_user(parsed: dict) -> Optional[dict]:
    """parsed['user'] JSON string ni dict qilib qaytaradi."""
    user_json = parsed.get("user")
    if not user_json:
        return None
    try:
        return json.loads(user_json)
    except json.JSONDecodeError:
        log.warning("initData user JSON parse xatosi")
        return None


def mint_supabase_jwt(telegram_id: int, ttl_seconds: int = JWT_EXPIRY_SECONDS) -> str:
    """
    Supabase mos JWT yaratish.
    Claims: sub (telegram_id string), aud='authenticated', role='authenticated'.
    RLS policy auth.jwt()->>'sub' = user_id::text orqali ishlaydi.
    """
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET environment variable o'rnatilmagan")

    now = int(time.time())
    payload = {
        "sub": str(telegram_id),
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + ttl_seconds,
        "telegram_id": telegram_id,  # Convenience claim
    }
    token = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token if isinstance(token, str) else token.decode("utf-8")


# ===== CORS yordamchi =====
def _cors_headers(origin: str) -> dict:
    allow_origin = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "3600",
        "Vary": "Origin",
    }


async def auth_verify_handler(request: web.Request) -> web.Response:
    """
    POST /auth/verify
    Body: { "initData": "..." }
    Response: { "access_token": "...", "telegram_id": 123, "expires_in": 3600 }
    """
    origin = request.headers.get("Origin", "")
    cors = _cors_headers(origin)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid_json"}, status=400, headers=cors)

    init_data = body.get("initData", "")
    if not init_data or not isinstance(init_data, str):
        return web.json_response({"error": "missing_initData"}, status=400, headers=cors)

    parsed = verify_telegram_init_data(init_data, BOT_TOKEN)
    if not parsed:
        return web.json_response({"error": "invalid_signature"}, status=401, headers=cors)

    user = extract_telegram_user(parsed)
    if not user or "id" not in user:
        return web.json_response({"error": "missing_user"}, status=400, headers=cors)

    telegram_id = int(user["id"])

    try:
        token = mint_supabase_jwt(telegram_id)
    except RuntimeError as e:
        log.error("JWT mint xatosi: %s", e)
        return web.json_response({"error": "server_misconfigured"}, status=500, headers=cors)

    return web.json_response(
        {
            "access_token": token,
            "telegram_id": telegram_id,
            "expires_in": JWT_EXPIRY_SECONDS,
        },
        headers=cors,
    )


async def auth_verify_options(request: web.Request) -> web.Response:
    """CORS preflight."""
    origin = request.headers.get("Origin", "")
    return web.Response(status=204, headers=_cors_headers(origin))


def register_auth_routes(app: web.Application) -> None:
    """bot.py'da chaqiring: register_auth_routes(app)"""
    app.router.add_post("/auth/verify", auth_verify_handler)
    app.router.add_options("/auth/verify", auth_verify_options)
    log.info("Auth route'lar ro'yxatdan o'tdi: POST /auth/verify")