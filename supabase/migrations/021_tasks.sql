-- ============================================================================
-- 021_tasks.sql — Takenbord voor het team
--
-- Gedeelde to-do's en projecten voor admins én docenten: een taak heeft een
-- titel, omschrijving, status (kanban-kolom), prioriteit, einddatum, één
-- toegewezen persoon en een checklist met subtaken.
--
-- Iedereen die is ingelogd mag alles zien en bewerken — het is één teambord.
-- Daarvoor mogen docenten ook de namen van collega's opvragen; tot nu toe zag
-- een docent alleen zijn eigen profiel.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

-- ---- tasks -----------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'todo'    check (status   in ('todo','doing','done')),
  priority    text not null default 'normaal' check (priority in ('laag','normaal','hoog')),
  due_date    date,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_status_idx   on public.tasks (status);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

drop trigger if exists tasks_updated on public.tasks;
create trigger tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---- subtaken (checklist binnen een taak) ----------------------------------
create table if not exists public.task_subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists task_subtasks_task_idx on public.task_subtasks (task_id, position);

-- ---- RLS: één gedeeld bord voor iedereen die is ingelogd -------------------
alter table public.tasks         enable row level security;
alter table public.task_subtasks enable row level security;

drop policy if exists tasks_team_all on public.tasks;
create policy tasks_team_all on public.tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists task_subtasks_team_all on public.task_subtasks;
create policy task_subtasks_team_all on public.task_subtasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Toegewezen personen tonen: elke ingelogde gebruiker mag profielen lezen.
-- Policies zijn OR'd, dus docent_profiles_select_self blijft gewoon bestaan.
drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles
  for select using (auth.uid() is not null);
