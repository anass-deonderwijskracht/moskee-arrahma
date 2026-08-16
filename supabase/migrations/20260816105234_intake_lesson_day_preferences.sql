-- ============================================================================
-- Toon en wijzig de voorkeurslesdag per geselecteerd kind in het persoonlijke
-- intakeformulier. De bestaande token- en gezinsvalidatie blijft leidend:
-- deze wrappers roepen de bestaande beveiligde intakefuncties aan.
-- ============================================================================

create or replace function public.get_public_intake_with_preferences(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_enrollments jsonb;
begin
  v_result := public.get_public_intake(p_token);

  if v_result is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    enrollment.item || jsonb_build_object(
      'preferred_lesday', coalesce(e.preferred_lesday, 'Geen voorkeur')
    ) order by enrollment.position
  ), '[]'::jsonb)
    into v_enrollments
    from jsonb_array_elements(coalesce(v_result -> 'enrollments', '[]'::jsonb))
      with ordinality as enrollment(item, position)
    join public.enrollments e
      on e.id = (enrollment.item ->> 'id')::uuid;

  return jsonb_set(v_result, '{enrollments}', v_enrollments, true);
end;
$$;

create or replace function public.submit_public_intake_with_preferences(
  p_token uuid,
  p_enrollment_ids uuid[],
  p_slot_id uuid,
  p_other_text text,
  p_note text,
  p_lesson_day_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_lesson_day_preferences is null
     or jsonb_typeof(p_lesson_day_preferences) <> 'object' then
    raise exception 'De voorkeursdagen ontbreken.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from unnest(coalesce(p_enrollment_ids, '{}'::uuid[])) selected(id)
     where coalesce(p_lesson_day_preferences ->> selected.id::text, '')
       not in ('Zaterdag', 'Zondag', 'Geen voorkeur')
  ) then
    raise exception 'Kies voor ieder kind een geldige voorkeursdag.' using errcode = 'P0001';
  end if;

  -- Deze functie controleert token, actieve intake en of alle ids werkelijk bij
  -- het gezin horen. Een fout rolt de volledige transactie terug.
  perform public.submit_public_intake(
    p_token,
    p_enrollment_ids,
    p_slot_id,
    p_other_text,
    p_note
  );

  update public.enrollments e
     set preferred_lesday = p_lesson_day_preferences ->> e.id::text
   where e.id = any(p_enrollment_ids);

  return public.get_public_intake_with_preferences(p_token);
end;
$$;

revoke all on function public.get_public_intake_with_preferences(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_public_intake_with_preferences(uuid, uuid[], uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.get_public_intake_with_preferences(uuid)
  to anon, authenticated, service_role;
grant execute on function public.submit_public_intake_with_preferences(uuid, uuid[], uuid, text, text, jsonb)
  to anon, authenticated, service_role;
