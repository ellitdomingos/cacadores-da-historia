// Camada 3D do jogo (three.js r160, guardado em vendor/ para funcionar offline).
// Expõe window.RA3D. Se o WebGL falhar, o jogo continua com os desenhos 2D.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/jsm/loaders/GLTFLoader.js";

const carregador = new GLTFLoader();
const cache = {};
let posicoes = null;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch (e) { return false; }
}

async function modelo(id) {
  if (!cache[id]) cache[id] = carregador.loadAsync(`modelos/${id}.glb`).then(g => g.scene);
  return (await cache[id]).clone(true);
}
async function lerPosicoes() {
  if (!posicoes) posicoes = await fetch("modelos/pecas.json").then(r => r.json());
  return posicoes;
}

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
    desenhar(rumo, encontrada, fixada) {
      if (!contentor.isConnected) return this.parar();
      cam.rotation.set(0, -THREE.MathUtils.degToRad(rumo), 0);
      const t = (performance.now() - t0) / 1000;
      for (const [id, g] of Object.entries(objs)) {
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
  let raiz;
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
    const c = caixa.getCenter(new THREE.Vector3());
    forte.position.set(-c.x, -caixa.min.y, -c.z);
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
  cam.position.set(0, montado ? 3.6 : 1.1, montado ? 9.5 : 4.4);
  cam.lookAt(0, montado ? 1.1 : 0, 0);
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
  window.RA3D = { procura, visualizador, modelo, xrSuportado, sessaoXR };
  xrSuportado().then(ok => { window.RA3D.xr = ok; window.dispatchEvent(new Event("ra3d-xr")); });
  // pré-carregar os modelos (são poucos KB) para não haver espera no local
  ["muralha", "portao", "canhao", "azulejos", "baluarte", "estatua", "base"].forEach(id => modelo(id).catch(() => {}));
  window.dispatchEvent(new Event("ra3d-pronto"));
}
