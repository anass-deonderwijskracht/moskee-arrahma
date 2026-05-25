-- ============================================================================
-- 010_enrollment_address_notes.sql
-- The intake form captures an address + opmerkingen per child. Store them on the
-- enrollment and carry them over to the kind on "Definitief inschrijven".
-- Idempotent.
-- ============================================================================

alter table public.enrollments
  add column if not exists address text,
  add column if not exists notes   text;

-- finalize_enrollment(): now also copies address + notes onto the new kind.
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
    return v_pl.leerling_id;
  end if;

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  v_first := split_part(v_en.child_name, ' ', 1);
  v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
  v_last  := coalesce(v_last, v_first);

  insert into public.kinderen (first_name, last_name, gender, birth_year, initials, address, notes)
  values (
    v_first, v_last, v_en.gender,
    case when v_en.age is not null then extract(year from now())::int - v_en.age end,
    upper(left(v_first,1) || left(v_last,1)),
    v_en.address, v_en.notes
  )
  returning id into v_kind_id;

  for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
    with o as (
      insert into public.ouders (role, name, phone, email, "primary")
      values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
      returning id
    )
    insert into public.kind_ouder (kind_id, ouder_id, is_primary)
    select v_kind_id, o.id, v_par.is_primary from o;
  end loop;

  select id into v_leerling from public.leerlingen
   where kind_id = v_kind_id and schooljaar_id = v_pl.schooljaar_id;

  if v_leerling is null then
    select 'M' || lpad((coalesce(max(substr(leerlingnummer,2)::int),1000) + 1)::text, 4, '0')
      into v_num from public.leerlingen where leerlingnummer ~ '^M[0-9]+$';
    insert into public.leerlingen (kind_id, class_id, schooljaar_id, leerlingnummer, niveau, joined)
    values (v_kind_id, v_pl.class_id, v_pl.schooljaar_id, coalesce(v_num,'M1001'), v_pl.niveau, current_date)
    returning id into v_leerling;
  end if;

  update public.enrollment_placements set definitief = true, leerling_id = v_leerling where id = p_placement_id;
  update public.enrollments set status = 'definitief' where id = v_en.id;

  insert into public.audit_log (user_label, action, object, type)
  values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
          'definitief ingeschreven', v_en.child_name, 'enroll');

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;
