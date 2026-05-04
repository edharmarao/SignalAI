# Signal AI – Architecture

> Options trading **strategy builder** for Indian indexes (NIFTY, BANKNIFTY,
> FINNIFTY, SENSEX). Build → backtest → run in paper mode → optionally
> promote to live trading with strict guardrails.

---

## 1. High-level shape

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Browser                                   │
│  Next.js 14 (App Router) · React · Tailwind · Zustand                  │
│  Pages: dashboard / strategies / new / details / trades / backtest /   │
│         logs / settings / login                                        │
└──────────────┬───────────────────────────────────────┬─────────────────┘
               │ fetch (REST)                          │ WebSocket
               ▼                                       ▼
┌──────────────────────────────────────────────┐  ┌────────────────────┐
│              FastAPI backend                 │  │  WS manager        │
│  routers: strategies / backtest /            │  │  /ws/prices        │
│           instruments / prices / orders /    │  │  fan-out ticks     │
│           broker / records / ws              │  └─────────┬──────────┘
│  services: indicators · engine · upstox ·    │            │
│            data · ws_manager                 │            │
└────────┬───────────────┬─────────────────────┘            │
         │               │                                  │
         ▼               ▼                                  ▼
   ┌──────────┐    ┌──────────────┐                ┌────────────────┐
   │ Supabase │    │ Upstox API   │  market data → │ Live ticks /   │
   │ Postgres │    │ (broker)     │ ─────────────▶ │ candle stream  │
   │ + Auth   │    │              │ orders ──────▶ │                │
   └──────────┘    └──────────────┘                └────────────────┘
```

Two apps + three shared packages, glued by **npm workspaces**:

| Path                  | Role                                                   |
| --------------------- | ------------------------------------------------------ |
| `apps/web`            | Next.js 14 frontend (App Router)                       |
| `apps/api`            | FastAPI Python backend                                 |
| `packages/types`      | Shared TypeScript domain types (`StrategyJSON`, etc.)  |
| `packages/utils`      | Validation, plain-English description, templates       |
| `packages/ui`         | Tiny shared UI primitives (`Card`, `Button`, `Badge`)  |
| `supabase/schema.sql` | Postgres tables + RLS for the 5 entities               |

### UI-first / mock mode

The web app boots with `NEXT_PUBLIC_USE_MOCK=true` (default).
`apps/web/lib/api.ts` short-circuits every call to `apps/web/lib/mock.ts`,
which is a localStorage-backed in-browser API simulator (5 seeded
strategies, ~22 trades, orders, logs, simulated backtests). This lets the
entire UI run with **zero backend** — flip the flag to point at real
FastAPI + Supabase + Upstox.

---

## 2. Domain model

A strategy is a single JSON document, persisted as `jsonb` in
`strategies.strategy_json`. The whole engine — frontend builder, validation,
backtester, paper engine — agrees on this one shape.

### `StrategyJSON` (`packages/types/src/index.ts`)

```ts
{
  version: 1,
  name, index, optionType, strike, action, candleTime, quantity,
  mode: "paper" | "live",
  status: "draft" | "active" | "paused" | "stopped",
  entry: ConditionGroup<EntryCondition>,
  exit:  ConditionGroup<ExitCondition>,
  risk:  { maxLossPerDay, maxTradesPerDay, maxOpenPositions,
           autoSquareOffTime, killSwitch? }
}
```

### Condition tree (recursive)

```ts
type ConditionGroup<T> = {
  logic: "AND" | "OR";
  conditions: Array<T | ConditionGroup<T>>;   // ← nesting is unlimited
};
```

* **Leaves**: `level`, `indicator`, `time`, `stop_loss`, `target`,
  `trailing_stop_loss`, `time_exit`.
* **Indicators**: `RSI`, `EMA`, `SMA`, `VWAP`, `SUPERTREND`, `MACD`, `BBANDS`.
* **Operators**: `>`, `<`, `>=`, `<=`, `==`, `crosses_above`, `crosses_below`.
* Indicator RHS can be a literal, the live `price`, or another indicator
  (e.g. *price crosses_above EMA(20)*).
* Same `ConditionGroup` shape powers entries **and** exits, so AND/OR
  groups can be arbitrarily nested in either.

### Database

`supabase/schema.sql` declares 5 tables — all with **Row Level Security**
gating rows by `auth.uid() = user_id`:

| Table             | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `strategies`      | name, `strategy_json`, `is_active`, `mode`, `status`       |
| `trades`          | open/closed positions, entry/exit price, pnl, mode         |
| `orders`          | every order attempt, status, broker order id, mode         |
| `logs`            | signals, entries, exits, errors – `level` + `event` + json |
| `broker_accounts` | Upstox client id + tokens                                  |

Identity comes from **Supabase Auth** (`auth.users`); the API trusts the
JWT and reads `user_id` from it.

---

## 3. Frontend (`apps/web`)

* **App Router pages** (`app/**/page.tsx`): dashboard, strategies list,
  create, details, trades, backtest, logs, settings, login,
  `/settings/upstox/callback`.
* **Components**:
  * `Sidebar` — nav with icons (collapsible style)
  * `TopBar` — “DEMO DATA” badge, mode badge, kill-switch toggle
  * `StrategyBuilder` — 4-step wizard (Basics → Entry → Exit → Risk → Review)
  * `GroupEditor` — recursive nested-group UI: AND/OR pill, presets
    (`+ Level`, `+ Indicator`, `+ Stop Loss`, …), `+ Group` for nesting,
    depth-aware borders
  * `ModeBadge` — paper / live indicator
* **State (Zustand)**:
  * `store/auth.ts` — Supabase session
  * `store/strategy.ts` — current strategy being edited
  * `store/kill-switch.ts` — global emergency stop
* **Networking**:
  * `lib/api.ts` — single `api()` helper; routes to `mockApi` when
    `NEXT_PUBLIC_USE_MOCK !== "false"`
  * `lib/ws.ts` — WebSocket client; in mock mode runs an in-browser tick
    simulator
  * `lib/supabase.ts` — Supabase JS client
  * `lib/mock.ts` — localStorage-backed seed data + simulated backtest

---

## 4. Backend (`apps/api`)

FastAPI app composed of thin **routers** delegating to **services**.

### Routers (`app/routers/*.py`)

| Router        | Endpoints                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `strategies`  | `GET/POST/PUT/DELETE /strategies`, validate before save, status transitions, duplicate                     |
| `backtest`    | `POST /backtest` – run engine over candle data, return PnL/win rate/drawdown/trade list                    |
| `instruments` | `GET /instruments` – index + option chain metadata                                                         |
| `prices`      | `GET /prices/ltp`, `GET /prices/candles` – via Upstox wrapper                                              |
| `orders`      | `POST /orders` – paper by default; live requires `confirm_live=true` + `ALLOW_LIVE_TRADING=true` + broker  |
| `broker`      | `POST /broker/upstox/connect`, OAuth callback, disconnect                                                  |
| `records`     | `GET /trades`, `GET /orders`, `GET /logs`                                                                  |
| `ws`          | `WS /ws/prices` – live candle/price stream                                                                 |

### Services (`app/services/*.py`)

| Service        | Responsibility                                                                                |
| -------------- | --------------------------------------------------------------------------------------------- |
| `indicators`   | Pure pandas/numpy: RSI, EMA, SMA, VWAP, Supertrend, MACD, Bollinger Bands                     |
| `engine`       | `evaluate_condition` / `evaluate_group` (recursive AND/OR), `run_strategy` backtest + paper   |
| `upstox`       | Thin async wrapper around Upstox REST: auth, instruments, candles, LTP, place order          |
| `data`         | Candle fetch + caching helper                                                                 |
| `ws_manager`   | Connection registry; fan-out ticks to subscribed clients                                      |

### Validation (`app/validation.py`)

Mirrors `packages/utils/validateStrategy` so the same rules apply on the
API as in the browser:

* Entry group has ≥1 condition (recursively).
* Exit group has ≥1 condition (recursively).
* Stop-loss leaf exists somewhere in the exit tree.
* Quantity > 0, max-daily-loss set.
* `mode = "live"` requires a connected broker + `confirm_live` on order.

---

## 5. Strategy execution flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Build: StrategyBuilder + GroupEditor                     │
   │    → live JSON preview + plain-English summary + validation │
   └─────────────────────────────────────────────────────────────┘
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 2. Save: POST /strategies → validateStrategy → Supabase     │
   │    Mode defaults to "paper", status defaults to "draft"     │
   └─────────────────────────────────────────────────────────────┘
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 3. Backtest: POST /backtest                                 │
   │    engine.run_strategy(candles_df, strategy)                │
   │    → returns trades + winRate + maxDrawdown + pnl           │
   └─────────────────────────────────────────────────────────────┘
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 4. Live ticks (WebSocket)                                   │
   │    Upstox ticks → ws_manager → /ws/prices → UI charts +     │
   │    paper engine                                             │
   └─────────────────────────────────────────────────────────────┘
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 5. Paper engine (default)                                   │
   │    For each new candle → evaluate_group(entry) → simulate   │
   │    fill at next-candle open → track SL/TP/TSL/time_exit →   │
   │    write trades + orders + logs                             │
   └─────────────────────────────────────────────────────────────┘
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 6. Live (opt-in, gated)                                     │
   │    strategy.mode == "live"  AND                             │
   │    ALLOW_LIVE_TRADING env  AND                              │
   │    broker_accounts.is_active  AND                           │
   │    confirm_live=true on the request                         │
   │    → upstox.place_order; otherwise reject                   │
   └─────────────────────────────────────────────────────────────┘
```

---

## 6. Safety & guardrails

* **Paper mode by default** — `mode` defaults to `paper` at schema, type,
  and engine level.
* **4-layer live gate** — must pass *all* of:
  1. `ALLOW_LIVE_TRADING=true` on the API
  2. strategy `mode == "live"`
  3. per-order `confirm_live: true`
  4. an active row in `broker_accounts`
* **Risk controls** enforced by the engine: max loss/day, max trades/day,
  max open positions, auto-square-off time.
* **Kill switch** (`store/kill-switch.ts`) — global emergency stop.
* **Row-level security** in Supabase — users can only see their own data.
* **Validation** runs both client-side (instant feedback in builder) and
  server-side (single source of truth).

---

## 7. Key files cheat sheet

| You want to…                          | Open                                              |
| ------------------------------------- | ------------------------------------------------- |
| Change the strategy JSON shape         | `packages/types/src/index.ts`                     |
| Tweak validation / plain-English text  | `packages/utils/src/index.ts`                     |
| Add a strategy template                | `packages/utils/src/index.ts → TEMPLATES`         |
| Add a new condition kind in the UI     | `apps/web/components/GroupEditor.tsx`             |
| Modify the wizard layout               | `apps/web/components/StrategyBuilder.tsx`         |
| Add an indicator                       | `apps/api/app/services/indicators.py`             |
| Change backtest / paper logic          | `apps/api/app/services/engine.py`                 |
| Add a REST endpoint                    | `apps/api/app/routers/`                           |
| Update DB schema                       | `supabase/schema.sql`                             |
| Switch to real backend                 | `.env.local → NEXT_PUBLIC_USE_MOCK=false`         |
