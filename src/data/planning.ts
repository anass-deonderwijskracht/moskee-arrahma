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
