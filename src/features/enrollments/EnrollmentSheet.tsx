import { useEffect, useMemo } from "react";
import { Badge, Btn, Icon, Select, EUR } from "@/components/ui";
import { useToast } from "@/components/chrome/Toast";
import {
  useUpdateEnrollmentStatus, useUpdateEnrollment, useUpdateEnrollmentParent,
  useDeleteEnrollments, useUpsertPlacement, ENROLL_STATUSES,
  type Enrollment, type Placement,
} from "@/data/enrollments";
import type { Tables } from "@/types/database";
import { useTuitionTiers } from "@/data/tuition";
import { ENROLL_COLUMNS } from "@/data/dashboard";

const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));
const lbl = { fontSize: 11, color: "var(--fg-subtle)", display: "block", marginBottom: 4 } as const;

/** Self-contained enrollment detail side-sheet — reused by the pipeline, table and klassenindeler.
 *  All fields edit inline and auto-save on blur/change. When `schooljaarId` is given a
 *  Financiën-sectie verschijnt (te betalen / betaald / verschuldigd). */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-save helpers — alleen schrijven als de waarde echt veranderde.
  const save = (patch: Partial<Tables<"enrollments">>) => updateEnrollment.mutate({ id: item.id, patch }, { onError: () => toast("Opslaan mislukt") });
  const saveText = (field: keyof Tables<"enrollments">, raw: string, { nullable = true } = {}) => {
    const v = raw.trim();
    if ((((item[field] as string | null) ?? "") as string) === v) return;
    if (!v && !nullable) return;
    save({ [field]: v || (nullable ? null : v) } as Partial<Tables<"enrollments">>);
  };
  const saveParent = (id: string, patch: Partial<Tables<"enrollment_parents">>) => updateParent.mutate({ id, patch }, { onError: () => toast("Opslaan mislukt") });

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

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 24 }}>
          <div className="flex justify-between items-start mb-4">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-xs text-subtle mb-1 flex items-center gap-2">
                Aanmelding
                <Badge kind={item.track === "hifdh" ? "primary" : "info"} dot>{item.track === "hifdh" ? "Hifdh-traject" : "Regulier traject"}</Badge>
                <Badge>{STATUS_TITLE[item.status] ?? item.status}</Badge>
              </div>
              <input className="input" defaultValue={item.child_name} onBlur={(e) => saveText("child_name", e.target.value, { nullable: false })} style={{ fontSize: 18, fontWeight: 600 }} />
            </div>
            <button className="btn ghost sm" onClick={onClose} aria-label="Sluiten" style={{ marginLeft: 8 }}><Icon name="x" size={14} /></button>
          </div>

          {/* ---- Gegevens (inline bewerkbaar) ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div><label style={lbl}>Leeftijd</label><input className="input" type="number" defaultValue={item.age ?? ""} onBlur={(e) => { const v = e.target.value.trim(); const n = v === "" ? null : parseInt(v) || null; if (n !== item.age) save({ age: n }); }} /></div>
            <div><label style={lbl}>Geboortedatum</label><input className="input" type="date" defaultValue={item.birthdate ?? ""} onBlur={(e) => saveText("birthdate", e.target.value)} /></div>
            <div><label style={lbl}>Geslacht</label><Select defaultValue={item.gender ?? ""} onChange={(e) => save({ gender: e.target.value || null })}><option value="">—</option><option value="m">Jongen</option><option value="f">Meisje</option></Select></div>
            <div><label style={lbl}>Traject</label><Select defaultValue={item.track ?? "regulier"} onChange={(e) => save({ track: e.target.value })}><option value="regulier">Regulier</option><option value="hifdh">Hifdh</option></Select></div>
            <div><label style={lbl}>Voorkeur lesdag</label><input className="input" defaultValue={item.preferred_lesday ?? ""} onBlur={(e) => saveText("preferred_lesday", e.target.value)} /></div>
            <div><label style={lbl}>Voorkeursklas</label><input className="input" defaultValue={item.target_class ?? ""} onBlur={(e) => saveText("target_class", e.target.value)} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Adres</label><input className="input" defaultValue={item.address ?? ""} onBlur={(e) => saveText("address", e.target.value)} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Opmerkingen</label><textarea className="textarea" rows={2} defaultValue={item.notes ?? ""} onBlur={(e) => saveText("notes", e.target.value)} /></div>
          </div>

          {item.rejection_reason && (
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

          {/* ---- Ouders / voogden (inline bewerkbaar) ---- */}
          <div style={{ marginBottom: 20 }}>
            <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Ouders / voogden</div>
            <div className="flex-col gap-3">
              {(item.enrollment_parents ?? []).map((p) => (
                <div key={p.id} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={lbl}>Naam</label><input className="input" defaultValue={p.name ?? ""} onBlur={(e) => { if ((p.name ?? "") !== e.target.value) saveParent(p.id, { name: e.target.value }); }} /></div>
                    <div><label style={lbl}>Rol</label><input className="input" defaultValue={p.role ?? ""} onBlur={(e) => { if ((p.role ?? "") !== e.target.value) saveParent(p.id, { role: e.target.value }); }} /></div>
                    <div><label style={lbl}>Telefoon</label><input className="input" defaultValue={p.phone ?? ""} onBlur={(e) => { if ((p.phone ?? "") !== e.target.value) saveParent(p.id, { phone: e.target.value }); }} /></div>
                    <div><label style={lbl}>E-mail</label><input className="input" defaultValue={p.email ?? ""} onBlur={(e) => { if ((p.email ?? "") !== e.target.value) saveParent(p.id, { email: e.target.value }); }} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-xs mt-2" style={{ cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked={p.is_primary} onChange={(e) => saveParent(p.id, { is_primary: e.target.checked })} /> Primair contact
                  </label>
                </div>
              ))}
              {(item.enrollment_parents ?? []).length === 0 && <div className="text-xs text-subtle">Geen ouders gekoppeld.</div>}
            </div>
          </div>

          {/* ---- Status ---- */}
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

          {/* ---- Verwijderen ---- */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <Btn kind="danger" icon="trash" disabled={del.isPending} onClick={onDelete}>Inschrijving verwijderen</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
