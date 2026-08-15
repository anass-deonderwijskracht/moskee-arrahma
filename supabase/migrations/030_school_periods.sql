-- ============================================================================
-- 030_school_periods.sql — Vakanties en feestdagen per schooljaar
--
-- Een periode is een dagenbereik met een naam: een schoolvakantie, een
-- islamitische feestdag of Ramadan. Bewust een tabel en geen lijst in de code,
-- want de data verschuiven elk jaar: de schoolvakanties worden per jaar door
-- OCW vastgesteld en de islamitische data verschuiven met de maankalender.
-- Volgend schooljaar voeg je hier rijen toe in plaats van code aan te passen.
--
-- `blocks_lessons` bepaalt of de knop "lessen op vrij zetten" deze periode
-- meepakt. Ramadan staat daarom standaard uit: er wordt in die maand meestal
-- gewoon lesgegeven, maar je wilt hem wel in de planning zien staan.
--
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

create table if not exists public.school_periods (
  id             uuid primary key default gen_random_uuid(),
  schooljaar_id  uuid not null references public.schooljaren(id) on delete cascade,
  name           text not null,
  kind           text not null default 'vakantie' check (kind in ('vakantie', 'feestdag', 'ramadan')),
  start_date     date not null,
  end_date       date not null,
  blocks_lessons boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  constraint school_periods_range_check check (end_date >= start_date)
);

create index if not exists school_periods_schooljaar_idx
  on public.school_periods (schooljaar_id, start_date);

-- Eén rij per naam per schooljaar, zodat de seed hieronder herhaalbaar is.
create unique index if not exists school_periods_unique_name
  on public.school_periods (schooljaar_id, name);

select public.apply_admin_rls('public.school_periods');

-- Expliciete Data API-rechten: nieuwe Supabase-projecten exposen tabellen niet
-- meer automatisch. RLS beperkt authenticated vervolgens tot beheerders.
revoke all on public.school_periods from anon;
grant select, insert, update, delete on public.school_periods to authenticated;
grant all on public.school_periods to service_role;

-- ---- Seed schooljaar 2026/27 ----------------------------------------------
-- Schoolvakanties: regio NOORD (Amsterdam valt daaronder), officiële data van
-- Rijksoverheid/OCW. Alle vakanties lopen van zaterdag t/m zondag.
--
-- De meivakantie is 24 apr t/m 2 mei; scholen mógen een week verlengen
-- (OCW-adviesdata 1 t/m 9 mei). Die verlenging staat hier los en uit — zet
-- hem aan als de moskee hem volgt.
--
-- Islamitische data volgen de Umm al-Qura-berekening. Let op: die kunnen een
-- dag verschuiven met de maanwaarneming. Controleer ze kort van tevoren.
insert into public.school_periods (schooljaar_id, name, kind, start_date, end_date, blocks_lessons, note)
select s.id, v.name, v.kind, v.start_date::date, v.end_date::date, v.blocks, v.note
  from public.schooljaren s
  cross join (values
    ('Herfstvakantie',              'vakantie', '2026-10-10', '2026-10-18', true,  'Regio Noord'),
    ('Kerstvakantie',               'vakantie', '2026-12-19', '2027-01-03', true,  'Landelijk'),
    ('Voorjaarsvakantie',           'vakantie', '2027-02-20', '2027-02-28', true,  'Regio Noord'),
    ('Meivakantie',                 'vakantie', '2027-04-24', '2027-05-02', true,  'Regio Noord'),
    ('Meivakantie (verlengweek)',   'vakantie', '2027-05-03', '2027-05-09', false, 'Optioneel — OCW-adviesdata voor scholen die de meivakantie verlengen'),
    ('Zomervakantie',               'vakantie', '2027-07-10', '2027-08-22', true,  'Regio Noord — valt na de laatste lesdag'),
    ('Ramadan',                     'ramadan',  '2027-02-08', '2027-03-09', false, 'Umm al-Qura; kan een dag verschuiven met de maanwaarneming'),
    ('Eid al-Fitr',                 'feestdag', '2027-03-09', '2027-03-11', true,  'Umm al-Qura: 1 Shawwal = 9 maart 2027; kan een dag verschuiven'),
    ('Eid al-Adha',                 'feestdag', '2027-05-16', '2027-05-19', true,  'Umm al-Qura: 10 Dhul Hijjah = 16 mei 2027 (zondag); kan een dag verschuiven')
  ) as v(name, kind, start_date, end_date, blocks, note)
 where s.code = 'y2026'
on conflict (schooljaar_id, name) do nothing;
