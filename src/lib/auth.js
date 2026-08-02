import { supabase } from "./supabaseClient";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}
