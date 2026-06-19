import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section, Card, Avatar, Icon, Btn, Select, Badge, pct, metricKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useTableTools, SortTh, SelectTh, SelectTd, SearchBox, BulkBar } from "@/features/_shared/tableTools";
import { useLeerlingen, useLeerlingMetrics, useCreateLeerling, useDeleteLeerlingen } from "@/data/leerlingen";
import { useClasses } from "@/data/classes";
import { useKinderen } from "@/data/people";
import { useSchooljaren, useCurrentSchooljaar } from "@/data/schooljaren";
import { useTuitionTiers, useFamilyLinks, useSetLesgeldOverride, resolveTuition } from "@/data/tuition";

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
  const del = useDeleteLeerlingen();
  const toast = useToast();
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

  const m = metrics ?? {};

  // Verschuldigd lesgeld per leerling — staffel per traject + gezinsrang, override wint.
  const { data: tiers } = useTuitionTiers(effectiveSj);
  const { data: familyLinks } = useFamilyLinks();
  const setOverride = useSetLesgeldOverride();
  const trackByClass = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of yearClasses ?? []) map.set(c.id, c.track);
    return map;
  }, [yearClasses]);
  const tuition = useMemo(
    () => resolveTuition(
      (data ?? []).map((l) => ({ id: l.id, kind_id: l.kind_id, birth_year: l.kinderen?.birth_year ?? null, track: trackByClass.get(l.class_id) ?? null, override: l.lesgeld_override })),
      familyLinks ?? [],
      tiers ?? [],
    ),
    [data, trackByClass, familyLinks, tiers],
  );

  const classFiltered = useMemo(
    () => (data ?? []).filter((l) => !classFilter || l.class_id === classFilter),
    [data, classFilter],
  );

  const tools = useTableTools({
    rows: classFiltered,
    getId: (l) => l.id,
    search: (l, q) => (l.kinderen?.full_name ?? "").toLowerCase().includes(q) || (l.leerlingnummer ?? "").toLowerCase().includes(q),
    sorters: {
      name: (l) => l.kinderen?.full_name,
      nummer: (l) => l.leerlingnummer,
      klas: (l) => l.classes?.code,
      niveau: (l) => l.niveau,
      attendance: (l) => m[l.id]?.attendance_pct,
      arabic: (l) => m[l.id]?.arabic_homework_pct,
      quran: (l) => m[l.id]?.quran_learned_pct,
      surahs: (l) => m[l.id]?.surahs_known,
      lesgeld: (l) => tuition.get(l.id)?.amount ?? -1,
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const rows = tools.view;

  if (isError) return <ErrorState error={error} />;

  const onLesgeldBlur = (l: { id: string; lesgeld_override: number | null }, raw: string) => {
    const v = raw.trim();
    const num = v === "" ? null : parseFloat(v);
    if (num !== null && Number.isNaN(num)) return;
    const tierAmount = tuition.get(l.id)?.tierAmount ?? null;
    // Leeg of gelijk aan het staffelbedrag → geen override (volg staffel).
    const next = num === null || num === tierAmount ? null : num;
    if (next !== l.lesgeld_override) setOverride.mutate({ leerlingId: l.id, value: next }, { onError: () => toast("Opslaan mislukt") });
  };

  const onDelete = () => {
    const ids = tools.selectedIds;
    if (!ids.length || !confirm(`${ids.length} leerling(en) uitschrijven en verwijderen? Dit verwijdert hun aanwezigheid, huiswerk en Qur'an-voortgang voor dit schooljaar.`)) return;
    del.mutate(ids, { onSuccess: () => { toast(`${ids.length} leerling(en) verwijderd`); tools.clear(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <Section
      title="Leerlingen"
      sub="Inschrijvingen per schooljaar, met afgeleide hoofdmetrics"
      actions={
        <>
          <SearchBox value={tools.q} onChange={tools.setQ} placeholder="Zoek naam of nummer…" width={200} />
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
        <div className="mb-4" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">Alle klassen</option>
            {classes.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
          </Select>
          <BulkBar count={tools.selectedIds.length} noun="leerling(en)" onClear={tools.clear} onDelete={onDelete} pending={del.isPending} />
        </div>
      )}
      <Card>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="empty">{tools.q || classFilter ? "Geen leerlingen gevonden." : "Nog geen leerlingen voor dit schooljaar."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SelectTh allChecked={tools.allChecked} onToggle={tools.toggleAll} />
                <SortTh label="Leerling" k="name" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Nr." k="nummer" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Klas" k="klas" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Niveau" k="niveau" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Aanw." k="attendance" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Arab. HW" k="arabic" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Qur'an" k="quran" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Surahs" k="surahs" sort={tools.sort} onSort={tools.toggleSort} />
                <SortTh label="Verschuldigd" k="lesgeld" sort={tools.sort} onSort={tools.toggleSort} />
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const mm = m[l.id];
                const age = l.kinderen?.birth_year ? currentYear - l.kinderen.birth_year : null;
                const isChecked = tools.checked.has(l.id);
                return (
                  <tr key={l.id} onClick={() => navigate("/students/" + l.id)} className={isChecked ? "selected" : ""}>
                    <SelectTd checked={isChecked} onToggle={() => tools.toggleOne(l.id)} label={`Selecteer ${l.kinderen?.full_name ?? "leerling"}`} />
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
                    <td onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const res = tuition.get(l.id);
                        return (
                          <div className="flex items-center gap-1">
                            <div style={{ position: "relative", width: 92 }}>
                              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)", fontSize: 12 }}>€</span>
                              <input
                                key={`${l.id}:${res?.amount}:${res?.overridden}`}
                                className="input" type="number"
                                style={{ paddingLeft: 18, fontWeight: res?.overridden ? 600 : 400 }}
                                defaultValue={res ? res.amount : ""}
                                title={res?.overridden ? "Handmatig overschreven" : `Staffel: ${res?.rang ?? "?"}e kind`}
                                onBlur={(e) => onLesgeldBlur(l, e.target.value)}
                              />
                            </div>
                            {res?.overridden && <button className="btn ghost sm" title="Terug naar staffel" onClick={() => setOverride.mutate({ leerlingId: l.id, value: null })}><Icon name="x" size={11} /></button>}
                          </div>
                        );
                      })()}
                    </td>
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
