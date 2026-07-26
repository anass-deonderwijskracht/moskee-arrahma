-- ============================================================================
-- 020_enrollment_payment_link.sql — Lesgeld van inschrijving → leerling
--
-- Het bedrag dat bij een inschrijving als "betaald" werd vastgelegd
-- (enrollment_placements.lesgeld_bedrag) bereikte de leerling nooit: de
-- leerlingpagina, Financiën en het dashboard tellen op uit public.payments en
-- daar werd niets weggeschreven. Deze migratie koppelt beide administraties.
--
--   * payments krijgt placement_id → de "inschrijvingsbetaling" van een
--     leerling. Hoogstens één per plaatsing (unieke index; meerdere NULLs zijn
--     toegestaan, gewone betalingen blijven dus ongemoeid).
--   * finalize_enrollment() maakt die betaalregel aan bij definitief
--     inschrijven.
--   * Backfill voor plaatsingen die al definitief zijn met een betaald bedrag.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

-- ---- payments.placement_id -------------------------------------------------
alter table public.payments
  add column if not exists placement_id uuid
    references public.enrollment_placements(id) on delete set null;

create unique index if not exists payments_placement_uidx
  on public.payments (placement_id);

-- ---- finalize_enrollment(): legt de inschrijvingsbetaling vast -------------
-- Gelijk aan 008, met aan het eind de payments-regel. Blijft idempotent: een
-- al gefinaliseerde plaatsing valt door naar de betaalregel en laat een
-- bestaande regel ongemoeid (do nothing), zodat handmatige correcties op de
-- leerlingpagina nooit worden overschreven.
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

    insert into public.kinderen (first_name, last_name, gender, birth_year, initials)
    values (
      v_first, v_last, v_en.gender,
      case when v_en.age is not null then extract(year from now())::int - v_en.age end,
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

-- ---- Backfill: al gefinaliseerde plaatsingen met een betaald bedrag --------
insert into public.payments (leerling_id, placement_id, date, description, amount, status)
select p.leerling_id, p.id, current_date, 'Lesgeld inschrijving', p.lesgeld_bedrag, 'paid'
  from public.enrollment_placements p
 where p.definitief
   and p.leerling_id is not null
   and coalesce(p.lesgeld_bedrag, 0) > 0
   and not exists (select 1 from public.payments pay where pay.placement_id = p.id);
