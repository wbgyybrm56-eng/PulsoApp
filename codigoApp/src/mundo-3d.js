/* PULSO Breath · Mundo 3D y Breath UI (Three.js r160)
   Tres espacios: Frecuencia Base (Electro, cuadrícula topográfica, cubo de cristal),
   Cámara de Calibración (diales cilíndricos, deslizador, calibración de mirada) y
   Sala de Crisis (partículas de tensión, orbe fucsia, paneles de cristal curvo, HUD).
   Vuelos de cámara a través del punto del logotipo. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CRIMSON = new THREE.Color('#E0115F');
const ALABASTER = new THREE.Color('#EEEBE3');
const VOID = new THREE.Color('#050507');
const CAL_BG = new THREE.Color('#141417');
const fmt = (n, d = 1) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

/* ================= Configuración compartida con el motor ================= */
window.PULSO_CFG = Object.assign({ hostility: 5, voiceURI: null, rate: 1 }, store.get('pulso-breath-cfg', {}));
const saveCfg = () => store.set('pulso-breath-cfg', window.PULSO_CFG);

/* ================= Motor 3D ================= */
window.__breath3d = true;
const canvas = $('#world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  const n = document.createElement('p'); n.id = 'no3d';
  n.textContent = 'Tu navegador no puede mostrar el espacio 3D. La entrevista funciona igual: usa la navegación de arriba.';
  document.body.appendChild(n);
}
const scene = new THREE.Scene();
scene.background = ALABASTER.clone();
scene.fog = new THREE.Fog(ALABASTER.clone(), 18, 48);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 200);
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a968c, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(6, 10, 8); scene.add(key);

/* Tres espacios en el mismo lienzo, separados en profundidad */
const VIEWS = {
  base: { pos: new THREE.Vector3(0, 4.2, 12.5), look: new THREE.Vector3(0, 1.9, 0), bg: ALABASTER, fog: [18, 48] },
  cal: { pos: new THREE.Vector3(0, 1.7, -51), look: new THREE.Vector3(0, 1.5, -60), bg: CAL_BG, fog: [8, 30] },
  sala: { pos: new THREE.Vector3(0, 0.6, -111), look: new THREE.Vector3(0, 0.2, -120), bg: VOID, fog: [6, 26] },
};
camera.position.copy(VIEWS.base.pos); camera.lookAt(VIEWS.base.look);

/* ---------- 1 · Frecuencia Base: cuadrícula topográfica ---------- */
const baseGroup = new THREE.Group(); scene.add(baseGroup);
const mouseNDC = new THREE.Vector2(9, 9);
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const gridUniforms = { uTime: { value: 0 }, uMouse: { value: new THREE.Vector3(99, 0, 99) }, uAmp: { value: 0 }, uColor: { value: new THREE.Color('#111114') } };
(function buildGrid() {
  const N = 70, size = 56, step = size / N, pts = [];
  for (let i = 0; i <= N; i++) {
    const a = -size / 2 + i * step;
    for (let j = 0; j < N; j++) {
      const b0 = -size / 2 + j * step, b1 = b0 + step;
      pts.push(a, 0, b0, a, 0, b1);   // línea a lo largo de Z
      pts.push(b0, 0, a, b1, 0, a);   // línea a lo largo de X
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: gridUniforms, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; uniform vec3 uMouse; uniform float uAmp; varying float vFade;
      void main(){ vec3 p = position;
        float w = 0.16*sin(p.x*0.32+uTime*0.55)*cos(p.z*0.27+uTime*0.42);
        float d = distance(p.xz, uMouse.xz);
        float r = uAmp*exp(-d*d*0.045)*sin(d*1.5-uTime*3.6);
        p.y += w + r; vFade = 1.0 - smoothstep(9.0, 27.0, length(p.xz));
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying float vFade; void main(){ gl_FragColor = vec4(uColor, 0.22*vFade); }`,
  });
  baseGroup.add(new THREE.LineSegments(g, m));
})();

/* ---------- El Electro: filamentos orgánicos entrelazados ---------- */
const electro = new THREE.Group(); electro.position.set(0, 2.1, 0); baseGroup.add(electro);
const EXAMPLES = [
  { ex: true, date: '2026-10-02', fpm: 9.4, wpm: 178, gaze: 52, words: 410 },
  { ex: true, date: '2026-10-09', fpm: 7.1, wpm: 168, gaze: 61, words: 455 },
  { ex: true, date: '2026-10-16', fpm: 5.2, wpm: 160, gaze: 70, words: 498 },
  { ex: true, date: '2026-10-23', fpm: 3.9, wpm: 152, gaze: 78, words: 520 },
  { ex: true, date: '2026-10-30', fpm: 2.6, wpm: 146, gaze: 84, words: 540 },
];
const sessions = () => store.get('pulso-breath-electro', []);
let filaments = [];
function buildElectro() {
  filaments.forEach((f) => { electro.remove(f); f.geometry.dispose(); f.material.dispose(); });
  filaments = [];
  const real = sessions(); const list = real.length ? real : EXAMPLES; const n = list.length;
  list.forEach((s, k) => {
    const latest = k === n - 1;
    const a0 = (k / Math.max(n, 1)) * Math.PI * 2;
    const turns = 0.8 + (s.wpm || 140) / 190;
    const wob = Math.min(0.6, (s.fpm || 0) / 14);
    const pts = [];
    for (let j = 0; j <= 48; j++) {
      const t = j / 48, a = a0 + t * Math.PI * 2 * turns;
      const R = 1.05 + 0.45 * Math.sin(t * Math.PI) + wob * 0.35 * Math.sin(t * 19 + k);
      pts.push(new THREE.Vector3(Math.cos(a) * R, (t - 0.5) * 3.4 + wob * 0.18 * Math.cos(t * 23 + k), Math.sin(a) * R));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const radius = 0.022 + ((s.gaze || 60) / 100) * 0.04;
    const geo = new THREE.TubeGeometry(curve, 220, radius, 10, false);
    const mat = new THREE.MeshStandardMaterial({
      color: latest ? CRIMSON : new THREE.Color(s.ex ? '#6E6C74' : '#2A2A30'), roughness: 0.32, metalness: 0.15,
      emissive: latest ? CRIMSON : new THREE.Color('#000000'), emissiveIntensity: latest ? 0.45 : 0, transparent: !!s.ex, opacity: s.ex ? 0.8 : 1,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = s;
    mesh.rotation.set(Math.sin(k * 2.1) * 0.32, k * 0.7, Math.cos(k * 1.7) * 0.28); mesh.scale.setScalar(0.85 + 0.3 * Math.abs(Math.sin(k * 1.3)));
    electro.add(mesh); filaments.push(mesh);
  });
  // estadísticas
  const r = real;
  const avg = (k) => { const v = r.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  $('#stSessions').textContent = String(r.length);
  const fp = avg('fpm'), wp = avg('wpm'), gz = avg('gaze');
  $('#stFpm').innerHTML = fp == null ? '—' : fmt(fp, 1);
  $('#stWpm').innerHTML = wp == null ? '—' : `${Math.round(wp)} <small>ppm</small>`;
  $('#stGaze').innerHTML = gz == null ? '—' : `${Math.round(gz)} <small>%</small>`;
  $('#stNote').textContent = r.length ? 'Media de tus sesiones guardadas en este navegador. El filamento fucsia es la última.' : 'Datos de ejemplo hasta tu primera sesión: verás cómo el Electro se aprieta y se ordena cuando mejoras.';
}
buildElectro();

/* ---------- El cubo de cristal que absorbe documentos ---------- */
const cube = new THREE.Group(); cube.position.set(5.2, 1.7, 1.6); baseGroup.add(cube);
const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transmission: 0.92, thickness: 0.6, ior: 1.45, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const S1 = 1.5, half = S1 / 2;
const faces = [];
[[0, 0, half, 0, 0], [0, 0, -half, 0, Math.PI], [half, 0, 0, 0, Math.PI / 2], [-half, 0, 0, 0, -Math.PI / 2], [0, -half, 0, Math.PI / 2, 0]].forEach(([x, y, z, rx, ry]) => {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(S1, S1), glass); f.position.set(x, y, z); f.rotation.set(rx, ry, 0); cube.add(f); faces.push(f);
});
const lidPivot = new THREE.Group(); lidPivot.position.set(0, half, -half); cube.add(lidPivot);
const lid = new THREE.Mesh(new THREE.PlaneGeometry(S1, S1), glass); lid.rotation.x = -Math.PI / 2; lid.position.set(0, 0, half); lidPivot.add(lid);
const edgeMat = new THREE.LineBasicMaterial({ color: CRIMSON, transparent: true, opacity: 0.55 });
cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S1, S1, S1)), edgeMat));
const core = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: CRIMSON })); cube.add(core);
const absorb = { t: -1, pts: null, from: null };
function absorbAnimation() {
  const N = 260, pos = new Float32Array(N * 3), from = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2.6 + Math.random() * 1.6, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    from[i * 3] = r * Math.sin(ph) * Math.cos(th); from[i * 3 + 1] = r * Math.cos(ph) + 1.2; from[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  pos.set(from);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (absorb.pts) { cube.remove(absorb.pts); absorb.pts.geometry.dispose(); }
  absorb.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: CRIMSON, size: 0.06, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  absorb.from = from; absorb.t = 0; cube.add(absorb.pts);
}
function updateCube(dt, time) {
  cube.position.y = 1.7 + Math.sin(time * 0.9) * 0.12;
  const wait = dropping ? 1 : 0;
  cube.rotation.y += dt * (0.25 + wait * 0.8 + (absorb.t >= 0 && absorb.t < 0.5 ? 4 : 0));
  cube.scale.setScalar(THREE.MathUtils.lerp(cube.scale.x, 1 + wait * 0.18, 0.08));
  edgeMat.opacity = THREE.MathUtils.lerp(edgeMat.opacity, wait ? 1 : 0.55, 0.1);
  if (absorb.t >= 0) {
    absorb.t += dt / 2.6;
    const t = absorb.t;
    lidPivot.rotation.x = -1.9 * (t < 0.15 ? t / 0.15 : t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.2));
    const k = ease(THREE.MathUtils.clamp((t - 0.12) / 0.6, 0, 1));
    const p = absorb.pts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const fx = absorb.from[i * 3], fy = absorb.from[i * 3 + 1], fz = absorb.from[i * 3 + 2];
      const sw = (1 - k) * 0.8;
      p.setXYZ(i, fx * (1 - k) + Math.sin(i + t * 9) * sw * 0.2, fy * (1 - k) + (half + 0.3) * k * (1 - k) * 2, fz * (1 - k));
    }
    p.needsUpdate = true;
    absorb.pts.material.opacity = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.15);
    core.scale.setScalar(1 + (t > 0.7 && t < 1 ? Math.sin((t - 0.7) / 0.3 * Math.PI) * 1.4 : 0));
    if (t >= 1) { absorb.t = -1; cube.remove(absorb.pts); absorb.pts.geometry.dispose(); absorb.pts = null; core.scale.setScalar(1); }
  }
}

/* ---------- 2 · Cámara de Calibración: luz controlada ---------- */
const calGroup = new THREE.Group(); calGroup.position.set(0, 0, -60); scene.add(calGroup);
(function buildCal() {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  cone.position.set(0, 3.2, -1.5); calGroup.add(cone);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ color: 0x2a2a30 })); disk.rotation.x = -Math.PI / 2; disk.position.set(0, -1.3, -1.5); calGroup.add(disk);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 + i * 0.55, 0.006, 6, 120), new THREE.MeshBasicMaterial({ color: i === 0 ? CRIMSON : 0xeeebe3, transparent: true, opacity: i === 0 ? 0.7 : 0.18 }));
    ring.position.set(0, 1.3, -3); ring.userData.spin = (i % 2 ? -1 : 1) * (0.08 + i * 0.05); calGroup.add(ring);
  }
})();

/* ---------- 3 · El Punto Crítico: partículas, orbe y paneles de cristal ---------- */
const sala = new THREE.Group(); sala.position.set(0, 0, -120); scene.add(sala);
const PN = REDUCED ? 700 : 2200;
const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN);
for (let i = 0; i < PN; i++) { pPos[i * 3] = (Math.random() - 0.5) * 30; pPos[i * 3 + 1] = (Math.random() - 0.5) * 16; pPos[i * 3 + 2] = (Math.random() - 0.5) * 22 + 2; pVel[i] = 0.4 + Math.random(); }
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: new THREE.Color('#8E8C95'), size: 0.045, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
sala.add(new THREE.Points(pGeo, pMat));
const orbU = { uTime: { value: 0 }, uLevel: { value: 0 }, uColor: { value: CRIMSON.clone() } };
const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 24), new THREE.ShaderMaterial({
  uniforms: orbU,
  vertexShader: `uniform float uTime; uniform float uLevel; varying vec3 vN; varying vec3 vV;
    void main(){ vec3 p = position;
      float n = sin(p.x*5.1+uTime*2.2)*sin(p.y*4.7+uTime*1.8)*sin(p.z*5.3+uTime*2.6);
      p += normal * n * (0.035 + uLevel*0.22);
      vec4 mv = modelViewMatrix*vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uLevel; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2);
      vec3 c = uColor*(0.55+0.35*uLevel) + vec3(1.0,0.75,0.85)*f*(0.6+uLevel);
      gl_FragColor = vec4(c, 1.0); }`,
}));
orb.position.set(0, -1.55, 0); sala.add(orb);
const orbLight = new THREE.PointLight(CRIMSON, 6, 9); orbLight.position.set(0, -1, 1.2); sala.add(orbLight);
const rings = [];
function spawnRing() {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.03, 96), new THREE.MeshBasicMaterial({ color: CRIMSON, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(orb.position); m.scale.setScalar(0.82); m.userData.t = 0; sala.add(m); rings.push(m);
}
/* Paneles de cristal curvo: tu cámara y Marta */
const R = 7.2, CENTER = new THREE.Vector3(0, 1.35, 9);   // centro del arco, cerca del punto de vista
function curvedPanel(theta, width, height) {
  const g = new THREE.CylinderGeometry(R, R, height, 40, 1, true, Math.PI + theta - width / 2, width);
  return g;
}
const videoPanelMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1f, side: THREE.BackSide, transparent: true, opacity: 0.95 });
const videoPanel = new THREE.Mesh(curvedPanel(0.19, 0.3, 1.45), videoPanelMat); videoPanel.position.copy(CENTER); sala.add(videoPanel);
const martaCanvas = document.createElement('canvas'); martaCanvas.width = 768; martaCanvas.height = 480;
const martaTex = new THREE.CanvasTexture(martaCanvas); martaTex.colorSpace = THREE.SRGBColorSpace;
const martaPanel = new THREE.Mesh(curvedPanel(-0.19, 0.3, 1.45), new THREE.MeshBasicMaterial({ map: martaTex, side: THREE.BackSide, transparent: true, opacity: 0.95 }));
martaPanel.position.copy(CENTER); sala.add(martaPanel);
// reflejo del cristal: un brillo que se desplaza con la cámara
const sheenMat = new THREE.ShaderMaterial({
  uniforms: { uShift: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform float uShift; varying vec2 vUv;
    void main(){ float s = smoothstep(0.0, 0.18, 0.18 - abs(vUv.x*0.7 + vUv.y*0.5 - 0.55 - uShift));
      float edge = smoothstep(0.985, 1.0, max(abs(vUv.x*2.0-1.0), abs(vUv.y*2.0-1.0)));
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.95), s*0.10 + edge*0.35); }`,
});
[-0.19, 0.19].forEach((th) => { const sh = new THREE.Mesh(curvedPanel(th, 0.3, 1.45), sheenMat); sh.position.copy(CENTER); sh.scale.setScalar(0.998); sala.add(sh); });
let videoTex = null;
function setVideoTexture(on) {
  const v = $('#pe-video');
  if (on && v.srcObject) {
    if (!videoTex) { videoTex = new THREE.VideoTexture(v); videoTex.colorSpace = THREE.SRGBColorSpace; }
    videoPanelMat.map = videoTex; videoPanelMat.color.set(0xffffff);
  } else { videoPanelMat.map = null; videoPanelMat.color.set(0x1a1a1f); }
  videoPanelMat.needsUpdate = true;
}
/* Marta: forma de onda y su última frase */
const marta = { text: 'Marta te espera.', level: 0, speaking: false };
function drawMarta(time) {
  const c = martaCanvas.getContext('2d'), W = c.canvas.width, H = c.canvas.height;
  // el panel se ve desde dentro del arco: se dibuja en espejo para que el texto se lea bien
  c.setTransform(-1, 0, 0, 1, W, 0);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16161b'); g.addColorStop(1, '#0a0a0d');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(238,235,227,.55)'; c.font = '500 20px "JetBrains Mono", monospace'; c.fillText('MARTA · ENTREVISTADORA', 36, 52);
  c.fillStyle = '#E0115F'; c.fillRect(36, 70, 12, 12);
  c.fillStyle = 'rgba(238,235,227,.55)'; c.fillText(marta.speaking ? 'HABLANDO' : 'ESCUCHA', 58, 82);
  const bars = 48, bw = (W - 72) / bars;
  for (let i = 0; i < bars; i++) {
    const h = 8 + (marta.speaking ? (0.35 + marta.level) * 90 : 6) * Math.abs(Math.sin(i * 0.55 + time * 7 + Math.sin(i * 1.7 + time * 3)));
    c.fillStyle = i % 6 === 0 ? '#E0115F' : 'rgba(238,235,227,.75)';
    c.fillRect(36 + i * bw, 200 - h / 2, Math.max(2, bw - 4), h);
  }
  c.fillStyle = '#EEEBE3'; c.font = 'italic 400 27px Inter, sans-serif';
  const words = marta.text.split(' '); let line = '', y = 305; const maxW = W - 72;
  const lines = [];
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.slice(-4).forEach((l, i) => c.fillText(l, 36, y + i * 38));
  martaTex.needsUpdate = true;
}

/* ================= Navegación entre dimensiones: vuelos a través del punto ================= */
let current = 'base', flying = false, running = false;
const GROUPS = { base: baseGroup, cal: calGroup, sala: sala };
function showGroups(...names) { Object.entries(GROUPS).forEach(([k, g]) => { g.visible = names.includes(k); }); }
showGroups('base');
const flash = $('#portalFlash');
const portal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: CRIMSON, transparent: true, opacity: 1, depthWrite: false }));
portal.visible = false; scene.add(portal);
const controls = renderer ? new OrbitControls(camera, canvas) : null;
if (controls) {
  controls.target.copy(VIEWS.base.look); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 4; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.49; controls.rotateSpeed = 0.6;
}
function setDim(name) {
  document.body.dataset.dim = name;
  $$('.dim').forEach((d) => d.classList.toggle('on', d.id === 'dim-' + name));
  $$('.dims button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === name)));
  gridUniforms.uColor.value.set(name === 'base' ? '#111114' : '#EEEBE3');
  try { history.replaceState(null, '', '#' + name); } catch { /* sin historial */ }
}
function flyTo(name, then) {
  if (!VIEWS[name] || flying) return;
  if (running && name !== 'sala') return;            // durante la entrevista no se sale de la sala
  if (name === current) { then && then(); return; }
  flying = true; canvas.classList.add('flying'); showGroups(current, name);
  $$('.dim').forEach((d) => d.classList.remove('on'));
  if (controls) controls.enabled = false;
  const fromPos = camera.position.clone(), fromLook = controls ? controls.target.clone() : VIEWS[current].look.clone();
  const dir = fromLook.clone().sub(fromPos).normalize();
  const portalPos = fromPos.clone().addScaledVector(dir, 4);
  portal.position.copy(portalPos); portal.lookAt(fromPos); portal.scale.setScalar(0.12); portal.visible = true; portal.material.opacity = 1;
  const to = VIEWS[name], toDir = to.look.clone().sub(to.pos).normalize();
  const arriveFrom = to.pos.clone().addScaledVector(toDir, -7);
  const bg0 = scene.background.clone(), bg1 = to.bg.clone();
  const f0 = [scene.fog.near, scene.fog.far], f1 = to.fog;
  const D = REDUCED ? 500 : 2300, t0 = performance.now();
  let swapped = false;
  (function step(now) {
    const t = Math.min(1, (now - t0) / D);
    if (t < 0.5) {
      const k = ease(t / 0.5);
      camera.position.lerpVectors(fromPos, portalPos, k * 0.92);
      camera.lookAt(fromLook.clone().lerp(portalPos, k));
      portal.scale.setScalar(0.12 + k * k * 3.2);
      flash.style.opacity = String(Math.max(0, (k - 0.75) * 4));
      flash.style.transform = `scale(${1 + k * k * 120})`;
    } else {
      if (!swapped) { swapped = true; portal.visible = false; setDim(name); $$('.dim').forEach((d) => d.classList.remove('on')); }
      const k = ease((t - 0.5) / 0.5);
      camera.position.lerpVectors(arriveFrom, to.pos, k);
      camera.lookAt(to.look);
      flash.style.opacity = String(Math.max(0, 1 - k * 2.2));
      flash.style.transform = `scale(${120 * (1 - k) + 1})`;
    }
    const kb = THREE.MathUtils.clamp((t - 0.35) / 0.3, 0, 1);
    scene.background.copy(bg0).lerp(bg1, kb); scene.fog.color.copy(scene.background);
    scene.fog.near = THREE.MathUtils.lerp(f0[0], f1[0], kb); scene.fog.far = THREE.MathUtils.lerp(f0[1], f1[1], kb);
    if (t < 1) requestAnimationFrame(step);
    else {
      flying = false; current = name; canvas.classList.remove('flying'); showGroups(name);
      flash.style.opacity = '0'; flash.style.transform = 'scale(0)';
      $('#dim-' + name).classList.add('on');
      if (controls) { controls.target.copy(to.look); controls.enabled = name === 'base'; }
      then && then();
    }
  })(t0);
}
$$('[data-go]').forEach((b) => b.addEventListener('click', () => flyTo(b.dataset.go)));
$('#logoPortal').addEventListener('click', () => flyTo({ base: 'cal', cal: 'sala', sala: 'base' }[current]));
function lockNav(on) { $$('.dims button').forEach((b) => { b.disabled = on && b.dataset.go !== 'sala'; }); $('#logoPortal').disabled = on; }
const startHash = location.hash.slice(1);

/* ================= Breath UI: paralaje, botones magnéticos y destellos ================= */
let px = 0, py = 0;
addEventListener('pointermove', (e) => {
  px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5;
  mouseNDC.set(px * 2, -py * 2);
  if (REDUCED) return;
  $$('.dim.on [data-depth]').forEach((el) => {
    if (innerWidth <= 900) return;
    const d = +el.dataset.depth; el.style.transform = `translate3d(${-px * d}px, ${-py * d}px, 0) rotateY(${px * d * 0.12}deg) rotateX(${-py * d * 0.12}deg)`;
  });
  $$('.dim.on .mag').forEach((b) => {
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ex = Math.max(r.left - e.clientX, 0, e.clientX - r.right), ey = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    if (Math.hypot(ex, ey) < 60) {
      const mx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2 + 60))), my = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2 + 60)));
      b.style.transform = `translate(${mx * 6}px, ${my * 5}px)`;
    } else b.style.transform = '';
  });
}, { passive: true });
function flashEl(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 420); }

/* Dial cilíndrico (accesible como control deslizante)
   Se crea una sola vez; las opciones se cambian con setItems. El tambor sigue al dedo o al ratón
   de forma continua y, al soltar, se asienta en la opción más cercana. */
function makeDial(el, items, index, onChange) {
  const drum = el.querySelector('.dial-drum'), FACE = 40, PX = 34;   // PX: píxeles de arrastre por opción
  const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let list = [], step = 36, rad = 60, idx = 0, pos = 0, faces = [];
  const clampI = (i) => Math.max(0, Math.min(list.length - 1, i));
  function render(animate) {
    drum.style.transition = animate && !REDUCED ? 'transform .38s cubic-bezier(.2,.8,.2,1)' : 'none';
    drum.style.transform = `translateZ(${-rad}px) rotateX(${pos * step}deg)`;
    const near = Math.round(pos);
    faces.forEach((f, k) => {
      const d = Math.abs(k - pos);
      f.style.opacity = d > 2.6 ? '0' : String(Math.max(0.12, 1 - d * 0.38));
      f.classList.toggle('sel', k === near);
    });
  }
  function aria() {
    el.setAttribute('aria-valuemin', '1'); el.setAttribute('aria-valuemax', String(list.length));
    el.setAttribute('aria-valuenow', String(idx + 1)); el.setAttribute('aria-valuetext', list[idx] || '');
  }
  function build(newItems, i) {
    list = newItems.slice();
    const slots = Math.max(list.length, 12);
    step = 360 / slots; rad = FACE / (2 * Math.tan(Math.PI / slots));
    drum.innerHTML = list.map((t, k) => `<div class="dial-face" style="transform: rotateX(${-k * step}deg) translateZ(${rad}px)">${escH(t)}</div>`).join('');
    faces = Array.from(drum.children);
    idx = pos = clampI(i || 0); render(false); aria();
  }
  function commit(i, user) {
    i = clampI(i); const changed = i !== idx;
    idx = i; pos = i; render(true); aria();
    if (user && changed) { flashEl(el); onChange(idx); }
  }
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, p: pos, moved: false }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = (drag.y - e.clientY) / PX; if (Math.abs(d) > 0.08) drag.moved = true;
    pos = Math.max(-0.35, Math.min(list.length - 0.65, drag.p + d)); render(false);
  });
  const end = (e) => {
    if (!drag) return;
    let target = Math.round(pos);
    if (!drag.moved && e && e.type === 'pointerup') {   // clic: arriba sube una opción, abajo baja una
      const r = el.getBoundingClientRect(); target = idx + (e.clientY < r.top + r.height / 2 ? -1 : 1);
    }
    drag = null; commit(target, true);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  let wheelAcc = 0, wheelT = 0;
  el.addEventListener('wheel', (e) => {
    e.preventDefault(); wheelAcc += e.deltaY;
    const now = performance.now();
    if (Math.abs(wheelAcc) >= 40 && now - wheelT > 110) { commit(idx + (wheelAcc > 0 ? 1 : -1), true); wheelAcc = 0; wheelT = now; }
  }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const k = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (k) { e.preventDefault(); commit(idx + k, true); }
    if (e.key === 'Home') { e.preventDefault(); commit(0, true); }
    if (e.key === 'End') { e.preventDefault(); commit(list.length - 1, true); }
  });
  build(items, index);
  return { set: commit, setItems: build, get index() { return idx; } };
}
const HINTS = ['', 'Cordial y paciente: te deja terminar.', 'Cordial: alguna repregunta para pedirte un ejemplo.', 'Amable, pero te pide ejemplos concretos.',
  'Exigente: pide concreción. Puede cortarte en la situación difícil.', 'Exigente: te corta si te enrollas en la situación difícil.', 'Escéptica: repregunta más y te corta si una respuesta se alarga.',
  'Directa: interrumpe respuestas largas en cualquier pregunta.', 'Cortante: dos interrupciones posibles y más repreguntas.', 'Muy exigente (siempre profesional): corta pronto y repregunta a menudo.', 'Presión máxima: no da tregua.'];
makeDial($('#dialHost'), Array.from({ length: 10 }, (_, i) => String(i + 1)), window.PULSO_CFG.hostility - 1, (i) => {
  window.PULSO_CFG.hostility = i + 1; saveCfg(); $('#hostHint').textContent = HINTS[i + 1]; $('#hudHost').textContent = `${i + 1}/10`; tension.spike = 0.4;
});
$('#hostHint').textContent = HINTS[window.PULSO_CFG.hostility]; $('#hudHost').textContent = `${window.PULSO_CFG.hostility}/10`;
/* Voces: solo las de español, sin repetidas, con nombre corto; al elegir una se oye una muestra */
const REGION = { 'es-ES': 'España', 'es-MX': 'México', 'es-US': 'EE. UU.', 'es-AR': 'Argentina', 'es-CO': 'Colombia', 'es-CL': 'Chile', 'es-419': 'Latinoamérica' };
let voices = [], voiceKey = '', previewT = 0;
function shortName(v) {
  const n = v.name;
  if (/^Google\b/i.test(n)) return 'Google';
  return n.replace(/^(Microsoft|Apple)\s+/i, '').replace(/\s*\(.*$/, '').replace(/\s+-\s+.*$/, '')
    .replace(/\s+(Online|Natural|Enhanced|Premium|Mejorada)\b/gi, '').trim() || n;
}
function voiceLabel(v) { const lang = v.lang.replace('_', '-'); return `${shortName(v)} · ${REGION[lang] || lang}`; }
function listVoices() {
  if (!('speechSynthesis' in window)) return [];
  const seen = new Set();
  return speechSynthesis.getVoices().filter((v) => /^es(-|_|$)/i.test(v.lang))
    .filter((v) => { const k = shortName(v) + v.lang; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.lang.replace('_', '-') === 'es-ES') - (a.lang.replace('_', '-') === 'es-ES') || (b.localService - a.localService) || shortName(a).localeCompare(shortName(b)))
    .slice(0, 16);
}
function previewVoice() {
  clearTimeout(previewT);
  previewT = setTimeout(() => {
    if (running || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('Hola, soy Marta.'); u.lang = 'es-ES'; u.rate = window.PULSO_CFG.rate;
      const v = voices.find((x) => x.voiceURI === window.PULSO_CFG.voiceURI); if (v) { u.voice = v; u.lang = v.lang; }
      speechSynthesis.speak(u);
    } catch { /* sin voz */ }
  }, 450);
}
const voiceDial = makeDial($('#dialVoice'), ['Voz del sistema'], 0, (i) => {
  window.PULSO_CFG.voiceURI = voices[i] ? voices[i].voiceURI : null; saveCfg(); previewVoice();
});
function loadVoices() {
  const vs = listVoices(), key = vs.map((v) => v.voiceURI).join('|');
  if (!vs.length || key === voiceKey) return;          // Chrome avisa varias veces: solo se reconstruye si cambia la lista
  voices = vs; voiceKey = key;
  let i = vs.findIndex((v) => v.voiceURI === window.PULSO_CFG.voiceURI);
  if (i < 0) { i = 0; window.PULSO_CFG.voiceURI = vs[0].voiceURI; saveCfg(); }
  voiceDial.setItems(vs.map(voiceLabel), i);
}
loadVoices();
if ('speechSynthesis' in window) { speechSynthesis.addEventListener('voiceschanged', loadVoices); setTimeout(loadVoices, 600); setTimeout(loadVoices, 2000); }
const rate = $('#rate'); rate.value = window.PULSO_CFG.rate;
const syncRate = () => { $('#rateOut').textContent = `${fmt(+rate.value, 2)}×`; };
rate.addEventListener('input', () => { window.PULSO_CFG.rate = +rate.value; saveCfg(); syncRate(); flashEl($('#rateBox')); }); syncRate();
$('#testVoice').addEventListener('click', () => {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('Hola, soy Marta. Cuando quieras, empezamos.'); u.lang = 'es-ES'; u.rate = window.PULSO_CFG.rate;
    const v = speechSynthesis.getVoices().find((x) => x.voiceURI === window.PULSO_CFG.voiceURI); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* sin voz */ }
});
$$('.chip[data-seg]').forEach((c) => c.addEventListener('click', () => {
  $$('.chip[data-seg]').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  const sel = $('#pe-seg'); sel.value = c.dataset.seg; sel.dispatchEvent(new Event('change')); flashEl(c);
}));
$('#closeReport').addEventListener('click', () => { $('#p-report').hidden = true; $('#p-doc').hidden = false; });
$('#enterRoom').addEventListener('click', () => flyTo('sala', () => { if (!running) $('#pe-start').click(); }));

/* ================= Documento: arrastrar al cubo ================= */
let dropping = false, dragDepth = 0;
const veil = $('#dropVeil');
addEventListener('dragenter', (e) => { if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return; dragDepth++; if (current !== 'base') return; dropping = true; veil.classList.add('on'); });
addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { dropping = false; veil.classList.remove('on'); } });
addEventListener('dragover', (e) => { e.preventDefault(); });
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; dropping = false; veil.classList.remove('on');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) { if (current !== 'base') flyTo('base', () => readDoc(f)); else readDoc(f); }
});
$('#docPick').addEventListener('click', () => $('#docFile').click());
$('#docFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) readDoc(f); });
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function readPdf(file) {
  const V = '3.11.174';
  if (!window.pdfjsLib) await loadScript(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.min.js`);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.worker.min.js`;
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map((it) => it.str).join(' '));
  return out.join('\n');
}
async function readDoc(file) {
  const st = $('#docStatus'); st.textContent = `Leyendo «${file.name}»…`;
  absorbAnimation();
  try {
    let text = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await readPdf(file) : await file.text();
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim();
    if (!text) throw new Error('vacío');
    $('#pe-cv').value = text.slice(0, 6000);
    st.textContent = `«${file.name}» absorbido: ${Math.min(text.length, 6000).toLocaleString('es-ES')} caracteres${text.length > 6000 ? ' (recortado)' : ''}. PULSO contrastará tus cifras con él.`;
  } catch (err) {
    console.warn(err);
    st.textContent = 'No se pudo leer el archivo. Prueba con otro PDF o pega el texto en «Ver o editar el texto».';
  }
}

/* ================= Conexión con el motor de la entrevista ================= */
const tension = { v: 0.15, spike: 0, hostility: () => window.PULSO_CFG.hostility };
let phase = 'idle', lastBump = 0, attState = '';
document.addEventListener('pulso:phase', (e) => {
  phase = e.detail; marta.speaking = phase === 'asking';
  running = ['asking', 'listening', 'thinking'].includes(phase);
  lockNav(running);
});
document.addEventListener('pulso:bump', () => {
  orbU.uLevel.value = Math.min(1, orbU.uLevel.value + 0.45); marta.level = Math.min(1, marta.level + 0.5);
  const now = performance.now(); if (now - lastBump > 260 && !REDUCED) { lastBump = now; spawnRing(); }
});
document.addEventListener('pulso:say', (e) => { marta.text = e.detail; });
document.addEventListener('pulso:interrupt', () => { tension.spike = 0.7; });
document.addEventListener('pulso:camera', (e) => setVideoTexture(e.detail));
const ATT = { ok: 'OK', away: 'FUERA', absent: 'SIN ROSTRO', calibrating: 'CALIBRANDO', loading: 'CARGANDO', nomodel: 'NO DISPONIBLE' };
document.addEventListener('pulso:att', (e) => { attState = e.detail; $('#hudAtt').textContent = ATT[attState] || '—'; });
const setMet = (id, v, bad) => { const el = $(id); el.querySelector('.v').textContent = v; el.classList.toggle('bad', !!bad); };
document.addEventListener('pulso:live', (e) => {
  const d = e.detail;
  setMet('#mFpm', d.fpm == null ? '—' : fmt(d.fpm, 1), d.fpm != null && d.fpm >= 3);
  setMet('#mWpm', d.wpm == null ? '—' : String(Math.round(d.wpm)), d.wpm != null && (d.wpm < 120 || d.wpm > 175));
  setMet('#mGaze', d.gaze == null ? '—' : `${Math.round(d.gaze)} %`, d.gaze != null && d.gaze < 80);
  setMet('#mLat', d.latency == null ? '—' : `${fmt(d.latency, 1)} s`, d.latency != null && d.latency > 3);
  setMet('#mWords', String(d.words), false);
});
document.addEventListener('pulso:done', (e) => {
  const d = e.detail;
  if (d.turns > 0) {
    const h = sessions(); h.push({ date: d.date, fpm: d.fpm, wpm: d.wpm, gaze: d.gaze, words: d.words, latency: d.latency, hostility: d.hostility });
    store.set('pulso-breath-electro', h.slice(-40)); buildElectro();
  }
  running = false; lockNav(false);
  setTimeout(() => flyTo('base', () => { $('#p-report').hidden = false; $('#p-doc').hidden = true; }), 1400);
});
document.addEventListener('pulso:abort', () => { running = false; lockNav(false); });
if (location.protocol === 'file:') $('#pe-fileWarn').classList.remove('hidden');

/* ================= Bucle de animación ================= */
const clock = new THREE.Clock();
let hover = null;
const tip = $('#tip');
function frame() {
  const dt = Math.min(0.05, clock.getDelta()), time = clock.elapsedTime;
  gridUniforms.uTime.value = time;
  // ondas de la cuadrícula al paso del ratón (Frecuencia Base)
  if (current === 'base' && !flying) {
    raycaster.setFromCamera(mouseNDC, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floorPlane, hit)) {
      const moved = hit.distanceTo(gridUniforms.uMouse.value) > 0.05;
      gridUniforms.uMouse.value.lerp(hit, 0.2);
      gridUniforms.uAmp.value = THREE.MathUtils.lerp(gridUniforms.uAmp.value, moved ? 0.55 : 0, moved ? 0.08 : 0.02);
    }
    // filamento bajo el cursor
    const hits = raycaster.intersectObjects(filaments, false);
    const h = hits.length ? hits[0].object : null;
    if (h !== hover) {
      filaments.forEach((f) => { f.material.emissiveIntensity = f === filaments[filaments.length - 1] ? 0.45 : 0; });
      hover = h;
      if (h) {
        const s = h.userData;
        tip.innerHTML = `${s.ex ? 'EJEMPLO · ' : ''}${new Date(s.date).toLocaleDateString('es-ES')}<br>${s.fpm == null ? '—' : fmt(s.fpm, 1)} muletillas/min<br>${s.wpm == null ? '—' : Math.round(s.wpm)} palabras/min<br>${s.gaze == null ? '—' : Math.round(s.gaze) + ' %'} contacto visual`;
        tip.hidden = false;
      } else tip.hidden = true;
    }
  } else if (!tip.hidden) { tip.hidden = true; hover = null; }
  electro.rotation.y += dt * 0.06;
  if (hover) { hover.material.emissive = hover.material.emissive || new THREE.Color(); if (hover !== filaments[filaments.length - 1]) hover.material.emissive.set('#E0115F'); hover.material.emissiveIntensity = 0.25 + 0.2 * Math.sin(time * 6); }
  updateCube(dt, time);
  calGroup.children.forEach((o) => { if (o.userData.spin) o.rotation.z += dt * o.userData.spin; });
  // Sala de crisis: tensión → velocidad y color de las partículas
  const H = window.PULSO_CFG.hostility / 10;
  tension.spike *= 0.97;
  const target = 0.12 + H * 0.5 + (phase === 'asking' ? 0.12 : 0) + (attState === 'away' ? 0.08 : 0) + tension.spike;
  tension.v += (target - tension.v) * 0.03;
  if (current === 'sala' || flying) {
    const p = pGeo.attributes.position, sp = (0.25 + tension.v * 2.4) * dt;
    for (let i = 0; i < PN; i++) {
      let y = p.getY(i) + pVel[i] * sp; if (y > 8) y = -8;
      p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(time * 0.6 + i) * sp * 0.25);
    }
    p.needsUpdate = true;
    pMat.color.set('#8E8C95').lerp(new THREE.Color('#FF1E3C'), Math.min(1, Math.max(0, (tension.v - 0.25) * 1.6)));
    orbU.uTime.value = time;
    orbU.uLevel.value = Math.max(phase === 'asking' ? 0.12 : 0, orbU.uLevel.value * 0.93);
    marta.level *= 0.9;
    const pulse = 1 + 0.025 * Math.sin(time * 2.2) + orbU.uLevel.value * 0.08;
    orb.scale.setScalar(pulse);
    orbLight.intensity = 4 + orbU.uLevel.value * 10;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.userData.t += dt / 1.4; const t = r.userData.t;
      r.scale.setScalar(0.82 + t * 2.2); r.material.opacity = 0.5 * (1 - t); r.lookAt(camera.position);
      if (t >= 1) { sala.remove(r); r.geometry.dispose(); r.material.dispose(); rings.splice(i, 1); }
    }
    sheenMat.uniforms.uShift.value = px * 0.3;
    if ((time * 30 | 0) % 2 === 0) drawMarta(time);
    // la cámara respira ligeramente con el ratón
    if (!flying) { camera.position.x += ((VIEWS.sala.pos.x + px * 0.5) - camera.position.x) * 0.03; camera.position.y += ((VIEWS.sala.pos.y - py * 0.3) - camera.position.y) * 0.03; camera.lookAt(VIEWS.sala.look); }
  }
  if (current === 'cal' && !flying) { camera.position.x += ((VIEWS.cal.pos.x + px * 0.6) - camera.position.x) * 0.03; camera.position.y += ((VIEWS.cal.pos.y - py * 0.3) - camera.position.y) * 0.03; camera.lookAt(VIEWS.cal.look); }
  if (controls && current === 'base' && !flying) controls.update();
  if (renderer) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (renderer) renderer.setSize(innerWidth, innerHeight, false); });
drawMarta(0);
requestAnimationFrame(frame);
if (startHash === 'cal' || startHash === 'sala') setTimeout(() => flyTo(startHash === 'sala' ? 'cal' : startHash), 2500);
