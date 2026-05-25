-- ============================================================================
-- 009_finance_tuition_income.sql
-- Per-track yearly tuition (regulier / hifdh) on app_settings, plus a table for
-- manual incomes (sponsoren, donaties, subsidies). Idempotent.
-- ============================================================================

alter table public.app_settings
  add column if not exists tuition_regulier_eur int not null default 220,
  add column if not exists tuition_hifdh_eur    int not null default 350;

-- Seed sensible defaults from the existing single amount if present.
update public.app_settings
  set tuition_regulier_eur = coalesce(nullif(tuition_regulier_eur, 0), annual_amount_eur, 220)
  where tuition_regulier_eur is null or tuition_regulier_eur = 0;

create table if not exists public.incomes (
  id            uuid primary key default gen_random_uuid(),
  schooljaar_id uuid not null references public.schooljaren(id) on delete cascade,
  date          date not null,
  source        text,            -- Sponsor / Donatie / Subsidie / Overig
  description   text,
  amount        numeric not null,
  created_at    timestamptz not null default now()
);
create index if not exists incomes_schooljaar_idx on public.incomes (schooljaar_id);

select public.apply_admin_rls('public.incomes');
