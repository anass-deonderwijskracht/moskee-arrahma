import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";
import type { ClassRow } from "./classes";

export type LessonStatus = "upcoming" | "today" | "completed";
export type Lesson = Tables<"lessons"> & { status: LessonStatus };
export type Surah = Tables<"surahs">;
export type Attendance = Tables<"attendance_records">;
export type QuranAssignment = Tables<"quran_assignments">;

export function lessonStatus(dateStr: string): LessonStatus {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  if (d.getTime() === today.getTime()) return "today";
  return d > today ? "upcoming" : "completed";
}

export const monthsNL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function dateNL(iso: string, withYear = false) {
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)} ${monthsNL[parseInt(m) - 1]}${withYear ? " " + y : ""}`;
}

export function useClass(id: string | undefined) {
  return useQuery({
    queryKey: ["class", id],
    enabled: !!id,
    queryFn: async (): Promise<ClassRow | null> => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, teacher:teachers!classes_teacher_id_fkey(id,name,short), quran_teacher:teachers!classes_quran_teacher_id_fkey(id,name,short)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ClassRow | null;
    },
  });
}

export type ClassLeerling = Tables<"leerlingen"> & {
  kinderen: { id: string; full_name: string; initials: string | null; gender: string | null; birth_year: number | null } | null;
};

export function useClassLeerlingen(classId: string | undefined) {
  return useQuery({
    queryKey: ["class-leerlingen", classId],
    enabled: !!classId,
    queryFn: async (): Promise<ClassLeerling[]> => {
      const { data, error } = await supabase
        .from("leerlingen")
        .select("*, kinderen(id, full_name, initials, gender, birth_year)")
        .eq("class_id", classId!);
      if (error) throw error;
      const rows = (data as unknown as ClassLeerling[]) ?? [];
      rows.sort((a, b) => (a.kinderen?.full_name ?? "").localeCompare(b.kinderen?.full_name ?? ""));
      return rows;
    },
  });
}

export function useLessons(classId: string | undefined) {
  return useQuery({
    queryKey: ["lessons", classId],
    enabled: !!classId,
    queryFn: async (): Promise<Lesson[]> => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("class_id", classId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return ((data as Tables<"lessons">[]) ?? []).map((l) => ({ ...l, status: lessonStatus(l.date) }));
    },
  });
}

export function useSurahs() {
  return useQuery({
    queryKey: ["surahs"],
    staleTime: Infinity,
    queryFn: async (): Promise<Surah[]> => {
      const { data, error } = await supabase.from("surahs").select("*").order("n");
      if (error) throw error;
      return (data as Surah[]) ?? [];
    },
  });
}

export function useLessonAttendance(lessonId: string | undefined) {
  return useQuery({
    queryKey: ["attendance", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<Record<string, Attendance>> => {
      const { data, error } = await supabase.from("attendance_records").select("*").eq("lesson_id", lessonId!);
      if (error) throw error;
      const map: Record<string, Attendance> = {};
      for (const a of (data as Attendance[]) ?? []) map[a.leerling_id] = a;
      return map;
    },
  });
}

/** All Qur'an assignments for a class (used to derive previous-lesson homework). */
export function useClassQuran(classId: string | undefined) {
  return useQuery({
    queryKey: ["class-quran", classId],
    enabled: !!classId,
    queryFn: async (): Promise<QuranAssignment[]> => {
      const { data, error } = await supabase.from("quran_assignments").select("*").eq("class_id", classId!);
      if (error) throw error;
      return (data as QuranAssignment[]) ?? [];
    },
  });
}

// ---- mutations -------------------------------------------------------------

export interface AttendanceUpsert {
  leerling_id: string; lesson_id: string;
  status: string | null; homework: string | null; materials_issue: boolean; note: string | null;
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: AttendanceUpsert[]) => {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(rows as never, { onConflict: "leerling_id,lesson_id" });
      if (error) throw error;
    },
    onSuccess: (_d, rows) => {
      qc.invalidateQueries({ queryKey: ["attendance", rows[0]?.lesson_id] });
      qc.invalidateQueries({ queryKey: ["leerling-metrics"] });
      qc.invalidateQueries({ queryKey: ["class-metrics"] });
    },
  });
}

export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("classes").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["class", id] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}

export function useAddLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { class_id: string; date: string; week_nr: number | null; topic: string; time: string | null; location: string | null }) => {
      const { error } = await supabase.from("lessons").insert(row as never);
      if (error) throw error;
    },
    onSuccess: (_d, row) => qc.invalidateQueries({ queryKey: ["lessons", row.class_id] }),
  });
}

export function useSaveLessonNote() {
  return useMutation({
    mutationFn: async (row: { lesson_id: string; author: string; body: string; is_draft: boolean }) => {
      const { error } = await supabase.from("lesson_notes").insert(row as never);
      if (error) throw error;
    },
  });
}

export interface QuranSavePayload {
  classId: string;
  lessonId: string;
  // evaluations to apply to existing previous assignments
  evals: { id: string; evaluation: string | null; absent: boolean; evaluated_at_lesson_id: string }[];
  // brand-new assignments to insert (assigned at this lesson)
  newAssignments: { leerling_id: string; class_id: string; assigned_at_lesson_id: string; surah_n: number; start_ayah: number; end_ayah: number; type: string; notes: string | null }[];
  // surah progress upserts
  progress: { leerling_id: string; surah_n: number; status: string }[];
}

export function useSaveQuranSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: QuranSavePayload) => {
      for (const e of p.evals) {
        const { error } = await supabase
          .from("quran_assignments")
          .update({ evaluation: e.evaluation, absent: e.absent, evaluated_at_lesson_id: e.evaluated_at_lesson_id } as never)
          .eq("id", e.id);
        if (error) throw error;
      }
      if (p.newAssignments.length) {
        const { error } = await supabase.from("quran_assignments").insert(p.newAssignments as never);
        if (error) throw error;
      }
      if (p.progress.length) {
        const { error } = await supabase
          .from("leerling_surah_progress")
          .upsert(p.progress as never, { onConflict: "leerling_id,surah_n" });
        if (error) throw error;
      }
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["class-quran", p.classId] });
      qc.invalidateQueries({ queryKey: ["leerling-metrics"] });
      qc.invalidateQueries({ queryKey: ["class-metrics"] });
    },
  });
}
