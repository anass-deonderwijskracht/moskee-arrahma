-- ============================================================================
-- 001_foundation.sql — Moskee Arrahma admin
-- Phase 0: auth profiles, app settings, reference data (surahs, schooljaren),
-- and the RLS baseline (admin-gating helper + policies).
--
-- Re-runnable: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- Apply in the Supabase SQL editor (or via service_role tooling) in order.
-- ============================================================================

-- ---- Extensions -----------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---- updated_at trigger helper --------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- profiles --------------------------------------------------------------
-- One row per admin user, linked to auth.users. Invite-only: rows are created
-- by a trigger when an auth user is created (role defaults to 'admin').
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'admin' check (role in ('admin')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when a new auth user appears (first admin via dashboard
-- or service_role). full_name is pulled from user metadata when present.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- is_admin() ------------------------------------------------------------
-- Single source of truth for RLS: true when the caller has an admin profile.
-- security definer so it can read profiles regardless of the caller's own RLS.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---- apply_admin_rls(table) ------------------------------------------------
-- Convenience used by later migrations: enable RLS on a table and grant a
-- single FOR ALL policy gated to admins. Idempotent.
create or replace function public.apply_admin_rls(tbl regclass)
returns void language plpgsql as $$
declare
  pol text := replace(tbl::text, '.', '_') || '_admin_all';
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists %I on %s', pol, tbl);
  execute format(
    'create policy %I on %s for all using (public.is_admin()) with check (public.is_admin())',
    pol, tbl);
end;
$$;

-- ---- app_settings (singleton) ---------------------------------------------
create table if not exists public.app_settings (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default 'Moskee Arrahma',
  address           text,
  phone             text,
  email             text,
  annual_amount_eur int not null default 220,
  terms             int not null default 3,
  sibling_discount  text,
  singleton         boolean not null default true,
  updated_at        timestamptz not null default now(),
  constraint app_settings_singleton unique (singleton)
);

drop trigger if exists app_settings_updated on public.app_settings;
create trigger app_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (name, address, phone, email, annual_amount_eur, terms, sibling_discount)
values ('Moskee Arrahma', 'Almere', '', 'info@moskee-arrahma.nl', 220, 3, '10% vanaf 2e kind')
on conflict (singleton) do nothing;

-- ---- surahs (reference) ----------------------------------------------------
create table if not exists public.surahs (
  n       int primary key,
  name    text not null,
  verses  int not null,
  juz     int not null
);

insert into public.surahs (n, name, verses, juz) values
  (1,'Al-Fatiha',7,1),
  (78,'An-Naba',40,30),(79,'An-Nazi''at',46,30),(80,'''Abasa',42,30),
  (81,'At-Takwir',29,30),(82,'Al-Infitar',19,30),(83,'Al-Mutaffifin',36,30),
  (84,'Al-Inshiqaq',25,30),(85,'Al-Burooj',22,30),(86,'At-Tariq',17,30),
  (87,'Al-A''la',19,30),(88,'Al-Ghashiyah',26,30),(89,'Al-Fajr',30,30),
  (90,'Al-Balad',20,30),(91,'Ash-Shams',15,30),(92,'Al-Layl',21,30),
  (93,'Ad-Duha',11,30),(94,'Ash-Sharh',8,30),(95,'At-Tin',8,30),
  (96,'Al-''Alaq',19,30),(97,'Al-Qadr',5,30),(98,'Al-Bayyinah',8,30),
  (99,'Az-Zalzalah',8,30),(100,'Al-''Adiyat',11,30),(101,'Al-Qari''ah',11,30),
  (102,'At-Takathur',8,30),(103,'Al-''Asr',3,30),(104,'Al-Humazah',9,30),
  (105,'Al-Fil',5,30),(106,'Quraysh',4,30),(107,'Al-Ma''un',7,30),
  (108,'Al-Kawthar',3,30),(109,'Al-Kafirun',6,30),(110,'An-Nasr',3,30),
  (111,'Al-Masad',5,30),(112,'Al-Ikhlas',4,30),(113,'Al-Falaq',5,30),
  (114,'An-Nas',6,30)
on conflict (n) do nothing;

-- ---- schooljaren -----------------------------------------------------------
create table if not exists public.schooljaren (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- e.g. 'y2025'
  name        text not null,                 -- e.g. '2025/26'
  start_date  date,
  end_date    date,
  lesdagen    int,
  is_current  boolean not null default false,
  archived    boolean not null default false
);

-- Exactly one current school year.
create unique index if not exists schooljaren_one_current
  on public.schooljaren (is_current) where is_current;

insert into public.schooljaren (code, name, start_date, end_date, lesdagen, is_current, archived) values
  ('y2022','2022/23','2022-09-03','2023-06-30',32,false,true),
  ('y2023','2023/24','2023-09-02','2024-06-30',33,false,true),
  ('y2024','2024/25','2024-09-07','2025-06-29',32,false,false),
  ('y2025','2025/26','2025-09-06','2026-06-28',32,true,false),
  ('y2026','2026/27','2026-09-05','2027-06-27',33,false,false)
on conflict (code) do nothing;

-- ============================================================================
-- RLS baseline
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.app_settings  enable row level security;
alter table public.surahs        enable row level security;
alter table public.schooljaren   enable row level security;

-- profiles: an admin may read all profiles and update their own.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- app_settings: admins full read/write.
drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- surahs: readable by any authenticated admin; no writes from the app.
drop policy if exists surahs_select on public.surahs;
create policy surahs_select on public.surahs
  for select using (public.is_admin());

-- schooljaren: admins full read/write (CRUD in Instellingen).
drop policy if exists schooljaren_all on public.schooljaren;
create policy schooljaren_all on public.schooljaren
  for all using (public.is_admin()) with check (public.is_admin());
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
-- ============================================================================
-- 003_administratie.sql — Phase 2 (write workflows)
-- Les-administratie (attendance + Arabic homework + materials + notes) and
-- Qur'an-administratie (assignments, evaluations, surah progress).
-- Defines the leerling_metrics / class_metrics views over this real data.
-- ============================================================================

-- ---- attendance_records (per leerling × lesson) ----------------------------
create table if not exists public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  leerling_id     uuid not null references public.leerlingen(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  status          text check (status in ('A','L','Z','O')),     -- null/'-' = not filled
  homework        text check (homework in ('yes','partial','no')), -- Arabic homework
  materials_issue boolean not null default false,                -- true ONLY when NOT in order
  note            text,
  updated_at      timestamptz not null default now(),
  unique (leerling_id, lesson_id)
);
create index if not exists attendance_lesson_idx on public.attendance_records (lesson_id);
create index if not exists attendance_leerling_idx on public.attendance_records (leerling_id);

drop trigger if exists attendance_updated on public.attendance_records;
create trigger attendance_updated before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ---- lesson_notes ----------------------------------------------------------
create table if not exists public.lesson_notes (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  author     text,
  body       text,
  is_draft   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lesson_notes_lesson_idx on public.lesson_notes (lesson_id);

-- ---- quran_assignments (per leerling × lesson) -----------------------------
create table if not exists public.quran_assignments (
  id                    uuid primary key default gen_random_uuid(),
  leerling_id           uuid not null references public.leerlingen(id) on delete cascade,
  class_id              uuid not null references public.classes(id) on delete cascade,
  assigned_at_lesson_id uuid references public.lessons(id) on delete set null,
  evaluated_at_lesson_id uuid references public.lessons(id) on delete set null,
  surah_n               int not null references public.surahs(n),
  start_ayah            int not null,
  end_ayah              int not null,
  type                  text not null default 'new' check (type in ('new','revision')),
  evaluation            text check (evaluation in ('yes','partial','no')),
  absent                boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index if not exists quran_leerling_idx on public.quran_assignments (leerling_id);
create index if not exists quran_class_idx on public.quran_assignments (class_id);

-- ---- leerling_surah_progress -----------------------------------------------
create table if not exists public.leerling_surah_progress (
  id          uuid primary key default gen_random_uuid(),
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  surah_n     int not null references public.surahs(n),
  status      text not null check (status in ('done','progress','review','todo')),
  updated_at  timestamptz not null default now(),
  unique (leerling_id, surah_n)
);
create index if not exists surah_progress_leerling_idx on public.leerling_surah_progress (leerling_id);

drop trigger if exists surah_progress_updated on public.leerling_surah_progress;
create trigger surah_progress_updated before update on public.leerling_surah_progress
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Metric views (single source of truth)
-- ============================================================================
create or replace view public.leerling_metrics as
select
  l.id as leerling_id,
  -- Aanwezigheid %: present / held (A,L,Z,O)
  case when att.held > 0 then round(att.present::numeric / att.held, 4) end as attendance_pct,
  -- Arabisch huiswerk gemaakt %: yes / (yes+partial+no)
  case when hw.total > 0 then round(hw.done::numeric / hw.total, 4) end as arabic_homework_pct,
  -- Qur'an geleerd %: yes / (yes+partial+no)
  case when q.total > 0 then round(q.done::numeric / q.total, 4) end as quran_learned_pct,
  coalesce(sp.surahs_known, 0) as surahs_known
from public.leerlingen l
left join lateral (
  select
    count(*) filter (where ar.status in ('A','L','Z','O')) as held,
    count(*) filter (where ar.status = 'A') as present
  from public.attendance_records ar where ar.leerling_id = l.id
) att on true
left join lateral (
  select
    count(*) filter (where ar.homework in ('yes','partial','no')) as total,
    count(*) filter (where ar.homework = 'yes') as done
  from public.attendance_records ar where ar.leerling_id = l.id
) hw on true
left join lateral (
  select
    count(*) filter (where qa.evaluation in ('yes','partial','no')) as total,
    count(*) filter (where qa.evaluation = 'yes') as done
  from public.quran_assignments qa where qa.leerling_id = l.id
) q on true
left join lateral (
  select count(*) as surahs_known
  from public.leerling_surah_progress lsp
  where lsp.leerling_id = l.id and lsp.status = 'done'
) sp on true;

create or replace view public.class_metrics as
select
  c.id as class_id,
  count(l.id) as leerling_count,
  c.capacity,
  case when c.capacity > 0 then round(count(l.id)::numeric / c.capacity, 4) end as occupancy,
  round(avg(lm.attendance_pct), 4) as avg_attendance_pct,
  round(avg(lm.arabic_homework_pct), 4) as avg_arabic_homework_pct,
  round(avg(lm.quran_learned_pct), 4) as avg_quran_learned_pct,
  round(avg(extract(year from now()) - k.birth_year), 1) as avg_age,
  count(*) filter (where k.gender = 'm') as boys,
  count(*) filter (where k.gender = 'f') as girls
from public.classes c
left join public.leerlingen l on l.class_id = c.id
left join public.kinderen k on k.id = l.kind_id
left join public.leerling_metrics lm on lm.leerling_id = l.id
group by c.id, c.capacity;

-- ============================================================================
-- RLS
-- ============================================================================
select public.apply_admin_rls('public.attendance_records');
select public.apply_admin_rls('public.lesson_notes');
select public.apply_admin_rls('public.quran_assignments');
select public.apply_admin_rls('public.leerling_surah_progress');
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
-- ============================================================================
-- 005_audit_finalize.sql — Phase 4
-- Immutable audit log (backs Instellingen → Audit log + Dashboard feed) and
-- the guarded "Definitief inschrijven" RPC that creates a leerling from an
-- enrollment placement.
-- ============================================================================

-- ---- audit_log (insert + select only) -------------------------------------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  user_label text,
  action     text,
  object     text,
  type       text,                 -- typed for the dashboard feed icon
  ip         text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_admin());

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (public.is_admin());
-- No update/delete policy => immutable.

-- ---- finalize_enrollment(): guarded "Definitief inschrijven" ---------------
-- Creates a leerling for the enrollment's kind in the chosen class/year and
-- marks the placement definitief. Idempotent on (kind, schooljaar): if a
-- leerling already exists for that kind+year it is reused.
-- Creates the kind + ouders from the enrollment when no kind is linked yet.
create or replace function public.finalize_enrollment(p_placement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl       public.enrollment_placements%rowtype;
  v_en       public.enrollments%rowtype;
  v_kind_id  uuid;
  v_leerling uuid;
  v_first    text;
  v_last     text;
  v_num      text;
  v_par      record;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_pl from public.enrollment_placements where id = p_placement_id;
  if not found then raise exception 'placement not found'; end if;
  if v_pl.class_id is null or v_pl.niveau is null then
    raise exception 'class and niveau required before finalizing';
  end if;
  if v_pl.definitief and v_pl.leerling_id is not null then
    return v_pl.leerling_id;  -- already finalized
  end if;

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  -- Split child_name into first / last (best effort).
  v_first := split_part(v_en.child_name, ' ', 1);
  v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
  v_last  := coalesce(v_last, v_first);

  -- Create the kind.
  insert into public.kinderen (first_name, last_name, gender, birth_year, initials)
  values (
    v_first, v_last, v_en.gender,
    case when v_en.age is not null then extract(year from now())::int - v_en.age end,
    upper(left(v_first,1) || left(v_last,1))
  )
  returning id into v_kind_id;

  -- Create ouders from enrollment_parents and link them.
  for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
    with o as (
      insert into public.ouders (role, name, phone, email, "primary")
      values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
      returning id
    )
    insert into public.kind_ouder (kind_id, ouder_id, is_primary)
    select v_kind_id, o.id, v_par.is_primary from o;
  end loop;

  -- Reuse a leerling for this kind+year if one exists, else create.
  select id into v_leerling from public.leerlingen
   where kind_id = v_kind_id and schooljaar_id = v_pl.schooljaar_id;

  if v_leerling is null then
    select 'M' || lpad((coalesce(max(substr(leerlingnummer,2)::int),1000) + 1)::text, 4, '0')
      into v_num from public.leerlingen where leerlingnummer ~ '^M[0-9]+$';
    insert into public.leerlingen (kind_id, class_id, schooljaar_id, leerlingnummer, niveau, joined)
    values (v_kind_id, v_pl.class_id, v_pl.schooljaar_id, coalesce(v_num,'M1001'), v_pl.niveau, current_date)
    returning id into v_leerling;
  end if;

  update public.enrollment_placements
     set definitief = true, leerling_id = v_leerling
   where id = p_placement_id;

  update public.enrollments set status = 'geaccepteerd' where id = v_en.id;

  insert into public.audit_log (user_label, action, object, type)
  values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
          'definitief ingeschreven', v_en.child_name, 'enroll');

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;

-- ============================================================================
-- 006_enrollment_preferences.sql
-- Adds the parent's preferred lesson day to an enrollment (Zaterdag / Zondag /
-- Geen voorkeur). Surfaced on the pipeline cards, table, detail sheet and the
-- klassenindeler so placement can honour the family's preference.
-- Idempotent.
-- ============================================================================

alter table public.enrollments
  add column if not exists preferred_lesday text
  check (preferred_lesday in ('Zaterdag','Zondag','Geen voorkeur'));

-- ============================================================================
-- 007_teacher_role_inval.sql
-- Adds 'inval' (Invaldocent) to the allowed teacher roles. Idempotent.
-- ============================================================================

alter table public.teachers drop constraint if exists teachers_role_check;
alter table public.teachers
  add constraint teachers_role_check check (role in ('les','quran','both','inval'));

-- ============================================================================
-- 008_pipeline_redesign.sql
-- Redesigns the inschrijvingen pipeline:
--   Wachtlijst → Intake gepland → (Toegezegd | Definitief | Afgewezen)
-- No more 'inschrijving' status; everyone starts on 'wachtlijst'.
-- Remaps legacy statuses, swaps the check constraint + default, and updates
-- finalize_enrollment() to mark the enrollment 'definitief'. Idempotent.
-- ============================================================================

alter table public.enrollments alter column status drop default;
alter table public.enrollments drop constraint if exists enrollments_status_check;

-- Remap legacy → new
update public.enrollments set status = 'wachtlijst' where status = 'inschrijving';
update public.enrollments set status = 'toegezegd'  where status = 'geaccepteerd';
update public.enrollments set status = 'afgewezen'  where status = 'niet_geaccepteerd';

-- Finalised placements outrank everything → 'definitief'
update public.enrollments e set status = 'definitief'
  from public.enrollment_placements p
  where p.enrollment_id = e.id and p.definitief = true;

-- Anything unexpected falls back to the start of the pipeline
update public.enrollments
  set status = 'wachtlijst'
  where status not in ('wachtlijst','intake','toegezegd','definitief','afgewezen');

alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('wachtlijst','intake','toegezegd','definitief','afgewezen'));
alter table public.enrollments alter column status set default 'wachtlijst';

-- ---- finalize_enrollment(): now marks the enrollment 'definitief' ----------
create or replace function public.finalize_enrollment(p_placement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl       public.enrollment_placements%rowtype;
  v_en       public.enrollments%rowtype;
  v_kind_id  uuid;
  v_leerling uuid;
  v_first    text;
  v_last     text;
  v_num      text;
  v_par      record;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_pl from public.enrollment_placements where id = p_placement_id;
  if not found then raise exception 'placement not found'; end if;
  if v_pl.class_id is null or v_pl.niveau is null then
    raise exception 'class and niveau required before finalizing';
  end if;
  if v_pl.definitief and v_pl.leerling_id is not null then
    return v_pl.leerling_id;
  end if;

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  v_first := split_part(v_en.child_name, ' ', 1);
  v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
  v_last  := coalesce(v_last, v_first);

  insert into public.kinderen (first_name, last_name, gender, birth_year, initials)
  values (
    v_first, v_last, v_en.gender,
    case when v_en.age is not null then extract(year from now())::int - v_en.age end,
    upper(left(v_first,1) || left(v_last,1))
  )
  returning id into v_kind_id;

  for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
    with o as (
      insert into public.ouders (role, name, phone, email, "primary")
      values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
      returning id
    )
    insert into public.kind_ouder (kind_id, ouder_id, is_primary)
    select v_kind_id, o.id, v_par.is_primary from o;
  end loop;

  select id into v_leerling from public.leerlingen
   where kind_id = v_kind_id and schooljaar_id = v_pl.schooljaar_id;

  if v_leerling is null then
    select 'M' || lpad((coalesce(max(substr(leerlingnummer,2)::int),1000) + 1)::text, 4, '0')
      into v_num from public.leerlingen where leerlingnummer ~ '^M[0-9]+$';
    insert into public.leerlingen (kind_id, class_id, schooljaar_id, leerlingnummer, niveau, joined)
    values (v_kind_id, v_pl.class_id, v_pl.schooljaar_id, coalesce(v_num,'M1001'), v_pl.niveau, current_date)
    returning id into v_leerling;
  end if;

  update public.enrollment_placements
     set definitief = true, leerling_id = v_leerling
   where id = p_placement_id;

  update public.enrollments set status = 'definitief' where id = v_en.id;

  insert into public.audit_log (user_label, action, object, type)
  values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
          'definitief ingeschreven', v_en.child_name, 'enroll');

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;

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

-- ============================================================================
-- 010_enrollment_address_notes.sql
-- The intake form captures an address + opmerkingen per child. Store them on the
-- enrollment and carry them over to the kind on "Definitief inschrijven".
-- Idempotent.
-- ============================================================================

alter table public.enrollments
  add column if not exists address text,
  add column if not exists notes   text;

-- finalize_enrollment(): now also copies address + notes onto the new kind.
create or replace function public.finalize_enrollment(p_placement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl       public.enrollment_placements%rowtype;
  v_en       public.enrollments%rowtype;
  v_kind_id  uuid;
  v_leerling uuid;
  v_first    text;
  v_last     text;
  v_num      text;
  v_par      record;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_pl from public.enrollment_placements where id = p_placement_id;
  if not found then raise exception 'placement not found'; end if;
  if v_pl.class_id is null or v_pl.niveau is null then
    raise exception 'class and niveau required before finalizing';
  end if;
  if v_pl.definitief and v_pl.leerling_id is not null then
    return v_pl.leerling_id;
  end if;

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  v_first := split_part(v_en.child_name, ' ', 1);
  v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
  v_last  := coalesce(v_last, v_first);

  insert into public.kinderen (first_name, last_name, gender, birth_year, initials, address, notes)
  values (
    v_first, v_last, v_en.gender,
    case when v_en.age is not null then extract(year from now())::int - v_en.age end,
    upper(left(v_first,1) || left(v_last,1)),
    v_en.address, v_en.notes
  )
  returning id into v_kind_id;

  for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
    with o as (
      insert into public.ouders (role, name, phone, email, "primary")
      values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
      returning id
    )
    insert into public.kind_ouder (kind_id, ouder_id, is_primary)
    select v_kind_id, o.id, v_par.is_primary from o;
  end loop;

  select id into v_leerling from public.leerlingen
   where kind_id = v_kind_id and schooljaar_id = v_pl.schooljaar_id;

  if v_leerling is null then
    select 'M' || lpad((coalesce(max(substr(leerlingnummer,2)::int),1000) + 1)::text, 4, '0')
      into v_num from public.leerlingen where leerlingnummer ~ '^M[0-9]+$';
    insert into public.leerlingen (kind_id, class_id, schooljaar_id, leerlingnummer, niveau, joined)
    values (v_kind_id, v_pl.class_id, v_pl.schooljaar_id, coalesce(v_num,'M1001'), v_pl.niveau, current_date)
    returning id into v_leerling;
  end if;

  update public.enrollment_placements set definitief = true, leerling_id = v_leerling where id = p_placement_id;
  update public.enrollments set status = 'definitief' where id = v_en.id;

  insert into public.audit_log (user_label, action, object, type)
  values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
          'definitief ingeschreven', v_en.child_name, 'enroll');

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;

-- ============================================================================
-- 011_enrollment_birthdate.sql
-- Keep the child's date of birth from the intake form (next to the derived age),
-- so it can be shown in the enrollment detail panel. Idempotent.
-- ============================================================================

alter table public.enrollments
  add column if not exists birthdate date;

-- ============================================================================
-- 012_lesson_teachers.sql
-- Per-lesson teacher assignment + lesson type, so the planning matrix can show
-- and edit which (substitute) teacher stands for each class per week, and mark
-- weeks as vrij / toets / activiteit. Backfills from the class defaults.
-- Idempotent.
-- ============================================================================

alter table public.lessons
  add column if not exists teacher_id       uuid references public.teachers(id) on delete set null,
  add column if not exists quran_teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists type             text not null default 'les'
                             check (type in ('les','vrij','toets','activiteit'));

create index if not exists lessons_teacher_idx on public.lessons (teacher_id);

-- Backfill teacher assignments from each lesson's class (only where still empty).
update public.lessons l
   set teacher_id = c.teacher_id,
       quran_teacher_id = c.quran_teacher_id
  from public.classes c
 where c.id = l.class_id
   and l.teacher_id is null
   and l.quran_teacher_id is null;

-- ============================================================================
-- 013_lesson_teacher_na.sql
-- "Niet nodig" flags per lesson: mark that a les- and/or Qur'an-docent is
-- intentionally not required, so the planning matrix doesn't flag the cell red.
-- Idempotent.
-- ============================================================================

alter table public.lessons
  add column if not exists teacher_na boolean not null default false,
  add column if not exists quran_na   boolean not null default false;


-- ============================================================================
-- 014_user_management.sql — Gebruikersbeheer & rollen
-- Adds a 'docent' (teacher) role next to 'admin'. A docent is linked to exactly
-- one class (profiles.class_id) and may only see + fully manage that class's
-- data; admins keep full access to everything (unchanged is_admin() policies).
--
-- Re-runnable. Apply in the Supabase SQL editor (or service_role tooling).
-- ============================================================================

-- ---- profiles: role 'docent' + class link + cached email --------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','docent'));

alter table public.profiles add column if not exists class_id uuid
  references public.classes(id) on delete set null;
alter table public.profiles add column if not exists email text;

-- ---- handle_new_user(): also cache the email on the profile -----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill email for existing profiles.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- ---- helpers ---------------------------------------------------------------
-- The class the caller manages (null for admins / unlinked users).
create or replace function public.current_class_id()
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_docent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'docent'
  );
$$;

-- True when the given leerling belongs to the caller's class.
create or replace function public.leerling_in_my_class(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leerlingen l
    where l.id = lid and l.class_id = public.current_class_id()
  );
$$;

-- True when the given lesson belongs to the caller's class.
create or replace function public.lesson_in_my_class(les uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lessons le
    where le.id = les and le.class_id = public.current_class_id()
  );
$$;

-- ---- metric views run with the caller's RLS (so docents see only their class)
alter view public.leerling_metrics set (security_invoker = on);
alter view public.class_metrics    set (security_invoker = on);

-- ============================================================================
-- Docent RLS policies (additive — admin *_admin_all policies stay in place and
-- are OR-combined). A docent is scoped to public.current_class_id().
-- ============================================================================

-- profiles: a docent may read its own row (needed to resolve role + class).
drop policy if exists docent_profiles_select_self on public.profiles;
create policy docent_profiles_select_self on public.profiles
  for select using (id = auth.uid());

-- classes: read + update the own class.
drop policy if exists docent_classes_select on public.classes;
create policy docent_classes_select on public.classes
  for select using (id = public.current_class_id());
drop policy if exists docent_classes_update on public.classes;
create policy docent_classes_update on public.classes
  for update using (id = public.current_class_id())
  with check (id = public.current_class_id());

-- leerlingen: read + manage pupils of the own class.
drop policy if exists docent_leerlingen_all on public.leerlingen;
create policy docent_leerlingen_all on public.leerlingen
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- lessons: full manage for the own class.
drop policy if exists docent_lessons_all on public.lessons;
create policy docent_lessons_all on public.lessons
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- attendance_records: full manage for pupils of the own class.
drop policy if exists docent_attendance_all on public.attendance_records;
create policy docent_attendance_all on public.attendance_records
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- lesson_notes: full manage for lessons of the own class.
drop policy if exists docent_lesson_notes_all on public.lesson_notes;
create policy docent_lesson_notes_all on public.lesson_notes
  for all using (public.lesson_in_my_class(lesson_id))
  with check (public.lesson_in_my_class(lesson_id));

-- quran_assignments: full manage for the own class.
drop policy if exists docent_quran_all on public.quran_assignments;
create policy docent_quran_all on public.quran_assignments
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- leerling_surah_progress: full manage for pupils of the own class.
drop policy if exists docent_surah_progress_all on public.leerling_surah_progress;
create policy docent_surah_progress_all on public.leerling_surah_progress
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- kinderen: read + update the children behind the own class's pupils.
drop policy if exists docent_kinderen_rw on public.kinderen;
create policy docent_kinderen_rw on public.kinderen
  for all using (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kinderen.id and l.class_id = public.current_class_id())
  ) with check (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kinderen.id and l.class_id = public.current_class_id())
  );

-- ouders / kind_ouder: read parent contacts of the own class's children.
drop policy if exists docent_kind_ouder_select on public.kind_ouder;
create policy docent_kind_ouder_select on public.kind_ouder
  for select using (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kind_ouder.kind_id and l.class_id = public.current_class_id())
  );
drop policy if exists docent_ouders_select on public.ouders;
create policy docent_ouders_select on public.ouders
  for select using (
    exists (
      select 1 from public.kind_ouder ko
      join public.leerlingen l on l.kind_id = ko.kind_id
      where ko.ouder_id = ouders.id and l.class_id = public.current_class_id()
    )
  );

-- Reference data a docent needs read-only: teachers, surahs, schooljaren, settings.
drop policy if exists docent_teachers_select on public.teachers;
create policy docent_teachers_select on public.teachers
  for select using (public.is_docent());
drop policy if exists docent_surahs_select on public.surahs;
create policy docent_surahs_select on public.surahs
  for select using (public.is_docent());
drop policy if exists docent_schooljaren_select on public.schooljaren;
create policy docent_schooljaren_select on public.schooljaren
  for select using (public.is_docent());
drop policy if exists docent_app_settings_select on public.app_settings;
create policy docent_app_settings_select on public.app_settings
  for select using (public.is_docent());


-- ============================================================================
-- 015_toetsen_beoordelingen.sql — Toetsen & Beoordelingen
-- ============================================================================

-- ---- report_periods (globaal, admin-beheerd) -------------------------------
create table if not exists public.report_periods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  ord        int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.report_periods (name, ord)
select v.name, v.ord
from (values ('Rapport 1', 1), ('Rapport 2', 2), ('Eindrapport', 3)) as v(name, ord)
where not exists (select 1 from public.report_periods rp where rp.name = v.name);

-- ---- tests (per klas × rapport) --------------------------------------------
create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  name             text not null,
  grade_type       text not null check (grade_type in ('cijfer','schaal')),
  created_at       timestamptz not null default now()
);
create index if not exists tests_class_period_idx on public.tests (class_id, report_period_id);

-- ---- test_grades (per toets × leerling) ------------------------------------
create table if not exists public.test_grades (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests(id) on delete cascade,
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  value       text,
  updated_at  timestamptz not null default now(),
  unique (test_id, leerling_id)
);
create index if not exists test_grades_test_idx on public.test_grades (test_id);
create index if not exists test_grades_leerling_idx on public.test_grades (leerling_id);

drop trigger if exists test_grades_updated on public.test_grades;
create trigger test_grades_updated before update on public.test_grades
  for each row execute function public.set_updated_at();

-- ---- report_assessments (vaste kolommen per leerling × rapport) -------------
create table if not exists public.report_assessments (
  id               uuid primary key default gen_random_uuid(),
  leerling_id      uuid not null references public.leerlingen(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  quran            text,
  gedrag           text,
  inzet            text,
  opmerking        text,
  updated_at       timestamptz not null default now(),
  unique (leerling_id, report_period_id)
);
create index if not exists report_assessments_leerling_idx on public.report_assessments (leerling_id);

drop trigger if exists report_assessments_updated on public.report_assessments;
create trigger report_assessments_updated before update on public.report_assessments
  for each row execute function public.set_updated_at();

-- RLS: admin volledige toegang + docent gescoped op eigen klas.
select public.apply_admin_rls('public.report_periods');
select public.apply_admin_rls('public.tests');
select public.apply_admin_rls('public.test_grades');
select public.apply_admin_rls('public.report_assessments');

drop policy if exists docent_report_periods_select on public.report_periods;
create policy docent_report_periods_select on public.report_periods
  for select using (public.is_docent());

drop policy if exists docent_tests_all on public.tests;
create policy docent_tests_all on public.tests
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

drop policy if exists docent_test_grades_all on public.test_grades;
create policy docent_test_grades_all on public.test_grades
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

drop policy if exists docent_report_assessments_all on public.report_assessments;
create policy docent_report_assessments_all on public.report_assessments
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));
