// Baut js/app.js aus den Teilen in src/app/ (in der Reihenfolge der Dateinamen).
// Aufruf: node tools/build.cjs        → schreibt js/app.js
//         node tools/build.cjs --check → prüft nur, ob js/app.js aktuell ist
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const dir = path.join(root, "src", "app");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort();
const out = files.map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("");
const target = path.join(root, "js", "app.js");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (cur !== out) { console.error("js/app.js ist nicht aktuell – bitte `node tools/build.cjs` ausführen."); process.exit(1); }
  console.log(`js/app.js ist aktuell (${files.length} Teile).`);
} else {
  fs.writeFileSync(target, out);
  console.log(`js/app.js gebaut aus ${files.length} Teilen (${out.split("\n").length - 1} Zeilen).`);
}
