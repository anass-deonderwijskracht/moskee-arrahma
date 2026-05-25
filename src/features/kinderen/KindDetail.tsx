import { useParams, useNavigate } from "react-router-dom";
import { Section, Card, Badge, Btn, Icon, Avatar, QBar, pct, type BadgeKind } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useKindDetail, type KindYear } from "@/data/relations";

const currentYear = new Date().getFullYear();

function attendanceOf(y: KindYear, metrics: Record<string, { attendance_pct: number | null }>): number | null {
  if (y.schooljaren?.is_current) return metrics[y.id]?.attendance_pct ?? null;
  return y.hist_attendance_pct;
}

export function KindDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useKindDetail(id);

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading label="Kind laden…" />;

  const { kind: k, years, metrics, ouders, siblings } = data;
  const age = k.birth_year ? currentYear - k.birth_year : null;
  const current = years.find((y) => y.schooljaren?.is_current) ?? years[0];
  const currentMetrics = current ? metrics[current.id] : undefined;

  const attVals = years.map((y) => attendanceOf(y, metrics)).filter((v): v is number => v != null);
  const avgAtt = attVals.length ? attVals.reduce((a, b) => a + b, 0) / attVals.length : null;

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/kinderen")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {k.full_name}
        </span>
      }
      sub={`${ouders.length} ouder(s)/voogd(en)${siblings.length ? " · " + siblings.length + " broer/zus" : ""}`}
      actions={current && <Btn kind="primary" onClick={() => navigate("/students/" + current.id)}>Open dit jaar →</Btn>}
    >
      <div className="detail-hero">
        <Avatar name={k.full_name} initials={k.initials ?? undefined} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-2" style={{ flexWrap: "wrap" }}>
            {current?.classes && <Badge kind={(current.classes.color as BadgeKind) ?? "primary"}>{current.classes.code} (huidig)</Badge>}
            <Badge>{age != null ? age + " jaar" : ""} · {k.gender === "f" ? "♀" : "♂"}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 24, marginTop: 16 }}>
            <div><div className="text-xs text-subtle">Aanwezigheid (gemiddeld)</div><div style={{ fontSize: 22, fontWeight: 600 }}>{pct(avgAtt)}</div></div>
            <div>
              <div className="text-xs text-subtle">Surahs nu</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{currentMetrics?.surahs_known ?? 0} <span style={{ color: "var(--fg-subtle)", fontSize: 14 }}>/ 38</span></div>
              <div className="mt-2"><QBar value={currentMetrics?.surahs_known ?? 0} max={38} /></div>
            </div>
            <div><div className="text-xs text-subtle">Adres (gezin)</div><div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{k.address?.split(",")[0] ?? "—"}</div><div className="text-xs text-subtle mt-1">{k.address?.split(",").slice(1).join(",")}</div></div>
          </div>
        </div>
      </div>

      <Card title={<><Icon name="activity" size={14} /> Onderwijshistorie</>} sub="Eén rij per schooljaar — voortgang, klas, docent en eindbeoordeling.">
        <div className="flex-col gap-3">
          {years.map((y) => {
            const isCurrent = !!y.schooljaren?.is_current;
            const att = attendanceOf(y, metrics);
            const surahs = isCurrent ? (metrics[y.id]?.surahs_known ?? 0) : (y.hist_surahs_known ?? 0);
            return (
              <div key={y.id} style={{ display: "grid", gridTemplateColumns: "100px 200px 1fr 150px 100px", gap: 16, padding: 16, borderRadius: 12, background: isCurrent ? "var(--primary-soft)" : "var(--bg-sunken)", border: "1px solid " + (isCurrent ? "var(--primary)" : "var(--border)"), alignItems: "center" }}>
                <div>
                  <div className="font-mono font-semibold" style={{ fontSize: 15 }}>{y.schooljaren?.name}</div>
                  {isCurrent && <div className="text-xs" style={{ color: "var(--primary)", marginTop: 2, fontWeight: 600 }}>HUIDIG</div>}
                </div>
                <div><Badge kind={(y.classes?.color as BadgeKind) ?? "default"}>{y.classes?.code}</Badge><div className="text-xs text-subtle mt-1">{y.classes?.teachers?.short}</div></div>
                <div><div className="text-xs text-subtle mb-1">Notitie einde jaar</div><div className="text-sm">{isCurrent ? "Lopend schooljaar." : (y.notes_end_of_year ?? "—")}</div></div>
                <div>
                  <div className="text-xs text-subtle">Aanwezigheid</div>
                  <div className="flex items-center gap-2 mt-1"><div style={{ flex: 1 }}><QBar value={(att ?? 0) * 100} /></div><span className="num text-xs">{pct(att)}</span></div>
                  <div className="text-xs text-subtle mt-2">Surahs: <b style={{ color: "var(--fg)" }}>{surahs}</b></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {y.final_grade ? <Badge kind={y.final_grade === "Zeer goed" ? "success" : y.final_grade === "Goed" ? "primary" : "warn"}>{y.final_grade}</Badge> : <Badge>Lopend</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid-2 mt-4">
        <Card title={<><Icon name="user" size={14} /> Ouders & voogden</>} sub={ouders.length + " gekoppeld"}>
          <div className="flex-col gap-3">
            {ouders.map((o) => (
              <div key={o.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/ouders/" + o.id)}>
                <Avatar name={o.name} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2"><span className="font-semibold">{o.name}</span>{o.primary && <Badge kind="primary">Primair</Badge>}</div>
                  <div className="text-xs text-subtle">{o.role} · {o.phone}</div>
                </div>
                <Icon name="chevronRight" size={14} />
              </div>
            ))}
          </div>
        </Card>

        <Card title={<><Icon name="users" size={14} /> Broers & zussen</>} sub={siblings.length === 0 ? "Geen broer/zus ingeschreven" : siblings.length + " ander(en) bij ons"}>
          {siblings.length === 0 ? (
            <div className="empty"><Icon name="users" size={28} style={{ color: "var(--fg-faint)" }} /><div className="mt-2">Geen broer/zus in onze administratie.</div></div>
          ) : (
            <div className="flex-col gap-2">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/kinderen/" + s.id)}>
                  <Avatar name={s.full_name} initials={s.initials ?? undefined} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="font-semibold">{s.full_name}</div><div className="text-xs text-subtle">{s.class_code ?? "—"}</div></div>
                  <Icon name="chevronRight" size={14} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Section>
  );
}
