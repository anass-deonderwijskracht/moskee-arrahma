import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Section, Card, Badge, Btn, Icon, Avatar, QBar, Select, pct, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useKindDetail, type KindYear } from "@/data/relations";
import { useUpdateKind } from "@/data/people";
import { ageLabel } from "@/data/age";

const EMPTY = { first_name: "", last_name: "", gender: "", birthdate: "", address: "", notes: "" };

function attendanceOf(y: KindYear, metrics: Record<string, { attendance_pct: number | null }>): number | null {
  if (y.schooljaren?.is_current) return metrics[y.id]?.attendance_pct ?? null;
  return y.hist_attendance_pct;
}

export function KindDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, isError, error } = useKindDetail(id);
  const update = useUpdateKind();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const k = data?.kind;
  // Het formulier volgt het geladen kind, ook als dat later binnenkomt.
  useEffect(() => {
    if (k) setForm({
      first_name: k.first_name, last_name: k.last_name, gender: k.gender ?? "",
      birthdate: k.birthdate ?? "", address: k.address ?? "", notes: k.notes ?? "",
    });
  }, [k]);

  if (isError) return <ErrorState error={error} />;
  if (isLoading || !data || !k) return <Loading label="Kind laden…" />;

  const { years, metrics, ouders, siblings } = data;

  const save = async () => {
    const first = form.first_name.trim(), last = form.last_name.trim();
    if (!first || !last) return;
    const renamed = first !== k.first_name || last !== k.last_name;
    try {
      await update.mutateAsync({
        id: k.id,
        patch: {
          first_name: first, last_name: last,
          gender: form.gender || null,
          birthdate: form.birthdate || null,
          // Geboortejaar volgt de datum, zodat de leeftijd overal klopt.
          birth_year: form.birthdate ? Number(form.birthdate.slice(0, 4)) : k.birth_year,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        },
        name: renamed ? { first_name: first, last_name: last } : undefined,
      });
      toast("Gegevens opgeslagen"); setEditing(false);
    } catch (e) { toast("Opslaan mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const current = years.find((y) => y.schooljaren?.is_current) ?? years[0];
  const currentMetrics = current ? metrics[current.id] : undefined;

  const attVals = years.map((y) => attendanceOf(y, metrics)).filter((v): v is number => v != null);
  const avgAtt = attVals.length ? attVals.reduce((a, b) => a + b, 0) / attVals.length : null;

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => navigate("/kinderen")} className="btn ghost sm" style={{ padding: "4px 6px" }}><Icon name="chevronLeft" size={14} /></button>
          {k.full_name}
        </span>
      }
      sub={`${ouders.length} ouder(s)/voogd(en)${siblings.length ? " · " + siblings.length + " broer/zus" : ""}`}
      actions={
        <>
          <Btn icon="edit" onClick={() => setEditing(true)}>Bewerken</Btn>
          {current && <Btn kind="primary" onClick={() => navigate("/students/" + current.id)}>Open dit jaar →</Btn>}
        </>
      }
    >
      <div className="detail-hero">
        <Avatar name={k.full_name} initials={k.initials ?? undefined} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-3 mb-2" style={{ flexWrap: "wrap" }}>
            {current?.classes && <Badge kind={(current.classes.color as BadgeKind) ?? "primary"}>{current.classes.code} (huidig)</Badge>}
            <Badge>{ageLabel(k, { approx: true, unit: "jaar" })} · {k.gender === "f" ? "♀" : "♂"}</Badge>
          </div>
          <div className="grid-auto" style={{ marginTop: 16 }}>
            <div><div className="text-xs text-subtle">Aanwezigheid (gemiddeld)</div><div style={{ fontSize: 22, fontWeight: 600 }}>{pct(avgAtt)}</div></div>
            <div>
              <div className="text-xs text-subtle">Surahs nu</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{currentMetrics?.surahs_known ?? 0} <span style={{ color: "var(--fg-subtle)", fontSize: 14 }}>/ 38</span></div>
              <div className="mt-2"><QBar value={currentMetrics?.surahs_known ?? 0} max={38} /></div>
            </div>
            <div><div className="text-xs text-subtle">Adres (gezin)</div><div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{k.address?.split(",")[0] ?? "—"}</div><div className="text-xs text-subtle mt-1">{k.address?.split(",").slice(1).join(",")}</div></div>
          </div>
        </div>
      </div>

      <Card title={<><Icon name="activity" size={14} /> Onderwijshistorie</>} sub="Eén rij per schooljaar — klik een jaar open voor het volledige leerlingdossier.">
        <div className="flex-col gap-3">
          {years.map((y) => {
            const isCurrent = !!y.schooljaren?.is_current;
            const att = attendanceOf(y, metrics);
            const surahs = isCurrent ? (metrics[y.id]?.surahs_known ?? 0) : (y.hist_surahs_known ?? 0);
            return (
              <button key={y.id} type="button" className="grid-auto tight"
                onClick={() => navigate("/students/" + y.id)}
                title={`Open het leerlingdossier van ${y.schooljaren?.name ?? "dit jaar"}`}
                style={{ width: "100%", textAlign: "left", cursor: "pointer", padding: 16, borderRadius: 12, background: isCurrent ? "var(--primary-soft)" : "var(--bg-sunken)", border: "1px solid " + (isCurrent ? "var(--primary)" : "var(--border)"), alignItems: "center" }}>
                <div>
                  <div className="font-mono font-semibold" style={{ fontSize: 15 }}>{y.schooljaren?.name}</div>
                  {isCurrent && <div className="text-xs" style={{ color: "var(--primary)", marginTop: 2, fontWeight: 600 }}>HUIDIG</div>}
                </div>
                <div><Badge kind={(y.classes?.color as BadgeKind) ?? "default"}>{y.classes?.code}</Badge><div className="text-xs text-subtle mt-1">{y.classes?.teachers?.short}</div></div>
                <div><div className="text-xs text-subtle mb-1">Notitie einde jaar</div><div className="text-sm">{isCurrent ? "Lopend schooljaar." : (y.notes_end_of_year ?? "—")}</div></div>
                <div>
                  <div className="text-xs text-subtle">Aanwezigheid</div>
                  <div className="flex items-center gap-2 mt-1"><div style={{ flex: 1 }}><QBar value={(att ?? 0) * 100} /></div><span className="num text-xs">{pct(att)}</span></div>
                  <div className="text-xs text-subtle mt-2">Surahs: <b style={{ color: "var(--fg)" }}>{surahs}</b></div>
                </div>
                <div className="flex items-center gap-2" style={{ justifyContent: "flex-end" }}>
                  {y.final_grade ? <Badge kind={y.final_grade === "Zeer goed" ? "success" : y.final_grade === "Goed" ? "primary" : "warn"}>{y.final_grade}</Badge> : <Badge>Lopend</Badge>}
                  <Icon name="chevronRight" size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid-2 mt-4">
        <Card title={<><Icon name="user" size={14} /> Ouders & voogden</>} sub={ouders.length + " gekoppeld"}>
          <div className="flex-col gap-3">
            {ouders.map((o) => (
              <div key={o.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/ouders/" + o.id)}>
                <Avatar name={o.name} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2"><span className="font-semibold">{o.name}</span>{o.primary && <Badge kind="primary">Primair</Badge>}</div>
                  <div className="text-xs text-subtle">{o.role} · {o.phone}</div>
                </div>
                <Icon name="chevronRight" size={14} />
              </div>
            ))}
          </div>
        </Card>

        <Card title={<><Icon name="users" size={14} /> Broers & zussen</>} sub={siblings.length === 0 ? "Geen broer/zus ingeschreven" : siblings.length + " ander(en) bij ons"}>
          {siblings.length === 0 ? (
            <div className="empty"><Icon name="users" size={28} style={{ color: "var(--fg-faint)" }} /><div className="mt-2">Geen broer/zus in onze administratie.</div></div>
          ) : (
            <div className="flex-col gap-2">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center gap-3" style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", cursor: "pointer" }} onClick={() => navigate("/kinderen/" + s.id)}>
                  <Avatar name={s.full_name} initials={s.initials ?? undefined} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="font-semibold">{s.full_name}</div><div className="text-xs text-subtle">{s.class_code ?? "—"}</div></div>
                  <Icon name="chevronRight" size={14} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <Modal title="Kind bewerken" sub="Basisgegevens — gelden voor alle schooljaren" onClose={() => setEditing(false)}
          footer={<ModalFooter onCancel={() => setEditing(false)} onSave={save} saving={update.isPending} disabled={!form.first_name.trim() || !form.last_name.trim()} />}>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Voornaam"><input className="input" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
            <Field label="Achternaam"><input className="input" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Geslacht">
              <Select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                <option value="">—</option><option value="m">Jongen</option><option value="f">Meisje</option>
              </Select>
            </Field>
            <Field label="Geboortedatum"><input className="input" type="date" value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} /></Field>
          </div>
          <Field label="Adres"><input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Straat 1, 1234 AB Plaats" /></Field>
          <Field label="Notities"><textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        </Modal>
      )}
    </Section>
  );
}
