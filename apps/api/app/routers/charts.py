from __future__ import annotations
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt
from random import Random
from typing import Literal

from fastapi import APIRouter, Query

router = APIRouter(prefix="/charts", tags=["charts"])

Timeframe = Literal["5m", "15m", "1D", "1W", "1M", "1Y"]

NIFTY500_STOCKS = [
    {"symbol": "RELIANCE", "name": "Reliance Industries", "sector": "Energy"},
    {"symbol": "TCS", "name": "Tata Consultancy Services", "sector": "IT"},
    {"symbol": "HDFCBANK", "name": "HDFC Bank", "sector": "Banking"},
    {"symbol": "INFY", "name": "Infosys", "sector": "IT"},
    {"symbol": "HINDUNILVR", "name": "Hindustan Unilever", "sector": "FMCG"},
    {"symbol": "ICICIBANK", "name": "ICICI Bank", "sector": "Banking"},
    {"symbol": "SBIN", "name": "State Bank of India", "sector": "Banking"},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel", "sector": "Telecom"},
    {"symbol": "KOTAKBANK", "name": "Kotak Mahindra Bank", "sector": "Banking"},
    {"symbol": "LT", "name": "Larsen & Toubro", "sector": "Infrastructure"},
    {"symbol": "AXISBANK", "name": "Axis Bank", "sector": "Banking"},
    {"symbol": "ASIANPAINT", "name": "Asian Paints", "sector": "Paints"},
    {"symbol": "MARUTI", "name": "Maruti Suzuki", "sector": "Auto"},
    {"symbol": "SUNPHARMA", "name": "Sun Pharmaceutical", "sector": "Pharma"},
    {"symbol": "TITAN", "name": "Titan Company", "sector": "Consumer"},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance", "sector": "NBFC"},
    {"symbol": "NESTLEIND", "name": "Nestle India", "sector": "FMCG"},
    {"symbol": "WIPRO", "name": "Wipro", "sector": "IT"},
    {"symbol": "HCLTECH", "name": "HCL Technologies", "sector": "IT"},
    {"symbol": "ULTRACEMCO", "name": "UltraTech Cement", "sector": "Cement"},
    {"symbol": "TECHM", "name": "Tech Mahindra", "sector": "IT"},
    {"symbol": "POWERGRID", "name": "Power Grid Corporation", "sector": "Utilities"},
    {"symbol": "NTPC", "name": "NTPC", "sector": "Utilities"},
    {"symbol": "COALINDIA", "name": "Coal India", "sector": "Mining"},
    {"symbol": "GRASIM", "name": "Grasim Industries", "sector": "Diversified"},
    {"symbol": "BPCL", "name": "Bharat Petroleum", "sector": "Energy"},
    {"symbol": "ONGC", "name": "Oil & Natural Gas Corp", "sector": "Energy"},
    {"symbol": "IOC", "name": "Indian Oil Corporation", "sector": "Energy"},
    {"symbol": "JSWSTEEL", "name": "JSW Steel", "sector": "Metals"},
    {"symbol": "TATASTEEL", "name": "Tata Steel", "sector": "Metals"},
    {"symbol": "TATAMOTORS", "name": "Tata Motors", "sector": "Auto"},
    {"symbol": "MM", "name": "Mahindra & Mahindra", "sector": "Auto"},
    {"symbol": "BAJAJFINSV", "name": "Bajaj Finserv", "sector": "Financial Services"},
    {"symbol": "ADANIPORTS", "name": "Adani Ports", "sector": "Infrastructure"},
    {"symbol": "DRREDDY", "name": "Dr. Reddy's Laboratories", "sector": "Pharma"},
    {"symbol": "CIPLA", "name": "Cipla", "sector": "Pharma"},
    {"symbol": "DIVISLAB", "name": "Divi's Laboratories", "sector": "Pharma"},
    {"symbol": "EICHERMOT", "name": "Eicher Motors", "sector": "Auto"},
    {"symbol": "HEROMOTOCO", "name": "Hero MotoCorp", "sector": "Auto"},
    {"symbol": "HINDALCO", "name": "Hindalco Industries", "sector": "Metals"},
    {"symbol": "INDUSINDBK", "name": "IndusInd Bank", "sector": "Banking"},
    {"symbol": "APOLLOHOSP", "name": "Apollo Hospitals", "sector": "Healthcare"},
    {"symbol": "PIDILITIND", "name": "Pidilite Industries", "sector": "Chemicals"},
    {"symbol": "DMART", "name": "Avenue Supermarts (DMart)", "sector": "Retail"},
    {"symbol": "HAVELLS", "name": "Havells India", "sector": "Consumer Electricals"},
    {"symbol": "MUTHOOTFIN", "name": "Muthoot Finance", "sector": "NBFC"},
    {"symbol": "BERGERPAINTS", "name": "Berger Paints", "sector": "Paints"},
    {"symbol": "COLPAL", "name": "Colgate-Palmolive India", "sector": "FMCG"},
    {"symbol": "DABUR", "name": "Dabur India", "sector": "FMCG"},
    {"symbol": "MARICO", "name": "Marico", "sector": "FMCG"},
    {"symbol": "GODREJCP", "name": "Godrej Consumer Products", "sector": "FMCG"},
    {"symbol": "PGHH", "name": "Procter & Gamble Hygiene", "sector": "FMCG"},
    {"symbol": "BRITANNIA", "name": "Britannia Industries", "sector": "FMCG"},
    {"symbol": "ITC", "name": "ITC", "sector": "FMCG"},
    {"symbol": "TATACONSUM", "name": "Tata Consumer Products", "sector": "FMCG"},
    {"symbol": "VEDL", "name": "Vedanta", "sector": "Metals"},
    {"symbol": "SIEMENS", "name": "Siemens India", "sector": "Industrials"},
    {"symbol": "ABB", "name": "ABB India", "sector": "Industrials"},
    {"symbol": "BHEL", "name": "Bharat Heavy Electricals", "sector": "Industrials"},
    {"symbol": "HAL", "name": "Hindustan Aeronautics", "sector": "Defence"},
    {"symbol": "BEL", "name": "Bharat Electronics", "sector": "Defence"},
    {"symbol": "IRCTC", "name": "IRCTC", "sector": "Travel"},
    {"symbol": "DELHIVERY", "name": "Delhivery", "sector": "Logistics"},
    {"symbol": "NYKAA", "name": "Nykaa (FSN E-Commerce)", "sector": "E-Commerce"},
    {"symbol": "PAYTM", "name": "Paytm (One97 Communications)", "sector": "Fintech"},
    {"symbol": "ZOMATO", "name": "Zomato", "sector": "Food Tech"},
    {"symbol": "POLICYBZR", "name": "PB Fintech (Policybazaar)", "sector": "Fintech"},
    {"symbol": "PERSISTENT", "name": "Persistent Systems", "sector": "IT"},
    {"symbol": "COFORGE", "name": "Coforge", "sector": "IT"},
    {"symbol": "MPHASIS", "name": "Mphasis", "sector": "IT"},
    {"symbol": "LTIM", "name": "LTIMindtree", "sector": "IT"},
    {"symbol": "OFSS", "name": "Oracle Financial Services", "sector": "IT"},
    {"symbol": "TRENT", "name": "Trent", "sector": "Retail"},
    {"symbol": "PAGEIND", "name": "Page Industries", "sector": "Textiles"},
    {"symbol": "VARUNBEV", "name": "Varun Beverages", "sector": "Beverages"},
    {"symbol": "JUBLFOOD", "name": "Jubilant Foodworks", "sector": "QSR"},
    {"symbol": "DEVYANI", "name": "Devyani International", "sector": "QSR"},
    {"symbol": "WESTLIFE", "name": "Westlife Foodworld", "sector": "QSR"},
    {"symbol": "CROMPTON", "name": "Crompton Greaves Consumer", "sector": "Consumer Electricals"},
    {"symbol": "VOLTAS", "name": "Voltas", "sector": "Consumer Electricals"},
    {"symbol": "WHIRLPOOL", "name": "Whirlpool of India", "sector": "Consumer Electricals"},
    {"symbol": "TATAPOWER", "name": "Tata Power", "sector": "Utilities"},
    {"symbol": "ADANIGREEN", "name": "Adani Green Energy", "sector": "Utilities"},
    {"symbol": "TORNTPOWER", "name": "Torrent Power", "sector": "Utilities"},
    {"symbol": "CESC", "name": "CESC", "sector": "Utilities"},
    {"symbol": "NHPC", "name": "NHPC", "sector": "Utilities"},
    {"symbol": "RECLTD", "name": "REC Limited", "sector": "Financial Services"},
    {"symbol": "PFC", "name": "Power Finance Corporation", "sector": "Financial Services"},
    {"symbol": "IRFC", "name": "Indian Railway Finance Corp", "sector": "Financial Services"},
    {"symbol": "MMFIN", "name": "Mahindra & Mahindra Financial", "sector": "NBFC"},
    {"symbol": "CHOLAFIN", "name": "Cholamandalam Investment", "sector": "NBFC"},
    {"symbol": "HDFCLIFE", "name": "HDFC Life Insurance", "sector": "Insurance"},
    {"symbol": "ICICIGI", "name": "ICICI Lombard General Insurance", "sector": "Insurance"},
    {"symbol": "SBILIFE", "name": "SBI Life Insurance", "sector": "Insurance"},
]

_BARS_PER_DAY = {"5m": 75, "15m": 25, "1D": 1, "1W": 1 / 5, "1M": 1 / 21, "1Y": 1 / 252}


def _seed(symbol: str) -> int:
    return sum((i + 1) * ord(ch) for i, ch in enumerate(symbol.upper()))


def _base_price(symbol: str) -> float:
    return float(_seed(symbol) % 4000 + 500)


def _parse_date(raw: str | None, fallback: date) -> date:
    if not raw:
        return fallback
    return datetime.strptime(raw, "%Y-%m-%d").date()


def _business_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def _intraday_points(days: list[date], minutes: int, bars_per_day: int) -> list[datetime]:
    points: list[datetime] = []
    for day in days:
        start_dt = datetime.combine(day, time(9, 15))
        for idx in range(bars_per_day):
            points.append(start_dt + timedelta(minutes=minutes * idx))
    return points


def _time_points(start: date, end: date, timeframe: Timeframe) -> list[datetime]:
    business_days = _business_days(start, end)
    if timeframe == "5m":
        return _intraday_points(business_days, 5, 75)
    if timeframe == "15m":
        return _intraday_points(business_days, 15, 25)
    if timeframe == "1D":
        return [datetime.combine(day, time(15, 30)) for day in business_days]
    step = {"1W": 5, "1M": 21, "1Y": 252}[timeframe]
    sampled = business_days[::step] or business_days[-1:]
    return [datetime.combine(day, time(15, 30)) for day in sampled]


def _generate_candles(symbol: str, timeframe: Timeframe, start: date, end: date, limit: int) -> list[dict[str, float | int]]:
    points = _time_points(start, end, timeframe)
    if not points:
        return []
    points = points[-min(max(limit, 1), 2000):]
    rng = Random(_seed(symbol) + len(points) + len(timeframe))
    prev_close = _base_price(symbol)
    day_scale = _BARS_PER_DAY[timeframe]
    vol = 0.015 * sqrt(1 / day_scale if day_scale >= 1 else 1 / max(day_scale, 1e-9))
    candles: list[dict[str, float | int]] = []
    for idx, point in enumerate(points):
        drift = 0.0002 if idx % 11 == 0 else 0.0
        ret = rng.gauss(drift, vol)
        close = max(10.0, prev_close * (1 + ret))
        wick = abs(rng.gauss(0.0, vol / 2))
        open_ = prev_close
        high = max(open_, close) * (1 + wick)
        low = min(open_, close) * max(0.01, 1 - wick)
        volume = int(250_000 + rng.random() * 5_000_000 * max(day_scale, 1))
        candles.append({
            "t": int(point.replace(tzinfo=timezone.utc).timestamp() * 1000),
            "o": round(open_, 2),
            "h": round(high, 2),
            "l": round(low, 2),
            "c": round(close, 2),
            "v": volume,
        })
        prev_close = close
    return candles


@router.get("/symbols")
def list_chart_symbols():
    return [
        {"symbol": row["symbol"], "bars": 900 + (_seed(row["symbol"]) % 1100)}
        for row in NIFTY500_STOCKS
    ]


@router.get("/candles")
def get_candles(
    symbol: str = Query("RELIANCE"),
    timeframe: Timeframe = Query("1W"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    limit: int = Query(200, ge=1, le=2000),
):
    end = _parse_date(to, date.today())
    start = _parse_date(from_, end - timedelta(days=365))
    candles = _generate_candles(symbol.upper(), timeframe, start, end, limit)
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "count": len(candles),
        "candles": candles,
    }


@router.get("/summary")
def get_summary(symbol: str = Query("RELIANCE")):
    end = date.today()
    start = end - timedelta(days=400)
    candles = _generate_candles(symbol.upper(), "1D", start, end, 400)
    if not candles:
        return {
            "symbol": symbol.upper(),
            "latestClose": 0,
            "latestDate": None,
            "high52w": 0,
            "low52w": 0,
            "avgVolume": 0,
        }
    closes = [float(c["c"]) for c in candles]
    volumes = [int(c["v"]) for c in candles]
    latest = candles[-1]
    latest_date = datetime.fromtimestamp(int(latest["t"]) / 1000, tz=timezone.utc).date().isoformat()
    return {
        "symbol": symbol.upper(),
        "latestClose": round(float(latest["c"]), 2),
        "latestDate": latest_date,
        "high52w": round(max(closes), 2),
        "low52w": round(min(closes), 2),
        "avgVolume": round(sum(volumes) / len(volumes), 2),
    }
