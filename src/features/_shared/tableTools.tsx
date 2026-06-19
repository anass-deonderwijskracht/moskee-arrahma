// Shared table tooling: search + column sorting + row selection, plus the
// matching UI atoms. One source of truth so every list table behaves identically.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Btn, Icon } from "@/components/ui";

export type SortDir = "asc" | "desc";
export type Sort<K extends string = string> = { key: K; dir: SortDir };
type Sortable = string | number | null | undefined;

interface Opts<T, K extends string> {
  rows: T[];
  getId: (row: T) => string;
  /** Return true when the row matches the (already lower-cased, trimmed) query. */
  search?: (row: T, q: string) => boolean;
  sorters?: Record<K, (row: T) => Sortable>;
  initialSort?: { key: NoInfer<K>; dir: SortDir };
}

export function useTableTools<T, K extends string>({ rows, getId, search, sorters, initialSort }: Opts<T, K>) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort<K> | null>(initialSort ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const view = useMemo(() => {
    const term = q.trim().toLowerCase();
    let r = rows;
    if (term && search) r = r.filter((row) => search(row, term));
    if (sort && sorters) {
      const acc = sorters[sort.key];
      const dir = sort.dir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => {
        const av = acc(a), bv = acc(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;           // nulls/empties last, regardless of dir
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "nl") * dir;
      });
    }
    return r;
  }, [rows, q, sort, search, sorters]);

  const toggleSort = (key: K) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const ids = view.map(getId);
  const allChecked = ids.length > 0 && ids.every((id) => checked.has(id));
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setChecked(new Set());

  // Selected ids restricted to currently-visible rows (filters out stale ids
  // from rows that disappeared after a search/filter change).
  const selectedIds = view.map(getId).filter((id) => checked.has(id));

  return { q, setQ, sort, toggleSort, view, checked, allChecked, toggleAll, toggleOne, clear, selectedIds };
}

/** A clickable, sortable column header. */
export function SortTh<K extends string>({ label, k, sort, onSort, style }: {
  label: ReactNode; k: K; sort: Sort<K> | null; onSort: (k: K) => void; style?: CSSProperties;
}) {
  const active = sort?.key === k;
  return (
    <th onClick={() => onSort(k)} style={{ cursor: "pointer", userSelect: "none", ...style }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <Icon name={active ? (sort!.dir === "asc" ? "arrowUp" : "arrowDown") : "chevronDown"} size={12} style={{ opacity: active ? 1 : 0.3 }} />
      </span>
    </th>
  );
}

/** Header checkbox that selects/deselects all visible rows. */
export function SelectTh({ allChecked, onToggle }: { allChecked: boolean; onToggle: () => void }) {
  return (
    <th style={{ width: 40 }} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={allChecked} onChange={onToggle} aria-label="Alles selecteren" />
    </th>
  );
}

/** Per-row checkbox cell. Stops propagation so it doesn't trigger row navigation. */
export function SelectTd({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label?: string }) {
  return (
    <td onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={label ?? "Rij selecteren"} />
    </td>
  );
}

/** Search input with a leading magnifier icon. */
export function SearchBox({ value, onChange, placeholder, width = 240 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  return (
    <div style={{ position: "relative", width }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)", pointerEvents: "none" }}>
        <Icon name="search" size={15} />
      </span>
      <input className="input" style={{ paddingLeft: 32 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Bulk-action bar shown above a table when one or more rows are selected. */
export function BulkBar({ count, onClear, onDelete, pending, noun = "rij(en)" }: {
  count: number; onClear: () => void; onDelete: () => void; pending?: boolean; noun?: string;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
      <span className="text-sm font-semibold">{count} {noun} geselecteerd</span>
      <Btn kind="ghost" size="sm" onClick={onClear}>Wissen</Btn>
      <Btn kind="danger" size="sm" icon="trash" onClick={onDelete} disabled={pending}>Verwijderen</Btn>
    </div>
  );
}
