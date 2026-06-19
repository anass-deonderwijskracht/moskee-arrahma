// UI atoms — ported from the prototype's shared.jsx to typed React.
import type { ReactNode, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";
import {
  Home, Users, User, BookOpen, Calendar, Inbox, Coins, School, Settings, Search,
  Bell, Plus, ChevronRight, ChevronDown, ChevronLeft, ArrowUp, ArrowDown, Check, X,
  Ellipsis, Filter, Menu, PanelLeft, PanelRight, Star, Download, Upload, Pencil,
  Trash2, Mail, Phone, MapPin, Eye, Clock, LayoutGrid, LayoutList, Sparkles, Activity,
  List, Flag, ChartLine, LogOut, Copy, Baby, Presentation, Archive, ArchiveRestore,
  type LucideIcon,
} from "lucide-react";

// Our stable icon vocabulary, mapped onto the lucide-react pack so the rest of
// the app keeps using <Icon name="…" /> while every glyph is professionally drawn.
const ICONS = {
  home: Home, users: Users, user: User, book: BookOpen, calendar: Calendar,
  inbox: Inbox, coins: Coins, school: School, settings: Settings, search: Search,
  bell: Bell, plus: Plus, chevronRight: ChevronRight, chevronDown: ChevronDown,
  chevronLeft: ChevronLeft, arrowUp: ArrowUp, arrowDown: ArrowDown, check: Check,
  x: X, dots: Ellipsis, filter: Filter, more: Ellipsis, menu: Menu,
  panelLeft: PanelLeft, panelRight: PanelRight, star: Star, download: Download,
  upload: Upload, edit: Pencil, trash: Trash2, mail: Mail, phone: Phone, pin: MapPin,
  eye: Eye, clock: Clock, layoutGrid: LayoutGrid, layoutList: LayoutList,
  sparkles: Sparkles, activity: Activity, list: List, flag: Flag, chart: ChartLine,
  logout: LogOut, copy: Copy, child: Baby, presentation: Presentation,
  archive: Archive, restore: ArchiveRestore,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name, size = 16, weight = 1.8, ...rest
}: { name: IconName | string; size?: number; weight?: number } & Omit<React.SVGProps<SVGSVGElement>, "stroke">) {
  const Glyph = ICONS[name as IconName] ?? Ellipsis;
  return <Glyph width={size} height={size} strokeWidth={weight} absoluteStrokeWidth {...rest} />;
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
