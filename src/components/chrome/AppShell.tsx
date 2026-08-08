import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useSession } from "@/features/auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { TweaksPanel } from "./TweaksPanel";
import { useTweaks } from "./useTweaks";
import { useIsMobile } from "./useIsMobile";

const TOPNAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/kinderen", label: "Kinderen" },
  { to: "/ouders", label: "Ouders" },
  { to: "/students", label: "Leerlingen" },
  { to: "/classes", label: "Klassen" },
  { to: "/teachers", label: "Docenten" },
  { to: "/tasks", label: "Taken" },
  { to: "/planning", label: "Planning" },
  { to: "/enrollments", label: "Inschrijvingen" },
  { to: "/admin-toetsen", label: "Toetsen" },
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

/** Korte vertraging voorkomt dat de balk uitschiet bij een toevallige muisveeg. */
const PEEK_OPEN_DELAY = 120;
/** En dat hij dichtklapt bij het kleine gaatje tussen strook en paneel. */
const PEEK_CLOSE_DELAY = 220;

export function AppShell() {
  const { tweaks, set } = useTweaks();
  const [collapsed, setCollapsed] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  const peekTimer = useRef<number | undefined>(undefined);
  const schedulePeek = useCallback((open: boolean) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(
      () => setPeeking(open),
      open ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  // Close the mobile drawer whenever the route changes; een klik op een menu-item
  // laat ook het zwevende paneel meteen weer verdwijnen.
  useEffect(() => {
    setMobileNavOpen(false);
    window.clearTimeout(peekTimer.current);
    setPeeking(false);
  }, [location.pathname]);

  const showSidebar = tweaks.navigation === "sidebar";
  // Op mobiel stuurt de lade de zijbalk aan; inklappen geldt alleen op desktop.
  const sidebarCollapsed = showSidebar && !isMobile && collapsed;
  const peekOpen = sidebarCollapsed && peeking;

  const dock = () => {
    window.clearTimeout(peekTimer.current);
    setPeeking(false);
    setCollapsed(false);
  };

  return (
    <div
      className="app"
      data-collapsed={sidebarCollapsed}
      data-nav={tweaks.navigation}
      data-mobilenav={mobileNavOpen ? "open" : "closed"}
      data-peek={peekOpen ? "open" : "closed"}
    >
      {showSidebar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          mobile={isMobile}
          onToggle={isMobile ? () => setMobileNavOpen(false) : sidebarCollapsed ? dock : () => setCollapsed(true)}
          onMouseEnter={sidebarCollapsed ? () => schedulePeek(true) : undefined}
          onMouseLeave={sidebarCollapsed ? () => schedulePeek(false) : undefined}
        />
      )}
      {sidebarCollapsed && (
        <>
          <div
            className="sidebar-hotzone"
            aria-hidden="true"
            onMouseEnter={() => schedulePeek(true)}
            onMouseLeave={() => schedulePeek(false)}
          />
          <button className="sidebar-reveal" onClick={dock} title="Zijbalk uitklappen" aria-label="Zijbalk uitklappen">
            <Icon name="panelLeft" size={16} />
          </button>
        </>
      )}
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
            {/* De zwaarste schermen worden apart geladen; de shell blijft staan. */}
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <TweaksPanel tweaks={tweaks} set={set} />
    </div>
  );
}
