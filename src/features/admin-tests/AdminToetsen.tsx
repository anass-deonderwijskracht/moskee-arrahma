import { useState } from "react";
import { Section, Card, Btn, Icon, Select } from "@/components/ui";
import { Field } from "@/components/ui/Modal";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useClasses } from "@/data/classes";
import { useCurrentSchooljaar } from "@/data/schooljaren";
import {
  useReportPeriods, useCreateReportPeriod, useUpdateReportPeriod,
  useAllTests, useDeleteTest, useBulkCreateTests,
} from "@/data/rapporten";

export function AdminToetsen() {
  return (
    <Section title="Toetsen" sub="Maak toetsen in bulk aan en beheer rapportperioden">
      <div className="flex-col gap-4">
        <BulkCreate />
        <AllTests />
        <PeriodManager />
      </div>
    </Section>
  );
}

function BulkCreate() {
  const toast = useToast();
  const sj = useCurrentSchooljaar();
  const { data: classes, isLoading } = useClasses(sj.data?.id ?? null);
  const { data: periods } = useReportPeriods();
  const bulk = useBulkCreateTests();

  const [name, setName] = useState("");
  const [gradeType, setGradeType] = useState("cijfer");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [periodIds, setPeriodIds] = useState<string[]>([]);

  const toggle = (arr: string[], id: string) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const create = async () => {
    try {
      const n = await bulk.mutateAsync({ name: name.trim(), grade_type: gradeType, classIds, reportPeriodIds: periodIds });
      toast(`${n} toets(en) aangemaakt`);
      setName(""); setClassIds([]); setPeriodIds([]);
    } catch (e) { toast("Aanmaken mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const canSave = name.trim() && classIds.length && periodIds.length;

  return (
    <Card title={<><Icon name="plus" size={14} /> Toets in bulk aanmaken</>} sub="Eén toets toepassen op meerdere klassen × rapporten">
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Naam"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Soera-toets" /></Field>
        <Field label="Beoordelingstype"><Select value={gradeType} onChange={(e) => setGradeType(e.target.value)}>
          <option value="cijfer">Cijfer (1–10)</option><option value="schaal">Schaal</option></Select></Field>
      </div>
      <div className="grid-2 mt-3">
        <div>
          <div className="text-xs text-subtle mb-2">Klassen ({sj.data?.name ?? "huidig schooljaar"})</div>
          {isLoading ? <Loading /> : !classes?.length ? <div className="empty">Geen klassen.</div> : (
            <div className="flex-col gap-1">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => setClassIds((a) => toggle(a, c.id))} />
                  {c.code}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-subtle mb-2">Rapporten</div>
          <div className="flex-col gap-1">
            {(periods ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={periodIds.includes(p.id)} onChange={() => setPeriodIds((a) => toggle(a, p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Btn kind="primary" icon="check" disabled={!canSave || bulk.isPending} onClick={create}>
          {bulk.isPending ? "Aanmaken…" : `Aanmaken (${classIds.length * periodIds.length})`}
        </Btn>
      </div>
    </Card>
  );
}

function AllTests() {
  const toast = useToast();
  const { data: tests, isLoading } = useAllTests();
  const del = useDeleteTest();
  const remove = async (id: string, label: string) => {
    if (!confirm(`Toets "${label}" verwijderen? Ingevulde cijfers gaan verloren.`)) return;
    try { await del.mutateAsync(id); toast("Toets verwijderd"); }
    catch (e) { toast("Verwijderen mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  return (
    <Card title="Alle toetsen" sub="Overzicht over alle klassen">
      {isLoading ? <Loading /> : !tests?.length ? <div className="empty">Nog geen toetsen aangemaakt.</div> : (
        <table className="table">
          <thead><tr><th>Klas</th><th>Rapport</th><th>Naam</th><th>Type</th><th style={{ width: 1 }}></th></tr></thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id}>
                <td className="font-semibold">{t.classes?.code ?? "—"}</td>
                <td className="text-sm">{t.report_periods?.name ?? "—"}</td>
                <td>{t.name}</td>
                <td className="text-sm">{t.grade_type === "cijfer" ? "Cijfer (1–10)" : "Schaal"}</td>
                <td><Btn size="sm" kind="ghost" icon="trash" onClick={() => remove(t.id, t.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function PeriodManager() {
  const toast = useToast();
  const { data: periods, isLoading } = useReportPeriods();
  const create = useCreateReportPeriod();
  const update = useUpdateReportPeriod();
  const [newName, setNewName] = useState("");

  const add = async () => {
    if (!newName.trim()) return;
    const ord = (periods?.length ? Math.max(...periods.map((p) => p.ord)) : 0) + 1;
    try { await create.mutateAsync({ name: newName.trim(), ord }); setNewName(""); toast("Rapport toegevoegd"); }
    catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  const rename = async (id: string, name: string) => { try { await update.mutateAsync({ id, patch: { name } }); } catch { /* stil */ } };
  const archive = async (id: string, name: string) => {
    if (!confirm(`Rapport "${name}" archiveren? Het verdwijnt uit de lijsten.`)) return;
    try { await update.mutateAsync({ id, patch: { archived: true } }); toast("Rapport gearchiveerd"); }
    catch (e) { toast("Archiveren mislukt: " + (e instanceof Error ? e.message : "")); }
  };
  const move = async (id: string, ord: number) => { try { await update.mutateAsync({ id, patch: { ord } }); } catch { /* stil */ } };

  return (
    <Card title={<><Icon name="settings" size={14} /> Rapportperioden beheren</>} sub="Naam en volgorde van de rapporten">
      {isLoading ? <Loading /> : (
        <table className="table">
          <thead><tr><th style={{ width: 1 }}>Volgorde</th><th>Naam</th><th style={{ width: 1 }}></th></tr></thead>
          <tbody>
            {(periods ?? []).map((p) => (
              <tr key={p.id}>
                <td><input className="input" type="number" defaultValue={p.ord} style={{ width: 70 }}
                  onBlur={(e) => { const v = parseInt(e.target.value); if (!Number.isNaN(v) && v !== p.ord) move(p.id, v); }} /></td>
                <td><input className="input" defaultValue={p.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) rename(p.id, v); }} /></td>
                <td><Btn size="sm" kind="ghost" icon="trash" onClick={() => archive(p.id, p.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2 mt-3">
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nieuw rapport, bv. Tussenrapport" />
        <Btn kind="primary" icon="plus" disabled={!newName.trim() || create.isPending} onClick={add}>Toevoegen</Btn>
      </div>
    </Card>
  );
}
