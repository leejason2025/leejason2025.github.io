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

// ── procedural cables — all radiate from a single nape anchor ────────────────
function buildCables(nape) {
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x556677, metalness: 0.3, roughness: 0.6,
  });
  const far = 12;

  // Every wire shares p0 at the nape and immediately spreads in its own
  // direction — no shared crown waypoint, so the bundle reads as a single
  // convergence point at the back of the helmet.
  function wire(outAngle, spread, radius = 0.04) {
    const rand = (s) => (Math.random() - 0.5) * s;

    const p0 = nape.clone();

    // Tight cluster near nape
    const a1 = outAngle + rand(spread * 0.4);
    const p1 = p0.clone().add(new THREE.Vector3(
      Math.cos(a1) * 0.32,
      Math.sin(a1) * 0.32,
      rand(0.2)
    ));

    // Full spread
    const a2 = outAngle + rand(spread);
    const p2 = p1.clone().add(new THREE.Vector3(
      Math.cos(a2), Math.sin(a2), rand(0.35)
    ).multiplyScalar(0.7 + Math.random() * 0.5));

    const a3 = a2 + rand(0.3);
    const p3 = p2.clone().add(new THREE.Vector3(
      Math.cos(a3), Math.sin(a3), rand(0.15)
    ).multiplyScalar(far));

    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    inner.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, radius, 6, false),
      wireMat
    ));
  }

  // Top fan — 16 wires rising up and outward
  const TOP_N = 16;
  for (let i = 0; i < TOP_N; i++) {
    const t = (i + 0.5) / TOP_N;
    const outA = Math.PI / 2 + (t - 0.5) * 1.4;
    wire(outA, 0.25, 0.035 + Math.random() * 0.025);
  }

  // Side wires — 3 per side, exiting left/right after the crown bundle
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const outA = (side > 0 ? 0 : Math.PI) + (j - 1) * 0.25;
      wire(outA, 0.3, 0.035);
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
      // Single bundle anchor at the nape (back-lower-center of the helmet).
      const nape = new THREE.Vector3(0, box2.min.y + s2.y * 0.40, -s2.z * 0.45);
      buildCables(nape);
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

// ── topographic ASCII bg (vision tab) ────────────────────────────────────────
function renderTopo() {
  const canvas = document.getElementById('topo-canvas');
  if (!canvas) return;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w === 0 || h === 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `bold ${FONT_PX}px "Courier New", Courier, monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(142, 202, 230, 0.14)';
  ctx.clearRect(0, 0, w, h);

  const cols = Math.floor(w / CELL_W);
  const rows = Math.floor(h / CELL_H);

  // sum of low-frequency sinusoids → smooth rolling height field
  function topo(x, y) {
    return (
      Math.sin(x * 0.0080) * 1.2 +
      Math.cos(y * 0.0100) * 1.0 +
      Math.sin((x + y) * 0.0060) * 0.8 +
      Math.cos((x - y) * 0.0070) * 0.6
    );
  }

  const STEP   = 0.45; // distance between contour lines
  const THRESH = 0.14; // how close to a contour level counts as "on" the line

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_W + CELL_W / 2;
      const y = r * CELL_H + CELL_H / 2;
      const z = topo(x, y);
      const phase = z / STEP;
      const dist  = Math.abs(phase - Math.round(phase));
      if (dist > THRESH) continue;

      // gradient direction picks a character aligned with the contour line
      const dzx = topo(x + 1, y) - z;
      const dzy = topo(x, y + 1) - z;
      const ax = Math.abs(dzx);
      const ay = Math.abs(dzy);

      let ch;
      if (ax < 1e-4 && ay < 1e-4)     ch = '.';
      else if (ay > ax * 2.2)         ch = '-';
      else if (ax > ay * 2.2)         ch = '|';
      else if (dzx * dzy > 0)         ch = '\\';
      else                            ch = '/';

      ctx.fillText(ch, x, y);
    }
  }
}

// ── photo dissolve (vision tab) ──────────────────────────────────────────────
function renderPhotoDissolve() {
  const container = document.querySelector('.vision-photo');
  if (!container) return;
  const img    = container.querySelector('img');
  const canvas = container.querySelector('.photo-dissolve');
  if (!img || !canvas) return;

  const cRect = container.getBoundingClientRect();
  const iRect = img.getBoundingClientRect();
  const w = cRect.width, h = cRect.height;
  if (w === 0 || h === 0) return;

  const imgLeft = iRect.left - cRect.left;
  const imgTop  = iRect.top  - cRect.top;
  const imgW    = iRect.width;
  const imgH    = iRect.height;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `bold ${FONT_PX}px "Courier New", Courier, monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.clearRect(0, 0, w, h);

  const cols = Math.floor(w / CELL_W);
  const rows = Math.floor(h / CELL_H);
  const CHARS = '.,:;+-=*%@#';

  const INSIDE_BAND  = 90;  // px inside image where chars start appearing
  const OUTSIDE_BAND = 130; // px outside image where chars fade to none

  // Match the page background color so chars subtract the image into the void
  // (the image appears to dissolve away rather than into another pattern).
  const BG_RGB = '8, 8, 8';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_W + CELL_W / 2;
      const y = r * CELL_H + CELL_H / 2;

      const dxL = x - imgLeft;
      const dxR = (imgLeft + imgW) - x;
      const dyT = y - imgTop;
      const dyB = (imgTop + imgH) - y;
      const minInside = Math.min(dxL, dxR, dyT, dyB);

      let density;
      if (minInside > 0) {
        if (minInside > INSIDE_BAND) continue;
        density = Math.pow(1 - minInside / INSIDE_BAND, 0.85);
      } else {
        const d = -minInside;
        if (d > OUTSIDE_BAND) continue;
        density = Math.pow(1 - d / OUTSIDE_BAND, 0.85);
      }

      if (Math.random() > density) continue;

      // alpha tracks density: opaque at the edge, fading inward and outward
      ctx.fillStyle = `rgba(${BG_RGB}, ${Math.min(1, density * 1.1)})`;

      // At the very edge, overprint multiple chars per cell with tiny jitter
      // so the boundary reads as a thick shredded band rather than a grid.
      const edgeDist = Math.abs(minInside);
      const overprint = edgeDist < 12 ? 3 : edgeDist < 28 ? 2 : 1;
      for (let k = 0; k < overprint; k++) {
        const ox = (Math.random() - 0.5) * (overprint > 1 ? 3.5 : 0);
        const oy = (Math.random() - 0.5) * (overprint > 1 ? 3.5 : 0);
        ctx.fillText(
          CHARS[Math.floor(Math.random() * CHARS.length)],
          x + ox, y + oy
        );
      }
    }
  }
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

  if (tabName === 'vision') {
    requestAnimationFrame(() => {
      renderTopo();
      renderPhotoDissolve();
    });
  }
}

// ── resize ────────────────────────────────────────────────────────────────────
function onResize() {
  clearTimeout(resizeTmr);
  resizeTmr = setTimeout(() => {
    const vision = document.getElementById('vision');
    if (vision && vision.classList.contains('active')) {
      renderTopo();
      renderPhotoDissolve();
    }

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
