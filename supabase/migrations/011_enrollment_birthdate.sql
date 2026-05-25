-- ============================================================================
-- 011_enrollment_birthdate.sql
-- Keep the child's date of birth from the intake form (next to the derived age),
-- so it can be shown in the enrollment detail panel. Idempotent.
-- ============================================================================

alter table public.enrollments
  add column if not exists birthdate date;
