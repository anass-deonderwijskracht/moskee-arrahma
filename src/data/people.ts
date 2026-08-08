import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Teacher = Tables<"teachers">;

export function useSaveTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: { id?: string; name: string; short: string; email: string; phone: string; specialty: string; role: string; uurtarief: number | null }) => {
      if (id) { const { error } = await supabase.from("teachers").update(row as never).eq("id", id); if (error) throw error; }
      else { const { error } = await supabase.from("teachers").insert(row as never); if (error) throw error; }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["teacher-detail"] });
      qc.invalidateQueries({ queryKey: ["teacher-costs"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export function useCreateOuder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { role: string; name: string; phone: string; email: string; primary: boolean }) => {
      const { data, error } = await supabase.from("ouders").insert(row as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ouders"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useCreateKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { first_name: string; last_name: string; gender: string | null; birth_year: number | null; birthdate?: string | null; address: string | null; notes: string | null }) => {
      const initials = (row.first_name[0] ?? "").toUpperCase() + (row.last_name.replace(/[^A-Za-z]/g, "")[0] ?? "").toUpperCase();
      const { data, error } = await supabase.from("kinderen").insert({ ...row, initials } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kinderen"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}
export type Ouder = Tables<"ouders">;
export type Kind = Tables<"kinderen">;

/** Losse veldwijziging op een ouder — gebruikt door de bewerkmodus in de tabel. */
export function useUpdateOuder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Ouder> }) => {
      const { error } = await supabase.from("ouders").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ouders"] });
      qc.invalidateQueries({ queryKey: ["ouder-detail"] });
      qc.invalidateQueries({ queryKey: ["kinderen"] });
    },
  });
}

/** Losse veldwijziging op een kind. Bij een naamswijziging volgen de initialen. */
export function useUpdateKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, name }: {
      id: string; patch: Partial<Kind>; name?: { first_name: string; last_name: string };
    }) => {
      const full = name
        ? { ...patch, initials: (name.first_name[0] ?? "").toUpperCase() + (name.last_name.replace(/[^A-Za-z]/g, "")[0] ?? "").toUpperCase() }
        : patch;
      const { error } = await supabase.from("kinderen").update(full as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kinderen"] });
      qc.invalidateQueries({ queryKey: ["kind-detail"] });
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["ouders"] });
    },
  });
}

export function useDeleteTeachers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("teachers").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teachers"] }); qc.invalidateQueries({ queryKey: ["classes"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useDeleteOuders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("ouders").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ouders"] }); qc.invalidateQueries({ queryKey: ["kinderen"] }); qc.invalidateQueries({ queryKey: ["nav-counts"] }); },
  });
}

export function useDeleteKinderen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("kinderen").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kinderen"] });
      qc.invalidateQueries({ queryKey: ["ouders"] });
      qc.invalidateQueries({ queryKey: ["leerlingen"] });
      qc.invalidateQueries({ queryKey: ["nav-counts"] });
    },
  });
}

export function useTeachers() {
  return useQuery({
    queryKey: ["teachers"],
    queryFn: async (): Promise<Teacher[]> => {
      const { data, error } = await supabase.from("teachers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface OuderWithKinderen extends Ouder {
  kind_ouder: { kind_id: string; kinderen: { id: string; full_name: string; initials: string | null } | null }[];
}

export function useOuders() {
  return useQuery({
    queryKey: ["ouders"],
    queryFn: async (): Promise<OuderWithKinderen[]> => {
      const { data, error } = await supabase
        .from("ouders")
        .select("*, kind_ouder(kind_id, kinderen(id, full_name, initials))")
        .order("name");
      if (error) throw error;
      return (data as unknown as OuderWithKinderen[]) ?? [];
    },
  });
}

export interface KindRow extends Kind {
  leerlingen: { id: string; schooljaar_id: string; class_id: string; classes: { code: string } | null }[];
  kind_ouder: { ouder_id: string; ouders: { id: string; name: string; phone: string | null } | null }[];
}

export function useKinderen() {
  return useQuery({
    queryKey: ["kinderen"],
    queryFn: async (): Promise<KindRow[]> => {
      const { data, error } = await supabase
        .from("kinderen")
        .select(
          "*, leerlingen(id, schooljaar_id, class_id, classes(code)), kind_ouder(ouder_id, ouders(id, name, phone))",
        )
        .order("last_name");
      if (error) throw error;
      return (data as unknown as KindRow[]) ?? [];
    },
  });
}

// ---- Docent-uurtarief & planning-gebaseerde kosten -------------------------

/** Lesduur in uren uit een tijdvak "HH:MM - HH:MM"; 0 bij leeg/onparsebaar. */
export function lessonHours(time: string | null | undefined): number {
  if (!time) return 0;
  const m = time.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const diff = (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
  return diff > 0 ? diff / 60 : 0;
}

/** Welke rol heeft de docent op een les/klas: les-, Qur'an- of beide. */
type TeacherRole = "les" | "quran" | "both";
const roleFor = (teacherId: string, lesId: string | null, quranId: string | null): TeacherRole =>
  lesId === teacherId && quranId === teacherId ? "both" : quranId === teacherId ? "quran" : "les";

export interface TeacherCostRow { teacher: Teacher; lessons: number; hours: number; cost: number; }
export interface TeacherCosts { rows: TeacherCostRow[]; totalHours: number; totalCost: number; }

interface CostLesson { type: string; teacher_id: string | null; quran_teacher_id: string | null; classes: { time: string | null } | null }

/** Per-docent ingeplande uren en kosten voor één schooljaar (live uurtarief). */
export function useTeacherCosts(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["teacher-costs", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<TeacherCosts> => {
      const [{ data: teachers, error: tErr }, { data: lessons, error: lErr }] = await Promise.all([
        supabase.from("teachers").select("*").order("name"),
        supabase
          .from("lessons")
          .select("type, teacher_id, quran_teacher_id, classes!inner(time, schooljaar_id, historic, is_next)")
          .eq("classes.schooljaar_id", schooljaarId!)
          .eq("classes.historic", false)
          .eq("classes.is_next", false)
          .neq("type", "vrij"),
      ]);
      if (tErr) throw tErr;
      if (lErr) throw lErr;

      const byId = new Map<string, TeacherCostRow>();
      for (const t of (teachers as Teacher[]) ?? []) byId.set(t.id, { teacher: t, lessons: 0, hours: 0, cost: 0 });

      const add = (id: string | null, hours: number) => {
        if (!id) return;
        const row = byId.get(id);
        if (!row) return;
        row.lessons += 1;
        row.hours += hours;
        row.cost += hours * Number(row.teacher.uurtarief ?? 0);
      };
      for (const l of (lessons as unknown as CostLesson[]) ?? []) {
        const hours = lessonHours(l.classes?.time);
        add(l.teacher_id, hours);
        add(l.quran_teacher_id, hours);
      }

      const rows = [...byId.values()].filter((r) => r.lessons > 0).sort((a, b) => b.cost - a.cost);
      const totalHours = rows.reduce((a, r) => a + r.hours, 0);
      const totalCost = rows.reduce((a, r) => a + r.cost, 0);
      return { rows, totalHours, totalCost };
    },
  });
}

export interface TeacherClassRef { id: string; code: string; track: string; day: string | null; time: string | null; schooljaarName: string; role: TeacherRole; }
export interface TeacherLessonRef { id: string; date: string; week_nr: number | null; type: string; classCode: string; schooljaarName: string; hours: number; cost: number; role: TeacherRole; }
export interface TeacherYearSummary { schooljaarName: string; lessons: number; hours: number; cost: number; }
export interface TeacherDetail { teacher: Teacher; classes: TeacherClassRef[]; lessons: TeacherLessonRef[]; perYear: TeacherYearSummary[]; }

interface DetailClass { id: string; code: string; track: string; day: string | null; time: string | null; teacher_id: string | null; quran_teacher_id: string | null; schooljaar: { name: string } | null }
interface DetailLesson { id: string; date: string; week_nr: number | null; type: string; teacher_id: string | null; quran_teacher_id: string | null; classes: { code: string; time: string | null; schooljaar: { name: string } | null } | null }

/** Docent + zijn klassen (historie, alle jaren) + ingeplande lessen met kosten. */
export function useTeacherDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["teacher-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<TeacherDetail> => {
      const orFilter = `teacher_id.eq.${id},quran_teacher_id.eq.${id}`;
      const [{ data: teacher, error: tErr }, { data: classes, error: cErr }, { data: lessons, error: lErr }] = await Promise.all([
        supabase.from("teachers").select("*").eq("id", id!).single(),
        supabase
          .from("classes")
          .select("id, code, track, day, time, teacher_id, quran_teacher_id, schooljaar:schooljaren(name)")
          .or(orFilter)
          .order("code"),
        supabase
          .from("lessons")
          .select("id, date, week_nr, type, teacher_id, quran_teacher_id, classes!inner(code, time, schooljaar:schooljaren(name))")
          .or(orFilter)
          .neq("type", "vrij")
          .order("date", { ascending: false }),
      ]);
      if (tErr) throw tErr;
      if (cErr) throw cErr;
      if (lErr) throw lErr;

      const t = teacher as Teacher;
      const rate = Number(t.uurtarief ?? 0);

      const classRefs: TeacherClassRef[] = ((classes as unknown as DetailClass[]) ?? []).map((c) => ({
        id: c.id, code: c.code, track: c.track, day: c.day, time: c.time,
        schooljaarName: c.schooljaar?.name ?? "—",
        role: roleFor(id!, c.teacher_id, c.quran_teacher_id),
      }));

      const lessonRefs: TeacherLessonRef[] = ((lessons as unknown as DetailLesson[]) ?? []).map((l) => {
        const hours = lessonHours(l.classes?.time);
        return {
          id: l.id, date: l.date, week_nr: l.week_nr, type: l.type,
          classCode: l.classes?.code ?? "—",
          schooljaarName: l.classes?.schooljaar?.name ?? "—",
          hours, cost: hours * rate,
          role: roleFor(id!, l.teacher_id, l.quran_teacher_id),
        };
      });

      const perYearMap = new Map<string, TeacherYearSummary>();
      for (const l of lessonRefs) {
        const s = perYearMap.get(l.schooljaarName) ?? { schooljaarName: l.schooljaarName, lessons: 0, hours: 0, cost: 0 };
        s.lessons += 1; s.hours += l.hours; s.cost += l.cost;
        perYearMap.set(l.schooljaarName, s);
      }
      const perYear = [...perYearMap.values()].sort((a, b) => b.schooljaarName.localeCompare(a.schooljaarName));

      return { teacher: t, classes: classRefs, lessons: lessonRefs, perYear };
    },
  });
}
