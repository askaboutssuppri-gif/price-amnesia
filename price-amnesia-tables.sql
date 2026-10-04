-- Price Amnesia database tables.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  free_receipts_used integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text,
  receipt_date date,
  photo_url text,
  item_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists price_entries (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  price numeric not null,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table receipts enable row level security;
alter table price_entries enable row level security;

drop policy if exists "Users manage own profile" on profiles;
create policy "Users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users manage own receipts" on receipts;
create policy "Users manage own receipts" on receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own price entries" on price_entries;
create policy "Users manage own price entries" on price_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
