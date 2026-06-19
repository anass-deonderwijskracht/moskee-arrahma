import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export const SCHAAL = ["onvoldoende", "matig", "voldoende", "goed", "zeer goed"] as const;
export type SchaalValue = (typeof SCHAAL)[number];

export type ReportPeriod = Tables<"report_periods">;
export type Test = Tables<"tests">;
export type TestGrade = Tables<"test_grades">;
export type ReportAssessment = Tables<"report_assessments">;

export type TestWithRefs = Test & {
  classes: { code: string } | null;
  report_periods: { name: string } | null;
};

// ---- report periods --------------------------------------------------------

export function useReportPeriods() {
  return useQuery({
    queryKey: ["report-periods"],
    queryFn: async (): Promise<ReportPeriod[]> => {
      const { data, error } = await supabase
        .from("report_periods").select("*").eq("archived", false).order("ord", { ascending: true });
      if (error) throw error;
      return (data as ReportPeriod[]) ?? [];
    },
  });
}

export function useCreateReportPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { name: string; ord: number }) => {
      const { error } = await supabase.from("report_periods").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-periods"] }),
  });
}

export function useUpdateReportPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; ord?: number; archived?: boolean } }) => {
      const { error } = await supabase.from("report_periods").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-periods"] }),
  });
}

// ---- tests -----------------------------------------------------------------

export function useClassTests(classId: string | undefined) {
  return useQuery({
    queryKey: ["class-tests", classId],
    enabled: !!classId,
    queryFn: async (): Promise<Test[]> => {
      const { data, error } = await supabase
        .from("tests").select("*").eq("class_id", classId!).order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Test[]) ?? [];
    },
  });
}

export function useAllTests() {
  return useQuery({
    queryKey: ["all-tests"],
    queryFn: async (): Promise<TestWithRefs[]> => {
      const { data, error } = await supabase
        .from("tests").select("*, classes(code), report_periods(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as TestWithRefs[]) ?? [];
    },
  });
}

function invalidateTests(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["class-tests"] });
  qc.invalidateQueries({ queryKey: ["all-tests"] });
  qc.invalidateQueries({ queryKey: ["report-grades"] });
  qc.invalidateQueries({ queryKey: ["leerling-reports"] });
}

export function useCreateTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { class_id: string; report_period_id: string; name: string; grade_type: string }) => {
      const { error } = await supabase.from("tests").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => invalidateTests(qc),
  });
}

export function useUpdateTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; grade_type?: string; report_period_id?: string } }) => {
      const { error } = await supabase.from("tests").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTests(qc),
  });
}

export function useDeleteTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTests(qc),
  });
}

export interface TestInsert { class_id: string; report_period_id: string; name: string; grade_type: string }

/** Pure: één toets-rij per klas × rapport-combinatie. */
export function buildBulkTestRows(p: { name: string; grade_type: string; classIds: string[]; reportPeriodIds: string[] }): TestInsert[] {
  const rows: TestInsert[] = [];
  for (const class_id of p.classIds)
    for (const report_period_id of p.reportPeriodIds)
      rows.push({ class_id, report_period_id, name: p.name, grade_type: p.grade_type });
  return rows;
}

export function useBulkCreateTests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { name: string; grade_type: string; classIds: string[]; reportPeriodIds: string[] }) => {
      const rows = buildBulkTestRows(p);
      if (!rows.length) return 0;
      const { error } = await supabase.from("tests").insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => invalidateTests(qc),
  });
}

// ---- beoordelingen-raster --------------------------------------------------

export interface ReportGridData {
  assessments: Record<string, ReportAssessment>;
  tests: Test[];
  grades: Record<string, string | null>;
}

export function useReportGrades(classId: string | undefined, reportPeriodId: string | undefined) {
  return useQuery({
    queryKey: ["report-grades", classId, reportPeriodId],
    enabled: !!classId && !!reportPeriodId,
    queryFn: async (): Promise<ReportGridData> => {
      const { data: leerlingen, error: lErr } = await supabase
        .from("leerlingen").select("id").eq("class_id", classId!);
      if (lErr) throw lErr;
      const ids = ((leerlingen as { id: string }[]) ?? []).map((l) => l.id);

      const { data: tests, error: tErr } = await supabase
        .from("tests").select("*").eq("class_id", classId!).eq("report_period_id", reportPeriodId!)
        .order("created_at", { ascending: true });
      if (tErr) throw tErr;
      const testList = (tests as Test[]) ?? [];

      const assessments: Record<string, ReportAssessment> = {};
      const grades: Record<string, string | null> = {};
      if (ids.length) {
        const { data: aRows, error: aErr } = await supabase
          .from("report_assessments").select("*").eq("report_period_id", reportPeriodId!).in("leerling_id", ids);
        if (aErr) throw aErr;
        for (const a of (aRows as ReportAssessment[]) ?? []) assessments[a.leerling_id] = a;

        const testIds = testList.map((t) => t.id);
        if (testIds.length) {
          const { data: gRows, error: gErr } = await supabase
            .from("test_grades").select("*").in("test_id", testIds).in("leerling_id", ids);
          if (gErr) throw gErr;
          for (const g of (gRows as TestGrade[]) ?? []) grades[`${g.test_id}:${g.leerling_id}`] = g.value;
        }
      }
      return { assessments, tests: testList, grades };
    },
  });
}

export interface AssessmentUpsert {
  leerling_id: string; report_period_id: string;
  quran: string | null; gedrag: string | null; inzet: string | null; opmerking: string | null;
}
export interface GradeUpsert { test_id: string; leerling_id: string; value: string | null }

export function useSaveReportGrades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { classId: string; reportPeriodId: string; assessments: AssessmentUpsert[]; grades: GradeUpsert[] }) => {
      if (p.assessments.length) {
        const { error } = await supabase
          .from("report_assessments").upsert(p.assessments as never, { onConflict: "leerling_id,report_period_id" });
        if (error) throw error;
      }
      if (p.grades.length) {
        const { error } = await supabase
          .from("test_grades").upsert(p.grades as never, { onConflict: "test_id,leerling_id" });
        if (error) throw error;
      }
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["report-grades", p.classId, p.reportPeriodId] });
      qc.invalidateQueries({ queryKey: ["leerling-reports"] });
    },
  });
}

/** Aantal keer 'te laat' (status L) per leerling, voor het rapport. */
export function useClassLateCounts(leerlingIds: string[], enabled: boolean) {
  const key = leerlingIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["class-late-counts", key],
    enabled: enabled && leerlingIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("attendance_records").select("leerling_id,status").in("leerling_id", leerlingIds);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data as { leerling_id: string; status: string | null }[]) ?? [])
        if (r.status === "L") m[r.leerling_id] = (m[r.leerling_id] ?? 0) + 1;
      return m;
    },
  });
}

// ---- leerling read-only overzicht ------------------------------------------

export interface LeerlingReport {
  period: ReportPeriod;
  assessment: ReportAssessment | null;
  tests: { test: Test; value: string | null }[];
}

export function useLeerlingReports(leerlingId: string | undefined) {
  return useQuery({
    queryKey: ["leerling-reports", leerlingId],
    enabled: !!leerlingId,
    queryFn: async (): Promise<LeerlingReport[]> => {
      const { data: periods, error: pErr } = await supabase
        .from("report_periods").select("*").eq("archived", false).order("ord", { ascending: true });
      if (pErr) throw pErr;

      const { data: lrow, error: lErr } = await supabase
        .from("leerlingen").select("class_id").eq("id", leerlingId!).maybeSingle();
      if (lErr) throw lErr;
      const classId = (lrow as { class_id: string } | null)?.class_id ?? null;

      const { data: aRows, error: aErr } = await supabase
        .from("report_assessments").select("*").eq("leerling_id", leerlingId!);
      if (aErr) throw aErr;
      const aByPeriod: Record<string, ReportAssessment> = {};
      for (const a of (aRows as ReportAssessment[]) ?? []) aByPeriod[a.report_period_id] = a;

      let tests: Test[] = [];
      const gradeMap: Record<string, string | null> = {};
      if (classId) {
        const { data: tRows, error: tErr } = await supabase
          .from("tests").select("*").eq("class_id", classId).order("created_at", { ascending: true });
        if (tErr) throw tErr;
        tests = (tRows as Test[]) ?? [];
        const { data: gRows, error: gErr } = await supabase
          .from("test_grades").select("*").eq("leerling_id", leerlingId!);
        if (gErr) throw gErr;
        for (const g of (gRows as TestGrade[]) ?? []) gradeMap[g.test_id] = g.value;
      }

      return ((periods as ReportPeriod[]) ?? []).map((period) => ({
        period,
        assessment: aByPeriod[period.id] ?? null,
        tests: tests.filter((t) => t.report_period_id === period.id).map((test) => ({ test, value: gradeMap[test.id] ?? null })),
      }));
    },
  });
}
