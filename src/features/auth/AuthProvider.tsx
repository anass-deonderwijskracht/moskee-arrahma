import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Role = "admin" | "docent";

interface AuthState {
  session: Session | null;
  loading: boolean;
  fullName: string | null;
  role: Role | null;
  classId: string | null;
  isAdmin: boolean;
  isDocent: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

type Profile = { full_name: string | null; role: Role | null; class_id: string | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the caller's profile (role + class link). Returns null when signed out.
  async function loadProfile(s: Session | null): Promise<void> {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role, class_id")
      .eq("id", s.user.id)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      void loadProfile(s);
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
    profile?.full_name ??
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email ??
    null;

  const role = profile?.role ?? null;

  const value: AuthState = {
    session,
    loading,
    fullName,
    role,
    classId: profile?.class_id ?? null,
    isAdmin: role === "admin",
    isDocent: role === "docent",
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
