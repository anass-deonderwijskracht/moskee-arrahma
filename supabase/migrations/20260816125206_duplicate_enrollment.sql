-- Dupliceer een inschrijving als nieuwe wachtlijstinschrijving. Kindgegevens
-- en ouders worden gekopieerd; workflowstatus, plaatsing, intakekeuzes,
-- aanwezigheid en de persoonlijke intaketoken beginnen opnieuw.

create or replace function public.duplicate_enrollment(p_enrollment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_source public.enrollments%rowtype;
  v_new_id uuid;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
    into v_source
    from public.enrollments
   where id = p_enrollment_id;

  if not found then
    raise exception 'inschrijving niet gevonden' using errcode = 'P0002';
  end if;

  insert into public.enrollments (
    child_name,
    age,
    gender,
    track,
    status,
    target_class,
    submitted_at,
    submitted_label,
    rejection_reason,
    preferred_lesday,
    address,
    notes,
    birthdate,
    twijfel
  ) values (
    v_source.child_name,
    v_source.age,
    v_source.gender,
    v_source.track,
    'wachtlijst',
    v_source.target_class,
    now(),
    'zojuist',
    null,
    v_source.preferred_lesday,
    v_source.address,
    v_source.notes,
    v_source.birthdate,
    false
  )
  returning id into v_new_id;

  insert into public.enrollment_parents (
    enrollment_id,
    role,
    name,
    phone,
    email,
    is_primary
  )
  select
    v_new_id,
    role,
    name,
    phone,
    email,
    is_primary
  from public.enrollment_parents
  where enrollment_id = p_enrollment_id;

  insert into public.audit_log (user_label, action, object, type)
  values (
    coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
    'inschrijving gedupliceerd',
    v_source.child_name,
    'enroll'
  );

  select to_jsonb(e) || jsonb_build_object(
    'enrollment_parents', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.id)
      from public.enrollment_parents p
      where p.enrollment_id = e.id
    ), '[]'::jsonb)
  )
    into v_result
    from public.enrollments e
   where e.id = v_new_id;

  return v_result;
end;
$$;

revoke all on function public.duplicate_enrollment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.duplicate_enrollment(uuid)
  to authenticated;
