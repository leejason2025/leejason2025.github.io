'use strict';

// ── state ─────────────────────────────────────────────────────────────────────
let canvas, ctx, bgCanvas, bgCtx;
let cells = [], cellsByLayer = {};
let animId = null, frameN = 0;
let logW = 0, logH = 0, cellW = 8, cellH = 14, fontSize = 13;
let mouseX = -9999, mouseY = -9999;
let resizeTmr = null;

// ── palette ───────────────────────────────────────────────────────────────────
const PAL = {
  SKY:    [142, 202, 230],
  TEAL:   [ 33, 158, 188],
  AMBER:  [255, 183,   3],
  ORANGE: [251, 133,   0],
  WHITE:  [215, 235, 255],
};

const CHARS = {
  bg:      ['.', ':', ';', '+', '-', '|', 'x', '/', '\\', '~'],
  frame:   ['-', '|', '=', '+', '-', '|', '='],
  bracket: ['[', ']', '<', '>', '/', '\\'],
  bridge:  ['-', '~', '_', '=', '-'],
  cross:   ['+', '-', '|', '+', 'x'],
  lens:    ['O', 'o', '0', 'C', 'c', '(', ')'],
  inner:   ['*', '@', 'o', '#', '0'],
  center:  ['+', 'x', 'X', '*', '+'],
};

// col = rgb tuple, op = base opacity, sr = scramble rate/frame, ph = pulse phase
const LC = {
  bg:      { col: PAL.SKY,    op: 0.06, sr: 0,      ph: 0.0 },
  frame:   { col: PAL.TEAL,   op: 0.55, sr: 0.002,  ph: 0.5 },
  bracket: { col: PAL.ORANGE, op: 0.70, sr: 0.003,  ph: 1.1 },
  bridge:  { col: PAL.WHITE,  op: 0.48, sr: 0.002,  ph: 0.8 },
  cross:   { col: PAL.WHITE,  op: 0.55, sr: 0.002,  ph: 0.3 },
  lens:    { col: PAL.TEAL,   op: 0.75, sr: 0.003,  ph: 1.8 },
  inner:   { col: PAL.AMBER,  op: 0.82, sr: 0.003,  ph: 2.5 },
  center:  { col: PAL.WHITE,  op: 0.92, sr: 0.004,  ph: 0.0 },
};

const SHAPE_LAYERS = ['frame', 'bracket', 'bridge', 'cross', 'lens', 'inner', 'center'];
const ALL_LAYERS   = ['bg', ...SHAPE_LAYERS];
const HEAT_R = 130;
const HEAT_S = 0.35;
const HEAT_D = 0.88;

// ── geometry helpers ──────────────────────────────────────────────────────────
function dSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  if (len2 < 1e-4) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

function dRing(px, py, cx, cy, r) {
  return Math.abs(Math.hypot(px - cx, py - cy) - r);
}

// ── classify pixel to layer ───────────────────────────────────────────────────
function classify(px, py, w, h) {
  const s  = Math.min(w * 0.85, h * 0.7) / 530;
  const cx = w / 2;
  const cy = h / 2 - 20 * s;
  const lx = [cx - 135 * s, cx + 135 * s];

  const rT = Math.max(cellW * 0.9, 7 * s);
  const lT = Math.max(cellW * 0.7, 5 * s);
  const fT = Math.max(cellW * 0.8, 5 * s);

  // center rings r=28
  for (let i = 0; i < 2; i++)
    if (dRing(px, py, lx[i], cy, 28 * s) < rT) return 'center';

  // inner rings r=58
  for (let i = 0; i < 2; i++)
    if (dRing(px, py, lx[i], cy, 58 * s) < rT) return 'inner';

  // crosshairs with gap at center
  const g = 8 * s;
  for (let i = 0; i < 2; i++) {
    const lcx = lx[i];
    if (dSeg(px, py, lcx - 90 * s, cy, lcx - g,        cy         ) < lT) return 'cross';
    if (dSeg(px, py, lcx + g,       cy, lcx + 90 * s,   cy         ) < lT) return 'cross';
    if (dSeg(px, py, lcx,  cy - 88 * s, lcx, cy - g                ) < lT) return 'cross';
    if (dSeg(px, py, lcx,  cy + g,      lcx, cy + 88 * s           ) < lT) return 'cross';
  }

  // outer lens rings r=95
  for (let i = 0; i < 2; i++)
    if (dRing(px, py, lx[i], cy, 95 * s) < rT) return 'lens';

  // tick marks (16 per lens)
  for (let t = 0; t < 16; t++) {
    const a  = (t / 16) * Math.PI * 2;
    const r1 = 95 * s, r2 = (95 + (t % 4 === 0 ? 14 : 9)) * s;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < 2; i++)
      if (dSeg(px, py, lx[i] + ca * r1, cy + sa * r1, lx[i] + ca * r2, cy + sa * r2) < lT)
        return 'lens';
  }

  // nose bridge (piecewise parabola)
  for (let j = 0; j < 27; j++) {
    const t0 = j / 27, t1 = (j + 1) / 27;
    const bx0 = cx + (-40 + 80 * t0) * s, by0 = cy + 14 * (1 - (2 * t0 - 1) ** 2) * s;
    const bx1 = cx + (-40 + 80 * t1) * s, by1 = cy + 14 * (1 - (2 * t1 - 1) ** 2) * s;
    if (dSeg(px, py, bx0, by0, bx1, by1) < lT) return 'bridge';
  }

  // outer frame rectangle
  const fw = 245 * s, fh = 118 * s;
  if (Math.abs(py - (cy - fh)) < fT && px > cx - fw - fT && px < cx + fw + fT) return 'frame';
  if (Math.abs(py - (cy + fh)) < fT && px > cx - fw - fT && px < cx + fw + fT) return 'frame';
  if (Math.abs(px - (cx - fw)) < fT && py > cy - fh - fT && py < cy + fh + fT) return 'frame';
  if (Math.abs(px - (cx + fw)) < fT && py > cy - fh - fT && py < cy + fh + fT) return 'frame';

  // corner brackets
  const bs = 28 * s;
  const corners = [
    { x: cx - fw, y: cy - fh, dx:  1, dy:  1 },
    { x: cx + fw, y: cy - fh, dx: -1, dy:  1 },
    { x: cx - fw, y: cy + fh, dx:  1, dy: -1 },
    { x: cx + fw, y: cy + fh, dx: -1, dy: -1 },
  ];
  for (const { x, y, dx, dy } of corners) {
    if (dSeg(px, py, x, y, x + dx * bs, y         ) < fT) return 'bracket';
    if (dSeg(px, py, x, y, x,           y + dy * bs) < fT) return 'bracket';
  }

  return 'bg';
}

// ── build grid ────────────────────────────────────────────────────────────────
function rndChar(layer) {
  const pool = CHARS[layer];
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildGrid(w, h) {
  fontSize = Math.max(11, Math.min(15, Math.round(w / 155)));
  ctx.font = `${fontSize}px "Space Mono", monospace`;
  cellW    = ctx.measureText('M').width;
  cellH    = fontSize * 1.4;

  const cols = Math.ceil(w / cellW) + 1;
  const rows = Math.ceil(h / cellH) + 1;

  cells = [];
  cellsByLayer = {};
  for (const k of ALL_LAYERS) cellsByLayer[k] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cellW;
      const y = (r + 0.5) * cellH;
      const layer = classify(x, y, w, h);
      const cell  = { x, y, layer, char: rndChar(layer), heat: 0 };
      cells.push(cell);
      cellsByLayer[layer].push(cell);
    }
  }
}

// ── background offscreen canvas ───────────────────────────────────────────────
function renderBg() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  bgCanvas        = document.createElement('canvas');
  bgCanvas.width  = logW * dpr;
  bgCanvas.height = logH * dpr;
  bgCtx = bgCanvas.getContext('2d');
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.font         = `${fontSize}px "Space Mono", monospace`;
  bgCtx.textAlign    = 'center';
  bgCtx.textBaseline = 'middle';

  const [r, g, b] = LC.bg.col;
  bgCtx.fillStyle = `rgba(${r},${g},${b},${LC.bg.op})`;
  for (const c of cellsByLayer.bg) bgCtx.fillText(c.char, c.x, c.y);
}

// ── canvas init ───────────────────────────────────────────────────────────────
function initCanvas() {
  canvas = document.getElementById('splat-canvas');
  if (!canvas) return;

  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w === 0 || h === 0) { requestAnimationFrame(initCanvas); return; }

  const dpr     = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  logW = w;
  logH = h;

  buildGrid(w, h);
  renderBg();
}

// ── draw ──────────────────────────────────────────────────────────────────────
function drawFrame() {
  frameN++;
  ctx.clearRect(0, 0, logW, logH);

  // blit static background layer
  ctx.drawImage(bgCanvas, 0, 0, logW, logH);

  ctx.font = `${fontSize}px "Space Mono", monospace`;

  for (const layer of SHAPE_LAYERS) {
    const lc    = LC[layer];
    const pulse = 0.88 + 0.12 * Math.sin(frameN * 0.018 + lc.ph);
    const baseOp = lc.op * pulse;
    const [r, g, b] = lc.col;

    // scramble chars
    for (const c of cellsByLayer[layer]) {
      if (Math.random() < lc.sr) c.char = rndChar(layer);
      if (c.heat > 0.4 && Math.random() < 0.06) c.char = rndChar(layer);
    }

    // batch draw non-heated cells
    ctx.fillStyle = `rgba(${r},${g},${b},${baseOp})`;
    for (const c of cellsByLayer[layer]) {
      if (c.heat < 0.02) ctx.fillText(c.char, c.x, c.y);
    }

    // draw heated cells individually with color blended toward orange
    for (const c of cellsByLayer[layer]) {
      if (c.heat < 0.02) continue;
      const t  = Math.min(1, c.heat * 1.4);
      const cr = Math.round(r + (PAL.ORANGE[0] - r) * t);
      const cg = Math.round(g + (PAL.ORANGE[1] - g) * t);
      const cb = Math.round(b + (PAL.ORANGE[2] - b) * t);
      const op = Math.min(1, baseOp + c.heat * 0.5);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${op})`;
      ctx.fillText(c.char, c.x, c.y);
    }
  }
}

// ── heat update ───────────────────────────────────────────────────────────────
function updateHeat() {
  const R2 = HEAT_R * HEAT_R;
  for (const c of cells) {
    if (c.layer === 'bg') continue;
    const dx = c.x - mouseX, dy = c.y - mouseY;
    const d2 = dx * dx + dy * dy;
    if (d2 < R2 && d2 > 0) {
      const prox = 1 - Math.sqrt(d2) / HEAT_R;
      c.heat = Math.min(1, c.heat + prox * HEAT_S);
    }
    c.heat *= HEAT_D;
    if (c.heat < 0.001) c.heat = 0;
  }
}

// ── animation loop ────────────────────────────────────────────────────────────
function loop() {
  updateHeat();
  drawFrame();
  animId = requestAnimationFrame(loop);
}

function startAnim() {
  if (animId) return;
  if (!ctx || logW === 0) initCanvas();
  animId = requestAnimationFrame(loop);
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

// ── mouse / touch ─────────────────────────────────────────────────────────────
document.addEventListener('mousemove', e => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});
document.addEventListener('mouseleave', () => { mouseX = -9999; mouseY = -9999; });

document.addEventListener('touchmove', e => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.touches[0].clientX - rect.left;
  mouseY = e.touches[0].clientY - rect.top;
}, { passive: true });
document.addEventListener('touchend', () => { mouseX = -9999; mouseY = -9999; });

// ── resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  clearTimeout(resizeTmr);
  resizeTmr = setTimeout(() => {
    if (document.getElementById('home').classList.contains('active')) {
      stopAnim();
      initCanvas();
      startAnim();
    }
  }, 150);
});

// ── hamburger ─────────────────────────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mainNav   = document.getElementById('main-nav');

hamburger.addEventListener('click', function () {
  const open = mainNav.classList.toggle('open');
  this.classList.toggle('open', open);
  this.setAttribute('aria-expanded', open);
});

// ── boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      openTab(btn.dataset.tab);
    });
  });

  document.fonts.ready.then(() => {
    initCanvas();
    startAnim();
  });
});
