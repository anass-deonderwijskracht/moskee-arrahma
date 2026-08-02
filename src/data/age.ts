/**
 * Leeftijd bepalen. Twee bronnen, met verschillende betrouwbaarheid:
 *
 *  - `birthdate` (volledige datum) geeft de exacte leeftijd.
 *  - `birth_year` alleen kan dat principieel niet: iemand die in oktober 2020
 *    is geboren is in juli 2026 nog 5, maar `jaar - geboortejaar` zegt 6. Het
 *    antwoord is dan een schatting die tot de verjaardag één jaar te hoog is.
 *
 * Gebruik daarom `age()` overal waar een leeftijd wordt getoond, zodat de
 * volledige datum wint zodra die bekend is.
 */

/** Exacte leeftijd in jaren op `today` (default: nu). Null bij een lege datum. */
export function ageFromBirthdate(birthdate: string | null | undefined, today = new Date()): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  let years = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  // Verjaardag nog niet geweest dit jaar? Dan één jaar eraf.
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) years--;
  return years < 0 ? null : years;
}

/** Schatting op basis van alleen het geboortejaar — tot de verjaardag 1 te hoog. */
export function ageFromBirthYear(birthYear: number | null | undefined, today = new Date()): number | null {
  if (!birthYear) return null;
  return today.getFullYear() - birthYear;
}

/** Leeftijd uit de beste beschikbare bron: volledige datum boven geboortejaar. */
export function age(
  src: { birthdate?: string | null; birth_year?: number | null },
  today = new Date(),
): number | null {
  return ageFromBirthdate(src.birthdate, today) ?? ageFromBirthYear(src.birth_year, today);
}

/** True als de leeftijd een schatting is (alleen geboortejaar bekend). */
export function isEstimated(src: { birthdate?: string | null; birth_year?: number | null }): boolean {
  return !src.birthdate && !!src.birth_year;
}

/** "8 jr" of "—". `approx` zet er een ± voor als het een schatting is. */
export function ageLabel(
  src: { birthdate?: string | null; birth_year?: number | null },
  { approx = false, unit = "jr" }: { approx?: boolean; unit?: "jr" | "jaar" } = {},
): string {
  const a = age(src);
  if (a == null) return "—";
  return `${approx && isEstimated(src) ? "±" : ""}${a} ${unit}`;
}

/** Geboortejaar uit een volledige datum — voor opslag naast de datum zelf. */
export function birthYearOf(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const y = parseInt(birthdate.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}
