-- ============================================================================
-- 004_admissions_finance.sql — Phase 3
-- Inschrijvingen pipeline (+ parents), klassenindeler placements, finance
-- (expenses, budget categories, payments).
-- ============================================================================

-- ---- enrollments (pipeline card) ------------------------------------------
create table if not exists public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  child_name       text not null,
  age              int,
  gender           text check (gender in ('m','f')),
  track            text not null default 'regulier' check (track in ('regulier','hifdh')),
  status           text not null default 'inschrijving'
                     check (status in ('inschrijving','intake','wachtlijst','geaccepteerd','niet_geaccepteerd')),
  target_class     text,
  submitted_at     timestamptz default now(),
  submitted_label  text,
  rejection_reason text,
  created_at       timestamptz not null default now()
);
create index if not exists enrollments_status_idx on public.enrollments (status);

-- ---- enrollment_parents (always two) --------------------------------------
create table if not exists public.enrollment_parents (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  role          text,                       -- Vader / Moeder / Voogd
  name          text,
  phone         text,
  email         text,
  is_primary    boolean not null default false
);
create index if not exists enrollment_parents_enrollment_idx on public.enrollment_parents (enrollment_id);

-- ---- enrollment_placements (klassenindeler concept worksheet) -------------
create table if not exists public.enrollment_placements (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.enrollments(id) on delete cascade,
  schooljaar_id  uuid not null references public.schooljaren(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete set null,
  niveau         text,
  lesgeld_bedrag numeric,
  definitief     boolean not null default false,
  leerling_id    uuid references public.leerlingen(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (enrollment_id, schooljaar_id)
);

drop trigger if exists placements_updated on public.enrollment_placements;
create trigger placements_updated before update on public.enrollment_placements
  for each row execute function public.set_updated_at();

-- ---- expenses --------------------------------------------------------------
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  schooljaar_id uuid not null references public.schooljaren(id) on delete cascade,
  date          date not null,
  category      text,
  description   text,
  amount        numeric not null,
  vendor        text,
  created_at    timestamptz not null default now()
);
create index if not exists expenses_schooljaar_idx on public.expenses (schooljaar_id);

-- ---- budget_categories -----------------------------------------------------
create table if not exists public.budget_categories (
  id            uuid primary key default gen_random_uuid(),
  schooljaar_id uuid references public.schooljaren(id) on delete cascade,  -- null = global
  name          text not null,
  planned       numeric not null default 0,
  color         text default 'primary'
);

-- ---- payments (collegegeld per leerling) ----------------------------------
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  date        date,
  description text,                          -- termijn
  amount      numeric not null default 0,
  status      text not null default 'open' check (status in ('paid','open','expected')),
  method      text,
  created_at  timestamptz not null default now()
);
create index if not exists payments_leerling_idx on public.payments (leerling_id);

-- ============================================================================
-- RLS
-- ============================================================================
select public.apply_admin_rls('public.enrollments');
select public.apply_admin_rls('public.enrollment_parents');
select public.apply_admin_rls('public.enrollment_placements');
select public.apply_admin_rls('public.expenses');
select public.apply_admin_rls('public.budget_categories');
select public.apply_admin_rls('public.payments');
