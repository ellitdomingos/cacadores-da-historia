// Camada 3D do jogo (three.js r160, guardado em vendor/ para funcionar offline).
// Expõe window.RA3D. Se o WebGL falhar, o jogo continua com os desenhos 2D.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/jsm/loaders/GLTFLoader.js";

const carregador = new GLTFLoader();
const cache = {};
const posicoes = {};
const pasta = () => window.NIVEL_PASTA || "modelos/fsm/";   // pasta do nível actual

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch (e) { return false; }
}

async function modelo(id) {
  const url = `${pasta()}${id}.glb`;
  if (!cache[url]) cache[url] = carregador.loadAsync(url).then(g => g.scene);
  return (await cache[url]).clone(true);
}
async function lerPosicoes() {
  const p = pasta();
  if (!posicoes[p]) posicoes[p] = await fetch(`${p}pecas.json`).then(r => r.json());
  return posicoes[p];
}
// pré-carregar os modelos do nível (são poucos KB) para não haver espera no local
function precarregar(ids) { ["base", ...ids].forEach(id => modelo(id).catch(() => {})); }

// Centra o modelo e ajusta-o a um tamanho máximo (em metros).
function normalizar(obj, tamanho) {
  const caixa = new THREE.Box3().setFromObject(obj);
  const dim = caixa.getSize(new THREE.Vector3());
  const s = tamanho / Math.max(dim.x, dim.y, dim.z);
  const centro = caixa.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  obj.position.sub(centro);
  g.add(obj);
  g.scale.setScalar(s);
  return g;
}

function luzes(cena) {
  cena.add(new THREE.HemisphereLight(0xffffff, 0x6b4a2a, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 2.4);
  sol.position.set(3, 6, 4);
  cena.add(sol);
}

function novoRenderer(contentor) {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // poupa bateria em ecrãs densos
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  contentor.appendChild(r.domElement);
  return r;
}
function libertar(r, cena) {
  cena.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  r.dispose();
  try { r.forceContextLoss(); } catch (e) {}
  r.domElement.remove();
}

/* ------------------------------------------------------------------
   Cena de procura: as peças ficam num círculo à volta do jogador,
   a 3 m, na direcção "az" (graus). A câmara roda com o telemóvel.
   ------------------------------------------------------------------ */
async function procura(contentor, pecas, fovH) {
  const r = novoRenderer(contentor);
  const cena = new THREE.Scene();
  luzes(cena);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  const objs = {};
  await Promise.all(pecas.map(async p => {
    const g = normalizar(await modelo(p.id), 1.1);
    const a = THREE.MathUtils.degToRad(p.az);
    g.position.set(Math.sin(a) * 3, 0, -Math.cos(a) * 3);
    g.rotation.y = -a;               // virada para o jogador
    g.userData.base = g.scale.x;
    cena.add(g);
    objs[p.id] = g;
  }));
  const ajustar = () => {
    const w = contentor.clientWidth || 1, h = contentor.clientHeight || 1;
    r.setSize(w, h, false);
    cam.aspect = w / h;
    // FOV horizontal fixo (igual ao da camada 2D), FOV vertical calculado
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fovH / 2)) / cam.aspect));
    cam.updateProjectionMatrix();
  };
  ajustar();
  window.addEventListener("resize", ajustar);
  const t0 = performance.now();
  return {
    // rumo em graus; encontrada = id da peça encontrada (ou null); fixada = id fixado
    // info (opcional) = {id: {az, dist}}: só se vêem as peças que lá estão, na direcção
    // e à distância (em metros) a que estão do jogador; as outras ficam escondidas.
    desenhar(rumo, encontrada, fixada, info) {
      if (!contentor.isConnected) return this.parar();
      cam.rotation.set(0, -THREE.MathUtils.degToRad(rumo), 0);
      const t = (performance.now() - t0) / 1000;
      for (const [id, g] of Object.entries(objs)) {
        const inf = info ? info[id] : null;
        g.visible = !info || !!inf || id === fixada;
        if (!g.visible) continue;
        if (inf) {
          const a = THREE.MathUtils.degToRad(inf.az), rr = Math.max(1.5, Math.min(3.4, inf.dist));
          g.position.x = Math.sin(a) * rr; g.position.z = -Math.cos(a) * rr; g.rotation.y = -a;
        }
        const alvo = g.userData.base * (id === encontrada ? 1.5 : 1);
        g.scale.setScalar(g.scale.x + (alvo - g.scale.x) * 0.2);
        g.children[0].rotation.y = t * 0.6;               // roda devagar sobre si
        g.position.y = Math.sin(t * 2.6 + g.id) * 0.05;
        if (id === fixada) { // "Fixar": a peça vem para a frente da câmara
          const a = THREE.MathUtils.degToRad(rumo);
          g.position.set(Math.sin(a) * 2.4, 0, -Math.cos(a) * 2.4);
          g.rotation.y = -a;
        }
      }
      r.render(cena, cam);
    },
    parar() {
      window.removeEventListener("resize", ajustar);
      if (r.domElement.isConnected || r.getContext()) libertar(r, cena);
      this.desenhar = () => {};
    },
  };
}

/* ------------------------------------------------------------------
   Visualizador: uma peça (curiosidade) ou a fortaleza montada (fim).
   Roda sozinho; arrastar com o dedo roda-o à mão.
   ------------------------------------------------------------------ */
async function visualizador(contentor, ids, { montado = false } = {}) {
  const r = novoRenderer(contentor);
  r.domElement.style.pointerEvents = "auto";
  r.domElement.style.touchAction = "pan-y";
  const cena = new THREE.Scene();
  luzes(cena);
  let raiz, alt = 2;
  if (montado) {
    // fortaleza montada: cada peça no seu lugar (modelos/pecas.json), assente no morro
    const pos = await lerPosicoes();
    const forte = new THREE.Group();
    for (const id of ["base", ...ids]) {
      const m = await modelo(id);
      m.position.fromArray(pos[id]);
      forte.add(m);
    }
    const caixa = new THREE.Box3().setFromObject(forte);
    const c = caixa.getCenter(new THREE.Vector3()), dim = caixa.getSize(new THREE.Vector3());
    forte.position.set(-c.x, -caixa.min.y, -c.z);
    // enquadrar monumentos de tamanhos diferentes: o maior lado passa a medir ~7 m
    forte.scale.setScalar(6.8 / Math.max(dim.x, dim.z, dim.y * 1.3));
    forte.position.multiplyScalar(forte.scale.x);
    alt = dim.y * forte.scale.x;
    raiz = new THREE.Group();
    raiz.add(forte);
    const chao = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1, flatShading: true }));
    chao.position.y = -0.3;
    raiz.add(chao);
    const mar = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.6 }));
    mar.rotation.x = -Math.PI / 2;
    mar.position.y = -0.45;
    raiz.add(mar);
  } else {
    raiz = normalizar(await modelo(ids[0]), 2);
  }
  cena.add(raiz);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  // a câmara acompanha a altura do monumento, para nada ficar cortado
  cam.position.set(0, montado ? 2.2 + alt * 0.55 : 1.1, montado ? 10.5 + alt * 0.4 : 4.4);
  cam.lookAt(0, montado ? alt * 0.42 : 0, 0);
  const ajustar = () => {
    const w = contentor.clientWidth || 1, h = contentor.clientHeight || 1;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  ajustar();
  window.addEventListener("resize", ajustar);

  let ang = montado ? -0.5 : 0.4, vel = 0.5, arrasto = null, ultimo = performance.now();
  r.domElement.addEventListener("pointerdown", e => { arrasto = e.clientX; vel = 0; });
  r.domElement.addEventListener("pointermove", e => { if (arrasto != null) { ang += (e.clientX - arrasto) * 0.012; arrasto = e.clientX; } });
  const solta = () => { if (arrasto != null) { arrasto = null; setTimeout(() => (vel = 0.5), 2500); } };
  r.domElement.addEventListener("pointerup", solta);
  r.domElement.addEventListener("pointercancel", solta);

  let raf = 0;
  const ciclo = agora => {
    if (!contentor.isConnected) { window.removeEventListener("resize", ajustar); libertar(r, cena); return; }
    raf = requestAnimationFrame(ciclo);
    ang += vel * (agora - ultimo) / 1000; ultimo = agora;
    raiz.rotation.y = ang;
    r.render(cena, cam);
  };
  raf = requestAnimationFrame(ciclo);
  return { parar() { cancelAnimationFrame(raf); window.removeEventListener("resize", ajustar); libertar(r, cena); } };
}

/* ------------------------------------------------------------------
   Modo PERSONAGEM (sem RA): o monumento incompleto ao centro, as peças
   espalhadas à volta (cada uma com um feixe de luz) e a Kiala, que o
   jogador guia com o dedo (joystick) ou com o teclado. A câmara segue
   a personagem por trás e de cima, sempre virada para norte (para cima
   no ecrã = em frente), para o joystick ser fácil de perceber.
   ------------------------------------------------------------------ */
const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

function criarPersonagem(cor) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
  const pele = mat(0x7b4a2a), calca = mat(0x24324a), camisa = mat(cor), escuro = mat(0x1b1b1b);
  const perna = x => {
    const p = new THREE.Group(); p.position.set(x, 0.78, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), calca); m.position.y = -0.34; p.add(m);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), escuro); s.position.set(0, -0.72, 0.05); p.add(s);
    g.add(p); return p;
  };
  const braco = x => {
    const b = new THREE.Group(); b.position.set(x, 1.34, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.15), camisa); m.position.y = -0.2; b.add(m);
    const mao = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.13), pele); mao.position.y = -0.5; b.add(mao);
    g.add(b); return b;
  };
  const pe = perna(-0.12), pd = perna(0.12);
  const tronco = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), camisa); tronco.position.y = 1.08; g.add(tronco);
  const be = braco(-0.32), bd = braco(0.32);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), pele); cabeca.position.y = 1.6; g.add(cabeca);
  const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.228, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), escuro); cabelo.position.y = 1.62; g.add(cabelo);
  for (const x of [-0.08, 0.08]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), escuro); o.position.set(x, 1.63, 0.2); g.add(o); }
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.09, 16), mat(0xffc93c)); bone.position.y = 1.78; g.add(bone);
  const pala = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), mat(0xffc93c)); pala.position.set(0, 1.75, 0.27); g.add(pala);
  const mochila = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.18), mat(0xc0392b)); mochila.position.set(0, 1.1, -0.23); g.add(mochila);
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.02; g.add(sombra);
  return { g, pe, pd, be, bd };
}

// O mundo do monumento (igual no ecrã e na VR): chão, monumento incompleto, árvores e peças com feixe de luz
async function construirMundo(pecas, op = {}) {
  const CEU = 0x9fd3f5;
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(CEU);
  cena.fog = new THREE.Fog(CEU, 30, 70);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x7a5a3a, 2.0));
  const sol = new THREE.DirectionalLight(0xffffff, 2.3); sol.position.set(8, 14, 6); cena.add(sol);
  const tema = { morro: { chao: 0xd2b07a, fora: 0x1f5fa8 }, terra: { chao: 0xa8623a, fora: 0x6e8b3d }, rua: { chao: 0xa4a9ae, fora: 0x7f9a4a } }[op.fundo] || { chao: 0xd2b07a, fora: 0x6e8b3d };
  const MUNDO = 30;
  const plano = (geo, cor, y) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = y; cena.add(m); return m; };
  plano(new THREE.CircleGeometry(MUNDO + 3, 56), tema.chao, 0);
  plano(new THREE.RingGeometry(MUNDO + 3, 160, 56), tema.fora, -0.05);

  // o monumento, ainda sem as peças que faltam
  const mon = normalizar(await modelo("base"), op.tamanho || 14);
  let cx = new THREE.Box3().setFromObject(mon); mon.position.y -= cx.min.y; cena.add(mon);
  cx = new THREE.Box3().setFromObject(mon);
  const RM = Math.max(cx.max.x, -cx.min.x, cx.max.z, -cx.min.z) * 0.9 + 0.5;  // raio de "parede"

  // árvores e pedras à volta (sempre no mesmo sítio)
  const tronco = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, flatShading: true }), folha = new THREE.MeshStandardMaterial({ color: 0x3f7a35, flatShading: true });
  for (let i = 0; i < 22; i++) {
    const a = rnd(i) * Math.PI * 2, d = RM + 9 + rnd(i + 50) * (MUNDO - RM - 9);
    const t = new THREE.Group();
    const h = 1.6 + rnd(i + 9) * 1.6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, h, 6), tronco); tr.position.y = h / 2; t.add(tr);
    const co = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rnd(i + 3) * 0.6, 0), folha); co.position.y = h + 0.5; t.add(co);
    t.position.set(Math.sin(a) * d, 0, Math.cos(a) * d); cena.add(t);
  }

  // as peças, espalhadas à volta, com um anel e um feixe de luz para se verem de longe
  const objs = [];
  const feixeMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const p of pecas) {
    const k = pecas.indexOf(p), a = THREE.MathUtils.degToRad(p.az + (rnd(k + 7) - 0.5) * 20);
    const R = Math.min(MUNDO - 3, RM + (3 + ((k * 7) % 4) * 3 + rnd(k) * 2) * (op.dist || 1));   // a dificuldade afasta as peças
    const o = new THREE.Group();
    o.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    const m = normalizar(await modelo(p.id), 1.3); m.position.y = 1; o.add(m);
    const anel = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9 }));
    anel.position.y = 0.03; o.add(anel);
    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 20, 1, true), feixeMat); feixe.position.y = 4.5; o.add(feixe);
    o.userData = { id: p.id, m, anel };
    cena.add(o); objs.push(o);
  }

  return { cena, objs, RM, MUNDO };
}

async function mundo(contentor, pecas, op = {}, cb = {}) {
  const r = novoRenderer(contentor);
  const { cena, objs, RM, MUNDO } = await construirMundo(pecas, op);

  // a personagem
  const P = criarPersonagem(op.cor || 0x2a9d8f);
  const ini = op.inicio || { x: 0, z: RM + 5, rot: Math.PI };
  P.g.position.set(ini.x, 0, ini.z); P.g.rotation.y = ini.rot;
  P.g.scale.setScalar(1.35);   // um pouco maior que o real, para se ver bem no telemóvel
  cena.add(P.g);
  // seta por cima da cabeça, a apontar para a peça mais perto
  const seta = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  cena.add(seta);

  const cam = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  const OFF = new THREE.Vector3(0, 13, 10);
  cam.position.copy(P.g.position).add(OFF);
  const ajustar = () => { const w = contentor.clientWidth || 1, h = contentor.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  ajustar(); window.addEventListener("resize", ajustar);

  let entrada = { x: 0, y: 0 }, fase = 0, apanhar = null, raf = 0, ultimo = performance.now(), parado = false;
  const alvoCam = new THREE.Vector3();
  const ciclo = agora => {
    if (parado) return;
    if (!contentor.isConnected) return api.parar();
    raf = requestAnimationFrame(ciclo);
    const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora;
    const t = agora / 1000;
    // andar
    const mag = Math.min(1, Math.hypot(entrada.x, entrada.y));
    if (!apanhar && mag > 0.08) {
      const vx = entrada.x / Math.max(mag, 1e-6) * mag, vz = entrada.y / Math.max(mag, 1e-6) * mag;
      const pos = P.g.position;
      pos.x += vx * 4.5 * dt; pos.z += vz * 4.5 * dt;
      // não atravessa o monumento nem sai do mundo
      const d = Math.hypot(pos.x, pos.z);
      if (d < RM) { pos.x *= RM / d; pos.z *= RM / d; }
      if (d > MUNDO) { pos.x *= MUNDO / d; pos.z *= MUNDO / d; }
      const rot = Math.atan2(vx, vz);
      P.g.rotation.y += Math.atan2(Math.sin(rot - P.g.rotation.y), Math.cos(rot - P.g.rotation.y)) * Math.min(1, dt * 12);
      fase += dt * 9 * mag;
    } else fase *= 0.9;
    const bal = Math.sin(fase) * 0.6 * (mag > 0.08 && !apanhar ? 1 : 0);
    P.pe.rotation.x = bal; P.pd.rotation.x = -bal; P.be.rotation.x = -bal * 0.8; P.bd.rotation.x = bal * 0.8;
    P.g.position.y = Math.abs(Math.sin(fase)) * 0.06;

    // peças: flutuam e rodam; a mais perto guia a seta
    let melhor = null;
    for (const o of objs) {
      if (o.userData.apanhada) continue;
      o.userData.m.rotation.y = t * 0.8;
      o.userData.m.position.y = 1 + Math.sin(t * 2 + o.id) * 0.12;
      const dx = o.position.x - P.g.position.x, dz = o.position.z - P.g.position.z, dist = Math.hypot(dx, dz);
      if (!melhor || dist < melhor.dist) melhor = { o, dx, dz, dist };
    }
    if (apanhar) {
      // a peça salta para a mochila
      const k = Math.min(1, (agora - apanhar.t0) / 650), o = apanhar.o;
      o.position.lerpVectors(apanhar.de, P.g.position, k);
      o.position.y = Math.sin(k * Math.PI) * 1.5;
      o.scale.setScalar(1 - k * 0.9);
      if (k >= 1 && !apanhar.feito) { apanhar.feito = true; o.visible = false; cb.apanhar && cb.apanhar(o.userData.id); }
    } else if (melhor && melhor.dist < 1.5) {
      apanhar = { o: melhor.o, t0: agora, de: melhor.o.position.clone() };
      melhor.o.userData.apanhada = true; melhor.o.children.forEach(c => { if (c !== melhor.o.userData.m) c.visible = false; });
    }
    if (melhor && !apanhar) {
      seta.visible = op.seta !== false && melhor.dist > 2.5;   // no difícil não há seta
      seta.position.set(P.g.position.x, 2.35 + Math.sin(t * 4) * 0.08, P.g.position.z);
      seta.rotation.y = Math.atan2(melhor.dx, melhor.dz);
      const az = (THREE.MathUtils.radToDeg(Math.atan2(melhor.dx, -melhor.dz)) + 360) % 360; // 0 = para cima no ecrã
      cb.estado && cb.estado({ dist: melhor.dist, az, id: melhor.o.userData.id, andar: mag > 0.08 });
    } else seta.visible = false;

    // câmara: segue a personagem, suavemente
    alvoCam.copy(P.g.position).add(OFF);
    cam.position.lerp(alvoCam, Math.min(1, dt * 5));
    cam.lookAt(P.g.position.x, 0, P.g.position.z - 3);   // a personagem fica abaixo do meio: vê-se mais à frente
    r.render(cena, cam);
  };
  raf = requestAnimationFrame(ciclo);
  const api = {
    entrada(x, y) { entrada = { x, y }; },
    posicao() { return { x: P.g.position.x, z: P.g.position.z, rot: P.g.rotation.y }; },
    // para os testes automáticos: onde está a personagem e cada peça
    teste() { return { eu: { x: P.g.position.x, z: P.g.position.z }, pecas: objs.filter(o => !o.userData.apanhada).map(o => ({ id: o.userData.id, x: o.position.x, z: o.position.z })) }; },
    parar() { if (parado) return; parado = true; cancelAnimationFrame(raf); window.removeEventListener("resize", ajustar); libertar(r, cena); },
  };
  return api;
}

/* ------------------------------------------------------------------
   VR com óculos ligados ao PC (WebXR immersive-vr: Meta Quest com Link,
   SteamVR, Windows Mixed Reality…). O jogador fica no lugar da Kiala,
   dentro do monumento. Manípulo esquerdo: andar; direito: rodar 30°.
   A curiosidade e a pergunta aparecem num painel; responde-se apontando
   o comando e carregando no gatilho.
   ------------------------------------------------------------------ */
async function vrSuportado() {
  try { return !!(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported("immersive-vr")); }
  catch (e) { return false; }
}

// Painel de texto e botões (desenhado num canvas, mostrado num plano dentro da VR)
function criarPainel() {
  const W = 1024, H = 800;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.visible = false;
  let c = null, foco = -1, botoes = [];
  const FD = '"Fredoka", system-ui, sans-serif';
  const linhas = (txt, max) => {
    const out = []; let l = "";
    for (const w of String(txt).split(/\s+/)) { const t = l ? l + " " + w : w; if (ctx.measureText(t).width > max && l) { out.push(l); l = w; } else l = t; }
    if (l) out.push(l); return out;
  };
  const caixa = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  function desenhar() {
    ctx.clearRect(0, 0, W, H);
    caixa(8, 8, W - 16, H - 16, 44); ctx.fillStyle = "rgba(11,16,22,.95)"; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = c.cor || "#FFC93C"; ctx.stroke();
    let y = 86;
    if (c.sub) { ctx.font = `600 30px ${FD}`; ctx.fillStyle = c.cor || "#FFC93C"; ctx.fillText(c.sub.toUpperCase(), 64, y); y += 58; }
    ctx.font = `600 50px ${FD}`; ctx.fillStyle = "#FFFFFF";
    for (const l of linhas(c.titulo || "", W - 128)) { ctx.fillText(l, 64, y); y += 60; }
    y += 10;
    // botões em baixo; o texto ocupa o espaço que sobra
    const n = (c.botoes || []).length, BH = 86, G = 16, topoB = H - 48 - n * (BH + G) + G;
    let tam = 34;
    if (c.texto) {
      let L;
      do { ctx.font = `500 ${tam}px system-ui, sans-serif`; L = linhas(c.texto, W - 128); } while (y + L.length * tam * 1.3 > topoB - 20 && --tam > 22);
      ctx.fillStyle = "#C9D4DF";
      for (const l of L) { y += tam * 1.1; ctx.fillText(l, 64, y); y += tam * 0.2; }
    }
    botoes = (c.botoes || []).map((b, i) => {
      const r = { x: 64, y: topoB + i * (BH + G), w: W - 128, h: BH, f: b.f };
      caixa(r.x, r.y, r.w, r.h, 26); ctx.fillStyle = b.prim ? "#FFC93C" : "#223040"; ctx.fill();
      if (i === foco) { ctx.lineWidth = 6; ctx.strokeStyle = "#FFFFFF"; ctx.stroke(); }
      ctx.font = `600 36px ${FD}`; ctx.fillStyle = b.prim ? "#0B1016" : "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.t, W / 2, r.y + BH / 2, r.w - 40); ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      return r;
    });
    tex.needsUpdate = true;
  }
  return {
    mesh, canvas: cv,
    mostrar(conteudo) { c = conteudo; foco = -1; desenhar(); mesh.visible = true; },
    esconder() { mesh.visible = false; c = null; },
    visivel: () => mesh.visible,
    botaoEm(uv) { const x = uv.x * W, y = (1 - uv.y) * H; return botoes.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); },
    focar(i) { if (c && i !== foco) { foco = i; desenhar(); } },
    carregar(i) { const b = botoes[i]; if (b && b.f) b.f(); },
  };
}

// cb: { apanhar(id) -> dados da peça, responder(id, i) -> {certa, texto}, sair(motivo) }
async function sessaoVR(pecas, op, cb) {
  const sessao = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
  try { return await montarVR(sessao, pecas, op, cb); }
  catch (e) { try { await sessao.end(); } catch (e2) {} throw e; }
}

async function montarVR(sessao, pecas, op, cb) {
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.xr.enabled = true;
  // "local-floor": a altura real da cabeça; se não houver, põe-se a cabeça a 1,6 m
  let chaoReal = true;
  try { await sessao.requestReferenceSpace("local-floor"); r.xr.setReferenceSpaceType("local-floor"); }
  catch (e) { chaoReal = false; r.xr.setReferenceSpaceType("local"); }
  const { cena, objs, RM, MUNDO } = await construirMundo(pecas, op);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  const rig = new THREE.Group(); rig.add(cam); cena.add(rig);
  rig.position.set(0, chaoReal ? 0 : 1.6, RM + 5);          // de frente para o monumento

  const painel = criarPainel(); cena.add(painel.mesh);
  const cabeca = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const mostrarPainel = conteudo => {
    const xc = r.xr.getCamera(); xc.getWorldPosition(cabeca); xc.getWorldDirection(dir);
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
    painel.mesh.position.copy(cabeca).addScaledVector(dir, 1.7); painel.mesh.position.y = cabeca.y - 0.15;
    painel.mesh.lookAt(cabeca.x, painel.mesh.position.y, cabeca.z);
    painel.mostrar(conteudo);
  };

  // comandos: um raio amarelo para apontar ao painel; gatilho = escolher
  const raycaster = new THREE.Raycaster(), matRot = new THREE.Matrix4();
  const apontar = ctl => { matRot.identity().extractRotation(ctl.matrixWorld); raycaster.ray.origin.setFromMatrixPosition(ctl.matrixWorld); raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matRot);
    const h = painel.visivel() ? raycaster.intersectObject(painel.mesh)[0] : null; return h ? painel.botaoEm(h.uv) : -1; };
  const comandos = [0, 1].map(i => {
    const ctl = r.xr.getController(i);
    const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: 0xffc93c }));
    ctl.add(linha); rig.add(ctl);
    ctl.addEventListener("select", () => { const b = apontar(ctl); if (b >= 0) painel.carregar(b); });
    return ctl;
  });

  const restam = () => objs.filter(o => !o.userData.apanhada).length;
  const terminar = motivo => { terminou = motivo; try { sessao.end(); } catch (e) {} };
  let terminou = null;
  const fluxoPeca = (id, info) => {
    mostrarPainel({ sub: "Peça encontrada: " + info.nome, titulo: "Sabias que…", texto: info.curio,
      botoes: [{ t: "Responder à pergunta", prim: true, f: () => pergunta(id, info) }] });
  };
  const pergunta = (id, info) => {
    mostrarPainel({ sub: "Pergunta", titulo: info.q, botoes: info.o.map((o, i) => ({ t: "ABC"[i] + ".  " + o, f: () => {
      const res = cb.responder(id, i), falta = restam();
      mostrarPainel({ sub: res.certa ? "Certo!" : "Não foi desta", cor: res.certa ? "#5BE38A" : "#FF8A80", titulo: res.texto, texto: info.explica,
        botoes: [{ t: falta ? `Procurar a próxima peça (faltam ${falta})` : "Sair da VR e montar", prim: true, f: () => { painel.esconder(); if (!falta) terminar("todas"); } }] });
    } })) });
  };
  mostrarPainel({ sub: "Caçadores da História", titulo: "Bem-vindo ao monumento!",
    texto: "Manípulo esquerdo: andar. Manípulo direito: rodar. Vai até às luzes douradas para apanhar as peças. Aponta o comando e carrega no gatilho para escolher.",
    botoes: [{ t: "Começar", prim: true, f: () => painel.esconder() }] });

  await r.xr.setSession(sessao);
  sessao.addEventListener("end", () => {
    r.setAnimationLoop(null);
    cena.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    r.dispose();
    cb.sair(terminou || "saiu");
  });

  let ultimo = performance.now(), rodou = false;
  r.setAnimationLoop(agora => {
    const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora; const t = agora / 1000;
    const xc = r.xr.getCamera(); xc.getWorldPosition(cabeca); xc.getWorldDirection(dir); dir.y = 0; if (dir.lengthSq() > 1e-4) dir.normalize();
    // manípulos (gamepad "xr-standard": eixos 2 e 3)
    if (!painel.visivel()) for (const src of sessao.inputSources) {
      const g = src.gamepad; if (!g || !g.axes) continue;
      const ax = g.axes.length >= 4 ? g.axes[2] : g.axes[0] || 0, ay = g.axes.length >= 4 ? g.axes[3] : g.axes[1] || 0;
      if (src.handedness === "right") {
        if (Math.abs(ax) > 0.7 && !rodou) {     // rodar 30° à volta da cabeça
          rodou = true; const a = -Math.sign(ax) * Math.PI / 6;
          tmp.copy(rig.position).sub(cabeca).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); rig.position.copy(cabeca).add(tmp); rig.rotation.y += a;
        } else if (Math.abs(ax) < 0.3) rodou = false;
      } else if (Math.hypot(ax, ay) > 0.15) {
        const dirX = -dir.z, dirZ = dir.x;        // direita = frente rodada 90°
        rig.position.x += (dir.x * -ay + dirX * ax) * 2.6 * dt;
        rig.position.z += (dir.z * -ay + dirZ * ax) * 2.6 * dt;
      }
    }
    // não atravessa o monumento nem sai do mundo (conta a posição da cabeça)
    xc.getWorldPosition(cabeca);
    const d = Math.hypot(cabeca.x, cabeca.z);
    if (d < RM) { const k = RM / d - 1; rig.position.x += cabeca.x * k; rig.position.z += cabeca.z * k; }
    if (d > MUNDO) { const k = MUNDO / d - 1; rig.position.x += cabeca.x * k; rig.position.z += cabeca.z * k; }
    // peças: flutuam; apanha-se ao chegar perto
    for (const o of objs) {
      if (o.userData.apanhada) continue;
      o.userData.m.rotation.y = t * 0.8; o.userData.m.position.y = 1 + Math.sin(t * 2 + o.id) * 0.12;
      if (!painel.visivel() && Math.hypot(o.position.x - cabeca.x, o.position.z - cabeca.z) < 1.4) {
        o.userData.apanhada = true; o.visible = false;
        fluxoPeca(o.userData.id, cb.apanhar(o.userData.id));
      }
    }
    // realce do botão para onde se aponta
    if (painel.visivel()) { let f = -1; for (const c of comandos) { const b = apontar(c); if (b >= 0) f = b; } painel.focar(f); }
    r.render(cena, cam);
  });
  return { terminar() { terminar("saiu"); } };
}

/* ------------------------------------------------------------------
   WebXR (immersive-ar + hit-test): as peças ficam assentes no chão real.
   Android com ARCore (Chrome). No iPhone o Safari não suporta: o jogo
   continua no modo por orientação.
   ------------------------------------------------------------------ */
async function xrSuportado() {
  try { return !!(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported("immersive-ar")); }
  catch (e) { return false; }
}

// Jogo de pé: as peças ficam espalhadas a distâncias diferentes e só se apanham quando se chega perto.
const DIST_XR = [2.5, 4.0, 5.5, 3.2, 6.0, 4.6];  // metros, por ordem das peças (× escala do espaço)
const PERTO_XR = 1.8;  // é preciso chegar a menos de 1,8 m da peça para a apanhar
const TAM_XR = 0.7;    // tamanho de cada peça no chão (metros)
const graus = r => THREE.MathUtils.radToDeg(r);
const normaliza = d => ((d % 360) + 540) % 360 - 180;

// cb: { estado({fase, diff, perto, encontrada}), encontrar(id), sair(motivo) }
async function sessaoXR(pecas, overlay, cb, opcoes = {}) {
  const sessao = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: overlay },
  });
  try {
    return await montarXR(sessao, pecas, cb, opcoes.escala || 1);
  } catch (e) {
    try { await sessao.end(); } catch (e2) {}
    throw e;
  }
}

async function montarXR(sessao, pecas, cb, escala) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.xr.enabled = true;
  r.xr.setReferenceSpaceType("local");
  const cena = new THREE.Scene();
  luzes(cena);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.01, 40);

  // círculo que mostra onde o chão foi detectado
  const mira = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd400 }));
  mira.matrixAutoUpdate = false;
  mira.visible = false;
  cena.add(mira);

  // peças (ainda escondidas até se escolher o chão)
  const objs = {};
  for (const p of pecas) {
    const g = normalizar(await modelo(p.id), TAM_XR);
    const caixa = new THREE.Box3().setFromObject(g);
    const suporte = new THREE.Group();     // a base da peça fica em y = 0
    g.position.y -= caixa.min.y;
    suporte.add(g);
    const anel = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.95 }));
    anel.position.y = 0.01;
    anel.visible = false;
    suporte.add(anel);
    suporte.visible = false;
    suporte.userData = { id: p.id, az: p.az, anel, base: 1, dist: DIST_XR[Math.max(0, pecas.indexOf(p)) % DIST_XR.length] * escala };
    cena.add(suporte);
    objs[p.id] = suporte;
  }

  // Pegadas no chão real, do jogador até à peça mais próxima (significante de caminho)
  const texPe = (() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const g = c.getContext("2d"); g.fillStyle = "#FFD400"; g.strokeStyle = "#000"; g.lineWidth = 5;
    g.beginPath(); g.ellipse(32, 80, 19, 38, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const [x, y, rr] of [[12, 28, 7], [25, 18, 8], [39, 17, 7], [51, 23, 6], [58, 34, 5]]) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matPe = new THREE.MeshBasicMaterial({ map: texPe, transparent: true, depthWrite: false });
  const geoPe = new THREE.PlaneGeometry(0.11, 0.22).rotateX(-Math.PI / 2);
  const pegadas = [...Array(7)].map(() => { const m = new THREE.Mesh(geoPe, matPe); m.visible = false; cena.add(m); return m; });
  let chaoY = 0;

  await r.xr.setSession(sessao);
  const viewer = await sessao.requestReferenceSpace("viewer");
  const fonteHit = await sessao.requestHitTestSource({ space: viewer });

  let fase = "chao", encontrada = null, desde = 0, terminou = false;
  const camPos = new THREE.Vector3(), frente = new THREE.Vector3();
  let rumo = 0;   // graus: 0 = para onde olhava ao escolher o chão; positivo = direita

  const pousar = () => {
    const chao = new THREE.Vector3().setFromMatrixPosition(mira.matrix);
    chaoY = chao.y;
    const rumo0 = rumo;
    for (const o of Object.values(objs)) {
      const a = THREE.MathUtils.degToRad(rumo0 + o.userData.az);
      const R = Math.max(1.5, o.userData.dist);
      o.position.set(camPos.x + Math.sin(a) * R, chao.y, camPos.z - Math.cos(a) * R);
      o.rotation.y = -a;      // fachada virada para o jogador
      o.visible = true;
    }
    mira.visible = false;
    fase = "cacar";
  };

  sessao.addEventListener("select", () => {
    if (fase === "chao" && mira.visible) pousar();
    else if (fase === "cacar" && encontrada) { const id = encontrada; terminou = "encontrou"; cb.encontrar(id); sessao.end(); }
  });

  sessao.addEventListener("end", () => {
    r.setAnimationLoop(null);
    try { fonteHit.cancel(); } catch (e) {}
    cena.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    r.dispose();
    cb.sair(terminou || "saiu");
  });

  const t0 = performance.now();
  r.setAnimationLoop((t, frame) => {
    const xrCam = r.xr.getCamera();
    xrCam.getWorldPosition(camPos);
    xrCam.getWorldDirection(frente);
    rumo = graus(Math.atan2(frente.x, -frente.z));

    if (fase === "chao" && frame) {
      const hits = frame.getHitTestResults(fonteHit);
      if (hits.length) {
        const pose = hits[0].getPose(r.xr.getReferenceSpace());
        mira.visible = true;
        mira.matrix.fromArray(pose.transform.matrix);
      } else mira.visible = false;
      cb.estado({ fase, chao: mira.visible });
    }

    if (fase === "cacar") {
      let melhor = null, md = 999;
      const s = (performance.now() - t0) / 1000;
      for (const o of Object.values(objs)) {
        const dx = o.position.x - camPos.x, dz = o.position.z - camPos.z;
        const diff = normaliza(graus(Math.atan2(dx, -dz)) - rumo);
        if (Math.abs(diff) < md) { md = Math.abs(diff); melhor = { o, diff, dist: Math.hypot(dx, dz) }; }
        o.children[0].rotation.y = s * 0.5;
      }
      if (melhor) {
        // só se apanha ao chegar perto, de frente para a peça
        if (melhor.dist < PERTO_XR && md < 35) { if (!desde) desde = performance.now(); } else desde = 0;
        const achou = desde && performance.now() - desde > 400;
        encontrada = achou ? melhor.o.userData.id : null;
        for (const o of Object.values(objs)) {
          const sim = o === melhor.o && achou;
          o.userData.anel.visible = sim;
          const alvo = sim ? 1.35 : 1;
          o.scale.setScalar(o.scale.x + (alvo - o.scale.x) * 0.2);
        }
        // pegadas: de 0,5 m à frente do jogador até perto da peça, alternando pé esquerdo/direito
        const dx = melhor.o.position.x - camPos.x, dz = melhor.o.position.z - camPos.z, L = Math.hypot(dx, dz);
        const ux = dx / L, uz = dz / L, ang = Math.atan2(-dx, -dz);
        pegadas.forEach((m, i) => {
          const d = 0.5 + i * 0.35;
          m.visible = !encontrada && d < L - 0.35;
          if (!m.visible) return;
          const lado = (i % 2 ? 1 : -1) * 0.07;
          m.position.set(camPos.x + ux * d - uz * lado, chaoY + 0.005, camPos.z + uz * d + ux * lado);
          m.rotation.y = ang;
          m.scale.setScalar(0.85 + 0.25 * Math.max(0, Math.sin(s * 5 - i * 0.9)));
        });
        cb.estado({ fase, diff: melhor.diff, dist: melhor.dist, perto: Math.max(0, Math.min(1, 1 - (melhor.dist - PERTO_XR) / 5)) * (md < 60 ? 1 : 0.5), encontrada, alcance: PERTO_XR });
      }
    }
    r.render(cena, cam);
  });

  return { terminar() { try { sessao.end(); } catch (e) {} } };
}

if (webglOK()) {
  window.RA3D = { procura, visualizador, modelo, xrSuportado, sessaoXR, precarregar, mundo, sessaoVR,
    // para testar o painel da VR sem óculos: devolve a imagem do painel
    painelImagem(conteudo) { const p = criarPainel(); p.mostrar(conteudo); return p.canvas.toDataURL(); } };
  xrSuportado().then(ok => { window.RA3D.xr = ok; window.dispatchEvent(new Event("ra3d-xr")); });
  vrSuportado().then(ok => { window.RA3D.vr = ok; window.dispatchEvent(new Event("ra3d-vr")); });
  // pré-carregar os modelos (são poucos KB) para não haver espera no local
  if (window.NIVEL_PASTA && window.NIVEIS) precarregar((window.NIVEIS.find(n => `modelos/${n.id}/` === window.NIVEL_PASTA) || { pecas: [] }).pecas.map(p => p.id));
  window.dispatchEvent(new Event("ra3d-pronto"));
}
