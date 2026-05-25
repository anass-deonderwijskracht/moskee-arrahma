-- ============================================================================
-- 012_lesson_teachers.sql
-- Per-lesson teacher assignment + lesson type, so the planning matrix can show
-- and edit which (substitute) teacher stands for each class per week, and mark
-- weeks as vrij / toets / activiteit. Backfills from the class defaults.
-- Idempotent.
-- ============================================================================

alter table public.lessons
  add column if not exists teacher_id       uuid references public.teachers(id) on delete set null,
  add column if not exists quran_teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists type             text not null default 'les'
                             check (type in ('les','vrij','toets','activiteit'));

create index if not exists lessons_teacher_idx on public.lessons (teacher_id);

-- Backfill teacher assignments from each lesson's class (only where still empty).
update public.lessons l
   set teacher_id = c.teacher_id,
       quran_teacher_id = c.quran_teacher_id
  from public.classes c
 where c.id = l.class_id
   and l.teacher_id is null
   and l.quran_teacher_id is null;
