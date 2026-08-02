import { supabase } from "./supabaseClient";

const PENDING_KEY = "releve-mt-pending-readings-v1";

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
}

function writePending(rows) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(rows)); } catch {}
}

function queuePending(payload) {
  const rows = readPending();
  const key = `${payload.contract_no}:${payload.period}`;
  const next = rows.filter(x => `${x.contract_no}:${x.period}` !== key);
  next.push(payload);
  writePending(next);
}

function clearPending(contractNo, period) {
  const rows = readPending();
  const key = `${contractNo}:${period}`;
  const next = rows.filter(x => `${x.contract_no}:${x.period}` !== key);
  if (next.length !== rows.length) writePending(next);
}

export function pendingReadingsCount() {
  return readPending().length;
}

export async function flushPendingReadings() {
  const rows = readPending();
  if (!rows.length) return 0;
  const remaining = [];
  let saved = 0;
  for (const payload of rows) {
    const { error } = await supabase
      .from("meter_readings")
      .upsert(payload, { onConflict: "contract_no,period" });
    if (error) remaining.push(payload);
    else saved += 1;
  }
  writePending(remaining);
  return saved;
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export async function loadAssignedContracts(userId) {
  const { data, error } = await supabase
    .from("employee_clients")
    .select("contract_no")
    .eq("employee_id", userId)
    .eq("active", true)
    .order("contract_no");
  if (error) throw error;
  return (data || []).map(x => Number(x.contract_no));
}

export async function loadPreviousReading(contractNo, period) {
  const { data, error } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("contract_no", contractNo)
    .lt("period", period)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadCurrentReading(contractNo, period) {
  const { data, error } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("contract_no", contractNo)
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadReadingsForContracts(contractNos, period) {
  if (!contractNos.length) return { current: {}, previous: {} };

  const currentQuery = supabase
    .from("meter_readings")
    .select("*")
    .in("contract_no", contractNos)
    .eq("period", period);

  const previousQuery = supabase
    .from("meter_readings")
    .select("*")
    .in("contract_no", contractNos)
    .lt("period", period)
    .order("period", { ascending: false });

  const [{ data: current, error: currentError }, { data: previous, error: previousError }] = await Promise.all([
    currentQuery,
    previousQuery,
  ]);
  if (currentError) throw currentError;
  if (previousError) throw previousError;

  const currentMap = Object.fromEntries((current || []).map(row => [Number(row.contract_no), row]));
  const previousMap = {};
  for (const row of previous || []) {
    const ct = Number(row.contract_no);
    if (!previousMap[ct]) previousMap[ct] = row; // query is newest first
  }
  return { current: currentMap, previous: previousMap };
}

export async function saveReading({ contractNo, meterNo, period, readingDate, indexes, employeeId, employeeName }) {
  const payload = {
    contract_no: Number(contractNo),
    meter_no: String(meterNo),
    period,
    reading_date: readingDate,
    indexes,
    employee_id: employeeId,
    employee_name: employeeName,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("meter_readings")
    .upsert(payload, { onConflict: "contract_no,period" })
    .select()
    .single();
  if (error) {
    queuePending(payload);
    throw error;
  }
  clearPending(payload.contract_no, payload.period);
  return data;
}

export function subscribeReadings(callback, onStatus) {
  const channel = supabase
    .channel(`releve-mt-live-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "meter_readings" }, callback)
    .subscribe(status => {
      onStatus?.(status);
    });
  return () => supabase.removeChannel(channel);
}
