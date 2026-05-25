import { useEffect } from "react";
import { Avatar, Badge, Btn, Icon } from "@/components/ui";
import { useToast } from "@/components/chrome/Toast";
import { useUpdateEnrollmentStatus, ENROLL_STATUSES, type Enrollment } from "@/data/enrollments";
import { ENROLL_COLUMNS } from "@/data/dashboard";

const STATUS_TITLE: Record<string, string> = Object.fromEntries(ENROLL_COLUMNS.map((c) => [c.id, c.title]));

/** Self-contained enrollment detail side-sheet — reused by the pipeline, table and klassenindeler. */
export function EnrollmentSheet({ item, onClose }: { item: Enrollment; onClose: () => void }) {
  const toast = useToast();
  const updateStatus = useUpdateEnrollmentStatus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 24 }}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs text-subtle mb-1 flex items-center gap-2">
                Aanmelding
                <Badge kind={item.track === "hifdh" ? "primary" : "info"} dot>{item.track === "hifdh" ? "Hifdh-traject" : "Regulier traject"}</Badge>
                <Badge>{STATUS_TITLE[item.status] ?? item.status}</Badge>
              </div>
              <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>{item.child_name}</h2>
            </div>
            <button className="btn ghost sm" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={14} /></button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {info.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-subtle">{k}</div>
                <div className="text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>

          {item.notes && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-xs text-subtle mb-1 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Opmerkingen</div>
              <div className="text-sm" style={{ padding: "10px 12px", background: "var(--bg-sunken)", borderRadius: 8 }}>{item.notes}</div>
            </div>
          )}

          {item.rejection_reason && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-sm" style={{ padding: "10px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8 }}>{item.rejection_reason}</div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Ouders / voogden</div>
            <div className="flex-col gap-3">
              {(item.enrollment_parents ?? []).map((p) => (
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

          <div>
            <div className="text-xs text-subtle mb-2 font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Status wijzigen</div>
            <div className="flex gap-2" style={{ flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              {settable.map((s) => (
                <Btn key={s} kind={item.status === s ? (s === "afgewezen" ? "danger" : "primary") : "default"}
                  icon={s === "afgewezen" ? "x" : undefined} disabled={item.status === s || updateStatus.isPending} onClick={() => setStatus(s)}>
                  {STATUS_TITLE[s]}
                </Btn>
              ))}
            </div>
            <div className="text-xs text-subtle mt-3">Definitief inschrijven gaat via de <b>Klassenindeler</b> (klas + niveau vereist).</div>
          </div>
        </div>
      </div>
    </div>
  );
}
