-- ============================================================================
-- 007_teacher_role_inval.sql
-- Adds 'inval' (Invaldocent) to the allowed teacher roles. Idempotent.
-- ============================================================================

alter table public.teachers drop constraint if exists teachers_role_check;
alter table public.teachers
  add constraint teachers_role_check check (role in ('les','quran','both','inval'));
