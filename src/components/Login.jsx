import { useState } from "react";
import { signIn } from "../lib/auth";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await signIn(email.trim(), password);
      onLoggedIn(data.user);
    } catch (err) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F6F8", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18, padding: 22, boxShadow: "0 3px 18px rgba(0,0,0,.08)" }}>
        <h2 style={{ marginTop: 0 }}>قراءة عدادات MT</h2>
        <p style={{ color: "#5B6B78" }}>تسجيل الدخول</p>

        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          style={{ width: "100%", padding: 12, marginBottom: 10, boxSizing: "border-box" }}
        />

        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="كلمة المرور"
          style={{ width: "100%", padding: 12, marginBottom: 10, boxSizing: "border-box" }}
        />

        {error && <div style={{ color: "#C00000", marginBottom: 10 }}>{error}</div>}

        <button disabled={loading} style={{ width: "100%", padding: 13, border: 0, borderRadius: 10, background: "#0B4F6C", color: "#fff", fontWeight: 800 }}>
          {loading ? "جاري الدخول..." : "دخول"}
        </button>
      </form>
    </div>
  );
}
