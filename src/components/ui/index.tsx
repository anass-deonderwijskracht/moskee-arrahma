// UI atoms — ported from the prototype's shared.jsx to typed React.
import type { ReactNode, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";

export type IconName =
  | "home" | "users" | "user" | "book" | "calendar" | "inbox" | "coins" | "school"
  | "settings" | "search" | "bell" | "plus" | "chevronRight" | "chevronDown"
  | "chevronLeft" | "arrowUp" | "arrowDown" | "check" | "x" | "dots" | "filter"
  | "more" | "menu" | "panelLeft" | "panelRight" | "star" | "download" | "upload"
  | "edit" | "trash" | "mail" | "phone" | "pin" | "eye" | "clock" | "layoutGrid"
  | "layoutList" | "sparkles" | "activity" | "list" | "flag" | "chart" | "logout" | "copy"
  | "child" | "presentation" | "archive" | "restore";

const ICON_PATHS: Record<string, string> = {
  home: "M3 12L12 4l9 8M5 10v10h14V10",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3 21a9 9 0 0 1 18 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  book: "M4 4h6a4 4 0 0 1 4 4v12M20 4h-6a4 4 0 0 0-4 4v12M4 4v16h16V4",
  calendar: "M4 7h16M4 7v13h16V7M4 7V5h16v2M8 3v4M16 3v4",
  inbox: "M3 13h5l1 3h6l1-3h5M3 13l3-9h12l3 9M3 13v6h18v-6",
  coins: "M12 4a8 4 0 1 0 0 8 8 4 0 0 0 0-8ZM4 8v6c0 2.2 3.6 4 8 4s8-1.8 8-4V8M4 14v4c0 2.2 3.6 4 8 4s8-1.8 8-4v-4",
  school: "M3 10l9-6 9 6-9 6-9-6ZM7 12v6c0 1.5 2.5 3 5 3s5-1.5 5-3v-6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 5l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  search: "M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  bell: "M18 16v-5a6 6 0 0 0-12 0v5l-2 2v1h16v-1l-2-2ZM10 21a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  filter: "M3 5h18M6 12h12M10 19h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  panelLeft: "M4 5h16v14H4V5ZM10 5v14",
  panelRight: "M4 5h16v14H4V5ZM14 5v14",
  star: "M12 3l2.7 6 6.6.6-5 4.5 1.5 6.5L12 17.3 6.2 20.6l1.5-6.5-5-4.5 6.6-.6L12 3Z",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  upload: "M12 20V8m0 0l-4 4m4-4l4 4M4 4h16",
  edit: "M16 4l4 4-11 11H5v-4L16 4Z",
  trash: "M5 7h14m-2 0v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7m3 0V4h4v3M10 11v6M14 11v6",
  mail: "M3 7h18v12H3V7Zm0 0l9 7 9-7",
  phone: "M5 4h4l2 5-2 1a12 12 0 0 0 5 5l1-2 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  pin: "M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12ZM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  layoutGrid: "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
  layoutList: "M3 6h18M3 12h18M3 18h18",
  sparkles: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  flag: "M4 21V4m0 0h12l-2 4 2 4H4",
  chart: "M3 3v18h18M7 14l3-3 3 3 5-5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  copy: "M9 9h10v10H9V9ZM5 15H4V4h11v1",
  child: "M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7 13l2-1a6 6 0 0 1 6 0l2 1M12 11v5M9 21l3-5 3 5",
  presentation: "M3 4h18M4 4v10h16V4M12 14v4M9 21l3-3 3 3",
  archive: "M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8ZM3 4h18v4H3V4ZM10 12h4",
  restore: "M3 12a9 9 0 1 0 2.6-6.4M3 4v4h4",
};

export function Icon({
  name, size = 16, weight = 1.6, ...rest
}: { name: IconName | string; size?: number; weight?: number } & Omit<React.SVGProps<SVGSVGElement>, "stroke">) {
  const d = ICON_PATHS[name] || ICON_PATHS.dots;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={d} />
    </svg>
  );
}

type AvatarSize = "sm" | "md" | "lg" | "xl";
export function Avatar({ name, initials, size = "md" }: { name?: string; initials?: string; size?: AvatarSize }) {
  const cls = "avatar " + (size === "sm" ? "sm" : size === "lg" ? "lg" : size === "xl" ? "xl" : "");
  const ini = initials || (name ? name.split(" ").map((n) => n[0]).slice(0, 2).join("") : "?");
  return <div className={cls.trim()} title={name}>{ini}</div>;
}

export type BadgeKind = "default" | "success" | "warn" | "danger" | "info" | "accent" | "primary";
export function Badge({ kind = "default", children, dot = false }: { kind?: BadgeKind; children: ReactNode; dot?: boolean }) {
  return (
    <span className={"badge " + (kind === "default" ? "" : kind)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

type BtnProps = {
  kind?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "lg";
  icon?: IconName;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
export function Btn({ kind = "default", size, icon, children, type = "button", ...rest }: BtnProps) {
  const cls = ["btn"];
  if (kind === "primary") cls.push("primary");
  else if (kind === "ghost") cls.push("ghost");
  else if (kind === "danger") cls.push("danger");
  if (size === "sm") cls.push("sm");
  if (size === "lg") cls.push("lg");
  return (
    <button type={type} className={cls.join(" ")} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function Card({
  title, sub, action, children, className = "",
}: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={"card " + className}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <div className="card-sub mt-1">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label, value, delta, icon, deltaKind, sub,
}: {
  label: ReactNode; value: ReactNode; delta?: ReactNode; icon?: IconName;
  deltaKind?: "up" | "down" | ""; sub?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="label">{icon && <Icon name={icon} size={14} />}{label}</div>
      <div className="value">{value}</div>
      {(delta || sub) && (
        <div className={"delta " + (deltaKind || "")}>
          {delta && <Icon name={deltaKind === "up" ? "arrowUp" : deltaKind === "down" ? "arrowDown" : "activity"} size={12} />}
          {delta || sub}
        </div>
      )}
    </div>
  );
}

export type Option<T extends string = string> = { value: T; label: string };

export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o.value} className={"pill " + (value === o.value ? "active" : "")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Option<T>[] }) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.value} className={"tab " + (value === o.value ? "active" : "")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}

export function QBar({ value, max = 100, thick = false }: { value: number; max?: number; thick?: boolean }) {
  return (
    <div className={"qbar" + (thick ? " thick" : "")}>
      <div className="fill" style={{ width: Math.min(100, (value / max) * 100) + "%" }} />
    </div>
  );
}

/** Modern custom select — applies the prototype's `.select` styling. */
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={("select " + className).trim()} {...rest}>
      {children}
    </select>
  );
}

export const EUR = (n: number) =>
  "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Format a 0..1 ratio (or null) as a whole-percent string. */
export const pct = (v: number | null | undefined) => (v == null ? "—" : Math.round(v * 100) + "%");

/** Threshold colouring used across metric tiles (>0.9 good, <0.8 bad). */
export const metricKind = (v: number | null | undefined): BadgeKind =>
  v == null ? "default" : v >= 0.9 ? "success" : v < 0.8 ? "danger" : "warn";
