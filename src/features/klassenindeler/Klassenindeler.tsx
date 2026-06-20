import { useMemo, useState } from "react";
import { Card, Btn, Icon, Badge, Select, Pills, type Option, type BadgeKind } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useSchooljaren } from "@/data/schooljaren";
import { useClasses } from "@/data/classes";
import { usePlacements, useUpsertPlacement, useFinalizeEnrollment, useUpdateFinalizedLeerling, useUpdateEnrollmentStatus, NIVEAUS, type Enrollment, type Placement } from "@/data/enrollments";
import { useSetLesgeldOverride } from "@/data/tuition";
import { ENROLL_COLUMNS } from "@/data/dashboard";
import { EnrollmentSheet } from "@/features/enrollments/EnrollmentSheet";

type Track = "all" | "regulier" | "hifdh";
type SortKey = "date" | "name" | "status" | "lesday" | "age" | "klas" | "niveau" | "lesgeld";
const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));
const STATUS_KIND: Record<string, BadgeKind> = {
  wachtlijst: "warn", intake: "accent", toegezegd: "info", definitief: "success", afgewezen: "danger",
};
const STATUS_ORDER: Record<string, number> = { wachtlijst: 0, intake: 1, toegezegd: 2, definitief: 3, afgewezen: 4 };
// Soft row tint per status.
const ROW_BG: Record<string, string> = { toegezegd: "var(--info-soft)", definitief: "var(--success-soft)", afgewezen: "var(--danger-soft)" };

function dateTimeNL(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function Klassenindeler({ enrollments }: { enrollments: Enrollment[] }) {
  const toast = useToast();
  const { data: schooljaren } = useSchooljaren();
  const nonArchived = (schooljaren ?? []).filter((s) => !s.archived);
  const current = nonArchived.find((s) => s.is_current);
  const next = nonArchived.find((s) => current && s.code > current.code) ?? current;
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? next?.id ?? null;

  const [track, setTrack] = useState<Track>("regulier");
  const [statuses, setStatuses] = useState<Set<string>>(() => new Set(ENROLL_COLUMNS.map((c) => c.id)));
  const [selected, setSelected] = useState<Enrollment | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

  const { data: classes, isLoading: classesLoading } = useClasses(effectiveSj);
  const { data: placements } = usePlacements(effectiveSj);
  const upsert = useUpsertPlacement();
  const finalize = useFinalizeEnrollment();
  const updateLeerling = useUpdateFinalizedLeerling();
  const updateStatus = useUpdateEnrollmentStatus();
  const setOverride = useSetLesgeldOverride();

  const setStatus = (e: Enrollment, status: string) =>
    updateStatus.mutate({ id: e.id, status }, { onSuccess: () => toast(`${e.child_name} → ${STATUS_TITLE[status] ?? status}`) });

  const pmap = placements ?? {};
  const klassen = useMemo(() => (classes ?? []).filter((c) => track === "all" || c.track === track), [classes, track]);

  const classCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of (classes ?? [])) m[c.id] = c.code;
    return m;
  }, [classes]);

  // Table shows ALL statuses by default; filtered by track + the status multi-select,
  // then sorted client-side with a stable `id` tiebreaker so rows never jump on edits.
  const indelen = useMemo(() => {
    const rows = enrollments.filter((e) => (track === "all" || e.track === track) && statuses.has(e.status));
    const val = (e: Enrollment): string | number => {
      const p = pmap[e.id];
      switch (sort.key) {
        case "name": return (e.child_name ?? "").toLowerCase();
        case "status": return STATUS_ORDER[e.status] ?? 99;
        case "lesday": return e.preferred_lesday ?? "";
        case "age": return e.age ?? -1;
        case "klas": return p?.class_id ? (classCode[p.class_id] ?? "") : "";
        case "niveau": return p?.niveau ?? "";
        case "lesgeld": return p?.lesgeld_bedrag != null ? Number(p.lesgeld_bedrag) : -1;
        case "date": default: return e.submitted_at ?? e.created_at ?? "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return (cmp !== 0 ? cmp : a.id.localeCompare(b.id)) * dir;
    });
  }, [enrollments, track, statuses, sort, pmap, classCode]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const acc: Record<string, { concept: number; definitief: number }> = {};
    for (const c of (classes ?? [])) acc[c.id] = { concept: 0, definitief: 0 };
    for (const e of enrollments) {
      const p = pmap[e.id];
      if (p?.class_id && acc[p.class_id]) { acc[p.class_id].concept++; if (p.definitief) acc[p.class_id].definitief++; }
    }
    return acc;
  }, [classes, enrollments, pmap]);

  const totalAssigned = enrollments.filter((e) => pmap[e.id]?.class_id).length;
  const totalDefinitief = enrollments.filter((e) => pmap[e.id]?.definitief).length;

  const patch = async (e: Enrollment, p: Partial<Pick<Placement, "class_id" | "niveau" | "lesgeld_bedrag">>) => {
    if (!effectiveSj) return;
    const existing = pmap[e.id];
    await upsert.mutateAsync({ enrollment_id: e.id, schooljaar_id: effectiveSj, ...p });
    // If already finalised, push class/niveau changes straight to the leerling record.
    if (existing?.definitief && existing.leerling_id && (p.class_id !== undefined || p.niveau !== undefined)) {
      await updateLeerling.mutateAsync({ leerlingId: existing.leerling_id, patch: { class_id: p.class_id, niveau: p.niveau } });
      toast("Wijziging direct doorgevoerd op de leerling");
    }
  };

  const doFinalize = async (e: Enrollment) => {
    if (!effectiveSj) return;
    const existing = pmap[e.id];
    try {
      const placement = existing?.id ? existing : await upsert.mutateAsync({ enrollment_id: e.id, schooljaar_id: effectiveSj });
      const leerlingId = await finalize.mutateAsync(placement.id);
      // Een handmatig te-betalen bedrag neemt de leerling over (anders volgt de staffel per gezin).
      if (placement.lesgeld_verschuldigd != null && leerlingId) {
        await setOverride.mutateAsync({ leerlingId, value: Number(placement.lesgeld_verschuldigd) });
      }
      toast(`${e.child_name} definitief ingeschreven`);
    } catch (err) { toast("Inschrijven mislukt: " + (err instanceof Error ? err.message : "onbekend")); }
  };

  const toggleStatus = (id: string) => setStatuses((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next.size === 0 ? new Set([id]) : next; // never empty
  });

  const trackPills: Option<Track>[] = [
    { value: "all", label: "Beide" },
    { value: "regulier", label: "Regulier" },
    { value: "hifdh", label: "Hifdh" },
  ];

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="flex items-end gap-3" style={{ flexWrap: "wrap" }}>
            <div>
              <div className="text-xs text-subtle font-semibold mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Schooljaar</div>
              <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: "auto", minWidth: 200, fontSize: 15, fontWeight: 600, padding: "8px 12px" }}>
                {nonArchived.map((s) => <option key={s.id} value={s.id}>Schooljaar {s.name}{s.is_current ? " (huidig)" : current && s.code > current.code ? " (nieuw)" : ""}</option>)}
              </Select>
            </div>
            <div>
              <div className="text-xs text-subtle font-semibold mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Traject</div>
              <Pills value={track} onChange={setTrack} options={trackPills} />
            </div>
          </div>
          <div className="flex gap-3" style={{ textAlign: "right" }}>
            <div><div className="text-xs text-subtle">Concept ingedeeld</div><div className="text-xl font-semibold tabular">{totalAssigned} <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>/ {enrollments.length}</span></div></div>
            <div style={{ width: 1, background: "var(--border)" }} />
            <div><div className="text-xs text-subtle">Definitief ingeschreven</div><div className="text-xl font-semibold tabular" style={{ color: "var(--success)" }}>{totalDefinitief}</div></div>
          </div>
        </div>

        {classesLoading ? <Loading /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {klassen.map((c) => {
              const cnt = counts[c.id] ?? { concept: 0, definitief: 0 };
              const cap = c.capacity ?? 1;
              const ratio = cnt.concept / cap;
              const fill = ratio >= 1 ? "var(--danger)" : ratio > 0.8 ? "var(--warn)" : "var(--primary)";
              return (
                <div key={c.id} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: 10, border: "1px solid " + (cnt.concept > cap ? "var(--danger)" : "var(--border)") }}>
                  <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm">{c.code}</span>{c.track === "hifdh" && <Badge kind="primary">Hifdh</Badge>}</div>
                  <div className="flex items-baseline gap-1" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{cnt.concept}</span>
                    <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>/ {cap}</span>
                    {cnt.concept > cap && <Badge kind="danger" dot>Vol</Badge>}
                  </div>
                  <div style={{ height: 6, background: "var(--bg-elev)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: Math.min(100, ratio * 100) + "%", background: fill, borderRadius: 999 }} /></div>
                  <div className="text-xs text-subtle mt-2 flex justify-between"><span>Concept</span><span><b style={{ color: "var(--success)" }}>{cnt.definitief}</b> definitief</span></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={<><Icon name="list" size={14} /> Inschrijvingen indelen</>} sub="Alle inschrijvingen — filter op status om optimaal in te delen. Wijzigingen worden direct doorgevoerd (ook na definitief).">
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
          <span className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Status:</span>
          {ENROLL_COLUMNS.map((c) => {
            const on = statuses.has(c.id);
            return (
              <button key={c.id} onClick={() => toggleStatus(c.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (on ? "var(--primary)" : "var(--border)"), background: on ? "var(--primary-soft)" : "var(--bg-elev)", color: on ? "var(--primary)" : "var(--fg-muted)" }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: c.color }} />{c.title}
                {on && <Icon name="check" size={11} />}
              </button>
            );
          })}
        </div>
        <table className="table">
          <thead><tr>
            <Th label="Inschrijving" k="date" sort={sort} onSort={toggleSort} />
            <Th label="Status" k="status" sort={sort} onSort={toggleSort} />
            <Th label="Voorkeur lesdag" k="lesday" sort={sort} onSort={toggleSort} />
            <Th label="Leeftijd" k="age" sort={sort} onSort={toggleSort} />
            <Th label="Klas" k="klas" sort={sort} onSort={toggleSort} />
            <Th label="Niveau" k="niveau" sort={sort} onSort={toggleSort} />
            <Th label="Lesgeld betaald" k="lesgeld" sort={sort} onSort={toggleSort} />
            <th style={{ width: 1 }}></th>
          </tr></thead>
          <tbody>
            {indelen.map((e) => {
              const p = pmap[e.id] ?? ({} as Partial<Placement>);
              const isDef = !!p.definitief;
              const eligible = (classes ?? []).filter((c) => (e.track === "hifdh" ? c.track === "hifdh" : c.track !== "hifdh"));
              return (
                <tr key={e.id} onClick={() => setSelected(e)} style={{ background: ROW_BG[e.status] ?? "transparent", cursor: "pointer" }} title="Open inschrijving">
                  <td>
                    <div className="font-semibold">{e.child_name}</div>
                    <div className="text-xs text-subtle font-mono">{dateTimeNL(e.submitted_at ?? e.created_at)}</div>
                  </td>
                  <td><Badge kind={STATUS_KIND[e.status] ?? "info"}>{STATUS_TITLE[e.status] ?? e.status}</Badge></td>
                  <td>{e.preferred_lesday ? <Badge kind={e.preferred_lesday === "Geen voorkeur" ? "default" : "info"}>{e.preferred_lesday}</Badge> : <span className="text-subtle">—</span>}</td>
                  <td className="num">{e.age != null ? e.age + " jr" : "—"}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <Select value={p.class_id ?? ""} style={{ minWidth: 150 }} onChange={(ev) => patch(e, { class_id: ev.target.value || null })}>
                      <option value="">— kies klas —</option>
                      {eligible.map((c) => <option key={c.id} value={c.id}>{c.code} ({counts[c.id]?.concept ?? 0}/{c.capacity})</option>)}
                    </Select>
                  </td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <Select value={p.niveau ?? ""} style={{ minWidth: 120 }} onChange={(ev) => patch(e, { niveau: ev.target.value || null })}>
                      <option value="">— kies —</option>
                      {NIVEAUS.map((n) => <option key={n} value={n}>Niveau {n}</option>)}
                    </Select>
                  </td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <div style={{ position: "relative", minWidth: 130 }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)", fontSize: 13 }}>€</span>
                      <input className="input" type="number" min={0} step={10} placeholder="0"
                        defaultValue={p.lesgeld_bedrag ?? ""} onBlur={(ev) => patch(e, { lesgeld_bedrag: ev.target.value === "" ? null : parseFloat(ev.target.value) })}
                        style={{ paddingLeft: 22, textAlign: "right", fontFamily: "var(--mono)" }} />
                    </div>
                  </td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex gap-1 items-center" style={{ justifyContent: "flex-end" }}>
                      <Btn size="sm" kind={e.status === "toegezegd" ? "primary" : "default"} disabled={updateStatus.isPending} onClick={() => setStatus(e, "toegezegd")}>Toegezegd</Btn>
                      <Btn size="sm" kind={isDef ? "primary" : "default"} icon="check" disabled={(!p.class_id || !p.niveau) && !isDef || finalize.isPending}
                        onClick={() => { if (!isDef) doFinalize(e); }}
                        title={isDef ? "Definitief ingeschreven" : (!p.class_id || !p.niveau ? "Kies eerst klas en niveau" : "Definitief inschrijven")}>
                        Definitief
                      </Btn>
                      <button className="att-pill" data-status={e.status === "afgewezen" ? "O" : "-"} title="Afwijzen" style={{ fontSize: 13 }} onClick={() => setStatus(e, "afgewezen")}>✗</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {indelen.length === 0 && <tr><td colSpan={8}><div className="empty">Geen inschrijvingen voor deze filter.</div></td></tr>}
          </tbody>
        </table>
      </Card>

      {selected && <EnrollmentSheet key={selected.id} item={enrollments.find((e) => e.id === selected.id) ?? selected} placement={pmap[selected.id] ?? null} schooljaarId={effectiveSj} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Th({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th onClick={() => onSort(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} title="Sorteer">
      {label} <span style={{ opacity: active ? 1 : 0.25 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}
