# Moskee Arrahma — Weekendonderwijs

Web admin app for Moskee Arrahma's weekend Islamic education program — a fast,
relational, Magister-style tool focused on **Qur'an registration**, **per-lesson
administration**, **admissions**, **finance**, **class overview**, and **planning**.
Dutch UI, admin-only, invite-only login.

Built per `docs/superpowers/specs/2026-05-20-moskee-arrahma-admin-design.md`,
porting the design prototype to production tech.

## Stack
- **Vite + React 18 + TypeScript**
- **Supabase** (Postgres + Auth, RLS on every table) — anon key in the browser only
- **TanStack Query** + thin typed data-access modules
- **React Router**
- **Vitest + React Testing Library**

## Project layout
```
src/
  lib/            supabase client, query client
  types/          database.ts (matches the migrations)
  components/ui/  UI atoms (Icon, Badge, Btn, Card, Stat, Select, …)
  components/chrome/  Sidebar, TopBar, TweaksPanel, AppShell, Toast
  features/
    auth/         LoginPage, AuthProvider, ProtectedRoute
    dashboard/ kinderen/ ouders/ teachers/ students/ classes/
    class-admin/  ayahEngine.ts (+ tests) — Qur'an next-ayah logic
  styles/         styles.css (ported verbatim) + app.css (additions)
supabase/migrations/  001–005 numbered SQL + apply_all.sql
scripts/          create-admin.mjs, seed.mjs (dev-only, service_role)
```

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Configure** — `.env` is already filled with the supplied project URL + keys.
   The browser uses **only** `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY`
   is dev-tooling only (migrations/seed/first-admin) and **must be rotated before go-live**.

3. **Apply the database schema** — open the Supabase **SQL editor** for the project
   and run `supabase/migrations/apply_all.sql` (or run 001→005 in order). This creates
   all tables, RLS policies, the metric views, and the `finalize_enrollment` RPC.
   *(Re-runnable; safe to run again.)*

4. **Create the first admin** (invite-only — no public signup):
   ```bash
   npm run create-admin -- you@moskee-arrahma.nl "Sterk-wachtwoord" "Volledige Naam"
   ```

5. **Seed demo data** (optional — recreates the prototype dataset for verification):
   ```bash
   npm run seed
   ```

6. **Run**
   ```bash
   npm run dev
   ```

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run test` | Vitest unit tests (incl. the Qur'an ayah engine) |
| `npm run create-admin -- <email> <pw> [name]` | Create the first admin (service_role) |
| `npm run seed` | Populate demo data (service_role) |

## Status (phased delivery)
- **Phase 0 — Foundation:** ✅ scaffold, themed shell (Sidebar/TopBar/Tweaks),
  routing, login + protected routes + session, base schema + RLS.
- **Phase 1 — People & classes (read):** ✅ Dashboard, Kinderen, Ouders, Docenten,
  Leerlingen, Klassen (grid/table) + `leerling_metrics`/`class_metrics` views.
- **Phase 2 — Core workflows:** ⏳ Qur'an auto-next-ayah engine implemented & tested;
  les-administratie / Qur'an-administratie UI pending.
- **Phase 3 — Admissions & finance:** ⏳ schema + finalize RPC ready; UI pending.
- **Phase 4 — Planning, settings, polish:** ⏳ schema (audit log) ready; UI pending.

## Inschrijvingen via formulier (Fillout → webhook)

Externe aanmeldingen (bijv. het Fillout-formulier) komen binnen via de Edge Function
[`supabase/functions/fillout-intake`](supabase/functions/fillout-intake/index.ts).
Die maakt een `enrollment` aan met status **herinschrijving** + twee ouders — exact
de vorm die "Nieuwe aanmelding" in de app produceert (die start op *wachtlijst*),
zodat de kaart meteen op de Klassenindeler/pijplijn verschijnt.

**Deployen** (eenmalig, via de Supabase CLI):
```bash
supabase functions deploy fillout-intake --no-verify-jwt
supabase secrets set FILLOUT_WEBHOOK_SECRET=<kies-een-geheim>
```

**Fillout instellen** (Integrations → Webhook):
- URL: `https://mvgncakgtirtoovgewiw.supabase.co/functions/v1/fillout-intake?secret=<zelfde-geheim>`
- Method `POST`, format JSON.

De functie matcht Fillout-vraaglabels op kolommen via `FIELD_KEYWORDS` bovenin het
bestand (naam kind, leeftijd/geboortejaar, geslacht, traject, voorkeur lesdag, en de
twee ouders). Pas die keywords aan zodra de exacte labels van het formulier bekend
zijn. Het endpoint is publiek maar afgeschermd met het gedeelde secret.

## Google Contacts-synchronisatie

Oudercontacten worden bijgehouden in Google Contacts met een naam die het
schooljaar en de inschrijfstatus toont: **`Mohamed Belbachir AO-26 ✅`**
(⏳ = wachtlijst/intake, ❌ = afgewezen). Het jaartal is het startjaar van het
schooljaar en loopt mee: schrijft een gezin zich opnieuw in, dan wordt AO-25 →
AO-26; doet het niet mee, dan blijft het op het oude jaar staan.

De code is **AO** (Arabisch onderwijs) of **HF** (hifdh). Omdat het contact de
ouder is en een gezin kinderen in beide trajecten kan hebben, wint HF. Alleen
het meest recente schooljaar bepaalt code én markering, zodat een afwijzing van
twee jaar terug het huidige beeld niet stuurt.

[`supabase/functions/google-contacts-sync`](supabase/functions/google-contacts-sync/index.ts)
doet een **volledige reconciliatie**: het vergelijkt de database met Google en
doet het verschil. Daardoor is de run idempotent en zelfherstellend. Matchen
gebeurt op telefoonnummer, genormaliseerd naar E.164, omdat dat het enige veld
is dat betrouwbaar overeenkomt met de handmatige import.

De naam komt uit **onze database** plus het achtervoegsel; de app is de bron van
waarheid. Eerst wordt gekeken naar het tabblad **Ouders** (`ouders`), met
terugval op de aanmelding (`enrollment_parents`) voor gezinnen die nog niet
definitief zijn — `finalize_enrollment()` kopieert de een naar de ander, dus voor
definitieve leerlingen bestaan beide en wint wat je in de app beheert. Delen twee
ouders één telefoonnummer, dan wint het primaire contact. Een naam die in Google
is aangepast wordt bij de volgende sync overschreven. Een bestaand achtervoegsel
wordt er altijd eerst
afgehaald — ook als het in Google een náámcomponent op zichzelf is
(`familyName = "AO-25"`), zoals de oude import het soms opsloeg — zodat jaartallen
nooit stapelen tot `AO-25 AO-26 ✅`.

**Samenvoegen.** De import van vorig jaar maakte per schooljaar een aparte
kaart, dus dezelfde ouder staat er als `AO-23`, `AO-24` én `AO-25` in met
hetzelfde nummer. De sync brengt die terug tot één contact: het nieuwste blijft
(bij gelijk jaar het rijkst gevulde), de gegevens van de andere — extra nummers,
e-mailadressen, adressen, notities — worden erin getrokken en die andere worden
verwijderd. Verwijderen gebeurt pas **nadat** het samenvoegen is gelukt, en
verwijderde contacten staan nog 30 dagen in de prullenbak van Google Contacts.
Uit te zetten met de schakelaar *Dubbele contacten samenvoegen*; dan worden zulke
nummers overgeslagen en als conflict gemeld.

De naamlogica staat los in [`contactName.ts`](supabase/functions/google-contacts-sync/contactName.ts)
en is gedekt door 43 tests — dit is het stuk dat bij een fout honderden
contacten tegelijk zou verminken.

**Draaien**: Instellingen → Google Contacts. Eerst *Controleren* (dry-run,
schrijft niets), dan pas *Doorvoeren*. Nieuwe aanmeldingen via het formulier
triggeren de sync automatisch. Elke run wordt vastgelegd in
`google_contact_sync_runs`.

**Deployen + secrets**:
```bash
supabase functions deploy google-contacts-sync
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
```
Het refresh-token hoort bij het Google-account waar de contacten op staan.
Haal het op via de OAuth Playground **met "Use your own OAuth credentials"
aangevinkt** (anders trekt Google het na 24 uur in) en zet het OAuth consent
screen op *In production* (bij *Testing* verloopt het token na 7 dagen).

## Gebruikersbeheer & rollen (admins + docenten)

In **Instellingen → Gebruikersbeheer** kan een admin gebruikers toevoegen en
verwijderen. Twee rollen:

- **Admin** — volledige toegang (zoals nu).
- **Docent** — gekoppeld aan precies één klas; ziet en beheert **alleen die klas**
  (les- en Qur'an-administratie, lessen, leerlingen). Afgedwongen op de database via
  RLS (`current_class_id()` + `docent_*`-policies in migratie `014`).

Bij toevoegen vul je **naam, e-mailadres en (voor docenten) de klas** in. De
gebruiker krijgt automatisch een **"stel je wachtwoord"-e-mail** (recovery-flow,
géén magic link) en kiest zelf een wachtwoord via `/wachtwoord-herstellen`.

**Eenmalig deployen:**

1. **Migratie toepassen** — open de Supabase **SQL editor** en run
   `supabase/migrations/014_user_management.sql` (of de bijgewerkte
   `supabase/apply_all.sql`). Voegt de `docent`-rol, `profiles.class_id`/`email`
   en de docent-RLS toe. *(Re-runnable.)*

2. **Edge Function deployen** (service_role — server-side, nooit in de browser):
   ```bash
   supabase functions deploy manage-users
   ```
   `verify_jwt` blijft aan; de functie controleert zelf dat de aanroeper een admin is.
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` worden
   automatisch door de Edge runtime geïnjecteerd — geen extra secrets nodig.

3. **Auth e-mail** — zorg dat in Supabase → **Auth → URL Configuration** de
   **Site URL** + redirect-URLs het deploy-adres bevatten, zodat de wachtwoord-link
   naar `/wachtwoord-herstellen` werkt. De mailtekst pas je aan onder
   **Auth → Email Templates → Reset Password**.

## Deployen (gratis, stabiel)

De frontend is een statische Vite-build (`npm run build` → `dist/`). Hosten kan
gratis op Vercel, Netlify of Cloudflare Pages — allemaal met een vast HTTPS-adres,
geen eigen domein nodig.

**Aanbevolen: Vercel**
1. Push deze repo naar GitHub (privé). `.env` staat in `.gitignore` — niet committen.
2. vercel.com → *Add New Project* → importeer de repo (framework: **Vite**, auto-detected).
3. Zet bij **Environment Variables** (Build):
   - `VITE_SUPABASE_URL` = `https://mvgncakgtirtoovgewiw.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (de anon key)
   - **NIET** de service_role key toevoegen.
4. Deploy → je krijgt `https://<jouw-app>.vercel.app`.

`vercel.json` (en `public/_redirects` voor Netlify/Cloudflare) zorgt dat client-side
routing werkt (alle paden → `index.html`). Inloggen werkt vanaf elk adres; voor
e-mailbevestiging/magic links later: zet de **Site URL** in Supabase → Auth op het
deploy-adres.

## Security notes
- RLS is enabled on every table; access is gated to authenticated admins via
  `public.is_admin()`. `audit_log` is insert+select only (immutable).
- The frontend bundles only the anon key. Protected routes redirect to `/login`.
- Rotate the service_role key before launch.
