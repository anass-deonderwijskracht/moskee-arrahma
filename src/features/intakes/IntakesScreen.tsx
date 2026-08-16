import { useMemo, useState } from "react";
import { Badge, Btn, Card, Icon, Section, Select, Toggle } from "@/components/ui";
import { Field, Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/chrome/Toast";
import { ErrorState, Loading } from "@/features/_shared/states";
import {
  useDeleteIntakeMoment,
  useDeleteIntakeChoices,
  DEFAULT_INTAKE_MESSAGE,
  DEFAULT_INTAKE_THANK_YOU_TEXT,
  FIXED_INTAKE_END,
  FIXED_INTAKE_START,
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

type IntakeResponse = {
  id: string;
  choices: IntakeMoment["intake_choices"];
  children: { id: string; name: string; attended: boolean }[];
  childNames: string[];
  intakeSlotId: string | null;
  otherText: string | null;
  note: string | null;
  updatedAt: string;
};

function groupResponses(choices: IntakeMoment["intake_choices"], attendedIds: Set<string>): IntakeResponse[] {
  const grouped = new Map<string, IntakeMoment["intake_choices"]>();
  for (const choice of choices) {
    const current = grouped.get(choice.response_group_id) ?? [];
    current.push(choice);
    grouped.set(choice.response_group_id, current);
  }

  return [...grouped.entries()].map(([id, group]) => {
    const latest = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const children = group.map((choice) => ({
      id: choice.enrollment_id,
      name: choice.enrollments?.child_name ?? "Onbekende inschrijving",
      attended: attendedIds.has(choice.enrollment_id),
    })).sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return {
      id,
      choices: group,
      children,
      childNames: children.map((child) => child.name),
      intakeSlotId: latest.intake_slot_id,
      otherText: latest.other_text,
      note: latest.note,
      updatedAt: latest.updated_at,
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

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
  return { date: date ?? tomorrow, start_time: FIXED_INTAKE_START, end_time: FIXED_INTAKE_END, position };
}

export function IntakesScreen() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useIntakeMoments();
  const setStatus = useSetIntakeStatus();
  const remove = useDeleteIntakeMoment();
  const removeChoice = useDeleteIntakeChoices();
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

  const deleteChoice = async (response: IntakeResponse) => {
    const names = response.childNames.join(", ");
    if (!confirm(`Intakekeuze voor ${names} verwijderen? De persoonlijke ouderlink blijft werken en toont daarna opnieuw het keuzeformulier.`)) return;
    try {
      await removeChoice.mutateAsync(response.choices.map((choice) => choice.id));
      toast(`Intakekeuze voor ${names} verwijderd`);
    } catch (err) {
      toast("Keuze verwijderen mislukt: " + (err instanceof Error ? err.message : "onbekend"));
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
            const attendedIds = new Set(moment.intake_attendance.filter((attendance) => attendance.attended).map((attendance) => attendance.enrollment_id));
            const responses = groupResponses(moment.intake_choices, attendedIds);
            const responsesBySlot = new Map<string, IntakeResponse[]>();
            for (const response of responses) {
              if (!response.intakeSlotId) continue;
              const current = responsesBySlot.get(response.intakeSlotId) ?? [];
              current.push(response);
              responsesBySlot.set(response.intakeSlotId, current);
            }
            const otherResponses = responses.filter((response) => !response.intakeSlotId && response.otherText);
            const otherChildCount = otherResponses.reduce((total, response) => total + response.childNames.length, 0);
            const slotById = new Map(moment.intake_slots.map((slot) => [slot.id, slot]));
            const chosenEnrollmentIds = new Set(moment.intake_choices.map((choice) => choice.enrollment_id));
            const attendeesWithoutChoice = moment.intake_attendance.filter((attendance) =>
              attendance.attended && !chosenEnrollmentIds.has(attendance.enrollment_id));
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
                    <Btn size="sm" kind="danger" icon="trash" onClick={() => void deleteMoment(moment)}>Verwijderen</Btn>
                  </div>
                }
              >
                <div className="intake-summary">
                  <div>
                    <div className="text-xs text-subtle font-semibold intake-kicker">Beschrijving</div>
                    <div className="intake-description">{moment.description}</div>
                    {moment.allow_other && <div className="mt-2"><Badge kind="info">Ander moment toegestaan</Badge></div>}
                  </div>
                  <div className="intake-meta-card">
                    <span className="text-xs text-subtle">Duur per intake</span>
                    <strong>{moment.duration_text}</strong>
                  </div>
                  <div className="intake-meta-card">
                    <span className="text-xs text-subtle">Reacties</span>
                    <strong>{responses.length} {responses.length === 1 ? "afspraak" : "afspraken"}</strong>
                    <span className="text-xs text-subtle">{moment.intake_choices.length} {moment.intake_choices.length === 1 ? "kind" : "kinderen"}</span>
                  </div>
                  <div className="intake-meta-card">
                    <span className="text-xs text-subtle">Aanwezig</span>
                    <strong>{attendedIds.size}</strong>
                    <span className="text-xs text-subtle">kind{attendedIds.size === 1 ? "" : "eren"}</span>
                  </div>
                </div>

                <div className="intake-slot-list">
                  {moment.intake_slots.map((slot) => {
                    const slotResponses = responsesBySlot.get(slot.id) ?? [];
                    const childCount = slotResponses.reduce((total, response) => total + response.childNames.length, 0);
                    return (
                      <div className="intake-slot-admin" key={slot.id}>
                        <div className="intake-slot-date">
                          <Icon name="calendar" size={15} />
                          <div><strong>{dateLabel(slot.date)}</strong><span>{timeLabel(slot.start_time)} – {timeLabel(slot.end_time)}</span></div>
                        </div>
                        <Badge kind={slotResponses.length ? "primary" : "default"}>
                          {slotResponses.length} {slotResponses.length === 1 ? "afspraak" : "afspraken"} · {childCount} {childCount === 1 ? "kind" : "kinderen"}
                        </Badge>
                        <div className="intake-slot-names">
                          {slotResponses.length ? slotResponses.map((response) => response.childNames.join(", ")).join(" · ") : "Nog niemand"}
                        </div>
                      </div>
                    );
                  })}
                  {(moment.allow_other || otherResponses.length > 0) && (
                    <div className="intake-slot-admin">
                      <div className="intake-slot-date">
                        <Icon name="edit" size={15} />
                        <div><strong>Ander moment</strong><span>Vrij tekstveld</span></div>
                      </div>
                      <Badge kind={otherResponses.length ? "primary" : "default"}>
                        {otherResponses.length} {otherResponses.length === 1 ? "afspraak" : "afspraken"} · {otherChildCount} {otherChildCount === 1 ? "kind" : "kinderen"}
                      </Badge>
                      <div className="intake-slot-names">
                        {otherResponses.length
                          ? otherResponses.map((response) => `${response.childNames.join(", ")}: ${response.otherText}`).join(" · ")
                          : "Nog niemand"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="intake-responses-head">
                  <div>
                    <div className="font-semibold">Inschrijvingen en hun keuze</div>
                    <div className="text-xs text-subtle">Eén rij per ouderreactie; meerdere kinderen vormen samen één afspraak.</div>
                  </div>
                </div>
                <div className="scroll-x">
                  <table className="table" style={{ minWidth: 980 }}>
                    <thead><tr><th>Kinderen</th><th>Gekozen moment</th><th>Opmerkingen</th><th>Aanwezig</th><th>Gekozen / gewijzigd op</th><th style={{ width: 1 }}></th></tr></thead>
                    <tbody>
                      {responses.map((response) => {
                        const slot = response.intakeSlotId ? slotById.get(response.intakeSlotId) : undefined;
                        return (
                          <tr key={response.id}>
                            <td><div className="font-semibold">{response.childNames.join(", ")}</div><div className="text-xs text-subtle">{response.childNames.length} {response.childNames.length === 1 ? "kind" : "kinderen"}</div></td>
                            <td>{slot
                              ? `${dateLabel(slot.date)} · ${timeLabel(slot.start_time)} – ${timeLabel(slot.end_time)}`
                              : response.otherText ? `Anders: ${response.otherText}` : "—"}</td>
                            <td className="intake-response-note">{response.note || "—"}</td>
                            <td><div className="flex-col gap-1">{response.children.map((child) => (
                              <span className="text-xs flex items-center gap-1" key={child.id}>
                                <Icon name={child.attended ? "check" : "x"} size={12} /> {child.name}
                              </span>
                            ))}</div></td>
                            <td className="text-subtle">{dateTimeLabel(response.updatedAt)}</td>
                            <td><Btn size="sm" kind="danger" icon="trash" disabled={removeChoice.isPending} onClick={() => void deleteChoice(response)}>Verwijderen</Btn></td>
                          </tr>
                        );
                      })}
                      {attendeesWithoutChoice.map((attendance) => (
                        <tr key={`attendance-${attendance.enrollment_id}`}>
                          <td className="font-semibold">{attendance.enrollments?.child_name ?? "Onbekende inschrijving"}</td>
                          <td className="text-subtle">Geen keuze opgeslagen</td>
                          <td>—</td>
                          <td><span className="text-xs flex items-center gap-1"><Icon name="check" size={12} /> Aanwezig</span></td>
                          <td className="text-subtle">{dateTimeLabel(attendance.updated_at)}</td>
                          <td></td>
                        </tr>
                      ))}
                      {responses.length === 0 && attendeesWithoutChoice.length === 0 && <tr><td colSpan={6}><div className="empty">Nog geen keuzes of aanwezigheid geregistreerd.</div></td></tr>}
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
  const [allowOther, setAllowOther] = useState(initial.allow_other ?? false);
  const [messageTemplate, setMessageTemplate] = useState(initial.message_template ?? DEFAULT_INTAKE_MESSAGE);
  const [thankYouText, setThankYouText] = useState(initial.thank_you_text ?? DEFAULT_INTAKE_THANK_YOU_TEXT);
  const [slots, setSlots] = useState<IntakeSlotInput[]>(() =>
    initial.intake_slots?.length
      ? initial.intake_slots.map((slot, position) => ({
          ...slot,
          start_time: FIXED_INTAKE_START,
          end_time: FIXED_INTAKE_END,
          position,
        }))
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

  const valid = description.trim() && duration.trim() && messageTemplate.trim() && messageTemplate.length <= 5000
    && thankYouText.trim() && thankYouText.length <= 2000 && slots.length > 0
    && slots.every((slot) => slot.date);

  const onSave = async () => {
    if (!valid) return;
    try {
      await save.mutateAsync({
        id: initial.id,
        description,
        duration_text: duration,
        status,
        allow_other: allowOther,
        message_template: messageTemplate,
        thank_you_text: thankYouText,
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
      <Field label="Bericht voor ouders">
        <textarea className="textarea" rows={5} maxLength={5000} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} />
        <div className="text-xs text-subtle mt-1">Gebruik <code>[link]</code> op de plek waar de persoonlijke intakeformulierlink moet komen.</div>
      </Field>
      <Field label="Tekst op bedanktscherm">
        <textarea className="textarea" rows={3} maxLength={2000} value={thankYouText} onChange={(event) => setThankYouText(event.target.value)} />
        <div className="text-xs text-subtle mt-1">Deze tekst verschijnt nadat de ouder de intakevoorkeur heeft opgeslagen.</div>
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
      <div className="intake-other-setting">
        <Toggle checked={allowOther} onChange={setAllowOther} label="Een ander moment toestaan" />
        <div className="text-xs text-subtle">De inschrijving krijgt dan naast de vaste data een optie “Anders” met een vrij tekstveld.</div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div>
          <div className="font-semibold text-sm">Datum- en tijdopties</div>
          <div className="text-xs text-subtle">De vaste intaketijd is altijd 09:00 – 12:00.</div>
        </div>
        <Btn size="sm" icon="plus" onClick={() => setSlots((current) => [...current, emptySlot(current.length, current.at(-1)?.date)])}>Datum toevoegen</Btn>
      </div>

      <div className="flex-col gap-2">
        {slots.map((slot, index) => (
          <div className="intake-slot-editor" key={slot.id ?? index}>
            <input className="input" type="date" aria-label={`Datum ${index + 1}`} value={slot.date} onChange={(event) => patchSlot(index, { date: event.target.value })} />
            <div className="intake-slot-fixed-time"><Icon name="clock" size={15} /> 09:00 – 12:00</div>
            <Btn kind="ghost" icon="trash" aria-label={`Optie ${index + 1} verwijderen`} title={slot.id && selectedSlotIds.has(slot.id) ? "Deze optie is al gekozen" : "Optie verwijderen"} disabled={!!slot.id && selectedSlotIds.has(slot.id)} onClick={() => removeSlot(index)} />
          </div>
        ))}
        {slots.length === 0 && <div className="error-banner">Voeg minimaal één datum en tijd toe.</div>}
      </div>
      {status === "actief" && <div className="intake-active-note"><Icon name="check" size={14} /> Dit moment wordt het enige actieve intakeformulier. Een eerder actief moment verloopt automatisch.</div>}
    </Modal>
  );
}
