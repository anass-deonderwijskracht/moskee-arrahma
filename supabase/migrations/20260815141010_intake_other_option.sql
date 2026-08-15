-- ============================================================================
-- Optionele vrije keuze "Anders" bij een intakemoment.
--
-- Een keuze verwijst voortaan óf naar een vaste datum óf bevat vrije tekst.
-- De publieke RPC blijft de enige schrijfruimte voor niet-ingelogde bezoekers.
-- ============================================================================

alter table public.intake_moments
  add column if not exists allow_other boolean not null default false;

alter table public.intake_choices
  alter column intake_slot_id drop not null,
  add column if not exists other_text text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_choices'::regclass
       and conname = 'intake_choices_exactly_one_option'
  ) then
    alter table public.intake_choices
      add constraint intake_choices_exactly_one_option check (
        (intake_slot_id is not null and other_text is null)
        or
        (intake_slot_id is null and other_text is not null
          and length(trim(other_text)) between 1 and 500)
      );
  end if;
end
$$;

create or replace function public.get_public_intake(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment_id uuid;
  v_child_name text;
  v_moment public.intake_moments%rowtype;
  v_result jsonb;
begin
  select e.id, e.child_name
    into v_enrollment_id, v_child_name
    from public.enrollments e
   where e.intake_access_token = p_token;

  if v_enrollment_id is null then
    return null;
  end if;

  select m.*
    into v_moment
    from public.intake_moments m
   where m.status = 'actief';

  if v_moment.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'moment', jsonb_build_object(
      'id', v_moment.id,
      'description', v_moment.description,
      'duration_text', v_moment.duration_text,
      'allow_other', v_moment.allow_other
    ),
    'enrollment', jsonb_build_object('child_name', v_child_name),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'date', s.date,
        'start_time', s.start_time,
        'end_time', s.end_time
      ) order by s.date, s.start_time, s.position)
      from public.intake_slots s
      where s.intake_moment_id = v_moment.id
    ), '[]'::jsonb),
    'selection', (
      select jsonb_build_object(
        'slot_id', c.intake_slot_id,
        'other_text', c.other_text,
        'chosen_at', c.chosen_at,
        'updated_at', c.updated_at
      )
      from public.intake_choices c
      where c.enrollment_id = v_enrollment_id
        and c.intake_moment_id = v_moment.id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- De eerdere RPC had twee parameters. Verwijder die variant expliciet zodat
-- PostgREST nooit tussen twee overloads hoeft te kiezen.
revoke all on function public.submit_public_intake(uuid, uuid)
  from public, anon, authenticated, service_role;
drop function if exists public.submit_public_intake(uuid, uuid);

create or replace function public.submit_public_intake(
  p_token uuid,
  p_slot_id uuid,
  p_other_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment_id uuid;
  v_moment_id uuid;
  v_allow_other boolean;
  v_other_text text := nullif(trim(p_other_text), '');
begin
  select e.id into v_enrollment_id
    from public.enrollments e
   where e.intake_access_token = p_token;

  select m.id, m.allow_other
    into v_moment_id, v_allow_other
    from public.intake_moments m
   where m.status = 'actief';

  if v_enrollment_id is null or v_moment_id is null then
    raise exception 'Dit intakeformulier is niet (meer) actief.' using errcode = 'P0001';
  end if;

  if p_slot_id is null then
    if not v_allow_other then
      raise exception 'Een ander moment opgeven is niet toegestaan.' using errcode = 'P0001';
    end if;
    if v_other_text is null then
      raise exception 'Vul het gewenste andere moment in.' using errcode = 'P0001';
    end if;
    if length(v_other_text) > 500 then
      raise exception 'Het andere moment mag maximaal 500 tekens bevatten.' using errcode = 'P0001';
    end if;
  else
    if v_other_text is not null then
      raise exception 'Kies één vaste datum of geef een ander moment op.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.intake_slots s
       where s.id = p_slot_id and s.intake_moment_id = v_moment_id
    ) then
      raise exception 'Dit intakemoment is geen geldige keuze.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.intake_choices (
    intake_moment_id, intake_slot_id, enrollment_id, other_text
  ) values (
    v_moment_id, p_slot_id, v_enrollment_id, v_other_text
  )
  on conflict (enrollment_id, intake_moment_id) do update
    set intake_slot_id = excluded.intake_slot_id,
        other_text = excluded.other_text,
        updated_at = now();

  return public.get_public_intake(p_token);
end;
$$;

-- Functies zijn standaard uitvoerbaar voor PUBLIC. Alleen de browserrollen
-- die het persoonlijke formulier nodig hebben krijgen hier expliciet toegang.
revoke all on function public.get_public_intake(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_public_intake(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_intake(uuid) to anon, authenticated, service_role;
grant execute on function public.submit_public_intake(uuid, uuid, text) to anon, authenticated, service_role;
