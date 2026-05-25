-- ============================================================================
-- 005_audit_finalize.sql — Phase 4
-- Immutable audit log (backs Instellingen → Audit log + Dashboard feed) and
-- the guarded "Definitief inschrijven" RPC that creates a leerling from an
-- enrollment placement.
-- ============================================================================

-- ---- audit_log (insert + select only) -------------------------------------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  user_label text,
  action     text,
  object     text,
  type       text,                 -- typed for the dashboard feed icon
  ip         text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_admin());

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (public.is_admin());
-- No update/delete policy => immutable.

-- ---- finalize_enrollment(): guarded "Definitief inschrijven" ---------------
-- Creates a leerling for the enrollment's kind in the chosen class/year and
-- marks the placement definitief. Idempotent on (kind, schooljaar): if a
-- leerling already exists for that kind+year it is reused.
-- Creates the kind + ouders from the enrollment when no kind is linked yet.
create or replace function public.finalize_enrollment(p_placement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl       public.enrollment_placements%rowtype;
  v_en       public.enrollments%rowtype;
  v_kind_id  uuid;
  v_leerling uuid;
  v_first    text;
  v_last     text;
  v_num      text;
  v_par      record;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_pl from public.enrollment_placements where id = p_placement_id;
  if not found then raise exception 'placement not found'; end if;
  if v_pl.class_id is null or v_pl.niveau is null then
    raise exception 'class and niveau required before finalizing';
  end if;
  if v_pl.definitief and v_pl.leerling_id is not null then
    return v_pl.leerling_id;  -- already finalized
  end if;

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  -- Split child_name into first / last (best effort).
  v_first := split_part(v_en.child_name, ' ', 1);
  v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
  v_last  := coalesce(v_last, v_first);

  -- Create the kind.
  insert into public.kinderen (first_name, last_name, gender, birth_year, initials)
  values (
    v_first, v_last, v_en.gender,
    case when v_en.age is not null then extract(year from now())::int - v_en.age end,
    upper(left(v_first,1) || left(v_last,1))
  )
  returning id into v_kind_id;

  -- Create ouders from enrollment_parents and link them.
  for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
    with o as (
      insert into public.ouders (role, name, phone, email, "primary")
      values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
      returning id
    )
    insert into public.kind_ouder (kind_id, ouder_id, is_primary)
    select v_kind_id, o.id, v_par.is_primary from o;
  end loop;

  -- Reuse a leerling for this kind+year if one exists, else create.
  select id into v_leerling from public.leerlingen
   where kind_id = v_kind_id and schooljaar_id = v_pl.schooljaar_id;

  if v_leerling is null then
    select 'M' || lpad((coalesce(max(substr(leerlingnummer,2)::int),1000) + 1)::text, 4, '0')
      into v_num from public.leerlingen where leerlingnummer ~ '^M[0-9]+$';
    insert into public.leerlingen (kind_id, class_id, schooljaar_id, leerlingnummer, niveau, joined)
    values (v_kind_id, v_pl.class_id, v_pl.schooljaar_id, coalesce(v_num,'M1001'), v_pl.niveau, current_date)
    returning id into v_leerling;
  end if;

  update public.enrollment_placements
     set definitief = true, leerling_id = v_leerling
   where id = p_placement_id;

  update public.enrollments set status = 'geaccepteerd' where id = v_en.id;

  insert into public.audit_log (user_label, action, object, type)
  values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
          'definitief ingeschreven', v_en.child_name, 'enroll');

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;
