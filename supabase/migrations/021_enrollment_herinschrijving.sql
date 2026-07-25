-- ============================================================================
-- 021_enrollment_herinschrijving.sql
-- Voegt de status 'herinschrijving' toe aan de inschrijvingspijplijn:
--   Herinschrijving → Wachtlijst → Intake gepland → (Toegezegd | Definitief | Afgewezen)
-- Aanmeldingen die via de Fillout-webhook binnenkomen krijgen voortaan
-- 'herinschrijving'; alle bestaande wachtlijst-inschrijvingen worden omgezet.
-- De default blijft 'wachtlijst' (handmatige "Nieuwe aanmelding"). Idempotent.
-- ============================================================================

alter table public.enrollments drop constraint if exists enrollments_status_check;

alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('herinschrijving','wachtlijst','intake','toegezegd','definitief','afgewezen'));

update public.enrollments set status = 'herinschrijving' where status = 'wachtlijst';
