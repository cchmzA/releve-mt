import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { getProfile } from "./lib/auth";
import Login from "./components/Login";
import ManagerDashboard from "./components/ManagerDashboard";
import EmployeeDashboard from "./components/EmployeeDashboard";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async user => {
      if (!user) {
        if (mounted) setProfile(null);
        return;
      }
      try {
        const p = await getProfile(user.id);
        if (mounted) setProfile(p);
      } catch {
        if (mounted) setProfile(null);
      }
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user);
      if (mounted) setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadProfile(nextSession?.user);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <div style={{padding:30}}>جاري التحميل...</div>;
  if (!session) return <Login onLoggedIn={user => setSession({ user })} />;
  if (!profile) return <div dir="rtl" style={{padding:30}}>الحساب موجود لكن لا يوجد له ملف مستخدم في profiles.</div>;

  return profile.role === "manager"
    ? <ManagerDashboard profile={profile} />
    : <EmployeeDashboard profile={profile} />;
}
