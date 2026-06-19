import { useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Section, Tabs, Card, Stat, Badge, Btn, Icon, Avatar, QBar, Select, pct, type Option } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useClass, useClassLeerlingen, useLessons, useClassQuran, useUpdateClass, useAddLesson, dateNL, type ClassLeerling } from "@/data/classDetail";
import { useClassMetrics } from "@/data/classes";
import { useLeerlingMetrics } from "@/data/leerlingen";
import { useSurahs } from "@/data/classDetail";
import { useTeachers } from "@/data/people";
import { LesAdministratie } from "@/features/class-admin/LesAdministratie";
import { QuranAdministratie } from "@/features/class-admin/QuranAdministratie";
import { ToetsenTab } from "@/features/class-admin/ToetsenTab";
import { BeoordelingenTab } from "@/features/class-admin/BeoordelingenTab";

type Tab = "overview" | "attendance" | "quranadmin" | "lessons" | "students" | "quran" | "toetsen" | "beoordelingen";
const currentYear = new Date().getFullYear();

export function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDocent, classId } = useSession();
  const classQ = useClass(id);
  const leerlingenQ = useClassLeerlingen(id);
  const lessonsQ = useLessons(id);
  const quranQ = useClassQuran(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [lessonId, setLessonId] = useState<string | null>(null);

  const lessons = lessonsQ.data ?? [];
  const leerlingen = leerlingenQ.data ?? [];

  // Default lesson: today's, else the lesson right after the most recent one
  // that has Qur'an homework assigned, else the latest lesson.
  const defaultLessonId = useMemo(() => {
    if (!lessons.length) return null;
    const today = lessons.find((l) => l.status === "today");
    if (today) return today.id;
    const assignedLessonIds = new Set((quranQ.data ?? []).map((a) => a.assigned_at_lesson_id).filter(Boolean));
    const assigned = lessons.filter((l) => assignedLessonIds.has(l.id));
    if (assigned.length) {
      const last = assigned[assigned.length - 1];
      const after = lessons.find((l) => l.date > last.date);
      return (after ?? last).id;
    }
    return lessons[lessons.length - 1].id;
  }, [lessons, quranQ.data]);

  const lesson = lessons.find((l) => l.id === (lessonId ?? defaultLessonId)) ?? null;
  const c = classQ.data;

  // A docent may only open their own class; bounce them to it (or home).
  if (isDocent && id !== classId) return <Navigate to={classId ? `/classes/${classId}` : "/"} replace />;

  if (classQ.isError) return <ErrorState error={classQ.error} />;
  if (classQ.isLoading || !c) return <Loading label="Klas laden…" />;

  const tabs: Option<Tab>[] = [
    { value: "overview", label: "Overzicht" },
    { value: "attendance", label: "Les-administratie" },
    { value: "quranadmin", label: "Qur'an-administratie" },
    { value: "lessons", label: "Lessen" },
    { value: "students", label: `Leerlingen (${leerlingen.length})` },
    { value: "quran", label: "Qur'an-overzicht" },
    { value: "toetsen", label: "Toetsen" },
    { value: "beoordelingen", label: "Beoordelingen" },
  ];

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/classes")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {c.code}
          <Badge kind={(c.track === "hifdh" ? "accent" : "info")}>{c.track === "hifdh" ? "Hifdh" : "Groep " + c.grade}</Badge>
        </span>
      }
      sub={`${c.teacher?.short ?? "—"} · ${c.day} ${c.time} · ${c.location} · ${leerlingen.length} leerlingen`}
    >
      <Tabs value={tab} onChange={setTab} options={tabs} />

      {tab === "overview" && <ClassOverview classId={c.id} cls={c} leerlingen={leerlingen} />}
      {tab === "attendance" && (lesson
        ? <LesAdministratie leerlingen={leerlingen} lesson={lesson} lessons={lessons} setLessonId={setLessonId} />
        : <Card><div className="empty">Nog geen lessen voor deze klas.</div></Card>)}
      {tab === "quranadmin" && (lesson
        ? <QuranAdministratie classId={c.id} leerlingen={leerlingen} lesson={lesson} lessons={lessons} setLessonId={setLessonId} />
        : <Card><div className="empty">Nog geen lessen voor deze klas.</div></Card>)}
      {tab === "lessons" && <ClassLessons classId={c.id} cls={c} lessons={lessons} leerlingen={leerlingen} onOpen={(lid) => { setLessonId(lid); setTab("attendance"); }} />}
      {tab === "students" && <ClassStudents leerlingen={leerlingen} />}
      {tab === "quran" && <ClassQuranMatrix leerlingen={leerlingen} />}
      {tab === "toetsen" && <ToetsenTab classId={c.id} />}
      {tab === "beoordelingen" && <BeoordelingenTab classId={c.id} leerlingen={leerlingen} />}
    </Section>
  );
}

function ClassOverview({ classId, cls, leerlingen }: { classId: string; cls: NonNullable<ReturnType<typeof useClass>["data"]>; leerlingen: ClassLeerling[] }) {
  const toast = useToast();
  const { data: metricsMap } = useClassMetrics();
  const { data: teachers } = useTeachers();
  const updateClass = useUpdateClass();
  const m = metricsMap?.[classId];
  const capacity = cls.capacity ?? 0;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    code: cls.code, grade: cls.grade ?? 1, teacher_id: cls.teacher_id ?? "", quran_teacher_id: cls.quran_teacher_id ?? "",
    day: cls.day ?? "Zaterdag", time: cls.time ?? "", location: cls.location ?? "Moskee Arrahma", capacity: cls.capacity ?? 0,
  });

  const startEdit = () => {
    setForm({ code: cls.code, grade: cls.grade ?? 1, teacher_id: cls.teacher_id ?? "", quran_teacher_id: cls.quran_teacher_id ?? "", day: cls.day ?? "Zaterdag", time: cls.time ?? "", location: cls.location ?? "Moskee Arrahma", capacity: cls.capacity ?? 0 });
    setEditing(true);
  };
  const save = async () => {
    try {
      await updateClass.mutateAsync({ id: classId, patch: { ...form, teacher_id: form.teacher_id || null, quran_teacher_id: form.quran_teacher_id || null } });
      toast("Klas-instellingen opgeslagen"); setEditing(false);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <div className="flex-col gap-4">
      <div className="stat-grid">
        <Stat label="Aanwezigheid — gem." value={pct(m?.avg_attendance_pct)} sub="Uit les-administratie" icon="check" deltaKind={(m?.avg_attendance_pct ?? 0) > 0.9 ? "up" : (m?.avg_attendance_pct ?? 1) < 0.8 ? "down" : ""} />
        <Stat label="Arabisch huiswerk — gem." value={pct(m?.avg_arabic_homework_pct)} sub="Uit les-administratie" icon="edit" />
        <Stat label="Qur'an geleerd — gem." value={pct(m?.avg_quran_learned_pct)} sub="Uit Qur'an-administratie" icon="book" />
        <Stat label="Bezetting" value={pct(m?.occupancy)} sub={`${leerlingen.length} / ${capacity} plaatsen`} icon="users" />
      </div>

      <Card
        title={<><Icon name="settings" size={14} /> Algemene klas-informatie</>}
        action={editing
          ? <div className="flex gap-2"><Btn size="sm" kind="ghost" onClick={() => setEditing(false)}>Annuleren</Btn><Btn size="sm" kind="primary" icon="check" disabled={updateClass.isPending} onClick={save}>Opslaan</Btn></div>
          : <Btn size="sm" icon="edit" onClick={startEdit}>Bewerken</Btn>}
      >
        {editing ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <Field label="Klasnaam"><input className="input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Field>
            <Field label="Niveau (groep)"><input className="input" type="number" min={1} max={9} value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: parseInt(e.target.value) || 1 }))} /></Field>
            <Field label="Max. bezetting"><input className="input" type="number" min={1} max={40} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 0 }))} /></Field>
            <Field label="Les-docent"><Select value={form.teacher_id} onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}><option value="">—</option>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Qur'an-docent"><Select value={form.quran_teacher_id} onChange={(e) => setForm((f) => ({ ...f, quran_teacher_id: e.target.value }))}><option value="">—</option>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Dag"><Select value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}><option>Zaterdag</option><option>Zondag</option></Select></Field>
            <Field label="Lestijden"><input className="input" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} placeholder="09:30 - 11:30" /></Field>
            <Field label="Locatie"><input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></Field>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, fontSize: 13 }}>
            {([
              ["Klasnaam", cls.code, "school"],
              ["Niveau", "Groep " + cls.grade, "flag"],
              ["Les-docent", cls.teacher?.name ?? "—", "user"],
              ["Qur'an-docent", cls.quran_teacher?.name ?? "—", "book"],
              ["Dag", cls.day ?? "—", "calendar"],
              ["Lestijden", cls.time ?? "—", "clock"],
              ["Locatie", cls.location ?? "—", "pin"],
              ["Max. bezetting", (cls.capacity ?? 0) + " plaatsen", "users"],
            ] as const).map(([k, v, ic]) => (
              <div key={k}>
                <div className="flex items-center gap-2 text-xs text-subtle mb-1"><Icon name={ic} size={12} />{k}</div>
                <div className="font-semibold" style={{ fontSize: 14 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Bezetting in beeld" sub={`${leerlingen.length} van ${capacity} plaatsen ingenomen`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 6 }}>
          {Array.from({ length: capacity }).map((_, i) => {
            const filled = i < leerlingen.length;
            const l = filled ? leerlingen[i] : null;
            return (
              <div key={i} title={l?.kinderen?.full_name ?? "Vrije plaats"}
                style={{ aspectRatio: "1", borderRadius: 6, background: filled ? "var(--primary)" : "var(--bg-sunken)", border: "1px solid " + (filled ? "var(--primary)" : "var(--border)"), color: filled ? "var(--primary-fg)" : "var(--fg-faint)", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 600, fontFamily: "var(--mono)" }}>
                {filled ? l?.kinderen?.initials : "·"}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ClassLessons({ classId, cls, lessons, leerlingen, onOpen }: { classId: string; cls: NonNullable<ReturnType<typeof useClass>["data"]>; lessons: ReturnType<typeof useLessons>["data"]; leerlingen: ClassLeerling[]; onOpen: (id: string) => void }) {
  const toast = useToast();
  const addLesson = useAddLesson();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", topic: "", time: cls.time ?? "", week_nr: "" });

  const save = async () => {
    try {
      await addLesson.mutateAsync({ class_id: classId, date: form.date, topic: form.topic || "Wekelijkse les", time: form.time || cls.time, location: cls.location, week_nr: form.week_nr ? parseInt(form.week_nr) : null });
      toast("Les toegevoegd"); setAdding(false); setForm({ date: "", topic: "", time: cls.time ?? "", week_nr: "" });
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <Card title={<><Icon name="calendar" size={14} /> Lessenoverzicht</>} sub={`${lessons?.length ?? 0} lessen · basis voor planning`}
      action={<Btn size="sm" icon="plus" onClick={() => setAdding(true)}>Les toevoegen</Btn>}>
      {adding && (
        <Modal title="Les toevoegen" sub="Voeg een lesdatum toe aan deze klas" onClose={() => setAdding(false)}
          footer={<ModalFooter onCancel={() => setAdding(false)} onSave={save} saving={addLesson.isPending} disabled={!form.date} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Datum"><input className="input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field>
            <Field label="Weeknr (optioneel)"><input className="input" type="number" value={form.week_nr} onChange={(e) => setForm((f) => ({ ...f, week_nr: e.target.value }))} /></Field>
          </div>
          <Field label="Onderwerp"><input className="input" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder="Wekelijkse les" /></Field>
          <Field label="Tijd"><input className="input" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} placeholder="09:30 - 11:30" /></Field>
        </Modal>
      )}
      <table className="table">
        <thead><tr><th style={{ width: 1 }}>Week</th><th>Datum</th><th>Onderwerp</th><th>Tijd</th><th>Locatie</th><th>Leerlingen</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {(lessons ?? []).map((l) => (
            <tr key={l.id} onClick={() => onOpen(l.id)}>
              <td className="num font-semibold">{l.week_nr}</td>
              <td className="font-mono text-sm">{dateNL(l.date, true)}</td>
              <td className="font-semibold">{l.topic}</td>
              <td className="text-sm">{l.time}</td>
              <td className="text-sm">{l.location}</td>
              <td className="num">{leerlingen.length}</td>
              <td>
                {l.status === "today" && <Badge kind="primary" dot>Vandaag</Badge>}
                {l.status === "upcoming" && <Badge kind="info">Komend</Badge>}
                {l.status === "completed" && <Badge kind="success">Voltooid</Badge>}
              </td>
              <td><Icon name="chevronRight" size={14} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ClassStudents({ leerlingen }: { leerlingen: ClassLeerling[] }) {
  const navigate = useNavigate();
  const { data: metrics } = useLeerlingMetrics();
  const m = metrics ?? {};
  return (
    <Card>
      <table className="table">
        <thead><tr><th>Leerling</th><th>Leeftijd</th><th>Aanwezigheid</th><th>Qur'an</th><th>Surahs</th></tr></thead>
        <tbody>
          {leerlingen.map((l) => {
            const mm = m[l.id];
            const age = l.kinderen?.birth_year ? currentYear - l.kinderen.birth_year : null;
            return (
              <tr key={l.id} onClick={() => navigate("/students/" + l.id)}>
                <td><div className="flex items-center gap-3"><Avatar name={l.kinderen?.full_name} initials={l.kinderen?.initials ?? undefined} size="sm" /><span className="font-semibold">{l.kinderen?.full_name}</span></div></td>
                <td className="num">{age ?? "—"} jr</td>
                <td style={{ width: 140 }}><div className="flex items-center gap-2"><div style={{ flex: 1 }}><QBar value={(mm?.attendance_pct ?? 0) * 100} /></div><span className="num text-xs">{pct(mm?.attendance_pct)}</span></div></td>
                <td className="num">{pct(mm?.quran_learned_pct)}</td>
                <td className="num">{mm?.surahs_known ?? 0}/38</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function ClassQuranMatrix({ leerlingen }: { leerlingen: ClassLeerling[] }) {
  const { data: surahs } = useSurahs();
  const ids = leerlingen.map((l) => l.id);
  const { data: progress } = useQuery({
    queryKey: ["class-surah-progress", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("leerling_surah_progress").select("leerling_id, surah_n, status").in("leerling_id", ids);
      if (error) throw error;
      return (data as { leerling_id: string; surah_n: number; status: string }[]) ?? [];
    },
  });
  const ordered = useMemo(() => [...(surahs ?? [])].sort((a, b) => b.n - a.n).slice(0, 20), [surahs]);
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of progress ?? []) m.set(p.leerling_id + ":" + p.surah_n, p.status);
    return m;
  }, [progress]);

  return (
    <Card title="Memorisatie-matrix" sub="Voortgang van alle leerlingen per surah.">
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--bg-elev)", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--fg-subtle)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 180, zIndex: 1 }}>Leerling</th>
              {ordered.map((s) => (
                <th key={s.n} style={{ padding: "10px 4px", textAlign: "center", borderBottom: "1px solid var(--border)", color: "var(--fg-subtle)", fontSize: 10, fontWeight: 500, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", height: 90 }}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leerlingen.map((l) => (
              <tr key={l.id}>
                <td style={{ position: "sticky", left: 0, background: "var(--bg-elev)", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", zIndex: 1 }}>{l.kinderen?.full_name}</td>
                {ordered.map((s) => {
                  const p = map.get(l.id + ":" + s.n);
                  const bg = p === "done" ? "var(--primary)" : p === "progress" ? "var(--accent-soft)" : p === "review" ? "var(--warn-soft)" : "var(--bg-sunken)";
                  const fg = p === "done" ? "var(--primary-fg)" : "var(--fg-muted)";
                  return (
                    <td key={s.n} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                      <div title={s.name + " — " + (p === "done" ? "afgerond" : p === "progress" ? "bezig" : p === "review" ? "herhaling" : "nog niet")}
                        style={{ width: 26, height: 26, margin: 3, background: bg, color: fg, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 9, border: p === "progress" ? "1px solid var(--accent)" : p === "review" ? "1px solid var(--warn)" : "1px solid transparent" }}>
                        {p === "done" && <Icon name="check" size={11} />}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
