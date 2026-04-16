// ── state ──────────────────────────────────────────────────────────────────
let canvas, ctx;
let splats    = [];
let animId    = null;
let resizeTmr = null;
let logW = 0, logH = 0;
let mouseX = -9999, mouseY = -9999;

// physics
const SPRING  = 0.045;
const DAMPING = 0.84;
const REP_R   = 130;
const REP_S   = 9;

// color channel values for rgba() strings
const COLORS = {
  turq:   '0, 255, 209',
  orange: '255, 98, 0',
  white:  '215, 230, 255',
};

// ── tab switching ───────────────────────────────────────────────────────────
function openTab(tabName) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-tab]').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  const section = document.getElementById(tabName);
  if (section) section.classList.add('active');

  document.querySelectorAll(`.nav-btn[data-tab="${tabName}"]`).forEach(b => {
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
  });

  if (tabName === 'home') {
    startAnim();
  } else {
    stopAnim();
  }
}

function stopAnim() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

// ── splat factory ───────────────────────────────────────────────────────────
function makeSplat(hx, hy, color, scatter) {
  return {
    hx, hy,
    x:  scatter ? Math.random() * logW : hx,
    y:  scatter ? Math.random() * logH : hy,
    vx: 0, vy: 0,
    r:  3.5 + Math.random() * 4.5,
    op: 0.5 + Math.random() * 0.45,
    color,
  };
}

// ── goggles geometry ────────────────────────────────────────────────────────
function buildGoggles(w, h) {
  const pts    = [];
  const scale  = Math.min(w * 0.85, h * 0.7) / 530;
  const cx     = w / 2;
  const cy     = h / 2 - 20 * scale;
  const scatter = true;

  function circle(ox, oy, r, n, col) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.04;
      const j = (Math.random() - 0.5) * 2.5;
      pts.push(makeSplat(
        cx + (ox + Math.cos(a) * (r + j)) * scale,
        cy + (oy + Math.sin(a) * (r + j)) * scale,
        col, scatter
      ));
    }
  }

  function line(x1, y1, x2, y2, n, col) {
    for (let i = 0; i < n; i++) {
      const t  = i / Math.max(n - 1, 1);
      const jx = (Math.random() - 0.5) * 1.5;
      const jy = (Math.random() - 0.5) * 1.5;
      pts.push(makeSplat(
        cx + (x1 + (x2 - x1) * t) * scale + jx,
        cy + (y1 + (y2 - y1) * t) * scale + jy,
        col, scatter
      ));
    }
  }

  // ── lens outlines (main rings)
  circle(-135,  0, 95, 160, 'turq');
  circle( 135,  0, 95, 160, 'turq');

  // ── inner targeting rings
  circle(-135, 0, 58, 90, 'orange');
  circle( 135, 0, 58, 90, 'orange');

  // ── small center targeting rings
  circle(-135, 0, 28, 48, 'white');
  circle( 135, 0, 28, 48, 'white');

  // ── crosshairs — left lens (gap in center 8px each side)
  line(-225, 0, -143, 0, 35, 'white'); // left arm
  line( -127, 0, -45, 0, 35, 'white'); // right arm
  line(-135, -88, -135, -8, 35, 'white'); // top arm
  line(-135,   8, -135, 88, 35, 'white'); // bottom arm

  // ── crosshairs — right lens
  line( 45,  0, 127,  0, 35, 'white');
  line(143,  0, 225,  0, 35, 'white');
  line(135, -88, 135,  -8, 35, 'white');
  line(135,   8, 135,  88, 35, 'white');

  // ── nose bridge (parabolic arc dipping down slightly)
  const bN = 28;
  for (let i = 0; i < bN; i++) {
    const t  = i / (bN - 1);
    const bx = -40 + 80 * t;
    const by = 14 * (1 - Math.pow(2 * t - 1, 2));
    pts.push(makeSplat(cx + bx * scale, cy + by * scale, 'white', scatter));
  }

  // ── tick marks on outer lens edge (16 ticks per lens)
  const ticks = 16;
  for (let i = 0; i < ticks; i++) {
    const a     = (i / ticks) * Math.PI * 2;
    const major = i % 4 === 0;
    const r1    = 95, r2 = 95 + (major ? 14 : 9);
    const col   = major ? 'orange' : 'turq';
    const n     = major ? 4 : 2;
    line(
      -135 + Math.cos(a) * r1, Math.sin(a) * r1,
      -135 + Math.cos(a) * r2, Math.sin(a) * r2,
      n, col
    );
    line(
       135 + Math.cos(a) * r1, Math.sin(a) * r1,
       135 + Math.cos(a) * r2, Math.sin(a) * r2,
      n, col
    );
  }

  // ── outer rectangular visor frame
  const fw = 245, fh = 118;
  const density = 0.38; // splats per px

  const hLen = fw * 2;
  const vLen = fh * 2;
  const hN   = Math.round(hLen * density);
  const vN   = Math.round(vLen * density);

  line(-fw, -fh,  fw, -fh, hN, 'turq'); // top
  line(-fw,  fh,  fw,  fh, hN, 'turq'); // bottom
  line(-fw, -fh, -fw,  fh, vN, 'turq'); // left
  line( fw, -fh,  fw,  fh, vN, 'turq'); // right

  // ── corner HUD brackets (inward-pointing L shapes)
  const bs = 28; // bracket arm length
  const corners = [
    { x: -fw, y: -fh, dx:  1, dy:  1 },
    { x:  fw, y: -fh, dx: -1, dy:  1 },
    { x: -fw, y:  fh, dx:  1, dy: -1 },
    { x:  fw, y:  fh, dx: -1, dy: -1 },
  ];
  corners.forEach(({ x, y, dx, dy }) => {
    line(x, y, x + dx * bs, y,        6, 'orange');
    line(x, y, x,           y + dy * bs, 6, 'orange');
  });

  return pts;
}

// ── canvas init / resize ────────────────────────────────────────────────────
function initCanvas(scatter) {
  canvas = document.getElementById('splat-canvas');
  if (!canvas) return;

  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w === 0 || h === 0) { requestAnimationFrame(() => initCanvas(scatter)); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  logW = w;
  logH = h;

  splats = buildGoggles(w, h);
}

// ── physics update ──────────────────────────────────────────────────────────
function updatePhysics() {
  for (let i = 0; i < splats.length; i++) {
    const s = splats[i];

    s.vx += (s.hx - s.x) * SPRING;
    s.vy += (s.hy - s.y) * SPRING;

    const mdx = s.x - mouseX;
    const mdy = s.y - mouseY;
    const d2  = mdx * mdx + mdy * mdy;
    if (d2 < REP_R * REP_R && d2 > 0.01) {
      const d   = Math.sqrt(d2);
      const fac = (1 - d / REP_R);
      const f   = fac * fac * REP_S;
      s.vx += (mdx / d) * f;
      s.vy += (mdy / d) * f;
    }

    s.vx *= DAMPING;
    s.vy *= DAMPING;
    s.x  += s.vx;
    s.y  += s.vy;
  }
}

// ── draw ────────────────────────────────────────────────────────────────────
function drawFrame() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, logW, logH);
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < splats.length; i++) {
    const s   = splats[i];
    const rgb = COLORS[s.color];
    const g   = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0,   `rgba(${rgb}, ${s.op})`);
    g.addColorStop(0.4, `rgba(${rgb}, ${s.op * 0.45})`);
    g.addColorStop(1,   `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}

// ── animation loop ──────────────────────────────────────────────────────────
function loop() {
  updatePhysics();
  drawFrame();
  animId = requestAnimationFrame(loop);
}

function startAnim() {
  if (animId) return;
  if (!ctx || logW === 0) { initCanvas(true); }
  animId = requestAnimationFrame(loop);
}

// ── mouse / touch tracking ──────────────────────────────────────────────────
document.addEventListener('mousemove', e => {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
});

document.addEventListener('mouseleave', () => { mouseX = -9999; mouseY = -9999; });

document.addEventListener('touchmove', e => {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  mouseX = e.touches[0].clientX - r.left;
  mouseY = e.touches[0].clientY - r.top;
}, { passive: true });

document.addEventListener('touchend', () => { mouseX = -9999; mouseY = -9999; });

// ── resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  clearTimeout(resizeTmr);
  resizeTmr = setTimeout(() => {
    if (document.getElementById('home').classList.contains('active')) {
      stopAnim();
      initCanvas(false); // preserve positions, no scatter on resize
      startAnim();
    }
  }, 150);
});

// ── hamburger ───────────────────────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mainNav   = document.getElementById('main-nav');

hamburger.addEventListener('click', function () {
  const open = mainNav.classList.toggle('open');
  this.classList.toggle('open', open);
  this.setAttribute('aria-expanded', open);
});

// ── boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      openTab(btn.dataset.tab);
    });
  });

  initCanvas(true);
  startAnim();
});
