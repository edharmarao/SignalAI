-- Signal AI - Supabase schema
-- Run this in the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- ==========================================================
-- strategies
-- ==========================================================
create table if not exists public.strategies (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  strategy_json jsonb not null,
  is_active boolean not null default false,
  mode text not null default 'paper' check (mode in ('paper','live')),
  status text not null default 'draft' check (status in ('draft','active','paused','stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists strategies_user_idx on public.strategies(user_id, created_at desc);

-- ==========================================================
-- trades
-- ==========================================================
create table if not exists public.trades (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  symbol text not null,
  action text not null check (action in ('BUY','SELL')),
  quantity int not null,
  entry_price numeric not null,
  exit_price numeric,
  pnl numeric,
  mode text not null default 'paper' check (mode in ('paper','live')),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists trades_user_idx on public.trades(user_id, opened_at desc);

-- ==========================================================
-- orders
-- ==========================================================
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  quantity int not null,
  price numeric not null,
  order_type text not null default 'MARKET' check (order_type in ('MARKET','LIMIT')),
  mode text not null default 'paper' check (mode in ('paper','live')),
  status text not null default 'pending' check (status in ('pending','filled','rejected','cancelled')),
  broker_order_id text,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);

-- ==========================================================
-- logs
-- ==========================================================
create table if not exists public.logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete cascade,
  level text not null default 'info' check (level in ('info','warn','error','signal')),
  event text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists logs_user_idx on public.logs(user_id, created_at desc);

-- ==========================================================
-- broker_accounts
-- ==========================================================
create table if not exists public.broker_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null default 'upstox',
  client_id text,
  access_token text,
  refresh_token text,
  expires_at text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists broker_accounts_user_idx on public.broker_accounts(user_id);

-- ==========================================================
-- Row Level Security: each user can only access their own rows
-- ==========================================================
alter table public.strategies      enable row level security;
alter table public.trades          enable row level security;
alter table public.orders          enable row level security;
alter table public.logs            enable row level security;
alter table public.broker_accounts enable row level security;

create policy "own strategies" on public.strategies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own orders" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own logs" on public.logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own broker accounts" on public.broker_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
