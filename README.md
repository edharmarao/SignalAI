# Signal AI

> A multi-desk trading platform for Indian markets: **equity strategies**, **options plays**,
> and **mutual fund portfolio tracking** — all in one place.
> Step-by-step strategy builder, live JSON preview, paper-trading by default,
> optional Upstox live execution.
>
> **For education only. Trading involves risk.**

📚 **Docs:** [architecture](./docs/architecture.md) · [implementation](./docs/implementation.md) · [requirements](./docs/requirements.md)

---

## 🖥️ Desks

| Desk | Description |
|---|---|
| 📊 **Equity** | Index futures & equity strategies on NIFTY, BANKNIFTY, FINNIFTY — intraday and positional timeframes |
| 🎯 **Options** | CE / PE directional plays on NIFTY & BANKNIFTY — weekly / monthly expiry, ATM ± strike selection |
| 💰 **Mutual Funds** | Holdings tracker — NAV, XIRR, absolute returns, SIP schedule & category allocation |

---

## ✨ Features

- 🧱 Step-by-step strategy builder (Basics → Entry → Exit → Risk → Review)
- 🧠 Indicators: **RSI, EMA, SMA, VWAP, Supertrend, MACD, Bollinger Bands**
- 🔀 Entry/exit logic with **AND / OR**, up to 2 indicator conditions
- 🛡️ Risk controls: max daily loss, max trades/day, auto square-off, **kill switch**, emergency square-off
- 📄 Plain-English condition summary + raw **JSON preview** before saving
- 🧪 **Backtesting** engine with P&L, win rate, max drawdown
- 📡 **WebSocket** live ticks (simulated by default; pluggable to Upstox feed)
- 🧾 Trades, orders, signals, errors all stored in **logs**
- 🟢 **Paper mode by default** · 🔴 Live mode requires explicit per-order confirmation **and** server-side flag
- 🔑 Supabase magic-link auth + Upstox OAuth broker connection
- 🧰 Strategy templates (RSI breakout, EMA crossover, VWAP reversal, Supertrend, level breakout)
- 🗂️ Duplicate / draft / activate flow

---

## 📁 Monorepo layout

```
apps/
  web/         # Next.js 16 (App Router) + React 19 + TypeScript 6 + Tailwind + Zustand
  api/         # FastAPI + pandas indicators + paper engine + backtester
packages/
  types/       # Shared TS types (StrategyJSON, rows, etc.)
  ui/          # Reusable React UI primitives (Button, Card, Badge…)
  utils/       # validateStrategy, describeStrategy, templates, constants
supabase/
  schema.sql   # Tables + RLS policies
```

---

## ⚙️ Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 6, Tailwind CSS 3, Zustand 4 |
| **Backend** | FastAPI 0.131+, Python **3.14t** (free-threaded / No-GIL), Pydantic v2 |
| **Data** | pandas 2.3+, numpy 2.2+ (No-GIL builds), websockets 14+ |
| **Auth / DB** | Supabase (magic-link auth + Postgres + RLS), PyJWT |
| **Broker** | Upstox v2 REST + OAuth (optional; falls back to simulator) |
| **Runtime** | Node ≥ 22.17.1 |

---

## 🚀 Quick start

### 1. Install JS deps

```bash
npm install
```

This sets up `apps/web` + the `packages/*` workspaces.

### 2. Install API deps

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

> **Python 3.14t (free-threaded)** is required. Download it from [python.org](https://www.python.org/downloads/) or use `pyenv`.

### 3. Configure env

```bash
cp .env.example .env
# Fill in Supabase URL / keys, Upstox client id / secret if you have them.
```

The app works **without** Supabase or Upstox: the API falls back to an
in-memory store and a simulated tick stream so you can develop the UI offline.

### 4. Apply Supabase schema (when ready)

In the Supabase SQL editor, run `supabase/schema.sql`. It creates:
`strategies`, `trades`, `orders`, `logs`, `broker_accounts` with row-level
security so each user only sees their own rows.

### 5. Run the dev servers

```bash
# Terminal 1 — API
npm run api

# Terminal 2 — Web
npm run dev
```

Open <http://localhost:3000>.

---

## 🛡️ Safety model

| Layer | Default | How to enable live |
|---|---|---|
| Strategy `mode` | `paper` | Set in builder + duplicate to live |
| Server flag | `ALLOW_LIVE_TRADING=false` | `.env` change + restart API |
| Per-order | `confirm_live=false` | Explicit `true` from the UI |
| Broker | not connected | Connect Upstox in Settings |

If **any** of these is missing, the API rejects the order. The UI also shows a
**Kill Switch / Emergency Square-Off** button that you can wire to your
running engine.

---

## 🧠 Strategy JSON

Stored as a single JSONB column in the `strategies` table. Versioned via the
top-level `version` field so the schema can evolve safely.

```jsonc
{
  "version": 1,
  "name": "NIFTY RSI Breakout",
  "index": "NIFTY",
  "optionType": "CE",
  "strike": "ATM+100",
  "action": "BUY",
  "candleTime": "5min",
  "quantity": 1,
  "mode": "paper",
  "status": "draft",
  "entry": {
    "logic": "AND",
    "conditions": [
      { "type": "level", "field": "price", "operator": ">", "value": 22500 },
      { "type": "indicator", "indicator": "RSI", "period": 14,
        "operator": ">", "value": 60 }
    ]
  },
  "exit": {
    "logic": "OR",
    "conditions": [
      { "type": "stop_loss", "value": 20 },
      { "type": "target", "value": 50 },
      { "type": "trailing_stop_loss", "value": 10 },
      { "type": "time_exit", "time": "15:15" }
    ]
  },
  "risk": {
    "maxLossPerDay": 2000,
    "maxTradesPerDay": 3,
    "maxOpenPositions": 1,
    "autoSquareOffTime": "15:20"
  }
}
```

Validation rules are enforced **both** in `packages/utils/validateStrategy`
and `apps/api/app/validation.py`:

- name + index + option type + strike + action + candle time required
- quantity > 0
- ≥ 1 entry condition (≤ 2 indicator conditions)
- ≥ 1 exit condition, **stop loss is mandatory**
- max daily loss > 0, auto square-off time set
- live trading also requires a connected broker

---

## 🔌 API surface

```
GET    /                         # info + live-trading flag
GET    /health
GET    /strategies
POST   /strategies
GET    /strategies/{id}
PATCH  /strategies/{id}
POST   /strategies/{id}/duplicate
DELETE /strategies/{id}
POST   /backtest                 # synthetic candles or supplied OHLCV
GET    /trades
GET    /orders
GET    /logs
GET    /instruments
GET    /prices/ltp/{symbol}
POST   /orders/place             # paper by default; live needs confirm_live
GET    /broker/upstox/login-url
POST   /broker/upstox/connect
GET    /broker/accounts
POST   /broker/disconnect
WS     /ws                       # live ticks (simulated by default)
```

---

## 🧱 Architecture decisions

- **Single `strategy_json` JSONB column** with a versioned schema → painless
  migrations, no normalised join tables for every condition.
- **Validation logic shared TS ↔ Python** so the UI fails fast and the API
  is still authoritative.
- **Indicator engine is pure pandas/numpy** – the same code paths run for
  backtests and live paper trading; no duplication.
- **Python 3.14t (free-threaded)** – pandas 2.3+ and numpy 2.2+ No-GIL builds
  allow the indicator and paper engine to release the GIL for true multi-core
  concurrency without extra processes.
- **Live trading is gated by 4 independent layers** (env flag, strategy mode,
  per-order confirmation, broker presence) instead of a single boolean.
- **In-memory Supabase fallback** keeps the API usable offline so you can
  build/demo the UI without setting up Supabase.
- **Row-level security** in Postgres means a misconfigured frontend can never
  leak strategies between users.
- **Pluggable WS feed** – default is a deterministic simulator; swap with
  Upstox `MarketDataFeed` by replacing `_broadcast_loop`.

---

## 🗺️ Roadmap

- Email + Telegram alert channels
- Real-time Upstox `MarketDataFeed` integration
- Per-leg multi-leg options strategies
- Strategy versioning (history + diff)
- Greek-aware exits (delta/gamma stops)
- Equity holdings & portfolio P&L dashboard
- Dockerfile + docker-compose for one-command boot

---

## ⚠️ Disclaimer

Signal AI is provided **for educational purposes only**. Markets involve
substantial risk; past performance is not indicative of future results. You
are solely responsible for any orders placed through your broker connection.
