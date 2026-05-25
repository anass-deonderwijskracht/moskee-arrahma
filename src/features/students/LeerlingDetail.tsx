import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Section, Tabs, Card, Stat, Badge, Btn, Icon, Avatar, QBar, Select, EUR, pct, type Option, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { LineChart, type LinePoint } from "@/components/ui/LineChart";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useLeerlingDetail, useAddPayment } from "@/data/leerlingDetail";
import { useSurahs, dateNL } from "@/data/classDetail";

type Tab = "quran" | "attendance" | "tests" | "notes" | "info";
const currentYear = new Date().getFullYear();
const evalColor = (e: string | null) => e === "yes" ? "var(--success)" : e === "partial" ? "var(--warn)" : e === "no" ? "var(--danger)" : "var(--border-strong)";
const evalGlyph = (e: string | null, absent: boolean) => absent ? "—" : e === "yes" ? "✓" : e === "partial" ? "◐" : e === "no" ? "✗" : "·";

export function LeerlingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useLeerlingDetail(id);
  const [tab, setTab] = useState<Tab>("quran");

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading label="Leerling laden…" />;

  const { leerling: l, metrics: m, kinderen } = { leerling: data.leerling, metrics: data.metrics, kinderen: data.leerling.kinderen };
  const age = kinderen?.birth_year ? currentYear - kinderen.birth_year : null;

  const tabs: Option<Tab>[] = [
    { value: "quran", label: "Qur'an-voortgang" },
    { value: "attendance", label: "Aanwezigheid" },
    { value: "tests", label: "Toetsen" },
    { value: "notes", label: "Notities" },
    { value: "info", label: "Algemene info" },
  ];

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/students")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {kinderen?.full_name}
        </span>
      }
      sub={`${l.classes?.code ?? "—"} · ${l.classes?.teachers?.short ?? "—"} · ${l.leerlingnummer ?? ""}`}
      actions={kinderen && <Btn icon="users" kind="ghost" onClick={() => navigate("/kinderen/" + kinderen.id)}>Volledige kind-historie →</Btn>}
    >
      <div className="detail-hero">
        <Avatar name={kinderen?.full_name} initials={kinderen?.initials ?? undefined} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-2" style={{ flexWrap: "wrap" }}>
            <Badge kind={(l.classes?.color as BadgeKind) ?? "primary"}>{l.classes?.code}</Badge>
            <Badge>{age != null ? age + " jaar" : ""} · {kinderen?.gender === "f" ? "♀" : "♂"}</Badge>
            <Badge>{l.schooljaren?.name}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 24, marginTop: 16 }}>
            {[
              ["Aanwezigheid", pct(m?.attendance_pct), (m?.attendance_pct ?? 0) * 100, 100, "Uit les-administratie"],
              ["Arabisch huiswerk", pct(m?.arabic_homework_pct), (m?.arabic_homework_pct ?? 0) * 100, 100, "Uit les-administratie"],
              ["Qur'an geleerd", pct(m?.quran_learned_pct), (m?.quran_learned_pct ?? 0) * 100, 100, "Uit Qur'an-administratie"],
              ["Surahs gememoriseerd", `${m?.surahs_known ?? 0} / 38`, m?.surahs_known ?? 0, 38, "Totaal jaaroverstijgend"],
            ].map(([label, val, v, mx, sub]) => (
              <div key={label as string}>
                <div className="text-xs text-subtle">{label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div className="mt-2"><QBar value={v as number} max={mx as number} /></div>
                <div className="text-xs text-subtle mt-1">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} options={tabs} />

      {tab === "quran" && <QuranTab progress={data.progress} assignments={data.assignments} />}
      {tab === "attendance" && <AttendanceTab leerlingId={l.id} attendancePct={m?.attendance_pct ?? null} firstName={kinderen?.first_name ?? ""} />}
      {tab === "tests" && <Card title="Toetsen" sub="Toetsmomenten en beoordelingen"><div className="empty">Nog geen toetsen geregistreerd voor deze leerling.</div></Card>}
      {tab === "notes" && <NotesTab notes={data.notes} />}
      {tab === "info" && <InfoTab detail={data} age={age} />}
    </Section>
  );
}

function QuranTab({ progress, assignments }: { progress: { surah_n: number; status: string }[]; assignments: { surah_n: number; start_ayah: number; end_ayah: number; evaluation: string | null; absent: boolean; lessonDate: string | null }[] }) {
  const { data: surahs } = useSurahs();
  const ordered = useMemo(() => [...(surahs ?? [])].sort((a, b) => b.n - a.n), [surahs]);
  const versesOf = (n: number) => surahs?.find((s) => s.n === n)?.verses ?? 1;
  const nameOf = (n: number) => surahs?.find((s) => s.n === n)?.name ?? "";
  const statusMap = useMemo(() => new Map(progress.map((p) => [p.surah_n, p.status])), [progress]);
  const timeline = assignments.filter((a) => a.lessonDate);
  const knownDone = progress.filter((p) => p.status === "done").length;

  // Cumulative surahs-memorised over time: ends at the current total (knownDone),
  // and steps up on each completion event in the recorded window.
  const linePoints = useMemo<LinePoint[]>(() => {
    const completions = timeline.map((w) => w.evaluation === "yes" && w.end_ayah >= versesOf(w.surah_n));
    const totalCompletions = completions.filter(Boolean).length;
    const baseline = Math.max(0, knownDone - totalCompletions);
    let running = 0;
    return timeline.map((w, i) => {
      if (completions[i]) running++;
      return { label: w.lessonDate ? dateNL(w.lessonDate) : "", value: baseline + running };
    });
  }, [timeline, knownDone]);

  return (
    <div className="flex-col gap-4">
      <Card title="Qur'an-voortgang in de tijd" sub="Aantal gememoriseerde surahs door het seizoen — opgebouwd uit de Qur'an-administratie">
        {timeline.length === 0 ? (
          <div className="empty">Nog geen Qur'an-administratie voor deze leerling.</div>
        ) : (
          <>
            <LineChart points={linePoints} yMax={38} suffix="" color="var(--primary)" valueFormat={(v) => Math.round(v) + " sur."} />
            <div className="flex gap-3 mt-3 text-xs" style={{ flexWrap: "wrap", color: "var(--fg-muted)" }}>
              <span>Per les overhoord:</span>
              {timeline.slice(-12).map((w, i) => (
                <span key={i} title={`${w.lessonDate ? dateNL(w.lessonDate, true) : ""} · Surah ${nameOf(w.surah_n)} ${w.start_ayah}-${w.end_ayah}`}
                  style={{ width: 16, height: 16, borderRadius: 3, background: w.absent ? "var(--bg-sunken)" : evalColor(w.evaluation), border: "1px solid " + (w.absent ? "var(--border)" : evalColor(w.evaluation)), display: "inline-grid", placeItems: "center", fontSize: 10, color: w.absent || !w.evaluation ? "var(--fg-faint)" : "white", fontWeight: 600 }}>
                  {evalGlyph(w.evaluation, w.absent)}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Memorisatie kaart (juz 30)" sub="Memorisatie volgt traditionele volgorde van achter naar voor.">
        <div className="flex gap-3 mb-4" style={{ fontSize: 11, color: "var(--fg-muted)", flexWrap: "wrap" }}>
          <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: "var(--primary)", borderRadius: 2 }} /> Afgerond</span>
          <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 2 }} /> Bezig</span>
          <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 2 }} /> Herhaling</span>
          <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: 2 }} /> Nog niet</span>
        </div>
        <div className="surah-grid">
          {ordered.map((sur) => {
            const st = statusMap.get(sur.n);
            const cls = "surah-cell " + (st === "done" ? "s-done" : st === "progress" ? "s-progress" : st === "review" ? "s-review" : "");
            return (
              <div key={sur.n} className={cls} title={`${sur.n}. ${sur.name} — ${sur.verses} verzen`}>
                <div className="num">{sur.n}</div>
                <div className="nm truncate" style={{ maxWidth: "90%" }}>{sur.name.replace(/^(Al-|An-|At-|Ash-|As-|Az-)/, "")}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function AttendanceTab({ leerlingId, attendancePct, firstName }: { leerlingId: string; attendancePct: number | null; firstName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leerling-attendance", leerlingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status, note, lessons(date, topic)")
        .eq("leerling_id", leerlingId);
      if (error) throw error;
      return ((data ?? []) as unknown as { status: string | null; note: string | null; lessons: { date: string; topic: string | null } | null }[])
        .filter((r) => r.lessons)
        .sort((a, b) => (a.lessons!.date).localeCompare(b.lessons!.date)); // chronological
    },
  });
  const rows = data ?? [];
  const held = rows.filter((r) => r.status && ["A", "L", "Z", "O"].includes(r.status));
  const late = rows.filter((r) => r.status === "L").length;
  const sick = rows.filter((r) => r.status === "Z").length;
  const unexcused = rows.filter((r) => r.status === "O").length;
  const notes = rows.filter((r) => r.note && r.note.trim()).slice().reverse();

  // Running cumulative attendance % over time.
  const points = useMemo<LinePoint[]>(() => {
    let present = 0, total = 0;
    return held.map((r) => {
      total++; if (r.status === "A") present++;
      return { label: dateNL(r.lessons!.date), value: Math.round((present / total) * 100) };
    });
  }, [held]);

  return (
    <div className="flex-col gap-4">
      <div className="grid-2">
        <Card title="Aanwezigheid in de tijd" sub="Cumulatief aanwezigheidspercentage per les">
          {isLoading ? <Loading /> : <LineChart points={points} yMax={100} suffix="%" color="var(--success)" />}
          <div className="grid-3 mt-3" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <div><div className="text-xs text-subtle">Aanwezig</div><div className="text-lg font-semibold tabular">{pct(attendancePct)}</div></div>
            <div><div className="text-xs text-subtle">Te laat</div><div className="text-lg font-semibold tabular">{late}×</div></div>
            <div><div className="text-xs text-subtle">Ziek</div><div className="text-lg font-semibold tabular">{sick}×</div></div>
            <div><div className="text-xs text-subtle">Ongeoorloofd</div><div className="text-lg font-semibold tabular" style={{ color: unexcused ? "var(--danger)" : undefined }}>{unexcused}×</div></div>
          </div>
          <div className="divider mt-4 mb-3" />
          <div className="text-sm text-muted">
            <Icon name="sparkles" size={13} style={{ verticalAlign: "middle", color: "var(--accent)" }} />{" "}
            {(attendancePct ?? 1) >= 0.85 ? <><b>{firstName}</b> heeft een stabiele aanwezigheid.</> : <><b>{firstName}</b> heeft een aandachtspunt qua aanwezigheid.</>}
          </div>
        </Card>

        <Card title="Opmerkingen" sub="Per-les opmerkingen uit de les-administratie">
          {isLoading ? <Loading /> : notes.length === 0 ? <div className="empty">Geen opmerkingen geregistreerd.</div> : (
            <div className="flex-col gap-2" style={{ maxHeight: 360, overflowY: "auto" }}>
              {notes.map((r, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="att-pill" data-status={r.status ?? "-"} style={{ width: 22, height: 22, fontSize: 10 }}>{r.status ?? "-"}</span>
                    <span className="text-xs text-subtle font-mono">{dateNL(r.lessons!.date, true)}</span>
                  </div>
                  <div className="text-sm">{r.note}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function NotesTab({ notes }: { notes: { id: string; author: string | null; body: string | null; created_at: string; lessonDate: string | null; topic: string | null }[] }) {
  return (
    <Card title="Notities" sub="Uit lesnotities van de les-administratie">
      {notes.length === 0 ? <div className="empty">Nog geen lesnotities voor de klas van deze leerling.</div> : (
        <div className="flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} style={{ padding: 14, borderRadius: 10, background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-2 text-xs">
                <Avatar name={n.author ?? "?"} size="sm" />
                <b>{n.author}</b>
                <span className="text-subtle">· {new Date(n.created_at).toLocaleDateString("nl-NL")}{n.topic ? " · " + n.topic : ""}</span>
              </div>
              <div className="text-sm">{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function InfoTab({ detail, age }: { detail: ReturnType<typeof useLeerlingDetail>["data"] & {}; age: number | null }) {
  const toast = useToast();
  const l = detail!.leerling;
  const k = l.kinderen;
  const ouders = detail!.ouders;
  const payments = detail!.payments;
  const paid = payments.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount), 0);
  const open = payments.filter((p) => p.status !== "paid").reduce((a, p) => a + Number(p.amount), 0);
  const addPayment = useAddPayment(l.id);
  const [adding, setAdding] = useState(false);
  const [pf, setPf] = useState({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", status: "paid", method: "iDEAL" });
  const savePayment = async () => {
    try {
      await addPayment.mutateAsync({ date: pf.date, description: pf.description || "Termijn", amount: parseFloat(pf.amount) || 0, status: pf.status, method: pf.method || null });
      toast("Betaling geregistreerd"); setAdding(false); setPf({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", status: "paid", method: "iDEAL" });
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  return (
    <div className="flex-col gap-4">
      <Card title="Leerling-gegevens">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, fontSize: 13 }}>
          {([
            ["Volledige naam", k?.full_name],
            ["Leerlingnummer", l.leerlingnummer],
            ["Leeftijd / geslacht", `${age ?? "—"} jaar · ${k?.gender === "f" ? "Meisje" : "Jongen"}`],
            ["Klas", l.classes?.code],
            ["Docent", l.classes?.teachers?.name],
            ["Niveau", l.niveau ?? "—"],
            ["Ingeschreven sinds", l.joined ?? "—"],
            ["Adres", k?.address ?? "—"],
            ["Schooljaar", l.schooljaren?.name],
          ] as const).map(([key, v]) => (
            <div key={key}><div className="text-xs text-subtle mb-1">{key}</div><div className="font-semibold">{v}</div></div>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        {ouders.length === 0 && <Card title="Ouders/voogden"><div className="empty">Geen ouders gekoppeld.</div></Card>}
        {ouders.map((p, i) => (
          <Card key={p.id} title={<span className="flex items-center gap-2"><Icon name="user" size={14} />{p.role} (Ouder/voogd {i + 1}){p.primary && <Badge kind="primary">Primair contact</Badge>}</span>}>
            <div className="flex items-center gap-3 mb-4"><Avatar name={p.name} size="lg" /><div><div className="font-semibold" style={{ fontSize: 15 }}>{p.name}</div><div className="text-xs text-subtle">{p.role}</div></div></div>
            <div className="flex-col gap-2" style={{ fontSize: 13 }}>
              {([["Telefoon", p.phone, "phone"], ["E-mail", p.email, "mail"], ["Bereikbaarheid", p.bereik ?? "—", "clock"]] as const).map(([key, v, ic]) => (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "26px 130px 1fr", gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <Icon name={ic} size={13} style={{ color: "var(--fg-subtle)" }} />
                  <span className="text-muted">{key}</span>
                  <span className={key === "Telefoon" ? "font-mono" : ""}>{v}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card title="Betalingen" sub="Collegegeld" action={<Btn size="sm" icon="plus" onClick={() => setAdding(true)}>Betaling registreren</Btn>}>
        {adding && (
          <Modal title="Betaling registreren" sub="Voeg een collegegeld-termijn toe" onClose={() => setAdding(false)}
            footer={<ModalFooter onCancel={() => setAdding(false)} onSave={savePayment} saving={addPayment.isPending} disabled={!pf.amount} />}>
            <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Datum"><input className="input" type="date" value={pf.date} onChange={(e) => setPf((f) => ({ ...f, date: e.target.value }))} /></Field>
              <Field label="Bedrag (€)"><input className="input" type="number" value={pf.amount} onChange={(e) => setPf((f) => ({ ...f, amount: e.target.value }))} /></Field>
            </div>
            <Field label="Beschrijving"><input className="input" value={pf.description} onChange={(e) => setPf((f) => ({ ...f, description: e.target.value }))} placeholder="bv. Termijn 1 — collegegeld" /></Field>
            <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Status"><Select value={pf.status} onChange={(e) => setPf((f) => ({ ...f, status: e.target.value }))}><option value="paid">Voldaan</option><option value="open">Open</option><option value="expected">Verwacht</option></Select></Field>
              <Field label="Methode"><input className="input" value={pf.method} onChange={(e) => setPf((f) => ({ ...f, method: e.target.value }))} placeholder="iDEAL / contant / …" /></Field>
            </div>
          </Modal>
        )}
        <div className="grid-3 mb-4">
          <Stat label="Voldaan" value={EUR(paid)} icon="coins" deltaKind={open === 0 && paid > 0 ? "up" : ""} />
          <Stat label="Openstaand" value={EUR(open)} sub={open > 0 ? "Nog te voldoen" : "Niets open"} />
          <Stat label="Termijnen" value={String(payments.length)} sub="Geregistreerd" />
        </div>
        {payments.length === 0 ? <div className="empty">Nog geen betalingen geregistreerd.</div> : (
          <table className="table">
            <thead><tr><th>Datum</th><th>Beschrijving</th><th>Bedrag</th><th>Status</th><th>Methode</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-sm">{p.date}</td>
                  <td>{p.description}</td>
                  <td className="num">{EUR(Number(p.amount))}</td>
                  <td><Badge kind={p.status === "paid" ? "success" : p.status === "open" ? "warn" : "default"}>{p.status === "paid" ? "Voldaan" : p.status === "open" ? "Open" : "Verwacht"}</Badge></td>
                  <td className="text-sm">{p.method ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
