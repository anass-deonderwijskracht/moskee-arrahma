import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "./AuthProvider";

export function ProtectedRoute() {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
