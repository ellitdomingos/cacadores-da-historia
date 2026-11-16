// R11: depois de aberto uma vez com rede, o jogo funciona sem internet.
const CACHE = "ch-v10";
const NIVEIS = {
  fsm: ["muralha", "portao", "canhao", "azulejos", "baluarte", "estatua"],
  pf: ["colunas", "andar", "varanda", "telhado", "porta", "escadaria"],
  mbk: ["fachada", "parede_esq", "parede_dir", "cabeceira", "arvore", "tumulos"],
  mne: ["fachada", "porta", "frontao", "cruz", "telhado", "pia"],
};
const FICHEIROS = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "ra3d.js", "vendor/qrcode.js", "vendor/fredoka.woff2",
  "vendor/three.module.min.js", "vendor/jsm/loaders/GLTFLoader.js", "vendor/jsm/utils/BufferGeometryUtils.js", "modelos/tabuleiros.js",
  ...Object.entries(NIVEIS).flatMap(([n, ps]) => [`modelos/${n}/pecas.json`, `modelos/${n}/base.glb`, `modelos/${n}/img/base_cima.png`, `modelos/${n}/img/miniatura.png`,
    ...ps.flatMap(id => [`modelos/${n}/${id}.glb`, `modelos/${n}/img/${id}_peca.png`, `modelos/${n}/img/${id}_3q.png`])])];
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
