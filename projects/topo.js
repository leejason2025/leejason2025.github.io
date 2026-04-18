// ── topographic ASCII bg for project pages ──────────────────────────────────
// Self-contained: looks for #topo-canvas in the DOM, fills the viewport with
// slowly-rotating contour cells, and warms the ones near the cursor toward
// amber (same palette and physics as the main-site tabs).

(function () {
  const CELL_W  = 8;
  const CELL_H  = 13;
  const FONT_PX = 12;
  const ROT     = ['|', '/', '-', '\\'];
  const HEAT_R  = 140;
  const HEAT_S  = 0.35;
  const HEAT_D  = 0.88;

  let canvas, ctx;
  let cells = [];
  let logW = 0, logH = 0;
  let animId = null;
  let mouseX = -9999, mouseY = -9999;
  let resizeTmr = null;

  function topo(x, y) {
    return (
      Math.sin( x          * 0.0080) * 1.2 +
      Math.cos( y          * 0.0100) * 1.0 +
      Math.sin((x + y)     * 0.0060) * 0.8 +
      Math.cos((x - y)     * 0.0070) * 0.6
    );
  }

  function build() {
    const w   = window.innerWidth;
    const h   = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font         = `bold ${FONT_PX}px "Courier New", Courier, monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    logW = w;
    logH = h;

    const cols = Math.floor(w / CELL_W);
    const rows = Math.floor(h / CELL_H);
    const STEP = 0.45;
    const THR  = 0.14;

    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = r * CELL_H + CELL_H / 2;
        const z = topo(x, y);
        const phase = z / STEP;
        const dist  = Math.abs(phase - Math.round(phase));
        if (dist > THR) continue;
        cells.push({
          x, y,
          phase: Math.random() * 4,
          speed: 0.010 + Math.random() * 0.022,
          heat:  0,
        });
      }
    }
  }

  function draw() {
    if (!ctx) { animId = null; return; }

    const R2 = HEAT_R * HEAT_R;
    for (const c of cells) {
      c.phase = (c.phase + c.speed) % 4;
      const dx = c.x - mouseX, dy = c.y - mouseY;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0) {
        const prox = 1 - Math.sqrt(d2) / HEAT_R;
        c.heat = Math.min(1, c.heat + prox * HEAT_S);
      }
      c.heat *= HEAT_D;
      if (c.heat < 0.001) c.heat = 0;
    }

    ctx.clearRect(0, 0, logW, logH);

    ctx.fillStyle = 'rgba(142, 202, 230, 0.14)';
    for (const c of cells) {
      if (c.heat >= 0.02) continue;
      ctx.fillText(ROT[Math.floor(c.phase)], c.x, c.y);
    }

    for (const c of cells) {
      if (c.heat < 0.02) continue;
      const t = Math.min(1, c.heat * 1.4);
      const r = Math.round(142 + (255 - 142) * t);
      const g = Math.round(202 + (183 - 202) * t);
      const b = Math.round(230 + (  3 - 230) * t);
      const alpha = 0.14 + c.heat * 0.7;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fillText(ROT[Math.floor(c.phase)], c.x, c.y);
    }

    animId = requestAnimationFrame(draw);
  }

  function start() {
    canvas = document.getElementById('topo-canvas');
    if (!canvas) return;
    build();
    animId = requestAnimationFrame(draw);
  }

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouseX = -9999; mouseY = -9999;
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTmr);
    resizeTmr = setTimeout(() => {
      if (animId) cancelAnimationFrame(animId);
      build();
      animId = requestAnimationFrame(draw);
    }, 150);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
