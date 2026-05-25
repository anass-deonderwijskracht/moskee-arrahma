# Moskee Arrahma — Weekendonderwijs Admin App — Design Spec

_Date: 2026-05-20_
_Status: Approved (architecture); pending spec review_

## 1. Overview

A web admin application for **Moskee Arrahma**'s weekend Islamic education program.
It should feel like a modern, fast, robust, relationally-rich version of Magister, tailored
to weekend/Islamic education with emphasis on **Qur'an registration per student**, **per-lesson
administration** (attendance, homework, materials), **admissions** (pipeline + class allocation),
**finance** (budget vs. expenses per school year), **class overview**, and **planning**.

- **Language:** Dutch (Nederlands) throughout the UI.
- **Users / roles:** Admin only (bestuur/beheerder). Email + password login, invite-only.
- **Source of truth:** the design bundle at `../moskee-arrahma-design/moskeeonderwijs/`
  (HTML/CSS/JS prototype + chat transcript). We recreate it pixel-perfectly in production tech.
- **Brand correction:** the org is **Moskee Arrahma** (the prototype left a stray "Moskee Anwar" in
  the sidebar/settings — standardize on Moskee Arrahma, matching the `@moskee-arrahma.nl` emails).
- **Class count:** **9 classes** = Klas 1–7 (regulier) + Klas Hifdh-K + Klas Hifdh-B. Fix any
  stale "7 klassen" copy.

### Non-goals (this milestone)
- Mobile/parent-facing app, teacher self-service login (admin-only for now).
- Real email/WhatsApp sending, document uploads/storage, payment provider integration.
  (Buttons that were demo-only in the prototype were already removed per the chat; we keep parity.)
- Offline support, i18n beyond Dutch.

## 2. Tech stack & key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build/framework | **Vite + React 18 + TypeScript** | Type-safe DB layer; matches spec's "schaalbaar, onderhoudbaar, testbaar"; ports prototype React + CSS directly. |
| Backend | **Supabase** (Postgres + Auth) | No separate server; from day one. |
| Routing | **React Router** | Mirrors prototype routes. |
| Data layer | **TanStack Query** + thin typed data-access modules per entity, on **generated Supabase types** | Caching, loading/error, mutations, optimistic updates for kanban / les-admin / qur'an-admin. |
| Styling | Prototype **`styles.css` ported verbatim** (tokens, dark mode, density, accent palettes) | It's already a strong, framework-agnostic design system. |
| Auth | **Email + password, invite-only** (Supabase Auth) | Small admin team; no public signup. |
| Testing | **Vitest + React Testing Library** | Cover logic-heavy units (qur'an auto-ayah engine, metric calcs, klassenindeler). |

### Supabase dev workflow
- Production project (clean, separate Supabase account): URL + anon key + service_role key supplied
  by the user, stored in gitignored `.env` (frontend uses **anon key only**; service_role is
  **dev-only** for migrations/seed/first-admin and **must be rotated before go-live**).
- Schema delivered as **numbered SQL migration files** (`supabase/migrations/00N_*.sql`) the user
  reviews; applied during dev via service_role; re-runnable by the user on production at deploy.
- `.env.example` documents required vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (service_role kept out of `VITE_*` so it can never reach the bundle).

## 3. Architecture

```
Browser (Vite + React + TS SPA)
   │  @supabase/supabase-js (anon key only) + TanStack Query
   ▼
Supabase
   ├── Auth (email+password, invite-only)
   ├── Postgres (tables + RLS; every table admin-gated)
   └── Views / RPC for computed metrics (single source of truth)
```

Client-rendered SPA; Supabase is the entire backend. No SSR (internal admin tool, no SEO need).

## 4. Data model (Postgres)

Naming: snake_case tables/columns, `id uuid default gen_random_uuid()` PKs unless noted,
`created_at timestamptz default now()`, `updated_at` via trigger where edited.
Reference/demo IDs from the prototype (e.g. `k1`, `s1`) are NOT primary keys; we use uuids and
keep human codes (leerlingnummer, class code) as their own columns.

### 4.1 Auth & settings
- **profiles** — `id uuid` (FK → `auth.users.id`, PK), `full_name text`, `role text` check in
  (`admin`) default `admin`, `created_at`. One row per admin user.
- **app_settings** — singleton row: org `name`, `address`, `phone`, `email`,
  tuition `annual_amount_eur int`, `terms int`, `sibling_discount text`. Seeded with Moskee Arrahma.

### 4.2 Reference data
- **surahs** — `n int PK`, `name text`, `verses int`, `juz int`. Seeded: Al-Fatiha + all of Juz 30 (38 rows).
- **schooljaren** — `id text PK` (e.g. `y2025`) or uuid + `code text unique`; `name text` ("2025/26"),
  `start_date date`, `end_date date`, `lesdagen int`, `is_current bool`, `archived bool`.
  Exactly one `is_current = true` (enforced by partial unique index).

### 4.3 People & org
- **teachers** — `id`, `name`, `short`, `email`, `phone`, `joined date`, `specialty text`,
  `role text` check in (`les`,`quran`,`both`) — drives les-docent vs Qur'an-docent.
- **kinderen** — the child across years: `id`, `first_name`, `last_name`, `full_name`,
  `initials`, `gender` (`m`/`f`), `birth_year int`, `address text`, `notes text`.
- **ouders** — `id`, `role text` (Vader/Moeder/Voogd), `name`, `phone`, `email`,
  `primary bool`, `bereik text` (reachability). (Preferred-language/contact/mailing columns were
  removed per chat — omit.)
- **kind_ouder** — M:N join: `kind_id` FK, `ouder_id` FK, `is_primary bool`,
  unique(`kind_id`,`ouder_id`). Siblings share `ouders` rows → dedup contacts.
- **classes** — per school year: `id`, `code text` ("Klas 1", "Klas Hifdh-K"), `grade int`,
  `teacher_id` FK (les-docent), `quran_teacher_id` FK, `color text`, `day text` (Zaterdag/Zondag),
  `time text` ("09:30 - 11:30"), `location text` (default "Moskee Arrahma"), `capacity int`,
  `schooljaar_id` FK, `track text` (`regulier`/`hifdh`), `historic bool`, `is_next bool`.
- **leerlingen** — **enrollment of a kind in a class for a school year** (per-year record):
  `id`, `kind_id` FK, `class_id` FK, `schooljaar_id` FK, `leerlingnummer text` (e.g. "M1001"),
  `niveau text` (0 beginner / 0,5 / 1 / 1,5 / 2), `joined date`,
  `final_grade text` null (eindbeoordeling, for completed years),
  `notes_end_of_year text` null. Unique(`kind_id`,`schooljaar_id`).
  Current-year metrics are **derived** (see §5), not stored.

### 4.4 Lessons & administratie (the heart)
- **lessons** — per class: `id`, `class_id` FK, `date date`, `week_nr int`, `topic text`,
  `time text`, `location text`. Status (`upcoming`/`today`/`completed`) is **derived** from
  `date` vs current date (not stored), so "today's lesson" is always correct.
- **attendance_records** — per (leerling × lesson): `id`, `leerling_id` FK, `lesson_id` FK,
  `status text` check (`A`,`L`,`Z`,`O`, or null/`-` = not filled),
  `homework text` check (`yes`,`partial`,`no`, null) — **Arabic** homework (gemaakt/deels/niet),
  `materials_issue bool default false` — true ONLY when materials NOT in order (inverted, as in
  prototype), `note text`. Unique(`leerling_id`,`lesson_id`). Source of Aanwezigheid % + Arabisch HW %.
- **lesson_notes** — `id`, `lesson_id` FK, `author text`, `body text`, `is_draft bool`,
  `created_at`. Les-aantekeningen; also surfaced on the student "Notities" tab.
- **quran_assignments** — per (leerling × lesson): `id`, `leerling_id` FK, `class_id` FK,
  `assigned_at_lesson_id` FK, `evaluated_at_lesson_id` FK null, `surah_n int` FK→surahs,
  `start_ayah int`, `end_ayah int`, `type text` check (`new`,`revision`),
  `evaluation text` check (`yes`,`partial`,`no`, null), `absent bool default false`,
  `notes text`. Source of Qur'an geleerd % + memorisatie timeline.
- **leerling_surah_progress** — `id`, `leerling_id` FK, `surah_n int` FK,
  `status text` check (`done`,`progress`,`review`,`todo`), unique(`leerling_id`,`surah_n`).
  Maintained by the Qur'an-admin workflow; backs the memorisatie-kaart and `surahs_known`.

### 4.5 Admissions
- **enrollments** — pipeline card: `id`, `child_name`, `age int`, `gender`,
  `track text` (`regulier`/`hifdh`), `status text` check
  (`inschrijving`,`intake`,`wachtlijst`,`geaccepteerd`,`niet_geaccepteerd`),
  `target_class text`, `submitted_at` / `submitted_label text`, `rejection_reason text`,
  parents stored in **`enrollment_parents`** child table (`enrollment_id`, `role`, `name`,
  `phone`, `email`, `is_primary`) — always two. (Priority + documents removed per chat.)
- **enrollment_placements** — klassenindeler concept worksheet: `id`, `enrollment_id` FK,
  `schooljaar_id` FK, `class_id` FK null, `niveau text` null, `lesgeld_bedrag numeric null`,
  `definitief bool default false`, `leerling_id FK null` (set when finalized).
  Unique(`enrollment_id`,`schooljaar_id`). "Definitief inschrijven" creates kind+ouders (if new)
  and a `leerling` row, then sets `definitief=true` + `leerling_id`.

### 4.6 Finance
- **expenses** — `id`, `schooljaar_id` FK, `date date`, `category text`, `description text`,
  `amount numeric`, `vendor text`.
- **budget_categories** — `id`, `schooljaar_id` FK null (or global), `name text`,
  `planned numeric`, `color text`.
- **payments** — collegegeld per leerling: `id`, `leerling_id` FK, `date date`, `description text`
  (termijn), `amount numeric`, `status text` (`paid`,`open`,`expected`), `method text`.
  Student fee status (paid/pending/overdue) is **derived** from payments.

### 4.7 Audit
- **audit_log** — immutable: `id`, `at timestamptz`, `user_label text`, `action text`,
  `object text`, `ip text` null. Insert-only (no update/delete via RLS). Backs Instellingen →
  Audit log AND the Dashboard activity feed (recent rows, typed for icon).

## 5. Computed metrics (single source of truth)

Derived in Postgres so every screen reads identical numbers (no drift):

- **`leerling_metrics`** (view) per leerling:
  - `attendance_pct` = count(status='A') / count(status in A,L,Z,O) over that leerling's lessons.
  - `arabic_homework_pct` = count(homework='yes') / count(homework in yes,partial,no).
  - `quran_learned_pct` = count(evaluation='yes') / count(evaluation in yes,partial,no).
  - `surahs_known` = count(leerling_surah_progress.status='done').
- **`class_metrics`** (view) per class: averages of the above across the class's current leerlingen,
  plus occupancy = leerlingen / capacity, avg age, boys/girls counts.
- Detail screens, class-overzicht KPIs, and the overzicht-kanban all read these views.
- Where there is not yet enough administratie data (early use), views return null/0 gracefully;
  seed data provides realistic numbers for verification.

## 6. Key workflow rules (port exactly from prototype)

### 6.1 Les-administratie (`ClassAttendance`)
- Opening a class lands on **Overzicht** tab; the Les-administratie tab defaults to **today's lesson**;
  a lesson switcher (upcoming / today / completed) lets you edit any lesson.
- Per leerling: attendance A/L/Z/O (toggle off = "-"), homework 3-state ✓/◐/✗ (no emoji),
  materials = single red ✗ toggle meaning "NIET in orde" (default OK), free-text note.
- Quick actions: "Alle aanwezig", "Hw alle gemaakt". Header counters for att/hw/materials issues.
- Les-aantekeningen textarea (concept/plaatsen). **No "Afwezig" button here** (that's Qur'an-admin only).

### 6.2 Qur'an-administratie (`ClassQuranAdmin`) — the signature feature
Per-leerling row, three zones (number + name + **Afwezig** button | previous homework to test | new homework):
- **Previous homework**: each prior assignment (Nieuw/Revisie badge, ayah range) with 3 eval buttons
  ✓ Geleerd / ◐ Gedeeltelijk / ✗ Niet; row background tints green/orange/red on eval.
- **Auto-next-ayah engine** (only for `type='new'` previous homework):
  - ✓ Geleerd → propose next 4 ayahs of same surah (`start = prev.end+1`, `end = min(verses, start+3)`);
    if surah finished, roll to first 4 ayahs of the next surah in memorisation order.
  - ◐ Gedeeltelijk or ✗ Niet → repeat same surah/range.
  - Toggling the eval off removes the auto-generated new homework.
  - **Revision-type** evals are recorded but do NOT generate/replace new homework
    (fixes the prototype bug where evaluating a revision wiped the new homework).
- New homework block is **hidden until** the previous homework is evaluated (no placeholder text).
- "+ Surah / herhaling toevoegen" adds an extra (revision) row; surah dropdown + start/end ayah +
  type picklist on one row + trash; an **Opmerkingen** textarea below.
- **Afwezig** button (under the name): clears evals, auto-fills new homework = same as previous
  (teacher may still adjust), disables eval buttons. Does NOT exist on les-admin.
- Status simplified: everyone starts **Open**; becomes **Voltooid** when all previous entries evaluated.
  Header counts Voltooid / Open only.

### 6.3 Klassenindeler
- School-year picker (defaults to the **next** year). 9 class tiles show **concept** occupancy
  (capacity bar: yellow >80%, red when full) + a **definitief** counter. Niveau strip (5 levels) counts.
- Table of enrollments (excluding `niet_geaccepteerd`): class dropdown (auto-filtered Hifdh↔Regulier),
  niveau dropdown, **lesgeld** = open EUR input (€ prefix), and **Definitief inschrijven** button
  (disabled until class + niveau chosen). On click → creates the `leerling` record + sets definitief.
  Concept counts stay visible alongside definitief.

### 6.4 Inschrijvingen pipeline
- 5 columns: Inschrijving → Intake gepland → Wachtlijst → Geaccepteerd → Niet geaccepteerd.
- Drag a card between columns (optimistic update + persisted `status`). Track filter pills
  (Beide / Regulier / Hifdh). "Nieuwe aanmelding" dropdown offers Regulier vs Hifdh forms.
  Detail side-sheet: two parent cards (phone/email, no call/mail buttons), timeline. No priority/documents.

### 6.5 Leerling / Kind / Ouder relational views
- Leerling detail tabs: Qur'an-voortgang (timeline + memorisatie-kaart), Aanwezigheid, Toetsen,
  Notities (from lesson_notes), Algemene info (2 parent cards + betalingen). Hero shows the 3 headline
  metrics + Surahs gememoriseerd. "Volledige kind-historie →" links to Kind.
- Kind detail: hero (avg attendance, surahs now, address) + Onderwijshistorie (one row per school year)
  + linked ouders + siblings. "Open dit jaar →" links to current leerling.
- Ouder detail: contact hero, linked kinderen (clickable), co-parent(s). (No mailing/communication cards.)

## 7. Frontend structure

```
src/
  lib/supabase.ts            # client (anon key from env)
  data/*.ts                  # typed queries/mutations per entity (TanStack Query hooks)
  types/database.ts          # generated from schema (supabase gen types)
  components/ui/*            # Icon, Avatar, Badge, Btn, Card, Stat, Pills, Tabs, Section, Toast, QBar, EUR, Select
  components/chrome/*        # Sidebar, TopBar, TweaksPanel (theme/density/accent/nav), Toast host
  features/
    auth/                    # LoginPage, useSession, ProtectedRoute
    dashboard/
    kinderen/  ouders/  teachers/  students/
    classes/                 # list (grid/table/overzicht-kanban) + detail tabs
    class-admin/             # les-administratie + qur'an-administratie (incl. ayah engine)
    enrollments/             # kanban + table + detail sheet
    klassenindeler/
    finance/  planning/  settings/
  routes.tsx  App.tsx  main.tsx
  styles/styles.css          # ported verbatim
```
One feature folder per screen = focused, independently testable units.

### Routes (mirror prototype)
`/login`, `/dashboard`, `/planning`, `/kinderen`, `/kinderen/:id`, `/ouders`, `/ouders/:id`,
`/teachers`, `/students`, `/students/:id`, `/classes`, `/classes/:id`, `/enrollments`, `/finance`,
`/settings`. Tweaks (theme/density/accent/nav) persisted to localStorage as in prototype.

## 8. Auth & security (RLS)
- Login screen (email + password); no public signup. First admin created via service_role/dashboard.
- **RLS enabled on every table.** Policy: an authenticated user with a `profiles` row (role admin)
  may select/insert/update/delete. `audit_log`: insert + select only (no update/delete).
  `surahs`/`app_settings` readable by any authenticated admin.
- Frontend bundles **only** the anon key. Protected routes redirect to `/login` without a session.
- service_role used strictly in dev tooling (migrations, seed, first-admin) — never in `VITE_*`/bundle.

## 9. Phased delivery

Each phase is independently runnable and reviewable. A migration SQL file accompanies each.

| Phase | Deliverables | Migration | Acceptance |
|---|---|---|---|
| **0 — Foundation** | Vite/TS scaffold; `styles.css`; UI atoms; app shell (Sidebar/TopBar/Tweaks, routing); Supabase client + env; **LoginPage + ProtectedRoute + session** | `001` profiles, app_settings, surahs, schooljaren, RLS baseline | App builds, themed shell renders, admin can log in/out, unauth → login |
| **1 — People & classes (read)** | Kinderen (list+detail), Ouders (list+detail), Docenten, Leerlingen (list + detail tabs read), Klassen (grid/table/overzicht-kanban) + class Overview/Lessen/Leerlingen/Qur'an-matrix; `leerling_metrics`/`class_metrics` views | `002` teachers, kinderen, ouders, kind_ouder, classes, leerlingen, lessons + views | All read screens render real data; metrics consistent across screens |
| **2 — Core workflows (write)** | Les-administratie (full) + **Qur'an-administratie** (full ayah engine, afwezig, revisie, opmerkingen); writes persist; metrics update live | `003` attendance_records, lesson_notes, quran_assignments, leerling_surah_progress | Saving attendance/qur'an updates DB + recomputes metrics; engine rules pass unit tests |
| **3 — Admissions & finance** | Inschrijvingen (kanban drag + table + detail sheet); Klassenindeler (concept → Definitief creates leerling); Financiën (begroting/uitgaven/modal/jaar-selector); betalingen on leerling | `004` enrollments(+parents), enrollment_placements, payments, expenses, budget_categories | Drag persists status; Definitief creates a leerling; expense add persists; finance totals per year correct |
| **4 — Planning, settings, polish** | Planning (kalender + tabel from classes/events); Instellingen (organisatie, schooljaren CRUD, schooljaar, audit log, data export stubs); Dashboard fully wired; audit logging on writes; RLS hardening; verification | `005` audit_log + finalize/constraints | Full app navigable end-to-end on real data; audit entries recorded; RLS verified |

**Seed data:** an optional `supabase/seed.sql` recreates the prototype's demo dataset
deterministically (9 classes, ~137 students, parents/siblings, lessons, qur'an assignments,
enrollments, expenses) so every screen can be verified populated. Run on dev; skip for real
production data.

## 10. Testing
- **Vitest + RTL** for logic-heavy units: qur'an auto-next-ayah engine (all branches), metric
  derivations, klassenindeler finalize, enrollment drag transitions, fee-status derivation.
- Manual verification per phase against the live dev Supabase project (and against the prototype
  for visual parity).

## 11. Risks & assumptions
- **service_role exposure:** mitigated by dev-only use + `.gitignore` + rotate-before-launch note.
- **Metric semantics:** assuming attendance% = present/held, hw% and qur'an% over evaluated records;
  confirm thresholds match prototype color rules (>0.9 good, <0.8 bad etc.).
- **Surah memorisation source:** current status materialized in `leerling_surah_progress`
  (updated by qur'an-admin); timeline reconstructed from `quran_assignments` history.
- **Historic years:** read-only; metrics for archived years may use stored summary fields on
  `leerlingen` (final_grade, notes_end_of_year, plus a stored attendance/surahs snapshot) rather
  than recomputing from (absent) per-lesson records.
- "Definitief inschrijven" is idempotent and guarded (no duplicate leerling for same kind+year).
