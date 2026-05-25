import { useMemo, useState } from "react";
import { Section, Card, Pills, Icon, type Option, type BadgeKind } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useClasses } from "@/data/classes";
import { useCurrentSchooljaar } from "@/data/schooljaren";
import { Roostermatrix } from "./Roostermatrix";

type View = "calendar" | "table" | "rooster";

interface Ev { id: string; title: string; day: "Zaterdag" | "Zondag"; start: string; end: string; teacher: string; location: string; color: string; }

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const DAYS: Ev["day"][] = ["Zaterdag", "Zondag"];

export function PlanningScreen() {
  const { data: sj } = useCurrentSchooljaar();
  const { data: classes, isLoading } = useClasses(sj?.id ?? null);
  const [view, setView] = useState<View>("rooster");

  const events: Ev[] = useMemo(() =>
    (classes ?? [])
      .filter((c) => !c.historic && !c.is_next && (c.day === "Zaterdag" || c.day === "Zondag"))
      .map((c) => {
        const [start, end] = (c.time ?? "00:00 - 00:00").split(" - ");
        return { id: c.id, title: c.code, day: c.day as Ev["day"], start, end, teacher: c.teacher?.short ?? "—", location: c.location ?? "", color: c.color ?? "primary" };
      }), [classes]);

  const viewPills: Option<View>[] = [
    { value: "calendar", label: "Kalender" },
    { value: "table", label: "Tabel" },
    { value: "rooster", label: "Docentenrooster" },
  ];

  return (
    <Section title="Planning" sub="Weekoverzicht, roosters en docententoewijzing per lesweek" actions={<Pills value={view} onChange={setView} options={viewPills} />}>
      {view === "rooster" ? <Roostermatrix /> : isLoading ? <Loading /> : view === "calendar" ? <Calendar events={events} /> : <PlanningTable events={events} />}
    </Section>
  );
}

function Calendar({ events }: { events: Ev[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(2, 1fr)" }}>
        <div className="cal-head" style={{ background: "var(--bg-sunken)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
        {DAYS.map((d) => <div key={d} className="cal-head"><span className="day">{d}</span></div>)}
        {HOURS.map((h, hi) => (
          <div key={hi} style={{ display: "contents" }}>
            <div className="cal-time" style={{ height: 80 }}>{h}</div>
            {DAYS.map((d) => {
              const cell = events.filter((ev) => ev.day === d && parseInt(ev.start.split(":")[0]) === parseInt(h.split(":")[0]));
              return (
                <div key={d + hi} className="cal-cell" style={{ height: 80 }}>
                  {cell.map((ev, i) => {
                    const startM = parseInt(ev.start.split(":")[1]);
                    const dur = (parseInt(ev.end.split(":")[0]) - parseInt(ev.start.split(":")[0])) * 60 + (parseInt(ev.end.split(":")[1]) - startM);
                    const cols = cell.length;
                    const w = 100 / cols;
                    return (
                      <div key={ev.id} className={"cal-event " + (ev.color || "")}
                        style={{ position: "absolute", top: (startM / 60) * 80 + 4, height: (dur / 60) * 80 - 8, left: `calc(${i * w}% + 4px)`, width: `calc(${w}% - 6px)`, padding: "6px 8px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                        <div className="ttl">{ev.title}</div>
                        <div className="who">{ev.teacher}</div>
                        {dur >= 120 && <div className="who" style={{ marginTop: "auto", fontSize: 10.5 }}>{ev.start} – {ev.end} · {ev.location}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanningTable({ events }: { events: Ev[] }) {
  const sorted = [...events].sort((a, b) => (a.day === b.day ? a.start.localeCompare(b.start) : a.day === "Zaterdag" ? -1 : 1));
  return (
    <Card>
      <table className="table">
        <thead><tr><th>Dag</th><th>Tijd</th><th>Sessie</th><th>Docent</th><th>Locatie</th><th></th></tr></thead>
        <tbody>
          {sorted.map((ev) => (
            <tr key={ev.id}>
              <td className="font-semibold">{ev.day}</td>
              <td className="font-mono text-sm tabular">{ev.start} – {ev.end}</td>
              <td><div className="flex items-center gap-2"><span style={{ width: 4, height: 18, background: `var(--${ev.color as BadgeKind})`, borderRadius: 2 }} /><span className="font-semibold">{ev.title}</span></div></td>
              <td className="text-sm">{ev.teacher}</td>
              <td className="text-sm">{ev.location}</td>
              <td><Icon name="chevronRight" size={14} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
