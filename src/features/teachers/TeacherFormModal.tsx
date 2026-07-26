import { useState } from "react";
import { Select } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/chrome/Toast";
import { useSaveTeacher, type Teacher } from "@/data/people";

/** Gedeelde toevoegen/bewerken-modal voor een docent (incl. uurtarief). */
export function TeacherFormModal({ initial, onClose, onSaved }: { initial: Partial<Teacher>; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const save = useSaveTeacher();
  const [t, setT] = useState<Partial<Teacher>>(initial);

  const onSave = async () => {
    try {
      await save.mutateAsync({
        id: t.id, name: t.name ?? "", short: t.short ?? "", email: t.email ?? "",
        phone: t.phone ?? "", specialty: t.specialty ?? "", role: t.role ?? "les",
        uurtarief: t.uurtarief ?? null,
      });
      toast(t.id ? "Docent bijgewerkt" : "Docent toegevoegd");
      onSaved?.();
      onClose();
    } catch (e) {
      toast("Opslaan mislukt: " + (e instanceof Error ? e.message : ""));
    }
  };

  return (
    <Modal title={t.id ? "Docent bewerken" : "Docent toevoegen"} onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={onSave} saving={save.isPending} disabled={!t.name?.trim()} />}>
      <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Field label="Naam"><input className="input" value={t.name ?? ""} onChange={(e) => setT((p) => ({ ...p, name: e.target.value }))} placeholder="Ustadh …" /></Field>
        <Field label="Afkorting"><input className="input" value={t.short ?? ""} onChange={(e) => setT((p) => ({ ...p, short: e.target.value }))} placeholder="M. Bakkali" /></Field>
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Rol">
          <Select value={t.role ?? "les"} onChange={(e) => setT((p) => ({ ...p, role: e.target.value }))}>
            <option value="les">Lesdocent</option>
            <option value="quran">Qur'an-docent</option>
            <option value="both">Les & Qur'an</option>
            <option value="inval">Invaldocent</option>
          </Select>
        </Field>
        <Field label="Uurtarief (€/uur)">
          <input className="input" type="number" min="0" step="0.5" placeholder="bv. 22,50"
            value={t.uurtarief ?? ""}
            onChange={(e) => setT((p) => ({ ...p, uurtarief: e.target.value === "" ? null : Number(e.target.value) }))} />
        </Field>
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="E-mail"><input className="input" type="email" value={t.email ?? ""} onChange={(e) => setT((p) => ({ ...p, email: e.target.value }))} /></Field>
        <Field label="Telefoon"><input className="input" value={t.phone ?? ""} onChange={(e) => setT((p) => ({ ...p, phone: e.target.value }))} /></Field>
      </div>
      <Field label="Specialiteit"><input className="input" value={t.specialty ?? ""} onChange={(e) => setT((p) => ({ ...p, specialty: e.target.value }))} /></Field>
    </Modal>
  );
}
