// Service worker Mindinvest
// Un seul rôle : quand l'appli installée s'ouvre sans réseau, afficher la page
// « Pas de connexion » (offline.html) au lieu d'un écran d'erreur.
// Il ne met en cache QUE offline.html. Les pages, le code et les données
// passent toujours par le réseau (toujours la dernière version).
const VERSION = "mindinvest-offline-v1";
const OFFLINE_URL = "./offline.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(c => c.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
  );
});
