-- ============================================================================
-- 027_merge_duplicate_ouders.sql — Eén ouderrecord per persoon
--
-- finalize_enrollment maakte bij élke definitieve inschrijving een nieuwe rij in
-- `ouders`, zonder te kijken of die persoon er al stond. Een ouder met drie
-- kinderen kreeg zo drie records, elk gekoppeld aan één kind, in plaats van één
-- record dat aan drie kinderen hangt. Dat raakt de oudertabel, de gezinsstaffel
-- voor het lesgeld (broers/zussen worden herkend via gedeelde ouders) en de
-- Google Contacts-sync.
--
-- Deze migratie doet twee dingen:
--   1. bestaande dubbelen samenvoegen op genormaliseerd telefoonnummer;
--   2. finalize_enrollment een bestaande ouder laten hergebruiken.
--
-- LET OP — stap 1 verwijdert rijen. Draai eerst de preview onderaan dit bestand
-- om te zien wát er samengevoegd zou worden. Alles wat is samengevoegd wordt
-- vastgelegd in public.ouders_merge_log, inclusief de weggehaalde gegevens.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

-- ---- Telefoonnummer als identiteit ----------------------------------------
-- Zelfde regels als normalizePhone(raw, "31") in de Google Contacts-sync, zodat
-- beide dezelfde personen aan elkaar knopen. Iets strenger: een + midden in de
-- tekst maakt het nummer ongeldig in plaats van stilzwijgend genegeerd.
-- Eén argument, geen default: dat houdt de index-expressie hieronder eenduidig.
create or replace function public.normalize_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  country constant text := '31';
  s       text;
begin
  if raw is null then return null; end if;
  s := regexp_replace(btrim(raw), '[^0-9+]', '', 'g');
  if s = '' then return null; end if;

  if left(s, 1) = '+' then s := substr(s, 2);
  elsif left(s, 2) = '00' then s := substr(s, 3);
  elsif left(s, 1) = '0' then s := country || substr(s, 2);
  elsif left(s, length(country)) <> country then s := country || s;
  end if;

  if s !~ '^[0-9]+$' then return null; end if;          -- + of 00 midden in het nummer
  if length(s) < 8 or length(s) > 15 then return null; end if;
  return '+' || s;
end;
$$;

create index if not exists ouders_phone_norm_idx
  on public.ouders (public.normalize_phone(phone));

-- ---- Logboek van de samenvoeging ------------------------------------------
create table if not exists public.ouders_merge_log (
  id             uuid primary key default gen_random_uuid(),
  merged_at      timestamptz not null default now(),
  phone_e164     text not null,
  kept_id        uuid,
  kept_name      text,
  removed_id     uuid,
  removed_name   text,
  removed_email  text,
  removed_role   text,
  removed_bereik text,
  kinderen_moved int not null default 0
);
select public.apply_admin_rls('public.ouders_merge_log');

-- ---- 1. Dubbelen samenvoegen ----------------------------------------------
-- De oudste rij blijft staan (die heeft de meeste historie); de rest schuift
-- zijn kinderen daarheen en verdwijnt. Ouders zonder bruikbaar telefoonnummer
-- blijven ongemoeid — daar is geen betrouwbare identiteit voor.
do $$
declare
  g       record;
  d       record;
  n_moved int;
  n_groups int := 0;
  n_removed int := 0;
begin
  for g in
    select public.normalize_phone(phone) as ph,
           (array_agg(id order by created_at, id))[1] as keep_id
      from public.ouders
     where public.normalize_phone(phone) is not null
     group by 1
    having count(*) > 1
  loop
    n_groups := n_groups + 1;

    for d in
      select * from public.ouders
       where public.normalize_phone(phone) = g.ph and id <> g.keep_id
       order by created_at, id
    loop
      -- Koppelingen verhuizen, behalve waar de behouden ouder al aan dat kind hangt.
      with moved as (
        update public.kind_ouder ko
           set ouder_id = g.keep_id
         where ko.ouder_id = d.id
           and not exists (
             select 1 from public.kind_ouder x
              where x.kind_id = ko.kind_id and x.ouder_id = g.keep_id)
        returning 1
      )
      select count(*) into n_moved from moved;

      -- Primair contact blijft primair als de dubbel dat was.
      update public.kind_ouder k
         set is_primary = true
        from public.kind_ouder dup
       where dup.ouder_id = d.id and dup.is_primary
         and k.ouder_id = g.keep_id and k.kind_id = dup.kind_id;

      insert into public.ouders_merge_log (
        phone_e164, kept_id, kept_name, removed_id, removed_name,
        removed_email, removed_role, removed_bereik, kinderen_moved)
      select g.ph, g.keep_id, o.name, d.id, d.name, d.email, d.role, d.bereik, n_moved
        from public.ouders o where o.id = g.keep_id;

      -- Gegevens die de behouden ouder miste, overnemen van de dubbel.
      update public.ouders o
         set email     = coalesce(nullif(o.email, ''),  nullif(d.email, '')),
             role      = coalesce(nullif(o.role, ''),   nullif(d.role, '')),
             bereik    = coalesce(nullif(o.bereik, ''), nullif(d.bereik, '')),
             "primary" = o."primary" or d."primary"
       where o.id = g.keep_id;

      -- Resterende koppelingen van de dubbel verdwijnen via de cascade.
      delete from public.ouders where id = d.id;
      n_removed := n_removed + 1;
    end loop;
  end loop;

  raise notice 'Samengevoegd: % groepen, % dubbele ouderrecords verwijderd.', n_groups, n_removed;
end $$;

-- ---- 2. finalize_enrollment: bestaande ouder hergebruiken ------------------
-- Gelijk aan 025, met één verschil: een ouder wordt opgezocht op genormaliseerd
-- telefoonnummer en alleen aangemaakt als die er nog niet is.
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


-- ============================================================================
-- Preview vooraf en controle achteraf staan in:
--   supabase/checks/027_preview_dubbele_ouders.sql
-- Die queries lezen alleen en draaien ook vóór deze migratie.
-- ============================================================================
