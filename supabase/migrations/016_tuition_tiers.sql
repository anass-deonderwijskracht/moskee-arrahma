-- ============================================================================
-- 016_tuition_tiers.sql — Gestaffeld lesgeld per schooljaar
-- Lesgeld-staffel per schooljaar én per traject (1e kind, 2e kind, …), plus een
-- handmatige override per leerling. Het verschuldigde lesgeld van een kind is de
-- override (indien gezet), anders het staffelbedrag op basis van de gezinsrang.
-- Admin: volledige toegang. Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

-- ---- tuition_tiers (staffel per schooljaar × traject × rang) ----------------
create table if not exists public.tuition_tiers (
  id            uuid primary key default gen_random_uuid(),
  schooljaar_id uuid not null references public.schooljaren(id) on delete cascade,
  track         text not null check (track in ('regulier','hifdh')),
  rang          int  not null check (rang >= 1),       -- 1 = 1e kind, 2 = 2e kind, …
  bedrag        numeric not null default 0,
  unique (schooljaar_id, track, rang)
);
create index if not exists tuition_tiers_schooljaar_idx on public.tuition_tiers (schooljaar_id);

-- ---- leerlingen.lesgeld_override (handmatig per kind) -----------------------
-- null = volg de staffel; een waarde overschrijft het berekende staffelbedrag.
alter table public.leerlingen add column if not exists lesgeld_override numeric;

-- ---- Seed: rang-1 staffel per schooljaar uit de bestaande tarieven ----------
-- Zo blijft de begroting werken na de overstap; verdere treden voeg je zelf toe.
insert into public.tuition_tiers (schooljaar_id, track, rang, bedrag)
select s.id, t.track, 1, t.bedrag
from public.schooljaren s
cross join (
  select 'regulier'::text as track, coalesce((select tuition_regulier_eur from public.app_settings limit 1), 220) as bedrag
  union all
  select 'hifdh'::text, coalesce((select tuition_hifdh_eur from public.app_settings limit 1), 350)
) t
where not exists (
  select 1 from public.tuition_tiers tt
  where tt.schooljaar_id = s.id and tt.track = t.track and tt.rang = 1
);

-- ============================================================================
-- RLS: admin volledige toegang.
-- ============================================================================
select public.apply_admin_rls('public.tuition_tiers');
