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
