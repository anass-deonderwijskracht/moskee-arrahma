-- ============================================================================
-- Intakeplanning: beheerbare momenten, meerdere datum/tijd-opties en een
-- persoonlijke publieke keuze per inschrijving.
--
-- Publieke bezoekers krijgen geen directe tabeltoegang. Twee strikt begrensde
-- RPC's lezen/schrijven uitsluitend via een onvoorspelbaar token per
-- inschrijving. De admin-tabellen blijven achter de bestaande is_admin()-RLS.
-- ============================================================================

alter table public.enrollments
  add column if not exists intake_access_token uuid not null default gen_random_uuid();

create unique index if not exists enrollments_intake_access_token_key
  on public.enrollments (intake_access_token);

create table if not exists public.intake_moments (
  id            uuid primary key default gen_random_uuid(),
  description   text not null check (length(trim(description)) > 0),
  duration_text text not null check (length(trim(duration_text)) > 0),
  status        text not null default 'concept'
                  check (status in ('concept', 'actief', 'verlopen')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- De klassenindeler mag nooit hoeven raden welk moment actief is.
create unique index if not exists intake_moments_one_active
  on public.intake_moments ((status)) where status = 'actief';

create table if not exists public.intake_slots (
  id               uuid primary key default gen_random_uuid(),
  intake_moment_id uuid not null references public.intake_moments(id) on delete cascade,
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint intake_slots_valid_time check (end_time > start_time),
  constraint intake_slots_unique_option unique (intake_moment_id, date, start_time, end_time),
  constraint intake_slots_id_moment_unique unique (id, intake_moment_id)
);

create index if not exists intake_slots_moment_order_idx
  on public.intake_slots (intake_moment_id, date, start_time, position);

create table if not exists public.intake_choices (
  id               uuid primary key default gen_random_uuid(),
  intake_moment_id uuid not null references public.intake_moments(id) on delete cascade,
  intake_slot_id   uuid not null,
  enrollment_id    uuid not null references public.enrollments(id) on delete cascade,
  chosen_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint intake_choices_one_per_moment unique (enrollment_id, intake_moment_id),
  constraint intake_choices_slot_belongs_to_moment
    foreign key (intake_slot_id, intake_moment_id)
    references public.intake_slots(id, intake_moment_id)
    on delete no action deferrable initially deferred
);

create index if not exists intake_choices_moment_slot_idx
  on public.intake_choices (intake_moment_id, intake_slot_id);

drop trigger if exists intake_moments_updated on public.intake_moments;
create trigger intake_moments_updated before update on public.intake_moments
  for each row execute function public.set_updated_at();

drop trigger if exists intake_choices_updated on public.intake_choices;
create trigger intake_choices_updated before update on public.intake_choices
  for each row execute function public.set_updated_at();

-- Een nieuw actief moment laat het vorige automatisch verlopen, in dezelfde
-- transactie. Dit voorkomt een tijdelijk gat of twee actieve momenten.
create or replace function public.expire_previous_active_intake()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'actief' then
    update public.intake_moments
       set status = 'verlopen'
     where status = 'actief'
       and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists intake_moments_single_active on public.intake_moments;
create trigger intake_moments_single_active
  before insert or update of status on public.intake_moments
  for each row execute function public.expire_previous_active_intake();

select public.apply_admin_rls('public.intake_moments');
select public.apply_admin_rls('public.intake_slots');
select public.apply_admin_rls('public.intake_choices');

-- Nieuwe Supabase-projecten exposen tabellen niet meer automatisch aan de
-- Data API. Alleen ingelogde beheerders krijgen tabelprivileges; RLS blijft
-- daarnaast de daadwerkelijke rijtoegang bewaken.
revoke all on public.intake_moments, public.intake_slots, public.intake_choices from anon;
grant select, insert, update, delete on public.intake_moments to authenticated;
grant select, insert, update, delete on public.intake_slots to authenticated;
grant select, insert, update, delete on public.intake_choices to authenticated;
grant all on public.intake_moments, public.intake_slots, public.intake_choices to service_role;

-- Geeft uitsluitend het actieve formulier van de inschrijving achter het
-- token terug. Geen e-mail, telefoonnummer of andere inschrijvingsdata lekt.
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
      'duration_text', v_moment.duration_text
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

-- Maakt of wijzigt exact één keuze voor het actieve moment. De opgegeven slot
-- moet bij datzelfde actieve moment horen; een token kan nooit voor een andere
-- inschrijving of een verlopen moment schrijven.
create or replace function public.submit_public_intake(p_token uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment_id uuid;
  v_moment_id uuid;
begin
  select e.id into v_enrollment_id
    from public.enrollments e
   where e.intake_access_token = p_token;

  select m.id into v_moment_id
    from public.intake_moments m
   where m.status = 'actief';

  if v_enrollment_id is null or v_moment_id is null then
    raise exception 'Dit intakeformulier is niet (meer) actief.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.intake_slots s
     where s.id = p_slot_id and s.intake_moment_id = v_moment_id
  ) then
    raise exception 'Dit intakemoment is geen geldige keuze.' using errcode = 'P0001';
  end if;

  insert into public.intake_choices (
    intake_moment_id, intake_slot_id, enrollment_id
  ) values (
    v_moment_id, p_slot_id, v_enrollment_id
  )
  on conflict (enrollment_id, intake_moment_id) do update
    set intake_slot_id = excluded.intake_slot_id,
        updated_at = now();

  return public.get_public_intake(p_token);
end;
$$;

-- SECURITY DEFINER-functies krijgen standaard EXECUTE voor PUBLIC. Trek dat
-- expliciet in en sta alleen de browserrollen toe die dit formulier gebruiken.
revoke all on function public.get_public_intake(uuid) from public;
revoke all on function public.submit_public_intake(uuid, uuid) from public;
grant execute on function public.get_public_intake(uuid) to anon, authenticated;
grant execute on function public.submit_public_intake(uuid, uuid) to anon, authenticated;
grant execute on function public.get_public_intake(uuid) to service_role;
grant execute on function public.submit_public_intake(uuid, uuid) to service_role;
