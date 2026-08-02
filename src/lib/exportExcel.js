import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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
