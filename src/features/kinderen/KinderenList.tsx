import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Icon, Btn, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar, EditToggle, useEditMode } from "@/features/_shared/tableTools";
import { useKinderen, useCreateKind, useDeleteKinderen, useUpdateKind, type KindRow } from "@/data/people";
import { useCurrentSchooljaar } from "@/data/schooljaren";

import { age, ageLabel, birthYearOf } from "@/data/age";

export function KinderenList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, isError, error } = useKinderen();
  const { data: sj } = useCurrentSchooljaar();
  const createKind = useCreateKind();
  const del = useDeleteKinderen();
  const update = useUpdateKind();
  const [editing, toggleEditing] = useEditMode();
  const [adding, setAdding] = useState(false);
  // Een naamswijziging gaat mee als `name`, zodat de initialen opnieuw worden afgeleid.
  const saveName = (k: KindRow, patch: { first_name?: string; last_name?: string }) => {
    const first = (patch.first_name ?? k.first_name).trim();
    const last = (patch.last_name ?? k.last_name).trim();
    if (!first || !last || (first === k.first_name && last === k.last_name)) return;
    update.mutate({ id: k.id, patch: { first_name: first, last_name: last }, name: { first_name: first, last_name: last } },
      { onError: () => toast("Opslaan mislukt") });
  };
  const saveField = (id: string, patch: { gender?: string | null; birth_year?: number | null; birthdate?: string | null }) =>
    update.mutate({ id, patch }, { onError: () => toast("Opslaan mislukt") });
  const [form, setForm] = useState({ first_name: "", last_name: "", gender: "", birthdate: "", address: "" });
  const saveKind = async () => {
    try {
      const id = await createKind.mutateAsync({
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), gender: form.gender || null,
        birthdate: form.birthdate || null, birth_year: birthYearOf(form.birthdate),
        address: form.address || null, notes: null,
      });
      toast("Kind toegevoegd"); setAdding(false); setForm({ first_name: "", last_name: "", gender: "", birthdate: "", address: "" });
      navigate("/kinderen/" + id);
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const klasOf = (k: KindRow) =>
    (k.leerlingen.find((l) => l.schooljaar_id === sj?.id) ?? k.leerlingen[0])?.classes?.code ?? "";

  const tools = useTableTools({
    rows: data ?? [],
    getId: (k) => k.id,
    search: (k, q) => k.full_name.toLowerCase().includes(q),
    sorters: {
      name: (k) => k.full_name,
      gender: (k) => k.gender,
      age: (k) => age(k),
      klas: (k) => klasOf(k),
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const rows = tools.view;

  if (isError) return <ErrorState error={error} />;

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} kind(eren) verwijderen? Dit verwijdert ook hun leerling-jaren en oudergegevens-koppeling.`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} kind(eren) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <Section
      title="Kinderen"
      sub="Alle kinderen, jaaroverstijgend — elk kind kan meerdere leerling-jaren hebben"
      actions={
        <>
          <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek kind…" />
          <EditToggle editing={editing} onToggle={toggleEditing} />
          <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Kind toevoegen</Btn>
        </>
      }
    >
      <BulkBar count={tools.selectedIds.length} noun="kind(eren)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
      <Card>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="empty">{tools.q ? "Geen kinderen gevonden." : "Nog geen kinderen geregistreerd."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
                <SortTh label="Kind" k="name" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Geslacht" k="gender" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label={editing ? "Geboortedatum" : "Leeftijd"} k="age" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Huidig jaar (klas)" k="klas" sort={tools.sort} onSort={tools.toggleSort} />
                <th>Ouders</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const current = k.leerlingen.find((l) => l.schooljaar_id === sj?.id) ?? k.leerlingen[0];
                const isChecked = tools.checked.has(k.id);
                return (
                  <tr key={k.id} onClick={editing ? undefined : () => navigate("/kinderen/" + k.id)} className={isChecked ? "selected" : ""}>
                    <SelectTd checked={isChecked} onToggle={(range) => tools.toggleOne(k.id, range)} label={`Selecteer ${k.full_name}`} />
                    <td onClick={editing ? (e) => e.stopPropagation() : undefined}>
                      <div className="flex items-center gap-3">
                        <Avatar name={k.full_name} initials={k.initials ?? undefined} size="sm" />
                        {editing ? (
                          <div className="flex gap-2">
                            <input key={`v:${k.first_name}`} className="input" defaultValue={k.first_name} aria-label="Voornaam"
                              style={{ width: 120 }} onBlur={(e) => saveName(k, { first_name: e.target.value })} />
                            <input key={`a:${k.last_name}`} className="input" defaultValue={k.last_name} aria-label="Achternaam"
                              style={{ width: 140 }} onBlur={(e) => saveName(k, { last_name: e.target.value })} />
                          </div>
                        ) : (
                          <div className="font-semibold">{k.full_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="text-sm" onClick={editing ? (e) => e.stopPropagation() : undefined}>
                      {editing ? (
                        <Select value={k.gender ?? ""} onChange={(e) => saveField(k.id, { gender: e.target.value || null })} style={{ width: 100 }}>
                          <option value="">—</option>
                          <option value="m">Jongen</option>
                          <option value="f">Meisje</option>
                        </Select>
                      ) : k.gender === "f" ? "Meisje" : k.gender === "m" ? "Jongen" : "—"}
                    </td>
                    <td className="num" onClick={editing ? (e) => e.stopPropagation() : undefined}>
                      {editing ? (
                        <input key={`gb:${k.birthdate}`} className="input" type="date" aria-label="Geboortedatum"
                          style={{ width: 150 }} defaultValue={k.birthdate ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v !== k.birthdate) saveField(k.id, { birthdate: v, birth_year: birthYearOf(v) ?? k.birth_year });
                          }} />
                      ) : (
                        <span title={k.birthdate ? undefined : "Alleen geboortejaar bekend — vul de geboortedatum in voor een exacte leeftijd"}>
                          {ageLabel(k, { approx: true })}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">{current?.classes?.code ?? <span className="text-subtle">geen</span>}</td>
                    <td>
                      <div className="av-group">
                        {k.kind_ouder.slice(0, 2).map((ko) => (
                          <Avatar key={ko.ouder_id} name={ko.ouders?.name} size="sm" />
                        ))}
                      </div>
                    </td>
                    <td>{!editing && <Icon name="chevronRight" size={14} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {adding && (
        <Modal title="Kind toevoegen" sub="Maak een nieuw kindprofiel aan (jaaroverstijgend)" onClose={() => setAdding(false)}
          footer={<ModalFooter onCancel={() => setAdding(false)} onSave={saveKind} saving={createKind.isPending} disabled={!form.first_name.trim() || !form.last_name.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Voornaam"><input className="input" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
            <Field label="Achternaam"><input className="input" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Geslacht"><Select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}><option value="">—</option><option value="m">Jongen</option><option value="f">Meisje</option></Select></Field>
            <Field label="Geboortedatum"><input className="input" type="date" value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} /></Field>
          </div>
          <Field label="Adres"><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
        </Modal>
      )}
    </Section>
  );
}
