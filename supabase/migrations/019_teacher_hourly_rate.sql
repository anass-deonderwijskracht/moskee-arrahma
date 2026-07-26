-- ============================================================================
-- 019_teacher_hourly_rate.sql — Uurtarief per docent
-- Voegt een uurtarief (€/uur) per docent toe. Op basis hiervan begroten we
-- hoeveel we per schooljaar aan docenten betalen: per ingeplande les telt de
-- lesduur (uit het tijdvak van de klas) × het huidige uurtarief van de docent.
-- null = onbekend (telt als 0 in de begroting). Re-runnable. Geen RLS-wijziging
-- nodig: public.teachers heeft al admin-RLS. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.teachers add column if not exists uurtarief numeric; -- €/uur
