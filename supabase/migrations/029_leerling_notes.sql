-- ============================================================================
-- 029_leerling_notes.sql — Notities die aan een leerling hangen
--
-- lesson_notes hing tot nu toe altijd aan een les, en dus aan de hele klas: op
-- het tabblad Notities van een leerling zag je de lesnotities van zijn klas,
-- niet iets over die leerling zelf. Er was ook geen manier om vanaf die pagina
-- iets toe te voegen.
--
-- Daarom: `leerling_id` erbij en `lesson_id` optioneel. Een notitie hangt
-- voortaan aan een les (klasbreed, zoals voorheen), aan een leerling, of aan
-- allebei — dat laatste is de "notitie over deze leerling, bij die les".
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.lesson_notes
  add column if not exists leerling_id uuid references public.leerlingen(id) on delete cascade;

alter table public.lesson_notes alter column lesson_id drop not null;

create index if not exists lesson_notes_leerling_idx
  on public.lesson_notes (leerling_id);

-- Een notitie zonder les én zonder leerling hoort nergens bij.
alter table public.lesson_notes drop constraint if exists lesson_notes_scope_check;
alter table public.lesson_notes add constraint lesson_notes_scope_check
  check (lesson_id is not null or leerling_id is not null);

-- ---- RLS: docenten mogen ook notities bij hun eigen leerlingen -------------
-- De bestaande policy toetste alleen op de les. Bij een notitie zonder les
-- levert dat NULL op en zou een docent zijn eigen notitie niet terugzien.
create or replace function public.leerling_in_my_class(p_leerling uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leerlingen l
    where l.id = p_leerling and l.class_id = public.current_class_id()
  );
$$;

drop policy if exists docent_lesson_notes_all on public.lesson_notes;
create policy docent_lesson_notes_all on public.lesson_notes
  for all
  using (public.lesson_in_my_class(lesson_id) or public.leerling_in_my_class(leerling_id))
  with check (public.lesson_in_my_class(lesson_id) or public.leerling_in_my_class(leerling_id));
