-- ============================================================================
-- 022_teacher_payouts.sql — Maandelijkse docentuitbetalingen
-- Per docent, per schooljaar, per maand vastleggen dát er is uitbetaald.
-- Bestaat er een rij, dan is die maand voor die docent uitbetaald; afvinken
-- verwijdert de rij weer. De uren/tarief/bedrag worden als SNAPSHOT bewaard,
-- zodat historie waar blijft als de planning of het uurtarief later wijzigt.
-- `period` is altijd de eerste dag van de maand. Re-runnable.
-- Apply in de Supabase SQL editor.
-- ============================================================================

create table if not exists public.teacher_payouts (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  schooljaar_id uuid not null references public.schooljaren(id) on delete cascade,
  period        date not null check (extract(day from period) = 1), -- 1e van de maand
  lessons       int not null default 0,        -- snapshot: aantal toewijzingen
  hours         numeric not null default 0,    -- snapshot: ingeplande uren
  rate          numeric,                       -- snapshot: uurtarief op moment van uitbetalen
  amount        numeric not null default 0,    -- snapshot: uitbetaald bedrag
  paid_at       timestamptz not null default now(),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Eén uitbetaling per docent per maand per schooljaar (dient ook als upsert-target).
create unique index if not exists teacher_payouts_unique_idx
  on public.teacher_payouts (teacher_id, schooljaar_id, period);
create index if not exists teacher_payouts_period_idx
  on public.teacher_payouts (schooljaar_id, period);

-- RLS: alleen admin (docenten zien elkaars uitbetalingen niet).
select public.apply_admin_rls('public.teacher_payouts');

drop trigger if exists teacher_payouts_updated on public.teacher_payouts;
create trigger teacher_payouts_updated before update on public.teacher_payouts
  for each row execute function public.set_updated_at();
