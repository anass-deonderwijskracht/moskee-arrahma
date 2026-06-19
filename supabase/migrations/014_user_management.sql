-- ============================================================================
-- 014_user_management.sql — Gebruikersbeheer & rollen
-- Adds a 'docent' (teacher) role next to 'admin'. A docent is linked to exactly
-- one class (profiles.class_id) and may only see + fully manage that class's
-- data; admins keep full access to everything (unchanged is_admin() policies).
--
-- Re-runnable. Apply in the Supabase SQL editor (or service_role tooling).
-- ============================================================================

-- ---- profiles: role 'docent' + class link + cached email --------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','docent'));

alter table public.profiles add column if not exists class_id uuid
  references public.classes(id) on delete set null;
alter table public.profiles add column if not exists email text;

-- ---- handle_new_user(): also cache the email on the profile -----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill email for existing profiles.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- ---- helpers ---------------------------------------------------------------
-- The class the caller manages (null for admins / unlinked users).
create or replace function public.current_class_id()
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_docent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'docent'
  );
$$;

-- True when the given leerling belongs to the caller's class.
create or replace function public.leerling_in_my_class(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leerlingen l
    where l.id = lid and l.class_id = public.current_class_id()
  );
$$;

-- True when the given lesson belongs to the caller's class.
create or replace function public.lesson_in_my_class(les uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lessons le
    where le.id = les and le.class_id = public.current_class_id()
  );
$$;

-- ---- metric views run with the caller's RLS (so docents see only their class)
alter view public.leerling_metrics set (security_invoker = on);
alter view public.class_metrics    set (security_invoker = on);

-- ============================================================================
-- Docent RLS policies (additive — admin *_admin_all policies stay in place and
-- are OR-combined). A docent is scoped to public.current_class_id().
-- ============================================================================

-- profiles: a docent may read its own row (needed to resolve role + class).
drop policy if exists docent_profiles_select_self on public.profiles;
create policy docent_profiles_select_self on public.profiles
  for select using (id = auth.uid());

-- classes: read + update the own class.
drop policy if exists docent_classes_select on public.classes;
create policy docent_classes_select on public.classes
  for select using (id = public.current_class_id());
drop policy if exists docent_classes_update on public.classes;
create policy docent_classes_update on public.classes
  for update using (id = public.current_class_id())
  with check (id = public.current_class_id());

-- leerlingen: read + manage pupils of the own class.
drop policy if exists docent_leerlingen_all on public.leerlingen;
create policy docent_leerlingen_all on public.leerlingen
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- lessons: full manage for the own class.
drop policy if exists docent_lessons_all on public.lessons;
create policy docent_lessons_all on public.lessons
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- attendance_records: full manage for pupils of the own class.
drop policy if exists docent_attendance_all on public.attendance_records;
create policy docent_attendance_all on public.attendance_records
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- lesson_notes: full manage for lessons of the own class.
drop policy if exists docent_lesson_notes_all on public.lesson_notes;
create policy docent_lesson_notes_all on public.lesson_notes
  for all using (public.lesson_in_my_class(lesson_id))
  with check (public.lesson_in_my_class(lesson_id));

-- quran_assignments: full manage for the own class.
drop policy if exists docent_quran_all on public.quran_assignments;
create policy docent_quran_all on public.quran_assignments
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- leerling_surah_progress: full manage for pupils of the own class.
drop policy if exists docent_surah_progress_all on public.leerling_surah_progress;
create policy docent_surah_progress_all on public.leerling_surah_progress
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- kinderen: read + update the children behind the own class's pupils.
drop policy if exists docent_kinderen_rw on public.kinderen;
create policy docent_kinderen_rw on public.kinderen
  for all using (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kinderen.id and l.class_id = public.current_class_id())
  ) with check (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kinderen.id and l.class_id = public.current_class_id())
  );

-- ouders / kind_ouder: read parent contacts of the own class's children.
drop policy if exists docent_kind_ouder_select on public.kind_ouder;
create policy docent_kind_ouder_select on public.kind_ouder
  for select using (
    exists (select 1 from public.leerlingen l
            where l.kind_id = kind_ouder.kind_id and l.class_id = public.current_class_id())
  );
drop policy if exists docent_ouders_select on public.ouders;
create policy docent_ouders_select on public.ouders
  for select using (
    exists (
      select 1 from public.kind_ouder ko
      join public.leerlingen l on l.kind_id = ko.kind_id
      where ko.ouder_id = ouders.id and l.class_id = public.current_class_id()
    )
  );

-- Reference data a docent needs read-only: teachers, surahs, schooljaren, settings.
drop policy if exists docent_teachers_select on public.teachers;
create policy docent_teachers_select on public.teachers
  for select using (public.is_docent());
drop policy if exists docent_surahs_select on public.surahs;
create policy docent_surahs_select on public.surahs
  for select using (public.is_docent());
drop policy if exists docent_schooljaren_select on public.schooljaren;
create policy docent_schooljaren_select on public.schooljaren
  for select using (public.is_docent());
drop policy if exists docent_app_settings_select on public.app_settings;
create policy docent_app_settings_select on public.app_settings
  for select using (public.is_docent());
