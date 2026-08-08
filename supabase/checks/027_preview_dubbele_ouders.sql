-- ============================================================================
-- PREVIEW bij migratie 027 — wat wordt er samengevoegd?
--
-- Draai dit VOORDAT je 027_merge_duplicate_ouders.sql toepast. Dit bestand
-- verandert niets; het leest alleen.
--
-- De telefoonnormalisatie staat hier met opzet uitgeschreven in plaats van via
-- public.normalize_phone(): die functie bestaat pas ná 027. De regels zijn
-- identiek, dus de uitkomst is dezelfde als wat de migratie straks doet.
--
-- Plak de queries één voor één in de Supabase SQL editor.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. DE BELANGRIJKSTE: welke records worden samengevoegd, en verschillen de
--    namen? Namen die verschillen kunnen een gedeelde vaste lijn zijn — vader
--    én moeder op hetzelfde nummer. Die zou 027 tot één persoon maken.
--    Loop deze lijst na vóór je de migratie draait.
-- ---------------------------------------------------------------------------
with cleaned as (
  select o.id, o.name, o.phone, o.email, o.role, o.created_at,
         regexp_replace(btrim(coalesce(o.phone, '')), '[^0-9+]', '', 'g') as raw
    from public.ouders o
), digits as (
  select c.*,
         case
           when c.raw = ''            then null
           when left(c.raw, 1) = '+'  then substr(c.raw, 2)
           when left(c.raw, 2) = '00' then substr(c.raw, 3)
           when left(c.raw, 1) = '0'  then '31' || substr(c.raw, 2)
           when left(c.raw, 2) <> '31' then '31' || c.raw
           else c.raw
         end as d
    from cleaned c
), norm as (
  select id, name, phone, email, role, created_at,
         case when d ~ '^[0-9]+$' and length(d) between 8 and 15
              then '+' || d end as e164
    from digits
)
select e164                                            as nummer,
       count(*)                                        as records,
       count(distinct lower(btrim(name))) > 1          as namen_verschillen,
       array_agg(name order by created_at)             as namen,
       (array_agg(name order by created_at))[1]        as blijft_staan,
       array_agg(role order by created_at)             as rollen
  from norm
 where e164 is not null
 group by e164
having count(*) > 1
 order by namen_verschillen desc, records desc, nummer;


-- ---------------------------------------------------------------------------
-- 2. Samenvatting: hoeveel ouderrecords blijven er over?
-- ---------------------------------------------------------------------------
with cleaned as (
  select o.id, regexp_replace(btrim(coalesce(o.phone, '')), '[^0-9+]', '', 'g') as raw
    from public.ouders o
), digits as (
  select c.id,
         case
           when c.raw = ''            then null
           when left(c.raw, 1) = '+'  then substr(c.raw, 2)
           when left(c.raw, 2) = '00' then substr(c.raw, 3)
           when left(c.raw, 1) = '0'  then '31' || substr(c.raw, 2)
           when left(c.raw, 2) <> '31' then '31' || c.raw
           else c.raw
         end as d
    from cleaned c
), norm as (
  select id, case when d ~ '^[0-9]+$' and length(d) between 8 and 15
                  then '+' || d end as e164
    from digits
)
select count(*)                                                as ouders_nu,
       count(*) filter (where e164 is null)                     as zonder_bruikbaar_nummer,
       count(distinct e164) filter (where e164 is not null)     as unieke_nummers,
       count(*) filter (where e164 is not null)
         - count(distinct e164) filter (where e164 is not null) as worden_verwijderd,
       count(*)
         - (count(*) filter (where e164 is not null)
            - count(distinct e164) filter (where e164 is not null)) as ouders_straks
  from norm;


-- ---------------------------------------------------------------------------
-- 3. Ouders zonder bruikbaar telefoonnummer. Deze blijft 027 ongemoeid laten —
--    daar is geen betrouwbare identiteit voor. Handmatig nalopen.
-- ---------------------------------------------------------------------------
with cleaned as (
  select o.id, o.name, o.phone, o.email,
         regexp_replace(btrim(coalesce(o.phone, '')), '[^0-9+]', '', 'g') as raw
    from public.ouders o
), digits as (
  select c.*,
         case
           when c.raw = ''            then null
           when left(c.raw, 1) = '+'  then substr(c.raw, 2)
           when left(c.raw, 2) = '00' then substr(c.raw, 3)
           when left(c.raw, 1) = '0'  then '31' || substr(c.raw, 2)
           when left(c.raw, 2) <> '31' then '31' || c.raw
           else c.raw
         end as d
    from cleaned c
)
select id, name, phone, email
  from digits
 where d is null or d !~ '^[0-9]+$' or length(d) not between 8 and 15
 order by name;


-- ---------------------------------------------------------------------------
-- 4. GELDGEVOLG: welke kinderen worden na de samenvoeging broers/zussen?
--    De lesgeldstaffel herkent een gezin via gedeelde ouders. Kinderen die nu
--    los staan en straks aan dezelfde ouder hangen, zakken naar het 2e-/3e-
--    kindtarief. Dit zijn precies de gezinnen waar het bedrag verandert.
-- ---------------------------------------------------------------------------
with cleaned as (
  select o.id, o.name, o.created_at,
         regexp_replace(btrim(coalesce(o.phone, '')), '[^0-9+]', '', 'g') as raw
    from public.ouders o
), digits as (
  select c.*,
         case
           when c.raw = ''            then null
           when left(c.raw, 1) = '+'  then substr(c.raw, 2)
           when left(c.raw, 2) = '00' then substr(c.raw, 3)
           when left(c.raw, 1) = '0'  then '31' || substr(c.raw, 2)
           when left(c.raw, 2) <> '31' then '31' || c.raw
           else c.raw
         end as d
    from cleaned c
), norm as (
  select id, name, created_at,
         case when d ~ '^[0-9]+$' and length(d) between 8 and 15
              then '+' || d end as e164
    from digits
), dubbel as (
  select e164 from norm where e164 is not null group by e164 having count(*) > 1
)
select n.e164                                        as nummer,
       (array_agg(n.name order by n.created_at))[1]  as ouder,
       count(distinct k.id)                          as kinderen_straks_samen,
       array_agg(distinct k.full_name)               as kinderen
  from norm n
  join dubbel     on dubbel.e164 = n.e164
  join public.kind_ouder ko on ko.ouder_id = n.id
  join public.kinderen   k  on k.id = ko.kind_id
 group by n.e164
having count(distinct k.id) > 1
 order by kinderen_straks_samen desc;


-- ---------------------------------------------------------------------------
-- 5. NA AFLOOP — terugkijken wat 027 heeft gedaan (werkt pas ná de migratie).
-- ---------------------------------------------------------------------------
-- select merged_at, phone_e164, kept_name, removed_name, removed_email,
--        removed_role, kinderen_moved
--   from public.ouders_merge_log
--  order by merged_at desc, phone_e164;
