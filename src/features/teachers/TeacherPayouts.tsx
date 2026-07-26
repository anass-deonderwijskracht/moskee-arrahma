import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Badge, Btn, Icon, Select, MultiSelect, Toggle, Avatar, Stat } from "@/components/ui";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useSchooljaren } from "@/data/schooljaren";
import {
  usePayoutOverview, useSetTeacherPayout, rowAmount, monthShort,
  type PayoutMonth, type PayoutRow, type SetPayoutInput,
} from "@/data/payouts";

const money = (n: number) => "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (h: number) => h.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + " u";
const rateOf = (n: number | null) => (n == null ? "—" : "€" + n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + "/u");
const dayMonth = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

/** Uitbetalen-view: per maand afvinken welke docent is betaald, met terugkijk-historie. */
export function TeacherPayouts() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: schooljaren } = useSchooljaren();
  const setPayout = useSetTeacherPayout();

  // Ook gearchiveerde jaren: juist díe wil je kunnen terugkijken. Nieuwste eerst.
  const years = useMemo(
    () => [...(schooljaren ?? [])].sort((a, b) => b.code.localeCompare(a.code)),
    [schooljaren],
  );
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? years.find((s) => s.is_current)?.id ?? years[0]?.id ?? null;

  const { data, isLoading, isError, error } = usePayoutOverview(effectiveSj);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [openOnly, setOpenOnly] = useState(false);

  const monthKeys = useMemo(() => (data?.months ?? []).map((m) => m.key), [data]);

  // Bij wisselen van schooljaar opnieuw bepalen welke maanden open staan.
  useEffect(() => { setPicked(null); }, [effectiveSj]);
  useEffect(() => {
    if (picked !== null || monthKeys.length === 0) return;
    const thisMonth = new Date().toISOString().slice(0, 7);
    setPicked(monthKeys.includes(thisMonth) ? [thisMonth] : monthKeys);
  }, [picked, monthKeys]);

  const shown: PayoutMonth[] = useMemo(() => {
    const chosen = new Set(picked ?? monthKeys);
    const sel = (data?.months ?? []).filter((m) => chosen.has(m.key));
    if (!openOnly) return sel;
    return sel.map((m) => ({ ...m, rows: m.rows.filter((r) => !r.payout) })).filter((m) => m.rows.length > 0);
  }, [data, picked, monthKeys, openOnly]);

  const visibleRows = shown.flatMap((m) => m.rows);
  const paidTotal = visibleRows.filter((r) => r.payout).reduce((a, r) => a + rowAmount(r), 0);
  const openRows = visibleRows.filter((r) => !r.payout);
  const openTotal = openRows.reduce((a, r) => a + r.amount, 0);

  const inputFor = (m: PayoutMonth, r: PayoutRow, paid: boolean): SetPayoutInput => ({
    paid, payoutId: r.payout?.id ?? null, teacher_id: r.teacher.id, schooljaar_id: effectiveSj!,
    month: m.key, lessons: r.lessons, hours: r.hours, rate: r.rate, amount: r.amount,
  });

  const toggleRow = (m: PayoutMonth, r: PayoutRow) => {
    const paid = !r.payout;
    setPayout.mutate(inputFor(m, r, paid), {
      onSuccess: () => toast(`${r.teacher.name} · ${m.label} → ${paid ? "uitbetaald" : "weer openstaand"}`),
      onError: () => toast("Opslaan mislukt"),
    });
  };

  const payAll = (m: PayoutMonth) => {
    const open = m.rows.filter((r) => !r.payout);
    if (!open.length) return;
    if (!confirm(`${open.length} docent(en) markeren als uitbetaald voor ${m.label}? Totaal ${money(open.reduce((a, r) => a + r.amount, 0))}.`)) return;
    setPayout.mutate(open.map((r) => inputFor(m, r, true)), {
      onSuccess: () => toast(`${m.label}: ${open.length} uitbetaling(en) vastgelegd`),
      onError: () => toast("Opslaan mislukt"),
    });
  };

  if (isError) return <ErrorState error={error} />;

  return (
    <div className="flex-col gap-4">
      <Card>
        <div className="flex items-end justify-between" style={{ flexWrap: "wrap", gap: 16 }}>
          <div className="flex items-end gap-3" style={{ flexWrap: "wrap" }}>
            <div>
              <div className="text-xs text-subtle font-semibold mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Schooljaar</div>
              <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: "auto", minWidth: 190, fontWeight: 600 }}>
                {years.map((s) => (
                  <option key={s.id} value={s.id}>
                    Schooljaar {s.name}{s.is_current ? " (huidig)" : s.archived ? " (archief)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-xs text-subtle font-semibold mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Maanden</div>
              <MultiSelect
                value={picked ?? []}
                onChange={setPicked}
                options={monthKeys.map((k) => ({ value: k, label: monthShort(k) }))}
                allLabel="Alle maanden"
                placeholder="Kies maanden…"
                emptyLabel="Geen planning"
                width={230}
              />
            </div>
            <div style={{ paddingBottom: 8 }}>
              <Toggle checked={openOnly} onChange={setOpenOnly} label="Toon alleen openstaande uitbetalingen"
                title="Verbergt docenten en maanden die al zijn afgevinkt" />
            </div>
          </div>
        </div>
      </Card>

      <div className="stat-grid">
        <Stat icon="clock" label="Ingeplande uren" value={hrs(visibleRows.reduce((a, r) => a + (r.payout ? Number(r.payout.hours) : r.hours), 0))}
          sub={`${shown.length} ${shown.length === 1 ? "maand" : "maanden"} in beeld`} />
        <Stat icon="coins" label="Totaal" value={money(paidTotal + openTotal)} sub="Uitbetaald + openstaand" />
        <Stat icon="check" label="Uitbetaald" value={money(paidTotal)} sub={`${visibleRows.length - openRows.length} van ${visibleRows.length} regels`} />
        <Stat icon="flag" label="Openstaand" value={money(openTotal)} sub={openRows.length ? `${openRows.length} nog af te vinken` : "Alles afgevinkt"} />
      </div>

      {isLoading ? <Loading label="Uitbetalingen laden…" /> : monthKeys.length === 0 ? (
        <Card><div className="empty">Geen ingeplande lessen in dit schooljaar.</div></Card>
      ) : shown.length === 0 ? (
        <Card><div className="empty">{openOnly ? "Geen openstaande uitbetalingen — alles is afgevinkt." : "Kies één of meer maanden."}</div></Card>
      ) : (
        shown.map((m) => {
          const open = m.rows.filter((r) => !r.payout);
          return (
            <Card key={m.key}
              title={<><Icon name="calendar" size={14} /> {m.label}</>}
              sub={`${m.rows.length} ${m.rows.length === 1 ? "docent" : "docenten"} · ${hrs(m.hours)} · ${money(m.total)}${open.length ? ` · ${money(m.openTotal)} openstaand` : ""}`}
              action={open.length > 0
                ? <Btn size="sm" icon="check" disabled={setPayout.isPending} onClick={() => payAll(m)}>Alles uitbetalen</Btn>
                : <Badge kind="success" dot>Volledig uitbetaald</Badge>}
            >
              <table className="table">
                <thead><tr>
                  <th>Docent</th>
                  <th style={{ textAlign: "right" }}>Lessen</th>
                  <th style={{ textAlign: "right" }}>Uren</th>
                  <th style={{ textAlign: "right" }}>Uurtarief</th>
                  <th style={{ textAlign: "right" }}>Bedrag</th>
                  <th style={{ width: 200 }}>Uitbetaald</th>
                </tr></thead>
                <tbody>
                  {m.rows.map((r) => {
                    const paid = !!r.payout;
                    const hours = paid ? Number(r.payout!.hours) : r.hours;
                    const lessons = paid ? r.payout!.lessons : r.lessons;
                    const rate = paid ? (r.payout!.rate == null ? null : Number(r.payout!.rate)) : r.rate;
                    return (
                      <tr key={r.teacher.id} style={{ background: paid ? "var(--success-soft)" : undefined }}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={r.teacher.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <button className="font-semibold" style={{ cursor: "pointer", textAlign: "left" }}
                                onClick={() => navigate("/teachers/" + r.teacher.id)} title="Open docent">
                                {r.teacher.name}
                              </button>
                              <div className="flex items-center gap-2">
                                {r.rate == null && <Badge kind="warn">Tarief onbekend</Badge>}
                                {r.drifted && <Badge kind="info" dot>Planning gewijzigd na uitbetaling</Badge>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num text-sm" style={{ textAlign: "right" }}>{lessons}</td>
                        <td className="num text-sm" style={{ textAlign: "right" }}>{hrs(hours)}</td>
                        <td className="num text-sm" style={{ textAlign: "right" }}>{rateOf(rate)}</td>
                        <td className="num font-semibold" style={{ textAlign: "right" }}>{money(paid ? Number(r.payout!.amount) : r.amount)}</td>
                        <td>
                          <label className="flex items-start gap-2" style={{ cursor: "pointer" }}>
                            <input type="checkbox" checked={paid} disabled={setPayout.isPending} onChange={() => toggleRow(m, r)} style={{ marginTop: 3 }} />
                            {paid ? (
                              <span style={{ minWidth: 0 }}>
                                <span className="text-xs" style={{ color: "var(--success)", fontWeight: 600, display: "block" }}>
                                  Betaald · {dayMonth(r.payout!.paid_at)}
                                </span>
                                <span className="text-xs text-subtle">door {r.payout!.paid_by_name ?? "onbekend"}</span>
                              </span>
                            ) : <span className="text-xs text-subtle">Openstaand</span>}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {m.rows.some((r) => r.drifted) && (
                <div className="text-xs text-subtle mt-2">
                  Bij "planning gewijzigd" toont de rij het bedrag zoals het is uitbetaald, niet de huidige planning.
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
