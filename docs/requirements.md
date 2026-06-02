# Signal AI – Requirements

What you need installed and configured to develop and run the app.

---

## 1. Software prerequisites

| Tool                    | Version                | Why                                  |
| ----------------------- | ---------------------- | ------------------------------------ |
| **Node.js**             | ≥ 22.17.1              | Next.js 16 + npm workspaces          |
| **npm**                 | ≥ 9                    | Workspace tooling                    |
| **Python**              | ≥ 3.10 (3.11 / 3.12 ok) | FastAPI, pandas, websockets         |
| **pip**                 | latest                 | Python deps                          |
| **Git**                 | any modern version     | Source control                       |
| **Supabase project**    | free tier is enough    | Auth + Postgres + RLS                |
| **Upstox developer app**| optional, live only    | Market data + order placement        |

The web app can run **without** Python, Supabase or Upstox by leaving
mock mode on (`NEXT_PUBLIC_USE_MOCK=true`, the default).

---

## 2. JavaScript dependencies

Installed by `npm install` from the root `package.json` (workspaces).

### `apps/web` runtime

* `next` 16 – App Router, RSC, route handlers
* `react` 19, `react-dom` 19
* `tailwindcss`, `postcss`, `autoprefixer` – styling
* `zustand` – tiny state stores (`auth`, `strategy`, `kill-switch`)
* `@supabase/supabase-js` – Auth + Postgres client (browser)

### `apps/web` dev

* `typescript`, `@types/node`, `@types/react`, `@types/react-dom`
* `eslint`, `eslint-config-next`

### Shared packages (TS, no build step needed for dev)

* `packages/types` – shared domain types
* `packages/utils` – validation, plain-English description, templates
* `packages/ui` – shared UI primitives

---

## 3. Python dependencies (`apps/api/requirements.txt`)

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
python-jose[cryptography]==3.3.0
supabase==2.7.4
pandas==2.2.2
numpy==1.26.4
websockets==12.0
python-multipart==0.0.9
```

Install with:

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
```

---

## 4. External services

### 4.1 Supabase (required for real auth + persistence)

* Create a project at supabase.com.
* In the SQL editor, paste and run **`supabase/schema.sql`** —
  creates `strategies`, `trades`, `orders`, `logs`, `broker_accounts`
  with Row Level Security policies.
* Copy the project URL and anon key into the env vars below.

Mock mode does **not** need Supabase.

### 4.2 Upstox (required only for live data and live orders)

* Create a developer app at developer.upstox.com.
* Set the OAuth redirect URI to your `/settings/upstox/callback` URL.
* Copy client id, client secret, redirect URI to the API env vars.

Backtesting and paper trading work without Upstox if you provide
candle data manually (mock mode does this).

---

## 5. Environment variables

Copy `.env.example` and fill what you need.

### Frontend (`apps/web/.env.local`)

| Variable                          | Default        | Purpose                                |
| --------------------------------- | -------------- | -------------------------------------- |
| `NEXT_PUBLIC_USE_MOCK`            | `true`         | Use in-browser mock; set `false` to hit FastAPI |
| `NEXT_PUBLIC_API_URL`             | `http://localhost:8000` | FastAPI base URL              |
| `NEXT_PUBLIC_SUPABASE_URL`        | —              | Supabase project URL                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | —              | Supabase anon public key               |

### Backend (`apps/api/.env`)

| Variable                       | Default | Purpose                                          |
| ------------------------------ | ------- | ------------------------------------------------ |
| `SUPABASE_URL`                 | —       | Supabase project URL                             |
| `SUPABASE_SERVICE_ROLE_KEY`    | —       | Server-side Supabase key (RLS-bypassing)         |
| `UPSTOX_CLIENT_ID`             | —       | Upstox OAuth client id                           |
| `UPSTOX_CLIENT_SECRET`         | —       | Upstox OAuth client secret                       |
| `UPSTOX_REDIRECT_URI`          | —       | Must match the dev portal exactly                |
| `ALLOW_LIVE_TRADING`           | `false` | Master gate; must be `true` to place real orders |
| `ORIGINS`                      | `http://localhost:3000` | CORS allow-list                  |

---

## 6. Hardware / runtime expectations

* Any modern laptop is plenty — no GPU.
* RAM: 4 GB+ comfortably runs both the Next dev server and FastAPI.
* macOS, Linux and Windows (WSL2) all supported.

---

## 7. Operational requirements

* **Paper trading is the default.** No code path can place a real order
  unless **all four** of the following are true:
  1. `ALLOW_LIVE_TRADING=true` on the API,
  2. the strategy has `mode = "live"`,
  3. the per-order request includes `confirm_live: true`,
  4. an active `broker_accounts` row exists for the user.
* **Risk controls** must be set on every strategy:
  `maxLossPerDay > 0`, `maxTradesPerDay > 0`, `maxOpenPositions > 0`,
  and a stop-loss leaf in the exit tree.
* **Auth** is JWT-based via Supabase; every API call must carry a
  `Authorization: Bearer <token>` header. Mock mode uses `demo-user`.
* **RLS** is enabled in Postgres; clients can only read/write their own
  rows.

---

## 8. Recommended dev tooling (optional)

* VS Code + extensions: ESLint, Tailwind CSS IntelliSense, Python.
* `gh` CLI for pushing to GitHub.
* The `supabase` CLI if you want to run Postgres locally.

---

## 9. One-shot setup checklist

```bash
# clone
git clone https://github.com/edharmarao/SignalAI.git
cd SignalAI

# js deps
npm install

# (optional) python deps
cd apps/api && pip install -r requirements.txt && cd ../..

# env
cp .env.example apps/web/.env.local
cp .env.example apps/api/.env

# run web (mock mode, no backend)
npm run dev

# run api (separate terminal)
npm run api

# apply DB schema (Supabase SQL editor)
#   paste contents of supabase/schema.sql and run
```

You should be able to open http://localhost:3000, see the **DEMO DATA**
badge, and start building strategies immediately.
