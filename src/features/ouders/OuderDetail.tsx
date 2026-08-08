import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Section, Card, Badge, Btn, Icon, Avatar, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useOuderDetail } from "@/data/relations";
import { useUpdateOuder } from "@/data/people";

const ROLLEN = ["Vader", "Moeder", "Voogd"];
const EMPTY = { role: "", name: "", phone: "", email: "", primary: false };

export function OuderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, isError, error } = useOuderDetail(id);
  const update = useUpdateOuder();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const o = data?.ouder;
  // Het formulier volgt de geladen ouder, ook als die later binnenkomt.
  useEffect(() => {
    if (o) setForm({ role: o.role ?? "", name: o.name, phone: o.phone ?? "", email: o.email ?? "", primary: o.primary });
  }, [o]);

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data || !o) return <Loading label="Ouder laden…" />;

  const { kinderen, coOuders } = data;

  const save = async () => {
    try {
      await update.mutateAsync({
        id: o.id,
        patch: {
          name: form.name.trim(),
          role: form.role || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          primary: form.primary,
        },
      });
      toast("Gegevens opgeslagen"); setEditing(false);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/ouders")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {o.name}
        </span>
      }
      sub={`${o.role ?? "Ouder/voogd"} · ${kinderen.length} ${kinderen.length === 1 ? "kind" : "kinderen"}`}
      actions={<Btn icon="edit" onClick={() => setEditing(true)}>Bewerken</Btn>}
    >
      <div className="detail-hero">
        <Avatar name={o.name} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-3" style={{ flexWrap: "wrap" }}>
            <Badge kind="primary">{o.role}</Badge>
            {o.primary && <Badge kind="success" dot>Primair contact</Badge>}
          </div>
          <div className="grid-auto">
            <div><div className="text-xs text-subtle">Telefoon</div><div className="font-mono" style={{ fontSize: 15, fontWeight: 500 }}>{o.phone ?? "—"}</div></div>
            <div><div className="text-xs text-subtle">E-mail</div><div style={{ fontSize: 14, fontWeight: 500 }}>{o.email ?? "—"}</div></div>
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

      {editing && (
        <Modal title="Ouder bewerken" sub="Basisgegevens van deze ouder/voogd" onClose={() => setEditing(false)}
          footer={<ModalFooter onCancel={() => setEditing(false)} onSave={save} saving={update.isPending} disabled={!form.name.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <Field label="Rol">
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="">—</option>
                {ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Naam"><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Telefoon"><input className="input" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="06 …" /></Field>
            <Field label="E-mail"><input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={form.primary} onChange={(e) => setForm((f) => ({ ...f, primary: e.target.checked }))} /> Primair contact
          </label>
        </Modal>
      )}
    </Section>
  );
}
