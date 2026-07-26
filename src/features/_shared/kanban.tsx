import { Select } from "@/components/ui";

/**
 * Statuskiezer onderaan een kanban-kaart. HTML5 drag-and-drop vuurt geen events
 * op een touchscreen, dus zonder dit is een kaart daar niet te verplaatsen.
 * De CSS toont dit blok alleen onder de mobiele breakpoint; op desktop blijft
 * slepen het enige (en snellere) pad.
 */
export function CardMove({ columns, current, onMove, label = "Status" }: {
  columns: readonly { id: string; title: string }[];
  current: string;
  onMove: (status: string) => void;
  label?: string;
}) {
  return (
    <div className="kcard-move" onClick={(e) => e.stopPropagation()}>
      <span>{label}</span>
      <Select
        aria-label={label}
        value={current}
        onChange={(e) => { if (e.target.value !== current) onMove(e.target.value); }}
      >
        {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </Select>
    </div>
  );
}

/** Lege kolom: op desktop nodigt hij uit tot slepen, op mobiel bestaat dat niet. */
export function EmptyCol() {
  return (
    <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>
      <span className="only-desktop">Sleep een kaart hierheen</span>
      <span className="only-mobile">Nog niets in deze kolom</span>
    </div>
  );
}
