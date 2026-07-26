-- ============================================================================
-- 023_teacher_payout_by.sql — Wie heeft de uitbetaling afgevinkt?
-- Legt bij elke uitbetaling vast wie hem heeft afgevinkt: `paid_by` verwijst
-- naar het profiel, `paid_by_name` is de naam op dát moment (snapshot, zodat de
-- historie leesbaar blijft als een account later wordt verwijderd of hernoemd).
-- Bestaande rijen houden null = "onbekend". Re-runnable.
-- Apply in de Supabase SQL editor.
-- ============================================================================

alter table public.teacher_payouts
  add column if not exists paid_by      uuid references public.profiles(id) on delete set null,
  add column if not exists paid_by_name text;

create index if not exists teacher_payouts_paid_by_idx on public.teacher_payouts (paid_by);
