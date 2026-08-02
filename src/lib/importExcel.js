import * as XLSX from "xlsx";
import { N_POSTES } from "./validation";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const META_COLS = 5; // contract_no, meter_no, name, period, reading_date

function pickDataSheet(workbook) {
  const named = workbook.SheetNames.find(n => n.includes("بيانات") || n.toLowerCase().includes("data"));
  const sheetName = named || workbook.SheetNames[workbook.SheetNames.length - 1];
  return workbook.Sheets[sheetName];
}

function excelDateToISO(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${mm}-${dd}`;
  }
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizePeriod(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  const s = String(value).trim();
  return PERIOD_RE.test(s) ? s : null;
}

/**
 * Parses an uploaded workbook (ArrayBuffer) into row objects, validating each
 * against the set of known contract numbers.
 *
 * Returns { valid: [...], invalid: [{ line, reason, raw }], total }
 */
export function parseReadingsWorkbook(arrayBuffer, knownContractNos) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheet = pickDataSheet(workbook);
  if (!sheet) return { valid: [], invalid: [], total: 0 };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const knownSet = new Set((knownContractNos || []).map(Number));

  const valid = [];
  const invalid = [];

  // Skip header row (row 0). Data starts at row 1 (Excel row 2).
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const isBlank = row.slice(0, META_COLS + N_POSTES).every(c => c === "" || c === null || c === undefined);
    if (isBlank) continue;

    const excelLine = i + 1;
    const contractNoRaw = row[0];
    const meterNoRaw = row[1];
    const periodRaw = row[3];
    const dateRaw = row[4];

    const contractNo = Number(contractNoRaw);
    const period = normalizePeriod(periodRaw);
    const readingDate = excelDateToISO(dateRaw) || (period ? `${period}-01` : null);

    const problems = [];
    if (!contractNoRaw || !Number.isFinite(contractNo)) problems.push("رقم العقد ناقص أو غير صحيح");
    else if (knownSet.size && !knownSet.has(contractNo)) problems.push(`رقم العقد ${contractNo} غير موجود في لائحة الزبناء`);
    if (!meterNoRaw) problems.push("رقم العداد ناقص");
    if (!period) problems.push("الفترة غير صحيحة (خاصها YYYY-MM)");
    if (!readingDate) problems.push("تاريخ القراءة غير صحيح (خاصو YYYY-MM-DD)");

    const indexes = [];
    for (let k = 0; k < N_POSTES; k++) {
      const raw = row[META_COLS + k];
      if (raw === "" || raw === null || raw === undefined) { indexes.push(0); continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { problems.push(`القيمة فالعمود ${k + 1} غير صحيحة`); indexes.push(0); }
      else indexes.push(n);
    }

    if (problems.length) {
      invalid.push({ line: excelLine, reason: problems.join(" · "), contractNo: contractNoRaw, period: periodRaw });
      continue;
    }

    valid.push({
      contractNo,
      meterNo: String(meterNoRaw),
      period,
      readingDate,
      indexes,
    });
  }

  return { valid, invalid, total: valid.length + invalid.length };
}
