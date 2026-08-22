import { describe, expect, it } from "vitest";
import { buildWeeks, monthSpansOf, packLanes, mondayOf, parseIso, isoLocal, missingTeacher } from "./jaarlijnWeken";
import type { YearLesson } from "@/data/planning";

const lesson = (p: Partial<YearLesson> = {}): YearLesson => ({
  id: "l1", class_id: "c1", date: "2025-09-06", week_nr: 1, type: "les", topic: null,
  teacher_id: null, quran_teacher_id: null, teacher_na: false, quran_na: false, ...p,
});

describe("mondayOf / isoLocal", () => {
  it("brengt elke dag terug naar de maandag van die week", () => {
    // 8 sep 2025 is een maandag; de hele week moet daarop uitkomen.
    for (const d of ["2025-09-08", "2025-09-09", "2025-09-13", "2025-09-14"]) {
      expect(isoLocal(mondayOf(parseIso(d)))).toBe("2025-09-08");
    }
    expect(isoLocal(mondayOf(parseIso("2025-09-15")))).toBe("2025-09-15");
  });

  it("houdt een zondag bij de week die er maandag voor begon", () => {
    expect(isoLocal(mondayOf(parseIso("2025-09-07")))).toBe("2025-09-01");
  });

  it("verschuift niet over een tijdzonegrens heen", () => {
    // Rond de zomertijdovergang schuift toISOString() een dag; dit mag niet.
    expect(isoLocal(parseIso("2026-03-29"))).toBe("2026-03-29");
    expect(isoLocal(parseIso("2025-10-26"))).toBe("2025-10-26");
    expect(isoLocal(mondayOf(parseIso("2026-03-29")))).toBe("2026-03-23");
  });
});

describe("buildWeeks", () => {
  it("dekt een heel schooljaar met opeenvolgende weken", () => {
    const weeks = buildWeeks("2025-09-06", "2026-07-05");
    expect(weeks.length).toBe(44);
    expect(weeks[0].start).toBe("2025-09-01");
    expect(weeks[0].end).toBe("2025-09-07");
    expect(weeks[weeks.length - 1].start).toBe("2026-06-29");
    // Elke week begint precies zeven dagen na de vorige.
    for (let i = 1; i < weeks.length; i++) {
      const gap = (parseIso(weeks[i].start).getTime() - parseIso(weeks[i - 1].start).getTime()) / 864e5;
      expect(Math.round(gap)).toBe(7);
    }
  });

  it("geeft niets terug bij ontbrekende of omgekeerde datums", () => {
    expect(buildWeeks(null, "2026-07-05")).toEqual([]);
    expect(buildWeeks("2025-09-06", null)).toEqual([]);
    expect(buildWeeks("2026-07-05", "2025-09-06")).toEqual([]);
  });

  it("zet de jaargrens in het label van januari", () => {
    const weeks = buildWeeks("2025-12-01", "2026-01-31");
    const jan = weeks.find((w) => w.monthLabel.startsWith("jan"));
    expect(jan?.monthLabel).toBe("jan '26");
    expect(weeks[0].monthLabel).toBe("dec");
  });

  it("hangt een week aan de maand van zijn donderdag", () => {
    // Week van ma 29 sep t/m zo 5 okt: donderdag valt in oktober.
    const weeks = buildWeeks("2025-09-29", "2025-09-29");
    expect(weeks[0].start).toBe("2025-09-29");
    expect(weeks[0].monthLabel).toBe("okt");
  });
});

describe("monthSpansOf", () => {
  it("voegt opeenvolgende weken van dezelfde maand samen", () => {
    const spans = monthSpansOf(buildWeeks("2025-09-06", "2026-07-05"));
    expect(spans.map((s) => s.label)).toEqual(
      ["sep", "okt", "nov", "dec", "jan '26", "feb", "mrt", "apr", "mei", "jun", "jul"],
    );
    // Alle weken zitten in precies één maandblok.
    expect(spans.reduce((n, s) => n + s.span, 0)).toBe(44);
  });
});

describe("packLanes", () => {
  const weeks = buildWeeks("2025-09-01", "2026-06-28");
  const p = (name: string, start_date: string, end_date: string) => ({ name, start_date, end_date });

  it("zet periodes die elkaar niet raken op dezelfde baan", () => {
    const lanes = packLanes([p("Herfst", "2025-10-18", "2025-10-26"), p("Kerst", "2025-12-20", "2026-01-04")], weeks);
    expect(lanes.length).toBe(1);
    expect(lanes[0].map((s) => s.item.name)).toEqual(["Herfst", "Kerst"]);
  });

  it("schuift een overlappende periode naar een tweede baan", () => {
    const lanes = packLanes([p("Ramadan", "2026-02-17", "2026-03-19"), p("Suikerfeest", "2026-03-18", "2026-03-21")], weeks);
    expect(lanes.length).toBe(2);
    expect(lanes[0][0].item.name).toBe("Ramadan");
    expect(lanes[1][0].item.name).toBe("Suikerfeest");
  });

  it("laat periodes buiten het bereik weg", () => {
    expect(packLanes([p("Vorig jaar", "2024-01-01", "2024-01-08")], weeks)).toEqual([]);
  });

  it("beslaat de kolommen waarin de periode valt", () => {
    const [lane] = packLanes([p("Herfst", "2025-10-18", "2025-10-26")], weeks);
    const { from, to } = lane[0];
    // 18 okt is een zaterdag, 26 okt een zondag: twee kalenderweken.
    expect(weeks[from].start).toBe("2025-10-13");
    expect(weeks[to].start).toBe("2025-10-20");
  });

  it("geeft niets terug zonder weken", () => {
    expect(packLanes([p("Herfst", "2025-10-18", "2025-10-26")], [])).toEqual([]);
  });
});

describe("missingTeacher", () => {
  it("meldt een les zonder docenten", () => {
    expect(missingTeacher(lesson(), "regulier")).toBe(true);
  });

  it("telt 'niet nodig' als ingevuld", () => {
    expect(missingTeacher(lesson({ teacher_na: true, quran_na: true }), "regulier")).toBe(false);
  });

  it("vraagt bij hifdh geen Qur'an-docent", () => {
    expect(missingTeacher(lesson({ teacher_id: "t1" }), "hifdh")).toBe(false);
    expect(missingTeacher(lesson({ teacher_id: "t1" }), "regulier")).toBe(true);
  });

  it("kijkt alleen naar echte lessen", () => {
    for (const type of ["vrij", "toets", "activiteit"]) {
      expect(missingTeacher(lesson({ type }), "regulier")).toBe(false);
    }
  });
});
