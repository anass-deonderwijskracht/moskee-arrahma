-- ============================================================================
-- 028_kind_address.sql — Adres van de inschrijving overnemen op het kind
--
-- `enrollments.address` wordt bij de aanmelding ingevuld, maar
-- finalize_enrollment liet dat veld liggen. Het kind kwam dus zonder adres in
-- de administratie, waardoor "Adres" leeg bleef op de kindpagina en op het
-- tabblad Algemene info van de leerling. Zelfde soort omissie als eerder bij de
-- geboortedatum (025).
--
-- Draai dit ná 027 — deze versie van finalize_enrollment bouwt daarop voort
-- (hergebruik van bestaande ouders via normalize_phone).
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

-- ---- finalize_enrollment(): neemt nu ook het adres mee --------------------
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
  v_phone    text;
  v_ouder_id uuid;
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

    insert into public.kinderen (first_name, last_name, gender, birthdate, birth_year, address, initials)
    values (
      v_first, v_last, v_en.gender,
      v_en.birthdate,
      coalesce(
        extract(year from v_en.birthdate)::int,
        case when v_en.age is not null then extract(year from now())::int - v_en.age end
      ),
      nullif(btrim(coalesce(v_en.address, '')), ''),
      upper(left(v_first,1) || left(v_last,1))
    )
    returning id into v_kind_id;

    for v_par in select * from public.enrollment_parents where enrollment_id = v_en.id loop
      v_phone    := public.normalize_phone(v_par.phone);
      v_ouder_id := null;

      -- Bestaat deze ouder al? Dan koppelen we het kind eraan in plaats van een
      -- tweede record te maken. Zonder bruikbaar nummer kunnen we niet matchen.
      if v_phone is not null then
        select id into v_ouder_id
          from public.ouders
         where public.normalize_phone(phone) = v_phone
         order by created_at, id
         limit 1;
      end if;

      if v_ouder_id is null then
        insert into public.ouders (role, name, phone, email, "primary")
        values (v_par.role, v_par.name, v_par.phone, v_par.email, v_par.is_primary)
        returning id into v_ouder_id;
      else
        -- Aanvullen wat we nog niet wisten; bestaande gegevens niet overschrijven.
        update public.ouders
           set email = coalesce(nullif(email, ''), nullif(v_par.email, '')),
               role  = coalesce(nullif(role, ''),  nullif(v_par.role, ''))
         where id = v_ouder_id;
      end if;

      insert into public.kind_ouder (kind_id, ouder_id, is_primary)
      values (v_kind_id, v_ouder_id, v_par.is_primary)
      on conflict (kind_id, ouder_id) do nothing;
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

-- ---- Backfill: adres alsnog overnemen -------------------------------------
-- Alleen waar de koppeling ondubbelzinnig is (plaatsing → leerling → kind) en
-- het kind nog geen adres heeft; handmatig ingevulde adressen blijven staan.
update public.kinderen k
   set address = btrim(e.address)
  from public.enrollment_placements p
  join public.enrollments e on e.id = p.enrollment_id
  join public.leerlingen  l on l.id = p.leerling_id
 where l.kind_id = k.id
   and nullif(btrim(coalesce(k.address, '')), '') is null
   and nullif(btrim(coalesce(e.address, '')), '') is not null;
