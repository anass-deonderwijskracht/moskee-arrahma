import { useMemo, useState } from "react";
import { Section, Card, Btn, Icon, Badge, Pills, Avatar, type Option } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useEnrollments, useUpdateEnrollmentStatus, useDeleteEnrollments, type Enrollment } from "@/data/enrollments";
import { ENROLL_COLUMNS } from "@/data/dashboard";
import { Klassenindeler } from "@/features/klassenindeler/Klassenindeler";
import { NewEnrollmentModal } from "./NewEnrollmentModal";
import { EnrollmentSheet } from "./EnrollmentSheet";

type View = "kanban" | "table" | "indeler";
type Track = "all" | "regulier" | "hifdh";
type SortKey = "child_name" | "track" | "age" | "preferred_lesday" | "target_class" | "status" | "date";
type Sort = { key: SortKey; dir: "asc" | "desc" };

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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const items = data ?? [];
  const visible = useMemo(() => items.filter((i) => track === "all" || i.track === track), [items, track]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = visible;
    if (q) {
      r = r.filter((it) => {
        const p = it.enrollment_parents ?? [];
        return [it.child_name, it.target_class, it.preferred_lesday, STATUS_TITLE[it.status], ...p.flatMap((x) => [x.name, x.phone])]
          .some((v) => v?.toLowerCase().includes(q));
      });
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (it: Enrollment): string | number => {
      switch (sort.key) {
        case "age": return it.age ?? -1;
        case "date": return enrollDate(it);
        case "child_name": return it.child_name ?? "";
        case "track": return it.track ?? "";
        case "preferred_lesday": return it.preferred_lesday ?? "";
        case "target_class": return it.target_class ?? "";
        case "status": return it.status ?? "";
      }
    };
    return [...r].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "nl") * dir;
    });
  }, [visible, search, sort]);

  if (isError) return <ErrorState error={error} />;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "age" ? "desc" : "asc" }));

  const allShownChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allShownChecked) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const onDeleteSelected = () => {
    const ids = [...checked];
    if (!ids.length) return;
    if (!confirm(`${ids.length} inschrijving(en) definitief verwijderen? Dit verwijdert ook gekoppelde ouders en plaatsingen.`)) return;
    deleteEnrollments.mutate(ids, {
      onSuccess: () => { toast(`${ids.length} inschrijving(en) verwijderd`); setChecked(new Set()); },
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
              <div style={{ position: "relative", width: 280 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)", pointerEvents: "none" }}>
                  <Icon name="search" size={15} />
                </span>
                <input
                  className="input"
                  style={{ paddingLeft: 32 }}
                  placeholder="Zoek op naam, ouder, klas…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="text-sm text-subtle">{rows.length} resultaten</span>
              <div style={{ flex: 1 }} />
              {checked.size > 0 && (
                <>
                  <span className="text-sm font-semibold">{checked.size} geselecteerd</span>
                  <Btn kind="ghost" size="sm" onClick={() => setChecked(new Set())}>Wissen</Btn>
                  <Btn kind="danger" size="sm" icon="trash" onClick={onDeleteSelected} disabled={deleteEnrollments.isPending}>Verwijderen</Btn>
                </>
              )}
            </div>
            <Card>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allShownChecked} onChange={toggleAll} aria-label="Alles selecteren" />
                    </th>
                    <SortTh label="Kind" k="child_name" sort={sort} onSort={toggleSort} />
                    <SortTh label="Traject" k="track" sort={sort} onSort={toggleSort} />
                    <SortTh label="Leeftijd" k="age" sort={sort} onSort={toggleSort} />
                    <SortTh label="Voorkeur lesdag" k="preferred_lesday" sort={sort} onSort={toggleSort} />
                    <th>Ouder/voogd 1</th>
                    <th>Ouder/voogd 2</th>
                    <SortTh label="Doelklas" k="target_class" sort={sort} onSort={toggleSort} />
                    <SortTh label="Status" k="status" sort={sort} onSort={toggleSort} />
                    <SortTh label="Ingeschreven op" k="date" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => {
                    const p = it.enrollment_parents ?? [];
                    const isChecked = checked.has(it.id);
                    return (
                      <tr key={it.id} onClick={() => setSelected(it)} className={isChecked ? "selected" : ""}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(it.id)} aria-label={`Selecteer ${it.child_name}`} />
                        </td>
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

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => onSort(k)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <Icon name={active ? (sort.dir === "asc" ? "arrowUp" : "arrowDown") : "chevronDown"} size={12}
          style={{ opacity: active ? 1 : 0.3 }} />
      </span>
    </th>
  );
}
