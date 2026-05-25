import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Badge, pct, type BadgeKind } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useClassMetrics, type ClassRow } from "@/data/classes";

const currentYear = new Date().getFullYear();

interface OverzichtLeerling {
  id: string; class_id: string; full_name: string; gender: string | null; birth_year: number | null;
  parents: { role: string | null; name: string | null; phone: string | null }[];
}

function useKlassenOverzicht(schooljaarId: string | null) {
  return useQuery({
    queryKey: ["klassen-overzicht", schooljaarId],
    enabled: !!schooljaarId,
    queryFn: async (): Promise<OverzichtLeerling[]> => {
      const { data, error } = await supabase
        .from("leerlingen")
        .select("id, class_id, kinderen(full_name, gender, birth_year, kind_ouder(ouders(role, name, phone)))")
        .eq("schooljaar_id", schooljaarId!);
      if (error) throw error;
      type Row = { id: string; class_id: string; kinderen: { full_name: string; gender: string | null; birth_year: number | null; kind_ouder: { ouders: { role: string | null; name: string | null; phone: string | null } | null }[] } | null };
      return ((data as unknown as Row[]) ?? []).map((r) => ({
        id: r.id, class_id: r.class_id,
        full_name: r.kinderen?.full_name ?? "—", gender: r.kinderen?.gender ?? null, birth_year: r.kinderen?.birth_year ?? null,
        parents: (r.kinderen?.kind_ouder ?? []).map((ko) => ko.ouders).filter(Boolean) as OverzichtLeerling["parents"],
      }));
    },
  });
}

function metricColor(v: number | null | undefined, good: number, bad: number) {
  if (v == null) return "var(--fg)";
  return v > good ? "var(--success)" : v < bad ? "var(--danger)" : "var(--fg)";
}

export function KlassenOverzichtKanban({ classes, schooljaarId }: { classes: ClassRow[]; schooljaarId: string | null }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useKlassenOverzicht(schooljaarId);
  const { data: metricsMap } = useClassMetrics();

  const byClass = useMemo(() => {
    const m = new Map<string, OverzichtLeerling[]>();
    for (const s of data ?? []) { if (!m.has(s.class_id)) m.set(s.class_id, []); m.get(s.class_id)!.push(s); }
    return m;
  }, [data]);

  if (isError) return <ErrorState error={error} />;
  if (isLoading) return <Loading />;

  return (
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${classes.length}, minmax(280px, 1fr))`, height: "auto", maxHeight: "calc(100vh - 240px)" }}>
      {classes.map((c) => {
        const ss = byClass.get(c.id) ?? [];
        const cm = metricsMap?.[c.id];
        const boys = ss.filter((s) => s.gender === "m").length;
        const girls = ss.filter((s) => s.gender === "f").length;
        const ages = ss.map((s) => (s.birth_year ? currentYear - s.birth_year : null)).filter((a): a is number => a != null);
        const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
        return (
          <div key={c.id} className="kcol" style={{ minWidth: 280 }}>
            <div className="kcol-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, padding: "4px 4px 12px" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Badge kind={(c.color as BadgeKind) ?? "primary"}>{c.code}</Badge>{c.track === "hifdh" && <Badge kind="primary" dot>Hifdh</Badge>}</div>
                <span className="count">{ss.length}/{c.capacity}</span>
              </div>
              <div className="text-xs text-subtle" style={{ lineHeight: 1.4 }}>
                Les: <b style={{ color: "var(--fg-muted)" }}>{c.teacher?.short ?? "—"}</b>
                {c.quran_teacher && c.quran_teacher.id !== c.teacher?.id && <> · Qur'an: <b style={{ color: "var(--fg-muted)" }}>{c.quran_teacher.short}</b></>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: 8, background: "var(--bg-elev)", borderRadius: 8, border: "1px solid var(--border)" }}>
                {[["Aanw", cm?.avg_attendance_pct, 0.9, 0.8], ["Ar HW", cm?.avg_arabic_homework_pct, 0.85, 0.7], ["Q HW", cm?.avg_quran_learned_pct, 0.85, 0.7]].map(([label, v, g, b]) => (
                  <div key={label as string} style={{ textAlign: "center", minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: metricColor(v as number, g as number, b as number), fontVariantNumeric: "tabular-nums" }}>{pct(v as number)}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                <span>Gem. <b style={{ color: "var(--fg)" }}>{avgAge.toFixed(1)} jr</b></span>
                <div className="flex items-center gap-2">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "oklch(0.62 0.12 240)" }} />{boys} J</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "oklch(0.65 0.14 350)" }} />{girls} M</span>
                </div>
              </div>
              <div style={{ height: 4, display: "flex", borderRadius: 999, overflow: "hidden", background: "var(--bg-elev)" }}>
                <div style={{ width: ss.length ? (boys / ss.length * 100) + "%" : "50%", background: "oklch(0.62 0.12 240)" }} />
                <div style={{ width: ss.length ? (girls / ss.length * 100) + "%" : "50%", background: "oklch(0.65 0.14 350)" }} />
              </div>
            </div>
            <div className="kcol-body">
              {ss.length === 0 && <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>Geen leerlingen</div>}
              {ss.map((s) => {
                const age = s.birth_year ? currentYear - s.birth_year : null;
                return (
                  <div key={s.id} className="kcard" style={{ cursor: "pointer", padding: 10 }} onClick={() => navigate("/students/" + s.id)}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.gender === "m" ? "oklch(0.62 0.12 240)" : "oklch(0.65 0.14 350)", flexShrink: 0 }} />
                      <span className="font-semibold text-sm truncate" style={{ flex: 1, minWidth: 0 }}>{s.full_name}</span>
                      <span className="text-xs text-subtle font-mono" style={{ flexShrink: 0 }}>{age ?? "—"} jr</span>
                    </div>
                    {s.parents.slice(0, 2).map((p, i) => (
                      <div key={i} className="flex items-center justify-between" style={{ fontSize: 11, paddingTop: 4, borderTop: i === 0 ? "1px solid var(--border)" : "none", marginTop: i === 0 ? 6 : 0 }}>
                        <span className="text-subtle truncate" style={{ maxWidth: 100 }}>{(p.role ?? "?").charAt(0)}: {(p.name ?? "").split(" ")[0]}</span>
                        <span className="font-mono" style={{ color: "var(--fg-muted)", fontSize: 11 }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
