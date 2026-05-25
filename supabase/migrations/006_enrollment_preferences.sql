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
