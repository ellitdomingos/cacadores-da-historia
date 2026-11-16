// R11: depois de aberto uma vez com rede, o jogo funciona sem internet.
const CACHE = "ch-fsm-v7";
const FICHEIROS = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "ra3d.js", "vendor/qrcode.js",
  "vendor/three.module.min.js", "vendor/jsm/loaders/GLTFLoader.js", "vendor/jsm/utils/BufferGeometryUtils.js",
  "modelos/pecas.json", "modelos/tabuleiro.js", "modelos/base.glb", "modelos/img/base_cima.png",
  ...["muralha", "portao", "canhao", "azulejos", "baluarte", "estatua"].flatMap(id =>
    [`modelos/${id}.glb`, `modelos/img/${id}_peca.png`, `modelos/img/${id}_3q.png`])];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHEIROS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // rede primeiro (apanha as versões novas); sem rede, usa a cópia guardada
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request))
  );
});
