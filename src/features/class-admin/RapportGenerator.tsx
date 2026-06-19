import { useState } from "react";
import { createPortal } from "react-dom";
import { Btn, pct } from "@/components/ui";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/chrome/Toast";
import { useClass, type ClassLeerling } from "@/data/classDetail";
import { useSchooljaren } from "@/data/schooljaren";
import { useLeerlingMetrics } from "@/data/leerlingen";
import { useReportGrades, useClassLateCounts } from "@/data/rapporten";
import "@/styles/rapport.css";

export interface RapportSections {
  beoordelingen: boolean;
  opmerking: boolean;
  aanwezigheid: boolean;
  teLaat: boolean;
  huiswerk: boolean;
  quranHuiswerk: boolean;
}

const SECTION_LABELS: { key: keyof RapportSections; label: string }[] = [
  { key: "beoordelingen", label: "Beoordelingen (Qur'an, gedrag, inzet, toetsen)" },
  { key: "opmerking", label: "Opmerking" },
  { key: "aanwezigheid", label: "Aanwezigheid (%)" },
  { key: "teLaat", label: "Te laat (aantal)" },
  { key: "huiswerk", label: "Arabisch huiswerk (%)" },
  { key: "quranHuiswerk", label: "Qur'an-huiswerk (%)" },
];

export function RapportGenerator({ classId, reportPeriodId, periodName, leerlingen, onClose }: {
  classId: string; reportPeriodId: string; periodName: string; leerlingen: ClassLeerling[]; onClose: () => void;
}) {
  const [sections, setSections] = useState<RapportSections>({
    beoordelingen: true, opmerking: true, aanwezigheid: true, teLaat: true, huiswerk: true, quranHuiswerk: true,
  });
  const [previewing, setPreviewing] = useState(false);
  const toggle = (k: keyof RapportSections) => setSections((s) => ({ ...s, [k]: !s[k] }));

  if (previewing) {
    return <RapportPreview classId={classId} reportPeriodId={reportPeriodId} periodName={periodName}
      leerlingen={leerlingen} sections={sections} onClose={onClose} />;
  }

  return (
    <Modal title="Rapport genereren" sub={`${periodName} · ${leerlingen.length} leerlingen · één pagina per leerling`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={() => setPreviewing(true)} saveLabel="Preview tonen" />}>
      <div className="text-sm text-muted mb-3">Kies welke onderdelen op het rapport komen:</div>
      <div className="flex-col gap-2">
        {SECTION_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={sections[key]} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function RapportPreview({ classId, reportPeriodId, periodName, leerlingen, sections, onClose }: {
  classId: string; reportPeriodId: string; periodName: string; leerlingen: ClassLeerling[];
  sections: RapportSections; onClose: () => void;
}) {
  const toast = useToast();
  const grid = useReportGrades(classId, reportPeriodId);
  const metrics = useLeerlingMetrics();
  const cls = useClass(classId);
  const schooljaren = useSchooljaren();
  const ids = leerlingen.map((l) => l.id);
  const late = useClassLateCounts(ids, true);

  const loading = grid.isLoading || metrics.isLoading || cls.isLoading;
  const schooljaarName = schooljaren.data?.find((s) => s.id === cls.data?.schooljaar_id)?.name ?? "";
  const classCode = cls.data?.code ?? "";
  const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const anyMetric = sections.aanwezigheid || sections.teLaat || sections.huiswerk || sections.quranHuiswerk;

  const print = () => {
    if (loading) { toast("Rapport wordt nog geladen…"); return; }
    window.print();
  };

  return createPortal(
    <div className="rapport-overlay">
      <div className="rapport-toolbar">
        <span className="r-toolbar-info">Preview — Rapport: {periodName}{classCode ? ` · ${classCode}` : ""} · {leerlingen.length} leerlingen</span>
        <div className="flex items-center gap-2">
          <Btn kind="ghost" icon="x" onClick={onClose}>Sluiten</Btn>
          <Btn kind="primary" icon="download" onClick={print} disabled={loading}>Opslaan als PDF</Btn>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#fff", textAlign: "center", padding: 60 }}>Rapport voorbereiden…</div>
      ) : (
        <div className="rapport-pages">
          {leerlingen.map((l) => {
            const a = grid.data?.assessments[l.id];
            const m = metrics.data?.[l.id];
            const rows: { label: string; value: string }[] = [];
            if (sections.beoordelingen) {
              rows.push({ label: "Qur'an", value: a?.quran ?? "—" });
              rows.push({ label: "Gedrag", value: a?.gedrag ?? "—" });
              rows.push({ label: "Inzet", value: a?.inzet ?? "—" });
              for (const t of grid.data?.tests ?? [])
                rows.push({ label: t.name, value: grid.data?.grades[`${t.id}:${l.id}`] || "—" });
            }
            const kpis: { val: string; lbl: string }[] = [];
            if (sections.aanwezigheid) kpis.push({ val: pct(m?.attendance_pct), lbl: "Aanwezigheid" });
            if (sections.teLaat) kpis.push({ val: `${late.data?.[l.id] ?? 0}×`, lbl: "Te laat" });
            if (sections.huiswerk) kpis.push({ val: pct(m?.arabic_homework_pct), lbl: "Arabisch huiswerk" });
            if (sections.quranHuiswerk) kpis.push({ val: pct(m?.quran_learned_pct), lbl: "Qur'an-huiswerk" });

            return (
              <div className="rapport-page" key={l.id}>
                <div className="r-header">
                  <div>
                    <div className="r-brand-name">Moskee Arrahma</div>
                    <div className="r-brand-sub">Weekendonderwijs · Almere</div>
                  </div>
                  <div className="r-title">
                    <div className="r-title-main">Rapport</div>
                    <div className="r-title-sub">{periodName}{schooljaarName ? ` · ${schooljaarName}` : ""}</div>
                  </div>
                </div>

                <div className="r-student">
                  <div className="r-name">{l.kinderen?.full_name ?? "—"}</div>
                  <div className="r-student-sub">
                    {classCode || "—"}{l.leerlingnummer ? ` · ${l.leerlingnummer}` : ""}
                  </div>
                </div>

                {sections.beoordelingen && (
                  <>
                    <div className="r-section-title">Beoordelingen</div>
                    <table className="r-table">
                      <thead><tr><th>Onderdeel</th><th style={{ textAlign: "right" }}>Resultaat</th></tr></thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}><td>{r.label}</td><td className="r-result">{r.value}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {sections.opmerking && a?.opmerking && (
                  <>
                    <div className="r-section-title">Opmerking</div>
                    <div className="r-note">{a.opmerking}</div>
                  </>
                )}

                {anyMetric && (
                  <>
                    <div className="r-section-title">Kerncijfers</div>
                    <div className="r-kpis">
                      {kpis.map((k, i) => (
                        <div className="r-kpi" key={i}>
                          <div className="r-kpi-val">{k.val}</div>
                          <div className="r-kpi-lbl">{k.lbl}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="r-footer">
                  <div>Almere, {today}</div>
                  <div className="r-sign-line">Handtekening docent</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
