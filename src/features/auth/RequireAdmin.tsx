import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "./AuthProvider";

/** Gate for admin-only routes. Docenten are bounced to their own class home. */
export function RequireAdmin() {
  const { loading, isAdmin } = useSession();
  if (loading) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
