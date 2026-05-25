-- ============================================================================
-- 002_people_classes.sql — Phase 1 (read)
-- People (teachers, kinderen, ouders, kind_ouder), classes, per-year leerlingen,
-- lessons, and the computed metric views (single source of truth).
-- ============================================================================

-- ---- teachers --------------------------------------------------------------
create table if not exists public.teachers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short      text,
  email      text,
  phone      text,
  joined     date,
  specialty  text,
  role       text not null default 'les' check (role in ('les','quran','both')),
  created_at timestamptz not null default now()
);

-- ---- kinderen (child across years) ----------------------------------------
create table if not exists public.kinderen (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  full_name   text generated always as (first_name || ' ' || last_name) stored,
  initials    text,
  gender      text check (gender in ('m','f')),
  birth_year  int,
  address     text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---- ouders ----------------------------------------------------------------
create table if not exists public.ouders (
  id         uuid primary key default gen_random_uuid(),
  role       text,                       -- Vader / Moeder / Voogd
  name       text not null,
  phone      text,
  email      text,
  "primary"  boolean not null default false,
  bereik     text,                       -- reachability note
  created_at timestamptz not null default now()
);

-- ---- kind_ouder (M:N) ------------------------------------------------------
create table if not exists public.kind_ouder (
  kind_id    uuid not null references public.kinderen(id) on delete cascade,
  ouder_id   uuid not null references public.ouders(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (kind_id, ouder_id)
);

-- ---- classes (per school year) --------------------------------------------
create table if not exists public.classes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,                 -- "Klas 1", "Klas Hifdh-K"
  grade            int,
  teacher_id       uuid references public.teachers(id) on delete set null,
  quran_teacher_id uuid references public.teachers(id) on delete set null,
  color            text default 'primary',
  day              text,                           -- Zaterdag / Zondag
  "time"           text,                           -- "09:30 - 11:30"
  location         text default 'Moskee Arrahma',
  capacity         int default 22,
  schooljaar_id    uuid not null references public.schooljaren(id) on delete cascade,
  track            text not null default 'regulier' check (track in ('regulier','hifdh')),
  historic         boolean not null default false,
  is_next          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists classes_schooljaar_idx on public.classes (schooljaar_id);

-- ---- leerlingen (enrollment of a kind in a class for a year) ---------------
create table if not exists public.leerlingen (
  id                  uuid primary key default gen_random_uuid(),
  kind_id             uuid not null references public.kinderen(id) on delete cascade,
  class_id            uuid not null references public.classes(id) on delete cascade,
  schooljaar_id       uuid not null references public.schooljaren(id) on delete cascade,
  leerlingnummer      text,                        -- "M1001"
  niveau              text,                         -- 0 / 0,5 / 1 / 1,5 / 2
  joined              date,
  final_grade         text,                         -- eindbeoordeling (completed years)
  notes_end_of_year   text,
  -- Stored snapshots for archived years (read-only; current year is derived).
  hist_attendance_pct numeric,
  hist_surahs_known   int,
  created_at          timestamptz not null default now(),
  unique (kind_id, schooljaar_id)
);
create index if not exists leerlingen_class_idx on public.leerlingen (class_id);
create index if not exists leerlingen_schooljaar_idx on public.leerlingen (schooljaar_id);

-- ---- lessons (per class) ---------------------------------------------------
create table if not exists public.lessons (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  date       date not null,
  week_nr    int,
  topic      text,
  "time"     text,
  location   text,
  created_at timestamptz not null default now()
);
create index if not exists lessons_class_date_idx on public.lessons (class_id, date);

-- ============================================================================
-- Computed metric views (single source of truth). Defined here so read screens
-- can use them; they reference tables created in 003 — so we guard with a
-- to-be-replaced definition. The full definitions live in 003 after the
-- administratie tables exist. Here we create lightweight placeholders.
-- ============================================================================
-- (Views are (re)created in 003_administratie.sql once attendance/quran exist.)

-- ============================================================================
-- RLS
-- ============================================================================
select public.apply_admin_rls('public.teachers');
select public.apply_admin_rls('public.kinderen');
select public.apply_admin_rls('public.ouders');
select public.apply_admin_rls('public.kind_ouder');
select public.apply_admin_rls('public.classes');
select public.apply_admin_rls('public.leerlingen');
select public.apply_admin_rls('public.lessons');
