import { useEffect, useState } from "react";
import { Section, Card, Btn, Icon, Badge, Select, type IconName } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/features/auth/AuthProvider";
import { useAppSettings } from "@/data/finance";
import { useSchooljaren, useCurrentSchooljaar, type Schooljaar } from "@/data/schooljaren";
import { useTuitionTiers, useTuitionTierMutations, TRACKS, type Track } from "@/data/tuition";
import { useClasses } from "@/data/classes";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, type AppUser } from "@/data/users";
import { useAuditLog, useSaveSettings, useSchooljaarCounts, useSchooljaarMutations } from "@/data/settings";
import { useTableTools, SortTh, SelectTh, BulkBar } from "@/features/_shared/tableTools";

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

type SectionId = "general" | "users" | "schooljaren" | "audit" | "data";
const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "general", label: "Algemeen", icon: "settings" },
  { id: "users", label: "Gebruikersbeheer", icon: "user" },
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
          {section === "users" && <UserManagement />}
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
      <Card title="Betaaltermijnen" sub="Het lesgeld zelf stel je per schooljaar in bij Instellingen → Schooljaren (gestaffeld per kind).">
        <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field"><label>Termijnen</label>
            <Select value={String(form.terms)} onChange={(e) => setForm((f) => ({ ...f, terms: parseInt(e.target.value) }))}>
              <option value="1">1 (jaarlijks)</option><option value="3">3 (per kwartaal)</option><option value="10">10 (maandelijks)</option>
            </Select>
          </div>
        </div>
        <div className="flex justify-end mt-3"><Btn kind="primary" icon="check" disabled={save.isPending} onClick={onSave}>Opslaan</Btn></div>
      </Card>
    </div>
  );
}

function UserManagement() {
  const toast = useToast();
  const { session } = useSession();
  const { data: users, isLoading } = useUsers();
  const { data: schooljaren } = useSchooljaren();
  const { data: currentYear } = useCurrentSchooljaar();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ full_name: string; email: string; role: "admin" | "docent"; schooljaar_id: string; class_id: string }>(
    { full_name: "", email: "", role: "docent", schooljaar_id: "", class_id: "" },
  );
  // Classes of the chosen school year (selecting a class implicitly selects its year).
  const { data: classes } = useClasses(form.schooljaar_id || null);

  const openAdd = () => {
    setEditingId(null);
    setForm({ full_name: "", email: "", role: "docent", schooljaar_id: currentYear?.id ?? "", class_id: "" });
    setAdding(true);
  };
  const openEdit = (u: AppUser) => {
    setEditingId(u.id);
    setForm({
      full_name: u.full_name ?? "",
      email: u.email ?? "",
      role: u.role === "admin" ? "admin" : "docent",
      schooljaar_id: u.class_schooljaar_id ?? currentYear?.id ?? "",
      class_id: u.class_id ?? "",
    });
    setAdding(true);
  };
  const close = () => { setAdding(false); setEditingId(null); };

  // Default the year to the current one once it has loaded (add mode, no year yet).
  useEffect(() => {
    if (currentYear?.id) setForm((f) => (f.schooljaar_id ? f : { ...f, schooljaar_id: currentYear.id }));
  }, [currentYear]);

  const onSave = async () => {
    try {
      if (editingId) {
        await update.mutateAsync({
          id: editingId,
          full_name: form.full_name.trim(),
          role: form.role,
          class_id: form.role === "docent" ? form.class_id || null : null,
        });
        toast("Gebruiker bijgewerkt");
      } else {
        const res = await create.mutateAsync({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role: form.role,
          class_id: form.role === "docent" ? form.class_id || null : null,
        });
        toast(res.email_sent
          ? `Uitnodiging verstuurd naar ${form.email} — de gebruiker stelt zelf een wachtwoord in.`
          : `Account aangemaakt, maar de e-mail kon niet worden verstuurd. Gebruik "Wachtwoord vergeten" op het inlogscherm.`);
      }
      close();
    } catch (e) {
      toast("Mislukt: " + (e instanceof Error ? e.message : ""));
    }
  };

  const onDelete = (id: string, label: string) => {
    if (!confirm(`Gebruiker ${label} verwijderen? Dit account verliest direct toegang.`)) return;
    del.mutate(id, {
      onSuccess: () => toast("Gebruiker verwijderd"),
      onError: (e) => toast("Verwijderen mislukt: " + (e instanceof Error ? e.message : "")),
    });
  };

  const saving = create.isPending || update.isPending;
  const canSave = !!(form.full_name.trim() && (editingId || form.email.trim()) && (form.role === "admin" || form.class_id));

  return (
    <div className="flex-col gap-4">
      <Card
        title={<><Icon name="user" size={14} /> Gebruikers</>}
        sub="Admins beheren alles; docenten zien en beheren alleen hun eigen klas."
        action={<Btn size="sm" icon="plus" kind="primary" onClick={openAdd}>Gebruiker toevoegen</Btn>}
      >
        {isLoading ? <Loading /> : (
          <table className="table">
            <thead><tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Klas</th><th style={{ textAlign: "right" }}>Acties</th></tr></thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="font-semibold">{u.full_name ?? "—"}</td>
                  <td className="font-mono text-sm">{u.email ?? "—"}</td>
                  <td>{u.role === "admin" ? <Badge kind="primary">Admin</Badge> : <Badge kind="info">Docent</Badge>}</td>
                  <td>{u.role === "docent" ? (u.class_code ?? <span className="text-subtle">— geen klas —</span>) : <span className="text-subtle">—</span>}</td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      <Btn size="sm" icon="edit" onClick={() => openEdit(u)}>Bewerken</Btn>
                      {session?.user.id !== u.id && (
                        <Btn size="sm" kind="danger" icon="trash" disabled={del.isPending}
                          onClick={() => onDelete(u.id, u.full_name ?? u.email ?? "")}>Verwijderen</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {adding && (
        <Modal
          title={editingId ? "Gebruiker bewerken" : "Gebruiker toevoegen"}
          sub={editingId ? "Pas naam, rol of klas aan. Het e-mailadres ligt vast." : "De gebruiker krijgt een e-mail om zelf een wachtwoord in te stellen."}
          onClose={close}
          footer={<ModalFooter onCancel={close} onSave={onSave} saving={saving} disabled={!canSave} saveLabel={editingId ? "Opslaan" : "Uitnodigen"} />}>
          <Field label="Volledige naam"><input className="input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Voornaam Achternaam" /></Field>
          <Field label="E-mailadres">
            <input className="input" type="email" value={form.email} disabled={!!editingId}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="naam@voorbeeld.nl" />
          </Field>
          <Field label="Rol">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "docent" }))}>
              <option value="docent">Docent — alleen eigen klas</option>
              <option value="admin">Admin — volledige toegang</option>
            </Select>
          </Field>
          {form.role === "docent" && (
            <>
              <Field label="Schooljaar">
                <Select value={form.schooljaar_id} onChange={(e) => setForm((f) => ({ ...f, schooljaar_id: e.target.value, class_id: "" }))}>
                  {(schooljaren ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (huidig)" : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Klas">
                <Select value={form.class_id} onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}>
                  <option value="">— Kies een klas —</option>
                  {(classes ?? []).filter((c) => c.schooljaar_id === form.schooljaar_id).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </Select>
              </Field>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function SchooljarenSettings() {
  const toast = useToast();
  const { data: schooljaren, isLoading } = useSchooljaren();
  const { data: counts } = useSchooljaarCounts();
  const { add, setCurrent, setArchived, remove, removeMany } = useSchooljaarMutations();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", start_date: "", end_date: "", lesdagen: 32 });

  const tools = useTableTools({
    rows: schooljaren ?? [],
    getId: (s) => s.id,
    sorters: {
      name: (s) => s.name,
      start: (s) => s.start_date,
      end: (s) => s.end_date,
      lesdagen: (s) => s.lesdagen,
      klassen: (s) => counts?.klassen[s.id] ?? 0,
      uitgaven: (s) => counts?.uitgaven[s.id] ?? 0,
    },
    initialSort: { key: "name", dir: "desc" },
  });

  if (isLoading) return <Loading />;

  const onAdd = async () => {
    const code = form.code || "y" + (form.name.slice(0, 4) || Date.now());
    try {
      await add.mutateAsync({ code, name: form.name, start_date: form.start_date || null, end_date: form.end_date || null, lesdagen: form.lesdagen });
      toast("Schooljaar toegevoegd"); setAdding(false); setForm({ name: "", code: "", start_date: "", end_date: "", lesdagen: 32 });
    } catch (e) { toast("Mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  // Never bulk-delete the current school year; only deletable rows count.
  const deletableIds = tools.selectedIds.filter((id) => !(schooljaren ?? []).find((s) => s.id === id)?.is_current);
  const onDelete = () => {
    if (!deletableIds.length || !confirm(`${deletableIds.length} schooljaar/-jaren verwijderen? Dit verwijdert ook gekoppelde klassen en uitgaven.`)) return;
    removeMany.mutate(deletableIds, { onSuccess: () => { toast(`${deletableIds.length} schooljaar/-jaren verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <div className="flex-col gap-4">
      <Card title={<><Icon name="calendar" size={14} /> Schooljaren-database</>} sub="Klassen, financiën en historie zijn aan deze records gekoppeld."
        action={<Btn size="sm" icon="plus" kind="primary" onClick={() => setAdding(true)}>Schooljaar toevoegen</Btn>}>
        <BulkBar count={deletableIds.length} noun="schooljaar/-jaren" onClear={tools.clear} onDelete={onDelete} pending={removeMany.isPending} />
        <table className="table">
          <thead><tr>
            <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
            <SortTh label="Naam" k="name" sort={tools.sort} onSort={tools.toggleSort} />
            <SortTh label="Start" k="start" sort={tools.sort} onSort={tools.toggleSort} />
            <SortTh label="Eind" k="end" sort={tools.sort} onSort={tools.toggleSort} />
            <SortTh label="Lesdagen" k="lesdagen" sort={tools.sort} onSort={tools.toggleSort} />
            <SortTh label="Klassen" k="klassen" sort={tools.sort} onSort={tools.toggleSort} />
            <SortTh label="Uitgaven" k="uitgaven" sort={tools.sort} onSort={tools.toggleSort} />
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {tools.view.map((s) => (
              <tr key={s.id} className={tools.checked.has(s.id) ? "selected" : ""}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={tools.checked.has(s.id)} disabled={s.is_current} onChange={(e) => tools.toggleOne(s.id, (e.nativeEvent as MouseEvent).shiftKey === true)} aria-label={`Selecteer schooljaar ${s.name}`} title={s.is_current ? "Het huidige schooljaar kan niet worden verwijderd" : undefined} />
                </td>
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
                    {!s.is_current && !s.archived && <button className="btn ghost sm" title="Archiveren" onClick={() => setArchived.mutate({ id: s.id, archived: true }, { onSuccess: () => toast(`Schooljaar ${s.name} gearchiveerd`) })}><Icon name="archive" size={12} /></button>}
                    {s.archived && <button className="btn ghost sm" title="Uit archief halen (weer actief)" onClick={() => setArchived.mutate({ id: s.id, archived: false }, { onSuccess: () => toast(`Schooljaar ${s.name} weer actief`) })}><Icon name="restore" size={12} /></button>}
                    {!s.is_current && <button className="btn ghost sm" title="Verwijderen" onClick={() => { if (confirm(`Schooljaar ${s.name} verwijderen? Dit verwijdert ook gekoppelde klassen en uitgaven.`)) remove.mutate(s.id, { onSuccess: () => toast("Schooljaar verwijderd") }); }}><Icon name="trash" size={12} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <TuitionTierSettings schooljaren={schooljaren ?? []} />

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

const TRACK_LABEL: Record<string, string> = { regulier: "Regulier", hifdh: "Hifdh" };

function TuitionTierSettings({ schooljaren }: { schooljaren: Schooljaar[] }) {
  const toast = useToast();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effective = sjId ?? current?.id ?? schooljaren[0]?.id ?? null;
  const { data: tiers } = useTuitionTiers(effective);
  const { addTier, setBedrag, removeTier } = useTuitionTierMutations(effective);

  const listFor = (track: string) => (tiers ?? []).filter((t) => t.track === track).sort((a, b) => a.rang - b.rang);
  const onAdd = (track: Track) => {
    const existing = listFor(track);
    const last = existing[existing.length - 1];
    addTier.mutate({ track, rang: (last?.rang ?? 0) + 1, bedrag: last ? Number(last.bedrag) : 0 }, { onError: () => toast("Toevoegen mislukt") });
  };

  return (
    <Card title={<><Icon name="coins" size={14} /> Lesgeld-staffel</>}
      sub="Per schooljaar en traject — 1e kind, 2e kind, … Het bedrag is later per leerling te overschrijven."
      action={
        <Select value={effective ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: 170 }}>
          {schooljaren.map((s) => <option key={s.id} value={s.id}>Schooljaar {s.name}{s.is_current ? " (huidig)" : ""}</option>)}
        </Select>
      }>
      <div className="grid-2" style={{ gap: 24 }}>
        {TRACKS.map((track) => {
          const list = listFor(track);
          return (
            <div key={track}>
              <div className="font-semibold mb-2">{TRACK_LABEL[track]}</div>
              <div className="flex-col gap-2">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-sm text-subtle" style={{ width: 70 }}>{t.rang}e kind</span>
                    <div style={{ position: "relative", width: 130 }}>
                      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)" }}>€</span>
                      <input className="input" style={{ paddingLeft: 20 }} type="number" defaultValue={Number(t.bedrag)}
                        onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== Number(t.bedrag)) setBedrag.mutate({ id: t.id, bedrag: v }); }} />
                    </div>
                    <button className="btn ghost sm" title="Trede verwijderen" onClick={() => removeTier.mutate(t.id)}><Icon name="trash" size={12} /></button>
                  </div>
                ))}
                {list.length === 0 && <div className="text-xs text-subtle">Nog geen treden ingesteld.</div>}
                <div><Btn size="sm" kind="ghost" icon="plus" onClick={() => onAdd(track)}>Trede toevoegen</Btn></div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
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
