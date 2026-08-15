-- ============================================================================
-- Een intakeantwoord geldt voor een ouder/gezin en kan meerdere openstaande
-- inschrijvingen bevatten. Iedere geselecteerde inschrijving houdt een eigen
-- keuze-rij, zodat de Klassenindeler de datum zonder extra afleiding kan tonen.
-- response_group_id groepeert die rijen tot één afspraak.
-- ============================================================================

alter table public.intake_choices
  add column if not exists response_group_id uuid,
  add column if not exists note text;

update public.intake_choices
   set response_group_id = id
 where response_group_id is null;

alter table public.intake_choices
  alter column response_group_id set default gen_random_uuid(),
  alter column response_group_id set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_choices'::regclass
       and conname = 'intake_choices_note_length'
  ) then
    alter table public.intake_choices
      add constraint intake_choices_note_length
      check (note is null or length(note) <= 1000);
  end if;
end
$$;

create index if not exists intake_choices_moment_response_group_idx
  on public.intake_choices (intake_moment_id, response_group_id);

create or replace function public.get_public_intake(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seed_enrollment_id uuid;
  v_family_ids uuid[] := '{}'::uuid[];
  v_enrollments jsonb := '[]'::jsonb;
  v_moment public.intake_moments%rowtype;
  v_response_group_id uuid;
begin
  select e.id
    into v_seed_enrollment_id
    from public.enrollments e
   where e.intake_access_token = p_token;

  if v_seed_enrollment_id is null then
    return null;
  end if;

  -- Een gedeeld, niet-leeg e-mailadres of telefoonnummer koppelt kinderen aan
  -- dezelfde ouder. Telefoonnummers worden zonder opmaak vergeleken.
  with seed_contacts as (
    select nullif(lower(trim(p.email)), '') as email,
           case
             when length(regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g')) >= 8
               then regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g')
             else null
           end as phone
      from public.enrollment_parents p
     where p.enrollment_id = v_seed_enrollment_id
  ), family as (
    select distinct e.id,
           coalesce(nullif(split_part(trim(e.child_name), ' ', 1), ''), 'Kind') as first_name
      from public.enrollments e
     where e.status not in ('definitief', 'afgewezen')
       and (
         e.id = v_seed_enrollment_id
         or exists (
           select 1
             from public.enrollment_parents p
             join seed_contacts c
               on (c.email is not null and c.email = nullif(lower(trim(p.email)), ''))
               or (c.phone is not null and c.phone = regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g'))
            where p.enrollment_id = e.id
         )
       )
  )
  select coalesce(array_agg(f.id order by f.first_name, f.id), '{}'::uuid[]),
         coalesce(jsonb_agg(
           jsonb_build_object('id', f.id, 'first_name', f.first_name)
           order by f.first_name, f.id
         ), '[]'::jsonb)
    into v_family_ids, v_enrollments
    from family f;

  if cardinality(v_family_ids) = 0 then
    return null;
  end if;

  select m.*
    into v_moment
    from public.intake_moments m
   where m.status = 'actief';

  if v_moment.id is null then
    return null;
  end if;

  select c.response_group_id
    into v_response_group_id
    from public.intake_choices c
   where c.intake_moment_id = v_moment.id
     and c.enrollment_id = any(v_family_ids)
   order by c.updated_at desc, c.id desc
   limit 1;

  return jsonb_build_object(
    'moment', jsonb_build_object(
      'id', v_moment.id,
      'description', v_moment.description,
      'duration_text', v_moment.duration_text,
      'allow_other', v_moment.allow_other
    ),
    'enrollments', v_enrollments,
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
    'selection', case
      when v_response_group_id is null then null
      else (
        select jsonb_build_object(
          'enrollment_ids', coalesce((
            select jsonb_agg(x.enrollment_id order by x.enrollment_id)
              from public.intake_choices x
             where x.intake_moment_id = v_moment.id
               and x.response_group_id = v_response_group_id
               and x.enrollment_id = any(v_family_ids)
          ), '[]'::jsonb),
          'slot_id', c.intake_slot_id,
          'other_text', c.other_text,
          'note', c.note,
          'chosen_at', c.chosen_at,
          'updated_at', c.updated_at
        )
          from public.intake_choices c
         where c.intake_moment_id = v_moment.id
           and c.response_group_id = v_response_group_id
         order by c.updated_at desc, c.id desc
         limit 1
      )
    end
  );
end;
$$;

-- Verwijder de oude enkel-kindvariant om PostgREST-overloads te voorkomen.
revoke all on function public.submit_public_intake(uuid, uuid, text)
  from public, anon, authenticated, service_role;
drop function if exists public.submit_public_intake(uuid, uuid, text);

create or replace function public.submit_public_intake(
  p_token uuid,
  p_enrollment_ids uuid[],
  p_slot_id uuid,
  p_other_text text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seed_enrollment_id uuid;
  v_family_ids uuid[] := '{}'::uuid[];
  v_selected_ids uuid[] := '{}'::uuid[];
  v_moment_id uuid;
  v_allow_other boolean;
  v_response_group_id uuid := gen_random_uuid();
  v_other_text text := nullif(trim(p_other_text), '');
  v_note text := nullif(trim(p_note), '');
begin
  select e.id
    into v_seed_enrollment_id
    from public.enrollments e
   where e.intake_access_token = p_token;

  with seed_contacts as (
    select nullif(lower(trim(p.email)), '') as email,
           case
             when length(regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g')) >= 8
               then regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g')
             else null
           end as phone
      from public.enrollment_parents p
     where p.enrollment_id = v_seed_enrollment_id
  ), family as (
    select distinct e.id
      from public.enrollments e
     where e.status not in ('definitief', 'afgewezen')
       and (
         e.id = v_seed_enrollment_id
         or exists (
           select 1
             from public.enrollment_parents p
             join seed_contacts c
               on (c.email is not null and c.email = nullif(lower(trim(p.email)), ''))
               or (c.phone is not null and c.phone = regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g'))
            where p.enrollment_id = e.id
         )
       )
  )
  select coalesce(array_agg(f.id order by f.id), '{}'::uuid[])
    into v_family_ids
    from family f;

  select coalesce(array_agg(selected.id order by selected.id), '{}'::uuid[])
    into v_selected_ids
    from (
      select distinct unnest(p_enrollment_ids) as id
    ) selected;

  select m.id, m.allow_other
    into v_moment_id, v_allow_other
    from public.intake_moments m
   where m.status = 'actief';

  if v_seed_enrollment_id is null or cardinality(v_family_ids) = 0 or v_moment_id is null then
    raise exception 'Dit intakeformulier is niet (meer) actief.' using errcode = 'P0001';
  end if;

  if cardinality(v_selected_ids) = 0 then
    raise exception 'Selecteer minimaal één kind.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from unnest(v_selected_ids) selected(id)
     where not selected.id = any(v_family_ids)
  ) then
    raise exception 'Een geselecteerde inschrijving hoort niet bij dit formulier.' using errcode = 'P0001';
  end if;

  if v_note is not null and length(v_note) > 1000 then
    raise exception 'De opmerkingen mogen maximaal 1000 tekens bevatten.' using errcode = 'P0001';
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
      select 1
        from public.intake_slots s
       where s.id = p_slot_id
         and s.intake_moment_id = v_moment_id
    ) then
      raise exception 'Dit intakemoment is geen geldige keuze.' using errcode = 'P0001';
    end if;
  end if;

  -- Serialiseer wijzigingen vanuit verschillende links binnen hetzelfde gezin.
  perform e.id
    from public.enrollments e
   where e.id = any(v_family_ids)
   order by e.id
   for update;

  -- Eerst alle eerdere keuzes van dit gezin voor het actieve moment wissen:
  -- daardoor worden uitgevinkte kinderen ook echt uit de afspraak verwijderd.
  delete from public.intake_choices c
   where c.intake_moment_id = v_moment_id
     and c.enrollment_id = any(v_family_ids);

  insert into public.intake_choices (
    intake_moment_id,
    intake_slot_id,
    enrollment_id,
    other_text,
    note,
    response_group_id
  )
  select v_moment_id,
         p_slot_id,
         selected.id,
         v_other_text,
         v_note,
         v_response_group_id
    from unnest(v_selected_ids) selected(id);

  return public.get_public_intake(p_token);
end;
$$;

-- SECURITY DEFINER-functies zijn standaard uitvoerbaar voor PUBLIC; houd de
-- persoonlijke formulieren beperkt tot de benodigde browserrollen.
revoke all on function public.get_public_intake(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_public_intake(uuid, uuid[], uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_intake(uuid) to anon, authenticated, service_role;
grant execute on function public.submit_public_intake(uuid, uuid[], uuid, text, text)
  to anon, authenticated, service_role;
