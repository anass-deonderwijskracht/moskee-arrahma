import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "./AuthProvider";
import { Btn } from "@/components/ui";

export function LoginPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) {
    return <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Inloggen mislukt. Controleer e-mail en wachtwoord.");
      return;
    }
    navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">M</div>
          <div>
            <div className="name">Moskee Arrahma</div>
            <div className="sub">Weekendonderwijs · Beheer</div>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input
              id="email" className="input" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@moskee-arrahma.nl"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password" className="input" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Btn kind="primary" size="lg" type="submit" disabled={busy}>
            {busy ? "Bezig met inloggen…" : "Inloggen"}
          </Btn>
          <p className="text-xs text-subtle" style={{ margin: 0 }}>
            Toegang is alleen op uitnodiging. Neem contact op met het bestuur voor een account.
          </p>
        </form>
      </div>
    </div>
  );
}
