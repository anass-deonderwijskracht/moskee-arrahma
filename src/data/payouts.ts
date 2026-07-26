import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";
import { lessonHours, type Teacher } from "@/data/people";

export type TeacherPayout = Tables<"teacher_payouts">;

// ---------------------------------------------------------------------------
// Maandelijkse docentuitbetalingen.
//
// Wat een docent over een maand tegoed heeft, leiden we live af uit de planning:
// elke les (type != 'vrij') waar hij als les- óf Qur'an-docent staat, telt de
// lesduur van de klas × zijn huidige uurtarief — dezelfde rekenregel als de
// begroting in `useTeacherCosts`.
//
// Zodra je een maand afvinkt, leggen we uren/tarief/bedrag als SNAPSHOT vast in
// `teacher_payouts`. Daarna toont het scherm die vastgelegde bedragen, zodat
// terugkijken klopt ook als de planning of het uurtarief later wijzigt. Wijkt de
// planning naderhand af, dan meldt de rij dat (`drifted`).
//
// Anders dan de begroting filteren we hier NIET op `historic`/`is_next`: je moet
// juist afgeronde schooljaren kunnen terugkijken, en die klassen staan historisch.
// ---------------------------------------------------------------------------

/** "2026-09" → sleutel per kalendermaand. */
const monthKey = (iso: string) => iso.slice(0, 7);
/** Sleutel → eerste dag van die maand, zoals `teacher_payouts.period` het opslaat. */
export const periodOf = (key: string) => key + "-01";

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Korte variant zonder jaartal — voor de maandkiezer binnen één schooljaar. */
export function monthShort(key: string): string {
  const [y, m] = key.split("-");
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("nl-NL", { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1) + " " + y;
}

export interface PayoutRow {
  teacher: Teacher;
  /** Live uit de planning. */
  lessons: number;
  hours: number;
  rate: number | null;
  amount: number;
  /** Vastgelegde uitbetaling; null = openstaand. */
  payout: TeacherPayout | null;
  /** Uitbetaald, maar de planning/het tarief wijkt inmiddels af van het snapshot. */
  drifted: boolean;
}

export interface PayoutMonth {
  key: string;
  label: string;
  rows: PayoutRow[];
  hours: number;
  /** Totaal over alle docenten (uitbetaald = snapshot, openstaand = live). */
  total: number;
  paidTotal: number;
  openTotal: number;
  openCount: number;
}

export interface PayoutOverview { months: PayoutMonth[]; total: number; paidTotal: number; openTotal: number; openCount: number; }

interface PayoutLesson {
  date: string; type: string; teacher_id: string | null; quran_teacher_id: string | null;
  classes: { time: string | null } | null;
}

/** Het bedrag dat een rij vertegenwoordigt: uitbetaald → snapshot, anders live. */
export const rowAmount = (r: PayoutRow) => (r.payout ? Number(r.payout.amount) : r.amount);

/** Alle maanden van één schooljaar met per maand de docenten, uren en status. */
export function usePayoutOverview(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["teacher-payouts", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<PayoutOverview> => {
      const [{ data: teachers, error: tErr }, { data: lessons, error: lErr }, { data: payouts, error: pErr }] = await Promise.all([
        supabase.from("teachers").select("*").order("name"),
        supabase
          .from("lessons")
          .select("date, type, teacher_id, quran_teacher_id, classes!inner(time, schooljaar_id)")
          .eq("classes.schooljaar_id", schooljaarId!)
          .neq("type", "vrij"),
        supabase.from("teacher_payouts").select("*").eq("schooljaar_id", schooljaarId!),
      ]);
      if (tErr) throw tErr;
      if (lErr) throw lErr;
      if (pErr) throw pErr;

      const teacherById = new Map((teachers as Teacher[] ?? []).map((t) => [t.id, t]));
      const paidByKey = new Map(
        ((payouts as TeacherPayout[]) ?? []).map((p) => [monthKey(p.period) + ":" + p.teacher_id, p]),
      );

      // maand → docent → live uren/lessen uit de planning
      const grid = new Map<string, Map<string, { lessons: number; hours: number }>>();
      const bucket = (mk: string, id: string) => {
        const month = grid.get(mk) ?? new Map();
        grid.set(mk, month);
        const cell = month.get(id) ?? { lessons: 0, hours: 0 };
        month.set(id, cell);
        return cell;
      };
      for (const l of (lessons as unknown as PayoutLesson[]) ?? []) {
        const hours = lessonHours(l.classes?.time);
        const mk = monthKey(l.date);
        for (const id of [l.teacher_id, l.quran_teacher_id]) {
          if (!id || !teacherById.has(id)) continue;
          const cell = bucket(mk, id);
          cell.lessons += 1;
          cell.hours += hours;
        }
      }
      // Al uitbetaalde maanden blijven zichtbaar, ook als de planning intussen leeg is.
      for (const p of (payouts as TeacherPayout[]) ?? []) {
        if (teacherById.has(p.teacher_id)) bucket(monthKey(p.period), p.teacher_id);
      }

      const months: PayoutMonth[] = [...grid.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, cells]) => {
          const rows: PayoutRow[] = [...cells.entries()]
            .map(([id, cell]) => {
              const teacher = teacherById.get(id)!;
              const rate = teacher.uurtarief == null ? null : Number(teacher.uurtarief);
              const amount = cell.hours * (rate ?? 0);
              const payout = paidByKey.get(key + ":" + id) ?? null;
              const drifted =
                !!payout && (Math.abs(Number(payout.hours) - cell.hours) > 0.001 || Math.abs(Number(payout.amount) - amount) > 0.01);
              return { teacher, lessons: cell.lessons, hours: cell.hours, rate, amount, payout, drifted };
            })
            .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));

          const paidTotal = rows.filter((r) => r.payout).reduce((a, r) => a + rowAmount(r), 0);
          const openRows = rows.filter((r) => !r.payout);
          return {
            key,
            label: monthLabel(key),
            rows,
            hours: rows.reduce((a, r) => a + (r.payout ? Number(r.payout.hours) : r.hours), 0),
            total: paidTotal + openRows.reduce((a, r) => a + r.amount, 0),
            paidTotal,
            openTotal: openRows.reduce((a, r) => a + r.amount, 0),
            openCount: openRows.length,
          };
        });

      return {
        months,
        total: months.reduce((a, m) => a + m.total, 0),
        paidTotal: months.reduce((a, m) => a + m.paidTotal, 0),
        openTotal: months.reduce((a, m) => a + m.openTotal, 0),
        openCount: months.reduce((a, m) => a + m.openCount, 0),
      };
    },
  });
}

export interface SetPayoutInput {
  paid: boolean;
  payoutId?: string | null;
  teacher_id: string;
  schooljaar_id: string;
  /** Maandsleutel "YYYY-MM". */
  month: string;
  lessons: number;
  hours: number;
  rate: number | null;
  amount: number;
}

/** Vinkt een maand af (snapshot vastleggen) of weer uit (rij verwijderen). */
export function useSetTeacherPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetPayoutInput | SetPayoutInput[]) => {
      const list = Array.isArray(input) ? input : [input];
      if (!list.length) return;

      const toRemove = list.filter((i) => !i.paid).map((i) => i.payoutId).filter((id): id is string => !!id);
      if (toRemove.length) {
        const { error } = await supabase.from("teacher_payouts").delete().in("id", toRemove);
        if (error) throw error;
      }

      const toAdd = list.filter((i) => i.paid);
      if (toAdd.length) {
        const now = new Date().toISOString();
        const { error } = await supabase.from("teacher_payouts").upsert(
          toAdd.map((i) => ({
            teacher_id: i.teacher_id, schooljaar_id: i.schooljaar_id, period: periodOf(i.month),
            lessons: i.lessons, hours: i.hours, rate: i.rate, amount: i.amount, paid_at: now,
          })) as never,
          { onConflict: "teacher_id,schooljaar_id,period" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-payouts"] });
      qc.invalidateQueries({ queryKey: ["teacher-payout-history"] });
    },
  });
}

// ---- Uitbetalingen van één docent (detailpagina) ---------------------------

export interface TeacherPayoutRow {
  month: string;
  label: string;
  schooljaarId: string;
  schooljaarName: string;
  lessons: number;
  hours: number;
  amount: number;
  payout: TeacherPayout | null;
}
export interface TeacherPayoutHistory { rows: TeacherPayoutRow[]; paidTotal: number; openTotal: number; openCount: number; }

interface HistoryLesson {
  date: string; type: string; teacher_id: string | null; quran_teacher_id: string | null;
  classes: { time: string | null; schooljaar_id: string; schooljaar: { name: string } | null } | null;
}

/** Alle maanden (openstaand én uitbetaald) van één docent, over alle schooljaren. */
export function useTeacherPayoutHistory(teacherId: string | undefined, rate: number | null | undefined) {
  return useQuery({
    queryKey: ["teacher-payout-history", teacherId, rate ?? null],
    enabled: !!teacherId && rate !== undefined,
    queryFn: async (): Promise<TeacherPayoutHistory> => {
      const [{ data: lessons, error: lErr }, { data: payouts, error: pErr }] = await Promise.all([
        supabase
          .from("lessons")
          .select("date, type, teacher_id, quran_teacher_id, classes!inner(time, schooljaar_id, schooljaar:schooljaren(name))")
          .or(`teacher_id.eq.${teacherId},quran_teacher_id.eq.${teacherId}`)
          .neq("type", "vrij"),
        supabase.from("teacher_payouts").select("*").eq("teacher_id", teacherId!),
      ]);
      if (lErr) throw lErr;
      if (pErr) throw pErr;

      const live = Number(rate ?? 0);
      const cells = new Map<string, TeacherPayoutRow>();
      const cell = (month: string, schooljaarId: string, schooljaarName: string) => {
        const k = schooljaarId + ":" + month;
        const found = cells.get(k) ?? {
          month, label: monthLabel(month), schooljaarId, schooljaarName,
          lessons: 0, hours: 0, amount: 0, payout: null,
        };
        cells.set(k, found);
        return found;
      };

      for (const l of (lessons as unknown as HistoryLesson[]) ?? []) {
        if (!l.classes) continue;
        // Eén les kan de docent twee keer tellen (les- én Qur'an-docent).
        const times = [l.teacher_id, l.quran_teacher_id].filter((id) => id === teacherId).length;
        if (!times) continue;
        const c = cell(monthKey(l.date), l.classes.schooljaar_id, l.classes.schooljaar?.name ?? "—");
        c.lessons += times;
        c.hours += lessonHours(l.classes.time) * times;
      }
      for (const c of cells.values()) c.amount = c.hours * live;

      const byName = new Map<string, string>();
      for (const c of cells.values()) byName.set(c.schooljaarId, c.schooljaarName);
      for (const p of (payouts as TeacherPayout[]) ?? []) {
        const c = cell(monthKey(p.period), p.schooljaar_id, byName.get(p.schooljaar_id) ?? "—");
        c.payout = p;
      }

      const rows = [...cells.values()].sort((a, b) => b.month.localeCompare(a.month));
      return {
        rows,
        paidTotal: rows.filter((r) => r.payout).reduce((a, r) => a + Number(r.payout!.amount), 0),
        openTotal: rows.filter((r) => !r.payout).reduce((a, r) => a + r.amount, 0),
        openCount: rows.filter((r) => !r.payout).length,
      };
    },
  });
}
