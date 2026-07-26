import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Section, Card, Badge, Icon, Avatar, Btn, EUR, type BadgeKind } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useTeacherDetail } from "@/data/people";
import { TeacherFormModal } from "./TeacherFormModal";

const ROLE_LABEL: Record<string, { label: string; kind: BadgeKind }> = {
  les: { label: "Lesdocent", kind: "info" },
  quran: { label: "Qur'an-docent", kind: "accent" },
  both: { label: "Les & Qur'an", kind: "primary" },
  inval: { label: "Invaldocent", kind: "warn" },
};
const TASK_ROLE: Record<string, { label: string; kind: BadgeKind }> = {
  les: { label: "Les", kind: "info" },
  quran: { label: "Qur'an", kind: "accent" },
  both: { label: "Les & Qur'an", kind: "primary" },
};
const TYPE_LABEL: Record<string, string> = { les: "Les", vrij: "Vrij", toets: "Toets", activiteit: "Activiteit" };

const fmtHours = (h: number) => (h > 0 ? h.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + " u" : "—");
const fmtRate = (n: number | null | undefined) =>
  n == null ? "—" : "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "/u";
const ddmmyyyy = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

export function TeacherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useTeacherDetail(id);
  const [editing, setEditing] = useState(false);

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading label="Docent laden…" />;

  const { teacher: t, classes, lessons, perYear } = data;
  const role = ROLE_LABEL[t.role] ?? ROLE_LABEL.les;
  const noRate = t.uurtarief == null;

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/teachers")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {t.name}
        </span>
      }
      sub={`${role.label}${t.short ? " · " + t.short : ""}`}
      actions={<Btn icon="edit" kind="ghost" onClick={() => setEditing(true)}>Bewerken</Btn>}
    >
      <div className="detail-hero">
        <Avatar name={t.name} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-3" style={{ flexWrap: "wrap" }}>
            <Badge kind={role.kind}>{role.label}</Badge>
            {noRate
              ? <Badge kind="warn" dot>Uurtarief onbekend</Badge>
              : <Badge kind="success" dot>{fmtRate(t.uurtarief)}</Badge>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 24 }}>
            <div><div className="text-xs text-subtle">Uurtarief</div><div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{fmtRate(t.uurtarief)}</div></div>
            <div><div className="text-xs text-subtle">Telefoon</div><div className="font-mono" style={{ fontSize: 15, fontWeight: 500 }}>{t.phone ?? "—"}</div></div>
            <div><div className="text-xs text-subtle">E-mail</div><div style={{ fontSize: 14, fontWeight: 500 }}>{t.email ?? "—"}</div></div>
            <div><div className="text-xs text-subtle">Specialiteit</div><div style={{ fontSize: 14, fontWeight: 500 }}>{t.specialty ?? "—"}</div></div>
          </div>
        </div>
      </div>

      <Card title={<><Icon name="coins" size={14} /> Begrote kosten per schooljaar</>} sub="O.b.v. ingeplande lessen × uurtarief (lesduur uit het tijdvak van de klas)">
        {perYear.length === 0 ? <div className="empty">Nog niet ingepland.</div> : (
          <table className="table">
            <thead><tr><th>Schooljaar</th><th style={{ textAlign: "right" }}>Lessen</th><th style={{ textAlign: "right" }}>Uren</th><th style={{ textAlign: "right" }}>Kosten</th></tr></thead>
            <tbody>
              {perYear.map((y) => (
                <tr key={y.schooljaarName}>
                  <td className="font-semibold">{y.schooljaarName}</td>
                  <td className="num" style={{ textAlign: "right" }}>{y.lessons}</td>
                  <td className="num" style={{ textAlign: "right" }}>{fmtHours(y.hours)}</td>
                  <td className="num font-semibold" style={{ textAlign: "right" }}>{noRate ? "—" : EUR(y.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {noRate && perYear.length > 0 && <div className="text-xs text-subtle mt-2">Stel een uurtarief in om de kosten te begroten.</div>}
      </Card>

      <div className="grid-2">
        <Card title={<><Icon name="school" size={14} /> Klassen (historie)</>} sub={`${classes.length} ${classes.length === 1 ? "klas" : "klassen"} over alle schooljaren`}>
          {classes.length === 0 ? <div className="empty">Niet ingedeeld bij een klas.</div> : (
            <div className="flex-col gap-2">
              {classes.map((c) => {
                const tr = TASK_ROLE[c.role] ?? TASK_ROLE.les;
                return (
                  <div key={c.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/classes/" + c.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-semibold">{c.code} {c.track === "hifdh" && <Badge kind="primary">H</Badge>}</div>
                      <div className="text-xs text-subtle">{c.schooljaarName}{c.day ? " · " + c.day : ""}{c.time ? " · " + c.time : ""}</div>
                    </div>
                    <Badge kind={tr.kind}>{tr.label}</Badge>
                    <Icon name="chevronRight" size={14} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={<><Icon name="calendar" size={14} /> Ingeplande lessen</>} sub={`${lessons.length} ${lessons.length === 1 ? "les" : "lessen"} (excl. vrij)`}>
          {lessons.length === 0 ? <div className="empty">Geen lessen ingepland.</div> : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="table">
                <thead><tr><th>Datum</th><th>Klas</th><th>Type</th><th>Rol</th><th style={{ textAlign: "right" }}>Uren</th><th style={{ textAlign: "right" }}>Kosten</th></tr></thead>
                <tbody>
                  {lessons.map((l) => {
                    const tr = TASK_ROLE[l.role] ?? TASK_ROLE.les;
                    return (
                      <tr key={l.id}>
                        <td className="font-mono text-sm">{ddmmyyyy(l.date)}{l.week_nr != null && <span className="text-subtle"> · wk {l.week_nr}</span>}</td>
                        <td className="text-sm font-semibold">{l.classCode}</td>
                        <td className="text-sm">{TYPE_LABEL[l.type] ?? l.type}</td>
                        <td><Badge kind={tr.kind}>{tr.label}</Badge></td>
                        <td className="num text-sm" style={{ textAlign: "right" }}>{fmtHours(l.hours)}</td>
                        <td className="num text-sm font-semibold" style={{ textAlign: "right" }}>{noRate ? "—" : EUR(l.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editing && <TeacherFormModal initial={t} onClose={() => setEditing(false)} />}
    </Section>
  );
}
