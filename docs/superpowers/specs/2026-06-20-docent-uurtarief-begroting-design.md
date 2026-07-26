# Docent-uurtarief, planning-gebaseerde docentbegroting & docentdetail

**Datum:** 2026-06-20
**Status:** Goedgekeurd

## Doel

Per docent een **uurtarief** kunnen vastleggen, dat tarief toepassen op de lessen
waar de docent in de planning staat ingepland, en daarmee per schooljaar
begroten hoeveel we aan docenten betalen (planning × uurtarief). Daarnaast: op
een docent klikken om de **historie van klassen** en de **ingeplande lessen** te zien.

## Beslissingen (vastgesteld met opdrachtgever)

1. **Uren per les** = duur van het lesblok van de klas, geparset uit `classes.time`
   (`"09:30 - 11:30"` → 2 u). Onparsebaar/leeg → 0 u, met zichtbare markering "lesduur onbekend".
2. **Les- én Qur'an-docent** tellen elk de **volledige** lesduur (geven parallel les).
3. **Live tarief**: de begroting gebruikt altijd het huidige `uurtarief`. Geen
   snapshot per les. Tariefwijziging werkt door op de hele (ook bestaande) planning.
4. **Financiën**: planning-prognose en handmatig geboekte **Salaris**-uitgaven blijven
   apart en duidelijk gelabeld. **"Saldo (begroot)"** = inkomsten − (overige uitgaven +
   begrote docentkosten). Salaris-actuals blijven puur registratie; de prognose stuurt het saldo.

## Datamodel

Migratie `supabase/migrations/019_teacher_hourly_rate.sql` (re-runnable, geen RLS-wijziging
— `teachers` heeft al admin-RLS):

```sql
alter table public.teachers add column if not exists uurtarief numeric; -- €/uur, null = onbekend
```

`src/types/database.ts` — voeg `uurtarief: number | null` toe aan de `teachers` `Row`.
Migratie wordt **handmatig** door de opdrachtgever toegepast in de Supabase SQL editor.

## Componenten & dataflow

### Kostenberekening (afgeleid, live)
- Een docent is "ingepland" op een les als `lessons.teacher_id` **of** `quran_teacher_id`
  gelijk is aan de docent én `type != 'vrij'`.
- Uren = duur van `classes.time`. Helper `lessonHours(timeRange)` parset `"HH:MM - HH:MM"`.
- Kosten per toewijzing = uren × `teacher.uurtarief`.
- Hook `useTeacherCosts(schooljaarId)`: laadt lessen van de niet-historische/niet-volgende
  klassen van dat schooljaar, gejoined met de klas (`time`, `track`, `schooljaar_id`) + de
  docenttarieven. Retourneert per docent `{ teacher, lessen, uren, kosten }` plus een jaartotaal.

### Uurtarief invoeren — `TeacherFormModal` (extractie)
De bestaande bewerk-modal uit `TeachersList` wordt geëxtraheerd naar een gedeelde
`TeacherFormModal`, met een extra veld **"Uurtarief (€/uur)"** (number). Gebruikt door
zowel de lijst (toevoegen) als de detailpagina (bewerken). `useSaveTeacher` krijgt
`uurtarief` mee.

### Docentbegroting in `FinanceScreen`
- Nieuwe `Stat` **"Begrote docentkosten"** (jaartotaal uit `useTeacherCosts`).
- Nieuwe `Card` **"Docentkosten o.b.v. planning"**: per docent `uurtarief · ingeplande uren · kosten`,
  met jaartotaal. Lege staat als er geen tarieven/planning zijn.
- `Saldo (begroot)` herrekenen: `totalIncome − (totalExpenses + begrote docentkosten)`.
  Subtekst maakt expliciet dat docentkosten een planning-prognose zijn, los van geboekte Salaris-uitgaven.

### Docentdetailpagina — `/teachers/:id`
- Route in `App.tsx` onder het admin-blok.
- In `TeachersList`: rij-klik navigeert naar `/teachers/:id` (i.p.v. de bewerk-modal openen);
  "Docent toevoegen" blijft de modal.
- `TeacherDetail`:
  - **Hero**: naam, rol-badge, afkorting, e-mail, telefoon, specialiteit, **uurtarief**, knop "Bewerken".
  - **Card "Klassen (historie)"**: alle klassen waar de docent les- óf Qur'an-docent was, over álle
    schooljaren, met schooljaarnaam + rol-badge (Lesdocent/Qur'an-docent), klikbaar naar `/classes/:id`.
  - **Card "Ingeplande lessen"**: lessen waar de docent staat ingepland — klas, datum, lesweek, type,
    uren, kosten — met een samenvatting per schooljaar (aantal lessen · totale uren · totale kosten).
- Hook `useTeacherDetail(id)`: docentrij; klassen (beide fkeys) met schooljaarnaam; ingeplande lessen
  met klas + schooljaar + tijd.

## Bestanden

- `supabase/migrations/019_teacher_hourly_rate.sql` (nieuw)
- `src/types/database.ts` (uurtarief toevoegen)
- `src/data/people.ts` (`useSaveTeacher` uurtarief; `useTeacherDetail`; `useTeacherCosts` — of in eigen bestand)
- `src/features/teachers/TeacherFormModal.tsx` (nieuw, geëxtraheerd)
- `src/features/teachers/TeachersList.tsx` (rij-klik → detail; gedeelde modal voor toevoegen)
- `src/features/teachers/TeacherDetail.tsx` (nieuw)
- `src/features/finance/FinanceScreen.tsx` (docentkosten-stat + card + saldo)
- `src/App.tsx` (route `/teachers/:id`)

## Edge cases

- `classes.time` leeg/onparsebaar → 0 u + markering "lesduur onbekend".
- `uurtarief` null → kosten 0 + markering "tarief onbekend".
- Hifdh-klas: alleen les-docent (geen Qur'an-docent) — al gedekt door de bestaande velden.
- Zelfde docent in beide velden van één les → telt beide toewijzingen (zeldzaam; acceptabel).

## Niet in scope (YAGNI)

- Tarief-snapshot/effectief-gedateerde tarieven per les.
- Gesplitste blokken (les/Qur'an 50/50).
- Handmatige uren per les.
