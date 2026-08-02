import { createClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// Supabase client needs the bare project URL only, e.g.
// https://xxxxx.supabase.co  — WITHOUT any trailing path such as
// /rest/v1/, /auth/v1/, or a trailing slash. If a Secret was pasted
// with an extra path, strip it here so auth/login keeps working
// even if the GitHub Secret is set incorrectly.
function sanitizeUrl(u) {
  if (!u) return u;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return u.replace(/\/(rest|auth|realtime|storage)\/v1\/?.*$/i, "").replace(/\/+$/, "");
  }
}

const url = sanitizeUrl(rawUrl);

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY were not set at build time."
  );
}

export const supabase = createClient(url, anonKey);
