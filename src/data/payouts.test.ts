import { describe, it, expect } from "vitest";
import { buildPayoutOverview, type PayoutLesson, type TeacherPayout } from "./payouts";
import type { Teacher } from "./people";

const teacher = (id: string, name: string, uurtarief: number | null): Teacher =>
  ({
    id, name, short: name.slice(0, 2), email: null, phone: null, joined: null,
    specialty: null, role: "les", uurtarief, created_at: "2026-01-01T00:00:00Z",
  });

/** Les op `date` van 09:30-11:30 (= 2 uur), met de opgegeven docenten. */
const les = (date: string, teacherId: string | null, quranId: string | null = null, time = "09:30 - 11:30"): PayoutLesson =>
  ({ date, teacher_id: teacherId, quran_teacher_id: quranId, classes: { time } });

const payout = (teacherId: string, period: string, over: Partial<TeacherPayout> = {}): TeacherPayout =>
  ({
    id: "p-" + teacherId + "-" + period, teacher_id: teacherId, schooljaar_id: "sj", period,
    lessons: 2, hours: 4, rate: 30, amount: 120, paid_at: "2026-09-30T12:00:00Z", note: null,
    created_at: "2026-09-30T12:00:00Z", ...over,
  });

const A = teacher("a", "Aisha", 30);
const B = teacher("b", "Bilal", 25);

describe("buildPayoutOverview", () => {
  it("groepeert per kalendermaand en rekent uren × uurtarief", () => {
    const res = buildPayoutOverview([A, B], [
      les("2026-09-05", "a"),
      les("2026-09-12", "a"),
      les("2026-10-03", "b"),
    ], []);

    expect(res.months.map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
    const sept = res.months[0];
    expect(sept.rows).toHaveLength(1);
    expect(sept.rows[0]).toMatchObject({ lessons: 2, hours: 4, amount: 120 });
    expect(res.months[1].rows[0]).toMatchObject({ lessons: 1, hours: 2, amount: 50 });
    expect(res.total).toBe(170);
    expect(res.openTotal).toBe(170);
    expect(res.paidTotal).toBe(0);
  });

  it("telt les- én Qur'an-toewijzing van dezelfde les allebei mee", () => {
    const res = buildPayoutOverview([A, B], [les("2026-09-05", "a", "b")], []);
    const rows = res.months[0].rows;
    expect(rows.map((r) => r.teacher.id)).toEqual(["a", "b"]); // gesorteerd op naam
    expect(rows[0]).toMatchObject({ lessons: 1, hours: 2 });
    expect(rows[1]).toMatchObject({ lessons: 1, hours: 2 });
  });

  it("telt dezelfde docent dubbel als hij beide rollen op één les heeft", () => {
    const res = buildPayoutOverview([A], [les("2026-09-05", "a", "a")], []);
    expect(res.months[0].rows[0]).toMatchObject({ lessons: 2, hours: 4, amount: 120 });
  });

  it("gebruikt het vastgelegde snapshot voor uitbetaalde maanden, niet het live tarief", () => {
    const res = buildPayoutOverview(
      [teacher("a", "Aisha", 40)], // tarief inmiddels verhoogd naar 40
      [les("2026-09-05", "a"), les("2026-09-12", "a")],
      [payout("a", "2026-09-01")], // uitbetaald tegen 30 = 120
    );
    const row = res.months[0].rows[0];
    expect(row.payout?.amount).toBe(120);
    expect(row.drifted).toBe(true); // live zou nu 160 zijn
    expect(res.paidTotal).toBe(120);
    expect(res.openTotal).toBe(0);
    expect(res.months[0].openCount).toBe(0);
  });

  it("markeert niet als gewijzigd zolang snapshot en planning gelijk zijn", () => {
    const res = buildPayoutOverview([A], [les("2026-09-05", "a"), les("2026-09-12", "a")], [payout("a", "2026-09-01")]);
    expect(res.months[0].rows[0].drifted).toBe(false);
  });

  it("houdt een uitbetaalde maand zichtbaar als de planning intussen is leeggehaald", () => {
    const res = buildPayoutOverview([A], [], [payout("a", "2026-09-01")]);
    expect(res.months).toHaveLength(1);
    expect(res.months[0].rows[0]).toMatchObject({ lessons: 0, hours: 0 });
    expect(res.paidTotal).toBe(120);
  });

  it("rekent zonder uurtarief met 0 en laat dat zien via rate null", () => {
    const res = buildPayoutOverview([teacher("c", "Chaima", null)], [les("2026-09-05", "c")], []);
    expect(res.months[0].rows[0]).toMatchObject({ rate: null, hours: 2, amount: 0 });
  });

  it("telt onparsebare lestijden als 0 uur", () => {
    const res = buildPayoutOverview([A], [les("2026-09-05", "a", null, "")], []);
    expect(res.months[0].rows[0]).toMatchObject({ lessons: 1, hours: 0, amount: 0 });
  });

  it("negeert lessen van docenten die niet (meer) bestaan", () => {
    const res = buildPayoutOverview([A], [les("2026-09-05", "weg")], []);
    expect(res.months).toHaveLength(0);
  });

  it("splitst openstaand en uitbetaald binnen dezelfde maand", () => {
    const res = buildPayoutOverview(
      [A, B],
      [les("2026-09-05", "a"), les("2026-09-05", "b")],
      [payout("a", "2026-09-01", { lessons: 1, hours: 2, amount: 60 })],
    );
    const sept = res.months[0];
    expect(sept.paidTotal).toBe(60);
    expect(sept.openTotal).toBe(50);
    expect(sept.total).toBe(110);
    expect(sept.openCount).toBe(1);
  });
});
