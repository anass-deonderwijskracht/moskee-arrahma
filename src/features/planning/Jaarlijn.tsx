import { useMemo, useState } from "react";
import { Card, Select, Icon, Badge } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { usePlanningYear, type YearClass, type YearLesson } from "@/data/planning";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";
import { useSchoolPeriods } from "@/data/periods";
import { useTeachers } from "@/data/people";
import { buildWeeks, monthSpansOf, packLanes, isoLocal, mondayOf, parseIso, dagMaand, missingTeacher } from "./jaarlijnWeken";

/* -------------------------------------------------------------------------
 * Jaarlijn — de hele jaarplanning als één tijdlijn: weken van links naar
 * rechts, klassen van boven naar beneden. Bedoeld om te zien waar de gaten,
 * de vakanties en de onbemande weken zitten; bewerken gebeurt in het
 * docentenrooster ernaast.
 * ------------------------------------------------------------------------- */

const TYPES = ["les", "toets", "activiteit", "vrij"];
const TYPE_LABEL: Record<string, string> = { les: "Les", toets: "Toets", activiteit: "Activiteit", vrij: "Vrij" };
// Dezelfde kleurtaal als het docentenrooster, zodat beide weergaven hetzelfde zeggen.
const TYPE_COLOR: Record<string, { bg: string; fg: string }> = {
  les: { bg: "var(--info-soft)", fg: "var(--info)" },
  toets: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  activiteit: { bg: "var(--purple-soft)", fg: "var(--purple)" },
  vrij: { bg: "var(--bg-sunken)", fg: "var(--fg-subtle)" },
};
// Eén letter per blok; bij smalle kolommen is dat alles wat past.
const TYPE_INITIAL: Record<string, string> = { les: "", toets: "T", activiteit: "A", vrij: "" };
const PERIOD_COLOR: Record<string, { bg: string; fg: string }> = {
  vakantie: { bg: "var(--info-soft)", fg: "var(--info)" },
  feestdag: { bg: "var(--primary-soft)", fg: "var(--primary)" },
  ramadan: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

const LABEL_W = 156;
const DENSITY = { compact: 22, normaal: 30, ruim: 44 } as const;
type Density = keyof typeof DENSITY;

export function Jaarlijn() {
  const { data: schooljaren } = useSchooljaren();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? current?.id ?? null;
  const jaar = (schooljaren ?? []).find((s) => s.id === effectiveSj) ?? null;

  const { data, isLoading, isError, error } = usePlanningYear(effectiveSj);
  const { data: periods } = useSchoolPeriods(effectiveSj);
  const { data: teachers } = useTeachers();

  const classes = useMemo<YearClass[]>(() => data?.classes ?? [], [data]);
  const lessons = useMemo<YearLesson[]>(() => data?.lessons ?? [], [data]);

  // Verbergen in plaats van selecteren: leeg = alles zichtbaar. Zo hoeft er geen
  // effect op de klassen te wachten en klopt de weergave al bij de eerste render.
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set(TYPES));
  const [density, setDensity] = useState<Density>("compact");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const cellW = DENSITY[density];
  const teacherName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of teachers ?? []) m[t.id] = t.short || t.name;
    return m;
  }, [teachers]);

  const visibleClasses = classes.filter((c) => !hiddenClasses.has(c.id));
  const visibleLessons = useMemo(
    () => lessons.filter((l) => !hiddenClasses.has(l.class_id) && typeFilter.has(l.type)),
    [lessons, hiddenClasses, typeFilter],
  );

  // Bereik: bij voorkeur de datums van het schooljaar, anders de lessen zelf.
  const [rangeStart, rangeEnd] = useMemo(() => {
    const dates = lessons.map((l) => l.date);
    const min = jaar?.start_date ?? (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null);
    const max = jaar?.end_date ?? (dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null);
    return [min, max] as const;
  }, [jaar, lessons]);

  const weeks = useMemo(() => buildWeeks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  const weekIdxOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of weeks) m.set(w.start, w.idx);
    return (date: string) => m.get(isoLocal(mondayOf(parseIso(date))));
  }, [weeks]);

  // Lessen per klas per weekkolom.
  const byCell = useMemo(() => {
    const m = new Map<string, YearLesson[]>();
    for (const l of visibleLessons) {
      const wi = weekIdxOf(l.date);
      if (wi === undefined) continue;
      const key = `${l.class_id}|${wi}`;
      const arr = m.get(key);
      if (arr) arr.push(l); else m.set(key, [l]);
    }
    return m;
  }, [visibleLessons, weekIdxOf]);

  // Lesweeknummer uit de data zelf, zodat de kop gelijk loopt met het rooster.
  // Bij afwijkende nummers binnen één kolom wint het nummer dat het vaakst voorkomt.
  const weekNrLabel = useMemo(() => {
    const votes = new Map<number, Map<number, number>>();
    for (const l of visibleLessons) {
      if (l.week_nr == null) continue;
      const wi = weekIdxOf(l.date);
      if (wi === undefined) continue;
      const tally = votes.get(wi) ?? new Map<number, number>();
      tally.set(l.week_nr, (tally.get(l.week_nr) ?? 0) + 1);
      votes.set(wi, tally);
    }
    const out = new Map<number, number>();
    for (const [wi, tally] of votes) {
      out.set(wi, [...tally.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0]);
    }
    return out;
  }, [visibleLessons, weekIdxOf]);

  const perWeekCount = useMemo(() => {
    const out = new Map<number, number>();
    for (const l of visibleLessons) {
      const wi = weekIdxOf(l.date);
      if (wi === undefined) continue;
      out.set(wi, (out.get(wi) ?? 0) + 1);
    }
    return out;
  }, [visibleLessons, weekIdxOf]);
  const maxPerWeek = Math.max(1, ...perWeekCount.values());

  const periodLanes = useMemo(() => packLanes(periods ?? [], weeks), [periods, weeks]);

  const todayIdx = useMemo(() => weekIdxOf(isoLocal(new Date())), [weekIdxOf]);

  const stats = useMemo(() => {
    const s = { les: 0, toets: 0, activiteit: 0, vrij: 0, missing: 0 };
    const trackById = new Map(classes.map((c) => [c.id, c.track]));
    const filled = new Set<number>();
    for (const l of visibleLessons) {
      if (l.type in s) s[l.type as keyof typeof s]++;
      if (missingTeacher(l, trackById.get(l.class_id) ?? "regulier")) s.missing++;
      const wi = weekIdxOf(l.date);
      if (wi !== undefined) filled.add(wi);
    }
    return { ...s, lesweken: filled.size, legeWeken: Math.max(0, weeks.length - filled.size) };
  }, [visibleLessons, classes, weeks, weekIdxOf]);

  // Alleen de weken zonder ook maar één les — vindt de gaten in de jaarplanning.
  const shownWeeks = onlyGaps ? weeks.filter((w) => !perWeekCount.get(w.idx)) : weeks;

  const toggleClass = (id: string) => setHiddenClasses((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleType = (t: string) => setTypeFilter((prev) => {
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t);
    return n.size === 0 ? new Set(TYPES) : n; // nooit alles uit
  });
  // Klik op een rijlabel isoleert die klas; nog een klik zet alles weer aan.
  const isolateClass = (id: string) => setHiddenClasses((prev) => {
    const isolated = prev.size === classes.length - 1 && !prev.has(id);
    return isolated ? new Set() : new Set(classes.filter((c) => c.id !== id).map((c) => c.id));
  });

  if (isError) return <ErrorState error={error} />;
  if (isLoading) return <Loading label="Jaarplanning laden…" />;

  const gridCols = `${LABEL_W}px repeat(${shownWeeks.length}, ${cellW}px)`;

  const monthSpans = monthSpansOf(shownWeeks);

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Klassen:</span>
            {classes.map((c) => {
              const on = !hiddenClasses.has(c.id);
              return (
                <button key={c.id} onClick={() => toggleClass(c.id)} title={on ? `${c.code} verbergen` : `${c.code} tonen`}
                  style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (on ? "var(--primary)" : "var(--border)"), background: on ? "var(--primary-soft)" : "var(--bg-elev)", color: on ? "var(--primary)" : "var(--fg-muted)" }}>
                  {c.code}{c.track === "hifdh" ? " (H)" : ""}
                </button>
              );
            })}
            {hiddenClasses.size > 0 && (
              <button className="btn ghost sm" onClick={() => setHiddenClasses(new Set())}>Alles tonen</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={density} onChange={(e) => setDensity(e.target.value as Density)} style={{ width: "auto", minWidth: 110 }} title="Breedte van de weekkolommen">
              <option value="compact">Compact</option>
              <option value="normaal">Normaal</option>
              <option value="ruim">Ruim</option>
            </Select>
            <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: "auto", minWidth: 120 }}>
              {(schooljaren ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (huidig)" : ""}</option>)}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
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
          <button onClick={() => setOnlyGaps((v) => !v)}
            title={onlyGaps ? "Toon de hele jaarlijn weer" : "Toon alleen weken waarin geen enkele les staat"}
            style={{ padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid " + (onlyGaps ? "var(--warn)" : "var(--border)"), background: onlyGaps ? "var(--warn-soft)" : "var(--bg-elev)", color: onlyGaps ? "var(--warn)" : "var(--fg-muted)" }}>
            Alleen lege weken
            <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{stats.legeWeken}</span>
          </button>
          <span className="jl-legend" style={{ marginLeft: "auto" }}>
            {TYPES.map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="sw" style={{ background: TYPE_COLOR[t].bg, borderColor: TYPE_COLOR[t].fg }} />{TYPE_LABEL[t]}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="sw" style={{ background: "var(--danger-soft)", borderColor: "var(--danger)" }} />Docent ontbreekt
            </span>
          </span>
        </div>
      </Card>

      <div className="stat-grid">
        <JlStat label="Lesweken" value={stats.lesweken} sub={`van ${weeks.length} weken in het schooljaar`} icon="calendar" />
        <JlStat label="Lessen" value={stats.les} sub={`${stats.toets} toets · ${stats.activiteit} activiteit`} icon="book" />
        <JlStat label="Vrij" value={stats.vrij} sub={`${stats.legeWeken} week zonder les`} icon="flag" />
        <JlStat label="Docent ontbreekt" value={stats.missing} icon="presentation"
          sub={stats.missing ? "lessen wachten nog op een docent" : "elke les is bemand"}
          tone={stats.missing ? "danger" : "success"} />
      </div>

      <Card title="Jaarlijn" sub="Elke kolom is een week, elke rij een klas. Vakanties en feestdagen lopen als balk over de weken heen.">
        {classes.length === 0 ? (
          <div className="empty">Dit schooljaar heeft nog geen klassen.</div>
        ) : weeks.length === 0 ? (
          <div className="empty">
            Nog geen tijdlijn te tonen — dit schooljaar heeft geen lessen en geen begin- en einddatum.
            <div className="text-xs text-subtle mt-2">Stel de datums in en genereer de lesweken via Instellingen → Planning.</div>
          </div>
        ) : visibleClasses.length === 0 ? (
          <div className="empty">Alle klassen staan uit — zet er minstens één aan.</div>
        ) : shownWeeks.length === 0 ? (
          <div className="empty">Geen lege weken — elke week van dit schooljaar heeft minstens één les.</div>
        ) : (
          <div className="jl-scroll">
            <div className="jl-rows">
              {/* Maanden */}
              <div className="jl-row" style={{ gridTemplateColumns: gridCols, height: 26 }}>
                <div className="jl-label jl-head" style={{ justifyContent: "flex-start" }}>Maand</div>
                {monthSpans.map((m, i) => (
                  <div key={m.key + i} className="jl-cell jl-head" style={{ gridColumn: `span ${m.span}` }}>{m.label}</div>
                ))}
              </div>

              {/* Lesweeknummers */}
              <div className="jl-row" style={{ gridTemplateColumns: gridCols, height: 24, borderBottom: "1px solid var(--border)" }}>
                <div className="jl-label jl-head" style={{ justifyContent: "flex-start" }}>Lesweek</div>
                {shownWeeks.map((w) => {
                  const nr = weekNrLabel.get(w.idx);
                  const today = w.idx === todayIdx;
                  return (
                    <div key={w.idx} className={"jl-cell jl-head" + (today ? " jl-today" : "")}
                      title={`${dagMaand(w.start)} — ${dagMaand(w.end)}${nr ? ` · lesweek ${nr}` : ""}${today ? " · deze week" : ""}`}
                      style={{ color: today ? "var(--warn)" : undefined }}>
                      {nr ?? ""}
                    </div>
                  );
                })}
              </div>

              {/* Vakanties, feestdagen en ramadan */}
              {periodLanes.map((lane, li) => (
                <div key={"lane" + li} className="jl-row" style={{ gridTemplateColumns: gridCols, height: 22, paddingTop: 2 }}>
                  <div className="jl-label" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{li === 0 ? "Vakanties" : ""}</div>
                  {lane.map(({ item: p, from, to }) => {
                    // Kolommen verschuiven zodra lege weken eruit gefilterd zijn.
                    const cols = shownWeeks.map((w) => w.idx);
                    const a = cols.findIndex((i) => i >= from);
                    const bRev = [...cols].reverse().findIndex((i) => i <= to);
                    const b = bRev < 0 ? -1 : cols.length - 1 - bRev;
                    if (a < 0 || b < a) return null;
                    const col = PERIOD_COLOR[p.kind] ?? PERIOD_COLOR.vakantie;
                    return (
                      <div key={p.id} className="jl-band" style={{ gridColumn: `${a + 2} / span ${b - a + 1}`, background: col.bg, color: col.fg }}
                        title={`${p.name} · ${dagMaand(p.start_date)} — ${dagMaand(p.end_date)}${p.blocks_lessons ? " · geen les" : ""}`}>
                        {p.name}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Lessen per week */}
              <div className="jl-row" style={{ gridTemplateColumns: gridCols, height: 34, borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
                <div className="jl-label" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Lessen per week</div>
                {shownWeeks.map((w) => {
                  const n = perWeekCount.get(w.idx) ?? 0;
                  const today = w.idx === todayIdx;
                  return (
                    <div key={w.idx} className={"jl-cell" + (today ? " jl-today" : "")}
                      title={`${dagMaand(w.start)}: ${n} ${n === 1 ? "les" : "lessen"}`}
                      style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 3px" }}>
                      <div style={{
                        width: "100%", borderRadius: "2px 2px 0 0",
                        height: n === 0 ? 3 : Math.max(3, Math.round((n / maxPerWeek) * 16)),
                        background: n === 0 ? "var(--danger)" : "var(--primary)",
                        opacity: n === 0 ? 1 : 0.2 + 0.35 * (n / maxPerWeek),
                      }} />
                    </div>
                  );
                })}
              </div>

              {/* Eén rij per klas */}
              {visibleClasses.map((c) => (
                <div key={c.id} className="jl-row jl-classrow" style={{ gridTemplateColumns: gridCols, height: 30, paddingTop: 3, paddingBottom: 3 }}>
                  <div className="jl-label" style={{ cursor: "pointer" }} onClick={() => isolateClass(c.id)}
                    title={`Alleen ${c.code} tonen — nog een klik toont alles weer`}>
                    <span className="font-semibold text-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.code}</span>
                    {c.track === "hifdh" && <Badge kind="primary">H</Badge>}
                    <span className="text-xs text-subtle" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{c.day ?? ""}</span>
                  </div>
                  {shownWeeks.map((w) => {
                    const items = byCell.get(`${c.id}|${w.idx}`);
                    const today = w.idx === todayIdx;
                    if (!items || !items.length) {
                      return <div key={w.idx} className={"jl-cell" + (today ? " jl-today" : "")} />;
                    }
                    // Staan er meer lessen in één week, dan weegt het opvallendste type het zwaarst.
                    const rank = (t: string) => (t === "toets" ? 3 : t === "activiteit" ? 2 : t === "les" ? 1 : 0);
                    const lead = items.reduce((a, b) => (rank(b.type) > rank(a.type) ? b : a));
                    const mist = items.some((l) => missingTeacher(l, c.track));
                    const col = TYPE_COLOR[lead.type] ?? TYPE_COLOR.les;
                    const tip = items.map((l) => {
                      const docenten = [
                        l.teacher_na ? "les: n.v.t." : l.teacher_id ? `les: ${teacherName[l.teacher_id] ?? "?"}` : "les: —",
                        c.track === "hifdh" ? null : l.quran_na ? "Qur an: n.v.t." : l.quran_teacher_id ? `Qur an: ${teacherName[l.quran_teacher_id] ?? "?"}` : "Qur an: —",
                      ].filter(Boolean).join(" · ");
                      return `${dagMaand(l.date)}${l.week_nr != null ? ` · lesweek ${l.week_nr}` : ""}\n${TYPE_LABEL[l.type] ?? l.type}${l.topic ? ` — ${l.topic}` : ""}\n${docenten}`;
                    }).join("\n\n");
                    return (
                      <div key={w.idx} className={"jl-cell" + (today ? " jl-today" : "")} style={{ padding: "0 2px" }}>
                        <div className="jl-block"
                          style={{
                            background: mist ? "var(--danger-soft)" : col.bg,
                            borderColor: mist ? "var(--danger)" : col.fg,
                            color: mist ? "var(--danger)" : col.fg,
                          }}
                          title={`${c.code}\n${tip}${mist ? "\n\n! Docent ontbreekt" : ""}`}>
                          {items.length > 1 ? `${items.length}x` : mist ? "!" : TYPE_INITIAL[lead.type]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Statistiek-tegel met een toon voor het getal dat aandacht vraagt. */
function JlStat({ label, value, sub, icon, tone }: {
  label: string; value: number; sub: string;
  icon: "calendar" | "book" | "flag" | "presentation";
  tone?: "danger" | "success";
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : undefined;
  return (
    <div className="stat">
      <div className="label"><Icon name={icon} size={14} />{label}</div>
      <div className="value" style={{ color }}>{value}</div>
      <div className="delta">{sub}</div>
    </div>
  );
}
