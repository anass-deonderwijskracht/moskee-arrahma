-- ============================================================================
-- 017_placement_verschuldigd.sql — Te-betalen lesgeld per inschrijving
-- Voegt het te-betalen bedrag (verschuldigd lesgeld) toe aan een placement.
-- null = volg de staffel (1e-kind tarief van het traject); een waarde is een
-- handmatige override. Het bestaande lesgeld_bedrag blijft "betaald".
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.enrollment_placements
  add column if not exists lesgeld_verschuldigd numeric;
