import { supabase } from "./supabaseClient";

export const DEFAULT_POSTES = [
  "Plein", "Pointe", "Creux", "Total",
  "Plein", "Pointe", "Creux", "Total",
  "Plein", "Pointe", "Creux", "Total",
  "Total", "Plein", "Pointe", "Creux",
  "EAIPH1", "EAIPH2", "EAIPH3",
  "EAEPH1", "EAEPH2", "EAEPH3",
];

function mapRow(row) {
  return {
    ct: row.contract_no,
    sn: row.meter_no,
    s: row.sector,
    nm: row.name,
    p: row.postes || DEFAULT_POSTES,
    a: row.old_index || Array(DEFAULT_POSTES.length).fill(0),
  };
}

export async function loadClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("active", true)
    .order("contract_no");
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function addClient({ contractNo, meterNo, sector, name, oldIndex }) {
  const postes = DEFAULT_POSTES;
  const old_index = oldIndex && oldIndex.length === postes.length
    ? oldIndex
    : Array(postes.length).fill(0);

  const { data, error } = await supabase
    .from("clients")
    .insert({
      contract_no: Number(contractNo),
      meter_no: String(meterNo),
      sector: String(sector),
      name: String(name),
      postes,
      old_index,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deactivateClient(contractNo) {
  const { error } = await supabase
    .from("clients")
    .update({ active: false })
    .eq("contract_no", Number(contractNo));
  if (error) throw error;
}

export function subscribeClients(onChange) {
  const channel = supabase
    .channel("clients-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
