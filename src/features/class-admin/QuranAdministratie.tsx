import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Badge, Btn, Icon, Select } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { dateNL, useClassQuran, useSurahs, useSaveQuranSession, type Lesson, type ClassLeerling, type QuranAssignment } from "@/data/classDetail";
import { computeNextHomework, type SurahRef } from "./ayahEngine";

interface PrevEntry extends QuranAssignment { _eval: string | null }
interface NewEntry { surah_n: number; start_ayah: number; end_ayah: number; type: "new" | "revision"; _auto: boolean }
interface RowState { prev: PrevEntry[]; newAssignments: NewEntry[]; notes: string; afwezig: boolean }

export function QuranAdministratie({ classId, leerlingen, lesson, lessons, setLessonId }: {
  classId: string; leerlingen: ClassLeerling[]; lesson: Lesson; lessons: Lesson[]; setLessonId: (id: string) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: allAssignments, isLoading } = useClassQuran(classId);
  const { data: surahs } = useSurahs();
  const saveSession = useSaveQuranSession();

  const surahRefs: SurahRef[] = useMemo(() => (surahs ?? []).map((s) => ({ n: s.n, name: s.name, verses: s.verses })), [surahs]);
  const surahByN = useMemo(() => new Map(surahRefs.map((s) => [s.n, s])), [surahRefs]);
  const versesOf = (n: number) => surahByN.get(n)?.verses ?? 1;

  // Previous lesson = the lesson with the greatest date before the selected one.
  const previousLesson = useMemo(() => {
    const earlier = lessons.filter((l) => l.date < lesson.date);
    return earlier.length ? earlier[earlier.length - 1] : null;
  }, [lessons, lesson.date]);

  const initial = useMemo<Record<string, RowState>>(() => {
    const o: Record<string, RowState> = {};
    for (const l of leerlingen) {
      const prev = (allAssignments ?? [])
        .filter((a) => a.leerling_id === l.id && (previousLesson ? a.assigned_at_lesson_id === previousLesson.id : false))
        .map((a) => ({ ...a, _eval: a.evaluation }));
      o[l.id] = { prev, newAssignments: [], notes: "", afwezig: false };
    }
    return o;
  }, [allAssignments, leerlingen, previousLesson]);

  const [state, setState] = useState<Record<string, RowState>>({});
  useEffect(() => setState(initial), [initial]);

  const setNotes = (id: string, notes: string) => setState((s) => ({ ...s, [id]: { ...s[id], notes } }));

  const toggleAfwezig = (id: string) => setState((s) => {
    const ss = s[id];
    const afw = !ss.afwezig;
    if (afw) {
      const prev = ss.prev.map((a) => ({ ...a, _eval: null }));
      const lastNew = ss.prev.find((a) => a.type === "new");
      const newAssignments: NewEntry[] = lastNew
        ? [{ surah_n: lastNew.surah_n, start_ayah: lastNew.start_ayah, end_ayah: lastNew.end_ayah, type: "new", _auto: true }]
        : [];
      return { ...s, [id]: { ...ss, afwezig: true, prev, newAssignments } };
    }
    return { ...s, [id]: { ...ss, afwezig: false, newAssignments: ss.newAssignments.filter((n) => !n._auto) } };
  });

  const setEval = (id: string, assignmentId: string, value: string) => setState((s) => {
    const ss = s[id];
    const cur = ss.prev.find((a) => a.id === assignmentId);
    if (!cur) return s;
    const toggled = cur._eval === value;
    const next = toggled ? null : value;
    const prev = ss.prev.map((a) => (a.id === assignmentId ? { ...a, _eval: next } : a));
    // Only "new"-type evaluations (re)generate auto homework — revisions don't.
    if (cur.type !== "new") return { ...s, [id]: { ...ss, prev } };
    let newAssignments = ss.newAssignments.filter((n) => !n._auto);
    if (next) {
      const proposed = computeNextHomework(
        { surah_n: cur.surah_n, start_ayah: cur.start_ayah, end_ayah: cur.end_ayah, type: "new" },
        next as "yes" | "partial" | "no", surahRefs,
      );
      if (proposed) newAssignments = [{ ...proposed, type: "new", _auto: true }, ...newAssignments];
    }
    return { ...s, [id]: { ...ss, prev, newAssignments } };
  });

  const updateNew = (id: string, idx: number, patch: Partial<NewEntry>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], newAssignments: s[id].newAssignments.map((a, i) => (i === idx ? { ...a, ...patch, _auto: false } : a)) } }));
  const addNew = (id: string) =>
    setState((s) => ({ ...s, [id]: { ...s[id], newAssignments: [...s[id].newAssignments, { surah_n: 114, start_ayah: 1, end_ayah: 6, type: "revision", _auto: false }] } }));
  const removeNew = (id: string, idx: number) =>
    setState((s) => ({ ...s, [id]: { ...s[id], newAssignments: s[id].newAssignments.filter((_, i) => i !== idx) } }));

  const stats = useMemo(() => {
    let done = 0, open = 0;
    for (const l of leerlingen) {
      const st = state[l.id];
      if (!st) { open++; continue; }
      if (st.prev.length > 0 && st.prev.every((p) => p._eval)) done++; else open++;
    }
    return { done, open };
  }, [state, leerlingen]);

  const save = async () => {
    const evals: { id: string; evaluation: string | null; absent: boolean; evaluated_at_lesson_id: string }[] = [];
    const newAssignments: { leerling_id: string; class_id: string; assigned_at_lesson_id: string; surah_n: number; start_ayah: number; end_ayah: number; type: string; notes: string | null }[] = [];
    const progress: { leerling_id: string; surah_n: number; status: string }[] = [];
    for (const l of leerlingen) {
      const st = state[l.id]; if (!st) continue;
      for (const p of st.prev) {
        evals.push({ id: p.id, evaluation: p._eval, absent: st.afwezig, evaluated_at_lesson_id: lesson.id });
        if (p._eval === "yes") progress.push({ leerling_id: l.id, surah_n: p.surah_n, status: p.end_ayah >= versesOf(p.surah_n) ? "done" : "progress" });
        else if (p._eval) progress.push({ leerling_id: l.id, surah_n: p.surah_n, status: "progress" });
      }
      for (const n of st.newAssignments) {
        newAssignments.push({ leerling_id: l.id, class_id: classId, assigned_at_lesson_id: lesson.id, surah_n: n.surah_n, start_ayah: n.start_ayah, end_ayah: n.end_ayah, type: n.type, notes: st.notes || null });
        progress.push({ leerling_id: l.id, surah_n: n.surah_n, status: "progress" });
      }
    }
    try {
      await saveSession.mutateAsync({ classId, lessonId: lesson.id, evals, newAssignments, progress });
      toast(`Qur'an-administratie opgeslagen voor ${leerlingen.length} leerlingen`);
    } catch (e) {
      toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "onbekende fout"));
    }
  };

  if (isLoading) return <Loading />;

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
              <span className="text-sm font-semibold">Qur'an-overhoring · {dateNL(lesson.date, true)}</span>
              {lesson.status === "today" && <Badge kind="primary" dot>Vandaag</Badge>}
              {lesson.status === "completed" && <Badge>Voltooid</Badge>}
            </div>
            {previousLesson
              ? <div className="text-sm text-muted">Huiswerk uit les van <b style={{ color: "var(--fg)" }}>{dateNL(previousLesson.date, true)}</b></div>
              : <div className="text-sm text-subtle">Geen eerdere les — nog geen huiswerk om te overhoren.</div>}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-subtle">Les:</label>
            <Select style={{ minWidth: 220, width: "auto" }} value={lesson.id} onChange={(e) => setLessonId(e.target.value)}>
              {lessons.map((l) => <option key={l.id} value={l.id}>{dateNL(l.date, true)} — {l.topic?.slice(0, 30)}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex gap-2 mt-3" style={{ flexWrap: "wrap" }}>
          <Badge kind="success" dot>{stats.done} Voltooid</Badge>
          <Badge dot>{stats.open} Open</Badge>
          <div style={{ marginLeft: "auto" }}>
            <Btn size="sm" kind="primary" icon="check" disabled={saveSession.isPending} onClick={save}>
              {saveSession.isPending ? "Opslaan…" : "Sessie opslaan"}
            </Btn>
          </div>
        </div>
      </Card>

      <div className="flex-col gap-3">
        {leerlingen.map((l, idx) => {
          const st = state[l.id];
          if (!st) return null;
          const allEval = st.prev.length > 0 && st.prev.every((p) => p._eval);
          const isDone = !st.afwezig && allEval;
          return (
            <div key={l.id} className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid " + (st.afwezig ? "var(--border-strong)" : isDone ? "var(--success)" : "var(--border)"), opacity: isDone ? 0.9 : 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 1fr", minHeight: 120 }}>
                {/* Leerling header */}
                <div style={{ padding: 16, background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="flex items-center gap-3">
                    <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--bg-elev)", color: "var(--fg-muted)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--mono)", border: "1px solid var(--border)", flexShrink: 0 }}>{idx + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-semibold text-sm truncate" style={{ cursor: "pointer" }} onClick={() => navigate("/students/" + l.id)}>{l.kinderen?.full_name}</div>
                      <div className="text-xs text-subtle">{l.leerlingnummer}</div>
                    </div>
                  </div>
                  <button onClick={() => toggleAfwezig(l.id)} title={st.afwezig ? "Klik om weer aanwezig te maken" : "Markeer als afwezig"}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid " + (st.afwezig ? "var(--danger)" : "var(--border)"), background: st.afwezig ? "var(--danger-soft)" : "var(--bg-elev)", color: st.afwezig ? "var(--danger)" : "var(--fg-muted)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {st.afwezig ? <><Icon name="x" size={12} /> Afwezig</> : "Afwezig markeren"}
                  </button>
                </div>

                {/* Vorige huiswerk */}
                <div style={{ padding: 14, borderRight: "1px solid var(--border)", opacity: st.afwezig ? 0.4 : 1 }}>
                  <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Vorige huiswerk overhoren</div>
                  {st.prev.length === 0 ? (
                    <div className="text-sm text-subtle" style={{ padding: "16px 0" }}>Geen huiswerk vorige les.</div>
                  ) : (
                    <div className="flex-col gap-2">
                      {st.prev.map((a) => (
                        <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, transition: "background .15s", background: a._eval ? (a._eval === "yes" ? "var(--success-soft)" : a._eval === "no" ? "var(--danger-soft)" : "var(--warn-soft)") : "var(--bg-sunken)" }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="font-semibold text-sm">Surah {a.surah_n}. {surahByN.get(a.surah_n)?.name}{" "}
                              <Badge kind={a.type === "revision" ? "accent" : "primary"}>{a.type === "revision" ? "Revisie" : "Nieuw"}</Badge>
                            </div>
                            <div className="text-xs text-subtle font-mono">
                              {a.start_ayah === 1 && a.end_ayah === versesOf(a.surah_n) ? "Volledige surah" : `Vers ${a.start_ayah} – ${a.end_ayah} (van ${versesOf(a.surah_n)})`}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {[{ v: "yes", lbl: "✓", st: "A" }, { v: "partial", lbl: "◐", st: "L" }, { v: "no", lbl: "✗", st: "O" }].map((o) => (
                              <button key={o.v} className="att-pill" disabled={st.afwezig} data-status={a._eval === o.v ? o.st : "-"} style={{ fontSize: 13, width: 32, height: 32 }}
                                onClick={() => setEval(l.id, a.id, o.v)}>{o.lbl}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nieuw huiswerk */}
                <div style={{ padding: 14 }}>
                  <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Nieuw huiswerk</div>
                  {st.newAssignments.length > 0 && (
                    <div className="flex-col gap-2 mb-2">
                      {st.newAssignments.map((na, i) => (
                        <div key={i} style={{ padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 10px 52px 96px 26px", gap: 6, alignItems: "center" }}>
                            <Select value={na.surah_n} style={{ fontSize: 12, padding: "5px 8px" }}
                              onChange={(e) => { const n = parseInt(e.target.value); const su = surahByN.get(n); updateNew(l.id, i, { surah_n: n, start_ayah: 1, end_ayah: su?.verses ?? 1 }); }}>
                              {surahRefs.map((su) => <option key={su.n} value={su.n}>{su.n}. {su.name}</option>)}
                            </Select>
                            <input className="input" type="number" value={na.start_ayah} min={1} max={versesOf(na.surah_n)} style={{ fontSize: 12, padding: "5px 6px", textAlign: "center", fontFamily: "var(--mono)" }}
                              onChange={(e) => updateNew(l.id, i, { start_ayah: parseInt(e.target.value) || 1 })} />
                            <span className="text-xs text-subtle" style={{ textAlign: "center" }}>—</span>
                            <input className="input" type="number" value={na.end_ayah} min={na.start_ayah} max={versesOf(na.surah_n)} style={{ fontSize: 12, padding: "5px 6px", textAlign: "center", fontFamily: "var(--mono)" }}
                              onChange={(e) => updateNew(l.id, i, { end_ayah: parseInt(e.target.value) || 1 })} />
                            <Select value={na.type} style={{ fontSize: 12, padding: "5px 8px" }}
                              onChange={(e) => updateNew(l.id, i, { type: e.target.value as "new" | "revision" })}>
                              <option value="new">Nieuw</option>
                              <option value="revision">Revisie</option>
                            </Select>
                            <button className="btn ghost sm" onClick={() => removeNew(l.id, i)} title="Verwijderen" style={{ padding: "4px 6px" }}><Icon name="trash" size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => addNew(l.id)}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--fg-muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 6, justifyContent: "center", cursor: "pointer", marginBottom: 8 }}>
                    <Icon name="plus" size={12} /> Surah / herhaling toevoegen
                  </button>
                  <textarea className="textarea" placeholder="Opmerkingen" value={st.notes} rows={2} onChange={(e) => setNotes(l.id, e.target.value)}
                    style={{ fontSize: 12, padding: "6px 8px", background: "var(--bg)", border: "1px solid var(--border)" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
