import { useState } from "react";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Select, Badge } from "@/components/ui";
import { useToast } from "@/components/chrome/Toast";
import { useCreateEnrollment } from "@/data/enrollments";
import { useClasses } from "@/data/classes";
import { useCurrentSchooljaar } from "@/data/schooljaren";

const LESDAGEN = ["Zaterdag", "Zondag", "Geen voorkeur"];

interface ParentForm { role: string; name: string; phone: string; email: string; is_primary: boolean }

export function NewEnrollmentModal({ track, onClose }: { track: "regulier" | "hifdh"; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateEnrollment();
  const { data: sj } = useCurrentSchooljaar();
  const { data: classes } = useClasses(sj?.id ?? null);
  const eligibleClasses = (classes ?? []).filter((c) => (track === "hifdh" ? c.track === "hifdh" : c.track !== "hifdh"));

  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [lesday, setLesday] = useState("Geen voorkeur");
  const [targetClass, setTargetClass] = useState("");
  const [parents, setParents] = useState<ParentForm[]>([
    { role: "Vader", name: "", phone: "", email: "", is_primary: true },
    { role: "Moeder", name: "", phone: "", email: "", is_primary: false },
  ]);

  const setParent = (i: number, patch: Partial<ParentForm>) =>
    setParents((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const valid = childName.trim() && parents.some((p) => p.name.trim());

  const save = async () => {
    try {
      await create.mutateAsync({
        child_name: childName.trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
        track,
        target_class: targetClass || null,
        preferred_lesday: lesday,
        parents,
      });
      toast(`Aanmelding voor ${childName.trim()} toegevoegd`);
      onClose();
    } catch (e) {
      toast("Aanmaken mislukt: " + (e instanceof Error ? e.message : ""));
    }
  };

  return (
    <Modal
      width={560}
      title={<span className="flex items-center gap-2">Nieuwe aanmelding <Badge kind={track === "hifdh" ? "primary" : "info"} dot>{track === "hifdh" ? "Hifdh-traject" : "Regulier"}</Badge></span>}
      sub={track === "hifdh" ? "Intensief memorisatie-traject" : "Standaard weekendlessen"}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={create.isPending} saveLabel="Aanmelding toevoegen" disabled={!valid} />}
    >
      <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
        <Field label="Naam kind"><input className="input" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Voor- en achternaam" /></Field>
        <Field label="Leeftijd"><input className="input" type="number" min={4} max={18} value={age} onChange={(e) => setAge(e.target.value)} placeholder="bv. 8" /></Field>
        <Field label="Geslacht">
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">—</option><option value="m">Jongen</option><option value="f">Meisje</option>
          </Select>
        </Field>
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Voorkeur lesdag">
          <Select value={lesday} onChange={(e) => setLesday(e.target.value)}>
            {LESDAGEN.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Voorkeursklas (optioneel)">
          <Select value={targetClass} onChange={(e) => setTargetClass(e.target.value)}>
            <option value="">— geen —</option>
            {eligibleClasses.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
          </Select>
        </Field>
      </div>

      <div className="text-xs text-subtle font-semibold mt-2" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Ouders / voogden</div>
      {parents.map((p, i) => (
        <div key={i} style={{ padding: 12, background: "var(--bg-sunken)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Select value={p.role} onChange={(e) => setParent(i, { role: e.target.value })} style={{ width: 120 }}>
              <option>Vader</option><option>Moeder</option><option>Voogd</option>
            </Select>
            {p.is_primary && <Badge kind="primary">Primair contact</Badge>}
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Naam"><input className="input" value={p.name} onChange={(e) => setParent(i, { name: e.target.value })} /></Field>
            <Field label="Telefoon"><input className="input" value={p.phone} onChange={(e) => setParent(i, { phone: e.target.value })} placeholder="06 …" /></Field>
          </div>
          <Field label="E-mail"><input className="input" type="email" value={p.email} onChange={(e) => setParent(i, { email: e.target.value })} /></Field>
        </div>
      ))}
    </Modal>
  );
}
