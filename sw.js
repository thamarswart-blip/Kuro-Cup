// Service worker van de Kuro Cup Planner.
// - Bij installatie worden alle app-bestanden bewaard; daarna opent de app altijd, ook zonder internet.
// - De app gebruikt altijd zijn eigen bewaarde versie. Een nieuwe versie wordt op de achtergrond
//   klaargezet, maar pas gebruikt als iemand in de app op "Nu bijwerken" tikt. Zo verandert een tablet
//   nooit vanzelf tijdens een toernooi, ook niet als er ineens internet is.
// - Gegevens (deelnemers, uitslagen) staan niet hier maar in IndexedDB en blijven bij een update bewaard.
// Na een wijziging aan de app: python3 tools/nieuwe-versie.py (verhoogt VERSION en vult FILES).
const VERSION = 10;
const CACHE = 'kuro-cup-planner-v' + VERSION;
const FILES = [
  "./",
  "assets/fonts/archivo-latin-ext.woff2",
  "assets/fonts/archivo-latin.woff2",
  "assets/fonts/cano.otf",
  "assets/fonts/cert/cormorant-garamond-500i-latin-ext.woff2",
  "assets/fonts/cert/cormorant-garamond-500i-latin.woff2",
  "assets/fonts/cert/great-vibes-400-latin-ext.woff2",
  "assets/fonts/cert/great-vibes-400-latin.woff2",
  "assets/fonts/cert/libre-caslon-text-400-latin-ext.woff2",
  "assets/fonts/cert/libre-caslon-text-400-latin.woff2",
  "assets/fonts/cert/libre-caslon-text-700-latin-ext.woff2",
  "assets/fonts/cert/libre-caslon-text-700-latin.woff2",
  "assets/fonts/cert/noto-serif-jp-700-subset.woff2",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/logo-white-bg.png",
  "assets/poule-formulieren.json",
  "assets/zaalopzet.svg",
  "css/app.css",
  "css/cert-fonts.css",
  "css/print.css",
  "css/tokens.css",
  "index.html",
  "js/app.js",
  "js/costs.js",
  "js/csv.js",
  "js/merge.js",
  "js/model.js",
  "js/pools.js",
  "js/results.js",
  "js/sample.js",
  "js/schedule.js",
  "js/store.js",
  "js/sync.js",
  "js/ui.js",
  "js/util.js",
  "js/views/costs.js",
  "js/views/data.js",
  "js/views/docs.js",
  "js/views/events.js",
  "js/views/live.js",
  "js/views/overview.js",
  "js/views/participants.js",
  "js/views/planning.js",
  "js/views/pools.js",
  "js/views/settings.js",
  "js/views/volunteers.js",
  "js/views/winners.js",
  "js/volunteers.js",
  "js/xlsx.js",
  "manifest.webmanifest",
];

self.addEventListener('install', (e) => {
  // Geen skipWaiting: de nieuwe versie wacht tot de gebruiker zelf kiest voor bijwerken.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('message', (e) => {
  if (e.data === 'NU_BIJWERKEN') self.skipWaiting();
  if (e.data === 'VERSIE' && e.source) e.source.postMessage({ versie: VERSION });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kuro-cup-planner-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Eerst uit de eigen bewaarde versie; alleen wat daar niet in staat, wordt van het netwerk gehaald.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    if (e.request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    try {
      const res = await fetch(e.request);
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match('./index.html')) || Response.error();
    }
  })());
});
