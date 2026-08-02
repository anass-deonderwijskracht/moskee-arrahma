-- ============================================================================
-- 025_birthdate.sql — Leeftijd op de volledige geboortedatum baseren
--
-- kinderen kende alleen birth_year. Daarmee is de leeftijd principieel niet uit
-- te rekenen: wie in oktober 2020 is geboren is in juli 2026 nog 5, maar
-- "jaar - geboortejaar" zegt 6. Bovendien leidde finalize_enrollment het
-- geboortejaar af uit de handmatig getypte leeftijd op de inschrijving
-- (jaar - leeftijd), waardoor die fout de andere kant op nog eens werd gemaakt:
-- een 5-jarige uit oktober 2020 kreeg geboortejaar 2021.
--
-- Deze migratie geeft kinderen een echte birthdate, laat finalize_enrollment de
-- datum van de inschrijving overnemen, en vult bestaande kinderen bij waar de
-- inschrijving de datum wél kent.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.kinderen add column if not exists birthdate date;

-- Geboortejaar volgt voortaan de datum wanneer die bekend is.
update public.kinderen
   set birth_year = extract(year from birthdate)::int
 where birthdate is not null
   and (birth_year is null or birth_year <> extract(year from birthdate)::int);

-- ---- finalize_enrollment(): neemt de geboortedatum mee -------------------
-- Gelijk aan 020, met birthdate op het kind. Het geboortejaar komt uit de
-- datum als die er is; alleen zonder datum valt het terug op de getypte
-- leeftijd (en is het dus een schatting).
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

  select * into v_en from public.enrollments where id = v_pl.enrollment_id;

  if v_pl.definitief and v_pl.leerling_id is not null then
    v_leerling := v_pl.leerling_id;   -- al gefinaliseerd
  else
    v_first := split_part(v_en.child_name, ' ', 1);
    v_last  := nullif(trim(substr(v_en.child_name, length(v_first) + 1)), '');
    v_last  := coalesce(v_last, v_first);

    insert into public.kinderen (first_name, last_name, gender, birthdate, birth_year, initials)
    values (
      v_first, v_last, v_en.gender,
      v_en.birthdate,
      coalesce(
        extract(year from v_en.birthdate)::int,
        case when v_en.age is not null then extract(year from now())::int - v_en.age end
      ),
      upper(left(v_first,1) || left(v_last,1))
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

    update public.enrollment_placements
       set definitief = true, leerling_id = v_leerling
     where id = p_placement_id;

    update public.enrollments set status = 'definitief' where id = v_en.id;

    insert into public.audit_log (user_label, action, object, type)
    values (coalesce((select full_name from public.profiles where id = auth.uid()), 'Beheerder'),
            'definitief ingeschreven', v_en.child_name, 'enroll');
  end if;

  -- Bij de inschrijving vastgelegd lesgeld wordt een betaling op de leerling.
  if coalesce(v_pl.lesgeld_bedrag, 0) > 0 then
    insert into public.payments (leerling_id, placement_id, date, description, amount, status)
    values (v_leerling, p_placement_id, current_date, 'Lesgeld inschrijving', v_pl.lesgeld_bedrag, 'paid')
    on conflict (placement_id) do nothing;
  end if;

  return v_leerling;
end;
$$;

grant execute on function public.finalize_enrollment(uuid) to authenticated;

-- ---- Backfill: geboortedatum uit de inschrijving overnemen ----------------
-- Alleen waar de koppeling ondubbelzinnig is (via de plaatsing naar de leerling)
-- en het kind nog geen datum heeft.
update public.kinderen k
   set birthdate  = e.birthdate,
       birth_year = extract(year from e.birthdate)::int
  from public.enrollment_placements p
  join public.enrollments e on e.id = p.enrollment_id
  join public.leerlingen  l on l.id = p.leerling_id
 where l.kind_id = k.id
   and k.birthdate is null
   and e.birthdate is not null;
