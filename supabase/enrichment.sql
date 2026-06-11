-- Migration: add AI-enrichment columns to an existing jobs table.
-- Run this only if you created the jobs table before enrichment was added.
-- (schema.sql already includes these columns for fresh setups.)

alter table public.jobs
  add column if not exists required_skills text[],
  add column if not exists tech_stack      text[],
  add column if not exists experience_min  integer,
  add column if not exists experience_max  integer,
  add column if not exists ai_seniority    text,
  add column if not exists job_category    text,
  add column if not exists ai_summary      text,
  add column if not exists enriched_at     timestamptz;

create index if not exists jobs_category_idx on public.jobs (job_category);
