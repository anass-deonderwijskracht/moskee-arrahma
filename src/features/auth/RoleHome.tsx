import { Navigate } from "react-router-dom";
import { useSession } from "./AuthProvider";
import { Btn } from "@/components/ui";

/** Landing redirect keyed on role: admins → dashboard, docenten → their class. */
export function RoleHome() {
  const { loading, session, isAdmin, isDocent, classId, signOut } = useSession();

  if (loading) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/dashboard" replace />;
  if (isDocent && classId) return <Navigate to={`/classes/${classId}`} replace />;

  // Docent without a linked class (or unknown role) — nothing to show.
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">M</div>
          <div>
            <div className="name">Geen klas gekoppeld</div>
            <div className="sub">Moskee Arrahma</div>
          </div>
        </div>
        <p className="text-sm text-subtle" style={{ margin: "8px 0 16px" }}>
          Je account is nog niet aan een klas gekoppeld. Neem contact op met het bestuur.
        </p>
        <Btn kind="primary" onClick={() => { void signOut(); }}>Uitloggen</Btn>
      </div>
    </div>
  );
}
