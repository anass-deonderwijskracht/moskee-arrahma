-- ============================================================================
-- 026_google_contacts_cron.sql — Nachtelijke Google Contacts-sync
--
-- Draait de sync elke nacht, zodat statuswijzigingen en klasindelingen vanzelf
-- in Google landen. Alleen een nieuwe aanmelding via het formulier triggerde de
-- sync tot nu toe; alles wat je in de app zelf doet niet.
--
-- De run is idempotent: verandert er niets, dan schrijft hij niets naar Google.
--
-- ---- EENMALIG ZELF DOEN, vóór of na deze migratie -------------------------
-- 1. Bedenk een geheime string en zet die als edge-function secret:
--      supabase secrets set CONTACTS_SYNC_SECRET=<geheim>
-- 2. Zet dezelfde string in de Vault, zodat hij niet in deze (publieke) repo
--    terechtkomt. Draai in de SQL editor:
--      select vault.create_secret('<geheim>', 'contacts_sync_secret');
--    Bijwerken kan later met:
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'contacts_sync_secret'),
--        '<nieuw-geheim>');
-- 3. Deploy de function zonder JWT-poort — de function doet zijn eigen
--    autorisatie (sync-secret, service-role key of admin-JWT):
--      supabase functions deploy google-contacts-sync --no-verify-jwt
--
-- Tijd: pg_cron draait in UTC. 23:00 UTC is 00:00 Nederlandse tijd in de winter
-- en 01:00 in de zomer. Aanpassen kan door deze migratie opnieuw te draaien met
-- een ander schema, of met cron.alter_job().
-- Re-runnable.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Oude versie van de taak weghalen, zodat deze migratie herhaalbaar blijft.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'google-contacts-sync-nightly';

select cron.schedule(
  'google-contacts-sync-nightly',
  '0 23 * * *',
  $job$
  select net.http_post(
    url     := 'https://mvgncakgtirtoovgewiw.supabase.co/functions/v1/google-contacts-sync',
    headers := jsonb_build_object(
      'content-type',  'application/json',
      'x-sync-secret', (select decrypted_secret
                          from vault.decrypted_secrets
                         where name = 'contacts_sync_secret')
    ),
    body    := jsonb_build_object('dryRun', false, 'merge', true),
    timeout_milliseconds := 120000
  );
  $job$
);

-- Controleren: select * from cron.job where jobname = 'google-contacts-sync-nightly';
-- Laatste runs:  select * from cron.job_run_details order by start_time desc limit 10;
-- Uitzetten:     select cron.unschedule('google-contacts-sync-nightly');
