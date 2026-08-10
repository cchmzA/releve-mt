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

// ============================================================
// استيراد من ملف "HTA" (نفس شكل ملف التصدير: TRAJI / Nom / N° SERIE /
// contrat / c saisie / Postes Horaires / Index de ce jour / Ancien Index).
// هذا الشكل ما فيه عمود "الفترة" — لازم تُمرَّر يدويًا (مثلاً الشهر
// المختار فوق بلوحة المسؤول)، وكل عقد بيكون على شكل عدة أسطر (وحدة
// لكل Index)، مجمّعة حسب رقم العقد.
// ============================================================
function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

export function parseHtaWorkbook(arrayBuffer, knownContractNos, period) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const sheetName =
    workbook.SheetNames.find(n => n.trim().toUpperCase() === "HTA") ||
    workbook.SheetNames.find(n => n.toUpperCase().includes("HTA")) ||
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { valid: [], invalid: [], total: 0 };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!rows.length) return { valid: [], invalid: [], total: 0 };

  const header = rows[0].map(normalizeHeader);
  const col = name => header.indexOf(normalizeHeader(name));

  const idxContrat = col("contrat");
  const idxSerie = col("n° serie");
  const idxSaisie = col("c saisie");
  const idxNewIndex = col("index de ce jour");

  if (idxContrat === -1 || idxNewIndex === -1) {
    return {
      valid: [],
      invalid: [{ line: 1, reason: 'الملف لا يحتوي أعمدة "contrat" أو "Index de ce jour" المطلوبة، تأكد إنه بنفس شكل ملف HTA' }],
      total: 1,
    };
  }
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return {
      valid: [],
      invalid: [{ line: 1, reason: "الفترة (الشهر) غير محددة أو غير صحيحة" }],
      total: 1,
    };
  }

  const knownSet = new Set((knownContractNos || []).map(Number));
  const groups = new Map(); // contract_no -> { meterNo, indexes: {}, lines: [] }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const contractRaw = row[idxContrat];
    if (contractRaw === "" || contractRaw === null || contractRaw === undefined) continue;
    const contractNo = Number(String(contractRaw).trim());
    if (!Number.isFinite(contractNo)) continue;

    if (!groups.has(contractNo)) {
      groups.set(contractNo, {
        meterNo: idxSerie !== -1 ? String(row[idxSerie] ?? "").trim() : "",
        indexes: {},
        lines: [],
      });
    }
    const g = groups.get(contractNo);
    g.lines.push(i + 1);

    const seq = Number(row[idxSaisie]);
    const newVal = row[idxNewIndex];
    if (Number.isFinite(seq) && seq >= 1 && newVal !== "" && newVal !== null && newVal !== undefined) {
      const n = Number(newVal);
      if (Number.isFinite(n)) g.indexes[seq - 1] = n;
    }
  }

  const valid = [];
  const invalid = [];

  for (const [contractNo, g] of groups) {
    const problems = [];
    if (knownSet.size && !knownSet.has(contractNo)) problems.push(`رقم العقد ${contractNo} غير موجود في لائحة الزبناء`);
    if (!g.meterNo) problems.push("رقم العداد ناقص");

    const seqKeys = Object.keys(g.indexes).map(Number);
    if (!seqKeys.length) problems.push("لا توجد قيم قراءة صالحة (عمود Index de ce jour فارغ)");

    if (problems.length) {
      invalid.push({ line: g.lines[0], reason: problems.join(" · "), contractNo });
      continue;
    }

    const maxSeq = Math.max(...seqKeys);
    const indexes = [];
    for (let k = 0; k <= maxSeq; k++) indexes.push(g.indexes[k] ?? 0);

    valid.push({
      contractNo,
      meterNo: g.meterNo,
      period,
      readingDate: `${period}-01`,
      indexes,
    });
  }

  return { valid, invalid, total: valid.length + invalid.length };
}
