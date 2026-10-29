import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="stk" style={{ alignSelf: "flex-start", transform: "rotate(-2deg)" }}>COMIC-STAPEL</span>
        <h1 style={{ fontSize: 60, lineHeight: 0.92 }}>Was liegt<br />heute an?</h1>
        {sent ? (
          <p style={{ fontSize: 17 }}>Der Anmeldelink ist unterwegs an <strong>{email}</strong>. Öffne ihn auf diesem Gerät.</p>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field">E-Mail
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="btn solid" disabled={busy}>{busy ? "Sende …" : "Anmeldelink schicken"}</button>
            {error && <p role="alert" className="stk" style={{ whiteSpace: "normal", margin: 0 }}>{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
