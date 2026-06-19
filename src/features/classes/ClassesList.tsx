import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Btn, Icon, Select, Badge, Pills, QBar, pct, metricKind, type Option } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useClasses, useClassMetrics, useCreateClass, useDeleteClasses, type ClassRow } from "@/data/classes";
import { useTeachers } from "@/data/people";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";
import { KlassenOverzichtKanban } from "./KlassenOverzichtKanban";

const COLORS = ["primary", "info", "accent", "success", "warn", "danger"];

type View = "grid" | "table" | "overzicht";

export function ClassesList() {
  const navigate = useNavigate();
  const { data: schooljaren } = useSchooljaren();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? current?.id ?? null;
  const [view, setView] = useState<View>("grid");

  const { data, isLoading, isError, error } = useClasses(effectiveSj);
  const { data: metrics } = useClassMetrics();
  const { data: teachers } = useTeachers();
  const createClass = useCreateClass();
  const del = useDeleteClasses();
  const toast = useToast();
  const m = metrics ?? {};

  const tools = useTableTools({
    rows: data ?? [],
    getId: (c) => c.id,
    search: (c, q) => c.code.toLowerCase().includes(q) || (c.teacher?.short ?? "").toLowerCase().includes(q) || (c.quran_teacher?.short ?? "").toLowerCase().includes(q),
    sorters: {
      code: (c) => c.grade ?? c.code,
      track: (c) => c.track,
      teacher: (c) => c.teacher?.short,
      quran: (c) => c.quran_teacher?.short,
      day: (c) => c.day,
      bezetting: (c) => m[c.id]?.leerling_count ?? 0,
      aanw: (c) => m[c.id]?.avg_attendance_pct,
    },
    initialSort: { key: "code", dir: "asc" },
  });
  const rows = tools.view;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code: "", grade: 1, track: "regulier", day: "Zaterdag", time: "09:00 - 12:00", location: "Moskee Arrahma", capacity: 13, teacher_id: "", quran_teacher_id: "" });
  const saveClass = async () => {
    if (!effectiveSj) return;
    try {
      await createClass.mutateAsync({ ...form, teacher_id: form.teacher_id || null, quran_teacher_id: form.quran_teacher_id || null, schooljaar_id: effectiveSj, color: COLORS[(data?.length ?? 0) % COLORS.length] });
      toast("Klas toegevoegd"); setAdding(false);
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const duplicateClass = async (c: ClassRow, e: MouseEvent) => {
    e.stopPropagation();
    if (!effectiveSj) return;
    try {
      await createClass.mutateAsync({
        code: `${c.code} (kopie)`,
        grade: c.grade ?? 1,
        track: c.track,
        day: c.day ?? "Zaterdag",
        time: c.time ?? "09:00 - 12:00",
        location: c.location ?? "Moskee Arrahma",
        capacity: c.capacity ?? 13,
        teacher_id: c.teacher_id,
        quran_teacher_id: c.quran_teacher_id,
        schooljaar_id: effectiveSj,
        color: c.color ?? COLORS[(data?.length ?? 0) % COLORS.length],
      });
      toast(`Klas "${c.code}" gedupliceerd`);
    } catch (err) { toast("Dupliceren mislukt: " + (err instanceof Error ? err.message : "")); }
  };

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} klas(sen) verwijderen? Dit verwijdert ook de gekoppelde leerlingen, lessen en roosters van deze klas(sen).`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} klas(sen) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  if (isError) return <ErrorState error={error} />;

  const viewOptions: Option<View>[] = [{ value: "grid", label: "Kaarten" }, { value: "table", label: "Tabel" }, { value: "overzicht", label: "Klassenoverzicht" }];

  return (
    <Section
      title="Klassen"
      sub="9 klassen — Klas 1–7 (regulier) + Hifdh-K & Hifdh-B"
      actions={
        <>
          {view === "table" && <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek klas of docent…" width={200} />}
          <Pills value={view} onChange={setView} options={viewOptions} />
          <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: 130 }}>
            {(schooljaren ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (huidig)" : ""}</option>
            ))}
          </Select>
          <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Klas toevoegen</Btn>
        </>
      }
    >
      {isLoading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <Card><div className="empty">Nog geen klassen voor dit schooljaar.</div></Card>
      ) : view === "overzicht" ? (
        <KlassenOverzichtKanban classes={data ?? []} schooljaarId={effectiveSj} />
      ) : view === "grid" ? (
        <div className="grid-auto-cards">
          {(data ?? []).map((c) => {
            const cm = m[c.id];
            const occ = cm?.occupancy ?? null;
            return (
              <div key={c.id} className="card" style={{ cursor: "pointer" }} onClick={() => navigate("/classes/" + c.id)}>
                <div className="card-head">
                  <div>
                    <h3 className="card-title">
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--${c.color ?? "primary"})`, display: "inline-block" }} />
                      {c.code}
                    </h3>
                    <div className="card-sub mt-1">{c.day} · {c.time}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge kind={c.track === "hifdh" ? "accent" : "info"}>{c.track === "hifdh" ? "Hifdh" : "Regulier"}</Badge>
                    <button className="btn ghost sm" title="Klas dupliceren" disabled={createClass.isPending} onClick={(e) => duplicateClass(c, e)}><Icon name="copy" size={14} /></button>
                  </div>
                </div>
                <div className="flex-col gap-2">
                  <div className="text-xs text-subtle">Docent: <span className="text-muted">{c.teacher?.short ?? "—"}</span></div>
                  <div className="text-xs text-subtle">Qur'an: <span className="text-muted">{c.quran_teacher?.short ?? "—"}</span></div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-subtle">Bezetting</span>
                      <span className="num">{cm?.leerling_count ?? 0} / {c.capacity}</span>
                    </div>
                    <QBar value={(occ ?? 0) * 100} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Badge kind={metricKind(cm?.avg_attendance_pct)}>Aanw {pct(cm?.avg_attendance_pct)}</Badge>
                    <Badge kind={metricKind(cm?.avg_quran_learned_pct)}>Qur'an {pct(cm?.avg_quran_learned_pct)}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <BulkBar count={tools.selectedIds.length} noun="klas(sen)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
          <Card>
            <table className="table">
              <thead>
                <tr>
                  <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
                  <SortTh label="Klas" k="code" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Traject" k="track" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Docent" k="teacher" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Qur'an-docent" k="quran" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Dag/tijd" k="day" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Bezetting" k="bezetting" sort={tools.sort} onSort={tools.toggleSort} />
                  <SortTh label="Aanw." k="aanw" sort={tools.sort} onSort={tools.toggleSort} />
                  <th style={{ width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const cm = m[c.id];
                  const isChecked = tools.checked.has(c.id);
                  return (
                    <tr key={c.id} onClick={() => navigate("/classes/" + c.id)} className={isChecked ? "selected" : ""}>
                      <SelectTd checked={isChecked} onToggle={() => tools.toggleOne(c.id)} label={`Selecteer ${c.code}`} />
                      <td className="font-semibold">{c.code}</td>
                      <td><Badge kind={c.track === "hifdh" ? "accent" : "info"}>{c.track === "hifdh" ? "Hifdh" : "Regulier"}</Badge></td>
                      <td className="text-sm">{c.teacher?.short ?? "—"}</td>
                      <td className="text-sm">{c.quran_teacher?.short ?? "—"}</td>
                      <td className="text-sm">{c.day} · {c.time}</td>
                      <td className="num">{cm?.leerling_count ?? 0} / {c.capacity}</td>
                      <td><Badge kind={metricKind(cm?.avg_attendance_pct)}>{pct(cm?.avg_attendance_pct)}</Badge></td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button className="btn ghost sm" title="Klas dupliceren" disabled={createClass.isPending} onClick={(e) => duplicateClass(c, e)}><Icon name="copy" size={14} /></button>
                          <Icon name="chevronRight" size={14} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {adding && (
        <Modal title="Klas toevoegen" sub={`Nieuwe klas voor schooljaar ${(schooljaren ?? []).find((s) => s.id === effectiveSj)?.name ?? ""}`} onClose={() => setAdding(false)} width={560}
          footer={<ModalFooter onCancel={() => setAdding(false)} onSave={saveClass} saving={createClass.isPending} disabled={!form.code.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <Field label="Klasnaam"><input className="input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="bv. Klas 8" /></Field>
            <Field label="Niveau"><input className="input" type="number" min={1} max={9} value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: parseInt(e.target.value) || 1 }))} /></Field>
            <Field label="Traject"><Select value={form.track} onChange={(e) => setForm((f) => ({ ...f, track: e.target.value }))}><option value="regulier">Regulier</option><option value="hifdh">Hifdh</option></Select></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Dag"><Select value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}><option>Zaterdag</option><option>Zondag</option></Select></Field>
            <Field label="Lestijden"><input className="input" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} /></Field>
            <Field label="Max. bezetting"><input className="input" type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 0 }))} /></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Les-docent"><Select value={form.teacher_id} onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}><option value="">—</option>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Qur'an-docent"><Select value={form.quran_teacher_id} onChange={(e) => setForm((f) => ({ ...f, quran_teacher_id: e.target.value }))}><option value="">—</option>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          </div>
          <Field label="Locatie"><input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></Field>
        </Modal>
      )}
    </Section>
  );
}
