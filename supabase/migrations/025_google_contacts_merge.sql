-- ============================================================================
-- 025_google_contacts_merge.sql — Tellers voor samenvoegen
-- De handmatige import maakte per schooljaar een apart contact, dus dezelfde
-- ouder staat er als AO-23, AO-24 én AO-25 in. De sync voegt die samen tot één
-- contact en ruimt de rest op; deze twee tellers leggen dat per run vast.
-- Re-runnable. Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.google_contact_sync_runs
  add column if not exists merged  int not null default 0,   -- samengevoegde gezinnen
  add column if not exists deleted int not null default 0;   -- opgeruimde dubbelen
