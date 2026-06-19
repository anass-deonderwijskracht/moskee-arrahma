# Toetsen & Beoordelingen — Design

**Datum:** 2026-06-19
**Status:** Goedgekeurd (ontwerp)

## Doel

Docenten en admins kunnen per klas **toetsen** aanmaken en **beoordelingen** (cijfers
en schaal-oordelen) invullen, georganiseerd per rapportperiode (Rapport 1, Rapport 2,
Eindrapport). Admins kunnen toetsen in bulk over meerdere klassen × rapporten uitrollen.

## Beslissingen (uit brainstorm)

1. **Eindrapport** werkt volledig handmatig, identiek aan Rapport 1/2 (geen automatische afleiding).
2. **Cijfers**: vrije handmatige invoer (tekstveld, geen afgedwongen bereik/decimalen).
3. **Rapportperioden**: instelbaar door admin (eigen tabel, geseed met Rapport 1/2/Eindrapport).
4. **Leerling-detail**: bestaande lege "Toetsen"-tab wordt gevuld met een **read-only** overzicht.
5. **RLS**: admin volledige toegang (`is_admin()`), docent gescoped op eigen klas
   (`current_class_id()` / `leerling_in_my_class()`), consistent met `014_user_management.sql`.

## Datamodel — migratie `supabase/migrations/015_toetsen_beoordelingen.sql`

Re-runnable, zelfde stijl als bestaande migraties. Ook toegevoegd aan `apply_all.sql`
(indien aanwezig) en getypeerd in `src/types/database.ts`.

### `report_periods` — rapportperioden (globaal, admin-beheerd)
| kolom | type | opmerking |
|-------|------|-----------|
| id | uuid pk | `gen_random_uuid()` |
| name | text not null | bv. "Rapport 1" |
| ord | int not null default 0 | sorteervolgorde |
| archived | boolean not null default false | verbergen i.p.v. hard verwijderen |
| created_at | timestamptz default now() | |

Seed (idempotent op `name`): `Rapport 1` (ord 1), `Rapport 2` (ord 2), `Eindrapport` (ord 3).

### `tests` — toetsen (per klas + rapport)
| kolom | type | opmerking |
|-------|------|-----------|
| id | uuid pk | |
| class_id | uuid not null → classes(id) on delete cascade | |
| report_period_id | uuid not null → report_periods(id) on delete cascade | |
| name | text not null | |
| grade_type | text not null check in (`'cijfer'`,`'schaal'`) | |
| created_at | timestamptz default now() | |

Index op `(class_id, report_period_id)`.

### `test_grades` — cijfer/oordeel per toets per leerling
| kolom | type | opmerking |
|-------|------|-----------|
| id | uuid pk | |
| test_id | uuid not null → tests(id) on delete cascade | |
| leerling_id | uuid not null → leerlingen(id) on delete cascade | |
| value | text | cijfer ("7,5") of schaal-label; null = niet ingevuld |
| updated_at | timestamptz default now() | |

Unique `(test_id, leerling_id)` (voor upsert `onConflict`).

### `report_assessments` — vaste kolommen per leerling per rapport
| kolom | type | opmerking |
|-------|------|-----------|
| id | uuid pk | |
| leerling_id | uuid not null → leerlingen(id) on delete cascade | |
| report_period_id | uuid not null → report_periods(id) on delete cascade | |
| quran | text | schaal-label, nullable |
| gedrag | text | schaal-label, nullable |
| inzet | text | schaal-label, nullable |
| opmerking | text | vrije tekst, nullable |
| updated_at | timestamptz default now() | |

Unique `(leerling_id, report_period_id)`.

**Schaalwaarden** (UI-constante, niet in DB afgedwongen): `onvoldoende, matig, voldoende, goed, zeer goed`.

### RLS (alle 4 tabellen `enable row level security`)
- **Admin** — per tabel: `for all using (public.is_admin()) with check (public.is_admin())`.
- **Docent** (additief, OR-gecombineerd, zoals 014):
  - `tests`: `for all using (class_id = public.current_class_id()) with check (...)`.
  - `test_grades`: `for all using (public.leerling_in_my_class(leerling_id)) with check (...)`.
  - `report_assessments`: `for all using (public.leerling_in_my_class(leerling_id)) with check (...)`.
  - `report_periods`: `for select using (public.is_docent())` — alleen lezen; beheer is admin-only.

## Datalaag — `src/data/rapporten.ts` (nieuw)

Zelfde stijl als `src/data/classDetail.ts` (React Query + supabase, upsert met `onConflict`).

- `useReportPeriods()` → `report_periods` gesorteerd op `ord`, niet-gearchiveerd.
- `useCreateReportPeriod()`, `useUpdateReportPeriod()` (naam/ord/archived) — admin.
- `useClassTests(classId)` → toetsen van een klas (met `report_period_id`).
- `useCreateTest()`, `useUpdateTest()`, `useDeleteTest()`.
- `useBulkCreateTests()` → insert van één toetsdefinitie als rij per `class_id × report_period_id` combinatie.
- `useReportGrades(classId, reportPeriodId)` → laadt voor het inline-raster:
  leerlingen-id-lijst + bestaande `report_assessments` (map per leerling) +
  `tests` van dat rapport + bestaande `test_grades` (map per `test_id:leerling_id`).
- `useSaveReportGrades()` → batch: upsert `report_assessments` (onConflict `leerling_id,report_period_id`)
  + upsert `test_grades` (onConflict `test_id,leerling_id`). Invalidate de betreffende query keys.
- `useLeerlingReports(leerlingId)` → read-only: per rapportperiode de assessments + test_grades
  (met toets-naam/type) van één leerling, voor de leerling-detailpagina.

Gedeelde constante `SCHAAL = ["onvoldoende","matig","voldoende","goed","zeer goed"]` en
type-helpers in dit bestand (of `src/data/rapporten.ts` exporteert ze).

## UI

### Klassenpagina — `src/features/classes/ClassDetail.tsx`
Twee tabs toevoegen aan de bestaande `Tabs` (na "Qur'an-overzicht"):
`{ value: "toetsen", label: "Toetsen" }` en `{ value: "beoordelingen", label: "Beoordelingen" }`.
Beide rendert een nieuw component (props: `classId`, `leerlingen`).

#### `src/features/class-admin/ToetsenTab.tsx` (nieuw)
- Lijst van toetsen van de klas, gegroepeerd per rapportperiode (`Card` per groep).
- Knop "Toets toevoegen" → `Modal` met velden: **Naam** (input), **Beoordelingstype**
  (`Select`: Cijfer / Schaal), **Rapport** (`Select` uit `useReportPeriods()`).
- Per toets: bewerken (naam/type/rapport) en verwijderen.
- Hergebruikt `Modal`, `Field`, `ModalFooter`, `Select`, `Btn`, `Card`, toast.

#### `src/features/class-admin/BeoordelingenTab.tsx` (nieuw)
- Subnavigatie met `Pills`/`Tabs`: één per rapportperiode (uit `useReportPeriods()`).
- Voor de gekozen periode: één **inline-bewerkbaar raster** in de stijl van `LesAdministratie.tsx`
  (lokale `state: Record<leerlingId, RowState>` geseed uit `useReportGrades`, één "Opslaan"-knop):
  - **Rijen** = leerlingen van de klas (avatar + naam, zoals LesAdministratie).
  - **Kolommen**: Quran · Gedrag · Inzet (`Select` met SCHAAL) · Opmerking (`input` tekst) ·
    daarna één kolom per toets in dit rapport. Toets-cel: `grade_type === 'cijfer'` → vrij
    `input`; `'schaal'` → `Select` met SCHAAL.
  - Horizontale scroll bij veel toetsen (`overflowX: auto`, zoals de memorisatie-matrix).
  - "Opslaan" roept `useSaveReportGrades()` met assessments + alle test_grades.
- Lege staat als er nog geen rapportperioden of geen leerlingen zijn.

### Administratie — nieuwe pagina "Toetsen"
- **Route** in `src/App.tsx`: `<Route path="/admin-toetsen" element={<AdminToetsen />} />`
  binnen het bestaande `<RequireAdmin>`-blok.
- **Sidebar** (`src/components/chrome/Sidebar.tsx`): in de admin-itemslijst onder groep
  "Administratie" een item `{ to: "/admin-toetsen", label: "Toetsen", icon: "edit" }`.
  (Docent-zijbalk ongewijzigd.)

#### `src/features/admin-tests/AdminToetsen.tsx` (nieuw)
Drie secties (`Card`'s) op één `Section`-pagina:
1. **Toets in bulk aanmaken** — formulier: Naam, Beoordelingstype (Cijfer/Schaal),
   multi-select **klassen** (checkbox-lijst, gefilterd op huidig schooljaar via bestaande
   `useClasses`/`useCurrentSchooljaar`), multi-select **rapporten** (checkboxes uit
   `useReportPeriods`). "Aanmaken" → `useBulkCreateTests()` maakt één `tests`-rij per
   geselecteerde klas × rapport.
2. **Alle toetsen** — masteroverzicht (tabel) van alle toetsen over alle klassen,
   met klas, rapport, naam, type; verwijderen mogelijk. (Bevestiging via "beide".)
3. **Rapportperioden beheren** — lijst met inline hernoemen/herordenen (ord) en
   toevoegen/archiveren via `useCreateReportPeriod`/`useUpdateReportPeriod`.

### Leerling-detail — `src/features/students/LeerlingDetail.tsx`
De bestaande regel voor `tab === "tests"` vervangen door een nieuw read-only component
`LeerlingToetsen` (props: `leerlingId`) dat `useLeerlingReports()` gebruikt: per
rapportperiode een `Card` met de vaste oordelen (Quran/Gedrag/Inzet/Opmerking) en een
tabel van toets → waarde. Lege staat blijft als er nog niets is ingevuld.

## Bestandsoverzicht

**Nieuw**
- `supabase/migrations/015_toetsen_beoordelingen.sql`
- `src/data/rapporten.ts`
- `src/features/class-admin/ToetsenTab.tsx`
- `src/features/class-admin/BeoordelingenTab.tsx`
- `src/features/admin-tests/AdminToetsen.tsx`

**Gewijzigd**
- `src/types/database.ts` — 4 nieuwe tabel-types.
- `src/features/classes/ClassDetail.tsx` — 2 tabs + rendering.
- `src/features/students/LeerlingDetail.tsx` — "tests"-tab vullen.
- `src/App.tsx` — admin-route.
- `src/components/chrome/Sidebar.tsx` — admin-navitem.
- `supabase/apply_all.sql` — migratie aanhangen (indien dit bestand bestaat).

## Aannames / scope-grenzen (YAGNI)
- Geen PDF-/printgeneratie van rapporten (niet gevraagd).
- Geen automatische berekening/aggregatie tussen rapporten.
- Geen koppeling van toetscijfers aan de bestaande `class_metrics`/`leerling_metrics` views.
- Geen `schooljaar_id` op `tests` — schooljaar volgt impliciet uit `class_id`/`leerling_id`.
- Schaalwaarden zijn een UI-constante, niet als enum in de DB.
- Migratie wordt na schrijven toegepast op Supabase via de MCP `apply_migration`-tool.

## Verificatie
- `npx tsc --noEmit` (of projectbuild) slaagt; geen type-fouten in nieuwe/aangepaste bestanden.
- Migratie draait foutloos op Supabase; de 4 tabellen + policies bestaan.
- Handmatig: toets aanmaken in klas → verschijnt als kolom in Beoordelingen → cijfer invullen
  & opslaan → herladen toont waarde → zichtbaar (read-only) op leerling-detail.
- Admin bulk: toets over 2 klassen × 2 rapporten → 4 `tests`-rijen, elk in de juiste klas/rapport.
- Docent (eigen klas) kan toetsen/beoordelingen lezen+schrijven; geen toegang tot andere klassen.
