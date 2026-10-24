// Mise en ligne Netlify : assemble l'appli et crée les icônes. Aucune dépendance.
// Les gros fichiers sont découpés en morceaux dans src/ pour pouvoir être envoyés sur GitHub facilement :
// - src/<nom>.01.<ext>, src/<nom>.02.<ext>, … sont mis bout à bout pour former <nom>.<ext>
//   (index.html, amf.json, icons.json).
// - cours.json = début (src/cours.NN.json, déjà au format de l'appli) + suite (src/courssuite.NN.json,
//   questions de quiz en clair, codées ici comme dans le reste du fichier).
// - icons.json contient l'icône PNG en texte (base64) : elle est recréée en image.
const fs = require("fs");
const path = require("path");

function join(name, ext) {
  const parts = fs.readdirSync("src").filter(f => new RegExp("^" + name + "\\.\\d+\\." + ext + "$").test(f)).sort();
  if (!parts.length) throw new Error("Aucun morceau src/" + name + ".NN." + ext);
  const txt = parts.map(f => fs.readFileSync(path.join("src", f), "utf8")).join("");
  console.log(name + "." + ext, ":", parts.length, "morceaux,", txt.length, "caractères");
  return txt;
}

const html = join("index", "html");
if (!html.includes("</html>")) throw new Error("index.html incomplet (morceau manquant ?)");
fs.writeFileSync("index.html", html);
const amf = join("amf", "json"); JSON.parse(amf); fs.writeFileSync("amf.json", amf);

// cours.json : le début s'arrête juste avant le 7e module
const HEAD_LEN = 398399;
const head = join("cours", "json").slice(0, HEAD_LEN);
if (!head.endsWith("},")) throw new Error("début de cours.json inattendu");
const suite = JSON.parse(join("courssuite", "json"));
function enc(lid, arr) {
  const b = Buffer.from(JSON.stringify(arr), "utf8"), key = "i26k|" + lid + "|q", u = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b[i] ^ key.charCodeAt(i % key.length) ^ ((i * 31) & 255);
  return u.toString("base64");
}
for (const m of suite) for (const l of m.lessons) l.quiz = (l.quiz || []).map(q => q.a === undefined ? q : { q: q.q, d: q.d, x: enc(l.id, [q.a, q.w, q.e]) });
const cours = head + JSON.stringify(suite).slice(1);
const nMods = JSON.parse(cours).length;
fs.writeFileSync("cours.json", cours);
console.log("cours.json assemblé :", nMods, "modules");

const icons = JSON.parse(join("icons", "json"));
const png = Buffer.from(icons["apple-touch-icon.png"], "base64");
for (const name of ["apple-touch-icon.png", "icon-192.png", "favicon-32.png", "logo-128.png"]) {
  fs.writeFileSync(name, png);
  console.log("icône créée :", name);
}
