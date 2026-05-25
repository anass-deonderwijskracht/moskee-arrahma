-- ============================================================================
-- 013_lesson_teacher_na.sql
-- "Niet nodig" flags per lesson: mark that a les- and/or Qur'an-docent is
-- intentionally not required, so the planning matrix doesn't flag the cell red.
-- Idempotent.
-- ============================================================================

alter table public.lessons
  add column if not exists teacher_na boolean not null default false,
  add column if not exists quran_na   boolean not null default false;
