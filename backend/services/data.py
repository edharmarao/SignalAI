"""Synthetic candle generator for backtests when no real data is supplied."""
from __future__ import annotations
import math
import numpy as np
import pandas as pd


def _seed(symbol: str) -> int:
    return sum((i + 1) * ord(ch) for i, ch in enumerate((symbol or "NIFTY").upper()))


def synthetic_candles(days: int = 5, strategy: dict | None = None) -> pd.DataFrame:
    strategy = strategy or {}
    desk = strategy.get("desk", "options")
    candle_time = strategy.get("candleTime", "5min")
    symbol = strategy.get("symbol") or strategy.get("index") or "NIFTY"
    is_equity = desk == "equity"

    intraday_bars = {"15sec": 1500, "1min": 375, "5min": 75, "15min": 25, "1H": 7}
    freq_map = {"15sec": "15s", "1min": "1min", "5min": "5min", "15min": "15min", "1H": "1H", "EOD": "1D", "Weekly": "1W"}

    if candle_time == "Weekly":
        n = max(1, math.ceil(days / 5))
    elif candle_time == "EOD":
        n = max(1, days)
    else:
        n = max(1, intraday_bars.get(candle_time, 75) * max(1, days))

    seed = _seed(symbol)
    rng = np.random.default_rng(seed)
    base = float(seed % 3000 + 1000) if is_equity else 22500.0
    day_factor = 1 / max(intraday_bars.get(candle_time, 1), 1) if candle_time not in {"EOD", "Weekly"} else (5 if candle_time == "Weekly" else 1)
    sigma = 0.015 * math.sqrt(day_factor) if is_equity else (18.0 / base) * math.sqrt(day_factor)
    returns = rng.normal(0, sigma, n)

    close = np.empty(n)
    close[0] = base
    for i in range(1, n):
        close[i] = max(10.0, close[i - 1] * (1 + returns[i]))
    open_ = np.r_[close[0], close[:-1]]
    spread = np.abs(rng.normal(0, sigma / 2, n))
    high = np.maximum(open_, close) * (1 + spread)
    low = np.minimum(open_, close) * np.maximum(0.01, 1 - spread)
    volume_low = 100000 if is_equity else 10000
    volume_high = 5000000 if is_equity else 50000
    volume = rng.integers(volume_low, volume_high, n)
    times = pd.date_range("2024-01-01 09:15", periods=n, freq=freq_map.get(candle_time, "5min"))
    return pd.DataFrame(
        {
            "time": times.astype(str),
            "open": open_.round(2),
            "high": high.round(2),
            "low": low.round(2),
            "close": close.round(2),
            "volume": volume,
        }
    )
