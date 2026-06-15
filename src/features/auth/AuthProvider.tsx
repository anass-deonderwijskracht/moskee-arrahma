import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  fullName: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        navigate("/wachtwoord-herstellen", { replace: true });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const fullName =
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email ??
    null;

  const value: AuthState = {
    session,
    loading,
    fullName,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSession must be used within AuthProvider");
  return ctx;
}
