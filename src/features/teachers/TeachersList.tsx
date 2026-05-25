import { useMemo, useState } from "react";
import { Section, Card, Avatar, Badge, Btn, Select, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTeachers, useSaveTeacher, type Teacher } from "@/data/people";

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
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((t) => !term || t.name.toLowerCase().includes(term) || (t.short ?? "").toLowerCase().includes(term) || (t.specialty ?? "").toLowerCase().includes(term));
  }, [data, q]);

  if (isError) return <ErrorState error={error} />;

  const onSave = async (t: Partial<Teacher>) => {
    try {
      await save.mutateAsync({ id: t.id, name: t.name ?? "", short: t.short ?? "", email: t.email ?? "", phone: t.phone ?? "", specialty: t.specialty ?? "", role: t.role ?? "les" });
      toast(t.id ? "Docent bijgewerkt" : "Docent toegevoegd"); setEditing(null);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <Section title="Docenten" sub="Les- en Qur'an-docenten van Moskee Arrahma"
      actions={
        <>
          <div style={{ width: 240 }}><input className="input" placeholder="Zoek docent…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Btn icon="plus" kind="primary" onClick={() => setEditing({ role: "les" })}>Docent toevoegen</Btn>
        </>
      }>
      <Card>
        {isLoading ? <Loading /> : rows.length === 0 ? <div className="empty">{q ? "Geen docenten gevonden." : "Nog geen docenten."}</div> : (
          <table className="table">
            <thead><tr><th>Docent</th><th>Rol</th><th>E-mail</th><th>Telefoon</th><th>Specialiteit</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const role = ROLE_LABEL[t.role] ?? ROLE_LABEL.les;
                return (
                  <tr key={t.id} onClick={() => setEditing(t)}>
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
