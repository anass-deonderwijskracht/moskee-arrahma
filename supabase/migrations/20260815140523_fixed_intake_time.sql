-- ============================================================================
-- Vaste intaketijd: iedere intake-datum loopt van 09:00 tot 12:00.
--
-- Eventuele bestaande dubbele opties op dezelfde datum worden eerst veilig
-- samengevoegd. Opgeslagen keuzes blijven aan die datum gekoppeld.
-- ============================================================================

-- Verplaats keuzes van een dubbele datum naar de eerste optie van die datum.
with ranked_slots as (
  select
    id,
    intake_moment_id,
    first_value(id) over (
      partition by intake_moment_id, date
      order by position, start_time, id
    ) as canonical_id,
    row_number() over (
      partition by intake_moment_id, date
      order by position, start_time, id
    ) as row_number
  from public.intake_slots
)
update public.intake_choices c
   set intake_slot_id = r.canonical_id,
       updated_at = now()
  from ranked_slots r
 where c.intake_slot_id = r.id
   and r.row_number > 1;

-- Daarna kunnen de overtollige opties weg zonder keuzes te verliezen.
with ranked_slots as (
  select
    id,
    row_number() over (
      partition by intake_moment_id, date
      order by position, start_time, id
    ) as row_number
  from public.intake_slots
)
delete from public.intake_slots s
 using ranked_slots r
 where s.id = r.id
   and r.row_number > 1;

update public.intake_slots
   set start_time = time '09:00',
       end_time = time '12:00'
 where start_time <> time '09:00'
    or end_time <> time '12:00';

alter table public.intake_slots
  alter column start_time set default time '09:00',
  alter column end_time set default time '12:00';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_slots'::regclass
       and conname = 'intake_slots_fixed_time'
  ) then
    alter table public.intake_slots
      add constraint intake_slots_fixed_time
      check (start_time = time '09:00' and end_time = time '12:00');
  end if;
end
$$;
