-- UzRailway Ticket Telegram Bot schema
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.bot_users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_sessions (
  telegram_id bigint primary key,
  step text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_watches (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null references public.bot_users(telegram_id) on delete cascade,
  from_station_code text not null,
  from_station_name text not null,
  to_station_code text not null,
  to_station_name text not null,
  travel_date date not null,
  passengers integer not null default 1,
  status text not null default 'active' check (status in ('active', 'stopped')),
  last_result_hash text,
  last_status text,
  last_error text,
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_watches_active_idx
  on public.ticket_watches (status, last_checked_at, travel_date);

create index if not exists ticket_watches_user_idx
  on public.ticket_watches (telegram_id, status, created_at desc);

create table if not exists public.bot_logs (
  id bigserial primary key,
  level text not null default 'INFO',
  scope text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_logs_created_idx on public.bot_logs (created_at desc);

-- Optional RLS lock-down. The bot uses service_role key, so RLS can stay enabled safely.
alter table public.bot_users enable row level security;
alter table public.user_sessions enable row level security;
alter table public.ticket_watches enable row level security;
alter table public.bot_logs enable row level security;
