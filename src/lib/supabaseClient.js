import { createClient } from "@supabase/supabase-js";

/**
 * Normalise l'URL Supabase.
 * Erreur fréquente: coller l'URL REST (…/rest/v1/) au lieu de la racine projet.
 * createClient attend uniquement: https://xxxx.supabase.co
 */
function normalizeSupabaseUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let u = raw.trim();
  // Enlever slash final répété
  u = u.replace(/\/+$/, "");
  // Enlever chemins API collés par erreur
  u = u.replace(/\/rest\/v1$/i, "");
  u = u.replace(/\/auth\/v1$/i, "");
  u = u.replace(/\/storage\/v1$/i, "");
  u = u.replace(/\/functions\/v1$/i, "");
  u = u.replace(/\/realtime\/v1$/i, "");
  return u;
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!url || !anonKey) {
  console.error(
    "[Relevé MT] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant. " +
      "Vérifiez les Secrets GitHub ou le fichier .env"
  );
}

export const supabase = createClient(url, anonKey);
