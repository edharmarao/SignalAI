"""
Dynamic NSE instrument map loader.

Downloads the Upstox NSE instrument CSV and builds a
  tradingsymbol → ISIN  mapping for NSE_EQ EQUITY instruments.

The map is refreshed once per day (lazy, on first access).
"""
from __future__ import annotations

import csv
import gzip
import io
import logging
import threading
import time
from typing import Dict, Optional

import urllib.request

logger = logging.getLogger("signal_ai")

INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz"

# Fallback hardcoded map (Nifty 50 + a few extras) used if download fails
_FALLBACK: Dict[str, str] = {
    "RELIANCE": "INE002A01018", "TCS": "INE467B01029", "HDFCBANK": "INE040A01034",
    "INFY": "INE009A01021", "HINDUNILVR": "INE030A01027", "ICICIBANK": "INE090A01021",
    "SBIN": "INE062A01020", "BHARTIARTL": "INE397D01024", "KOTAKBANK": "INE237A01028",
    "LT": "INE018A01030", "AXISBANK": "INE238A01034", "ASIANPAINT": "INE021A01026",
    "MARUTI": "INE585B01010", "SUNPHARMA": "INE044A01036", "TITAN": "INE280A01028",
    "BAJFINANCE": "INE296A01024", "NESTLEIND": "INE239A01016", "WIPRO": "INE075A01022",
    "HCLTECH": "INE860A01027", "ULTRACEMCO": "INE481G01011", "TECHM": "INE669C01036",
    "POWERGRID": "INE752E01010", "NTPC": "INE733E01010", "COALINDIA": "INE522F01014",
    "GRASIM": "INE047A01021", "BPCL": "INE029A01011", "ONGC": "INE213A01029",
    "IOC": "INE242A01010", "JSWSTEEL": "INE019A01038", "TATASTEEL": "INE081A01020",
    "TATAMOTORS": "INE155A01022", "BAJAJFINSV": "INE918I01026", "ADANIPORTS": "INE742F01042",
    "DRREDDY": "INE089A01023", "CIPLA": "INE059A01026", "DIVISLAB": "INE361B01024",
    "EICHERMOT": "INE066A01021", "HEROMOTOCO": "INE158A01026", "HINDALCO": "INE038A01020",
    "INDUSINDBK": "INE095A01012", "APOLLOHOSP": "INE437A01024", "PIDILITIND": "INE318A01026",
    "DMART": "INE192R01011", "HAVELLS": "INE176B01034", "MUTHOOTFIN": "INE414G01012",
    "COLPAL": "INE259A01022", "DABUR": "INE016A01026", "MARICO": "INE196A01026",
    "BRITANNIA": "INE216A01030", "ITC": "INE154A01025", "TATACONSUM": "INE192A01025",
    "VEDL": "INE205A01025", "HAL": "INE066F01020", "BEL": "INE263A01024",
    "IRCTC": "INE335Y01020", "PERSISTENT": "INE262H01021",
    "COFORGE": "INE591G01017", "LTIM": "INE214T01019", "TRENT": "INE849A01020",
    "TATAPOWER": "INE245A01021", "RECLTD": "INE020B01018", "PFC": "INE134E01011",
    "HDFCLIFE": "INE795G01014", "ICICIGI": "INE765G01017", "SBILIFE": "INE123W01016",
}

_lock = threading.Lock()
_cache: Dict[str, str] = {}
_last_loaded: float = 0.0
_REFRESH_INTERVAL = 86400  # 1 day


def _load_from_url() -> Dict[str, str]:
    """Download and parse Upstox NSE CSV → {tradingsymbol: ISIN}."""
    logger.info("Downloading Upstox NSE instrument CSV from %s", INSTRUMENTS_URL)
    with urllib.request.urlopen(INSTRUMENTS_URL, timeout=30) as resp:
        compressed = resp.read()

    with gzip.open(io.BytesIO(compressed), "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        result: Dict[str, str] = {}
        for row in reader:
            if row.get("exchange") == "NSE_EQ" and row.get("instrument_type") == "EQUITY":
                key = row.get("instrument_key", "")  # e.g. "NSE_EQ|INE466L01038"
                symbol = row.get("tradingsymbol", "").strip().upper()
                if "|" in key and symbol:
                    isin = key.split("|", 1)[1]
                    result[symbol] = isin
    logger.info("Loaded %d NSE EQ instruments from Upstox CSV", len(result))
    return result


def get_instrument_map() -> Dict[str, str]:
    """Return the symbol→ISIN map, refreshing from Upstox CSV if stale."""
    global _cache, _last_loaded

    now = time.time()
    if _cache and (now - _last_loaded) < _REFRESH_INTERVAL:
        return _cache

    with _lock:
        # Double-checked locking
        if _cache and (now - _last_loaded) < _REFRESH_INTERVAL:
            return _cache

        try:
            fresh = _load_from_url()
            if fresh:
                _cache = fresh
                _last_loaded = now
                return _cache
        except Exception as exc:
            logger.warning("Failed to load Upstox instrument CSV: %s. Using fallback map.", exc)

        # Use fallback if not already loaded
        if not _cache:
            _cache = dict(_FALLBACK)
            _last_loaded = now

    return _cache


def get_isin(symbol: str) -> Optional[str]:
    """Look up ISIN for a given NSE trading symbol."""
    return get_instrument_map().get(symbol.upper())


def refresh_instrument_map() -> int:
    """Force-refresh the instrument map. Returns number of symbols loaded."""
    global _last_loaded
    _last_loaded = 0  # invalidate cache
    m = get_instrument_map()
    return len(m)
