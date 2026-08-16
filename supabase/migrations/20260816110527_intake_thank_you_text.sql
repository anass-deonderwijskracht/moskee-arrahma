-- Maak de tekst onder "Bedankt" instelbaar per intakemoment. Bestaande
-- intakemomenten behouden de huidige standaardtekst.

alter table public.intake_moments
  add column if not exists thank_you_text text not null
  default 'De intakevoorkeur is ontvangen.';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_moments'::regclass
       and conname = 'intake_moments_thank_you_text_length'
  ) then
    alter table public.intake_moments
      add constraint intake_moments_thank_you_text_length
      check (length(trim(thank_you_text)) between 1 and 2000);
  end if;
end;
$$;

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
  v_thank_you_text text;
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

  select m.thank_you_text
    into v_thank_you_text
    from public.intake_moments m
   where m.id = (v_result #>> '{moment,id}')::uuid;

  v_result := jsonb_set(v_result, '{enrollments}', v_enrollments, true);
  return jsonb_set(v_result, '{moment,thank_you_text}', to_jsonb(v_thank_you_text), true);
end;
$$;

revoke all on function public.get_public_intake_with_preferences(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_intake_with_preferences(uuid)
  to anon, authenticated, service_role;
