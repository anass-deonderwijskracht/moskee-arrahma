import { useState } from "react";
import { Card, Btn, Icon, Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useClassTests, useReportPeriods, useCreateTest, useUpdateTest, useDeleteTest, type Test } from "@/data/rapporten";

const TYPE_LABEL: Record<string, string> = { cijfer: "Cijfer (1–10)", schaal: "Schaal" };

export function ToetsenTab({ classId }: { classId: string }) {
  const toast = useToast();
  const { data: tests, isLoading } = useClassTests(classId);
  const { data: periods } = useReportPeriods();
  const createTest = useCreateTest();
  const updateTest = useUpdateTest();
  const deleteTest = useDeleteTest();

  const [editing, setEditing] = useState<Test | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", grade_type: "cijfer", report_period_id: "" });

  const openAdd = () => { setForm({ name: "", grade_type: "cijfer", report_period_id: periods?.[0]?.id ?? "" }); setAdding(true); };
  const openEdit = (t: Test) => { setForm({ name: t.name, grade_type: t.grade_type, report_period_id: t.report_period_id }); setEditing(t); };

  const save = async () => {
    try {
      if (editing) {
        await updateTest.mutateAsync({ id: editing.id, patch: { name: form.name, grade_type: form.grade_type, report_period_id: form.report_period_id } });
        toast("Toets bijgewerkt");
      } else {
        await createTest.mutateAsync({ class_id: classId, report_period_id: form.report_period_id, name: form.name, grade_type: form.grade_type });
        toast("Toets toegevoegd");
      }
      setAdding(false); setEditing(null);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const remove = async (t: Test) => {
    if (!confirm(`Toets "${t.name}" verwijderen? Ingevulde cijfers gaan verloren.`)) return;
    try { await deleteTest.mutateAsync(t.id); toast("Toets verwijderd"); }
    catch (e) { toast("Verwijderen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  if (isLoading) return <Loading label="Toetsen laden…" />;
  const open = adding || !!editing;

  return (
    <Card title={<><Icon name="edit" size={14} /> Toetsen</>} sub="Toetsen per rapportperiode voor deze klas"
      action={<Btn size="sm" icon="plus" onClick={openAdd} disabled={!periods?.length}>Toets toevoegen</Btn>}>
      {open && (
        <Modal title={editing ? "Toets bewerken" : "Toets toevoegen"} sub="Naam, beoordelingstype en rapport"
          onClose={() => { setAdding(false); setEditing(null); }}
          footer={<ModalFooter onCancel={() => { setAdding(false); setEditing(null); }} onSave={save}
            saving={createTest.isPending || updateTest.isPending} disabled={!form.name.trim() || !form.report_period_id} />}>
          <Field label="Naam"><input className="input" value={form.name} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="bv. Soera Al-Fatiha" /></Field>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Beoordelingstype"><Select value={form.grade_type} onChange={(e) => setForm((f) => ({ ...f, grade_type: e.target.value }))}>
              <option value="cijfer">Cijfer (1–10)</option><option value="schaal">Schaal</option></Select></Field>
            <Field label="Rapport"><Select value={form.report_period_id} onChange={(e) => setForm((f) => ({ ...f, report_period_id: e.target.value }))}>
              {(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
        </Modal>
      )}

      {!periods?.length ? (
        <div className="empty">Er zijn nog geen rapportperioden. Voeg ze toe via Administratie → Toetsen.</div>
      ) : !tests?.length ? (
        <div className="empty">Nog geen toetsen voor deze klas. Voeg een toets toe.</div>
      ) : (
        (periods ?? []).map((p) => {
          const group = (tests ?? []).filter((t) => t.report_period_id === p.id);
          if (!group.length) return null;
          return (
            <div key={p.id} style={{ marginBottom: 16 }}>
              <div className="sidebar-group" style={{ paddingLeft: 0 }}>{p.name}</div>
              <table className="table">
                <thead><tr><th>Naam</th><th style={{ width: 1, whiteSpace: "nowrap" }}>Type</th><th style={{ width: 1 }}></th></tr></thead>
                <tbody>
                  {group.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.name}</td>
                      <td className="text-sm">{TYPE_LABEL[t.grade_type] ?? t.grade_type}</td>
                      <td><div className="flex gap-1">
                        <Btn size="sm" kind="ghost" icon="edit" onClick={() => openEdit(t)} />
                        <Btn size="sm" kind="ghost" icon="trash" onClick={() => remove(t)} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </Card>
  );
}
