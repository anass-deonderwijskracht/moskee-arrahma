import { useMemo, useState } from "react";
import { Card, Btn, Icon, Badge, Select, Pills, type Option, type BadgeKind } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useSchooljaren } from "@/data/schooljaren";
import { useClasses, type ClassRow } from "@/data/classes";
import { usePlacements, useUpsertPlacement, useFinalizeEnrollment, useUpdateFinalizedLeerling, useUpdateEnrollmentStatus, useToggleTwijfel, finalizeBlockers, NIVEAUS, type Enrollment, type Placement } from "@/data/enrollments";
import { useSetLesgeldOverride } from "@/data/tuition";
import { ENROLL_COLUMNS } from "@/data/dashboard";
import { age, ageLabel } from "@/data/age";
import { EnrollmentSheet } from "@/features/enrollments/EnrollmentSheet";
import { renderIntakeMessage, useIntakeMoments, useSetIntakeAttendance, type IntakeChoice } from "@/data/intakes";

type Track = "all" | "regulier" | "hifdh";
type SortKey = "date" | "name" | "status" | "lesday" | "age" | "intake" | "klas" | "niveau" | "lesgeld";
const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));
const STATUS_KIND: Record<string, BadgeKind> = {
  herinschrijving: "primary", wachtlijst: "warn", intake: "accent", toegezegd: "info", definitief: "success", afgewezen: "danger",
};
const STATUS_ORDER: Record<string, number> = { herinschrijving: 0, wachtlijst: 1, intake: 2, toegezegd: 3, definitief: 4, afgewezen: 5 };
// Waar een status naartoe valt als je 'm weghaalt en de vorige status niet meer bekend is.
const FALLBACK_STATUS = "wachtlijst";
// Soft row tint per status.
const ROW_BG: Record<string, string> = { toegezegd: "var(--info-soft)", definitief: "var(--success-soft)", afgewezen: "var(--danger-soft)" };

// De query sorteert op `grade`, wat niet met de klasnamen hoeft mee te lopen.
// numeric houdt "Klas 2" vóór "Klas 10" in plaats van tekstueel "10" < "2".
const byCode = (a: ClassRow, b: ClassRow) =>
  a.code.localeCompare(b.code, "nl", { numeric: true, sensitivity: "base" });

function dateTimeNL(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function intakeMomentLabel(description: string, status: string, createdAt: string): string {
  const date = new Date(createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  const normalizedDescription = description.replace(/\s+/g, " ").trim();
  const shortDescription = normalizedDescription.length > 52 ? `${normalizedDescription.slice(0, 49)}…` : normalizedDescription;
  return `${status === "actief" ? "Actief" : status === "verlopen" ? "Verlopen" : "Concept"} · ${date} · ${shortDescription}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
}

function ParentCell({ parent }: { parent: Enrollment["enrollment_parents"][number] | undefined }) {
  if (!parent) return <span className="text-subtle">—</span>;
  return (
    <div className="intake-parent-cell">
      <div className="font-semibold text-sm">{parent.name || "Naam onbekend"}</div>
      <div className="text-xs text-subtle">{parent.phone || "Geen telefoonnummer"}</div>
      {parent.is_primary && <span className="intake-primary-parent"><Icon name="check" size={11} /> Primair</span>}
    </div>
  );
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
  const [onlyTwijfel, setOnlyTwijfel] = useState(false);
  // Klikken op een klas-tegel filtert de lijst eronder; nog een klik zet 'm uit.
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Enrollment | null>(null);
  const [selectedIntakeId, setSelectedIntakeId] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

  const { data: classes, isLoading: classesLoading } = useClasses(effectiveSj);
  const { data: placements } = usePlacements(effectiveSj);
  const { data: intakeMoments } = useIntakeMoments();
  const upsert = useUpsertPlacement();
  const finalize = useFinalizeEnrollment();
  const updateLeerling = useUpdateFinalizedLeerling();
  const updateStatus = useUpdateEnrollmentStatus();
  const toggleTwijfel = useToggleTwijfel();
  const setIntakeAttendance = useSetIntakeAttendance();
  const setOverride = useSetLesgeldOverride();

  // Onthoudt per inschrijving de status van vóór de klik, zodat een tweede klik
  // op dezelfde knop de status weer weghaalt en terugvalt op wat het was.
  const [prevStatus, setPrevStatus] = useState<Record<string, string>>({});

  const setStatus = (e: Enrollment, status: string) => {
    const undo = e.status === status;
    const next = undo ? (prevStatus[e.id] ?? FALLBACK_STATUS) : status;
    if (next === e.status) return;
    setPrevStatus((p) => {
      const { [e.id]: _dropped, ...rest } = p;
      return undo ? rest : { ...rest, [e.id]: e.status };
    });
    updateStatus.mutate({ id: e.id, status: next }, { onSuccess: () => toast(`${e.child_name} → ${STATUS_TITLE[next] ?? next}`) });
  };

  const pmap = placements ?? {};
  const selectedIntake = (intakeMoments ?? []).find((moment) => moment.id === selectedIntakeId) ?? null;
  const intakeByEnrollment = useMemo(() => {
    const map: Record<string, IntakeChoice> = {};
    for (const choice of selectedIntake?.intake_choices ?? []) map[choice.enrollment_id] = choice;
    return map;
  }, [selectedIntake]);
  const intakeAttendanceByEnrollment = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const attendance of selectedIntake?.intake_attendance ?? []) map[attendance.enrollment_id] = attendance.attended;
    return map;
  }, [selectedIntake]);
  // Eén op naam gesorteerde lijst voor zowel de tegels als de keuzelijst per rij.
  const sortedClasses = useMemo(() => [...(classes ?? [])].sort(byCode), [classes]);
  const klassen = useMemo(() => sortedClasses.filter((c) => track === "all" || c.track === track), [sortedClasses, track]);

  const classCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of (classes ?? [])) m[c.id] = c.code;
    return m;
  }, [classes]);

  // Table shows ALL statuses by default; filtered by track + the status multi-select,
  // then sorted client-side with a stable `id` tiebreaker so rows never jump on edits.
  const indelen = useMemo(() => {
    const rows = enrollments.filter((e) =>
      (track === "all" || e.track === track)
      && statuses.has(e.status)
      && (!onlyTwijfel || e.twijfel)
      && (!classFilter || pmap[e.id]?.class_id === classFilter));
    const val = (e: Enrollment): string | number => {
      const p = pmap[e.id];
      switch (sort.key) {
        case "name": return (e.child_name ?? "").toLowerCase();
        case "status": return STATUS_ORDER[e.status] ?? 99;
        case "lesday": return e.preferred_lesday ?? "";
        case "age": return age(e) ?? -1;
        case "intake": return intakeByEnrollment[e.id]?.updated_at ?? "";
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
  }, [enrollments, track, statuses, onlyTwijfel, classFilter, sort, pmap, classCode, intakeByEnrollment]);

  // Telt binnen het gekozen traject, zodat het getal bij de chip klopt met de lijst.
  const twijfelCount = useMemo(
    () => enrollments.filter((e) => (track === "all" || e.track === track) && e.twijfel).length,
    [enrollments, track],
  );

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

  const intakeLink = (enrollment: Enrollment) => `${window.location.origin}/intake/${enrollment.intake_access_token}`;

  const copyIntakeLink = async (enrollment: Enrollment) => {
    if (selectedIntake?.status !== "actief" || !enrollment.intake_access_token) return;
    const copied = await copyText(intakeLink(enrollment));
    toast(copied ? `Ouderlink voor het gezin van ${enrollment.child_name} gekopieerd` : "Kopiëren is niet gelukt");
  };

  const copyIntakeMessage = async (enrollment: Enrollment) => {
    if (selectedIntake?.status !== "actief" || !enrollment.intake_access_token) return;
    const message = renderIntakeMessage(selectedIntake.message_template, intakeLink(enrollment));
    const copied = await copyText(message);
    toast(copied ? `Volledig bericht voor ${enrollment.child_name} gekopieerd` : "Kopiëren is niet gelukt");
  };

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
              const active = classFilter === c.id;
              return (
                <button key={c.id} type="button"
                  onClick={() => setClassFilter((v) => (v === c.id ? null : c.id))}
                  title={active ? "Klik om het klasfilter te wissen" : `Toon alleen inschrijvingen voor ${c.code}`}
                  style={{
                    textAlign: "left", cursor: "pointer", width: "100%", padding: 12, borderRadius: 10,
                    background: active ? "var(--primary-soft)" : "var(--bg-sunken)",
                    border: "1px solid " + (active ? "var(--primary)" : cnt.concept > cap ? "var(--danger)" : "var(--border)"),
                    boxShadow: active ? "0 0 0 1px var(--primary)" : undefined,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm" style={{ color: active ? "var(--primary)" : undefined }}>{c.code}</span>
                    <span className="flex items-center gap-1">
                      {c.track === "hifdh" && <Badge kind="primary">Hifdh</Badge>}
                      {active && <Icon name="check" size={12} />}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{cnt.concept}</span>
                    <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>/ {cap}</span>
                    {cnt.concept > cap && <Badge kind="danger" dot>Vol</Badge>}
                  </div>
                  <div style={{ height: 6, background: "var(--bg-elev)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: Math.min(100, ratio * 100) + "%", background: fill, borderRadius: 999 }} /></div>
                  <div className="text-xs text-subtle mt-2 flex justify-between"><span>Concept</span><span><b style={{ color: "var(--success)" }}>{cnt.definitief}</b> definitief</span></div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        className="scroll-x"
        title={<><Icon name="list" size={14} /> Inschrijvingen indelen</>}
        sub="Alle inschrijvingen — filter op status om optimaal in te delen. Wijzigingen worden direct doorgevoerd (ook na definitief)."
        action={(
          <div className="intake-table-picker">
            <label htmlFor="klassenindeler-intake">Intake</label>
            <Select id="klassenindeler-intake" value={selectedIntakeId} onChange={(event) => setSelectedIntakeId(event.target.value)}>
              <option value="">Geen intake geselecteerd</option>
              {(intakeMoments ?? []).map((moment) => (
                <option key={moment.id} value={moment.id}>{intakeMomentLabel(moment.description, moment.status, moment.created_at)}</option>
              ))}
            </Select>
          </div>
        )}
      >
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

          <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />

          {/* Twijfel staat los van de status: een inschrijving kan toegezegd zijn
              én twijfelachtig. Daarom een eigen filter met eigen telling. */}
          <button onClick={() => setOnlyTwijfel((v) => !v)}
            title={onlyTwijfel ? "Toon weer alle inschrijvingen" : "Toon alleen inschrijvingen waar je over twijfelt"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (onlyTwijfel ? "var(--warn)" : "var(--border)"), background: onlyTwijfel ? "var(--warn-soft)" : "var(--bg-elev)", color: onlyTwijfel ? "var(--warn)" : "var(--fg-muted)" }}>
            <b style={{ fontSize: 13, lineHeight: 1 }}>?</b> Twijfel
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, padding: "0 5px", borderRadius: 999, background: onlyTwijfel ? "var(--warn)" : "var(--bg-sunken)", color: onlyTwijfel ? "var(--bg-elev)" : "var(--fg-subtle)" }}>{twijfelCount}</span>
            {onlyTwijfel && <Icon name="check" size={11} />}
          </button>

          {classFilter && (
            <button onClick={() => setClassFilter(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid var(--primary)", background: "var(--primary-soft)", color: "var(--primary)" }}>
              Klas {classCode[classFilter] ?? "?"} <Icon name="x" size={11} />
            </button>
          )}
        </div>
        <table className="table" style={{ minWidth: selectedIntake ? 2050 : 1180 }}>
          <thead><tr>
            <Th label="Inschrijving" k="date" sort={sort} onSort={toggleSort} />
            <Th label="Status" k="status" sort={sort} onSort={toggleSort} />
            <Th label="Voorkeur lesdag" k="lesday" sort={sort} onSort={toggleSort} />
            <Th label="Leeftijd" k="age" sort={sort} onSort={toggleSort} />
            {selectedIntake && <>
              <th>Ouder 1</th>
              <th>Ouder 2</th>
              <Th label="Gekozen intake" k="intake" sort={sort} onSort={toggleSort} />
              <th>Bericht</th>
              <th>Link</th>
              <th>Aanwezig</th>
            </>}
            <Th label="Klas" k="klas" sort={sort} onSort={toggleSort} />
            <Th label="Niveau" k="niveau" sort={sort} onSort={toggleSort} />
            <Th label="Lesgeld betaald" k="lesgeld" sort={sort} onSort={toggleSort} />
            <th style={{ width: 1 }}></th>
          </tr></thead>
          <tbody>
            {indelen.map((e) => {
              const p = pmap[e.id] ?? ({} as Partial<Placement>);
              const isDef = !!p.definitief;
              const blockers = finalizeBlockers(p as Placement);
              const eligible = sortedClasses.filter((c) => (e.track === "hifdh" ? c.track === "hifdh" : c.track !== "hifdh"));
              const parents = [...e.enrollment_parents].sort((a, b) =>
                Number(b.is_primary) - Number(a.is_primary)
                || (a.role ?? a.name ?? "").localeCompare(b.role ?? b.name ?? "", "nl"));
              const intakeChoice = intakeByEnrollment[e.id];
              const intakeCanBeShared = selectedIntake?.status === "actief" && !!e.intake_access_token;
              const attended = intakeAttendanceByEnrollment[e.id] ?? false;
              return (
                <tr key={e.id} onClick={() => setSelected(e)} style={{ background: ROW_BG[e.status] ?? "transparent", cursor: "pointer" }} title="Open inschrijving">
                  <td>
                    <div className="font-semibold">{e.child_name}</div>
                    <div className="text-xs text-subtle font-mono">{dateTimeNL(e.submitted_at ?? e.created_at)}</div>
                  </td>
                  <td>
                    <span className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
                      <Badge kind={STATUS_KIND[e.status] ?? "info"}>{STATUS_TITLE[e.status] ?? e.status}</Badge>
                      {e.twijfel && <Badge kind="warn" dot>Twijfel</Badge>}
                    </span>
                  </td>
                  <td>{e.preferred_lesday ? <Badge kind={e.preferred_lesday === "Geen voorkeur" ? "default" : "info"}>{e.preferred_lesday}</Badge> : <span className="text-subtle">—</span>}</td>
                  <td className="num">{ageLabel(e, { approx: true })}</td>
                  {selectedIntake && <>
                    <td><ParentCell parent={parents[0]} /></td>
                    <td><ParentCell parent={parents[1]} /></td>
                    <td>
                      {intakeChoice?.intake_slots ? (
                        <div>
                          <div className="font-semibold text-sm">{new Date(`${intakeChoice.intake_slots.date}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</div>
                          <div className="text-xs text-subtle">{intakeChoice.intake_slots.start_time.slice(0, 5)} – {intakeChoice.intake_slots.end_time.slice(0, 5)}</div>
                        </div>
                      ) : intakeChoice?.other_text ? (
                        <div title={intakeChoice.other_text} style={{ maxWidth: 150 }}>
                          <div className="font-semibold text-sm">Anders</div>
                          <div className="text-xs text-subtle truncate">{intakeChoice.other_text}</div>
                        </div>
                      ) : <span className="text-xs text-subtle">Nog niet gekozen</span>}
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <Btn size="sm" icon="copy" disabled={!intakeCanBeShared}
                        title={intakeCanBeShared ? "Volledig ingestelde ouderbericht kopiëren" : "Alleen beschikbaar voor de actieve intake"}
                        aria-label={`Volledig intakebericht voor ${e.child_name} kopiëren`}
                        onClick={() => void copyIntakeMessage(e)}>Bericht</Btn>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <Btn size="sm" kind="ghost" icon="copy" disabled={!intakeCanBeShared}
                        title={intakeCanBeShared ? "Alleen de persoonlijke link kopiëren" : "Alleen beschikbaar voor de actieve intake"}
                        aria-label={`Intakelink voor ${e.child_name} kopiëren`}
                        onClick={() => void copyIntakeLink(e)}>Link</Btn>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <label className="intake-attendance-check">
                        <input type="checkbox" checked={attended} disabled={setIntakeAttendance.isPending}
                          onChange={(event) => setIntakeAttendance.mutate({
                            intakeMomentId: selectedIntake.id,
                            enrollmentId: e.id,
                            attended: event.target.checked,
                          }, { onError: () => toast("Aanwezigheid opslaan mislukt") })} />
                        <span>{attended ? "Ja" : "Nee"}</span>
                      </label>
                    </td>
                  </>}
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
                      <Btn size="sm" kind={e.status === "toegezegd" ? "primary" : "default"} disabled={updateStatus.isPending}
                        title={e.status === "toegezegd" ? "Klik om Toegezegd weer weg te halen" : "Toezeggen"}
                        onClick={() => setStatus(e, "toegezegd")}>Toegezegd</Btn>
                      <Btn size="sm" kind={isDef ? "primary" : "default"} icon="check" disabled={(blockers.length > 0 && !isDef) || finalize.isPending}
                        onClick={() => { if (!isDef) doFinalize(e); }}
                        title={isDef ? "Definitief ingeschreven" : blockers.length ? `Kies eerst ${blockers.join(" en ")}` : "Definitief inschrijven"}>
                        Definitief
                      </Btn>
                      <button className="att-pill" data-status={e.status === "afgewezen" ? "O" : "-"} style={{ fontSize: 13 }}
                        title={e.status === "afgewezen" ? "Klik om Afgewezen weer weg te halen" : "Afwijzen"}
                        onClick={() => setStatus(e, "afgewezen")}>✗</button>
                      {/* Twijfel is een markering náást de status, geen status: je
                          kunt over een toegezegde inschrijving twijfelen. */}
                      <button className="att-pill" data-status={e.twijfel ? "L" : "-"} style={{ fontSize: 13 }}
                        aria-pressed={e.twijfel}
                        title={e.twijfel ? "Twijfel weghalen" : "Markeren als twijfel"}
                        onClick={() => toggleTwijfel.mutate({ id: e.id, twijfel: !e.twijfel },
                          { onError: () => toast("Opslaan mislukt") })}>?</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {indelen.length === 0 && <tr><td colSpan={selectedIntake ? 14 : 8}><div className="empty">Geen inschrijvingen voor deze filter.</div></td></tr>}
          </tbody>
        </table>
      </Card>

      {selected && <EnrollmentSheet key={selected.id} item={enrollments.find((e) => e.id === selected.id) ?? selected} placement={pmap[selected.id] ?? null} schooljaarId={effectiveSj} onClose={() => setSelected(null)} onDuplicated={setSelected} />}
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
