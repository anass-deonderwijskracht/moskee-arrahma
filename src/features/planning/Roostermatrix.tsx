import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Btn, Badge, Select } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { usePlanningMatrix, useSaveLessons, type LessonPatch } from "@/data/planning";
import { useTeachers } from "@/data/people";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";

type CellState = { teacher_id: string | null; quran_teacher_id: string | null; type: string; teacher_na: boolean; quran_na: boolean };
const TYPE_LABEL: Record<string, string> = { les: "Les", vrij: "Vrij", toets: "Toets", activiteit: "Activiteit" };
const TYPES = ["les", "vrij", "toets", "activiteit"];
const NA = "__na__"; // "Niet nodig" sentinel in the teacher selects
// Borderless, transparent cell select for a clean "chip" look.
const selSty = { fontSize: 12, padding: "4px 22px 4px 6px", width: "100%", border: "1px solid transparent", backgroundColor: "transparent" } as const;
const ddmmyy = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${String(d.getFullYear()).slice(2)}`; };

const PURPLE_SOFT = "oklch(0.94 0.05 300)"; // activiteit = paars
const YELLOW_SEL = "oklch(0.965 0.05 100)"; // subtiel geel bij selectie
const YELLOW_FLASH = "oklch(0.93 0.10 100)"; // iets sterker bij "huidige week"-flits

/** Is a 'les' cell missing a required teacher? "Niet nodig" telt als ingevuld. */
const missingTeacher = (st: CellState, track: string) =>
  st.type === "les" && ((!st.teacher_id && !st.teacher_na) || (track !== "hifdh" && !st.quran_teacher_id && !st.quran_na));

function cellBg(st: CellState, track: string): string | undefined {
  if (missingTeacher(st, track)) return "var(--danger-soft)";
  switch (st.type) {
    case "les": return "var(--info-soft)";
    case "toets": return "var(--warn-soft)";
    case "activiteit": return PURPLE_SOFT;
    case "vrij": return "var(--bg-sunken)";
    default: return undefined;
  }
}

export function Roostermatrix() {
  const toast = useToast();
  const { data: schooljaren } = useSchooljaren();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? current?.id ?? null;

  const { data, isLoading, isError, error } = usePlanningMatrix(effectiveSj);
  const { data: teachers } = useTeachers();
  const save = useSaveLessons(effectiveSj);

  const classes = data?.classes ?? [];
  const weeks = data?.weeks ?? [];
  const byKey = data?.byKey ?? {};

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set(TYPES));
  const [edits, setEdits] = useState<Record<string, CellState>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [flashWeek, setFlashWeek] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Select all classes by default once they load.
  useEffect(() => {
    if (classes.length) setSelected((prev) => (prev.size ? prev : new Set(classes.map((c) => c.id))));
  }, [classes]);
  // Reset local edits when the dataset changes (year switch / save refetch).
  useEffect(() => { setEdits({}); setDirty(new Set()); }, [data]);

  const teacherOpts = useMemo(() => (teachers ?? []).map((t) => ({ id: t.id, label: t.short || t.name })), [teachers]);

  if (isError) return <ErrorState error={error} />;

  // Selected classes only (always — geen losse toggle meer).
  const visibleClasses = classes.filter((c) => selected.has(c.id));

  const cell = (classId: string, week: number): CellState | null => {
    const lesson = byKey[`${classId}|${week}`];
    if (!lesson) return null;
    return edits[lesson.id] ?? { teacher_id: lesson.teacher_id, quran_teacher_id: lesson.quran_teacher_id, type: lesson.type, teacher_na: lesson.teacher_na, quran_na: lesson.quran_na };
  };

  const setCell = (lessonId: string, patch: Partial<CellState>) => {
    setEdits((prev) => {
      const base = prev[lessonId] ?? (() => {
        const l = Object.values(byKey).find((x) => x.id === lessonId)!;
        return { teacher_id: l.teacher_id, quran_teacher_id: l.quran_teacher_id, type: l.type, teacher_na: l.teacher_na, quran_na: l.quran_na };
      })();
      const next = { ...base, ...patch };
      if (next.type === "vrij") { next.teacher_id = null; next.quran_teacher_id = null; next.teacher_na = false; next.quran_na = false; } // vrij = geen docenten
      return { ...prev, [lessonId]: next };
    });
    setDirty((d) => new Set(d).add(lessonId));
  };

  // Weeks that contain at least one visible-class cell whose type passes the type filter.
  const visibleWeeks = weeks.filter((w) => visibleClasses.some((c) => { const st = cell(c.id, w.week_nr); return st && typeFilter.has(st.type); }));
  const toggleType = (t: string) => setTypeFilter((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n.size === 0 ? new Set(TYPES) : n; });

  // Bulk over the SELECTED classes × SELECTED weeks.
  const bulkOverSelection = (apply: (lessonId: string, classTrack: string) => void): number => {
    let n = 0;
    for (const c of classes) {
      if (!selected.has(c.id)) continue;
      for (const wk of selectedWeeks) {
        const lesson = byKey[`${c.id}|${wk}`];
        if (!lesson) continue;
        apply(lesson.id, c.track); n++;
      }
    }
    return n;
  };
  const bulkType = (type: string) => { const n = bulkOverSelection((id) => setCell(id, { type })); toast(`${n} les(sen) → ${TYPE_LABEL[type]} — vergeet niet op te slaan`); };
  const bulkAssign = (field: "teacher_id" | "quran_teacher_id", value: string) => {
    const naField = field === "teacher_id" ? "teacher_na" : "quran_na";
    const n = bulkOverSelection((id, track) => {
      if (field === "quran_teacher_id" && track === "hifdh") return; // hifdh: 1 docent
      const eff = edits[id] ?? Object.values(byKey).find((x) => x.id === id)!;
      if (eff.type === "vrij") return;
      if (value === NA) setCell(id, { [field]: null, [naField]: true } as Partial<CellState>);
      else setCell(id, { [field]: value, [naField]: false } as Partial<CellState>);
    });
    toast(`${n} les(sen) bijgewerkt — vergeet niet op te slaan`);
  };

  const toggleClass = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleWeek = (wk: number) => setSelectedWeeks((prev) => {
    const n = new Set(prev); n.has(wk) ? n.delete(wk) : n.add(wk); return n;
  });

  // Week whose date is closest to today.
  const currentWeek = useMemo(() => {
    if (!weeks.length) return null;
    const now = Date.now();
    return weeks.reduce((best, w) => Math.abs(new Date(w.date).getTime() - now) < Math.abs(new Date(best.date).getTime() - now) ? w : best, weeks[0]);
  }, [weeks]);

  const goToCurrentWeek = () => {
    if (!currentWeek) return;
    rowRefs.current[currentWeek.week_nr]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashWeek(currentWeek.week_nr);
    setTimeout(() => setFlashWeek(null), 1200);
  };

  const onSave = async () => {
    const updates: LessonPatch[] = [...dirty].map((id) => ({ id, ...edits[id] }));
    try { await save.mutateAsync(updates); toast(`${updates.length} les(sen) opgeslagen`); }
    catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  if (isLoading) return <Loading label="Rooster laden…" />;

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Klassen:</span>
            {classes.map((c) => {
              const on = selected.has(c.id);
              return (
                <button key={c.id} onClick={() => toggleClass(c.id)}
                  style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (on ? "var(--primary)" : "var(--border)"), background: on ? "var(--primary-soft)" : "var(--bg-elev)", color: on ? "var(--primary)" : "var(--fg-muted)" }}>
                  {c.code}{c.track === "hifdh" ? " (H)" : ""}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Btn kind="ghost" icon="calendar" onClick={goToCurrentWeek} disabled={!currentWeek}>Huidige week</Btn>
            <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: "auto", minWidth: 120 }}>
              {(schooljaren ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (huidig)" : ""}</option>)}
            </Select>
            <Btn kind="primary" icon="check" disabled={dirty.size === 0 || save.isPending} onClick={onSave}>
              {save.isPending ? "Opslaan…" : `Opslaan${dirty.size ? ` (${dirty.size})` : ""}`}
            </Btn>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ flexWrap: "wrap", fontSize: 12, color: "var(--fg-muted)" }}>
          <span className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Type:</span>
          {TYPES.map((t) => {
            const on = typeFilter.has(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                style={{ padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (on ? "var(--primary)" : "var(--border)"), background: on ? "var(--primary-soft)" : "var(--bg-elev)", color: on ? "var(--primary)" : "var(--fg-muted)" }}>
                {TYPE_LABEL[t]}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto" }} className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--bg-sunken)", border: "1px solid var(--border)" }} /> Vrij</span>
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--warn-soft)", border: "1px solid var(--warn)" }} /> Toets</span>
            <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--info-soft)", border: "1px solid var(--info)" }} /> Activiteit</span>
          </span>
        </div>

        <div className="divider mt-3 mb-3" />
        {(() => {
          const noSel = selectedWeeks.size === 0;
          return (
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", opacity: noSel ? 0.5 : 1 }}>
              <span className="text-xs font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em", color: noSel ? "var(--fg-subtle)" : "var(--primary)" }}>
                {noSel ? "Bulk · selecteer eerst weken" : `Bulk · ${selected.size} klas(sen) × ${selectedWeeks.size} ${selectedWeeks.size === 1 ? "week" : "weken"}:`}
              </span>
              <Select value="" disabled={noSel} onChange={(e) => { if (e.target.value) bulkType(e.target.value); e.currentTarget.value = ""; }} style={{ width: "auto", minWidth: 130 }}>
                <option value="">Type instellen…</option>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Select value="" disabled={noSel} onChange={(e) => { if (e.target.value) bulkAssign("teacher_id", e.target.value); e.currentTarget.value = ""; }} style={{ width: "auto", minWidth: 170 }}>
                <option value="">Les-docent inzetten…</option>
                <option value={NA}>Niet nodig</option>
                {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
              <Select value="" disabled={noSel} onChange={(e) => { if (e.target.value) bulkAssign("quran_teacher_id", e.target.value); e.currentTarget.value = ""; }} style={{ width: "auto", minWidth: 170 }}>
                <option value="">Qur'an-docent inzetten…</option>
                <option value={NA}>Niet nodig</option>
                {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
              {!noSel && <button className="btn ghost sm" onClick={() => setSelectedWeeks(new Set())}>Weken deselecteren</button>}
            </div>
          );
        })()}
      </Card>

      <Card title="Docentenrooster per lesweek" sub="Kies per klas/week de les- en Qur'an-docent. Markeer weken als vrij/toets voor de geselecteerde klassen.">
        {weeks.length === 0 ? <div className="empty">Geen lessen gevonden voor dit schooljaar.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--bg-sunken)", zIndex: 3, minWidth: 150, width: 150 }}>
                    <label className="flex items-center gap-2" style={{ cursor: "pointer", textTransform: "none", letterSpacing: 0 }} title="Alle weken selecteren">
                      <input type="checkbox" checked={weeks.length > 0 && selectedWeeks.size === weeks.length} onChange={(e) => setSelectedWeeks(e.target.checked ? new Set(weeks.map((w) => w.week_nr)) : new Set())} />
                      Lesweek
                    </label>
                  </th>
                  {visibleClasses.map((c) => (
                    <th key={c.id} style={{ minWidth: 128, whiteSpace: "nowrap" }}>
                      {c.code} {c.track === "hifdh" && <Badge kind="primary">H</Badge>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleWeeks.map((w) => {
                  const flashing = flashWeek === w.week_nr;
                  const weekHi = selectedWeeks.has(w.week_nr);
                  const rowYellow = flashing ? YELLOW_FLASH : weekHi ? YELLOW_SEL : null;
                  return (
                  <tr key={w.week_nr} ref={(el) => { rowRefs.current[w.week_nr] = el; }}>
                    <td style={{ position: "sticky", left: 0, background: rowYellow ?? "var(--bg-elev)", zIndex: 1, verticalAlign: "top", transition: "background 0.3s" }}>
                      <label className="flex items-center gap-2" style={{ cursor: "pointer" }} title="Week selecteren voor bulk">
                        <input type="checkbox" checked={selectedWeeks.has(w.week_nr)} onChange={() => toggleWeek(w.week_nr)} />
                        <span className="font-semibold">Week {w.week_nr}</span>
                      </label>
                      <div className="text-xs text-subtle font-mono" style={{ marginLeft: 22 }}>{ddmmyy(w.date)}</div>
                    </td>
                    {visibleClasses.map((c) => {
                      const st = cell(c.id, w.week_nr);
                      const lesson = byKey[`${c.id}|${w.week_nr}`];
                      if (!st || !lesson) return <td key={c.id} className="text-subtle" style={{ textAlign: "center" }}>—</td>;
                      const dirtyCell = dirty.has(lesson.id);
                      return (
                        <td key={c.id} style={{ verticalAlign: "top", position: "relative", background: rowYellow ?? cellBg(st, c.track), transition: "background 0.3s" }}>
                          {dirtyCell && <span title="Niet opgeslagen" style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 999, background: "var(--primary)" }} />}
                          <div className="flex-col gap-1">
                            <select className="select" value={st.type} title="Lestype" onChange={(e) => setCell(lesson.id, { type: e.target.value })} style={{ ...selSty, fontWeight: 500 }}>
                              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            {st.type !== "vrij" && (
                              <>
                                <CellTeacher label="les-docent" value={st.teacher_id} na={st.teacher_na} options={teacherOpts}
                                  onPick={(v) => setCell(lesson.id, v === NA ? { teacher_id: null, teacher_na: true } : { teacher_id: v || null, teacher_na: false })} />
                                {c.track !== "hifdh" && (
                                  <CellTeacher label="Qur'an-docent" value={st.quran_teacher_id} na={st.quran_na} options={teacherOpts}
                                    onPick={(v) => setCell(lesson.id, v === NA ? { quran_teacher_id: null, quran_na: true } : { quran_teacher_id: v || null, quran_na: false })} />
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CellTeacher({ label, value, na, options, onPick }: { label: string; value: string | null; na: boolean; options: { id: string; label: string }[]; onPick: (v: string) => void }) {
  return (
    <select className="select" title={label} style={na ? { ...selSty, fontStyle: "italic", color: "var(--fg-subtle)" } : selSty}
      value={na ? NA : (value ?? "")} onChange={(e) => onPick(e.target.value)}>
      <option value="">— {label} —</option>
      <option value={NA}>Niet nodig</option>
      {options.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
  );
}
