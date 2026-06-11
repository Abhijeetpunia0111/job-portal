-- Migration: add the learned-adapter cache (auto-discovery connector).
-- (schema.sql already includes this for fresh setups.)

create table if not exists public.adapters (
  domain     text primary key,
  spec       jsonb not null,
  created_at timestamptz default now()
);

alter table public.adapters enable row level security;

do $$ begin
  create policy "public read adapters"  on public.adapters for select using (true);
  create policy "public write adapters" on public.adapters for all    using (true) with check (true);
exception when duplicate_object then null; end $$;
