import { useMemo, useState } from "react";
import { Section, Card, Stat, Btn, Icon, Badge, Select, EUR, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";
import { useFinance, useAddExpense, useAddIncome, useDeleteExpenses, useDeleteIncomes, budgetForCategory, type Expense, type Income } from "@/data/finance";
import { useLeerlingen } from "@/data/leerlingen";
import { useClasses } from "@/data/classes";
import { useTuitionTiers, useFamilyLinks, resolveTuition } from "@/data/tuition";

const CAT_KIND: Record<string, BadgeKind> = { Materialen: "accent", Salaris: "primary", Faciliteit: "info", Activiteit: "success", Catering: "warn", Software: "default" };
const CATEGORIES = ["Materialen", "Salaris", "Faciliteit", "Activiteit", "Catering", "Software", "Overig"];
const INCOME_SOURCES = ["Sponsor", "Donatie", "Subsidie", "Fondsen", "Overig"];

export function FinanceScreen() {
  const toast = useToast();
  const { data: schooljaren } = useSchooljaren();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? current?.id ?? null;
  const schooljaar = (schooljaren ?? []).find((s) => s.id === effectiveSj);
  const isCurrent = !!schooljaar?.is_current;

  const { data, isLoading, isError, error } = useFinance(effectiveSj);
  const addExpense = useAddExpense();
  const addIncome = useAddIncome();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);

  const expenses = data?.expenses ?? [];
  const incomes = data?.incomes ?? [];
  const budgets = data?.budgets ?? [];
  const reg = data?.regulier ?? { capacity: 0, enrolled: 0 };
  const hif = data?.hifdh ?? { capacity: 0, enrolled: 0 };

  // Verschuldigd lesgeld per leerling (staffel per traject + gezinsrang, override wint).
  const { data: leerlingen } = useLeerlingen(effectiveSj);
  const { data: yearClasses } = useClasses(effectiveSj);
  const { data: familyLinks } = useFamilyLinks();
  const { data: tiers } = useTuitionTiers(effectiveSj);
  const trackByClass = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of yearClasses ?? []) map.set(c.id, c.track);
    return map;
  }, [yearClasses]);
  const tuition = useMemo(
    () => resolveTuition(
      (leerlingen ?? []).map((l) => ({ id: l.id, kind_id: l.kind_id, birth_year: l.kinderen?.birth_year ?? null, track: trackByClass.get(l.class_id) ?? null, override: l.lesgeld_override })),
      familyLinks ?? [],
      tiers ?? [],
    ),
    [leerlingen, trackByClass, familyLinks, tiers],
  );
  const tuitionByTrack = useMemo(() => {
    const acc = { regulier: 0, hifdh: 0 } as Record<string, number>;
    for (const l of leerlingen ?? []) {
      const r = tuition.get(l.id);
      const track = trackByClass.get(l.class_id);
      if (r && track && track in acc) acc[track] += r.amount;
    }
    return acc;
  }, [leerlingen, tuition, trackByClass]);
  const tuitionReg = tuitionByTrack.regulier;
  const tuitionHif = tuitionByTrack.hifdh;
  const totalTuition = tuitionReg + tuitionHif;

  const manualIncome = incomes.reduce((a, i) => a + Number(i.amount), 0);
  const totalIncome = totalTuition + manualIncome;
  const totalExpenses = expenses.reduce((a, x) => a + Number(x.amount), 0);
  const budgetTotal = budgets.reduce((a, c) => a + Number(c.planned), 0);

  const spentByBudget = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of expenses) { const b = budgetForCategory(x.category); if (b) m[b] = (m[b] ?? 0) + Number(x.amount); }
    return m;
  }, [expenses]);

  const incomeBySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of incomes) { const s = i.source ?? "Overig"; m[s] = (m[s] ?? 0) + Number(i.amount); }
    return m;
  }, [incomes]);

  if (isError) return <ErrorState error={error} />;

  return (
    <>
      <Section
        title="Financiën"
        sub={`Schooljaar ${schooljaar?.name ?? ""}${isCurrent ? " (huidig)" : " · archief"} · begroting o.b.v. verschuldigd lesgeld per leerling (gestaffeld per gezin)`}
        actions={
          <>
            <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
              {(schooljaren ?? []).map((s) => <option key={s.id} value={s.id}>Schooljaar {s.name}{s.is_current ? " (huidig)" : ""}</option>)}
            </Select>
            {isCurrent && <Btn icon="plus" kind="ghost" onClick={() => setShowAddIncome(true)}>Inkomst toevoegen</Btn>}
            {isCurrent && <Btn icon="plus" kind="primary" onClick={() => setShowAddExpense(true)}>Uitgave toevoegen</Btn>}
          </>
        }
      >
        {isLoading ? <Loading /> : (
          <>
            <div className="stat-grid mb-6">
              <Stat label="Begrote inkomsten" value={EUR(totalIncome)} sub={`collegegeld ${EUR(totalTuition)} + overig ${EUR(manualIncome)}`} icon="arrowUp" deltaKind="up" />
              <Stat label="Totale uitgaven" value={EUR(totalExpenses)} sub={budgetTotal ? Math.round((totalExpenses / budgetTotal) * 100) + "% van begroting" : ""} icon="arrowDown" />
              <Stat label="Saldo (begroot)" value={EUR(totalIncome - totalExpenses)} sub={isCurrent ? "prognose seizoen" : "definitief"} icon="coins" deltaKind={totalIncome > totalExpenses ? "up" : "down"} />
              <Stat label="Ontvangen collegegeld" value={EUR(data?.paidTuition ?? 0)} sub={`${data?.openCount ?? 0} openstaand`} icon="check" />
            </div>

            <div className="grid-2 mb-6">
              <Card title="Begroting vs werkelijk" sub="Uitgaven per categorie · cumulatief">
                {budgets.length === 0 ? <div className="empty">Geen begroting ingesteld.</div> : (
                  <div className="flex-col gap-4">
                    {budgets.map((c) => {
                      const spent = spentByBudget[c.name] ?? 0;
                      const ratio = Number(c.planned) ? (spent / Number(c.planned)) * 100 : 0;
                      const over = ratio > 100;
                      return (
                        <div key={c.id}>
                          <div className="flex justify-between items-center mb-1" style={{ fontSize: 13 }}>
                            <span className="font-semibold">{c.name}</span>
                            <span className="num text-sm"><b>{EUR(spent)}</b> <span className="text-subtle">/ {EUR(Number(c.planned))}</span></span>
                          </div>
                          <div style={{ position: "relative", height: 10, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: Math.min(100, ratio) + "%", background: over ? "var(--danger)" : ratio > 80 ? "var(--warn)" : "var(--primary)", borderRadius: 999 }} />
                          </div>
                          <div className="text-xs text-subtle mt-1">{over ? <span style={{ color: "var(--danger)" }}>Overschrijding {EUR(spent - Number(c.planned))}</span> : Math.round(ratio) + "% gebruikt"}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card title="Inkomsten samenstelling" sub="Som van verschuldigd lesgeld per traject + handmatige inkomsten"
                action={isCurrent ? <Btn size="sm" icon="plus" onClick={() => setShowAddIncome(true)}>Inkomst</Btn> : undefined}>
                <div className="flex-col gap-3">
                  <IncomeRow label="Collegegeld regulier" value={tuitionReg} total={totalIncome} color="var(--primary)" note={`${reg.enrolled} leerlingen`} />
                  <IncomeRow label="Collegegeld hifdh" value={tuitionHif} total={totalIncome} color="var(--accent)" note={`${hif.enrolled} leerlingen`} />
                  {Object.entries(incomeBySource).map(([src, val], i) => (
                    <IncomeRow key={src} label={src} value={val} total={totalIncome} color={["var(--info)", "var(--success)", "var(--warn)"][i % 3]} />
                  ))}
                </div>
                <div className="divider mt-4 mb-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Totaal begroot</span>
                  <span className="text-lg font-semibold num">{EUR(totalIncome)}</span>
                </div>
                <div className="text-xs text-subtle mt-1">{(leerlingen ?? []).length} leerlingen · staffel in te stellen bij Instellingen → Schooljaren</div>
              </Card>
            </div>

            {incomes.length > 0 && <IncomesTable incomes={incomes} schooljaarId={effectiveSj} schooljaarName={schooljaar?.name ?? ""} />}

            <ExpensesTable expenses={expenses} schooljaarId={effectiveSj} schooljaarName={schooljaar?.name ?? ""} total={totalExpenses} />
          </>
        )}
      </Section>

      {showAddExpense && effectiveSj && (
        <AddExpenseModal onClose={() => setShowAddExpense(false)} pending={addExpense.isPending}
          onSave={async (row) => { try { await addExpense.mutateAsync({ ...row, schooljaar_id: effectiveSj }); toast("Uitgave toegevoegd"); setShowAddExpense(false); } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); } }} />
      )}
      {showAddIncome && effectiveSj && (
        <AddIncomeModal onClose={() => setShowAddIncome(false)} pending={addIncome.isPending}
          onSave={async (row) => { try { await addIncome.mutateAsync({ ...row, schooljaar_id: effectiveSj }); toast("Inkomst toegevoegd"); setShowAddIncome(false); } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); } }} />
      )}
    </>
  );
}

function IncomesTable({ incomes, schooljaarId, schooljaarName }: { incomes: Income[]; schooljaarId: string | null; schooljaarName: string }) {
  const toast = useToast();
  const del = useDeleteIncomes(schooljaarId);
  const tools = useTableTools({
    rows: incomes,
    getId: (i) => i.id,
    search: (i, q) => (i.source ?? "").toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q) || (i.date ?? "").toLowerCase().includes(q),
    sorters: { date: (i) => i.date, source: (i) => i.source, description: (i) => i.description, amount: (i) => Number(i.amount) },
    initialSort: { key: "date", dir: "desc" },
  });
  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} inkomstpost(en) verwijderen?`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} inkomstpost(en) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };
  return (
    <Card title={<><Icon name="arrowUp" size={14} /> Handmatige inkomsten</>} sub={`${incomes.length} posten · schooljaar ${schooljaarName}`} className="mb-6"
      action={<SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek inkomst…" width={200} />}>
      <BulkBar count={tools.selectedIds.length} noun="post(en)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
      <table className="table">
        <thead><tr>
          <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
          <SortTh label="Datum" k="date" sort={tools.sort} onSort={tools.toggleSort} />
          <SortTh label="Bron" k="source" sort={tools.sort} onSort={tools.toggleSort} />
          <SortTh label="Omschrijving" k="description" sort={tools.sort} onSort={tools.toggleSort} />
          <SortTh label="Bedrag" k="amount" sort={tools.sort} onSort={tools.toggleSort} style={{ textAlign: "right" }} />
        </tr></thead>
        <tbody>
          {tools.view.map((i) => {
            const isChecked = tools.checked.has(i.id);
            return (
              <tr key={i.id} className={isChecked ? "selected" : ""}>
                <SelectTd checked={isChecked} onToggle={() => tools.toggleOne(i.id)} label="Selecteer inkomst" />
                <td className="font-mono text-sm">{i.date}</td>
                <td><Badge kind="success">{i.source}</Badge></td>
                <td>{i.description}</td>
                <td className="num font-semibold" style={{ textAlign: "right" }}>{EUR(Number(i.amount))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function ExpensesTable({ expenses, schooljaarId, schooljaarName, total }: { expenses: Expense[]; schooljaarId: string | null; schooljaarName: string; total: number }) {
  const toast = useToast();
  const del = useDeleteExpenses(schooljaarId);
  const tools = useTableTools({
    rows: expenses,
    getId: (x) => x.id,
    search: (x, q) => (x.category ?? "").toLowerCase().includes(q) || (x.description ?? "").toLowerCase().includes(q) || (x.vendor ?? "").toLowerCase().includes(q) || (x.date ?? "").toLowerCase().includes(q),
    sorters: { date: (x) => x.date, category: (x) => x.category, description: (x) => x.description, vendor: (x) => x.vendor, amount: (x) => Number(x.amount) },
    initialSort: { key: "date", dir: "desc" },
  });
  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} uitgave(n) verwijderen?`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} uitgave(n) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };
  return (
    <Card title={<><Icon name="list" size={14} /> Uitgaven</>} sub={`${expenses.length} uitgaven · schooljaar ${schooljaarName}`}
      action={expenses.length > 0 ? <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek uitgave…" width={200} /> : undefined}>
      {expenses.length === 0 ? <div className="empty">Nog geen uitgaven voor dit schooljaar.</div> : (
        <>
          <BulkBar count={tools.selectedIds.length} noun="uitgave(n)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
          <table className="table">
            <thead><tr>
              <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
              <SortTh label="Datum" k="date" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Categorie" k="category" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Beschrijving" k="description" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Leverancier" k="vendor" sort={tools.sort} onSort={tools.toggleSort} />
              <SortTh label="Bedrag" k="amount" sort={tools.sort} onSort={tools.toggleSort} style={{ textAlign: "right" }} />
            </tr></thead>
            <tbody>
              {tools.view.map((x) => {
                const isChecked = tools.checked.has(x.id);
                return (
                  <tr key={x.id} className={isChecked ? "selected" : ""}>
                    <SelectTd checked={isChecked} onToggle={() => tools.toggleOne(x.id)} label="Selecteer uitgave" />
                    <td className="font-mono text-sm">{x.date}</td>
                    <td><Badge kind={CAT_KIND[x.category ?? ""] ?? "default"}>{x.category}</Badge></td>
                    <td>{x.description}</td>
                    <td className="text-sm text-subtle">{x.vendor}</td>
                    <td className="num font-semibold" style={{ textAlign: "right" }}>{EUR(Number(x.amount))}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg-sunken)", fontWeight: 600 }}>
                <td colSpan={5} style={{ textAlign: "right", padding: "12px 16px" }}>Totaal</td>
                <td className="num" style={{ textAlign: "right", padding: "12px 16px" }}>{EUR(total)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function IncomeRow({ label, value, total, color, note }: { label: string; value: number; total: number; color: string; note?: string }) {
  return (
    <div>
      <div className="flex justify-between" style={{ fontSize: 13, marginBottom: 4 }}>
        <span>{label}{note && <span className="text-subtle"> · {note}</span>}</span>
        <span className="num font-semibold">{EUR(value)}</span>
      </div>
      <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: (total ? (value / total) * 100 : 0) + "%", height: "100%", background: color }} />
      </div>
    </div>
  );
}

function AddExpenseModal({ onClose, onSave, pending }: { onClose: () => void; onSave: (r: { date: string; category: string; description: string; amount: number; vendor: string }) => void; pending: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const valid = date && amount && category && description;
  return (
    <Modal title="Nieuwe uitgave" sub="Voeg een uitgave toe aan de boekhouding" onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={() => onSave({ date, category, description, amount: parseFloat(amount), vendor })} saving={pending} disabled={!valid} />}>
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Datum"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Bedrag (€)"><input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="Categorie"><Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="" disabled>Kies categorie…</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      <Field label="Beschrijving"><input className="input" placeholder="Bijv. Werkboeken Niveau 2" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Leverancier"><input className="input" placeholder="Bijv. Dar Al-Kotob NL" value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
    </Modal>
  );
}

function AddIncomeModal({ onClose, onSave, pending }: { onClose: () => void; onSave: (r: { date: string; source: string; description: string; amount: number }) => void; pending: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("Sponsor");
  const [description, setDescription] = useState("");
  const valid = date && amount;
  return (
    <Modal title="Nieuwe inkomst" sub="Sponsor, donatie, subsidie of overige inkomsten" onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={() => onSave({ date, source, description, amount: parseFloat(amount) })} saving={pending} disabled={!valid} />}>
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Datum"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Bedrag (€)"><input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="Bron"><Select value={source} onChange={(e) => setSource(e.target.value)}>{INCOME_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
      <Field label="Omschrijving"><input className="input" placeholder="Bijv. Sponsoring lokale ondernemer" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    </Modal>
  );
}
