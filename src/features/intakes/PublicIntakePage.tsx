import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@/components/ui";
import {
  usePublicIntake,
  useSubmitPublicIntake,
  type LessonDayPreference,
  type PublicIntake,
} from "@/data/intakes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OTHER_VALUE = "__other__";
const LESSON_DAYS: LessonDayPreference[] = ["Zaterdag", "Zondag", "Geen voorkeur"];

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function timeLabel(value: string) {
  return value.slice(0, 5);
}

function slotLabel(slot: PublicIntake["slots"][number]) {
  return `${dateLabel(slot.date)}, ${timeLabel(slot.start_time)}–${timeLabel(slot.end_time)}`;
}

export function PublicIntakePage() {
  const { token } = useParams();
  const safeToken = token && UUID_PATTERN.test(token) ? token : undefined;
  const { data, isLoading, isError } = usePublicIntake(safeToken);
  const submit = useSubmitPublicIntake(safeToken ?? "");
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [lessonDays, setLessonDays] = useState<Record<string, LessonDayPreference>>({});
  const [selected, setSelected] = useState("");
  const [otherText, setOtherText] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSelectedChildren(data.selection?.enrollment_ids ?? []);
    setLessonDays(Object.fromEntries(data.enrollments.map((enrollment) => [
      enrollment.id,
      enrollment.preferred_lesday ?? "Geen voorkeur",
    ])));
    setNote(data.selection?.note ?? "");
    if (data.selection?.other_text) {
      setSelected(OTHER_VALUE);
      setOtherText(data.selection.other_text);
    } else if (data.selection?.slot_id) {
      setSelected(data.selection.slot_id);
      setOtherText("");
    } else {
      setSelected("");
      setOtherText("");
    }
  }, [data]);

  const choosingOther = selected === OTHER_VALUE;
  const canSubmit = selectedChildren.length > 0 && !!selected && (!choosingOther || !!otherText.trim());

  const toggleChild = (id: string) => {
    setSelectedChildren((current) => current.includes(id)
      ? current.filter((childId) => childId !== id)
      : [...current, id]);
  };

  const save = async () => {
    if (!canSubmit || !safeToken) return;
    try {
      await submit.mutateAsync({
        enrollmentIds: selectedChildren,
        slotId: choosingOther ? null : selected,
        otherText: choosingOther ? otherText.trim() : null,
        note: note.trim() || null,
        lessonDayPreferences: Object.fromEntries(selectedChildren.map((id) => [id, lessonDays[id] ?? "Geen voorkeur"])),
      });
      setEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // De foutmelding wordt onder het formulier getoond; de invoer blijft staan.
    }
  };

  if (!safeToken || (!isLoading && !data) || isError) {
    return (
      <PublicLayout>
        <div className="public-intake-state">
          <h1>Formulier niet beschikbaar</h1>
          <p>Deze persoonlijke link is ongeldig of er is nu geen actief intakemoment. Neem contact op met Moskee Arrahma.</p>
        </div>
      </PublicLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <PublicLayout>
        <div className="public-intake-state" aria-live="polite">
          <div className="spinner" />
          <p>Intakeformulier laden…</p>
        </div>
      </PublicLayout>
    );
  }

  const selectedSlot = data.slots.find((slot) => slot.id === data.selection?.slot_id);
  const savedOtherText = data.selection?.other_text?.trim() ?? "";
  const savedChildren = data.enrollments.filter((enrollment) => data.selection?.enrollment_ids.includes(enrollment.id));
  if (data.selection && savedChildren.length > 0 && (selectedSlot || savedOtherText) && !editing) {
    return (
      <PublicLayout>
        <div className="public-intake-confirm">
          <div className="public-intake-saved"><Icon name="check" size={15} /> Voorkeur opgeslagen</div>
          <h1>Bedankt</h1>
          <p>De intakevoorkeur is ontvangen.</p>
          <div className="public-intake-confirm-grid">
            <div className="public-intake-confirm-slot">
              <Icon name="users" size={18} />
              <div>
                <span>{savedChildren.length === 1 ? "Kind" : "Kinderen"}</span>
                <div className="public-intake-confirm-children">
                  {savedChildren.map((child) => (
                    <strong key={child.id}>{child.first_name}<small>{child.preferred_lesday}</small></strong>
                  ))}
                </div>
              </div>
            </div>
            <div className="public-intake-confirm-slot">
              <Icon name={selectedSlot ? "calendar" : "edit"} size={18} />
              <div>
                <span>Gekozen moment</span>
                <strong>{selectedSlot ? slotLabel(selectedSlot) : `Anders: ${savedOtherText}`}</strong>
              </div>
            </div>
            {data.selection.note && (
              <div className="public-intake-confirm-note">
                <span>Opmerkingen</span>
                <p>{data.selection.note}</p>
              </div>
            )}
          </div>
          <p className="public-intake-duration"><Icon name="clock" size={15} /> Duur van de afspraak: {data.moment.duration_text}</p>
          <button className="public-intake-secondary" type="button" onClick={() => setEditing(true)}>Voorkeur wijzigen</button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="public-intake-head">
        <h1>Intakeformulier</h1>
        <p className="public-intake-description">{data.moment.description}</p>
        <p className="public-intake-duration"><Icon name="clock" size={15} /> Duur van de afspraak: {data.moment.duration_text}</p>
      </div>

      <div className="public-intake-form">
        <fieldset className="public-intake-section">
          <legend><span>1</span> Om welke kinderen gaat het?</legend>
          <p>Selecteer één of meerdere kinderen. De afspraak duurt even lang, ongeacht het aantal kinderen.</p>
          <div className="public-intake-children">
            {data.enrollments.map((enrollment) => {
              const checked = selectedChildren.includes(enrollment.id);
              return (
                <div className={`public-intake-child-group${checked ? " selected" : ""}`} key={enrollment.id}>
                  <label className={`public-intake-child${checked ? " selected" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleChild(enrollment.id)} />
                    <span className="public-intake-checkbox" aria-hidden="true"><Icon name="check" size={13} /></span>
                    <strong>{enrollment.first_name}</strong>
                  </label>
                  {checked && (
                    <div className="public-intake-lesson-day">
                      <label htmlFor={`lesson-day-${enrollment.id}`}>Voorkeursdag</label>
                      <select id={`lesson-day-${enrollment.id}`} value={lessonDays[enrollment.id] ?? "Geen voorkeur"}
                        onChange={(event) => setLessonDays((current) => ({
                          ...current,
                          [enrollment.id]: event.target.value as LessonDayPreference,
                        }))}>
                        {LESSON_DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="public-intake-section">
          <legend><span>2</span> Kies een moment</legend>
          <p>Kies één optie. Via dezelfde link kun je de keuze later wijzigen.</p>
          <div className="public-intake-options">
            {data.slots.map((slot) => {
              const checked = selected === slot.id;
              return (
                <label className={`public-intake-option${checked ? " selected" : ""}`} key={slot.id}>
                  <input type="radio" name="intake-slot" value={slot.id} checked={checked} onChange={() => setSelected(slot.id)} />
                  <span className="public-intake-radio" aria-hidden="true" />
                  <span className="public-intake-option-date">
                    <strong>{dateLabel(slot.date)}</strong>
                    <span>{timeLabel(slot.start_time)}–{timeLabel(slot.end_time)}</span>
                  </span>
                </label>
              );
            })}

            {data.moment.allow_other && (
              <div className={`public-intake-other${choosingOther ? " selected" : ""}`}>
                <label className={`public-intake-option${choosingOther ? " selected" : ""}`}>
                  <input type="radio" name="intake-slot" value={OTHER_VALUE} checked={choosingOther} onChange={() => setSelected(OTHER_VALUE)} />
                  <span className="public-intake-radio" aria-hidden="true" />
                  <span className="public-intake-option-date"><strong>Anders</strong><span>Geef zelf aan wat mogelijk is</span></span>
                </label>
                {choosingOther && (
                  <div className="public-intake-other-field">
                    <label htmlFor="other-moment">Welke dag of welk tijdstip komt beter uit?</label>
                    <textarea id="other-moment" rows={3} maxLength={500} value={otherText} onChange={(event) => setOtherText(event.target.value)} />
                    <span>{otherText.length}/500</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <div className="public-intake-section">
          <div className="public-intake-section-title"><span>3</span> Opmerkingen <small>optioneel</small></div>
          <label className="sr-only" htmlFor="intake-note">Opmerkingen</label>
          <textarea className="public-intake-note" id="intake-note" rows={4} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="public-intake-counter">{note.length}/1000</div>
        </div>

        {data.slots.length === 0 && !data.moment.allow_other && <div className="public-intake-error">Er zijn nog geen beschikbare momenten. Neem contact op met Moskee Arrahma.</div>}
        {submit.isError && <div className="public-intake-error" role="alert">Opslaan is niet gelukt. Controleer de ingevulde gegevens en probeer het opnieuw.</div>}

        <div className="public-intake-actions">
          {data.selection && <button className="public-intake-secondary" type="button" onClick={() => setEditing(false)}>Annuleren</button>}
          <button className="public-intake-submit" type="button" disabled={!canSubmit || submit.isPending} onClick={() => void save()}>
            {submit.isPending ? "Opslaan…" : data.selection ? "Wijziging opslaan" : "Voorkeur opslaan"}
          </button>
        </div>
      </div>
    </PublicLayout>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="public-intake-page">
      <div className="public-intake-shell">
        <header className="public-intake-brand">Moskee Arrahma <span>Weekendonderwijs</span></header>
        <section className="public-intake-card">{children}</section>
        <footer>Deze link is persoonlijk. Deel hem niet met anderen.</footer>
      </div>
    </main>
  );
}
