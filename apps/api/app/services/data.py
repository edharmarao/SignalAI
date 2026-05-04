"""Synthetic candle generator for backtests when no real data is supplied."""
from __future__ import annotations
import numpy as np
import pandas as pd


def synthetic_candles(days: int = 5, base: float = 22500.0, freq: str = "5min") -> pd.DataFrame:
    bars_per_day = 75  # 9:15 -> 15:30 in 5min
    n = bars_per_day * max(1, days)
    rng = np.random.default_rng(42)
    returns = rng.normal(0, 0.0008, n).cumsum()
    close = base * (1 + returns)
    high = close * (1 + np.abs(rng.normal(0, 0.0005, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.0005, n)))
    open_ = np.r_[close[0], close[:-1]]
    volume = rng.integers(10000, 50000, n)
    times = pd.date_range("2024-01-01 09:15", periods=n, freq=freq)
    return pd.DataFrame(
        {
            "time": times.astype(str),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )
