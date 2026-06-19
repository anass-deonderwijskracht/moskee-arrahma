import { useEffect, useState } from "react";
import { Card, Pills, Btn, Select, type Option } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import type { ClassLeerling } from "@/data/classDetail";
import {
  SCHAAL, useReportPeriods, useReportGrades, useSaveReportGrades,
  type AssessmentUpsert, type GradeUpsert,
} from "@/data/rapporten";
import { RapportGenerator } from "@/features/class-admin/RapportGenerator";

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
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (periods?.length && !periods.some((p) => p.id === periodId)) setPeriodId(periods[0].id);
  }, [periods, periodId]);

  if (periodsLoading) return <Loading label="Rapporten laden…" />;
  if (!periods?.length) return <Card><div className="empty">Er zijn nog geen rapportperioden. Voeg ze toe via Administratie → Toetsen.</div></Card>;
  if (!leerlingen.length) return <Card><div className="empty">Deze klas heeft nog geen leerlingen.</div></Card>;

  const periodOptions: Option[] = periods.map((p) => ({ value: p.id, label: p.name }));
  const periodName = periods.find((p) => p.id === periodId)?.name ?? "Rapport";

  return (
    <div className="flex-col gap-4">
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <Pills value={periodId} onChange={setPeriodId} options={periodOptions} />
        <Btn kind="primary" icon="download" onClick={() => setGenerating(true)} disabled={!periodId}>PDF genereren</Btn>
      </div>
      {periodId && <GradeGrid key={periodId} classId={classId} reportPeriodId={periodId} leerlingen={leerlingen} />}
      {generating && periodId && (
        <RapportGenerator classId={classId} reportPeriodId={periodId} periodName={periodName}
          leerlingen={leerlingen} onClose={() => setGenerating(false)} />
      )}
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
