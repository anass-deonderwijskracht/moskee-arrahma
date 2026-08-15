import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@/components/ui";
import { usePublicIntake, useSubmitPublicIntake, type PublicIntake } from "@/data/intakes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function timeLabel(value: string) {
  return value.slice(0, 5);
}

function slotLabel(slot: PublicIntake["slots"][number]) {
  return `${dateLabel(slot.date)} van ${timeLabel(slot.start_time)} tot ${timeLabel(slot.end_time)}`;
}

export function PublicIntakePage() {
  const { token } = useParams();
  const safeToken = token && UUID_PATTERN.test(token) ? token : undefined;
  const { data, isLoading, isError } = usePublicIntake(safeToken);
  const submit = useSubmitPublicIntake(safeToken ?? "");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (data?.selection?.slot_id) setSelected(data.selection.slot_id);
  }, [data?.selection?.slot_id]);

  const save = async () => {
    if (!selected || !safeToken) return;
    try {
      await submit.mutateAsync(selected);
      setEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // De foutmelding wordt onder de knop getoond; de gemaakte keuze blijft staan.
    }
  };

  if (!safeToken || (!isLoading && !data) || isError) {
    return (
      <PublicLayout>
        <div className="public-intake-state">
          <div className="public-intake-state-icon"><Icon name="calendar" size={28} /></div>
          <h1>Formulier niet beschikbaar</h1>
          <p>Deze persoonlijke link is ongeldig of er is op dit moment geen actief intakemoment. Neem contact op met Moskee Arrahma.</p>
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
  if (data.selection && selectedSlot && !editing) {
    return (
      <PublicLayout>
        <div className="public-intake-confirm">
          <div className="public-intake-check"><Icon name="check" size={30} /></div>
          <div className="public-intake-eyebrow">Voorkeur ontvangen</div>
          <h1>Bedankt, {data.enrollment.child_name}</h1>
          <p>Je intakevoorkeur is opgeslagen. We zien je graag op het onderstaande moment.</p>
          <div className="public-intake-confirm-slot">
            <Icon name="calendar" size={20} />
            <div><span>Gekozen intakemoment</span><strong>{slotLabel(selectedSlot)}</strong></div>
          </div>
          <div className="public-intake-duration"><Icon name="clock" size={16} /> Duur: {data.moment.duration_text}</div>
          <button className="public-intake-secondary" type="button" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Voorkeur wijzigen</button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="public-intake-head">
        <div className="public-intake-eyebrow">Persoonlijke intake-uitnodiging</div>
        <h1>Welkom, {data.enrollment.child_name}</h1>
        <p className="public-intake-description">{data.moment.description}</p>
        <div className="public-intake-duration"><Icon name="clock" size={16} /> Duur per intake: {data.moment.duration_text}</div>
      </div>

      <div className="public-intake-form">
        <div className="public-intake-form-head">
          <div>
            <h2>Kies je voorkeursmoment</h2>
            <p>Selecteer één datum en tijd. Je kunt deze keuze later via dezelfde link wijzigen.</p>
          </div>
          <span>1 keuze</span>
        </div>

        <fieldset className="public-intake-options">
          <legend className="sr-only">Beschikbare intakemomenten</legend>
          {data.slots.map((slot) => {
            const checked = selected === slot.id;
            return (
              <label className={`public-intake-option${checked ? " selected" : ""}`} key={slot.id}>
                <input type="radio" name="intake-slot" value={slot.id} checked={checked} onChange={() => setSelected(slot.id)} />
                <span className="public-intake-radio"><Icon name="check" size={13} /></span>
                <span className="public-intake-option-date"><strong>{dateLabel(slot.date)}</strong><span>{timeLabel(slot.start_time)} – {timeLabel(slot.end_time)} uur</span></span>
                <Icon name="chevronRight" size={18} className="public-intake-chevron" />
              </label>
            );
          })}
        </fieldset>

        {data.slots.length === 0 && <div className="public-intake-error">Er zijn nog geen beschikbare momenten. Neem contact op met Moskee Arrahma.</div>}
        {submit.isError && <div className="public-intake-error" role="alert">Opslaan is niet gelukt. Controleer je verbinding en probeer het opnieuw.</div>}

        <div className="public-intake-actions">
          {data.selection && <button className="public-intake-secondary" type="button" onClick={() => setEditing(false)}>Annuleren</button>}
          <button className="public-intake-submit" type="button" disabled={!selected || submit.isPending} onClick={() => void save()}>
            {submit.isPending ? "Bezig met opslaan…" : data.selection ? "Wijziging opslaan" : "Voorkeur verzenden"}
            {!submit.isPending && <Icon name="chevronRight" size={18} />}
          </button>
        </div>
      </div>
    </PublicLayout>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-intake-page">
      <div className="public-intake-glow public-intake-glow-one" />
      <div className="public-intake-glow public-intake-glow-two" />
      <div className="public-intake-shell">
        <header className="public-intake-brand">
          <img src="/branding/moskee-arrahma-logo.png" alt="Moskee Arrahma" />
          <div><strong>Moskee Arrahma</strong><span>Weekendonderwijs</span></div>
        </header>
        <section className="public-intake-card">{children}</section>
        <footer>Je persoonlijke link · Deel deze link niet met anderen</footer>
      </div>
    </main>
  );
}
