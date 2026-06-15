import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "./AuthProvider";
import { Btn } from "@/components/ui";

export function ResetPasswordPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (loading) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }

  if (!session) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <div className="mark">M</div>
            <div>
              <div className="name">Link niet (meer) geldig</div>
              <div className="sub">Wachtwoord herstellen</div>
            </div>
          </div>
          <p className="text-sm text-subtle" style={{ margin: "8px 0 16px" }}>
            Open de herstellink uit je e-mail opnieuw. Een link werkt maar één keer en verloopt na enige tijd.
          </p>
          <Btn kind="primary" onClick={() => navigate("/login")}>Terug naar inloggen</Btn>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Wachtwoord moet minstens 8 tekens zijn."); return; }
    if (password !== confirm) { setError("Wachtwoorden komen niet overeen."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError("Wijzigen mislukt: " + error.message); return; }
    setDone(true);
    setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">M</div>
          <div>
            <div className="name">Nieuw wachtwoord instellen</div>
            <div className="sub">{session.user.email}</div>
          </div>
        </div>
        {done ? (
          <p className="text-sm">Wachtwoord aangepast — je wordt doorgestuurd…</p>
        ) : (
          <form onSubmit={onSubmit}>
            {error && <div className="login-error">{error}</div>}
            <div className="field">
              <label htmlFor="password">Nieuw wachtwoord</label>
              <input
                id="password" className="input" type="password" autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Bevestig wachtwoord</label>
              <input
                id="confirm" className="input" type="password" autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Btn kind="primary" size="lg" type="submit" disabled={busy}>
              {busy ? "Bezig…" : "Wachtwoord opslaan"}
            </Btn>
          </form>
        )}
      </div>
    </div>
  );
}
