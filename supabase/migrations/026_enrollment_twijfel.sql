-- ============================================================================
-- 026_enrollment_twijfel.sql — Twijfel markeren bij een inschrijving
--
-- Bewust géén extra status: twijfel staat los van waar een inschrijving in de
-- pijplijn zit. Je kunt over een toegezegde inschrijving twijfelen zonder die
-- status kwijt te raken, en de markering blijft staan tot je 'm weghaalt.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.enrollments
  add column if not exists twijfel boolean not null default false;

create index if not exists enrollments_twijfel_idx
  on public.enrollments (twijfel) where twijfel;
