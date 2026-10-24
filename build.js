// Mise en ligne Netlify : assemble l'appli et crée les icônes. Aucune dépendance.
// - src/<nom>.01.<ext>, src/<nom>.02.<ext>, … sont mis bout à bout pour former <nom>.<ext>
//   (index.html, cours.json, amf.json, icons.json) : les gros fichiers sont découpés en morceaux
//   pour pouvoir être envoyés sur GitHub facilement.
// - icons.json contient les icônes PNG en texte (base64) : elles sont recréées en images.
const fs = require("fs");
const path = require("path");

const groups = {};
for (const f of fs.readdirSync("src")) {
  const m = f.match(/^(.+)\.(\d+)\.([a-z]+)$/);
  if (m) (groups[m[1] + "." + m[3]] = groups[m[1] + "." + m[3]] || []).push(f);
}
for (const [out, parts] of Object.entries(groups)) {
  parts.sort();
  const txt = parts.map(f => fs.readFileSync(path.join("src", f), "utf8")).join("");
  if (out.endsWith(".json")) JSON.parse(txt); // vérifie qu'aucun morceau ne manque
  if (out.endsWith(".html") && !txt.includes("</html>")) throw new Error(out + " incomplet (morceau manquant ?)");
  fs.writeFileSync(out, txt);
  console.log(out, "assemblé :", parts.length, "morceaux,", txt.length, "caractères");
}

const icons = JSON.parse(fs.readFileSync("icons.json", "utf8"));
for (const [name, b64] of Object.entries(icons)) {
  fs.writeFileSync(name, Buffer.from(b64, "base64"));
  console.log("icône créée :", name);
}
