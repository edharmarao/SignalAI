"""
Upstox Token Fetch Job
======================
Fetches a fresh Upstox access token via OAuth and stores it in Redis.
Sends Telegram notifications on success / failure.

Upstox tokens expire daily. Run this script once per day (e.g. at 08:00 IST
via cron) to keep the token fresh.

Flow:
  1. Build the Upstox OAuth authorization URL.
  2. Open it in the browser (or print it for manual open).
  3. User logs in → Upstox redirects to UPSTOX_REDIRECT_URI?code=<code>
  4. User pastes the full redirect URL (or just the code) here.
  5. Script exchanges the code for an access_token via Upstox API.
  6. access_token + refresh_token are stored in Redis as:
       HSET upstox access_token  <token>
       HSET upstox refresh_token <token>
       HSET upstox client_id     <id>
       HSET upstox token_date    <datetime>

Usage:
  cd /path/to/SignalAI
  backend/.venv/bin/python3 jobs/upstox_token_job.py

Optional args:
  --env   .env file path (default: .env in project root)
  --code  Skip browser step and provide the auth code directly
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import webbrowser
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import redis
import requests
from dotenv import load_dotenv

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("upstox_token_job")

# ── Constants ─────────────────────────────────────────────────────────────────
UPSTOX_AUTH_URL   = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL  = "https://api.upstox.com/v2/login/authorization/token"
REDIS_HASH_KEY    = "upstox"


# ── Telegram ──────────────────────────────────────────────────────────────────

def _telegram(message: str) -> bool:
    """Send a Telegram message. Never raises — logs and returns False on failure."""
    token      = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id    = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        logger.warning("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)")
        return False
    try:
        url  = f"https://api.telegram.org/bot{token}/sendMessage"
        resp = requests.get(url, params={"chat_id": chat_id, "text": message}, timeout=10)
        resp.raise_for_status()
        logger.info("Telegram notification sent")
        return True
    except Exception as exc:
        logger.error("Failed to send Telegram message: %s", exc)
        return False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_env(env_path: str | None) -> None:
    if env_path:
        load_dotenv(env_path, override=True)
        logger.info("Loaded env from %s", env_path)
        return

    here = Path(__file__).resolve().parent
    for candidate in [here, here.parent, here.parent.parent]:
        f = candidate / ".env"
        if f.exists():
            load_dotenv(f, override=True)
            logger.info("Loaded env from %s", f)
            return

    logger.warning("No .env file found — relying on environment variables")


def _require(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        msg = f"Missing required env var: {name}"
        logger.error(msg)
        _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
        sys.exit(1)
    return val


def _redis_client() -> redis.Redis:
    host     = os.getenv("REDIS_HOST", "localhost")
    port     = int(os.getenv("REDIS_PORT", "6379"))
    password = os.getenv("REDIS_PASSWORD") or None
    try:
        r = redis.Redis(host=host, port=port, password=password, decode_responses=True)
        r.ping()
        logger.info("Connected to Redis at %s:%s", host, port)
        return r
    except Exception as exc:
        msg = f"Cannot connect to Redis at {host}:{port} — {exc}"
        logger.error(msg)
        _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
        sys.exit(1)


def _build_auth_url(client_id: str, redirect_uri: str) -> str:
    return (
        f"{UPSTOX_AUTH_URL}"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&state=signal_ai"
    )


def _extract_code(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("http"):
        parsed = urlparse(raw)
        params = parse_qs(parsed.query)
        codes = params.get("code")
        if not codes:
            msg = f"No 'code' parameter found in URL: {raw}"
            logger.error(msg)
            _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
            sys.exit(1)
        return codes[0]
    return raw


def _exchange_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    logger.info("Exchanging authorization code for access token …")
    try:
        resp = requests.post(
            UPSTOX_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     client_id,
                "client_secret": client_secret,
                "redirect_uri":  redirect_uri,
                "grant_type":    "authorization_code",
            },
            headers={"Accept": "application/json"},
            timeout=30,
        )
        if not resp.ok:
            msg = f"Token exchange failed: HTTP {resp.status_code} — {resp.text}"
            logger.error(msg)
            _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
            sys.exit(1)
        return resp.json()
    except Exception as exc:
        msg = f"Token exchange request error: {exc}"
        logger.error(msg)
        _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
        sys.exit(1)


def _save_to_redis(r: redis.Redis, token_data: dict) -> None:
    access_token  = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    user_id       = token_data.get("user_id", "")
    token_date    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not access_token:
        msg = f"No access_token in response: {token_data}"
        logger.error(msg)
        _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
        sys.exit(1)

    r.hset(REDIS_HASH_KEY, "access_token", access_token)
    r.hset(REDIS_HASH_KEY, "token_date",   token_date)
    if refresh_token:
        r.hset(REDIS_HASH_KEY, "refresh_token", refresh_token)
    if user_id:
        r.hset(REDIS_HASH_KEY, "client_id",     user_id)

    logger.info("✅  Token saved to Redis  [key=%s]", REDIS_HASH_KEY)
    logger.info("    access_token : %s…", access_token[:30])
    logger.info("    token_date   : %s",  token_date)
    if user_id:
        logger.info("    user_id      : %s", user_id)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Upstox access token and store in Redis")
    parser.add_argument("--env",  default=None, help="Path to .env file")
    parser.add_argument("--code", default=None, help="Authorization code (skip browser step)")
    args = parser.parse_args()

    _load_env(args.env)

    start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info("=" * 60)
    logger.info("SignalAI | Upstox Token Job  started at %s", start_time)
    logger.info("=" * 60)
    _telegram(f"🚀 SignalAI | Upstox Token Job started at {start_time}")

    client_id     = _require("UPSTOX_CLIENT_ID")
    client_secret = _require("UPSTOX_CLIENT_SECRET")
    redirect_uri  = _require("UPSTOX_REDIRECT_URI")

    r = _redis_client()

    # ── Step 1: get authorization code ───────────────────────────────────────
    if args.code:
        code = _extract_code(args.code)
        logger.info("Using provided authorization code")
    else:
        auth_url = _build_auth_url(client_id, redirect_uri)
        logger.info("")
        logger.info("Open this URL in your browser to log in to Upstox:")
        logger.info("")
        logger.info("  %s", auth_url)
        logger.info("")
        logger.info("After login, Upstox will redirect to:")
        logger.info("  %s?code=<authorization_code>", redirect_uri)
        logger.info("")
        logger.info("Paste the full redirect URL or just the code below.")

        # Also send the login URL to Telegram so you can tap it from your phone
        _telegram(
            f"🔑 SignalAI | Upstox Login Required\n"
            f"Open this URL on your phone to authenticate:\n{auth_url}"
        )

        try:
            webbrowser.open(auth_url)
        except Exception:
            pass

        raw = input("\nPaste redirect URL or authorization code: ").strip()
        if not raw:
            msg = "No input provided. Exiting."
            logger.error(msg)
            _telegram(f"❌ SignalAI | Upstox Token Job FAILED\n{msg}")
            sys.exit(1)
        code = _extract_code(raw)

    logger.info("Authorization code: %s…", code[:10])

    # ── Step 2: exchange code for token ──────────────────────────────────────
    token_data = _exchange_code(code, client_id, client_secret, redirect_uri)

    # ── Step 3: store in Redis ────────────────────────────────────────────────
    _save_to_redis(r, token_data)

    end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info("")
    logger.info("=" * 60)
    logger.info("SignalAI | Upstox Token Job  finished at %s", end_time)
    logger.info("=" * 60)

    user_id = token_data.get("user_id", "")
    _telegram(
        f"✅ SignalAI | Upstox Token Refreshed Successfully\n"
        f"User     : {user_id}\n"
        f"Time     : {end_time}\n"
        f"Token    : {token_data.get('access_token', '')[:20]}…"
    )


if __name__ == "__main__":
    main()
