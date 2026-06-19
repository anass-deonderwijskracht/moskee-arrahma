import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Btn, Icon, Select, EUR } from "@/components/ui";
import { useToast } from "@/components/chrome/Toast";
import {
  useUpdateEnrollmentStatus, useUpdateEnrollment, useUpdateEnrollmentParent,
  useDeleteEnrollments, useUpsertPlacement, ENROLL_STATUSES,
  type Enrollment, type Placement,
} from "@/data/enrollments";
import { useTuitionTiers } from "@/data/tuition";
import { ENROLL_COLUMNS } from "@/data/dashboard";

const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));

interface ParentForm { id: string; name: string; role: string; phone: string; email: string; is_primary: boolean }

const initForm = (it: Enrollment) => ({
  child_name: it.child_name ?? "",
  age: it.age != null ? String(it.age) : "",
  gender: it.gender ?? "",
  track: it.track ?? "regulier",
  birthdate: it.birthdate ?? "",
  preferred_lesday: it.preferred_lesday ?? "",
  target_class: it.target_class ?? "",
  address: it.address ?? "",
  notes: it.notes ?? "",
});

/** Self-contained enrollment detail side-sheet — reused by the pipeline, table and klassenindeler.
 *  When `schooljaarId` is provided (Klassenindeler) a Financiën-sectie is shown. */
export function EnrollmentSheet({ item, onClose, schooljaarId, placement }: {
  item: Enrollment; onClose: () => void; schooljaarId?: string | null; placement?: Placement | null;
}) {
  const toast = useToast();
  const updateStatus = useUpdateEnrollmentStatus();
  const updateEnrollment = useUpdateEnrollment();
  const updateParent = useUpdateEnrollmentParent();
  const del = useDeleteEnrollments();
  const upsert = useUpsertPlacement();
  const { data: tiers } = useTuitionTiers(schooljaarId ?? null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => initForm(item));
  const [parents, setParents] = useState<ParentForm[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (editing ? setEditing(false) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const startEdit = () => {
    setForm(initForm(item));
    setParents((item.enrollment_parents ?? []).map((p) => ({
      id: p.id, name: p.name ?? "", role: p.role ?? "", phone: p.phone ?? "", email: p.email ?? "", is_primary: p.is_primary,
    })));
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await updateEnrollment.mutateAsync({
        id: item.id,
        patch: {
          child_name: form.child_name.trim(),
          age: form.age === "" ? null : parseInt(form.age) || null,
          gender: form.gender || null,
          track: form.track,
          birthdate: form.birthdate || null,
          preferred_lesday: form.preferred_lesday || null,
          target_class: form.target_class || null,
          address: form.address || null,
          notes: form.notes || null,
        },
      });
      for (const p of parents) {
        await updateParent.mutateAsync({ id: p.id, patch: { name: p.name, role: p.role, phone: p.phone, email: p.email, is_primary: p.is_primary } });
      }
      toast("Inschrijving bijgewerkt");
      setEditing(false);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const onDelete = () => {
    if (!confirm(`Inschrijving van ${item.child_name} definitief verwijderen? Dit verwijdert ook de gekoppelde ouders en plaatsing.`)) return;
    del.mutate([item.id], { onSuccess: () => { toast("Inschrijving verwijderd"); onClose(); }, onError: () => toast("Verwijderen mislukt") });
  };

  // ---- Financiën (alleen met schooljaar-context) ----
  const staffelDefault = useMemo(() => {
    const first = (tiers ?? []).filter((t) => t.track === item.track).sort((a, b) => a.rang - b.rang)[0];
    return first ? Number(first.bedrag) : 0;
  }, [tiers, item.track]);
  const overridden = placement?.lesgeld_verschuldigd != null;
  const teBetalen = overridden ? Number(placement!.lesgeld_verschuldigd) : staffelDefault;
  const betaald = placement?.lesgeld_bedrag != null ? Number(placement.lesgeld_bedrag) : 0;
  const openstaand = teBetalen - betaald;
  const afgerond = teBetalen > 0 && betaald >= teBetalen;

  const patchPlacement = (p: { lesgeld_bedrag?: number | null; lesgeld_verschuldigd?: number | null }) => {
    if (!schooljaarId) return;
    upsert.mutate({ enrollment_id: item.id, schooljaar_id: schooljaarId, ...p }, { onError: () => toast("Opslaan mislukt") });
  };
  const onTeBetalenBlur = (raw: string) => {
    const v = raw.trim();
    const num = v === "" ? null : parseFloat(v);
    if (num !== null && Number.isNaN(num)) return;
    const next = num === null || num === staffelDefault ? null : num; // gelijk aan staffel → geen override
    if (next !== (placement?.lesgeld_verschuldigd ?? null)) patchPlacement({ lesgeld_verschuldigd: next });
  };
  const onBetaaldBlur = (raw: string) => {
    const v = raw.trim();
    const num = v === "" ? null : parseFloat(v);
    if (num !== null && Number.isNaN(num)) return;
    if (num !== (placement?.lesgeld_bedrag ?? null)) patchPlacement({ lesgeld_bedrag: num });
  };

  const settable = ENROLL_STATUSES.filter((s) => s !== "definitief");
  const setStatus = (s: string) => updateStatus.mutate({ id: item.id, status: s }, { onSuccess: () => toast(`${item.child_name} → ${STATUS_TITLE[s] ?? s}`) });

  const info: [string, string | null][] = [
    ["Leeftijd", item.age != null ? `${item.age} jaar` : null],
    ["Geboortedatum", item.birthdate],
    ["Geslacht", item.gender === "f" ? "Meisje" : item.gender === "m" ? "Jongen" : null],
    ["Traject", item.track === "hifdh" ? "Hifdh" : "Regulier"],
    ["Voorkeur lesdag", item.preferred_lesday],
    ["Voorkeursklas", item.target_class],
    ["Adres", item.address],
    ["Ingediend", item.submitted_label],
  ];

  const lbl = { fontSize: 11, color: "var(--fg-subtle)", display: "block", marginBottom: 4 } as const;

  return (
    <div className="sheet-overlay" onClick={() => (editing ? null : onClose())}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 24 }}>
          <div className="flex justify-between items-start mb-4">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-xs text-subtle mb-1 flex items-center gap-2">
                Aanmelding
                <Badge kind={item.track === "hifdh" ? "primary" : "info"} dot>{item.track === "hifdh" ? "Hifdh-traject" : "Regulier traject"}</Badge>
                <Badge>{STATUS_TITLE[item.status] ?? item.status}</Badge>
              </div>
              {editing
                ? <input className="input" value={form.child_name} onChange={(e) => setForm((f) => ({ ...f, child_name: e.target.value }))} style={{ fontSize: 18, fontWeight: 600 }} />
                : <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>{item.child_name}</h2>}
            </div>
            <div className="flex items-center gap-1">
              {!editing && <button className="btn ghost sm" onClick={startEdit} title="Bewerken"><Icon name="edit" size={14} /></button>}
              <button className="btn ghost sm" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={14} /></button>
            </div>
          </div>

          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div><label style={lbl}>Leeftijd</label><input className="input" type="number" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} /></div>
              <div><label style={lbl}>Geboortedatum</label><input className="input" type="date" value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} /></div>
              <div><label style={lbl}>Geslacht</label><Select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}><option value="">—</option><option value="m">Jongen</option><option value="f">Meisje</option></Select></div>
              <div><label style={lbl}>Traject</label><Select value={form.track} onChange={(e) => setForm((f) => ({ ...f, track: e.target.value }))}><option value="regulier">Regulier</option><option value="hifdh">Hifdh</option></Select></div>
              <div><label style={lbl}>Voorkeur lesdag</label><input className="input" value={form.preferred_lesday} onChange={(e) => setForm((f) => ({ ...f, preferred_lesday: e.target.value }))} /></div>
              <div><label style={lbl}>Voorkeursklas</label><input className="input" value={form.target_class} onChange={(e) => setForm((f) => ({ ...f, target_class: e.target.value }))} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Adres</label><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Opmerkingen</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs text-subtle">{k}</div>
                  <div className="text-sm font-semibold">{v}</div>
                </div>
              ))}
            </div>
          )}

          {!editing && item.notes && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-xs text-subtle mb-1 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Opmerkingen</div>
              <div className="text-sm" style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: 8 }}>{item.notes}</div>
            </div>
          )}

          {!editing && item.rejection_reason && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-sm" style={{ padding: "10px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8 }}>{item.rejection_reason}</div>
            </div>
          )}

          {/* ---- Financiën ---- */}
          {schooljaarId && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Financiën</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Te betalen {overridden ? "(handmatig)" : "(staffel)"}</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)", fontSize: 13 }}>€</span>
                    <input key={`tb:${teBetalen}:${overridden}`} className="input" type="number" min={0} step={10} defaultValue={teBetalen} onBlur={(e) => onTeBetalenBlur(e.target.value)} style={{ paddingLeft: 20, fontFamily: "var(--mono)" }} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Betaald</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)", fontSize: 13 }}>€</span>
                    <input key={`bt:${betaald}`} className="input" type="number" min={0} step={10} defaultValue={placement?.lesgeld_bedrag ?? ""} placeholder="0" onBlur={(e) => onBetaaldBlur(e.target.value)} style={{ paddingLeft: 20, fontFamily: "var(--mono)" }} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-subtle">Verschuldigd (openstaand)</div>
                  <div className="text-sm font-semibold num" style={{ color: openstaand > 0 ? "var(--danger)" : "var(--success)" }}>{EUR(openstaand)}</div>
                </div>
                <div>
                  <div className="text-xs text-subtle">Status betaling</div>
                  {afgerond ? <Badge kind="success" dot>Volledig voldaan</Badge> : <Badge kind="warn" dot>{betaald > 0 ? "Deels betaald" : "Open"}</Badge>}
                </div>
              </div>
            </div>
          )}

          {/* ---- Ouders / voogden ---- */}
          <div style={{ marginBottom: 20 }}>
            <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Ouders / voogden</div>
            <div className="flex-col gap-3">
              {editing ? parents.map((p, i) => (
                <div key={p.id} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={lbl}>Naam</label><input className="input" value={p.name} onChange={(e) => setParents((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
                    <div><label style={lbl}>Rol</label><input className="input" value={p.role} onChange={(e) => setParents((ps) => ps.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} /></div>
                    <div><label style={lbl}>Telefoon</label><input className="input" value={p.phone} onChange={(e) => setParents((ps) => ps.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} /></div>
                    <div><label style={lbl}>E-mail</label><input className="input" value={p.email} onChange={(e) => setParents((ps) => ps.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-xs mt-2" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={p.is_primary} onChange={(e) => setParents((ps) => ps.map((x, j) => j === i ? { ...x, is_primary: e.target.checked } : x))} /> Primair contact
                  </label>
                </div>
              )) : (item.enrollment_parents ?? []).map((p) => (
                <div key={p.id} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar name={p.name ?? "?"} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2"><span className="font-semibold">{p.name}</span>{p.is_primary && <Badge kind="primary">Primair</Badge>}</div>
                      <div className="text-xs text-subtle">{p.role}</div>
                    </div>
                  </div>
                  <div className="flex-col gap-1 text-xs text-muted">
                    <div className="flex items-center gap-2"><Icon name="phone" size={11} /><span className="font-mono">{p.phone}</span></div>
                    <div className="flex items-center gap-2"><Icon name="mail" size={11} /><span>{p.email}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editing ? (
            <div className="flex gap-2" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <Btn kind="primary" icon="check" disabled={updateEnrollment.isPending || !form.child_name.trim()} onClick={saveEdit}>Opslaan</Btn>
              <Btn kind="ghost" onClick={() => setEditing(false)}>Annuleren</Btn>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Status wijzigen</div>
                <div className="flex gap-2" style={{ flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  {settable.map((s) => (
                    <Btn key={s} kind={item.status === s ? (s === "afgewezen" ? "danger" : "primary") : "default"}
                      icon={s === "afgewezen" ? "x" : undefined} disabled={item.status === s || updateStatus.isPending} onClick={() => setStatus(s)}>
                      {STATUS_TITLE[s]}
                    </Btn>
                  ))}
                </div>
                {!schooljaarId && <div className="text-xs text-subtle mt-3">Definitief inschrijven gaat via de <b>Klassenindeler</b> (klas + niveau vereist).</div>}
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <Btn kind="danger" icon="trash" disabled={del.isPending} onClick={onDelete}>Inschrijving verwijderen</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
