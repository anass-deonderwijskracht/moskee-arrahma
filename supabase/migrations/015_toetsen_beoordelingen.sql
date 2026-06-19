-- ============================================================================
-- 015_toetsen_beoordelingen.sql — Toetsen & Beoordelingen
-- Rapportperioden (admin-beheerd), toetsen per klas+rapport, cijfers per toets
-- per leerling, en vaste rapportkolommen (Quran/Gedrag/Inzet/Opmerking).
-- Admin: volledige toegang. Docent: gescoped op eigen klas (zoals 014).
-- Re-runnable. Apply in de Supabase SQL editor (of service_role tooling).
-- ============================================================================

-- ---- report_periods (globaal, admin-beheerd) -------------------------------
create table if not exists public.report_periods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  ord        int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed de drie standaardperioden (idempotent op naam).
insert into public.report_periods (name, ord)
select v.name, v.ord
from (values ('Rapport 1', 1), ('Rapport 2', 2), ('Eindrapport', 3)) as v(name, ord)
where not exists (select 1 from public.report_periods rp where rp.name = v.name);

-- ---- tests (per klas × rapport) --------------------------------------------
create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  name             text not null,
  grade_type       text not null check (grade_type in ('cijfer','schaal')),
  created_at       timestamptz not null default now()
);
create index if not exists tests_class_period_idx on public.tests (class_id, report_period_id);

-- ---- test_grades (per toets × leerling) ------------------------------------
create table if not exists public.test_grades (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests(id) on delete cascade,
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  value       text,
  updated_at  timestamptz not null default now(),
  unique (test_id, leerling_id)
);
create index if not exists test_grades_test_idx on public.test_grades (test_id);
create index if not exists test_grades_leerling_idx on public.test_grades (leerling_id);

drop trigger if exists test_grades_updated on public.test_grades;
create trigger test_grades_updated before update on public.test_grades
  for each row execute function public.set_updated_at();

-- ---- report_assessments (vaste kolommen per leerling × rapport) -------------
create table if not exists public.report_assessments (
  id               uuid primary key default gen_random_uuid(),
  leerling_id      uuid not null references public.leerlingen(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  quran            text,
  gedrag           text,
  inzet            text,
  opmerking        text,
  updated_at       timestamptz not null default now(),
  unique (leerling_id, report_period_id)
);
create index if not exists report_assessments_leerling_idx on public.report_assessments (leerling_id);

drop trigger if exists report_assessments_updated on public.report_assessments;
create trigger report_assessments_updated before update on public.report_assessments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS: admin volledige toegang (apply_admin_rls), docent gescoped (additief).
-- ============================================================================
select public.apply_admin_rls('public.report_periods');
select public.apply_admin_rls('public.tests');
select public.apply_admin_rls('public.test_grades');
select public.apply_admin_rls('public.report_assessments');

-- report_periods: docent mag alleen lezen (beheer is admin-only).
drop policy if exists docent_report_periods_select on public.report_periods;
create policy docent_report_periods_select on public.report_periods
  for select using (public.is_docent());

-- tests: docent beheert toetsen van de eigen klas.
drop policy if exists docent_tests_all on public.tests;
create policy docent_tests_all on public.tests
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- test_grades: docent beheert cijfers van leerlingen in de eigen klas.
drop policy if exists docent_test_grades_all on public.test_grades;
create policy docent_test_grades_all on public.test_grades
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- report_assessments: docent beheert oordelen van leerlingen in de eigen klas.
drop policy if exists docent_report_assessments_all on public.report_assessments;
create policy docent_report_assessments_all on public.report_assessments
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));
