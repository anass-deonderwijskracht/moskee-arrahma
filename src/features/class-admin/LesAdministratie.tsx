import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Badge, Btn, Icon, Select } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import {
  dateNL, useLessonAttendance, useSaveAttendance, useSaveLessonNote,
  type Lesson, type ClassLeerling,
} from "@/data/classDetail";
import { useSession } from "@/features/auth/AuthProvider";

interface RowState { status: string; homework: string; materials_issue: boolean; note: string }
const EMPTY: RowState = { status: "-", homework: "-", materials_issue: false, note: "" };

const ATT = [
  { v: "A", lbl: "A", title: "Aanwezig" },
  { v: "L", lbl: "L", title: "Te laat" },
  { v: "Z", lbl: "Z", title: "Ziek" },
  { v: "O", lbl: "O", title: "Ongeoorloofd" },
];
const HW = [
  { v: "yes", lbl: "✓", title: "Gemaakt", st: "A" },
  { v: "partial", lbl: "◐", title: "Deels gemaakt", st: "L" },
  { v: "no", lbl: "✗", title: "Niet gemaakt", st: "O" },
];

export function LesAdministratie({ leerlingen, lesson, lessons, setLessonId }: {
  leerlingen: ClassLeerling[]; lesson: Lesson; lessons: Lesson[]; setLessonId: (id: string) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { fullName } = useSession();
  const { data: existing, isLoading } = useLessonAttendance(lesson.id);
  const saveAttendance = useSaveAttendance();
  const saveNote = useSaveLessonNote();

  const [state, setState] = useState<Record<string, RowState>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    const seed: Record<string, RowState> = {};
    for (const l of leerlingen) {
      const e = existing?.[l.id];
      seed[l.id] = e
        ? { status: e.status ?? "-", homework: e.homework ?? "-", materials_issue: e.materials_issue, note: e.note ?? "" }
        : { ...EMPTY };
    }
    setState(seed);
  }, [existing, leerlingen, lesson.id]);

  const set = (id: string, key: keyof RowState, val: RowState[keyof RowState]) =>
    setState((s) => ({ ...s, [id]: { ...s[id], [key]: val } }));

  const counts = useMemo(() => {
    const c = { A: 0, L: 0, Z: 0, O: 0, "-": 0, hwYes: 0, hwPartial: 0, hwNo: 0, mat: 0 } as Record<string, number>;
    for (const v of Object.values(state)) {
      c[v.status] = (c[v.status] ?? 0) + 1;
      if (v.homework === "yes") c.hwYes++; else if (v.homework === "partial") c.hwPartial++; else if (v.homework === "no") c.hwNo++;
      if (v.materials_issue) c.mat++;
    }
    return c;
  }, [state]);

  const fillAllPresent = () => setState((s) => Object.fromEntries(leerlingen.map((l) => [l.id, { ...s[l.id], status: "A" }])));
  const markAllHwDone = () => setState((s) => Object.fromEntries(leerlingen.map((l) => [l.id, { ...s[l.id], homework: "yes" }])));

  const save = async () => {
    const rows = leerlingen.map((l) => ({
      leerling_id: l.id, lesson_id: lesson.id,
      status: state[l.id]?.status === "-" ? null : state[l.id]?.status ?? null,
      homework: state[l.id]?.homework === "-" ? null : state[l.id]?.homework ?? null,
      materials_issue: state[l.id]?.materials_issue ?? false,
      note: state[l.id]?.note || null,
    }));
    try {
      await saveAttendance.mutateAsync(rows);
      toast(`Aanwezigheid opgeslagen voor ${leerlingen.length} leerlingen`);
    } catch (e) {
      toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "onbekende fout"));
    }
  };

  const placeNote = async () => {
    if (!note.trim()) return;
    await saveNote.mutateAsync({ lesson_id: lesson.id, author: fullName ?? "Beheerder", body: note.trim(), is_draft: false });
    setNote("");
    toast("Les-aantekening geplaatst");
  };

  const isToday = lesson.status === "today";
  const isPast = lesson.status === "completed";

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: isToday ? "var(--primary)" : isPast ? "var(--bg-sunken)" : "var(--accent-soft)", color: isToday ? "var(--primary-fg)" : "var(--fg-muted)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="calendar" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">Les van {dateNL(lesson.date, true)}</span>
              {isToday && <Badge kind="primary" dot>Vandaag</Badge>}
              {isPast && <Badge>Voltooid</Badge>}
              <span className="text-xs text-subtle">Week {lesson.week_nr}</span>
            </div>
            <div className="text-sm text-muted">{lesson.topic} · {lesson.time} · {lesson.location}</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-subtle">Andere les:</label>
            <Select style={{ minWidth: 240, width: "auto" }} value={lesson.id} onChange={(e) => setLessonId(e.target.value)}>
              <optgroup label="Komend">
                {lessons.filter((l) => l.status === "upcoming").map((l) => <option key={l.id} value={l.id}>{dateNL(l.date, true)} — {l.topic?.slice(0, 38)}</option>)}
              </optgroup>
              <optgroup label="Vandaag">
                {lessons.filter((l) => l.status === "today").map((l) => <option key={l.id} value={l.id}>● {dateNL(l.date, true)} — {l.topic?.slice(0, 38)}</option>)}
              </optgroup>
              <optgroup label="Afgerond (wijzigen mogelijk)">
                {lessons.filter((l) => l.status === "completed").slice().reverse().map((l) => <option key={l.id} value={l.id}>{dateNL(l.date, true)} — {l.topic?.slice(0, 38)}</option>)}
              </optgroup>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <Badge kind="success" dot>{counts.A} Aanwezig</Badge>
            <Badge kind="warn" dot>{counts.L} Te laat</Badge>
            <Badge kind="info" dot>{counts.Z} Ziek</Badge>
            <Badge kind="danger" dot>{counts.O} Ongeoorloofd</Badge>
            <Badge>{counts["-"]} Niet ingevuld</Badge>
            <span style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 4px" }} />
            <Badge kind="success">{counts.hwYes} hw gemaakt</Badge>
            <Badge kind="warn">{counts.hwPartial} deels</Badge>
            <Badge kind="danger">{counts.hwNo} niet</Badge>
            {counts.mat > 0 && <Badge kind="danger" dot>{counts.mat} materialen niet in orde</Badge>}
          </div>
          <div style={{ marginLeft: "auto" }} className="flex gap-2 items-center">
            <Btn size="sm" kind="ghost" onClick={fillAllPresent}>Alle aanwezig</Btn>
            <Btn size="sm" kind="ghost" onClick={markAllHwDone}>Hw alle gemaakt</Btn>
            <Btn size="sm" kind="primary" icon="check" disabled={saveAttendance.isPending} onClick={save}>
              {saveAttendance.isPending ? "Opslaan…" : "Opslaan"}
            </Btn>
          </div>
        </div>

        {isLoading ? <Loading /> : (
          <table className="table" style={{ borderRadius: 8, overflow: "hidden" }}>
            <thead>
              <tr>
                <th>Leerling</th>
                <th style={{ width: 1, whiteSpace: "nowrap" }}>Aanwezigheid</th>
                <th style={{ width: 1, whiteSpace: "nowrap" }}>Huiswerk</th>
                <th style={{ width: 1, whiteSpace: "nowrap", textAlign: "center" }}>
                  Materialen<br /><span style={{ fontSize: 10, fontWeight: 400, color: "var(--fg-subtle)", textTransform: "none", letterSpacing: 0 }}>(niet in orde)</span>
                </th>
                <th>Opmerking</th>
              </tr>
            </thead>
            <tbody>
              {leerlingen.map((l) => {
                const st = state[l.id] ?? EMPTY;
                return (
                  <tr key={l.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar sm">{l.kinderen?.initials}</div>
                        <div>
                          <div className="font-semibold text-sm" style={{ cursor: "pointer" }} onClick={() => navigate("/students/" + l.id)}>{l.kinderen?.full_name}</div>
                          <div className="text-xs text-subtle">{l.leerlingnummer}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {ATT.map((o) => (
                          <button key={o.v} className="att-pill" data-status={st.status === o.v ? o.v : "-"} title={o.title}
                            onClick={() => set(l.id, "status", st.status === o.v ? "-" : o.v)}>{o.lbl}</button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {HW.map((o) => (
                          <button key={o.v} className="att-pill" data-status={st.homework === o.v ? o.st : "-"} title={"Huiswerk: " + o.title} style={{ fontSize: 13 }}
                            onClick={() => set(l.id, "homework", st.homework === o.v ? "-" : o.v)}>{o.lbl}</button>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button className="att-pill" data-status={st.materials_issue ? "O" : "-"} title="Materialen NIET in orde — klik om te markeren" style={{ fontSize: 13 }}
                        onClick={() => set(l.id, "materials_issue", !st.materials_issue)}>✗</button>
                    </td>
                    <td>
                      <input className="input" placeholder="Optionele opmerking…" value={st.note}
                        onChange={(e) => set(l.id, "note", e.target.value)} style={{ background: "var(--bg)", border: "1px solid transparent" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Les-aantekeningen" sub="Wat is er behandeld?">
        <textarea className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={`Bijv. Vandaag behandeld: ${lesson.topic}. Huiswerk meegegeven voor volgende week.`} />
        <div className="flex justify-end gap-2 mt-3">
          <Btn size="sm" kind="primary" icon="check" disabled={saveNote.isPending} onClick={placeNote}>Plaatsen</Btn>
        </div>
      </Card>
    </div>
  );
}
