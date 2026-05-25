import { useEffect, useState } from "react";
import { Section, Card, Btn, Icon, Badge, Select, type IconName } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { supabase } from "@/lib/supabase";
import { useAppSettings } from "@/data/finance";
import { useSchooljaren } from "@/data/schooljaren";
import { useAuditLog, useSaveSettings, useSchooljaarCounts, useSchooljaarMutations } from "@/data/settings";

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n");
}

type SectionId = "general" | "schooljaren" | "audit" | "data";
const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "general", label: "Algemeen", icon: "settings" },
  { id: "schooljaren", label: "Schooljaren", icon: "calendar" },
  { id: "audit", label: "Audit log", icon: "activity" },
  { id: "data", label: "Data & export", icon: "download" },
];

export function SettingsScreen() {
  const [section, setSection] = useState<SectionId>("general");
  return (
    <Section title="Instellingen" sub="Beheer organisatie, schooljaren en data">
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24 }}>
        <div className="flex-col gap-1">
          {SECTIONS.map((s) => (
            <button key={s.id} className={"sidebar-link " + (section === s.id ? "active" : "")} onClick={() => setSection(s.id)}>
              <Icon name={s.icon} size={14} /><span>{s.label}</span>
            </button>
          ))}
        </div>
        <div>
          {section === "general" && <GeneralSettings />}
          {section === "schooljaren" && <SchooljarenSettings />}
          {section === "audit" && <AuditLog />}
          {section === "data" && <DataExport />}
        </div>
      </div>
    </Section>
  );
}

function GeneralSettings() {
  const toast = useToast();
  const { data: settings, isLoading } = useAppSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "", annual_amount_eur: 220, tuition_regulier_eur: 220, tuition_hifdh_eur: 350, terms: 3, sibling_discount: "" });

  useEffect(() => {
    if (settings) setForm({ name: settings.name, address: settings.address ?? "", phone: settings.phone ?? "", email: settings.email ?? "", annual_amount_eur: settings.annual_amount_eur, tuition_regulier_eur: settings.tuition_regulier_eur, tuition_hifdh_eur: settings.tuition_hifdh_eur, terms: settings.terms, sibling_discount: settings.sibling_discount ?? "" });
  }, [settings]);

  if (isLoading || !settings) return <Loading />;

  const onSave = async () => {
    try { await save.mutateAsync({ id: settings.id, ...form }); toast("Instellingen opgeslagen"); }
    catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <div className="flex-col gap-4">
      <Card title="Organisatie">
        <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field"><label>Naam</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Adres</label><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
          <div className="field"><label>Telefoon</label><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div className="field"><label>E-mail</label><input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end mt-3"><Btn kind="primary" icon="check" disabled={save.isPending} onClick={onSave}>Opslaan</Btn></div>
      </Card>
      <Card title="Collegegeld" sub="Jaarlijks vastgesteld tarief per traject — de begroting rekent met max. bezetting × tarief">
        <div className="grid-3">
          <div className="field"><label>Tarief Regulier (€/jaar)</label><input className="input" type="number" value={form.tuition_regulier_eur} onChange={(e) => setForm((f) => ({ ...f, tuition_regulier_eur: parseInt(e.target.value) || 0 }))} /></div>
          <div className="field"><label>Tarief Hifdh (€/jaar)</label><input className="input" type="number" value={form.tuition_hifdh_eur} onChange={(e) => setForm((f) => ({ ...f, tuition_hifdh_eur: parseInt(e.target.value) || 0 }))} /></div>
        </div>
        <div className="grid-3 mt-3">
          <div className="field"><label>Termijnen</label>
            <Select value={String(form.terms)} onChange={(e) => setForm((f) => ({ ...f, terms: parseInt(e.target.value) }))}>
              <option value="1">1 (jaarlijks)</option><option value="3">3 (per kwartaal)</option><option value="10">10 (maandelijks)</option>
            </Select>
          </div>
          <div className="field"><label>Korting broer/zus</label><input className="input" value={form.sibling_discount} onChange={(e) => setForm((f) => ({ ...f, sibling_discount: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end mt-3"><Btn kind="primary" icon="check" disabled={save.isPending} onClick={onSave}>Opslaan</Btn></div>
      </Card>
    </div>
  );
}

function SchooljarenSettings() {
  const toast = useToast();
  const { data: schooljaren, isLoading } = useSchooljaren();
  const { data: counts } = useSchooljaarCounts();
  const { add, setCurrent, remove } = useSchooljaarMutations();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", start_date: "", end_date: "", lesdagen: 32 });

  if (isLoading) return <Loading />;

  const onAdd = async () => {
    const code = form.code || "y" + (form.name.slice(0, 4) || Date.now());
    try {
      await add.mutateAsync({ code, name: form.name, start_date: form.start_date || null, end_date: form.end_date || null, lesdagen: form.lesdagen });
      toast("Schooljaar toegevoegd"); setAdding(false); setForm({ name: "", code: "", start_date: "", end_date: "", lesdagen: 32 });
    } catch (e) { toast("Mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <div className="flex-col gap-4">
      <Card title={<><Icon name="calendar" size={14} /> Schooljaren-database</>} sub="Klassen, financiën en historie zijn aan deze records gekoppeld."
        action={<Btn size="sm" icon="plus" kind="primary" onClick={() => setAdding(true)}>Schooljaar toevoegen</Btn>}>
        <table className="table">
          <thead><tr><th>Naam</th><th>Start</th><th>Eind</th><th>Lesdagen</th><th>Klassen</th><th>Uitgaven</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(schooljaren ?? []).map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">Schooljaar {s.name}</td>
                <td className="font-mono text-sm">{s.start_date}</td>
                <td className="font-mono text-sm">{s.end_date}</td>
                <td className="num">{s.lesdagen}</td>
                <td className="num">{counts?.klassen[s.id] ?? 0}</td>
                <td className="num">{counts?.uitgaven[s.id] ?? 0}</td>
                <td>{s.is_current ? <Badge kind="primary" dot>Huidig</Badge> : s.archived ? <Badge>Gearchiveerd</Badge> : <Badge kind="info">Actief</Badge>}</td>
                <td>
                  <div className="flex gap-1">
                    {!s.is_current && <button className="btn ghost sm" title="Maak huidig" onClick={() => setCurrent.mutate(s.id, { onSuccess: () => toast(`Schooljaar ${s.name} ingesteld als huidig`) })}><Icon name="check" size={12} /></button>}
                    {!s.is_current && <button className="btn ghost sm" title="Verwijderen" onClick={() => { if (confirm(`Schooljaar ${s.name} verwijderen? Dit verwijdert ook gekoppelde klassen en uitgaven.`)) remove.mutate(s.id, { onSuccess: () => toast("Schooljaar verwijderd") }); }}><Icon name="trash" size={12} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {adding && (
        <Card title="Nieuw schooljaar" action={<button className="btn ghost sm" onClick={() => setAdding(false)}><Icon name="x" size={14} /></button>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            <div className="field"><label>Naam (bijv. 2027/28)</label><input className="input" placeholder="2027/28" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label>Startdatum</label><input className="input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
            <div className="field"><label>Einddatum</label><input className="input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
            <div className="field"><label>Lesdagen</label><input className="input" type="number" value={form.lesdagen} onChange={(e) => setForm((f) => ({ ...f, lesdagen: parseInt(e.target.value) || 0 }))} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={() => setAdding(false)}>Annuleren</Btn><Btn kind="primary" icon="check" disabled={!form.name || add.isPending} onClick={onAdd}>Toevoegen</Btn></div>
        </Card>
      )}
    </div>
  );
}

function AuditLog() {
  const { data, isLoading } = useAuditLog();
  return (
    <Card title="Audit log" sub="Alle wijzigingen — onveranderlijk vastgelegd">
      {isLoading ? <Loading /> : (data ?? []).length === 0 ? <div className="empty">Nog geen logregels.</div> : (
        <table className="table">
          <thead><tr><th>Tijd</th><th>Gebruiker</th><th>Actie</th><th>Object</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-sm">{new Date(r.at).toLocaleString("nl-NL")}</td>
                <td>{r.user_label}</td>
                <td>{r.action}</td>
                <td className="text-sm text-subtle">{r.object}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DataExport() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); toast("Export gedownload"); }
    catch (e) { toast("Export mislukt: " + (e instanceof Error ? e.message : "")); }
    finally { setBusy(null); }
  };

  const exportLeerlingen = () => run("leerlingen", async () => {
    const { data, error } = await supabase
      .from("leerlingen")
      .select("leerlingnummer, niveau, joined, kinderen(full_name, gender, birth_year, address), classes(code), schooljaren(name)");
    if (error) throw error;
    type R = { leerlingnummer: string | null; niveau: string | null; joined: string | null; kinderen: { full_name: string; gender: string | null; birth_year: number | null; address: string | null } | null; classes: { code: string } | null; schooljaren: { name: string } | null };
    const rows = ((data as unknown as R[]) ?? []).map((l) => ({
      leerlingnummer: l.leerlingnummer, naam: l.kinderen?.full_name, geslacht: l.kinderen?.gender, geboortejaar: l.kinderen?.birth_year,
      adres: l.kinderen?.address, klas: l.classes?.code, schooljaar: l.schooljaren?.name, niveau: l.niveau, ingeschreven: l.joined,
    }));
    downloadFile(`leerlingen-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  });

  const exportFinancien = () => run("financien", async () => {
    const { data, error } = await supabase.from("expenses").select("date, category, description, amount, vendor, schooljaren(name)").order("date");
    if (error) throw error;
    type R = { date: string; category: string | null; description: string | null; amount: number; vendor: string | null; schooljaren: { name: string } | null };
    const rows = ((data as unknown as R[]) ?? []).map((x) => ({ datum: x.date, schooljaar: x.schooljaren?.name, categorie: x.category, omschrijving: x.description, bedrag: x.amount, leverancier: x.vendor }));
    downloadFile(`uitgaven-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  });

  const exportBackup = () => run("backup", async () => {
    const tables = ["schooljaren", "teachers", "kinderen", "ouders", "kind_ouder", "classes", "leerlingen", "lessons", "attendance_records", "quran_assignments", "leerling_surah_progress", "enrollments", "enrollment_parents", "enrollment_placements", "payments", "expenses", "budget_categories"];
    const dump: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) { const { data } = await supabase.from(t as never).select("*"); dump[t] = data ?? []; }
    downloadFile(`backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump, null, 2), "application/json");
  });

  const items: [string, string, string, IconName, () => void][] = [
    ["leerlingen", "Leerlingen exporteren", "Alle leerlingen + kind/klas, CSV", "users", exportLeerlingen],
    ["financien", "Financiën exporteren", "Alle uitgaven, CSV", "coins", exportFinancien],
    ["backup", "Volledige back-up", "Alle tabellen, JSON", "download", exportBackup],
  ];
  return (
    <Card title="Data & export">
      <div className="flex-col gap-3">
        {items.map(([key, t, s, ic, fn]) => (
          <div key={key} className="flex items-center gap-3" style={{ padding: "14px 16px", background: "var(--bg-sunken)", borderRadius: 10 }}>
            <Icon name={ic} size={18} />
            <div style={{ flex: 1 }}><div className="font-semibold text-sm">{t}</div><div className="text-xs text-subtle">{s}</div></div>
            <Btn size="sm" icon="download" disabled={busy === key} onClick={fn}>{busy === key ? "Bezig…" : "Download"}</Btn>
          </div>
        ))}
      </div>
    </Card>
  );
}
