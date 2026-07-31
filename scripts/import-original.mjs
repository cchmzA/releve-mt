import fs from "node:fs";

const input = process.argv[2] || "ReleveMT_monthly_v2.txt";
const source = fs.readFileSync(input, "utf8");

const marker = "const CLIENTS = ";
const start = source.indexOf(marker);
if (start < 0) {
  throw new Error("Impossible de trouver 'const CLIENTS = ' dans le fichier source.");
}

const jsonStart = start + marker.length;
const end = source.indexOf("];", jsonStart);
if (end < 0) {
  throw new Error("Impossible de trouver la fin du tableau CLIENTS.");
}

const jsonText = source.slice(jsonStart, end + 1);
let clients;
try {
  clients = JSON.parse(jsonText);
} catch (err) {
  throw new Error("Le tableau CLIENTS n'est pas du JSON valide: " + err.message);
}

const out = `// Généré depuis ${input}\nexport const CLIENTS = ${JSON.stringify(clients)};\n`;
fs.writeFileSync("src/data/clients.js", out, "utf8");

console.log(`Import terminé: ${clients.length} clients -> src/data/clients.js`);
