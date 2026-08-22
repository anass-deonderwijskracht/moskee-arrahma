import type { YearLesson } from "@/data/planning";

/* Rekenwerk achter de jaarlijn: weken, maandkoppen en de banen waarop
   vakanties getekend worden. Los van de component zodat het te testen is. */

export const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO-datum uit lokale datumdelen — toISOString() kan een dag verschuiven. */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' als lokale datum lezen, zodat er geen tijdzone tussen komt. */
export const parseIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
};
export const dagMaand = (s: string) => { const d = parseIso(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export interface Week { idx: number; start: string; end: string; monthKey: string; monthLabel: string }

/** Vangnet: een schooljaar duurt nooit meer dan ~53 weken. */
const MAX_WEEKS = 80;

/** Alle maandag-tot-zondag weken tussen twee datums, van links naar rechts. */
export function buildWeeks(rangeStart: string | null, rangeEnd: string | null): Week[] {
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];
  const first = mondayOf(parseIso(rangeStart));
  const last = mondayOf(parseIso(rangeEnd));
  const out: Week[] = [];
  for (let d = first, i = 0; d <= last && i < MAX_WEEKS; d = addDays(d, 7), i++) {
    // ISO-conventie: een week hoort bij de maand van zijn donderdag.
    const thu = addDays(d, 3);
    out.push({
      idx: i,
      start: isoLocal(d),
      end: isoLocal(addDays(d, 6)),
      monthKey: `${thu.getFullYear()}-${thu.getMonth()}`,
      // Januari krijgt het jaartal erbij; anders zie je de jaargrens niet.
      monthLabel: MONTHS[thu.getMonth()] + (thu.getMonth() === 0 ? ` '${String(thu.getFullYear()).slice(2)}` : ""),
    });
  }
  return out;
}

/** Opeenvolgende weken van dezelfde maand vormen samen één kop. */
export function monthSpansOf(weeks: Week[]): { key: string; label: string; span: number }[] {
  const out: { key: string; label: string; span: number }[] = [];
  for (const w of weeks) {
    const last = out[out.length - 1];
    if (last && last.key === w.monthKey) last.span++;
    else out.push({ key: w.monthKey, label: w.monthLabel, span: 1 });
  }
  return out;
}

export interface Span<T> { item: T; from: number; to: number }

/**
 * Verdeelt periodes over banen zodat twee vakanties die elkaar overlappen
 * nooit op dezelfde regel botsen. Periodes buiten het bereik vallen weg.
 */
export function packLanes<T extends { start_date: string; end_date: string }>(
  items: T[], weeks: Week[],
): Span<T>[][] {
  const spans = items
    .map((item) => {
      let from = -1, to = -1;
      for (const w of weeks) {
        if (w.end >= item.start_date && w.start <= item.end_date) { if (from < 0) from = w.idx; to = w.idx; }
      }
      return from < 0 ? null : { item, from, to };
    })
    .filter((x): x is Span<T> => x !== null)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const lanes: Span<T>[][] = [];
  for (const s of spans) {
    const lane = lanes.find((l) => l[l.length - 1].to < s.from);
    if (lane) lane.push(s); else lanes.push([s]);
  }
  return lanes;
}

/** Mist deze les nog een docent? "Niet nodig" telt als ingevuld — net als in het rooster. */
export const missingTeacher = (l: YearLesson, track: string) =>
  l.type === "les" && ((!l.teacher_id && !l.teacher_na) || (track !== "hifdh" && !l.quran_teacher_id && !l.quran_na));
