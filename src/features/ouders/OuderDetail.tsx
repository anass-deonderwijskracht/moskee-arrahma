import { useParams, useNavigate } from "react-router-dom";
import { Section, Card, Badge, Icon, Avatar } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useOuderDetail } from "@/data/relations";

export function OuderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useOuderDetail(id);

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading label="Ouder laden…" />;

  const { ouder: o, kinderen, coOuders } = data;

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/ouders")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {o.name}
        </span>
      }
      sub={`${o.role ?? "Ouder/voogd"} · ${kinderen.length} ${kinderen.length === 1 ? "kind" : "kinderen"}`}
    >
      <div className="detail-hero">
        <Avatar name={o.name} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-3" style={{ flexWrap: "wrap" }}>
            <Badge kind="primary">{o.role}</Badge>
            {o.primary && <Badge kind="success" dot>Primair contact</Badge>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 24 }}>
            <div><div className="text-xs text-subtle">Telefoon</div><div className="font-mono" style={{ fontSize: 15, fontWeight: 500 }}>{o.phone ?? "—"}</div></div>
            <div><div className="text-xs text-subtle">E-mail</div><div style={{ fontSize: 14, fontWeight: 500 }}>{o.email ?? "—"}</div></div>
            <div><div className="text-xs text-subtle">Bereikbaarheid</div><div style={{ fontSize: 14, fontWeight: 500 }}>{o.bereik ?? "—"}</div></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Card title={<><Icon name="users" size={14} /> Gekoppelde kinderen</>} sub={kinderen.length + " kind(eren)"}>
          {kinderen.length === 0 ? <div className="empty">Geen kinderen gekoppeld.</div> : (
            <div className="flex-col gap-2">
              {kinderen.map((k) => (
                <div key={k.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/kinderen/" + k.id)}>
                  <Avatar name={k.full_name} initials={k.initials ?? undefined} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="font-semibold">{k.full_name}</div><div className="text-xs text-subtle">{k.class_code ?? "geen klas"}</div></div>
                  <Icon name="chevronRight" size={14} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={<><Icon name="user" size={14} /> Mede-ouder(s)/voogd(en)</>} sub={coOuders.length === 0 ? "Geen mede-ouder bekend" : coOuders.length + " gekoppeld"}>
          {coOuders.length === 0 ? <div className="empty">Geen mede-ouder in de administratie.</div> : (
            <div className="flex-col gap-2">
              {coOuders.map((c) => (
                <div key={c.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/ouders/" + c.id)}>
                  <Avatar name={c.name} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="font-semibold">{c.name}</div><div className="text-xs text-subtle">{c.role} · {c.phone}</div></div>
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
