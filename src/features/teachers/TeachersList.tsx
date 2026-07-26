import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Badge, Btn, Pills, type Option, type BadgeKind } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useTeachers, useDeleteTeachers, type Teacher } from "@/data/people";
import { TeacherFormModal } from "./TeacherFormModal";
import { TeacherPayouts } from "./TeacherPayouts";

type View = "overzicht" | "uitbetalen";
const VIEWS: Option<View>[] = [
  { value: "overzicht", label: "Overzicht" },
  { value: "uitbetalen", label: "Uitbetalen" },
];

const ROLE_LABEL: Record<string, { label: string; kind: BadgeKind }> = {
  les: { label: "Lesdocent", kind: "info" },
  quran: { label: "Qur'an-docent", kind: "accent" },
  both: { label: "Les & Qur'an", kind: "primary" },
  inval: { label: "Invaldocent", kind: "warn" },
};

const eurRate = (n: number | null) =>
  n == null ? "—" : "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "/u";

export function TeachersList() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useTeachers();
  const del = useDeleteTeachers();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<View>("overzicht");

  const tools = useTableTools({
    rows: data ?? [],
    getId: (t) => t.id,
    search: (t, q) => t.name.toLowerCase().includes(q) || (t.short ?? "").toLowerCase().includes(q) || (t.specialty ?? "").toLowerCase().includes(q),
    sorters: {
      name: (t) => t.name,
      role: (t) => ROLE_LABEL[t.role]?.label ?? t.role,
      email: (t) => t.email,
      phone: (t) => t.phone,
      uurtarief: (t) => t.uurtarief ?? -1,
      specialty: (t) => t.specialty,
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const rows = tools.view;

  if (isError) return <ErrorState error={error} />;

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} docent(en) verwijderen? Ze worden losgekoppeld van hun klassen.`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} docent(en) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <Section title="Docenten"
      sub={view === "uitbetalen"
        ? "Maandelijkse uitbetalingen op basis van de planning × uurtarief"
        : "Les- en Qur'an-docenten van Moskee Arrahma"}
      actions={
        <>
          {view === "overzicht" && <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek docent…" />}
          <Pills value={view} onChange={setView} options={VIEWS} />
          {view === "overzicht" && <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Docent toevoegen</Btn>}
        </>
      }>
      {view === "uitbetalen" ? <TeacherPayouts /> : (
        <>
      <BulkBar count={tools.selectedIds.length} noun="docent(en)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
      <Card>
        {isLoading ? <Loading /> : rows.length === 0 ? <div className="empty">{tools.q ? "Geen docenten gevonden." : "Nog geen docenten."}</div> : (
          <table className="table">
            <thead><tr>
              <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
              <SortTh label="Docent" k="name" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Rol" k="role" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Uurtarief" k="uurtarief" sort={tools.sort} onSort={tools.toggleSort} style={{ textAlign: "right" }} />
              <SortTh label="E-mail" k="email" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Telefoon" k="phone" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Specialiteit" k="specialty" sort={tools.sort} onSort={tools.toggleSort} />
            </tr></thead>
            <tbody>
              {rows.map((t) => {
                const role = ROLE_LABEL[t.role] ?? ROLE_LABEL.les;
                const isChecked = tools.checked.has(t.id);
                return (
                  <tr key={t.id} onClick={() => navigate("/teachers/" + t.id)} className={isChecked ? "selected" : ""} style={{ cursor: "pointer" }}>
                    <SelectTd checked={isChecked} onToggle={(range) => tools.toggleOne(t.id, range)} label={`Selecteer ${t.name}`} />
                    <td><div className="flex items-center gap-3"><Avatar name={t.name} size="sm" /><div><div className="font-semibold">{t.name}</div><div className="text-xs text-subtle">{t.short}</div></div></div></td>
                    <td><Badge kind={role.kind}>{role.label}</Badge></td>
                    <td className="num text-sm font-semibold" style={{ textAlign: "right" }}>{eurRate(t.uurtarief)}</td>
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
        </>
      )}

      {adding && <TeacherFormModal initial={{ role: "les" } as Partial<Teacher>} onClose={() => setAdding(false)} />}
    </Section>
  );
}
