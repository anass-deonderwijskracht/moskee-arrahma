import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Icon, Btn, Select, Badge, pct, metricKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useLeerlingen, useLeerlingMetrics, useCreateLeerling } from "@/data/leerlingen";
import { useClasses } from "@/data/classes";
import { useKinderen } from "@/data/people";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";

const NIVEAUS = ["0 (beginner)", "0,5", "1", "1,5", "2"];

const currentYear = new Date().getFullYear();

export function StudentsList() {
  const navigate = useNavigate();
  const { data: schooljaren } = useSchooljaren();
  const { data: current } = useCurrentSchooljaar();
  const [sjId, setSjId] = useState<string | null>(null);
  const effectiveSj = sjId ?? current?.id ?? null;

  const { data, isLoading, isError, error } = useLeerlingen(effectiveSj);
  const { data: metrics } = useLeerlingMetrics();
  const { data: yearClasses } = useClasses(effectiveSj);
  const { data: kinderen } = useKinderen();
  const createLeerling = useCreateLeerling();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind_id: "", class_id: "", niveau: "1", joined: new Date().toISOString().slice(0, 10) });
  const enrolledKindIds = useMemo(() => new Set((data ?? []).map((l) => l.kind_id)), [data]);
  const availableKinderen = (kinderen ?? []).filter((k) => !enrolledKindIds.has(k.id));
  const saveLeerling = async () => {
    if (!effectiveSj) return;
    try {
      await createLeerling.mutateAsync({ kind_id: form.kind_id, class_id: form.class_id, schooljaar_id: effectiveSj, niveau: form.niveau, joined: form.joined });
      toast("Leerling ingeschreven"); setAdding(false); setForm({ kind_id: "", class_id: "", niveau: "1", joined: new Date().toISOString().slice(0, 10) });
    } catch (e) { toast("Inschrijven mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of data ?? []) if (l.classes) seen.set(l.classes.id, l.classes.code);
    return [...seen.entries()];
  }, [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (l) =>
        (!term || (l.kinderen?.full_name ?? "").toLowerCase().includes(term) || (l.leerlingnummer ?? "").toLowerCase().includes(term)) &&
        (!classFilter || l.class_id === classFilter),
    );
  }, [data, q, classFilter]);

  if (isError) return <ErrorState error={error} />;
  const m = metrics ?? {};

  return (
    <Section
      title="Leerlingen"
      sub="Inschrijvingen per schooljaar, met afgeleide hoofdmetrics"
      actions={
        <>
          <div style={{ width: 200 }}>
            <input className="input" placeholder="Zoek naam of nummer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={effectiveSj ?? ""} onChange={(e) => setSjId(e.target.value)} style={{ width: 130 }}>
            {(schooljaren ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_current ? " (huidig)" : ""}</option>
            ))}
          </Select>
          <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Leerling inschrijven</Btn>
        </>
      }
    >
      {classes.length > 0 && (
        <div className="mb-4" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">Alle klassen</option>
            {classes.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
          </Select>
        </div>
      )}
      <Card>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="empty">{q || classFilter ? "Geen leerlingen gevonden." : "Nog geen leerlingen voor dit schooljaar."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Leerling</th><th>Nr.</th><th>Klas</th><th>Niveau</th>
                <th>Aanw.</th><th>Arab. HW</th><th>Qur'an</th><th>Surahs</th><th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const mm = m[l.id];
                const age = l.kinderen?.birth_year ? currentYear - l.kinderen.birth_year : null;
                return (
                  <tr key={l.id} onClick={() => navigate("/students/" + l.id)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={l.kinderen?.full_name} initials={l.kinderen?.initials ?? undefined} size="sm" />
                        <div>
                          <div className="font-semibold">{l.kinderen?.full_name}</div>
                          <div className="text-xs text-subtle">{age != null ? age + " jr" : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{l.leerlingnummer}</td>
                    <td className="text-sm">{l.classes?.code}</td>
                    <td className="text-sm">{l.niveau ?? "—"}</td>
                    <td><Badge kind={metricKind(mm?.attendance_pct)}>{pct(mm?.attendance_pct)}</Badge></td>
                    <td><Badge kind={metricKind(mm?.arabic_homework_pct)}>{pct(mm?.arabic_homework_pct)}</Badge></td>
                    <td><Badge kind={metricKind(mm?.quran_learned_pct)}>{pct(mm?.quran_learned_pct)}</Badge></td>
                    <td className="num">{mm?.surahs_known ?? 0}</td>
                    <td><Icon name="chevronRight" size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {adding && (
        <Modal title="Leerling inschrijven" sub="Schrijf een bestaand kind in voor dit schooljaar" onClose={() => setAdding(false)}
          footer={<ModalFooter onCancel={() => setAdding(false)} onSave={saveLeerling} saving={createLeerling.isPending} disabled={!form.kind_id || !form.class_id} />}>
          <Field label="Kind">
            <Select value={form.kind_id} onChange={(e) => setForm((f) => ({ ...f, kind_id: e.target.value }))}>
              <option value="">— kies kind —</option>
              {availableKinderen.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}
            </Select>
          </Field>
          {availableKinderen.length === 0 && <div className="text-xs text-subtle">Alle kinderen zijn al ingeschreven dit jaar. Voeg eerst een kind toe.</div>}
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Klas"><Select value={form.class_id} onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}><option value="">— kies klas —</option>{(yearClasses ?? []).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
            <Field label="Niveau"><Select value={form.niveau} onChange={(e) => setForm((f) => ({ ...f, niveau: e.target.value }))}>{NIVEAUS.map((n) => <option key={n} value={n}>Niveau {n}</option>)}</Select></Field>
          </div>
          <Field label="Ingeschreven sinds"><input className="input" type="date" value={form.joined} onChange={(e) => setForm((f) => ({ ...f, joined: e.target.value }))} /></Field>
        </Modal>
      )}
    </Section>
  );
}
