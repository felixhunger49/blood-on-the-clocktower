// Prüft die App-Teile in src/app/ auf doppelt vergebene Namen (Funktionen/Konstanten auf oberster Ebene).
// Doppelte Funktionsnamen sind gefährlich: Die spätere Funktion überschreibt still die frühere.
// Aufruf: node tools/check.cjs
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "src", "app");
const seen = new Map();
const dups = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort()) {
  fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
    // oberste Ebene der App = genau 2 Leerzeichen Einrückung
    const m = line.match(/^  (?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/) || line.match(/^  (?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m) return;
    const where = `${f}:${i + 1}`;
    if (seen.has(m[1])) dups.push(`${m[1]}: ${seen.get(m[1])} und ${where}`);
    else seen.set(m[1], where);
  });
}
if (dups.length) { console.error("Doppelt vergebene Namen:\n  " + dups.join("\n  ")); process.exit(1); }
console.log(`Keine doppelten Namen (${seen.size} geprüft).`);
