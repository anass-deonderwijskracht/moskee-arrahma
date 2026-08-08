// ============================================================================
// Naamconventie voor Google Contacts.
//
// Een oudercontact heet "<naam> <CODE>-<JJ> <markering>", bijvoorbeeld
// "Mohamed Belbachir AO-26 ✅". Het jaartal is het startjaar van het schooljaar
// waarvoor het kind staat ingeschreven en loopt dus mee: schrijft een gezin zich
// opnieuw in voor 2026/27, dan wordt AO-25 → AO-26. Doet een gezin niet mee, dan
// blijft het op het oude jaar staan — precies het signaal dat je wilt zien.
//
// We "bezitten" alleen het achtervoegsel, nooit de hele naam: bij het bijwerken
// strippen we een bestaand achtervoegsel en plakken het nieuwe erachter, zodat
// handmatige naamcorrecties in Google blijven staan.
//
// Geen Deno-specifieke code hier: index.ts importeert dit bestand en vitest test
// het rechtstreeks. Het staat bewust ín de function-map en niet in een gedeelde
// _shared-map: bij deployen wordt alleen de map van de function zelf gebundeld,
// dus een import van buiten die map faalt met "Module not found".
// ============================================================================

/** Statussen uit de inschrijvingspijplijn. */
export type EnrollStatus =
  | "herinschrijving" | "wachtlijst" | "intake" | "toegezegd" | "definitief" | "afgewezen";

export const MARKER_OK = "✅";
export const MARKER_PENDING = "⏳";
export const MARKER_REJECTED = "❌";

/** Alle markeringen die we herkennen en dus mogen strippen. */
export const MARKERS = [MARKER_OK, MARKER_PENDING, MARKER_REJECTED] as const;
export type Marker = (typeof MARKERS)[number];

const STATUS_MARKER: Record<EnrollStatus, Marker> = {
  definitief: MARKER_OK,
  toegezegd: MARKER_OK,
  herinschrijving: MARKER_PENDING,
  wachtlijst: MARKER_PENDING,
  intake: MARKER_PENDING,
  afgewezen: MARKER_REJECTED,
};

/** Volgorde waarin statussen "winnen" als een ouder meerdere kinderen heeft. */
const MARKER_RANK: Record<Marker, number> = { [MARKER_OK]: 0, [MARKER_PENDING]: 1, [MARKER_REJECTED]: 2 };

export function statusMarker(status: string): Marker {
  return STATUS_MARKER[status as EnrollStatus] ?? MARKER_PENDING;
}

/**
 * De markering voor een ouder met meerdere kinderen: één geaccepteerd kind maakt
 * de ouder actief, ook als een ander kind is afgewezen.
 */
export function bestMarker(statuses: string[]): Marker {
  if (!statuses.length) return MARKER_PENDING;
  return statuses
    .map(statusMarker)
    .reduce((best, m) => (MARKER_RANK[m] < MARKER_RANK[best] ? m : best));
}

/** Trajectcode in de contactnaam: AO = Arabisch onderwijs, HF = hifdh. */
export const CODE_REGULIER = "AO";
export const CODE_HIFDH = "HF";

export function trackCode(track: string | null | undefined): string {
  return String(track ?? "").toLowerCase() === "hifdh" ? CODE_HIFDH : CODE_REGULIER;
}

/**
 * De code voor een ouder met meerdere kinderen. Hifdh wint: heeft één kind het
 * hifdh-traject, dan is dat het onderscheidende gegeven bij dat gezin.
 */
export function bestCode(tracks: string[]): string {
  return tracks.some((t) => trackCode(t) === CODE_HIFDH) ? CODE_HIFDH : CODE_REGULIER;
}

/** "y2026" of "2026/27" of 2026 → 26 (tweecijferig startjaar). */
export function yearSuffix(schooljaar: string | number): number | null {
  const m = String(schooljaar).match(/(\d{4})/);
  if (!m) return null;
  return Number(m[1]) % 100;
}

export interface ParsedName {
  /** De menselijke naam, zonder achtervoegsel. */
  base: string;
  code: string | null;
  year: number | null;
  marker: Marker | null;
}

const MARKER_SET: string[] = [...MARKERS];
// Variatieselector (U+FE0F) mag achter een emoji staan; die strippen we mee.
const VS16 = "️";
// Het achtervoegsel mag ook een náámcomponent in z'n geheel zijn: de import van
// vorig jaar zette bij sommige contacten familyName = "AO-25". Vandaar `^|\s`.
// Vier cijfers ("AO-2025") accepteren we ook; we houden de laatste twee aan.
const CODE_RE = /(?:^|\s)([A-Za-z]{2,4})-(\d{4}|\d{2})$/;

/**
 * Haalt het achtervoegsel van een bestaande contactnaam af. Strip herhaaldelijk
 * van achteren, zodat ook dubbel toegepaste namen ("… AO-25 ✅ AO-26 ✅")
 * netjes worden opgeschoond en de functie idempotent blijft.
 */
export function parseContactName(display: string): ParsedName {
  let rest = (display ?? "").replace(/\s+/g, " ").trim();
  let code: string | null = null;
  let year: number | null = null;
  let marker: Marker | null = null;

  for (;;) {
    let stripped = false;

    for (const mk of MARKER_SET) {
      for (const variant of [mk + VS16, mk]) {
        if (rest.endsWith(variant)) {
          // De buitenste (laatst toegepaste) markering is de actuele.
          if (marker === null) marker = mk as Marker;
          rest = rest.slice(0, -variant.length).trimEnd();
          stripped = true;
          break;
        }
      }
      if (stripped) break;
    }
    if (stripped) continue;

    const m = rest.match(CODE_RE);
    if (m) {
      if (code === null) { code = m[1].toUpperCase(); year = Number(m[2]) % 100; }
      rest = rest.slice(0, m.index).trimEnd();
      continue;
    }
    break;
  }

  return { base: rest, code, year, marker };
}

/** Plakt het achtervoegsel achter een schone naam. */
export function buildContactName(base: string, code: string, year: number, marker: Marker): string {
  const clean = (base ?? "").replace(/\s+/g, " ").trim();
  const yy = String(((year % 100) + 100) % 100).padStart(2, "0");
  return `${clean} ${code.toUpperCase()}-${yy} ${marker}`.trim();
}

/**
 * Werkt een bestaande contactnaam bij: bestaand achtervoegsel eraf, nieuw erop.
 * Idempotent — twee keer toepassen geeft hetzelfde resultaat.
 */
export function applyContactName(
  currentDisplay: string, opts: { code: string; year: number; marker: Marker },
): string {
  const { base } = parseContactName(currentDisplay);
  return buildContactName(base, opts.code, opts.year, opts.marker);
}

export interface PrimaryCandidate {
  /** Weergavenaam, waaruit we het jaartal van het achtervoegsel lezen. */
  name: string;
  /** Hoeveel velden er gevuld zijn (e-mail, adres, notitie, …). */
  richness: number;
}

/**
 * Welk van meerdere contacten met hetzelfde nummer we behouden bij samenvoegen.
 *
 * De handmatige import maakte per schooljaar een apart contact, dus dezelfde
 * ouder staat er als AO-23, AO-24 én AO-25 in. We houden het **nieuwste** jaar
 * aan; bij gelijkspel (of als geen enkel contact een jaartal heeft) het contact
 * met de meeste ingevulde velden, zodat we zo min mogelijk gegevens kwijtraken.
 * Blijft het gelijk, dan wint de eerste — de volgorde die Google teruggeeft.
 */
export function pickPrimaryIndex(candidates: PrimaryCandidate[]): number {
  let best = 0;
  let bestYear = parseContactName(candidates[0]?.name ?? "").year ?? -1;
  for (let i = 1; i < candidates.length; i++) {
    const year = parseContactName(candidates[i].name).year ?? -1;
    if (year > bestYear || (year === bestYear && candidates[i].richness > candidates[best].richness)) {
      best = i;
      bestYear = year;
    }
  }
  return best;
}

export interface NameParts { givenName: string; middleName: string; familyName: string; }

/** Haalt een achtervoegsel uit één losse naamcomponent. */
function stripPart(part: string): string {
  return parseContactName(part ?? "").base;
}

/**
 * Zet het achtervoegsel op de juiste naamcomponent.
 *
 * De People API negeert `displayName` bij het schrijven — je moet givenName /
 * familyName zetten. Waar de handmatige import het achtervoegsel heeft gestopt
 * weten we niet (soms is een hele component ván het achtervoegsel), dus: strip
 * het uit álle componenten en plak het daarna achter de laatste gevulde
 * component (familyName, anders middleName, anders givenName).
 *
 * Blijft er na het strippen niets over — bijvoorbeeld een contact dat alleen
 * "AO-25" heette — dan valt hij terug op `fallback`, zodat we nooit een naamloos
 * contact overhouden.
 */
export function applyToNameParts(
  parts: Partial<NameParts>,
  opts: { code: string; year: number; marker: Marker },
  fallback?: Partial<NameParts>,
): NameParts {
  let given = stripPart(parts.givenName ?? "");
  let middle = stripPart(parts.middleName ?? "");
  let family = stripPart(parts.familyName ?? "");

  if (!given && !middle && !family && fallback) {
    given = stripPart(fallback.givenName ?? "");
    middle = stripPart(fallback.middleName ?? "");
    family = stripPart(fallback.familyName ?? "");
  }

  const yy = String(((opts.year % 100) + 100) % 100).padStart(2, "0");
  const suffix = `${opts.code.toUpperCase()}-${yy} ${opts.marker}`;

  if (family) return { givenName: given, middleName: middle, familyName: `${family} ${suffix}` };
  if (middle) return { givenName: given, middleName: `${middle} ${suffix}`, familyName: "" };
  return { givenName: `${given} ${suffix}`.trim(), middleName: "", familyName: "" };
}

/** De naam zoals Google 'm zou tonen — om het plan in de dry-run te laten zien. */
export function joinNameParts(parts: Partial<NameParts>): string {
  return [parts.givenName, parts.middleName, parts.familyName]
    .map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
}

/**
 * Telefoonnummer naar E.164, het enige veld waarop we betrouwbaar kunnen
 * matchen met de handmatig geïmporteerde contacten. Null als het onbruikbaar is.
 */
export function normalizePhone(raw: string | null | undefined, country = "31"): string | null {
  if (!raw) return null;
  // Alles behalve cijfers en een leidende + eruit (spaties, streepjes, haakjes).
  let s = String(raw).trim().replace(/[^\d+]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = country + s.slice(1);
  else if (!s.startsWith(country)) s = country + s;

  // NL-mobiel/vast is 11 cijfers inclusief landcode; buitenlands laten we ruimer.
  if (s.length < 8 || s.length > 15) return null;
  return "+" + s;
}
