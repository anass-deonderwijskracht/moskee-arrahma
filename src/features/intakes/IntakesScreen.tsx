import { useMemo, useState } from "react";
import { Badge, Btn, Card, Icon, Section, Select } from "@/components/ui";
import { Field, Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/chrome/Toast";
import { ErrorState, Loading } from "@/features/_shared/states";
import {
  useDeleteIntakeMoment,
  useIntakeMoments,
  useSaveIntakeMoment,
  useSetIntakeStatus,
  type IntakeMoment,
  type IntakeSlotInput,
  type IntakeStatus,
} from "@/data/intakes";

const STATUS_LABEL: Record<IntakeStatus, string> = {
  concept: "Concept",
  actief: "Actief",
  verlopen: "Verlopen",
};

const STATUS_KIND = { concept: "default", actief: "success", verlopen: "warn" } as const;

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function timeLabel(value: string) {
  return value.slice(0, 5);
}

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString("nl-NL", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function emptySlot(position: number, date?: string): IntakeSlotInput {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return { date: date ?? tomorrow, start_time: "10:00", end_time: "10:30", position };
}

export function IntakesScreen() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useIntakeMoments();
  const setStatus = useSetIntakeStatus();
  const remove = useDeleteIntakeMoment();
  const [editing, setEditing] = useState<Partial<IntakeMoment> | null>(null);

  if (isError) return <ErrorState error={error} />;

  const moments = data ?? [];
  const active = moments.find((moment) => moment.status === "actief");

  const changeStatus = async (moment: IntakeMoment, status: IntakeStatus) => {
    if (status === "actief" && active && active.id !== moment.id
      && !confirm(`“${active.description.slice(0, 60)}” wordt hierdoor automatisch verlopen. Doorgaan?`)) return;
    try {
      await setStatus.mutateAsync({ id: moment.id, status });
      toast(status === "actief" ? "Intakemoment is nu actief" : "Intakemoment gemarkeerd als verlopen");
    } catch (err) {
      toast("Status wijzigen mislukt: " + (err instanceof Error ? err.message : "onbekend"));
    }
  };

  const deleteMoment = async (moment: IntakeMoment) => {
    const extra = moment.intake_choices.length ? ` Ook ${moment.intake_choices.length} opgeslagen keuze(s) worden verwijderd.` : "";
    if (!confirm(`Intakemoment definitief verwijderen?${extra}`)) return;
    try {
      await remove.mutateAsync(moment.id);
      toast("Intakemoment verwijderd");
    } catch (err) {
      toast("Verwijderen mislukt: " + (err instanceof Error ? err.message : "onbekend"));
    }
  };

  return (
    <>
      <Section
        title="Intake"
        sub={`${moments.length} intakemoment${moments.length === 1 ? "" : "en"} · ${active ? "één actief formulier" : "geen actief formulier"}`}
        actions={<Btn kind="primary" icon="plus" onClick={() => setEditing({})}>Nieuw intakemoment</Btn>}
      />

      {isLoading ? <Loading /> : moments.length === 0 ? (
        <Card>
          <div className="empty">
            <Icon name="calendar" size={28} style={{ marginBottom: 10 }} />
            <div className="font-semibold" style={{ color: "var(--fg)", marginBottom: 4 }}>Nog geen intakemomenten</div>
            Maak een moment met één of meer datum- en tijdopties.
          </div>
        </Card>
      ) : (
        <div className="flex-col gap-4">
          {moments.map((moment) => {
            const choicesBySlot = new Map<string, typeof moment.intake_choices>();
            for (const choice of moment.intake_choices) {
              const current = choicesBySlot.get(choice.intake_slot_id) ?? [];
              current.push(choice);
              choicesBySlot.set(choice.intake_slot_id, current);
            }
            const slotById = new Map(moment.intake_slots.map((slot) => [slot.id, slot]));
            return (
              <Card
                key={moment.id}
                title={<span className="flex items-center gap-2"><Icon name="calendar" size={16} /> Intakemoment</span>}
                sub={`Aangemaakt ${dateTimeLabel(moment.created_at)}`}
                action={
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Badge kind={STATUS_KIND[moment.status as IntakeStatus]} dot>{STATUS_LABEL[moment.status as IntakeStatus]}</Badge>
                    {moment.status !== "actief" && <Btn size="sm" kind="primary" onClick={() => void changeStatus(moment, "actief")}>Activeren</Btn>}
                    {moment.status === "actief" && <Btn size="sm" onClick={() => void changeStatus(moment, "verlopen")}>Laten verlopen</Btn>}
                    <Btn size="sm" icon="edit" onClick={() => setEditing(moment)}>Bewerken</Btn>
                    <Btn size="sm" kind="ghost" icon="trash" aria-label="Verwijderen" title="Verwijderen" onClick={() => void deleteMoment(moment)} />
                  </div>
                }
              >
                <div className="intake-summary">
                  <div>
                    <div className="text-xs text-subtle font-semibold intake-kicker">Beschrijving</div>
                    <div className="intake-description">{moment.description}</div>
                  </div>
                  <div className="intake-meta-card">
                    <span className="text-xs text-subtle">Duur per intake</span>
                    <strong>{moment.duration_text}</strong>
                  </div>
                  <div className="intake-meta-card">
                    <span className="text-xs text-subtle">Reacties</span>
                    <strong>{moment.intake_choices.length}</strong>
                  </div>
                </div>

                <div className="intake-slot-list">
                  {moment.intake_slots.map((slot) => {
                    const choices = choicesBySlot.get(slot.id) ?? [];
                    return (
                      <div className="intake-slot-admin" key={slot.id}>
                        <div className="intake-slot-date">
                          <Icon name="calendar" size={15} />
                          <div><strong>{dateLabel(slot.date)}</strong><span>{timeLabel(slot.start_time)} – {timeLabel(slot.end_time)}</span></div>
                        </div>
                        <Badge kind={choices.length ? "primary" : "default"}>{choices.length} gekozen</Badge>
                        <div className="intake-slot-names">
                          {choices.length ? choices.map((choice) => choice.enrollments?.child_name ?? "Onbekende inschrijving").join(", ") : "Nog niemand"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="intake-responses-head">
                  <div>
                    <div className="font-semibold">Inschrijvingen en hun keuze</div>
                    <div className="text-xs text-subtle">De laatst opgeslagen voorkeur staat hieronder.</div>
                  </div>
                </div>
                <div className="scroll-x">
                  <table className="table" style={{ minWidth: 680 }}>
                    <thead><tr><th>Inschrijving</th><th>Gekozen moment</th><th>Gekozen / gewijzigd op</th></tr></thead>
                    <tbody>
                      {moment.intake_choices.map((choice) => {
                        const slot = slotById.get(choice.intake_slot_id);
                        return (
                          <tr key={choice.id}>
                            <td className="font-semibold">{choice.enrollments?.child_name ?? "Onbekende inschrijving"}</td>
                            <td>{slot ? `${dateLabel(slot.date)} · ${timeLabel(slot.start_time)} – ${timeLabel(slot.end_time)}` : "—"}</td>
                            <td className="text-subtle">{dateTimeLabel(choice.updated_at)}</td>
                          </tr>
                        );
                      })}
                      {moment.intake_choices.length === 0 && <tr><td colSpan={3}><div className="empty">Nog geen keuzes ontvangen.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <IntakeMomentModal initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function IntakeMomentModal({ initial, onClose }: { initial: Partial<IntakeMoment>; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveIntakeMoment();
  const [description, setDescription] = useState(initial.description ?? "");
  const [duration, setDuration] = useState(initial.duration_text ?? "");
  const [status, setStatus] = useState<IntakeStatus>((initial.status as IntakeStatus | undefined) ?? "concept");
  const [slots, setSlots] = useState<IntakeSlotInput[]>(() =>
    initial.intake_slots?.length
      ? initial.intake_slots.map((slot, position) => ({ ...slot, position }))
      : [emptySlot(0)],
  );
  const selectedSlotIds = useMemo(() => new Set((initial.intake_choices ?? []).map((choice) => choice.intake_slot_id)), [initial.intake_choices]);

  const patchSlot = (index: number, patch: Partial<IntakeSlotInput>) => {
    setSlots((current) => current.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  };

  const removeSlot = (index: number) => {
    const slot = slots[index];
    if (slot.id && selectedSlotIds.has(slot.id)) {
      toast("Deze optie is al gekozen en kan daarom niet worden verwijderd");
      return;
    }
    setSlots((current) => current.filter((_, i) => i !== index));
  };

  const valid = description.trim() && duration.trim() && slots.length > 0
    && slots.every((slot) => slot.date && slot.start_time && slot.end_time && slot.end_time > slot.start_time);

  const onSave = async () => {
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: initial.id,
        description,
        duration_text: duration,
        status,
        slots,
      });
      toast(initial.id ? "Intakemoment bijgewerkt" : "Intakemoment aangemaakt");
      onClose();
    } catch (err) {
      toast("Opslaan mislukt: " + (err instanceof Error ? err.message : "onbekend"));
    }
  };

  return (
    <Modal
      title={initial.id ? "Intakemoment bewerken" : "Nieuw intakemoment"}
      sub="Voeg alle momenten toe waaruit een inschrijving één voorkeur mag kiezen."
      onClose={onClose}
      width={760}
      footer={<ModalFooter onCancel={onClose} onSave={() => void onSave()} saving={save.isPending} disabled={!valid} />}
    >
      <Field label="Beschrijving">
        <textarea className="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beschrijf wat de ouder en het kind kunnen verwachten en eventuele voorbereiding." />
      </Field>
      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Field label="Duur van een intake">
          <input className="input" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Bijvoorbeeld: ongeveer 20 minuten" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value as IntakeStatus)}>
            <option value="concept">Concept</option>
            <option value="actief">Actief</option>
            <option value="verlopen">Verlopen</option>
          </Select>
        </Field>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div>
          <div className="font-semibold text-sm">Datum- en tijdopties</div>
          <div className="text-xs text-subtle">Eindtijd moet na de begintijd liggen.</div>
        </div>
        <Btn size="sm" icon="plus" onClick={() => setSlots((current) => [...current, emptySlot(current.length, current.at(-1)?.date)])}>Datum toevoegen</Btn>
      </div>

      <div className="flex-col gap-2">
        {slots.map((slot, index) => (
          <div className="intake-slot-editor" key={slot.id ?? index}>
            <input className="input" type="date" aria-label={`Datum ${index + 1}`} value={slot.date} onChange={(event) => patchSlot(index, { date: event.target.value })} />
            <input className="input" type="time" aria-label={`Begintijd ${index + 1}`} value={timeLabel(slot.start_time)} onChange={(event) => patchSlot(index, { start_time: event.target.value })} />
            <span className="text-subtle">tot</span>
            <input className="input" type="time" aria-label={`Eindtijd ${index + 1}`} value={timeLabel(slot.end_time)} onChange={(event) => patchSlot(index, { end_time: event.target.value })} />
            <Btn kind="ghost" icon="trash" aria-label={`Optie ${index + 1} verwijderen`} title={slot.id && selectedSlotIds.has(slot.id) ? "Deze optie is al gekozen" : "Optie verwijderen"} disabled={!!slot.id && selectedSlotIds.has(slot.id)} onClick={() => removeSlot(index)} />
          </div>
        ))}
        {slots.length === 0 && <div className="error-banner">Voeg minimaal één datum en tijd toe.</div>}
        {slots.some((slot) => slot.end_time <= slot.start_time) && <div className="error-banner">Controleer de tijden: elke eindtijd moet na de begintijd liggen.</div>}
      </div>
      {status === "actief" && <div className="intake-active-note"><Icon name="check" size={14} /> Dit moment wordt het enige actieve intakeformulier. Een eerder actief moment verloopt automatisch.</div>}
    </Modal>
  );
}
