import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Icon, Btn, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useOuders, useCreateOuder } from "@/data/people";

export function OudersList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, isError, error } = useOuders();
  const createOuder = useCreateOuder();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ role: "Vader", name: "", phone: "", email: "", bereik: "", primary: true });
  const saveOuder = async () => {
    try {
      const id = await createOuder.mutateAsync(form);
      toast("Ouder toegevoegd"); setAdding(false); setForm({ role: "Vader", name: "", phone: "", email: "", bereik: "", primary: true });
      navigate("/ouders/" + id);
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((o) => !term || o.name.toLowerCase().includes(term));
  }, [data, q]);

  if (isError) return <ErrorState error={error} />;

  return (
    <Section
      title="Ouders & voogden"
      sub="Eén record per persoon — broers/zussen delen dezelfde contacten"
      actions={
        <>
          <div style={{ width: 240 }}><input className="input" placeholder="Zoek ouder…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Ouder toevoegen</Btn>
        </>
      }
    >
      <Card>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="empty">{q ? "Geen ouders gevonden." : "Nog geen ouders geregistreerd."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Ouder/voogd</th><th>Telefoon</th><th>E-mail</th><th>Kinderen</th><th>Bereikbaarheid</th><th style={{ width: 1 }}></th></tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => navigate("/ouders/" + o.id)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={o.name} size="sm" />
                      <div>
                        <div className="font-semibold">{o.name}</div>
                        <div className="text-xs text-subtle">{o.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm font-mono">{o.phone}</td>
                  <td className="text-sm">{o.email}</td>
                  <td>
                    <div className="av-group">
                      {o.kind_ouder.slice(0, 4).map((ko) => (
                        <Avatar key={ko.kind_id} name={ko.kinderen?.full_name} initials={ko.kinderen?.initials ?? undefined} size="sm" />
                      ))}
                    </div>
                  </td>
                  <td className="text-sm text-muted">{o.bereik}</td>
                  <td><Icon name="chevronRight" size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {adding && (
        <Modal title="Ouder/voogd toevoegen" sub="Maak een losse oudercontact aan" onClose={() => setAdding(false)}
          footer={<ModalFooter onCancel={() => setAdding(false)} onSave={saveOuder} saving={createOuder.isPending} disabled={!form.name.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <Field label="Rol"><Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}><option>Vader</option><option>Moeder</option><option>Voogd</option></Select></Field>
            <Field label="Naam"><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Telefoon"><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="06 …" /></Field>
            <Field label="E-mail"><input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          </div>
          <Field label="Bereikbaarheid"><input className="input" value={form.bereik} onChange={(e) => setForm((f) => ({ ...f, bereik: e.target.value }))} placeholder="bv. Werkdagen na 17:00" /></Field>
          <label className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={form.primary} onChange={(e) => setForm((f) => ({ ...f, primary: e.target.checked }))} /> Primair contact
          </label>
        </Modal>
      )}
    </Section>
  );
}
