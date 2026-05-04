# Signal AI – Implementation Notes

End-to-end walk-through of how each major feature is implemented, with
file references and rationale. Pair this with [`architecture.md`](./architecture.md) for the
big picture.

---

## 1. Monorepo layout

```
.
├── apps/
│   ├── web/                  Next.js 14 (App Router) frontend
│   └── api/                  FastAPI backend
├── packages/
│   ├── types/                Shared domain types (TS)
│   ├── utils/                Validation + plain-English + templates (TS)
│   └── ui/                   Tiny shared UI primitives
├── supabase/schema.sql       Postgres schema + RLS
├── package.json              npm workspaces (apps/* + packages/*)
└── tsconfig.base.json        Shared TS config (apps extend this)
```

* `npm run dev` → `apps/web` Next.js dev server (default mock mode)
* `npm run build` → builds the web app (statically when possible)
* `npm run api` → starts FastAPI on `:8000` with reload
* TS path aliases (e.g. `@signal-ai/types`) are wired in `apps/web/tsconfig.json`.
  ⚠️ `baseUrl: "."` is required explicitly in `apps/web/tsconfig.json` — Next.js
  doesn’t inherit it through `extends`.

---

## 2. Strategy schema (single source of truth)

`packages/types/src/index.ts` defines:

```ts
type ConditionGroup<T> = { logic: "AND" | "OR"; conditions: Array<T | ConditionGroup<T>> };
type StrategyJSON = { …; entry: ConditionGroup<EntryCondition>; exit: ConditionGroup<ExitCondition>; … };

function isGroup<T>(c): c is ConditionGroup<T>   // type guard used everywhere
```

Why a tree (not a flat list)? Real strategies need things like
*“RSI > 60 AND ( price > VWAP OR EMA9 crosses_above EMA21 )”* —
i.e. mixed AND/OR. A single recursive type covers entries, exits and
arbitrary nesting depth in one place.

The Python side mirrors this in dicts; `evaluate_group` walks
recursively by detecting child groups via `isinstance(c, dict) and
"logic" in c and "conditions" in c`.

---

## 3. Frontend implementation

### 3.1 Strategy Builder wizard

`apps/web/components/StrategyBuilder.tsx` – 4 steps + review:

1. **Basics** – name, index, optionType (CE/PE), strike (ATM±50/100),
   action, candleTime, quantity, mode.
2. **Entry** – delegates to `<GroupEditor kind="entry">`.
3. **Exit** – delegates to `<GroupEditor kind="exit">`.
4. **Risk** – maxLossPerDay, maxTradesPerDay, maxOpenPositions,
   autoSquareOffTime.
5. **Review** – live JSON preview, validation panel, plain-English summary,
   `Save as draft` / `Save & activate (paper)`.

State lives in `store/strategy.ts` (Zustand) so the user can navigate
steps without losing input. Right-hand pane is always rendered:

* **Validation card** — calls `validateStrategy` from
  `packages/utils`; lists errors live as you type.
* **Plain-English summary** — `describeStrategy` walks the tree and
  produces readable text like “Buy NIFTY ATM+100 CE when (RSI(14) > 60
  AND price > 22,500). Exit on stop-loss 20 pts OR target 50 pts.”
* **JSON preview** — `<pre>{JSON.stringify(strategy, null, 2)}</pre>`,
  always reflecting the current edit.

### 3.2 GroupEditor (nested AND/OR)

`apps/web/components/GroupEditor.tsx` is the recursive heart of the UI:

* Each group renders an **AND / OR** segmented toggle.
* Quick-add preset buttons differ by `kind`:
  * entry → `+ Level`, `+ Indicator`, `+ Time`
  * exit  → `+ Stop Loss`, `+ Target`, `+ Trailing SL`, `+ Time Exit`,
    `+ Level`, `+ Indicator`
* `+ Group` adds a nested `ConditionGroup` (auto-flips logic so the
  default is meaningful: an OR group inside an AND group).
* Each leaf is rendered by an inline `ConditionRow` component that
  switches on `cond.type` and shows the right inputs (operator dropdown,
  number input, indicator-period etc.).
* Connectors between siblings show a small `AND` / `OR` chip; border
  color cycles by depth so the structure is visible at a glance.
* Removing the last condition removes the (sub-)group entirely.

### 3.3 Mock-data mode

`apps/web/lib/mock.ts` is a complete in-browser API simulator:

* On first load it seeds 5 strategies (one per template), ~22 trades,
  matching orders and ~80 log rows.
* Persists to `localStorage` under `signalai:mock:v1` so reloads keep state.
* Implements `mockApi(path, init)` which routes URL+method like the real
  API: `GET /strategies`, `POST /strategies`, `POST /backtest`, …
* `simulateBacktest(strategyJson)` generates a realistic random trade
  sequence, computes wins/losses/winRate/pnl/maxDrawdown.
* The Settings page exposes a **Reset demo data** button which clears
  the storage key and re-seeds.

`apps/web/lib/api.ts` decides at module load which path to take:

```ts
const USE_MOCK = (process.env.NEXT_PUBLIC_USE_MOCK ?? "true").toLowerCase() !== "false";
if (USE_MOCK) return mockApi<T>(path, init);
```

### 3.4 Live data WebSocket (mock-aware)

`apps/web/lib/ws.ts` exposes `subscribePrices(symbols, onTick)`. In mock
mode it runs `setInterval` and emits random-walk ticks per symbol; in
real mode it opens `ws://api/ws/prices`. Same callback shape either way,
so charts and the trades page don’t care.

### 3.5 Auth & gating

* `lib/supabase.ts` creates the Supabase JS client (browser).
* `store/auth.ts` listens for session changes; protected pages redirect
  to `/login` when no session.
* `app/settings/upstox/callback/page.tsx` handles the broker OAuth
  return; wrapped in `<Suspense>` because Next 14 requires it for
  `useSearchParams`.

---

## 4. Backend implementation

### 4.1 App bootstrap

`apps/api/app/main.py` builds the FastAPI app, configures CORS using
`settings.origins`, and mounts every router. Two utility routes:

* `GET /` — name, version, `live_trading_enabled`, disclaimer
* `GET /health` — `{ ok: true }`

### 4.2 Indicators (`services/indicators.py`)

Pure-pandas implementations of RSI, EMA, SMA, VWAP, Supertrend, MACD and
Bollinger Bands. Single dispatcher:

```python
def compute(df, name, **kwargs) -> pd.Series: ...
```

This means `engine.evaluate_condition` doesn’t have a switch — it just
asks `indicators.compute` to materialise the LHS/RHS series.

### 4.3 Engine (`services/engine.py`)

Three layers:

1. `evaluate_condition(df, leaf)` → `pd.Series[bool]` per candle.
   * `level` → `df["close"] OP value`
   * `indicator` → `compute(...) OP rhs` (rhs = literal, price or another indicator)
   * `time` → string compare on `HH:MM`
2. `evaluate_group(df, group)` → recursively combines children with AND/OR.
3. `run_strategy(df, strategy)` → walks candle-by-candle:
   * Enters when `evaluate_group(entry)` flips true and we have
     capacity (max-open-positions, max-trades-per-day, kill switch).
   * For each open position, checks SL / TP / Trailing SL / time-exit
     and the *indicator/level exits* via `evaluate_group(stripped_exit_group)`.
   * The exit group is flattened into leaves to find SL/TP/TSL/time-exit
     while the original tree (with simple exits stripped) is kept for
     indicator/level exits — so AND/OR semantics still apply.
4. Returns trades, win rate, PnL, max drawdown.

The same code path powers backtests *and* paper trading; live mode just
swaps simulated fills for `upstox.place_order`.

### 4.4 Validation (`app/validation.py`)

Server-side mirror of `validateStrategy` from `packages/utils`.
Both implementations walk the nested groups recursively (`_count_leaves`,
`_has_type` in Python; `countLeaves`, `hasStopLoss` in TS). Rules:

* `entry.conditions` (recursive) > 0
* `exit.conditions` (recursive) > 0
* a `stop_loss` leaf exists anywhere in the exit tree
* `quantity > 0`
* `risk.maxLossPerDay > 0`
* `mode == "live"` ⇒ broker must be connected for the user

### 4.5 Upstox wrapper (`services/upstox.py`)

Thin async client over `httpx.AsyncClient`:

* `auth_url()`, `exchange_code(code)`, `refresh(token)`
* `instruments(index)`, `option_chain(index, expiry)`
* `candles(instrument, interval, from, to)`
* `ltp(instruments)`
* `place_order(...)` (only called when 4-layer gate passes)

Tokens are persisted in `broker_accounts`; refresh is lazy on 401.

### 4.6 WebSocket fan-out (`services/ws_manager.py`)

`Manager` keeps a set of `(websocket, subscribed_symbols)`. The Upstox
streaming task posts ticks into an asyncio queue; the manager fans them
out to subscribers whose symbol set contains the tick’s symbol.

### 4.7 Order flow (`routers/orders.py`)

```python
if mode == "live":
    if not settings.allow_live_trading: 403
    if not broker_account_active(user): 403
    if not body.confirm_live: 400
    upstox.place_order(...)
else:
    simulate_paper_fill(...)

write_order_row()
write_trade_row_if_entry()
write_log("order", ...)
```

Every entry/exit/order/error is persisted in `logs` so the UI Logs page
gives full forensic visibility.

---

## 5. Database

`supabase/schema.sql` creates 5 tables (strategies, trades, orders, logs,
broker_accounts) with `uuid` PKs and `auth.users(id)` foreign keys.
**Row Level Security** is enabled on all tables with one shared policy:

```sql
using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

so a JWT is enough to constrain reads/writes to the caller’s rows.

Indexes target the common access pattern: `(user_id, created_at desc)` /
`(user_id, opened_at desc)`.

---

## 6. Configuration

| Variable                       | Where      | Purpose                                    |
| ------------------------------ | ---------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`     | web        | Supabase project URL                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| web        | Supabase anon key                          |
| `NEXT_PUBLIC_API_URL`          | web        | FastAPI base URL                           |
| `NEXT_PUBLIC_USE_MOCK`         | web        | `"true"` (default) → use in-browser mock  |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | api | Server-side Supabase access     |
| `UPSTOX_CLIENT_ID` / `UPSTOX_CLIENT_SECRET` / `UPSTOX_REDIRECT_URI` | api | OAuth |
| `ALLOW_LIVE_TRADING`           | api        | Master kill for placing real orders       |
| `ORIGINS`                      | api        | CORS allow-list                           |

`.env.example` ships every key.

---

## 7. End-to-end example: “RSI breakout”

1. User clicks the **RSI breakout** template on `/strategies/new`.
   `TEMPLATES` in `packages/utils` returns a partial strategy:
   `entry = { logic: "AND", conditions: [{type:"indicator", indicator:"RSI", period:14, operator:">", value:60}] }`.
2. User wraps the entry: clicks **+ Group** inside Entry, drags the RSI
   condition under it, adds a sibling level condition `price > 22500`,
   sets the outer logic to AND. UI persists the nested tree to Zustand
   in real time.
3. JSON preview shows:
   ```json
   "entry": {
     "logic": "AND",
     "conditions": [
       { "logic": "OR", "conditions": [ {"type":"indicator","indicator":"RSI","period":14,"operator":">","value":60} ] },
       { "type":"level", "field":"price", "operator":">", "value":22500 }
     ]
   }
   ```
4. Plain-English summary: “Buy NIFTY ATM+100 CE when (RSI(14) > 60) AND
   price > 22,500. Exit on stop-loss 20 pts OR target 50 pts OR trailing
   SL 10 pts OR at 15:15.”
5. Click **Save as draft** → `POST /strategies` →
   `validateStrategy` passes → row inserted with `mode="paper"`,
   `status="draft"`.
6. Click **Backtest** on the details page → `POST /backtest` with the
   strategy id and a date range → engine returns metrics + trade list,
   rendered as cards + table.
7. Click **Activate (paper)** → `status="active"`, `is_active=true`.
   The paper engine subscribes to candle ticks via WebSocket and starts
   evaluating; every signal/order/exit is logged.
8. Live trading is **never** the default — promoting requires connecting
   Upstox in Settings, then explicitly switching `mode` to `"live"`,
   then sending `confirm_live: true` per order, with `ALLOW_LIVE_TRADING`
   on the server.

---

## 8. Local development quick-start

```bash
# 1. Install JS deps
npm install

# 2. Run web with mock data (no backend, no DB needed)
npm run dev
# → http://localhost:3000  (DEMO DATA badge in top bar)

# 3. (Optional) Run the real backend
cd apps/api && pip install -r requirements.txt
cd ../.. && npm run api
# → http://localhost:8000/docs   FastAPI Swagger

# 4. (Optional) Switch web to real backend
echo 'NEXT_PUBLIC_USE_MOCK=false' >> apps/web/.env.local
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' >> apps/web/.env.local

# 5. (Optional) Apply DB schema
#   In Supabase SQL editor, paste supabase/schema.sql.
```

---

## 9. Extension points

* **New indicator** → add a function + dispatch case in
  `services/indicators.py`, add the name to `IndicatorName` in
  `packages/types`, optionally extend the GroupEditor preset.
* **New condition type** → extend the union in `packages/types`,
  handle it in `engine.evaluate_condition`, render it in
  `GroupEditor → ConditionRow`.
* **Real-time alerts** → hook into the existing log writer in
  `routers/orders.py` or the engine signal path; current code already
  emits `level: "signal"` rows.
* **Email / Telegram delivery** → consume the `logs` stream from a
  worker, filter `level in ("signal","error")`, dispatch.

