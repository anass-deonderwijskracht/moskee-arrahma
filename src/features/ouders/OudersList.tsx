import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Icon, Btn, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useOuders, useCreateOuder, useDeleteOuders } from "@/data/people";

export function OudersList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, isError, error } = useOuders();
  const createOuder = useCreateOuder();
  const del = useDeleteOuders();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ role: "Vader", name: "", phone: "", email: "", bereik: "", primary: true });
  const saveOuder = async () => {
    try {
      const id = await createOuder.mutateAsync(form);
      toast("Ouder toegevoegd"); setAdding(false); setForm({ role: "Vader", name: "", phone: "", email: "", bereik: "", primary: true });
      navigate("/ouders/" + id);
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const tools = useTableTools({
    rows: data ?? [],
    getId: (o) => o.id,
    search: (o, q) => o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q) || (o.phone ?? "").toLowerCase().includes(q),
    sorters: {
      name: (o) => o.name,
      role: (o) => o.role,
      phone: (o) => o.phone,
      email: (o) => o.email,
      kinderen: (o) => o.kind_ouder.length,
      bereik: (o) => o.bereik,
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const rows = tools.view;

  if (isError) return <ErrorState error={error} />;

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} ouder(s) verwijderen? De koppeling met hun kinderen wordt ook verwijderd.`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} ouder(s) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <Section
      title="Ouders & voogden"
      sub="Eén record per persoon — broers/zussen delen dezelfde contacten"
      actions={
        <>
          <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek ouder…" />
          <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Ouder toevoegen</Btn>
        </>
      }
    >
      <BulkBar count={tools.selectedIds.length} noun="ouder(s)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
      <Card>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="empty">{tools.q ? "Geen ouders gevonden." : "Nog geen ouders geregistreerd."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
                <SortTh label="Ouder/voogd" k="name" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Telefoon" k="phone" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="E-mail" k="email" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Kinderen" k="kinderen" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Bereikbaarheid" k="bereik" sort={tools.sort} onSort={tools.toggleSort} />
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const isChecked = tools.checked.has(o.id);
                return (
                <tr key={o.id} onClick={() => navigate("/ouders/" + o.id)} className={isChecked ? "selected" : ""}>
                  <SelectTd checked={isChecked} onToggle={() => tools.toggleOne(o.id)} label={`Selecteer ${o.name}`} />
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
                );
              })}
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
