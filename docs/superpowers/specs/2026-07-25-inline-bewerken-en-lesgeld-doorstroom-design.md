# Inline bewerken (ouders & kinderen) + lesgeld-doorstroom inschrijving → leerling

Datum: 2026-07-25

## Aanleiding

Twee losse wensen die in dezelfde tabellen samenkomen:

1. Ouders en kinderen moeten rechtstreeks in de tabel bewerkt kunnen worden, zonder
   eerst naar het detailscherm te navigeren.
2. Een betaling die bij een inschrijving is vastgelegd komt niet aan bij de leerling.
   Concreet: €210 betaald ingevoerd in het inschrijvings-zijpaneel, inschrijving
   definitief gemaakt, maar het Leerlingen-overzicht toont nog €210 verschuldigd en
   de leerlingpagina toont "Voldaan €0".

## Root cause van de financiën-bug

Er bestaan twee financiële administraties die nergens met elkaar praten:

| Administratie | Opslag | Gelezen door |
| --- | --- | --- |
| Inschrijving | `enrollment_placements.lesgeld_bedrag` (betaald) en `lesgeld_verschuldigd` (te betalen) | `EnrollmentSheet` |
| Leerling | tabel `payments` (per leerling) | `LeerlingDetail`, Financiën, Dashboard |

`finalize_enrollment()` (migratie 008) kopieert niets financieels. `Klassenindeler.doFinalize`
kopieert alleen `lesgeld_verschuldigd` naar `leerlingen.lesgeld_override`. Het betaalde
bedrag wordt dus nooit een `payments`-regel — vandaar "Voldaan €0".

Daarnaast toont de kolom "Verschuldigd" in het Leerlingen-overzicht het *jaarbedrag*
volgens de staffel, niet het openstaande saldo. Ook mét een geregistreerde betaling zou
die kolom €210 blijven tonen. Hetzelfde woord betekent in het zijpaneel iets anders
("Verschuldigd (openstaand)" = te betalen − betaald).

## Deel A — De leerling wordt de financiële bron

### Databasewijziging (migratie 020, handmatig toe te passen)

- `payments` krijgt een nullable `placement_id` met een foreign key naar
  `enrollment_placements(id)` en een unieke index. Dat is dé *inschrijvingsbetaling*
  van een leerling: hoogstens één per plaatsing.
- `finalize_enrollment()` maakt bij definitief inschrijven een `payments`-regel aan
  wanneer `lesgeld_bedrag` gevuld en groter dan nul is: omschrijving
  "Lesgeld inschrijving", status `paid`, datum vandaag, gekoppeld via `placement_id`.
  De functie blijft idempotent — bestaat de regel al, dan gebeurt er niets.
- Backfill voor bestaande definitieve plaatsingen met een betaald bedrag maar zonder
  gekoppelde betaalregel, zodat al ingevoerde bedragen met terugwerkende kracht kloppen.

`enrollment_placements.lesgeld_bedrag` blijft bestaan als opslag vóór finalisatie en als
historische vastlegging; na finalisatie is de `payments`-regel leidend.

### Zijpaneel inschrijving

Zolang er nog geen leerling is (`placement.leerling_id` is leeg) verandert er niets:
"Te betalen" en "Betaald" schrijven naar de plaatsing.

Zodra er een leerling is:

- **Betaald** leest en schrijft de aan de plaatsing gekoppelde `payments`-regel. Bestaan
  er meer betalingen op de leerling, dan verschijnt eronder "Totaal voldaan op de
  leerling: €X". Verdere termijnen registreer je op de leerlingpagina.
- **Te betalen** schrijft naar `leerlingen.lesgeld_override`, met het staffelbedrag als
  standaard. Gelijk aan de staffel betekent geen override. Dit is dezelfde bron als de
  Leerlingen-tabel gebruikt, waar het zijpaneel nu nog van afwijkt.
- **Verschuldigd (openstaand)** = te betalen − totaal voldaan op de leerling.

### Leerlingen-tabel

Drie financiële kolommen in plaats van één:

| Kolom | Betekenis | Bewerkbaar |
| --- | --- | --- |
| Verschuldigd | jaarbedrag volgens staffel of override | ja (zoals nu) |
| Betaald | som van de `paid`-betalingen van die leerling | nee |
| Open | verschuldigd − betaald, met ✓/⚠ badge | nee |

### Gedeelde afleidingen

Twee stukken logica komen op één plek te staan zodat tabel en zijpaneel gegarandeerd
hetzelfde rekenen:

- `usePaymentsByLeerling(schooljaarId)` — som van betaald en openstaand per leerling.
- `useResolvedTuition(schooljaarId)` — wikkelt de bestaande pure `resolveTuition` in de
  drie queries die hij nodig heeft (leerlingen, gezinsrelaties, staffels).

De Financiën-pagina en het dashboard tellen al op uit `payments` en pikken de
inschrijvingsbetalingen daarmee automatisch op.

## Deel B — Bewerkmodus in Ouders & Kinderen

Rechtsboven in de tabel komt een knop **Bewerken**. Die zet de hele tabel in bewerkmodus
en verandert zelf in **Klaar**. Elke bewerkbare cel wordt een invoerveld dat automatisch
opslaat zodra je het veld verlaat (of, bij een dropdown, bij wijziging) — hetzelfde
patroon als de lesgeld-kolom in Leerlingen en het inschrijvings-zijpaneel. In bewerkmodus
is doorklikken naar het detailscherm uitgeschakeld, zodat een klik in een veld niet
wegnavigeert.

Bewerkbare velden:

- **Ouders**: naam, rol (dropdown Vader/Moeder/Voogd), telefoon, e-mail, bereikbaarheid.
  De kolom Kinderen blijft alleen-lezen; koppelen gebeurt op het detailscherm.
- **Kinderen**: voornaam en achternaam als twee aparte velden (`full_name` is een
  berekende kolom), geslacht (dropdown), geboortejaar. Bij een naamswijziging worden de
  initialen opnieuw afgeleid, net als bij het aanmaken van een kind. Klas en Ouders
  blijven alleen-lezen.

Twee nieuwe mutaties in `src/data/people.ts`: `useUpdateOuder` en `useUpdateKind`. Beide
schrijven alleen wanneer de waarde daadwerkelijk veranderde en melden een fout via een
toast.

## Buiten scope

- Betalingstermijnen beheren vanuit het inschrijvings-zijpaneel.
- Ouder↔kind-koppelingen bewerken vanuit de tabel.
- Bewerkmodus in andere tabellen dan Ouders en Kinderen.
