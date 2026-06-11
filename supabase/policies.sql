-- Fix: create the public RLS policies (run in the yqwad SQL Editor).
-- Without these, the anon/publishable key can't read or write, so the dashboard
-- shows nothing and writes fail with "violates row-level security policy".
-- Idempotent — safe to run repeatedly.

alter table public.jobs      enable row level security;
alter table public.companies enable row level security;

drop policy if exists "public read jobs"  on public.jobs;
create policy "public read jobs"  on public.jobs  for select using (true);
drop policy if exists "public write jobs" on public.jobs;
create policy "public write jobs" on public.jobs  for all    using (true) with check (true);

drop policy if exists "public read companies"  on public.companies;
create policy "public read companies"  on public.companies for select using (true);
drop policy if exists "public write companies" on public.companies;
create policy "public write companies" on public.companies for all    using (true) with check (true);

-- linkedin_queue (only if it exists)
do $$ begin
  if to_regclass('public.linkedin_queue') is not null then
    execute 'alter table public.linkedin_queue enable row level security';
    execute 'drop policy if exists "public read queue" on public.linkedin_queue';
    execute 'create policy "public read queue" on public.linkedin_queue for select using (true)';
    execute 'drop policy if exists "public write queue" on public.linkedin_queue';
    execute 'create policy "public write queue" on public.linkedin_queue for all using (true) with check (true)';
  end if;
end $$;
