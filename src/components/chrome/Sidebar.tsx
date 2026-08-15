import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui";
import { useNavCounts } from "@/data/counts";
import { useAppSettings } from "@/data/finance";
import { useSession } from "@/features/auth/AuthProvider";

type NavItem = { group?: string; id?: string; to?: string; label?: string; icon?: IconName; countKey?: string };

type SidebarProps = {
  /** True zodra de balk zwevend getoond wordt: de knop zet hem dan juist vast. */
  collapsed: boolean;
  /** Inklappen op desktop, lade sluiten op mobiel. */
  onToggle: () => void;
  mobile: boolean;
  /** Houdt het zwevende paneel open zolang de muis erop staat. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function Sidebar({ collapsed, onToggle, mobile, onMouseEnter, onMouseLeave }: SidebarProps) {
  const { data: counts } = useNavCounts();
  const { data: settings } = useAppSettings();
  const { fullName, signOut, isDocent, classId } = useSession();

  const items: NavItem[] = isDocent
    ? [
        { group: "Mijn klas" },
        { to: classId ? `/classes/${classId}` : "/", label: "Mijn klas", icon: "school" },
        { group: "Onderwijs" },
        { to: "/tasks", label: "Taken", icon: "list", countKey: "tasks" },
      ]
    : [
        { group: "Overzicht" },
        { to: "/dashboard", label: "Dashboard", icon: "home" },
        { to: "/planning", label: "Planning", icon: "calendar" },
        { group: "Mensen" },
        { to: "/kinderen", label: "Kinderen", icon: "child", countKey: "kinderen" },
        { to: "/ouders", label: "Ouders & voogden", icon: "users", countKey: "ouders" },
        { to: "/teachers", label: "Docenten", icon: "presentation", countKey: "teachers" },
        { group: "Onderwijs" },
        { to: "/students", label: "Leerlingen (dit jaar)", icon: "school", countKey: "leerlingen" },
        { to: "/classes", label: "Klassen", icon: "layoutGrid", countKey: "classes" },
        { to: "/tasks", label: "Taken", icon: "list", countKey: "tasks" },
        { group: "Administratie" },
        { to: "/enrollments", label: "Inschrijvingen", icon: "inbox", countKey: "enrollments" },
        { to: "/intakes", label: "Intake", icon: "calendar" },
        { to: "/admin-toetsen", label: "Toetsen", icon: "edit" },
        { to: "/finance", label: "Financiën", icon: "coins" },
        { group: "Systeem" },
        { to: "/settings", label: "Instellingen", icon: "settings" },
      ];

  const initials = (fullName || "Beheer").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const toggleLabel = mobile
    ? "Menu sluiten"
    : collapsed
      ? "Zijbalk vastzetten"
      : "Zijbalk inklappen";

  return (
    <aside className="sidebar" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="sidebar-brand">
        <button className="sidebar-toggle" onClick={onToggle} title={toggleLabel} aria-label={toggleLabel}>
          <Icon name={mobile ? "x" : "panelLeft"} size={16} />
        </button>
        <div>
          <div className="name">Moskee Arrahma</div>
          <div className="sub">Weekendonderwijs{settings?.city ? ` · ${settings.city}` : ""}</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {items.map((item, i) =>
          item.group ? (
            <div key={"g" + i} className="sidebar-group">{item.group}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to!}
              className={({ isActive }) => "sidebar-link " + (isActive ? "active" : "")}
            >
              <span className="icon"><Icon name={item.icon!} size={16} /></span>
              <span>{item.label}</span>
              {item.countKey && counts && (counts as Record<string, number | null>)[item.countKey] != null && (
                <span className="count">{(counts as Record<string, number | null>)[item.countKey]}</span>
              )}
            </NavLink>
          ),
        )}
      </nav>
      <div className="sidebar-foot">
        <button className="avatar" title={fullName ?? undefined}>{initials}</button>
        <div className="who">
          <span className="nm">{fullName ?? "Beheerder"}</span>
          <span className="rl">{isDocent ? "Docent" : "Bestuur · Beheerder"}</span>
        </div>
        <button className="btn ghost sm" onClick={() => { void signOut(); }} title="Uitloggen" style={{ padding: 4 }}>
          <Icon name="logout" size={14} />
        </button>
      </div>
    </aside>
  );
}
