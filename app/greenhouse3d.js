// Light 3D greenhouse for the app's home card. Mirrors the website's model in a simpler form and
// follows the live device state in window.APP (vents, fans, heating, lights, watering, crop, house type).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const APP = window.APP;
const box = document.getElementById('hero3d');
const canvas = document.getElementById('gh3d');
const home = document.getElementById('s-control');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : sysDark.matches; };

/* ---------------- renderer, camera, light ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
camera.position.setFromSphericalCoords(21, 1.2, Math.PI / 4).add(new THREE.Vector3(0, 1.2, 0));

const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  target: new THREE.Vector3(0, 1.2, 0), enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: 0.08,
  autoRotate: !reduce, autoRotateSpeed: 0.6, rotateSpeed: 0.7,
  minPolarAngle: 1.2, maxPolarAngle: 1.2,   // fixed height: a horizontal swipe turns the house, a vertical one scrolls the page
});
canvas.style.touchAction = 'pan-y';
controls.addEventListener('start', () => { controls.autoRotate = false; });

const hemi = new THREE.HemisphereLight('#e6f2ff', '#6b8a4a', 1.4);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.position.set(10, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 2, far: 40 });
sun.shadow.bias = -0.0006;
scene.add(hemi, sun);

/* ---------------- ground and a few trees ---------------- */
const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: '#86ad5c' }));
grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true;
scene.add(grass);
const path = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 8), new THREE.MeshLambertMaterial({ color: '#cbbf9f' }));
path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, 10);
scene.add(path);
{
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), new THREE.MeshLambertMaterial({ color: '#6b4f36' }), 10);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#4e7f3a', flatShading: true }), 10);
  const m = new THREE.Matrix4();
  [[-14, -10], [-9, -15], [3, -17], [12, -14], [17, -6], [-17, 2], [16, 6], [-12, 12], [13, 15], [-4, -19]].forEach(([x, z], i) => {
    const h = 1.6 + (i % 3) * 0.4, r = 1.4 + (i % 4) * 0.25;
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    crowns.setMatrixAt(i, m.compose(new THREE.Vector3(x, h + r * 0.7, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.2, r)));
  });
  scene.add(trunks, crowns);
}

/* ---------------- shared pieces ---------------- */
const HW = 3, HL = 6, H = 2.4, R = 3.6;
const steel = new THREE.MeshStandardMaterial({ color: '#e3e7e4', metalness: 0.55, roughness: 0.35 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#e6f5ee', transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
const filmMat = new THREE.MeshStandardMaterial({ color: '#f1f5f0', transparent: true, opacity: 0.5, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false });
const heatMat = new THREE.MeshStandardMaterial({ color: '#5b5f5c', metalness: 0.5, roughness: 0.4, emissive: '#ff5a1f', emissiveIntensity: 0 });
const lampMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', emissive: '#ffd9a0', emissiveIntensity: 0 });
const dripMat = new THREE.MeshStandardMaterial({ color: '#1d1f1d', emissive: '#3aa0ff', emissiveIntensity: 0 });

// thin boxes between two points, all in one draw call
function beams(list, mat) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), mid = new THREE.Vector3();
  list.forEach(([a, b, t = 0.07], i) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    d.subVectors(B, A); const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    mesh.setMatrixAt(i, m.compose(mid.addVectors(A, B).multiplyScalar(0.5), q, new THREE.Vector3(t, len + t, t)));
  });
  mesh.castShadow = true;
  return mesh;
}

// one exhaust fan (square box, ring, rotor); returns the group and its rotor
function makeFan() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.16), new THREE.MeshStandardMaterial({ color: '#cdd3d0', metalness: 0.6, roughness: 0.35 }));
  frame.position.z = 0.08;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshStandardMaterial({ color: '#2d3432' }));
  hole.position.z = 0.17;
  const rotor = new THREE.Group(); rotor.position.z = 0.18;
  const bladeGeo = new THREE.BoxGeometry(0.1, 0.24, 0.01); bladeGeo.translate(0, 0.14, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#9aa4a1', metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 5; i++) { const p = new THREE.Group(); p.rotation.z = (i / 5) * Math.PI * 2; const b = new THREE.Mesh(bladeGeo, bladeMat); b.rotation.y = 0.5; p.add(b); rotor.add(p); }
  g.add(frame, hole, rotor);
  return { g, rotor };
}
const rotors = { glass: [], film: [] };

/* ---------------- glass house ---------------- */
const glass = new THREE.Group();
const roofY = x => H + (R - H) * (1 - Math.abs(x) / HW);
const vents = [];
{
  const list = [];
  for (let z = -HL; z <= HL + 1e-6; z += 1.5) for (const x of [HW, -HW]) { list.push([[x, 0, z], [x, H, z]]); list.push([[x, H, z], [0, R, z]]); }
  for (const x of [HW, -HW]) for (const y of [0.05, H]) list.push([[x, y, -HL], [x, y, HL]]);
  list.push([[0, R, -HL], [0, R, HL], 0.09]);
  for (const z of [HL, -HL]) { list.push([[-HW, 0.05, z], [HW, 0.05, z], 0.05]); list.push([[-HW, H, z], [HW, H, z], 0.05]); for (const x of [-1.5, 1.5]) list.push([[x, 0, z], [x, roofY(x), z], 0.05]); }
  glass.add(beams(list, steel));
  const v = [], quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d), tri = (a, b, c) => v.push(...a, ...b, ...c);
  for (const x of [HW, -HW]) { quad([x, 0, -HL], [x, 0, HL], [x, H, HL], [x, H, -HL]); quad([x, H, -HL], [x, H, HL], [0, R, HL], [0, R, -HL]); }
  for (const z of [HL, -HL]) { quad([-HW, 0, z], [HW, 0, z], [HW, H, z], [-HW, H, z]); tri([-HW, H, z], [HW, H, z], [0, R, z]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  const skin = new THREE.Mesh(g, glassMat); skin.renderOrder = 2; glass.add(skin);
  // roof vents on both slopes, hinged at the ridge
  const slope = Math.atan2(H - R, HW), len = 1.15;
  const pg = new THREE.BoxGeometry(len, 0.03, 2.6); pg.translate(len / 2, 0, 0);
  const ventMat = new THREE.MeshStandardMaterial({ color: '#dff2ea', transparent: true, opacity: 0.4, roughness: 0.05, depthWrite: false });
  for (const sx of [1, -1]) for (const zc of [-3, 3]) {
    const holder = new THREE.Group(); holder.scale.x = sx;
    const pivot = new THREE.Group(); pivot.position.set(0.02, R + 0.04, zc); pivot.rotation.z = slope; pivot.userData.slope = slope;
    const panel = new THREE.Mesh(pg, ventMat); panel.renderOrder = 3;
    panel.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg), new THREE.LineBasicMaterial({ color: '#f4f6f3' })));
    pivot.add(panel); holder.add(pivot); glass.add(holder); vents.push(pivot);
  }
  // two fans on each side wall
  for (const sx of [1, -1]) for (const z of [-2.25, 2.25]) {
    const { g: f, rotor } = makeFan(); f.position.set(sx * (HW + 0.01), 1.75, z); f.rotation.y = sx * Math.PI / 2; glass.add(f); rotors.glass.push(rotor);
  }
}

/* ---------------- polytunnel ---------------- */
const film = new THREE.Group();
const rolls = [];
{
  const TH0 = 1.3, TR = 3.5, SEG = 20;
  const ty = x => TH0 + (TR - TH0) * Math.sqrt(Math.max(0, 1 - (x / HW) ** 2));
  const prof = Array.from({ length: SEG + 1 }, (_, i) => { const x = -HW + (2 * HW * i) / SEG; return [x, ty(x)]; });
  const list = [];
  for (let z = -HL; z <= HL + 1e-6; z += 1.5) {
    for (const sx of [-1, 1]) list.push([[sx * HW, 0, z], [sx * HW, TH0, z], 0.05]);
    for (let i = 0; i < SEG; i++) list.push([[prof[i][0], prof[i][1], z], [prof[i + 1][0], prof[i + 1][1], z], 0.05]);
  }
  list.push([[0, TR, -HL], [0, TR, HL], 0.05]);
  for (const sx of [-1, 1]) list.push([[sx * HW, TH0, -HL], [sx * HW, TH0, HL], 0.05]);
  film.add(beams(list, steel));
  const v = [];
  for (let i = 0; i < SEG; i++) { const [x0, y0] = prof[i], [x1, y1] = prof[i + 1]; v.push(x0, y0, -HL, x1, y1, -HL, x1, y1, HL, x0, y0, -HL, x1, y1, HL, x0, y0, HL); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  const arch = new THREE.Mesh(g, filmMat); arch.renderOrder = 2; film.add(arch);
  const shape = new THREE.Shape(); shape.moveTo(-HW, 0); shape.lineTo(HW, 0); for (let i = SEG; i >= 0; i--) shape.lineTo(prof[i][0], prof[i][1]);
  for (const z of [HL, -HL]) { const e = new THREE.Mesh(new THREE.ShapeGeometry(shape), filmMat); e.position.z = z; e.renderOrder = 2; film.add(e); }
  // roll-up sides
  const cg = new THREE.PlaneGeometry(2 * HL, 1); cg.translate(0, -0.5, 0); cg.rotateY(Math.PI / 2);
  const tg = new THREE.CylinderGeometry(0.05, 0.05, 2 * HL, 10); tg.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const curtain = new THREE.Mesh(cg, filmMat); curtain.position.set(sx * (HW + 0.02), TH0, 0); curtain.renderOrder = 2;
    const tube = new THREE.Mesh(tg, steel); tube.position.set(sx * (HW + 0.06), 0.25, 0);
    film.add(curtain, tube); rolls.push({ curtain, tube, TH0 });
  }
  for (const [x, z, ry] of [[-1.7, HL, 0], [1.7, -HL, Math.PI]]) {
    const { g: f, rotor } = makeFan(); f.position.set(x, 1.8, z + (z > 0 ? 0.01 : -0.01)); f.rotation.y = ry; film.add(f); rotors.film.push(rotor);
  }
}
scene.add(glass, film);

/* ---------------- inside: beds, plants, pipes, lamps, drip lines ---------------- */
const BEDS = [-1.35, 1.35];
{
  const wood = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 });
  const soil = new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 1 });
  const fix = new THREE.MeshStandardMaterial({ color: '#3b4240', metalness: 0.6, roughness: 0.4 });
  for (const bx of BEDS) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 10.6), wood); bed.position.set(bx, 0.16, 0); bed.castShadow = bed.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 10.46), soil); top.position.set(bx, 0.32, 0);
    scene.add(bed, top);
    for (const off of [-0.86, 0.86]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 10.2, 8).rotateX(Math.PI / 2), heatMat); p.position.set(bx + off, 0.09, 0); scene.add(p); }
    for (const off of [-0.38, 0.38]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 10.2, 6).rotateX(Math.PI / 2), dripMat); d.position.set(bx + off, 0.37, 0); scene.add(d); }
    for (const z of [-3, 0, 3]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 2.2), fix); h.position.set(bx, 2.6, z);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 2.1), lampMat); led.position.set(bx, 2.57, z);
      scene.add(h, led);
    }
  }
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.14), new THREE.MeshStandardMaterial({ color: '#f3f3ee', roughness: 0.6 }));
  ctrl.position.set(1.45, 1.35, HL + 0.1); scene.add(ctrl);
}
const plants = new THREE.Group(); plants.position.y = 0.34; scene.add(plants);
// [plant height, fruit/flower colour or null for leaf crops]
const SHAPE = {
  tomato: [1, '#d6402b'], cherry: [1, '#e2452c'], cucumber: [1.25, '#3c6e2a'], pepper: [0.7, '#e8a21f'], chili: [0.6, '#c81e1e'],
  eggplant: [0.75, '#4b2a5c'], zucchini: [0.45, '#4f7f2e'], beans: [1.1, '#6aa33a'], radish: [0.15, null],
  strawberry: [0.25, '#d8262f'], melon: [0.3, '#d9c46a'], watermelon: [0.3, '#2f5d2a'],
  lettuce: [0.2, null], spinach: [0.2, null], parsley: [0.25, null], dill: [0.35, null], cilantro: [0.3, null], basil: [0.35, null],
  tarragon: [0.45, null], mint: [0.3, null], onion: [0.3, null],
  rose: [0.8, '#c8243c'], gerbera: [0.4, '#f08a24'], carnation: [0.6, '#e86a9a'], chrysanth: [0.6, '#f2d23c'], tulip: [0.35, '#e0303a'],
  seedlings: [0.12, null], citrus: [1.1, '#f2d23c'],
};
function buildPlants(crop) {
  plants.clear();
  const [hgt, fruitCol] = SHAPE[crop] || SHAPE.tomato;
  const rows = []; BEDS.forEach(bx => rows.push(bx - 0.38, bx + 0.38));
  const N = rows.length * 9;
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#4f8f3f', flatShading: true, roughness: 0.8 }), N * 5);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1, 5), new THREE.MeshStandardMaterial({ color: '#4d7a33' }), N);
  const fruit = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: fruitCol || '#4f8f3f', roughness: 0.35 }), N * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const shades = ['#3f7d3a', '#4f8f3f', '#2f6b34', '#5c9a45'].map(c => new THREE.Color(c));
  let li = 0, si = 0, fi = 0, seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const rx of rows) for (let k = 0; k < 9; k++) {
    const z = -4.8 + k * 1.2, h = hgt * (0.85 + rnd() * 0.3);
    stems.setMatrixAt(si++, hgt > 0.4 ? m.compose(new THREE.Vector3(rx, h / 2, z), q.identity(), new THREE.Vector3(1, h, 1)) : m.makeScale(0, 0, 0));
    for (let j = 0; j < 5; j++) {
      const a = rnd() * 6.28, r = hgt > 0.4 ? 0.12 : 0.1 + rnd() * 0.1, y = hgt > 0.4 ? 0.1 + (j / 4) * h : 0.05 + rnd() * 0.08;
      const s = (hgt > 0.4 ? 0.2 : 0.11) * (0.8 + rnd() * 0.4);
      leaves.setMatrixAt(li, m.compose(new THREE.Vector3(rx + Math.cos(a) * r, y, z + Math.sin(a) * r), q.setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3)), new THREE.Vector3(s, s * 0.7, s)));
      leaves.setColorAt(li++, shades[(rnd() * 4) | 0]);
    }
    for (let j = 0; j < 2; j++) {
      const s = fruitCol ? 0.05 : 0, a = rnd() * 6.28, y = hgt > 0.4 ? 0.2 + rnd() * h * 0.6 : 0.03;
      fruit.setMatrixAt(fi++, m.compose(new THREE.Vector3(rx + Math.cos(a) * 0.15, y, z + Math.sin(a) * 0.15), q.identity(), new THREE.Vector3(s, s * (crop === 'cucumber' || crop === 'zucchini' ? 3 : 1), s)));
    }
  }
  leaves.castShadow = stems.castShadow = true;
  plants.add(stems, leaves, fruit);
  renderer.shadowMap.needsUpdate = true;
}

/* ---------------- size, visibility, loop ---------------- */
function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(box);
resize();

let inView = true;
new IntersectionObserver(([en]) => { inView = en.isIntersecting; }).observe(box);

const cur = { vent: 0, fan: 0, heat: 0, lamp: 0 };
let lastCrop = null, lastType = null, lastVent = -1, last = performance.now(), acc = 0;
const GROW = new THREE.Color('#d68cff'), WARM = new THREE.Color('#ffd9a0');

function frame(now) {
  requestAnimationFrame(frame);
  if (!inView || home.hidden || document.hidden) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  acc += dt; if (acc < 1 / 40) return;   // ~40 fps is plenty for a card, and kinder to the battery
  const step = acc; acc = 0;

  const { DEV, state } = APP;
  if (state.crop !== lastCrop) { buildPlants(state.crop); lastCrop = state.crop; }
  if (state.type !== lastType) {
    glass.visible = state.type !== 'film'; film.visible = state.type === 'film';
    lastType = state.type; renderer.shadowMap.needsUpdate = true;
  }
  const k = reduce ? 1 : 1 - Math.exp(-step * 4);
  cur.vent += (DEV.vent.val / 100 - cur.vent) * k;
  cur.fan += (DEV.fan.val / 100 - cur.fan) * k;
  cur.heat += ((DEV.heat.power || 0) / 100 - cur.heat) * k;
  cur.lamp += (DEV.light.val / 100 - cur.lamp) * k;

  for (const v of vents) v.rotation.z = v.userData.slope + cur.vent * 0.75;
  const edge = 0.25 + cur.vent * 0.95;
  for (const r of rolls) { r.curtain.scale.y = Math.max(0.02, r.TH0 - edge); r.tube.position.y = edge; }
  if (!reduce) for (const r of rotors[state.type === 'film' ? 'film' : 'glass']) r.rotation.z -= step * cur.fan * 16;
  heatMat.emissiveIntensity = cur.heat * 1.8;
  const lc = DEV.light.color === 'grow' ? GROW : WARM;
  lampMat.emissive.copy(lc); lampMat.emissiveIntensity = cur.lamp * 3;
  dripMat.emissiveIntensity = DEV.water.val ? 0.6 + Math.sin(now / 200) * 0.4 : 0;

  const night = isDark();
  hemi.intensity = night ? 0.95 : 1.4;
  sun.intensity = night ? 0.9 : 2.4;
  if (Math.abs(cur.vent - lastVent) > 0.004) { renderer.shadowMap.needsUpdate = true; lastVent = cur.vent; }

  controls.update(step);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
