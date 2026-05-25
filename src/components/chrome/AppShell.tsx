import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TweaksPanel } from "./TweaksPanel";
import { useTweaks } from "./useTweaks";

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
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)", background: "var(--bg-elev)",
        padding: "0 var(--pad-page)", display: "flex", gap: 4, overflowX: "auto",
      }}
    >
      {TOPNAV.map((i) => (
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

  return (
    <div className="app" data-collapsed={collapsed} data-nav={tweaks.navigation}>
      {tweaks.navigation === "sidebar" && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div className="main">
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
