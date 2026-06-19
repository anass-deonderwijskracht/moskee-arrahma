# Toetsen & Beoordelingen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docenten/admins kunnen per klas toetsen aanmaken en beoordelingen (cijfer/schaal + vaste kolommen) invullen per rapportperiode; admins rollen toetsen in bulk uit over meerdere klassen × rapporten.

**Architecture:** Vier nieuwe Supabase-tabellen (`report_periods`, `tests`, `test_grades`, `report_assessments`) met admin- + docent-RLS. Eén nieuwe datalaag `src/data/rapporten.ts` (React Query, upsert met `onConflict`). Twee nieuwe tabs op de klassenpagina (`ToetsenTab`, `BeoordelingenTab`), een admin-pagina (`AdminToetsen`), en de bestaande lege "Toetsen"-tab op leerling-detail wordt read-only gevuld.

**Tech Stack:** Vite + React 18 + React Router 6 + TanStack Query 5 + Supabase JS 2 + TypeScript. Geen CSS-framework (eigen design-tokens). Vitest voor pure-logic tests.

## Global Constraints

- Taal van alle UI-tekst: **Nederlands**.
- Geen nieuwe npm-dependencies.
- Datahooks in `src/data/*.ts`, stijl van `src/data/classDetail.ts` (useQuery/useMutation, mutations invalideren query keys).
- Inline-bewerkbare tabel volgt het patroon van `src/features/class-admin/LesAdministratie.tsx`: lokale `state` geseed via `useEffect`, één "Opslaan"-knop, batch-upsert.
- UI-primitieven hergebruiken uit `@/components/ui` (`Section`, `Tabs`, `Pills`, `Card`, `Btn`, `Icon`, `Select`, `Option`) en `@/components/ui/Modal` (`Modal`, `Field`, `ModalFooter`); toasts via `useToast()` uit `@/components/chrome/Toast`.
- Schaalwaarden (vaste UI-constante, niet in DB afgedwongen): `onvoldoende, matig, voldoende, goed, zeer goed`.
- Cijferinvoer is vrije tekst (geen afgedwongen bereik/decimalen).
- Migraties zijn re-runnable (`if not exists`, `drop policy if exists`), admin-RLS via `public.apply_admin_rls('public.<tabel>')`, `updated_at` via trigger `public.set_updated_at()`.
- Verificatie per UI-taak: `npm run typecheck` slaagt. Pure logica: `npm run test`.

---

### Task 1: Database-migratie

**Files:**
- Create: `supabase/migrations/015_toetsen_beoordelingen.sql`

**Interfaces:**
- Produces: tabellen `report_periods(id,name,ord,archived,created_at)`, `tests(id,class_id,report_period_id,name,grade_type,created_at)`, `test_grades(id,test_id,leerling_id,value,updated_at)`, `report_assessments(id,leerling_id,report_period_id,quran,gedrag,inzet,opmerking,updated_at)`.

- [ ] **Step 1: Schrijf de migratie**

Create `supabase/migrations/015_toetsen_beoordelingen.sql`:

```sql
-- ============================================================================
-- 015_toetsen_beoordelingen.sql — Toetsen & Beoordelingen
-- Rapportperioden (admin-beheerd), toetsen per klas+rapport, cijfers per toets
-- per leerling, en vaste rapportkolommen (Quran/Gedrag/Inzet/Opmerking).
-- Admin: volledige toegang. Docent: gescoped op eigen klas (zoals 014).
-- Re-runnable. Apply in de Supabase SQL editor (of service_role tooling).
-- ============================================================================

-- ---- report_periods (globaal, admin-beheerd) -------------------------------
create table if not exists public.report_periods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  ord        int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed de drie standaardperioden (idempotent op naam).
insert into public.report_periods (name, ord)
select v.name, v.ord
from (values ('Rapport 1', 1), ('Rapport 2', 2), ('Eindrapport', 3)) as v(name, ord)
where not exists (select 1 from public.report_periods rp where rp.name = v.name);

-- ---- tests (per klas × rapport) --------------------------------------------
create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  name             text not null,
  grade_type       text not null check (grade_type in ('cijfer','schaal')),
  created_at       timestamptz not null default now()
);
create index if not exists tests_class_period_idx on public.tests (class_id, report_period_id);

-- ---- test_grades (per toets × leerling) ------------------------------------
create table if not exists public.test_grades (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests(id) on delete cascade,
  leerling_id uuid not null references public.leerlingen(id) on delete cascade,
  value       text,
  updated_at  timestamptz not null default now(),
  unique (test_id, leerling_id)
);
create index if not exists test_grades_test_idx on public.test_grades (test_id);
create index if not exists test_grades_leerling_idx on public.test_grades (leerling_id);

drop trigger if exists test_grades_updated on public.test_grades;
create trigger test_grades_updated before update on public.test_grades
  for each row execute function public.set_updated_at();

-- ---- report_assessments (vaste kolommen per leerling × rapport) -------------
create table if not exists public.report_assessments (
  id               uuid primary key default gen_random_uuid(),
  leerling_id      uuid not null references public.leerlingen(id) on delete cascade,
  report_period_id uuid not null references public.report_periods(id) on delete cascade,
  quran            text,
  gedrag           text,
  inzet            text,
  opmerking        text,
  updated_at       timestamptz not null default now(),
  unique (leerling_id, report_period_id)
);
create index if not exists report_assessments_leerling_idx on public.report_assessments (leerling_id);

drop trigger if exists report_assessments_updated on public.report_assessments;
create trigger report_assessments_updated before update on public.report_assessments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS: admin volledige toegang (apply_admin_rls), docent gescoped (additief).
-- ============================================================================
select public.apply_admin_rls('public.report_periods');
select public.apply_admin_rls('public.tests');
select public.apply_admin_rls('public.test_grades');
select public.apply_admin_rls('public.report_assessments');

-- report_periods: docent mag alleen lezen (beheer is admin-only).
drop policy if exists docent_report_periods_select on public.report_periods;
create policy docent_report_periods_select on public.report_periods
  for select using (public.is_docent());

-- tests: docent beheert toetsen van de eigen klas.
drop policy if exists docent_tests_all on public.tests;
create policy docent_tests_all on public.tests
  for all using (class_id = public.current_class_id())
  with check (class_id = public.current_class_id());

-- test_grades: docent beheert cijfers van leerlingen in de eigen klas.
drop policy if exists docent_test_grades_all on public.test_grades;
create policy docent_test_grades_all on public.test_grades
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));

-- report_assessments: docent beheert oordelen van leerlingen in de eigen klas.
drop policy if exists docent_report_assessments_all on public.report_assessments;
create policy docent_report_assessments_all on public.report_assessments
  for all using (public.leerling_in_my_class(leerling_id))
  with check (public.leerling_in_my_class(leerling_id));
```

- [ ] **Step 2: Pas de migratie toe op Supabase**

Gebruik de Supabase MCP-tool `apply_migration` met `name: "toetsen_beoordelingen"` en de volledige SQL uit Step 1 als `query`. (Eerst `list_projects`/`list_tables` om het juiste `project_id` te bevestigen.)

Expected: succes, geen fout.

- [ ] **Step 3: Verifieer dat de tabellen bestaan**

Gebruik MCP `list_tables` (of `execute_sql` met `select to_regclass('public.tests'), to_regclass('public.report_periods'), to_regclass('public.test_grades'), to_regclass('public.report_assessments');`).
Expected: alle vier niet-null; `report_periods` bevat 3 rijen (Rapport 1/2, Eindrapport).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_toetsen_beoordelingen.sql
git commit -m "feat(db): toetsen & beoordelingen tabellen + RLS"
```

---

### Task 2: TypeScript-types

**Files:**
- Modify: `src/types/database.ts` (binnen `Database["public"]["Tables"]`)

**Interfaces:**
- Produces: `Tables<"report_periods">`, `Tables<"tests">`, `Tables<"test_grades">`, `Tables<"report_assessments">`.

- [ ] **Step 1: Voeg de vier tabel-types toe**

Voeg in `src/types/database.ts`, binnen het `Tables: { ... }`-blok (bv. direct na de `profiles`-entry), toe:

```ts
      report_periods: {
        Row: { id: string; name: string; ord: number; archived: boolean } & Timestamps;
        Insert: { name: string; ord?: number; archived?: boolean };
        Update: Partial<{ name: string; ord: number; archived: boolean }>;
        Relationships: [];
      };
      tests: {
        Row: { id: string; class_id: string; report_period_id: string; name: string; grade_type: string } & Timestamps;
        Insert: { class_id: string; report_period_id: string; name: string; grade_type: string };
        Update: Partial<{ class_id: string; report_period_id: string; name: string; grade_type: string }>;
        Relationships: [];
      };
      test_grades: {
        Row: { id: string; test_id: string; leerling_id: string; value: string | null; updated_at: string };
        Insert: { test_id: string; leerling_id: string; value?: string | null };
        Update: Partial<{ test_id: string; leerling_id: string; value: string | null }>;
        Relationships: [];
      };
      report_assessments: {
        Row: { id: string; leerling_id: string; report_period_id: string; quran: string | null; gedrag: string | null; inzet: string | null; opmerking: string | null; updated_at: string };
        Insert: { leerling_id: string; report_period_id: string; quran?: string | null; gedrag?: string | null; inzet?: string | null; opmerking?: string | null };
        Update: Partial<{ quran: string | null; gedrag: string | null; inzet: string | null; opmerking: string | null }>;
        Relationships: [];
      };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (geen fouten).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): toetsen & beoordelingen tabel-types"
```

---

### Task 3: Datalaag `src/data/rapporten.ts`

**Files:**
- Create: `src/data/rapporten.ts`
- Test: `src/data/rapporten.test.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `Tables` (`@/types/database`).
- Produces (gebruikt door alle UI-taken):
  - `SCHAAL: readonly string[]`, `type SchaalValue`
  - `type ReportPeriod = Tables<"report_periods">`, `type Test = Tables<"tests">`
  - `useReportPeriods(): UseQueryResult<ReportPeriod[]>`
  - `useCreateReportPeriod()` muteert `{ name: string; ord: number }`
  - `useUpdateReportPeriod()` muteert `{ id: string; patch: { name?: string; ord?: number; archived?: boolean } }`
  - `useClassTests(classId?: string): UseQueryResult<Test[]>`
  - `useAllTests(): UseQueryResult<TestWithRefs[]>` waarbij `TestWithRefs = Test & { classes: { code: string } | null; report_periods: { name: string } | null }`
  - `useCreateTest()` muteert `{ class_id: string; report_period_id: string; name: string; grade_type: string }`
  - `useUpdateTest()` muteert `{ id: string; patch: { name?: string; grade_type?: string; report_period_id?: string } }`
  - `useDeleteTest()` muteert `id: string`
  - `buildBulkTestRows(p): TestInsert[]` — pure functie
  - `useBulkCreateTests()` muteert `{ name: string; grade_type: string; classIds: string[]; reportPeriodIds: string[] }`
  - `useReportGrades(classId?, reportPeriodId?): UseQueryResult<ReportGridData>` waarbij `ReportGridData = { assessments: Record<string, ReportAssessment>; tests: Test[]; grades: Record<string, string | null> }` (grade-key = `` `${test_id}:${leerling_id}` ``)
  - `useSaveReportGrades()` muteert `{ classId: string; reportPeriodId: string; assessments: AssessmentUpsert[]; grades: GradeUpsert[] }`
  - `useLeerlingReports(leerlingId?): UseQueryResult<LeerlingReport[]>` waarbij `LeerlingReport = { period: ReportPeriod; assessment: ReportAssessment | null; tests: { test: Test; value: string | null }[] }`

- [ ] **Step 1: Schrijf de falende test voor `buildBulkTestRows`**

Create `src/data/rapporten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBulkTestRows } from "./rapporten";

describe("buildBulkTestRows", () => {
  it("maakt één rij per klas × rapport-combinatie", () => {
    const rows = buildBulkTestRows({
      name: "Soera-toets", grade_type: "cijfer",
      classIds: ["c1", "c2"], reportPeriodIds: ["r1", "r2"],
    });
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ class_id: "c1", report_period_id: "r1", name: "Soera-toets", grade_type: "cijfer" });
    expect(rows).toContainEqual({ class_id: "c2", report_period_id: "r2", name: "Soera-toets", grade_type: "cijfer" });
  });

  it("geeft geen rijen zonder klas of zonder rapport", () => {
    expect(buildBulkTestRows({ name: "x", grade_type: "schaal", classIds: [], reportPeriodIds: ["r1"] })).toHaveLength(0);
    expect(buildBulkTestRows({ name: "x", grade_type: "schaal", classIds: ["c1"], reportPeriodIds: [] })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run de test — verwacht falen**

Run: `npm run test -- src/data/rapporten.test.ts`
Expected: FAIL ("buildBulkTestRows is not a function" / module bestaat niet).

- [ ] **Step 3: Schrijf `src/data/rapporten.ts`**

```ts
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
```

- [ ] **Step 4: Run de test — verwacht slagen**

Run: `npm run test -- src/data/rapporten.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/rapporten.ts src/data/rapporten.test.ts
git commit -m "feat(data): rapporten datalaag (perioden, toetsen, beoordelingen)"
```

---

### Task 4: ToetsenTab + koppeling in ClassDetail

**Files:**
- Create: `src/features/class-admin/ToetsenTab.tsx`
- Modify: `src/features/classes/ClassDetail.tsx`

**Interfaces:**
- Consumes: `useClassTests`, `useReportPeriods`, `useCreateTest`, `useUpdateTest`, `useDeleteTest` (Task 3).
- Produces: `export function ToetsenTab({ classId }: { classId: string })`.

- [ ] **Step 1: Schrijf `src/features/class-admin/ToetsenTab.tsx`**

```tsx
import { useState } from "react";
import { Card, Btn, Icon, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useClassTests, useReportPeriods, useCreateTest, useUpdateTest, useDeleteTest, type Test } from "@/data/rapporten";

const TYPE_LABEL: Record<string, string> = { cijfer: "Cijfer (1–10)", schaal: "Schaal" };

export function ToetsenTab({ classId }: { classId: string }) {
  const toast = useToast();
  const { data: tests, isLoading } = useClassTests(classId);
  const { data: periods } = useReportPeriods();
  const createTest = useCreateTest();
  const updateTest = useUpdateTest();
  const deleteTest = useDeleteTest();

  const [editing, setEditing] = useState<Test | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", grade_type: "cijfer", report_period_id: "" });

  const openAdd = () => { setForm({ name: "", grade_type: "cijfer", report_period_id: periods?.[0]?.id ?? "" }); setAdding(true); };
  const openEdit = (t: Test) => { setForm({ name: t.name, grade_type: t.grade_type, report_period_id: t.report_period_id }); setEditing(t); };

  const save = async () => {
    try {
      if (editing) {
        await updateTest.mutateAsync({ id: editing.id, patch: { name: form.name, grade_type: form.grade_type, report_period_id: form.report_period_id } });
        toast("Toets bijgewerkt");
      } else {
        await createTest.mutateAsync({ class_id: classId, report_period_id: form.report_period_id, name: form.name, grade_type: form.grade_type });
        toast("Toets toegevoegd");
      }
      setAdding(false); setEditing(null);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const remove = async (t: Test) => {
    if (!confirm(`Toets "${t.name}" verwijderen? Ingevulde cijfers gaan verloren.`)) return;
    try { await deleteTest.mutateAsync(t.id); toast("Toets verwijderd"); }
    catch (e) { toast("Verwijderen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  if (isLoading) return <Loading label="Toetsen laden…" />;
  const open = adding || !!editing;

  return (
    <Card title={<><Icon name="edit" size={14} /> Toetsen</>} sub="Toetsen per rapportperiode voor deze klas"
      action={<Btn size="sm" icon="plus" onClick={openAdd} disabled={!periods?.length}>Toets toevoegen</Btn>}>
      {open && (
        <Modal title={editing ? "Toets bewerken" : "Toets toevoegen"} sub="Naam, beoordelingstype en rapport"
          onClose={() => { setAdding(false); setEditing(null); }}
          footer={<ModalFooter onCancel={() => { setAdding(false); setEditing(null); }} onSave={save}
            saving={createTest.isPending || updateTest.isPending} disabled={!form.name.trim() || !form.report_period_id} />}>
          <Field label="Naam"><input className="input" value={form.name} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="bv. Soera Al-Fatiha" /></Field>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Beoordelingstype"><Select value={form.grade_type} onChange={(e) => setForm((f) => ({ ...f, grade_type: e.target.value }))}>
              <option value="cijfer">Cijfer (1–10)</option><option value="schaal">Schaal</option></Select></Field>
            <Field label="Rapport"><Select value={form.report_period_id} onChange={(e) => setForm((f) => ({ ...f, report_period_id: e.target.value }))}>
              {(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
        </Modal>
      )}

      {!periods?.length ? (
        <div className="empty">Er zijn nog geen rapportperioden. Voeg ze toe via Administratie → Toetsen.</div>
      ) : !tests?.length ? (
        <div className="empty">Nog geen toetsen voor deze klas. Voeg een toets toe.</div>
      ) : (
        (periods ?? []).map((p) => {
          const group = (tests ?? []).filter((t) => t.report_period_id === p.id);
          if (!group.length) return null;
          return (
            <div key={p.id} style={{ marginBottom: 16 }}>
              <div className="sidebar-group" style={{ paddingLeft: 0 }}>{p.name}</div>
              <table className="table">
                <thead><tr><th>Naam</th><th style={{ width: 1, whiteSpace: "nowrap" }}>Type</th><th style={{ width: 1 }}></th></tr></thead>
                <tbody>
                  {group.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.name}</td>
                      <td className="text-sm">{TYPE_LABEL[t.grade_type] ?? t.grade_type}</td>
                      <td><div className="flex gap-1">
                        <Btn size="sm" kind="ghost" icon="edit" onClick={() => openEdit(t)} />
                        <Btn size="sm" kind="ghost" icon="trash" onClick={() => remove(t)} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Koppel de tab in `src/features/classes/ClassDetail.tsx`**

Wijzig het `Tab`-type (regel 18):

```tsx
type Tab = "overview" | "attendance" | "quranadmin" | "lessons" | "students" | "quran" | "toetsen" | "beoordelingen";
```

Voeg de import toe bij de overige feature-imports (na regel 16):

```tsx
import { ToetsenTab } from "@/features/class-admin/ToetsenTab";
```

Voeg twee opties toe aan de `tabs`-array (na de "quran"-optie, regel 66):

```tsx
    { value: "toetsen", label: "Toetsen" },
    { value: "beoordelingen", label: "Beoordelingen" },
```

Voeg de rendering toe (na de `quran`-regel, regel 91):

```tsx
      {tab === "toetsen" && <ToetsenTab classId={c.id} />}
```

(De `beoordelingen`-rendering volgt in Task 5.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Handmatige check**

Run: `npm run dev`, open een klas → tab "Toetsen". Voeg een toets toe (Cijfer + Rapport 1). Verwacht: toets verschijnt onder "Rapport 1"; bewerken/verwijderen werkt.

- [ ] **Step 5: Commit**

```bash
git add src/features/class-admin/ToetsenTab.tsx src/features/classes/ClassDetail.tsx
git commit -m "feat(klassen): Toetsen-tab voor aanmaken/beheren van toetsen"
```

---

### Task 5: BeoordelingenTab (inline-raster) + koppeling

**Files:**
- Create: `src/features/class-admin/BeoordelingenTab.tsx`
- Modify: `src/features/classes/ClassDetail.tsx`

**Interfaces:**
- Consumes: `useReportPeriods`, `useReportGrades`, `useSaveReportGrades`, `SCHAAL`, `type AssessmentUpsert`, `type GradeUpsert` (Task 3); `ClassLeerling` (`@/data/classDetail`).
- Produces: `export function BeoordelingenTab({ classId, leerlingen }: { classId: string; leerlingen: ClassLeerling[] })`.

- [ ] **Step 1: Schrijf `src/features/class-admin/BeoordelingenTab.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Card, Pills, Btn, Select, type Option } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import type { ClassLeerling } from "@/data/classDetail";
import {
  SCHAAL, useReportPeriods, useReportGrades, useSaveReportGrades,
  type AssessmentUpsert, type GradeUpsert,
} from "@/data/rapporten";

interface AssessRow { quran: string; gedrag: string; inzet: string; opmerking: string }
const EMPTY: AssessRow = { quran: "", gedrag: "", inzet: "", opmerking: "" };

function SchaalSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 130 }}>
      <option value="">—</option>
      {SCHAAL.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
}

export function BeoordelingenTab({ classId, leerlingen }: { classId: string; leerlingen: ClassLeerling[] }) {
  const { data: periods, isLoading: periodsLoading } = useReportPeriods();
  const [periodId, setPeriodId] = useState<string>("");

  useEffect(() => {
    if (periods?.length && !periods.some((p) => p.id === periodId)) setPeriodId(periods[0].id);
  }, [periods, periodId]);

  if (periodsLoading) return <Loading label="Rapporten laden…" />;
  if (!periods?.length) return <Card><div className="empty">Er zijn nog geen rapportperioden. Voeg ze toe via Administratie → Toetsen.</div></Card>;
  if (!leerlingen.length) return <Card><div className="empty">Deze klas heeft nog geen leerlingen.</div></Card>;

  const periodOptions: Option[] = periods.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="flex-col gap-4">
      <Pills value={periodId} onChange={setPeriodId} options={periodOptions} />
      {periodId && <GradeGrid key={periodId} classId={classId} reportPeriodId={periodId} leerlingen={leerlingen} />}
    </div>
  );
}

function GradeGrid({ classId, reportPeriodId, leerlingen }: { classId: string; reportPeriodId: string; leerlingen: ClassLeerling[] }) {
  const toast = useToast();
  const { data, isLoading } = useReportGrades(classId, reportPeriodId);
  const saveGrades = useSaveReportGrades();

  const [assess, setAssess] = useState<Record<string, AssessRow>>({});
  const [grades, setGrades] = useState<Record<string, string>>({}); // key `${testId}:${leerlingId}`

  useEffect(() => {
    const a: Record<string, AssessRow> = {};
    for (const l of leerlingen) {
      const e = data?.assessments[l.id];
      a[l.id] = e ? { quran: e.quran ?? "", gedrag: e.gedrag ?? "", inzet: e.inzet ?? "", opmerking: e.opmerking ?? "" } : { ...EMPTY };
    }
    setAssess(a);
    const g: Record<string, string> = {};
    for (const t of data?.tests ?? [])
      for (const l of leerlingen) g[`${t.id}:${l.id}`] = data?.grades[`${t.id}:${l.id}`] ?? "";
    setGrades(g);
  }, [data, leerlingen]);

  const setA = (id: string, key: keyof AssessRow, val: string) => setAssess((s) => ({ ...s, [id]: { ...s[id], [key]: val } }));
  const setG = (key: string, val: string) => setGrades((s) => ({ ...s, [key]: val }));

  const save = async () => {
    const assessments: AssessmentUpsert[] = leerlingen.map((l) => ({
      leerling_id: l.id, report_period_id: reportPeriodId,
      quran: assess[l.id]?.quran || null, gedrag: assess[l.id]?.gedrag || null,
      inzet: assess[l.id]?.inzet || null, opmerking: assess[l.id]?.opmerking || null,
    }));
    const gradeRows: GradeUpsert[] = [];
    for (const t of data?.tests ?? [])
      for (const l of leerlingen) {
        const v = grades[`${t.id}:${l.id}`];
        gradeRows.push({ test_id: t.id, leerling_id: l.id, value: v ? v : null });
      }
    try {
      await saveGrades.mutateAsync({ classId, reportPeriodId, assessments, grades: gradeRows });
      toast(`Beoordelingen opgeslagen voor ${leerlingen.length} leerlingen`);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  if (isLoading) return <Loading label="Beoordelingen laden…" />;
  const tests = data?.tests ?? [];

  return (
    <Card>
      <div className="flex items-center justify-end mb-4">
        <Btn size="sm" kind="primary" icon="check" disabled={saveGrades.isPending} onClick={save}>
          {saveGrades.isPending ? "Opslaan…" : "Opslaan"}
        </Btn>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--bg-elev)", zIndex: 1 }}>Leerling</th>
              <th>Quran</th><th>Gedrag</th><th>Inzet</th><th>Opmerking</th>
              {tests.map((t) => <th key={t.id} style={{ whiteSpace: "nowrap" }}>{t.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {leerlingen.map((l) => {
              const a = assess[l.id] ?? EMPTY;
              return (
                <tr key={l.id}>
                  <td style={{ position: "sticky", left: 0, background: "var(--bg-elev)", zIndex: 1 }}>
                    <div className="flex items-center gap-3">
                      <div className="avatar sm">{l.kinderen?.initials}</div>
                      <span className="font-semibold text-sm">{l.kinderen?.full_name}</span>
                    </div>
                  </td>
                  <td><SchaalSelect value={a.quran} onChange={(v) => setA(l.id, "quran", v)} /></td>
                  <td><SchaalSelect value={a.gedrag} onChange={(v) => setA(l.id, "gedrag", v)} /></td>
                  <td><SchaalSelect value={a.inzet} onChange={(v) => setA(l.id, "inzet", v)} /></td>
                  <td><input className="input" value={a.opmerking} placeholder="Optionele opmerking…"
                    onChange={(e) => setA(l.id, "opmerking", e.target.value)} style={{ minWidth: 180 }} /></td>
                  {tests.map((t) => {
                    const key = `${t.id}:${l.id}`;
                    return (
                      <td key={t.id}>
                        {t.grade_type === "schaal"
                          ? <SchaalSelect value={grades[key] ?? ""} onChange={(v) => setG(key, v)} />
                          : <input className="input" value={grades[key] ?? ""} placeholder="—"
                              onChange={(e) => setG(key, e.target.value)} style={{ width: 70 }} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Koppel de tab in `src/features/classes/ClassDetail.tsx`**

Voeg de import toe (bij de feature-imports):

```tsx
import { BeoordelingenTab } from "@/features/class-admin/BeoordelingenTab";
```

Voeg de rendering toe direct na de `toetsen`-regel uit Task 4:

```tsx
      {tab === "beoordelingen" && <BeoordelingenTab classId={c.id} leerlingen={leerlingen} />}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Handmatige check**

Run: `npm run dev`. Open klas → tab "Beoordelingen". Wissel rapportperiode via de pills. Vul Quran/Gedrag/Inzet (schaal), Opmerking en een toetscijfer in → "Opslaan". Herlaad de pagina → waarden blijven staan.

- [ ] **Step 5: Commit**

```bash
git add src/features/class-admin/BeoordelingenTab.tsx src/features/classes/ClassDetail.tsx
git commit -m "feat(klassen): Beoordelingen-tab met inline cijferraster per rapport"
```

---

### Task 6: Admin-pagina "Toetsen" + route + sidebar

**Files:**
- Create: `src/features/admin-tests/AdminToetsen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/chrome/Sidebar.tsx`

**Interfaces:**
- Consumes: `useReportPeriods`, `useCreateReportPeriod`, `useUpdateReportPeriod`, `useAllTests`, `useDeleteTest`, `useBulkCreateTests` (Task 3); `useClasses` (`@/data/classes`), `useCurrentSchooljaar` (`@/data/schooljaren`).
- Produces: `export function AdminToetsen()`; route `/admin-toetsen`.

- [ ] **Step 1: Schrijf `src/features/admin-tests/AdminToetsen.tsx`**

```tsx
import { useState } from "react";
import { Section, Card, Btn, Icon, Select } from "@/components/ui";
import { Field } from "@/components/ui/Modal";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useClasses } from "@/data/classes";
import { useCurrentSchooljaar } from "@/data/schooljaren";
import {
  useReportPeriods, useCreateReportPeriod, useUpdateReportPeriod,
  useAllTests, useDeleteTest, useBulkCreateTests,
} from "@/data/rapporten";

export function AdminToetsen() {
  return (
    <Section title="Toetsen" sub="Maak toetsen in bulk aan en beheer rapportperioden">
      <div className="flex-col gap-4">
        <BulkCreate />
        <AllTests />
        <PeriodManager />
      </div>
    </Section>
  );
}

function BulkCreate() {
  const toast = useToast();
  const sj = useCurrentSchooljaar();
  const { data: classes, isLoading } = useClasses(sj.data?.id ?? null);
  const { data: periods } = useReportPeriods();
  const bulk = useBulkCreateTests();

  const [name, setName] = useState("");
  const [gradeType, setGradeType] = useState("cijfer");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [periodIds, setPeriodIds] = useState<string[]>([]);

  const toggle = (arr: string[], id: string) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const create = async () => {
    try {
      const n = await bulk.mutateAsync({ name: name.trim(), grade_type: gradeType, classIds, reportPeriodIds: periodIds });
      toast(`${n} toets(en) aangemaakt`);
      setName(""); setClassIds([]); setPeriodIds([]);
    } catch (e) { toast("Aanmaken mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const canSave = name.trim() && classIds.length && periodIds.length;

  return (
    <Card title={<><Icon name="plus" size={14} /> Toets in bulk aanmaken</>} sub="Eén toets toepassen op meerdere klassen × rapporten">
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Naam"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Soera-toets" /></Field>
        <Field label="Beoordelingstype"><Select value={gradeType} onChange={(e) => setGradeType(e.target.value)}>
          <option value="cijfer">Cijfer (1–10)</option><option value="schaal">Schaal</option></Select></Field>
      </div>
      <div className="grid-2 mt-3">
        <div>
          <div className="text-xs text-subtle mb-2">Klassen ({sj.data?.name ?? "huidig schooljaar"})</div>
          {isLoading ? <Loading /> : !classes?.length ? <div className="empty">Geen klassen.</div> : (
            <div className="flex-col gap-1">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => setClassIds((a) => toggle(a, c.id))} />
                  {c.code}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-subtle mb-2">Rapporten</div>
          <div className="flex-col gap-1">
            {(periods ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={periodIds.includes(p.id)} onChange={() => setPeriodIds((a) => toggle(a, p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Btn kind="primary" icon="check" disabled={!canSave || bulk.isPending} onClick={create}>
          {bulk.isPending ? "Aanmaken…" : `Aanmaken (${classIds.length * periodIds.length})`}
        </Btn>
      </div>
    </Card>
  );
}

function AllTests() {
  const toast = useToast();
  const { data: tests, isLoading } = useAllTests();
  const del = useDeleteTest();
  const remove = async (id: string, label: string) => {
    if (!confirm(`Toets "${label}" verwijderen? Ingevulde cijfers gaan verloren.`)) return;
    try { await del.mutateAsync(id); toast("Toets verwijderd"); }
    catch (e) { toast("Verwijderen mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  return (
    <Card title="Alle toetsen" sub="Overzicht over alle klassen">
      {isLoading ? <Loading /> : !tests?.length ? <div className="empty">Nog geen toetsen aangemaakt.</div> : (
        <table className="table">
          <thead><tr><th>Klas</th><th>Rapport</th><th>Naam</th><th>Type</th><th style={{ width: 1 }}></th></tr></thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id}>
                <td className="font-semibold">{t.classes?.code ?? "—"}</td>
                <td className="text-sm">{t.report_periods?.name ?? "—"}</td>
                <td>{t.name}</td>
                <td className="text-sm">{t.grade_type === "cijfer" ? "Cijfer (1–10)" : "Schaal"}</td>
                <td><Btn size="sm" kind="ghost" icon="trash" onClick={() => remove(t.id, t.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function PeriodManager() {
  const toast = useToast();
  const { data: periods, isLoading } = useReportPeriods();
  const create = useCreateReportPeriod();
  const update = useUpdateReportPeriod();
  const [newName, setNewName] = useState("");

  const add = async () => {
    if (!newName.trim()) return;
    const ord = (periods?.length ? Math.max(...periods.map((p) => p.ord)) : 0) + 1;
    try { await create.mutateAsync({ name: newName.trim(), ord }); setNewName(""); toast("Rapport toegevoegd"); }
    catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  const rename = async (id: string, name: string) => { try { await update.mutateAsync({ id, patch: { name } }); } catch { /* stil */ } };
  const archive = async (id: string, name: string) => {
    if (!confirm(`Rapport "${name}" archiveren? Het verdwijnt uit de lijsten.`)) return;
    try { await update.mutateAsync({ id, patch: { archived: true } }); toast("Rapport gearchiveerd"); }
    catch (e) { toast("Archiveren mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  const move = async (id: string, ord: number) => { try { await update.mutateAsync({ id, patch: { ord } }); } catch { /* stil */ } };

  return (
    <Card title={<><Icon name="settings" size={14} /> Rapportperioden beheren</>} sub="Naam en volgorde van de rapporten">
      {isLoading ? <Loading /> : (
        <table className="table">
          <thead><tr><th style={{ width: 1 }}>Volgorde</th><th>Naam</th><th style={{ width: 1 }}></th></tr></thead>
          <tbody>
            {(periods ?? []).map((p) => (
              <tr key={p.id}>
                <td><input className="input" type="number" defaultValue={p.ord} style={{ width: 70 }}
                  onBlur={(e) => { const v = parseInt(e.target.value); if (!Number.isNaN(v) && v !== p.ord) move(p.id, v); }} /></td>
                <td><input className="input" defaultValue={p.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) rename(p.id, v); }} /></td>
                <td><Btn size="sm" kind="ghost" icon="trash" onClick={() => archive(p.id, p.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2 mt-3">
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nieuw rapport, bv. Tussenrapport" />
        <Btn kind="primary" icon="plus" disabled={!newName.trim() || create.isPending} onClick={add}>Toevoegen</Btn>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Registreer de route in `src/App.tsx`**

Voeg de import toe (bij de feature-imports, na regel 24):

```tsx
import { AdminToetsen } from "@/features/admin-tests/AdminToetsen";
```

Voeg binnen het `<Route element={<RequireAdmin />}>`-blok een route toe (bv. na de `/settings`-regel):

```tsx
                  <Route path="/admin-toetsen" element={<AdminToetsen />} />
```

- [ ] **Step 3: Voeg het sidebar-item toe in `src/components/chrome/Sidebar.tsx`**

In de admin-tak van `items` (de `else`-array), binnen de groep "Administratie" (na de `/finance`-regel, regel 30):

```tsx
        { to: "/admin-toetsen", label: "Toetsen", icon: "edit" },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Als `icon="edit"` of `"trash"` niet bestaat als `IconName`, kies een bestaand icoon uit `@/components/ui` — bv. `"book"` resp. `"x"`.)

- [ ] **Step 5: Handmatige check**

Run: `npm run dev`. Sidebar (admin) → Administratie → "Toetsen". Maak een toets aan over 2 klassen × 2 rapporten → "Alle toetsen" toont 4 rijen in de juiste klas/rapport. Voeg een rapportperiode toe en hernoem er één.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-tests/AdminToetsen.tsx src/App.tsx src/components/chrome/Sidebar.tsx
git commit -m "feat(admin): Toetsen-pagina (bulk aanmaken + rapportperioden beheren)"
```

---

### Task 7: Leerling-detail — read-only Toetsen-tab

**Files:**
- Modify: `src/features/students/LeerlingDetail.tsx`

**Interfaces:**
- Consumes: `useLeerlingReports`, `type LeerlingReport` (Task 3).
- Produces: lokaal component `LeerlingToetsen({ leerlingId })`.

- [ ] **Step 1: Voeg de import toe en vul de tab in `src/features/students/LeerlingDetail.tsx`**

Voeg bij de imports toe:

```tsx
import { useLeerlingReports, type LeerlingReport } from "@/data/rapporten";
```

Vervang de bestaande `tests`-tabregel (regel 79):

```tsx
      {tab === "tests" && <Card title="Toetsen" sub="Toetsmomenten en beoordelingen"><div className="empty">Nog geen toetsen geregistreerd voor deze leerling.</div></Card>}
```

door:

```tsx
      {tab === "tests" && <LeerlingToetsen leerlingId={l.id} />}
```

- [ ] **Step 2: Voeg het read-only component toe (onderaan `LeerlingDetail.tsx`)**

```tsx
function LeerlingToetsen({ leerlingId }: { leerlingId: string }) {
  const { data, isLoading } = useLeerlingReports(leerlingId);
  if (isLoading) return <Loading label="Beoordelingen laden…" />;
  const filled = (r: LeerlingReport) =>
    r.assessment?.quran || r.assessment?.gedrag || r.assessment?.inzet || r.assessment?.opmerking || r.tests.some((t) => t.value);
  const any = (data ?? []).some(filled);
  if (!any) return <Card title="Toetsen" sub="Toetsmomenten en beoordelingen"><div className="empty">Nog geen beoordelingen ingevuld voor deze leerling.</div></Card>;

  return (
    <div className="flex-col gap-4">
      {(data ?? []).filter(filled).map((r) => (
        <Card key={r.period.id} title={r.period.name} sub="Beoordelingen">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, fontSize: 13, marginBottom: r.tests.length ? 16 : 0 }}>
            {([["Quran", r.assessment?.quran], ["Gedrag", r.assessment?.gedrag], ["Inzet", r.assessment?.inzet]] as const).map(([k, v]) => (
              <div key={k}><div className="text-xs text-subtle mb-1">{k}</div><div className="font-semibold">{v || "—"}</div></div>
            ))}
            {r.assessment?.opmerking && (
              <div style={{ gridColumn: "1 / -1" }}><div className="text-xs text-subtle mb-1">Opmerking</div><div>{r.assessment.opmerking}</div></div>
            )}
          </div>
          {r.tests.length > 0 && (
            <table className="table">
              <thead><tr><th>Toets</th><th>Type</th><th>Resultaat</th></tr></thead>
              <tbody>
                {r.tests.map((t) => (
                  <tr key={t.test.id}>
                    <td className="font-semibold">{t.test.name}</td>
                    <td className="text-sm">{t.test.grade_type === "cijfer" ? "Cijfer (1–10)" : "Schaal"}</td>
                    <td className="num">{t.value || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Handmatige check**

Run: `npm run dev`. Open een leerling waarvoor je in Task 5 cijfers invulde → tab "Toetsen" → toont per rapport de oordelen + toetsresultaten (read-only).

- [ ] **Step 5: Commit**

```bash
git add src/features/students/LeerlingDetail.tsx
git commit -m "feat(leerling): read-only beoordelingen-overzicht per rapport"
```

---

## Eindverificatie

- [ ] `npm run test` — pure-logic tests slagen.
- [ ] `npm run build` — `tsc -b` + vite build slagen zonder fouten.
- [ ] Handmatige end-to-end: toets aanmaken (klas) → kolom in Beoordelingen → invullen + opslaan → herladen toont waarde → read-only zichtbaar op leerling-detail.
- [ ] Admin bulk: toets over 2 klassen × 2 rapporten → 4 rijen, juiste klas/rapport.
- [ ] (Indien testaccount beschikbaar) docent op eigen klas kan toetsen/beoordelingen lezen + opslaan; geen toegang tot andere klassen.
```
