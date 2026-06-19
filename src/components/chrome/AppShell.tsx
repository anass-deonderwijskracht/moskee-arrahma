import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui";
import { useSession } from "@/features/auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { TweaksPanel } from "./TweaksPanel";
import { useTweaks } from "./useTweaks";

/** True while the viewport is at the mobile breakpoint (matches the CSS @media). */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

const TOPNAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/kinderen", label: "Kinderen" },
  { to: "/ouders", label: "Ouders" },
  { to: "/students", label: "Leerlingen" },
  { to: "/classes", label: "Klassen" },
  { to: "/teachers", label: "Docenten" },
  { to: "/planning", label: "Planning" },
  { to: "/enrollments", label: "Inschrijvingen" },
  { to: "/finance", label: "Financiën" },
  { to: "/settings", label: "Instellingen" },
];

function TopNavRow() {
  const { isDocent, classId } = useSession();
  const items = isDocent
    ? [{ to: classId ? `/classes/${classId}` : "/", label: "Mijn klas" }]
    : TOPNAV;
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)", background: "var(--bg-elev)",
        padding: "0 var(--pad-page)", display: "flex", gap: 4, overflowX: "auto",
      }}
    >
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          style={({ isActive }) => ({
            padding: "10px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
            color: isActive ? "var(--primary)" : "var(--fg-muted)",
            borderBottom: "2px solid " + (isActive ? "var(--primary)" : "transparent"),
            marginBottom: -1,
          })}
        >
          {i.label}
        </NavLink>
      ))}
    </div>
  );
}

export function AppShell() {
  const { tweaks, set } = useTweaks();
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const showSidebar = tweaks.navigation === "sidebar";

  return (
    <div className="app" data-collapsed={collapsed} data-nav={tweaks.navigation} data-mobilenav={mobileNavOpen ? "open" : "closed"}>
      {showSidebar && <Sidebar collapsed={isMobile ? false : collapsed} setCollapsed={setCollapsed} />}
      {mobileNavOpen && <div className="nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <div className="main">
        <div className="mobile-bar">
          {showSidebar && (
            <button className="btn ghost sm" aria-label="Menu openen" onClick={() => setMobileNavOpen(true)}>
              <Icon name="menu" size={18} />
            </button>
          )}
          <span className="mobile-bar-title">Moskee Arrahma</span>
        </div>
        {tweaks.navigation === "topnav" && <TopNavRow />}
        <main className="page">
          <div className="page-narrow">
            <Outlet />
          </div>
        </main>
      </div>
      <TweaksPanel tweaks={tweaks} set={set} />
    </div>
  );
}
