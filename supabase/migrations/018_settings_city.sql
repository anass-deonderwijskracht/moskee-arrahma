-- ============================================================================
-- 018_settings_city.sql — Plaats/stad bij de organisatie-instellingen
-- Voegt een vrije 'city' toe aan app_settings, getoond in de zijbalk naast
-- "Weekendonderwijs". Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.app_settings add column if not exists city text;

-- Bestaande (enige) rij een zinnige standaard geven als de stad nog leeg is.
update public.app_settings set city = 'Almere' where city is null;
