import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui";
import { useNavCounts } from "@/data/counts";
import { useSession } from "@/features/auth/AuthProvider";

type NavItem = { group?: string; id?: string; to?: string; label?: string; icon?: IconName; countKey?: string };

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const { data: counts } = useNavCounts();
  const { fullName, signOut, isDocent, classId } = useSession();

  const items: NavItem[] = isDocent
    ? [
        { group: "Mijn klas" },
        { to: classId ? `/classes/${classId}` : "/", label: "Mijn klas", icon: "school" },
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
        { group: "Administratie" },
        { to: "/enrollments", label: "Inschrijvingen", icon: "inbox", countKey: "enrollments" },
        { to: "/finance", label: "Financiën", icon: "coins" },
        { group: "Systeem" },
        { to: "/settings", label: "Instellingen", icon: "settings" },
      ];

  const initials = (fullName || "Beheer").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="mark" style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em" }}>M</div>
        {!collapsed && (
          <div>
            <div className="name">Moskee Arrahma</div>
            <div className="sub">Weekendonderwijs · Almere</div>
          </div>
        )}
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
              title={collapsed ? item.label : undefined}
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
        {!collapsed && (
          <div className="who">
            <span className="nm">{fullName ?? "Beheerder"}</span>
            <span className="rl">{isDocent ? "Docent" : "Bestuur · Beheerder"}</span>
          </div>
        )}
        <button className="btn ghost sm" onClick={() => { void signOut(); }} title="Uitloggen" style={{ padding: 4 }}>
          <Icon name="logout" size={14} />
        </button>
        {!collapsed && (
          <button className="btn ghost sm" onClick={() => setCollapsed(true)} title="Inklappen" style={{ padding: 4 }}>
            <Icon name="panelLeft" size={14} />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Uitklappen"
          style={{
            position: "absolute", bottom: 64, right: -12, width: 24, height: 24,
            background: "var(--bg-elev)", border: "1px solid var(--border)",
            borderRadius: 999, display: "grid", placeItems: "center",
            boxShadow: "var(--shadow-sm)", color: "var(--fg-muted)", zIndex: 10,
          }}
        >
          <Icon name="chevronRight" size={12} />
        </button>
      )}
    </aside>
  );
}
