-- ============================================================================
-- 024_google_contacts.sql — Koppeling met Google Contacts
--
-- `google_contacts` onthoudt welk Google-contact bij welk (genormaliseerd)
-- telefoonnummer hoort. Het telefoonnummer is de identiteit: dat is het enige
-- veld dat betrouwbaar overeenkomt met de handmatige import van vorig jaar.
-- De etag slaan we op omdat de People API die eist bij een update.
--
-- `google_contact_sync_runs` legt elke run vast — ook de dry-runs — zodat je
-- kunt terugzien wat er wanneer naar Google is geschreven en door wie.
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

create table if not exists public.google_contacts (
  phone_e164    text primary key,
  resource_name text not null,                    -- "people/c1234567890"
  etag          text,
  display_name  text,                             -- naam zoals wij hem laatst zetten
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.google_contact_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  dry_run      boolean not null default true,
  ok           boolean not null default false,
  created      int not null default 0,
  updated      int not null default 0,
  unchanged    int not null default 0,
  skipped      int not null default 0,
  conflicts    int not null default 0,
  error        text,
  plan         jsonb,                             -- volledige regel-voor-regel uitkomst
  run_by       uuid references public.profiles(id) on delete set null,
  run_by_name  text
);

create index if not exists google_contact_sync_runs_started_idx
  on public.google_contact_sync_runs (started_at desc);

-- Alleen admins; de sync-function zelf draait op de service role en omzeilt RLS.
select public.apply_admin_rls('public.google_contacts');
select public.apply_admin_rls('public.google_contact_sync_runs');
