import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── palette, ramp, grid ───────────────────────────────────────────────────────
const PALETTE = [
  [ 33, 158, 188], // teal
  [142, 202, 230], // sky
  [255, 183,   3], // amber
  [251, 133,   0], // orange
];
const RAMP    = '.:-=+*#%@';
const BG_HEX  = '#080808';
const CELL_W  = 8;
const CELL_H  = 13;
const FONT_PX = 12;

// ── bg layer constants ───────────────────────────────────────────────────────
const BG_CHARS = ['.', ':', ';', '+', '-', '|', 'x', '/', '\\', '~'];
const BG_DIM   = 'rgba(142, 202, 230, 0.10)';
const SKY_RGB   = [142, 202, 230];
const AMBER_RGB = [255, 183,   3];
const HEAT_R = 140;
const HEAT_S = 0.35;
const HEAT_D = 0.88;

// ── state ─────────────────────────────────────────────────────────────────────
let asciiCanvas, asciiCtx, bgCanvas, bgCtx;
let renderer, scene, camera, renderTarget;
let gridCols = 0, gridRows = 0, logW = 0, logH = 0;
let pixelBuffer;
let bgCells = [];
let mouseX = -9999, mouseY = -9999;
let tRotX = 0, tRotY = 0;
let model = null;
let animId = null;
let resizeTmr = null;
let bootDone = false;

const pivot = new THREE.Group();
const inner = new THREE.Group();
pivot.add(inner);

let hamburger, mainNav;

// ── ascii canvas setup ────────────────────────────────────────────────────────
function setupAscii() {
  asciiCanvas = document.getElementById('splat-canvas');
  if (!asciiCanvas) return false;
  const w = asciiCanvas.offsetWidth;
  const h = asciiCanvas.offsetHeight;
  if (w === 0 || h === 0) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  logW = w;
  logH = h;
  asciiCanvas.width  = logW * dpr;
  asciiCanvas.height = logH * dpr;
  asciiCtx = asciiCanvas.getContext('2d');
  asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  asciiCtx.font         = `bold ${FONT_PX}px "Courier New", Courier, monospace`;
  asciiCtx.textAlign    = 'center';
  asciiCtx.textBaseline = 'middle';

  gridCols = Math.floor(logW / CELL_W);
  gridRows = Math.floor(logH / CELL_H);
  pixelBuffer = new Uint8Array(gridCols * gridRows * 4);

  buildBg(dpr);
  return true;
}

function buildBg(dpr) {
  bgCells = new Array(gridCols * gridRows);
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      bgCells[r * gridCols + c] = {
        x: c * CELL_W + CELL_W / 2,
        y: r * CELL_H + CELL_H / 2,
        char: BG_CHARS[Math.floor(Math.random() * BG_CHARS.length)],
        heat: 0,
      };
    }
  }
  bgCanvas = document.createElement('canvas');
  bgCanvas.width  = logW * dpr;
  bgCanvas.height = logH * dpr;
  bgCtx = bgCanvas.getContext('2d');
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.font         = `bold ${FONT_PX}px "Courier New", Courier, monospace`;
  bgCtx.textAlign    = 'center';
  bgCtx.textBaseline = 'middle';
  bgCtx.fillStyle    = BG_DIM;
  for (const c of bgCells) bgCtx.fillText(c.char, c.x, c.y);
}

// ── three scene ───────────────────────────────────────────────────────────────
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(38, logW / logH, 0.1, 200);
  camera.position.set(0, 0, 4.2);

  const glCanvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false });
  renderer.setSize(gridCols, gridRows);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  renderTarget = new THREE.WebGLRenderTarget(gridCols, gridRows, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });

  scene.add(new THREE.AmbientLight(0x8899aa, 1.2));
  scene.add(new THREE.HemisphereLight(0x8ecae6, 0x023047, 1.0));
  const key  = new THREE.DirectionalLight(0xffffff, 3.5);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim  = new THREE.DirectionalLight(0xffb703, 2.5);
  rim.position.set(-4, 0, -2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x219ebc, 1.2);
  fill.position.set(2, -3, 2);
  scene.add(fill);

  scene.add(pivot);
}

// ── procedural cables ─────────────────────────────────────────────────────────
function buildCables(anchorTopY, anchorHalfW, anchorSideY, anchorSideX) {
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x556677, metalness: 0.3, roughness: 0.6,
  });
  const far = 12;

  function wire(start, baseA, spread, radius = 0.045) {
    const rand = (s) => (Math.random() - 0.5) * s;
    const p0 = start.clone();
    const a1 = baseA + rand(spread);
    const p1 = p0.clone().add(new THREE.Vector3(
      Math.cos(a1), Math.sin(a1), rand(0.3)
    ).multiplyScalar(0.35 + Math.random() * 0.3));
    const a2 = a1 + rand(spread * 1.2);
    const p2 = p1.clone().add(new THREE.Vector3(
      Math.cos(a2), Math.sin(a2), rand(0.25)
    ).multiplyScalar(0.6 + Math.random() * 0.6));
    const a3 = a2 + rand(0.3);
    const p3 = p2.clone().add(new THREE.Vector3(
      Math.cos(a3), Math.sin(a3), rand(0.1)
    ).multiplyScalar(far));
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    inner.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, radius, 6, false),
      wireMat
    ));
  }

  const TOP_N = 16;
  for (let i = 0; i < TOP_N; i++) {
    const t = (i + 0.5) / TOP_N;
    const sx = -anchorHalfW + 2 * anchorHalfW * t;
    const baseA = Math.PI / 2 + (t - 0.5) * 1.3;
    const radius = 0.035 + Math.random() * 0.03;
    wire(new THREE.Vector3(sx, anchorTopY, 0), baseA, 0.35, radius);
  }
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const sy = anchorSideY - 0.4 + j * 0.4;
      wire(
        new THREE.Vector3(side * anchorSideX, sy, 0),
        side > 0 ? 0 : Math.PI,
        0.55,
        0.035
      );
    }
  }
}

// ── model load ────────────────────────────────────────────────────────────────
function loadModel() {
  const loader = new GLTFLoader();
  loader.load('helmet.glb',
    (gltf) => {
      model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size   = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = 4.2 / maxDim;
      model.scale.setScalar(scale);
      model.position.set(
        -center.x * scale,
        -center.y * scale,
        -center.z * scale
      );

      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.material = new THREE.MeshStandardMaterial({
            color:     0x9aa3ad,
            metalness: 0.55,
            roughness: 0.42,
            emissive:  0x161a1f,
          });
        }
      });

      inner.add(model);

      const box2 = new THREE.Box3().setFromObject(model);
      const s2   = box2.getSize(new THREE.Vector3());
      buildCables(box2.max.y - 0.1, s2.x * 0.35, 0, s2.x * 0.5);
    },
    undefined,
    (err) => console.error('Failed to load helmet.glb', err)
  );
}

// ── mouse / touch ─────────────────────────────────────────────────────────────
function bindInput() {
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!logW) return;
    const nx = (e.clientX / logW) * 2 - 1;
    const ny = (e.clientY / logH) * 2 - 1;
    tRotY =  nx * 0.45;
    tRotX = -ny * 0.25;
  });
  window.addEventListener('mouseleave', () => { mouseX = -9999; mouseY = -9999; });
  window.addEventListener('touchmove', (e) => {
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', () => { mouseX = -9999; mouseY = -9999; });
}

// ── heat update ───────────────────────────────────────────────────────────────
function updateHeat() {
  const R2 = HEAT_R * HEAT_R;
  const gx = Math.floor(mouseX / CELL_W);
  const gy = Math.floor(mouseY / CELL_H);
  const spanX = Math.ceil(HEAT_R / CELL_W) + 1;
  const spanY = Math.ceil(HEAT_R / CELL_H) + 1;
  const x0 = Math.max(0, gx - spanX);
  const x1 = Math.min(gridCols - 1, gx + spanX);
  const y0 = Math.max(0, gy - spanY);
  const y1 = Math.min(gridRows - 1, gy + spanY);
  for (let r = y0; r <= y1; r++) {
    for (let c = x0; c <= x1; c++) {
      const cell = bgCells[r * gridCols + c];
      if (!cell) continue;
      const dx = cell.x - mouseX, dy = cell.y - mouseY;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0) {
        const prox = 1 - Math.sqrt(d2) / HEAT_R;
        cell.heat = Math.min(1, cell.heat + prox * HEAT_S);
      }
    }
  }
  for (const cell of bgCells) {
    if (cell.heat > 0) {
      cell.heat *= HEAT_D;
      if (cell.heat < 0.001) cell.heat = 0;
    }
  }
}

function drawHeatedBg() {
  for (const c of bgCells) {
    if (c.heat < 0.02) continue;
    const t = Math.min(1, c.heat * 1.4);
    const r = Math.round(SKY_RGB[0] + (AMBER_RGB[0] - SKY_RGB[0]) * t);
    const g = Math.round(SKY_RGB[1] + (AMBER_RGB[1] - SKY_RGB[1]) * t);
    const b = Math.round(SKY_RGB[2] + (AMBER_RGB[2] - SKY_RGB[2]) * t);
    const alpha = 0.15 + c.heat * 0.7;
    asciiCtx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    asciiCtx.fillText(c.char, c.x, c.y);
  }
}

// ── draw ──────────────────────────────────────────────────────────────────────
function drawAscii() {
  asciiCtx.fillStyle = BG_HEX;
  asciiCtx.fillRect(0, 0, logW, logH);
  asciiCtx.drawImage(bgCanvas, 0, 0, logW, logH);
  drawHeatedBg();

  if (!model) return;

  const cols = gridCols, rows = gridRows;
  for (let r = 0; r < rows; r++) {
    const py = rows - 1 - r; // readPixels is bottom-up
    for (let c = 0; c < cols; c++) {
      const i = (py * cols + c) * 4;
      const R = pixelBuffer[i], G = pixelBuffer[i + 1], B = pixelBuffer[i + 2];
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      if (lum < 18) continue;

      const norm = Math.pow(lum / 255, 0.55);
      const charIdx = Math.min(RAMP.length - 1, Math.floor(norm * RAMP.length));
      const pIdx    = Math.min(PALETTE.length - 1, Math.floor(norm * PALETTE.length));
      const [pr, pg, pb] = PALETTE[pIdx];
      asciiCtx.fillStyle = `rgb(${pr},${pg},${pb})`;
      asciiCtx.fillText(
        RAMP[charIdx],
        c * CELL_W + CELL_W / 2,
        r * CELL_H + CELL_H / 2
      );
    }
  }
}

// ── animation loop ────────────────────────────────────────────────────────────
function animate() {
  animId = requestAnimationFrame(animate);
  updateHeat();
  if (model) {
    inner.rotation.y += 0.0025;
    pivot.rotation.x += (tRotX - pivot.rotation.x) * 0.05;
    pivot.rotation.y += (tRotY - pivot.rotation.y) * 0.05;
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, gridCols, gridRows, pixelBuffer);
  }
  drawAscii();
}

function startAnim() {
  if (animId) return;
  if (!asciiCtx) return;
  animId = requestAnimationFrame(animate);
}

function stopAnim() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

// ── tab switching ─────────────────────────────────────────────────────────────
function openTab(tabName) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#main-nav .nav-btn[data-tab]').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  const section = document.getElementById(tabName);
  if (section) section.classList.add('active');
  document.querySelectorAll(`#main-nav .nav-btn[data-tab="${tabName}"]`).forEach(b => {
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
  });
  if (tabName === 'home') startAnim();
  else stopAnim();
}

// ── resize ────────────────────────────────────────────────────────────────────
function onResize() {
  clearTimeout(resizeTmr);
  resizeTmr = setTimeout(() => {
    const home = document.getElementById('home');
    if (!home || !home.classList.contains('active')) return;
    stopAnim();
    if (!setupAscii()) return;
    camera.aspect = logW / logH;
    camera.updateProjectionMatrix();
    renderer.setSize(gridCols, gridRows);
    renderTarget.setSize(gridCols, gridRows);
    pixelBuffer = new Uint8Array(gridCols * gridRows * 4);
    startAnim();
  }, 150);
}

// ── boot ──────────────────────────────────────────────────────────────────────
function tryInit() {
  if (!setupAscii()) {
    requestAnimationFrame(tryInit);
    return;
  }
  setupScene();
  loadModel();
  document.fonts.ready.then(startAnim);
}

function boot() {
  if (bootDone) return;
  bootDone = true;

  hamburger = document.getElementById('hamburger');
  mainNav   = document.getElementById('main-nav');

  hamburger.addEventListener('click', function () {
    const open = mainNav.classList.toggle('open');
    this.classList.toggle('open', open);
    this.setAttribute('aria-expanded', open);
  });

  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      openTab(btn.dataset.tab);
    });
  });

  bindInput();
  window.addEventListener('resize', onResize);

  tryInit();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
