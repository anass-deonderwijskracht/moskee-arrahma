import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Stat, Btn, Icon, QBar, Avatar, EUR, pct, type IconName } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useCurrentSchooljaar } from "@/data/schooljaren";
import { useLeerlingen, useLeerlingMetrics } from "@/data/leerlingen";
import { useClasses } from "@/data/classes";
import { useEnrollmentCounts, useActivityFeed, useFinanceSummary, ENROLL_COLUMNS } from "@/data/dashboard";
import { useSession } from "@/features/auth/AuthProvider";

const ACT_ICON: Record<string, IconName> = { quran: "book", att: "check", enroll: "inbox", fin: "coins", note: "edit", plan: "calendar" };

const WEEKDAY = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];

export function Dashboard() {
  const navigate = useNavigate();
  const { fullName } = useSession();
  const { data: sj } = useCurrentSchooljaar();
  const sjId = sj?.id ?? null;

  const leerlingenQ = useLeerlingen(sjId);
  const metricsQ = useLeerlingMetrics();
  const classesQ = useClasses(sjId);
  const enrollQ = useEnrollmentCounts();
  const feedQ = useActivityFeed();
  const financeQ = useFinanceSummary(sjId);

  const metrics = metricsQ.data ?? {};
  const leerlingen = leerlingenQ.data ?? [];

  const kpis = useMemo(() => {
    const total = leerlingen.length;
    const attVals = leerlingen.map((l) => metrics[l.id]?.attendance_pct).filter((v): v is number => v != null);
    const avgAtt = attVals.length ? attVals.reduce((a, b) => a + b, 0) / attVals.length : null;
    return { total, avgAtt };
  }, [leerlingen, metrics]);

  const surahDist = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const l of leerlingen) {
      const known = metrics[l.id]?.surahs_known ?? 0;
      const b = Math.floor(known / 5) * 5;
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([b, count]) => ({ label: b + "+", count }));
  }, [leerlingen, metrics]);

  const avgSurahs = useMemo(() => {
    if (!leerlingen.length) return 0;
    const sum = leerlingen.reduce((a, l) => a + (metrics[l.id]?.surahs_known ?? 0), 0);
    return sum / leerlingen.length;
  }, [leerlingen, metrics]);

  const todayWeekday = WEEKDAY[new Date().getDay()];
  const todayClasses = (classesQ.data ?? []).filter((c) => !c.historic && !c.is_next && c.day === todayWeekday);

  const finance = financeQ.data;
  const enrollCounts = enrollQ.data ?? {};
  const totalEnroll = Object.values(enrollCounts).reduce((a, b) => a + b, 0);

  if (leerlingenQ.isError) return <ErrorState error={leerlingenQ.error} />;

  const firstName = (fullName ?? "").split(" ")[0] || "bestuur";
  const dateLabel = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Section
      title={`Welkom${firstName ? ", " + firstName : ""}`}
      sub={`Het is ${dateLabel}. Hier is wat er speelt.`}
      actions={<Btn icon="plus" kind="primary" onClick={() => navigate("/enrollments")}>Nieuwe inschrijving</Btn>}
    >
      <div className="stat-grid mb-6">
        <Stat label="Actieve leerlingen" value={kpis.total} icon="users" sub={sj ? sj.name : "dit jaar"} />
        <Stat label="Aanwezigheid" value={pct(kpis.avgAtt)} icon="check" sub="uit les-administratie" />
        <Stat
          label="Betaald collegegeld"
          value={finance ? `${finance.paidCount}` : "—"}
          icon="coins"
          sub={finance ? `${finance.openCount} openstaand` : ""}
        />
        <Stat
          label="Saldo seizoen"
          value={finance ? EUR(finance.income - finance.expenses) : "—"}
          icon="chart"
          sub={finance ? `${EUR(finance.income)} in · ${EUR(finance.expenses)} uit` : ""}
        />
      </div>

      <div className="grid-2 mb-6">
        <Card
          title={<><Icon name="calendar" size={14} /> Lessen vandaag</>}
          sub={`${todayWeekday} · ${todayClasses.length} lessen · Moskee Arrahma`}
          action={<Btn size="sm" kind="ghost" onClick={() => navigate("/planning")}>Volledige planning →</Btn>}
        >
          <div className="flex-col gap-2">
            {classesQ.isLoading ? (
              <Loading />
            ) : todayClasses.length === 0 ? (
              <div className="empty">Vandaag geen lessen ingeroosterd.</div>
            ) : (
              todayClasses.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate("/classes/" + c.id)}
                  style={{
                    display: "grid", gridTemplateColumns: "78px 1fr auto", gap: 14, alignItems: "center",
                    padding: 12, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg-sunken)",
                  }}
                >
                  <div className="font-mono text-xs tabular" style={{ color: "var(--fg-muted)" }}>
                    <div style={{ fontWeight: 600, color: "var(--fg)" }}>{c.time?.split(" - ")[0]}</div>
                    <div>{c.time?.split(" - ")[1]}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.code}</div>
                    <div className="text-xs text-subtle mt-1 flex items-center gap-2">
                      <span>{c.teacher?.short ?? "—"}</span><span>·</span><span>{c.location}</span>
                    </div>
                  </div>
                  <Btn size="sm" kind="ghost">Aanwezigheid →</Btn>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title={<><Icon name="activity" size={14} /> Recente activiteit</>} sub="Laatste updates uit het systeem">
          <div className="flex-col gap-3">
            {feedQ.isLoading ? (
              <Loading />
            ) : (feedQ.data ?? []).length === 0 ? (
              <div className="empty">Nog geen activiteit geregistreerd.</div>
            ) : (
              (feedQ.data ?? []).map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--bg-sunken)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}>
                    <Icon name={ACT_ICON[a.type ?? ""] ?? "activity"} size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm">
                      <b>{a.user_label}</b> <span className="text-muted">{a.action}</span>{" "}
                      <span style={{ color: "var(--primary)" }}>{a.object}</span>
                    </div>
                    <div className="text-xs text-subtle mt-1">{new Date(a.at).toLocaleString("nl-NL")}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid-2 mb-6">
        <Card title={<><Icon name="book" size={14} /> Qur'an-voortgang verdeling</>} sub="Aantal leerlingen per memorisatie-niveau">
          {surahDist.length === 0 ? (
            <div className="empty">Nog geen Qur'an-administratie.</div>
          ) : (
            <>
              <div className="bars">
                {surahDist.map((b) => {
                  const max = Math.max(...surahDist.map((x) => x.count));
                  return (
                    <div key={b.label} className="bar" style={{ height: (b.count / max) * 100 + "%" }}>
                      <div style={{ position: "absolute", top: -18, fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{b.count}</div>
                      <span className="lbl">{b.label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 36, borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-subtle)" }}>
                <span>Surahs gememoriseerd (cumulatief)</span>
                <span><b style={{ color: "var(--fg)" }}>{avgSurahs.toFixed(1)}</b> gem. per leerling</span>
              </div>
            </>
          )}
        </Card>

        <Card
          title={<><Icon name="inbox" size={14} /> Inschrijvingspijplijn</>}
          sub={`${totalEnroll} inschrijvingen`}
          action={<Btn size="sm" kind="ghost" onClick={() => navigate("/enrollments")}>Open bord →</Btn>}
        >
          <div className="flex-col gap-2">
            {ENROLL_COLUMNS.map((col) => (
              <div key={col.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 10, alignItems: "center", padding: "6px 0" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: col.color }} />
                <span className="text-sm">{col.title}</span>
                <span className="text-sm tabular font-mono" style={{ color: "var(--fg-muted)" }}>{enrollCounts[col.id] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={<><Icon name="flag" size={14} /> Heeft aandacht nodig</>} sub="Leerlingen met lage aanwezigheid">
        {leerlingenQ.isLoading ? (
          <Loading />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Leerling</th><th>Klas</th><th>Aanwezigheid</th><th>Qur'an</th><th style={{ width: 1 }}></th></tr>
            </thead>
            <tbody>
              {leerlingen
                .filter((l) => (metrics[l.id]?.attendance_pct ?? 1) < 0.85)
                .slice(0, 6)
                .map((l) => {
                  const m = metrics[l.id];
                  const att = m?.attendance_pct ?? null;
                  return (
                    <tr key={l.id} onClick={() => navigate("/students/" + l.id)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={l.kinderen?.full_name} initials={l.kinderen?.initials ?? undefined} size="sm" />
                          <div>
                            <div className="font-semibold">{l.kinderen?.full_name}</div>
                            <div className="text-xs text-subtle">{l.leerlingnummer}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-sm">{l.classes?.code}</td>
                      <td style={{ width: 200 }}>
                        <div className="flex items-center gap-2">
                          <div style={{ flex: 1 }}><QBar value={(att ?? 0) * 100} /></div>
                          <span className="num">{pct(att)}</span>
                        </div>
                      </td>
                      <td className="num">{m?.surahs_known ?? 0} surahs</td>
                      <td><Icon name="chevronRight" size={14} /></td>
                    </tr>
                  );
                })}
              {leerlingen.filter((l) => (metrics[l.id]?.attendance_pct ?? 1) < 0.85).length === 0 && (
                <tr><td colSpan={5}><div className="empty">Geen aandachtspunten — alle leerlingen op koers.</div></td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </Section>
  );
}
