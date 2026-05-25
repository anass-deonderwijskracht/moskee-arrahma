-- ============================================================================
-- 003_administratie.sql — Phase 2 (write workflows)
-- Les-administratie (attendance + Arabic homework + materials + notes) and
-- Qur'an-administratie (assignments, evaluations, surah progress).
-- Defines the leerling_metrics / class_metrics views over this real data.
-- ============================================================================

-- ---- attendance_records (per leerling × lesson) ----------------------------
create table if not exists public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  leerling_id     uuid not null references public.leerlingen(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  status          text check (status in ('A','L','Z','O')),     -- null/'-' = not filled
  homework        text check (homework in ('yes','partial','no')), -- Arabic homework
  materials_issue boolean not null default false,                -- true ONLY when NOT in order
  note            text,
  updated_at      timestamptz not null default now(),
  unique (leerling_id, lesson_id)
);
create index if not exists attendance_lesson_idx on public.attendance_records (lesson_id);
create index if not exists attendance_leerling_idx on public.attendance_records (leerling_id);

drop trigger if exists attendance_updated on public.attendance_records;
create trigger attendance_updated before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ---- lesson_notes ----------------------------------------------------------
create table if not exists public.lesson_notes (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  author     text,
  body       text,
  is_draft   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lesson_notes_lesson_idx on public.lesson_notes (lesson_id);

-- ---- quran_assignments (per leerling × lesson) -----------------------------
create table if not exists public.quran_assignments (
  id                    uuid primary key default gen_random_uuid(),
  leerling_id           uuid not null references public.leerlingen(id) on delete cascade,
  class_id              uuid not null references public.classes(id) on delete cascade,
  assigned_at_lesson_id uuid references public.lessons(id) on delete set null,
  evaluated_at_lesson_id uuid references public.lessons(id) on delete set null,
  surah_n               int not null references public.surahs(n),
  start_ayah            int not null,
  end_ayah              int not null,
  type                  text not null default 'new' check (type in ('new','revision')),
  evaluation            text check (evaluation in ('yes','partial','no')),
  absent                boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index if not exists quran_leerling_idx on public.quran_assignments (leerling_id);
create index if not exists quran_class_idx on public.quran_assignments (class_id);

-- ---- leerling_surah_progress -----------------------------------------------
create table if not exists public.leerling_surah_progress (
  id          uuid primary key default gen_random_uuid(),
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  surah_n     int not null references public.surahs(n),
  status      text not null check (status in ('done','progress','review','todo')),
  updated_at  timestamptz not null default now(),
  unique (leerling_id, surah_n)
);
create index if not exists surah_progress_leerling_idx on public.leerling_surah_progress (leerling_id);

drop trigger if exists surah_progress_updated on public.leerling_surah_progress;
create trigger surah_progress_updated before update on public.leerling_surah_progress
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Metric views (single source of truth)
-- ============================================================================
create or replace view public.leerling_metrics as
select
  l.id as leerling_id,
  -- Aanwezigheid %: present / held (A,L,Z,O)
  case when att.held > 0 then round(att.present::numeric / att.held, 4) end as attendance_pct,
  -- Arabisch huiswerk gemaakt %: yes / (yes+partial+no)
  case when hw.total > 0 then round(hw.done::numeric / hw.total, 4) end as arabic_homework_pct,
  -- Qur'an geleerd %: yes / (yes+partial+no)
  case when q.total > 0 then round(q.done::numeric / q.total, 4) end as quran_learned_pct,
  coalesce(sp.surahs_known, 0) as surahs_known
from public.leerlingen l
left join lateral (
  select
    count(*) filter (where ar.status in ('A','L','Z','O')) as held,
    count(*) filter (where ar.status = 'A') as present
  from public.attendance_records ar where ar.leerling_id = l.id
) att on true
left join lateral (
  select
    count(*) filter (where ar.homework in ('yes','partial','no')) as total,
    count(*) filter (where ar.homework = 'yes') as done
  from public.attendance_records ar where ar.leerling_id = l.id
) hw on true
left join lateral (
  select
    count(*) filter (where qa.evaluation in ('yes','partial','no')) as total,
    count(*) filter (where qa.evaluation = 'yes') as done
  from public.quran_assignments qa where qa.leerling_id = l.id
) q on true
left join lateral (
  select count(*) as surahs_known
  from public.leerling_surah_progress lsp
  where lsp.leerling_id = l.id and lsp.status = 'done'
) sp on true;

create or replace view public.class_metrics as
select
  c.id as class_id,
  count(l.id) as leerling_count,
  c.capacity,
  case when c.capacity > 0 then round(count(l.id)::numeric / c.capacity, 4) end as occupancy,
  round(avg(lm.attendance_pct), 4) as avg_attendance_pct,
  round(avg(lm.arabic_homework_pct), 4) as avg_arabic_homework_pct,
  round(avg(lm.quran_learned_pct), 4) as avg_quran_learned_pct,
  round(avg(extract(year from now()) - k.birth_year), 1) as avg_age,
  count(*) filter (where k.gender = 'm') as boys,
  count(*) filter (where k.gender = 'f') as girls
from public.classes c
left join public.leerlingen l on l.class_id = c.id
left join public.kinderen k on k.id = l.kind_id
left join public.leerling_metrics lm on lm.leerling_id = l.id
group by c.id, c.capacity;

-- ============================================================================
-- RLS
-- ============================================================================
select public.apply_admin_rls('public.attendance_records');
select public.apply_admin_rls('public.lesson_notes');
select public.apply_admin_rls('public.quran_assignments');
select public.apply_admin_rls('public.leerling_surah_progress');
