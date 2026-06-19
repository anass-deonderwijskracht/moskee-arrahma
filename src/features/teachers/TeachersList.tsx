import { useState } from "react";
import { Section, Card, Avatar, Badge, Btn, Select, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useTeachers, useSaveTeacher, useDeleteTeachers, type Teacher } from "@/data/people";

const ROLE_LABEL: Record<string, { label: string; kind: BadgeKind }> = {
  les: { label: "Lesdocent", kind: "info" },
  quran: { label: "Qur'an-docent", kind: "accent" },
  both: { label: "Les & Qur'an", kind: "primary" },
  inval: { label: "Invaldocent", kind: "warn" },
};

export function TeachersList() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useTeachers();
  const save = useSaveTeacher();
  const del = useDeleteTeachers();
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);

  const tools = useTableTools({
    rows: data ?? [],
    getId: (t) => t.id,
    search: (t, q) => t.name.toLowerCase().includes(q) || (t.short ?? "").toLowerCase().includes(q) || (t.specialty ?? "").toLowerCase().includes(q),
    sorters: {
      name: (t) => t.name,
      role: (t) => ROLE_LABEL[t.role]?.label ?? t.role,
      email: (t) => t.email,
      phone: (t) => t.phone,
      specialty: (t) => t.specialty,
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const rows = tools.view;

  if (isError) return <ErrorState error={error} />;

  const onSave = async (t: Partial<Teacher>) => {
    try {
      await save.mutateAsync({ id: t.id, name: t.name ?? "", short: t.short ?? "", email: t.email ?? "", phone: t.phone ?? "", specialty: t.specialty ?? "", role: t.role ?? "les" });
      toast(t.id ? "Docent bijgewerkt" : "Docent toegevoegd"); setEditing(null);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} docent(en) verwijderen? Ze worden losgekoppeld van hun klassen.`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} docent(en) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <Section title="Docenten" sub="Les- en Qur'an-docenten van Moskee Arrahma"
      actions={
        <>
          <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek docent…" />
          <Btn icon="plus" kind="primary" onClick={() => setEditing({ role: "les" })}>Docent toevoegen</Btn>
        </>
      }>
      <BulkBar count={tools.selectedIds.length} noun="docent(en)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
      <Card>
        {isLoading ? <Loading /> : rows.length === 0 ? <div className="empty">{tools.q ? "Geen docenten gevonden." : "Nog geen docenten."}</div> : (
          <table className="table">
            <thead><tr>
              <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
              <SortTh label="Docent" k="name" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Rol" k="role" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="E-mail" k="email" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Telefoon" k="phone" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Specialiteit" k="specialty" sort={tools.sort} onSort={tools.toggleSort} />
            </tr></thead>
            <tbody>
              {rows.map((t) => {
                const role = ROLE_LABEL[t.role] ?? ROLE_LABEL.les;
                const isChecked = tools.checked.has(t.id);
                return (
                  <tr key={t.id} onClick={() => setEditing(t)} className={isChecked ? "selected" : ""}>
                    <SelectTd checked={isChecked} onToggle={(range) => tools.toggleOne(t.id, range)} label={`Selecteer ${t.name}`} />
                    <td><div className="flex items-center gap-3"><Avatar name={t.name} size="sm" /><div><div className="font-semibold">{t.name}</div><div className="text-xs text-subtle">{t.short}</div></div></div></td>
                    <td><Badge kind={role.kind}>{role.label}</Badge></td>
                    <td className="text-sm">{t.email}</td>
                    <td className="text-sm font-mono">{t.phone}</td>
                    <td className="text-sm text-muted">{t.specialty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Modal title={editing.id ? "Docent bewerken" : "Docent toevoegen"} onClose={() => setEditing(null)}
          footer={<ModalFooter onCancel={() => setEditing(null)} onSave={() => onSave(editing)} saving={save.isPending} disabled={!editing.name?.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <Field label="Naam"><input className="input" value={editing.name ?? ""} onChange={(e) => setEditing((t) => ({ ...t, name: e.target.value }))} placeholder="Ustadh …" /></Field>
            <Field label="Afkorting"><input className="input" value={editing.short ?? ""} onChange={(e) => setEditing((t) => ({ ...t, short: e.target.value }))} placeholder="M. Bakkali" /></Field>
          </div>
          <Field label="Rol"><Select value={editing.role ?? "les"} onChange={(e) => setEditing((t) => ({ ...t, role: e.target.value }))}><option value="les">Lesdocent</option><option value="quran">Qur'an-docent</option><option value="both">Les & Qur'an</option><option value="inval">Invaldocent</option></Select></Field>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="E-mail"><input className="input" type="email" value={editing.email ?? ""} onChange={(e) => setEditing((t) => ({ ...t, email: e.target.value }))} /></Field>
            <Field label="Telefoon"><input className="input" value={editing.phone ?? ""} onChange={(e) => setEditing((t) => ({ ...t, phone: e.target.value }))} /></Field>
          </div>
          <Field label="Specialiteit"><input className="input" value={editing.specialty ?? ""} onChange={(e) => setEditing((t) => ({ ...t, specialty: e.target.value }))} /></Field>
        </Modal>
      )}
    </Section>
  );
}
