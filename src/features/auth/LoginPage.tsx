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
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) {
    return <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Inloggen mislukt. Controleer e-mail en wachtwoord.");
      return;
    }
    navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
  };

  const onForgotPassword = async () => {
    setError(null); setInfo(null);
    if (!email) { setError("Vul eerst je e-mailadres in om een herstellink te ontvangen."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/wachtwoord-herstellen",
    });
    setBusy(false);
    if (error) setError("Versturen mislukt: " + error.message);
    else setInfo(`Herstellink verstuurd naar ${email}. Check je inbox (en spam-map).`);
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
          {info && <div className="login-error" style={{ background: "var(--success-soft)", color: "var(--success)", borderColor: "var(--success)" }}>{info}</div>}
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
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button type="button" className="btn ghost sm" onClick={onForgotPassword} disabled={busy} style={{ fontSize: 12 }}>
              Wachtwoord vergeten?
            </button>
          </div>
          <p className="text-xs text-subtle" style={{ margin: 0 }}>
            Toegang is alleen op uitnodiging. Neem contact op met het bestuur voor een account.
          </p>
        </form>
      </div>
    </div>
  );
}
