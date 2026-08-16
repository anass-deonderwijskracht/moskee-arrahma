-- ============================================================================
-- Configureerbaar ouderbericht per intake en aanwezigheid per inschrijving.
--
-- Aanwezigheid staat bewust los van intake_choices: een beheerder kan daardoor
-- ook een kind afvinken dat vooraf geen datumkeuze heeft opgeslagen.
-- ============================================================================

alter table public.intake_moments
  add column if not exists message_template text not null
    default E'Beste ouder,\n\nHierbij uw persoonlijke link voor het intakeformulier: [link]';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_moments'::regclass
       and conname = 'intake_moments_message_template_length'
  ) then
    alter table public.intake_moments
      add constraint intake_moments_message_template_length
      check (length(trim(message_template)) between 1 and 5000);
  end if;
end
$$;

create table if not exists public.intake_attendance (
  intake_moment_id uuid not null references public.intake_moments(id) on delete cascade,
  enrollment_id    uuid not null references public.enrollments(id) on delete cascade,
  attended         boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (intake_moment_id, enrollment_id)
);

drop trigger if exists intake_attendance_updated on public.intake_attendance;
create trigger intake_attendance_updated
  before update on public.intake_attendance
  for each row execute function public.set_updated_at();

select public.apply_admin_rls('public.intake_attendance');

-- Nieuwe public-tabellen worden niet meer altijd automatisch aan de Data API
-- toegekend. Leg de toegang daarom expliciet vast naast de RLS-policies.
revoke all on public.intake_attendance from anon;
grant select, insert, update, delete on public.intake_attendance to authenticated;
grant all on public.intake_attendance to service_role;
