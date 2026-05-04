"""Pure pandas/numpy implementations of the indicators we support.
Each function takes a DataFrame with columns: time, open, high, low, close, volume."""
from __future__ import annotations
import numpy as np
import pandas as pd


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = -delta.clip(upper=0).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def ema(close: pd.Series, period: int = 20) -> pd.Series:
    return close.ewm(span=period, adjust=False).mean()


def sma(close: pd.Series, period: int = 20) -> pd.Series:
    return close.rolling(period).mean()


def vwap(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3.0
    pv = tp * df["volume"]
    return pv.cumsum() / df["volume"].cumsum().replace(0, np.nan)


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def bollinger(close: pd.Series, period: int = 20, stddev: float = 2.0):
    mid = sma(close, period)
    std = close.rolling(period).std()
    upper = mid + stddev * std
    lower = mid - stddev * std
    return upper, mid, lower


def supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    hl2 = (high + low) / 2.0
    tr = pd.concat(
        [(high - low), (high - close.shift()).abs(), (low - close.shift()).abs()],
        axis=1,
    ).max(axis=1)
    atr = tr.rolling(period).mean()
    upper = hl2 + multiplier * atr
    lower = hl2 - multiplier * atr
    st = pd.Series(index=df.index, dtype=float)
    direction = pd.Series(index=df.index, dtype=int)
    direction.iloc[0] = 1
    st.iloc[0] = lower.iloc[0]
    for i in range(1, len(df)):
        if close.iloc[i] > st.iloc[i - 1]:
            direction.iloc[i] = 1
        elif close.iloc[i] < st.iloc[i - 1]:
            direction.iloc[i] = -1
        else:
            direction.iloc[i] = direction.iloc[i - 1]
        st.iloc[i] = lower.iloc[i] if direction.iloc[i] == 1 else upper.iloc[i]
    return st


def compute(df: pd.DataFrame, name: str, **params):
    n = name.upper()
    if n == "RSI":
        return rsi(df["close"], params.get("period", 14))
    if n == "EMA":
        return ema(df["close"], params.get("period", 20))
    if n == "SMA":
        return sma(df["close"], params.get("period", 20))
    if n == "VWAP":
        return vwap(df)
    if n == "SUPERTREND":
        return supertrend(df, params.get("period", 10), params.get("multiplier", 3.0))
    if n == "MACD":
        line, sig, _ = macd(
            df["close"],
            params.get("fast", 12),
            params.get("slow", 26),
            params.get("signal", 9),
        )
        return line - sig
    if n == "BBANDS":
        upper, mid, lower = bollinger(
            df["close"], params.get("period", 20), params.get("stddev", 2.0)
        )
        return mid
    raise ValueError(f"Unknown indicator: {name}")
