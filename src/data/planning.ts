import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MatrixClass { id: string; code: string; grade: number | null; track: string; color: string | null }
export interface MatrixLesson { id: string; class_id: string; week_nr: number | null; date: string; type: string; teacher_id: string | null; quran_teacher_id: string | null; teacher_na: boolean; quran_na: boolean }
export interface PlanningMatrix {
  classes: MatrixClass[];
  weeks: { week_nr: number; date: string }[];
  byKey: Record<string, MatrixLesson>; // `${class_id}|${week_nr}`
}

export function usePlanningMatrix(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["planning-matrix", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<PlanningMatrix> => {
      const { data: classes, error: cErr } = await supabase
        .from("classes")
        .select("id, code, grade, track, color")
        .eq("schooljaar_id", schooljaarId!)
        .eq("historic", false)
        .eq("is_next", false)
        .order("grade");
      if (cErr) throw cErr;
      const classRows = (classes as MatrixClass[]) ?? [];
      const ids = classRows.map((c) => c.id);

      let lessons: MatrixLesson[] = [];
      if (ids.length) {
        const { data, error } = await supabase
          .from("lessons")
          .select("id, class_id, week_nr, date, type, teacher_id, quran_teacher_id, teacher_na, quran_na")
          .in("class_id", ids);
        if (error) throw error;
        lessons = (data as MatrixLesson[]) ?? [];
      }

      const weekMap = new Map<number, string>();
      const byKey: Record<string, MatrixLesson> = {};
      for (const l of lessons) {
        if (l.week_nr == null) continue;
        byKey[`${l.class_id}|${l.week_nr}`] = l;
        const cur = weekMap.get(l.week_nr);
        if (!cur || l.date < cur) weekMap.set(l.week_nr, l.date);
      }
      const weeks = [...weekMap.entries()].map(([week_nr, date]) => ({ week_nr, date })).sort((a, b) => a.week_nr - b.week_nr);

      return { classes: classRows, weeks, byKey };
    },
  });
}

export interface NewLessonInput { classIds: string[]; date: string; week_nr: number | null; topic: string; type: string }

/** Create one lesson per selected class at once (e.g. add a new lesweek across classes). */
export function useCreateLessons(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLessonInput) => {
      const rows = input.classIds.map((class_id) => ({
        class_id, date: input.date, week_nr: input.week_nr,
        topic: input.topic, type: input.type, location: "Moskee Arrahma",
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("lessons").insert(rows as never);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "les aangemaakt", object: `${rows.length} klas(sen)${input.week_nr != null ? ` · week ${input.week_nr}` : ""}`, type: "plan", user_label: "Beheerder" } as never);
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix", schooljaarId] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
}

/** Duplicate existing lessons (one per class) onto a new date/week — copies every field (docenten, type, topic, …). */
export function useDuplicateLessons(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lessonIds: string[]; date: string; week_nr: number | null }) => {
      if (input.lessonIds.length === 0) return 0;
      const { data: src, error: sErr } = await supabase
        .from("lessons")
        .select("class_id, type, teacher_id, quran_teacher_id, teacher_na, quran_na, topic, location")
        .in("id", input.lessonIds);
      if (sErr) throw sErr;
      const rows = ((src as Record<string, unknown>[]) ?? []).map((l) => ({ ...l, date: input.date, week_nr: input.week_nr }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("lessons").insert(rows as never);
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "lesweek gedupliceerd", object: `${rows.length} klas(sen)${input.week_nr != null ? ` · week ${input.week_nr}` : ""}`, type: "plan", user_label: "Beheerder" } as never);
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix", schooljaarId] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
}

/** Verwijdert de lessen zelf. Aanwezigheid en lesnotities hangen er met een
 *  cascade aan en verdwijnen mee; Qur'an-opdrachten blijven bestaan maar raken
 *  hun leskoppeling kwijt (on delete set null). */
export function useDeleteLessons(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lessonIds: string[]) => {
      if (!lessonIds.length) return 0;
      const { error } = await supabase.from("lessons").delete().in("id", lessonIds);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        action: "lessen verwijderd", object: `${lessonIds.length} les(sen)`, type: "plan", user_label: "Beheerder",
      } as never);
      return lessonIds.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix", schooljaarId] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      qc.invalidateQueries({ queryKey: ["class-detail"] });
      qc.invalidateQueries({ queryKey: ["leerling-detail"] });
      qc.invalidateQueries({ queryKey: ["leerling-metrics"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Lesweken genereren voor een heel schooljaar
// ---------------------------------------------------------------------------

/** Nederlandse dagnaam → weekdag (0 = zondag, zoals Date.getDay()). */
const DAY_INDEX: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface GenerateWeeksResult {
  created: number;
  skipped: number;
  weeks: number;
  /** Klassen zonder lesdag — daarvoor valt geen datum te bepalen. */
  withoutDay: string[];
}

/**
 * Maakt per klas één les per week tussen begin- en einddatum, op de lesdag van
 * die klas. Bestaande lessen op dezelfde datum blijven staan, dus nogmaals
 * draaien voegt alleen de ontbrekende weken toe.
 */
export function useGenerateLesweken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ schooljaarId, start, end }: { schooljaarId: string; start: string; end: string }): Promise<GenerateWeeksResult> => {
      if (!start || !end) throw new Error("Kies eerst een begin- en einddatum");
      if (start > end) throw new Error("De einddatum ligt vóór de begindatum");

      // Datums vastleggen op het schooljaar zelf.
      const { error: sjErr } = await supabase
        .from("schooljaren").update({ start_date: start, end_date: end } as never).eq("id", schooljaarId);
      if (sjErr) throw sjErr;

      const { data: classRows, error: cErr } = await supabase
        .from("classes")
        .select("id, code, day, location")
        .eq("schooljaar_id", schooljaarId)
        .eq("historic", false)
        .eq("is_next", false);
      if (cErr) throw cErr;
      const klassen = (classRows ?? []) as { id: string; code: string; day: string | null; location: string | null }[];
      if (!klassen.length) throw new Error("Dit schooljaar heeft nog geen klassen");

      const withDay = klassen.filter((c) => c.day && DAY_INDEX[c.day.toLowerCase()] !== undefined);
      const withoutDay = klassen.filter((c) => !withDay.includes(c)).map((c) => c.code);

      const startD = new Date(start + "T00:00:00");
      const endD = new Date(end + "T00:00:00");
      // Anker op de maandag van de eerste week, zodat alle klassen in dezelfde
      // kalenderweek hetzelfde weeknummer krijgen — ook bij verschillende lesdagen.
      const mondayOf = (d: Date) => {
        const m = new Date(d);
        m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        return m;
      };
      const anchor = mondayOf(startD);

      // Bestaande lessen: overslaan én hun weeknummer hergebruiken, zodat een
      // bijgegenereerde week niet als losse extra rij in de matrix belandt.
      const bestaand = new Set<string>();
      const weekNrByMonday = new Map<string, number>();
      if (withDay.length) {
        const { data: existing, error: lErr } = await supabase
          .from("lessons").select("class_id, date, week_nr").in("class_id", withDay.map((c) => c.id));
        if (lErr) throw lErr;
        for (const l of (existing ?? []) as { class_id: string; date: string; week_nr: number | null }[]) {
          bestaand.add(`${l.class_id}|${l.date}`);
          if (l.week_nr == null) continue;
          const key = iso(mondayOf(new Date(l.date + "T00:00:00")));
          if (!weekNrByMonday.has(key)) weekNrByMonday.set(key, l.week_nr);
        }
      }

      const rows: Record<string, unknown>[] = [];
      let skipped = 0;
      let weeks = 0;

      for (let w = 0; ; w++) {
        const monday = new Date(anchor);
        monday.setDate(monday.getDate() + w * 7);
        if (monday > endD) break;
        if (w > 60) break; // vangnet tegen een onbedoeld enorme reeks
        const weekNr = weekNrByMonday.get(iso(monday)) ?? w + 1;

        let usedThisWeek = false;
        for (const c of withDay) {
          const offset = (DAY_INDEX[c.day!.toLowerCase()] + 6) % 7; // maandag = 0
          const d = new Date(monday);
          d.setDate(d.getDate() + offset);
          if (d < startD || d > endD) continue;
          usedThisWeek = true;
          const date = iso(d);
          if (bestaand.has(`${c.id}|${date}`)) { skipped++; continue; }
          rows.push({
            class_id: c.id, date, week_nr: weekNr, type: "les",
            topic: "Wekelijkse les", location: c.location ?? "Moskee Arrahma",
          });
        }
        if (usedThisWeek) weeks++;
      }

      if (rows.length) {
        const { error } = await supabase.from("lessons").insert(rows as never);
        if (error) throw error;
        await supabase.from("audit_log").insert({
          action: "lesweken gegenereerd",
          object: `${rows.length} les(sen) over ${weeks} weken`,
          type: "plan", user_label: "Beheerder",
        } as never);
      }

      return { created: rows.length, skipped, weeks, withoutDay };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix"] });
      qc.invalidateQueries({ queryKey: ["schooljaren"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
}

export interface LessonPatch { id: string; teacher_id: string | null; quran_teacher_id: string | null; type: string; teacher_na: boolean; quran_na: boolean }

export function useSaveLessons(schooljaarId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: LessonPatch[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from("lessons")
          .update({ teacher_id: u.teacher_id, quran_teacher_id: u.quran_teacher_id, type: u.type, teacher_na: u.teacher_na, quran_na: u.quran_na } as never)
          .eq("id", u.id);
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({ action: "docentenrooster bijgewerkt", object: `${updates.length} les(sen)`, type: "plan", user_label: "Beheerder" } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-matrix", schooljaarId] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Jaarlijn: alle lessen van een schooljaar op datum, voor de tijdlijnweergave
// ---------------------------------------------------------------------------

export interface YearClass extends MatrixClass { day: string | null }
export interface YearLesson {
  id: string; class_id: string; date: string; week_nr: number | null;
  type: string; topic: string | null;
  teacher_id: string | null; quran_teacher_id: string | null;
  teacher_na: boolean; quran_na: boolean;
}

/**
 * Klassen plus al hun lessen van één schooljaar, op datum gesorteerd.
 *
 * Bewust niet `usePlanningMatrix` hergebruikt: die groepeert op `week_nr` en
 * houdt per klas/week één les over. Een tijdlijn hangt aan datums, en moet ook
 * lessen tonen die (nog) geen weeknummer hebben.
 */
export function usePlanningYear(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["planning-year", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<{ classes: YearClass[]; lessons: YearLesson[] }> => {
      const { data: classRows, error: cErr } = await supabase
        .from("classes")
        .select("id, code, grade, track, color, day")
        .eq("schooljaar_id", schooljaarId!)
        .eq("historic", false)
        .eq("is_next", false);
      if (cErr) throw cErr;
      const classes = ((classRows ?? []) as YearClass[])
        .sort((a, b) => a.code.localeCompare(b.code, "nl", { numeric: true, sensitivity: "base" }));
      if (!classes.length) return { classes, lessons: [] };

      const { data, error } = await supabase
        .from("lessons")
        .select("id, class_id, date, week_nr, type, topic, teacher_id, quran_teacher_id, teacher_na, quran_na")
        .in("class_id", classes.map((c) => c.id))
        .order("date");
      if (error) throw error;
      return { classes, lessons: ((data ?? []) as YearLesson[]) };
    },
  });
}
