import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { supabase } from "./supabaseClient";

function buildWorkbook(rows, columnWidths, sheetName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (columnWidths) ws["!cols"] = columnWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

// Writes an .xlsx file made of `rows` (array of plain objects, one per line).
// On the web (npm run dev / preview) this falls back to a normal browser
// download. Inside the Android app (Capacitor) `XLSX.writeFile`'s blob+<a>
// download trick silently does nothing, so there we write the file with the
// Filesystem plugin and hand it to the native Share sheet instead, which lets
// the user save it or send it directly (WhatsApp, Drive, email...).
export async function exportRowsToExcel({ rows, columnWidths, sheetName = "Sheet1", fileName }) {
  const wb = buildWorkbook(rows, columnWidths, sheetName);

  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: fileName,
      url: written.uri,
    });
    return;
  }

  XLSX.writeFile(wb, fileName);
}

// Same native/web file-writing logic as exportRowsToExcel above, but for a
// base64 .xlsx that was already built elsewhere (a Supabase Edge Function).
async function writeBase64ToFile(base64, fileName) {
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: fileName,
      url: written.uri,
    });
    return;
  }

  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Sends raw rows to the "export-releve-xlsx" Supabase Edge Function, which
// builds the actual .xlsx (columns, sheets, formatting) and returns it as
// base64. Change the file's shape by editing that function on Supabase —
// no app change or rebuild needed afterwards.
export async function exportRowsViaSupabase({ rows, period, fnName = "export-releve-xlsx" }) {
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: { rows, period },
  });
  if (error) throw error;
  const fileName = data.fileName || `releve_MT_${period ?? ""}.xlsx`;
  await writeBase64ToFile(data.base64, fileName);
}
