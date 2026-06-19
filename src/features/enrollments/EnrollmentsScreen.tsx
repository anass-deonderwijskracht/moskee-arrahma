import { useMemo, useState } from "react";
import { Section, Card, Btn, Icon, Badge, Pills, Avatar, type Option } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useEnrollments, useUpdateEnrollmentStatus, useDeleteEnrollments, type Enrollment } from "@/data/enrollments";
import { ENROLL_COLUMNS } from "@/data/dashboard";
import { Klassenindeler } from "@/features/klassenindeler/Klassenindeler";
import { NewEnrollmentModal } from "./NewEnrollmentModal";
import { EnrollmentSheet } from "./EnrollmentSheet";

type View = "kanban" | "table" | "indeler";
type Track = "all" | "regulier" | "hifdh";

const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));

const enrollDate = (it: Enrollment) => it.submitted_at ?? it.created_at ?? "";
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function EnrollmentsScreen() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useEnrollments();
  const updateStatus = useUpdateEnrollmentStatus();
  const deleteEnrollments = useDeleteEnrollments();
  const [view, setView] = useState<View>("indeler");
  const [track, setTrack] = useState<Track>("all");
  const [selected, setSelected] = useState<Enrollment | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTrack, setNewTrack] = useState<"regulier" | "hifdh" | null>(null);

  const items = data ?? [];
  const visible = useMemo(() => items.filter((i) => track === "all" || i.track === track), [items, track]);

  const t = useTableTools({
    rows: visible,
    getId: (it) => it.id,
    search: (it, q) => {
      const p = it.enrollment_parents ?? [];
      return [it.child_name, it.target_class, it.preferred_lesday, STATUS_TITLE[it.status], ...p.flatMap((x) => [x.name, x.phone])]
        .some((v) => v?.toLowerCase().includes(q));
    },
    sorters: {
      child_name: (it) => it.child_name,
      track: (it) => it.track,
      age: (it) => it.age,
      preferred_lesday: (it) => it.preferred_lesday,
      target_class: (it) => it.target_class,
      status: (it) => it.status,
      date: (it) => enrollDate(it),
    },
    initialSort: { key: "date", dir: "desc" },
  });
  const rows = t.view;

  if (isError) return <ErrorState error={error} />;

  const onDeleteSelected = () => {
    const ids = t.selectedIds;
    if (!ids.length) return;
    if (!confirm(`${ids.length} inschrijving(en) definitief verwijderen? Dit verwijdert ook gekoppelde ouders en plaatsingen.`)) return;
    deleteEnrollments.mutate(ids, {
      onSuccess: () => { toast(`${ids.length} inschrijving(en) verwijderd`); t.clear(); },
      onError: () => toast("Verwijderen mislukt"),
    });
  };

  const onDrop = (col: string) => {
    if (dragId) {
      const item = items.find((i) => i.id === dragId);
      updateStatus.mutate({ id: dragId, status: col });
      if (item) toast(`${item.child_name} verplaatst naar “${STATUS_TITLE[col]}”`);
    }
    setDragId(null); setDropCol(null);
  };

  const trackPills: Option<Track>[] = [
    { value: "all", label: "Beide" },
    { value: "regulier", label: `Regulier (${items.filter((i) => i.track === "regulier").length})` },
    { value: "hifdh", label: `Hifdh (${items.filter((i) => i.track === "hifdh").length})` },
  ];
  const viewPills: Option<View>[] = [
    { value: "kanban", label: "Pijplijn" },
    { value: "table", label: "Tabel" },
    { value: "indeler", label: "Klassenindeler" },
  ];

  return (
    <>
      <Section
        title="Inschrijvingen"
        sub={`${visible.length} aanmeldingen${track !== "all" ? " · " + (track === "hifdh" ? "Hifdh-traject" : "Regulier") : ""}`}
        actions={
          <>
            {view !== "indeler" && <Pills value={track} onChange={setTrack} options={trackPills} />}
            <Pills value={view} onChange={setView} options={viewPills} />
            <div style={{ position: "relative" }}>
              <Btn icon="plus" kind="primary" onClick={() => setShowAdd((v) => !v)}>Nieuwe aanmelding</Btn>
              {showAdd && (
                <div className="menu">
                  <button className="sidebar-link" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setShowAdd(false); setNewTrack("regulier"); }}>
                    <Icon name="school" size={14} />
                    <div style={{ textAlign: "left" }}><div className="text-sm font-semibold">Regulier traject</div><div className="text-xs text-subtle">Weekendlessen</div></div>
                  </button>
                  <button className="sidebar-link" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setShowAdd(false); setNewTrack("hifdh"); }}>
                    <Icon name="book" size={14} />
                    <div style={{ textAlign: "left" }}><div className="text-sm font-semibold">Hifdh-traject</div><div className="text-xs text-subtle">Memorisatie</div></div>
                  </button>
                </div>
              )}
            </div>
          </>
        }
      >
        {isLoading ? <Loading /> : view === "kanban" ? (
          <div className="kanban" style={{ height: "calc(100vh - 240px)" }}>
            {ENROLL_COLUMNS.map((col) => {
              const colItems = visible.filter((i) => i.status === col.id);
              return (
                <div key={col.id} className={"kcol " + (dropCol === col.id && dragId ? "drop-target" : "")}
                  onDragOver={(e) => { e.preventDefault(); setDropCol(col.id); }}
                  onDragLeave={() => setDropCol(null)}
                  onDrop={() => onDrop(col.id)}>
                  <div className="kcol-head">
                    <div className="title"><span className="marker" style={{ background: col.color }} />{col.title}</div>
                    <span className="count">{colItems.length}</span>
                  </div>
                  <div className="kcol-body">
                    {colItems.map((item) => {
                      const p = item.enrollment_parents ?? [];
                      return (
                        <div key={item.id} className={"kcard " + (dragId === item.id ? "dragging" : "")} draggable
                          onDragStart={() => setDragId(item.id)} onDragEnd={() => setDragId(null)} onClick={() => setSelected(item)}>
                          <div className="row" style={{ justifyContent: "space-between" }}>
                            <span className="name">{item.child_name}</span>
                            <span className="text-xs text-subtle">{item.age} jr</span>
                          </div>
                          <div className="row"><Badge kind={item.track === "hifdh" ? "primary" : "info"} dot>{item.track === "hifdh" ? "Hifdh-traject" : "Regulier"}</Badge></div>
                          <div className="meta"><span><b>Klas:</b> {item.target_class ?? "—"}</span>{item.preferred_lesday && <span><b>Voorkeur:</b> {item.preferred_lesday}</span>}</div>
                          {p[0] && <div className="meta"><span className="truncate">{p[0].name} <span style={{ color: "var(--fg-subtle)" }}>· {p[0].role}</span></span></div>}
                          {p[1] && <div className="meta"><span className="truncate">{p[1].name} <span style={{ color: "var(--fg-subtle)" }}>· {p[1].role}</span></span></div>}
                          <div className="meta" style={{ marginTop: 2, borderTop: "1px solid var(--border)", paddingTop: 8 }}><Icon name="clock" size={11} /> {item.submitted_label ?? ""}</div>
                          {item.rejection_reason && <div className="text-xs" style={{ color: "var(--danger)", padding: "4px 8px", background: "var(--danger-soft)", borderRadius: 6 }}>{item.rejection_reason}</div>}
                        </div>
                      );
                    })}
                    {colItems.length === 0 && <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>Sleep een kaart hierheen</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === "table" ? (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              <SearchBox value={t.q} onChange={t.setQ} placeholder="Zoek op naam, ouder, klas…" width={280} />
              <span className="text-sm text-subtle">{rows.length} resultaten</span>
              <div style={{ flex: 1 }} />
              <BulkBar count={t.selectedIds.length} noun="inschrijving(en)" onClear={t.clear} onDelete={onDeleteSelected} pending={deleteEnrollments.isPending} />
            </div>
            <Card>
              <table className="table">
                <thead>
                  <tr>
                    <SelectTh allChecked={t.allChecked} onToggle={t.toggleAll} />
                    <SortTh label="Kind" k="child_name" sort={t.sort} onSort={t.toggleSort} />
                    <SortTh label="Traject" k="track" sort={t.sort} onSort={t.toggleSort} />
                    <SortTh label="Leeftijd" k="age" sort={t.sort} onSort={t.toggleSort} />
                    <SortTh label="Voorkeur lesdag" k="preferred_lesday" sort={t.sort} onSort={t.toggleSort} />
                    <th>Ouder/voogd 1</th>
                    <th>Ouder/voogd 2</th>
                    <SortTh label="Doelklas" k="target_class" sort={t.sort} onSort={t.toggleSort} />
                    <SortTh label="Status" k="status" sort={t.sort} onSort={t.toggleSort} />
                    <SortTh label="Ingeschreven op" k="date" sort={t.sort} onSort={t.toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => {
                    const p = it.enrollment_parents ?? [];
                    const isChecked = t.checked.has(it.id);
                    return (
                      <tr key={it.id} onClick={() => setSelected(it)} className={isChecked ? "selected" : ""}>
                        <SelectTd checked={isChecked} onToggle={() => t.toggleOne(it.id)} label={`Selecteer ${it.child_name}`} />
                        <td><div className="flex items-center gap-3"><Avatar name={it.child_name} size="sm" /><span className="font-semibold">{it.child_name}</span></div></td>
                        <td><Badge kind={it.track === "hifdh" ? "primary" : "info"} dot>{it.track === "hifdh" ? "Hifdh" : "Regulier"}</Badge></td>
                        <td className="num">{it.age} jr</td>
                        <td className="text-sm">{it.preferred_lesday ? <Badge kind="info">{it.preferred_lesday}</Badge> : <span className="text-subtle">—</span>}</td>
                        <td className="text-sm">{p[0]?.name}<div className="text-xs text-subtle font-mono">{p[0]?.phone}</div></td>
                        <td className="text-sm">{p[1]?.name}<div className="text-xs text-subtle font-mono">{p[1]?.phone}</div></td>
                        <td>{it.target_class}</td>
                        <td><Badge>{STATUS_TITLE[it.status]}</Badge></td>
                        <td className="text-sm text-subtle">{fmtDate(enrollDate(it))}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-faint)" }}>Geen inschrijvingen gevonden</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </>
        ) : (
          <Klassenindeler enrollments={items} />
        )}
      </Section>

      {selected && <EnrollmentSheet item={selected} onClose={() => setSelected(null)} />}
      {newTrack && <NewEnrollmentModal track={newTrack} onClose={() => setNewTrack(null)} />}
    </>
  );
}
