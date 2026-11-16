/* jason8.dev — ASCII contour mesh, portrait dissolve, and artwork viewer.
   No dependencies, no network requests, no HTML string injection. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ── ASCII mesh: 8 x 13 px cells, bold 12px Courier ─────────────────────────
  var CW = 8, CH = 13;
  var ROT = ['|', '/', '-', '\\'];
  var BGC = ['.', ':', ';', '+', '-', '|', 'x', '/', '\\', '~'];
  var FADE = '.,:;+-=*%@#';
  var MESH_FONT = 'bold 12px "Courier New", Courier, monospace';
  var CYAN = [34, 175, 203];
  var ORANGE = [240, 133, 30];
  var HEAT_R = 150;

  function setupCanvas(cv, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = MESH_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return ctx;
  }

  function initMesh() {
    var section = document.getElementById('about');
    var cv = section && section.querySelector('.about-mesh');
    if (!cv || !cv.getContext) return;

    var ctx = null, mw = 0, mh = 0, cols = 0, rows = 0;
    var heat, ph0, spd, chr, colX, hot;
    var mx = -9999, my = -9999;
    var raf = 0, visible = false, drawnStill = false;

    function build(w, h) {
      ctx = setupCanvas(cv, w, h);
      mw = w; mh = h;
      cols = Math.floor(w / CW);
      rows = Math.floor(h / CH);
      var n = cols * rows;
      heat = new Float32Array(n);
      ph0 = new Float32Array(n);
      spd = new Float32Array(n);
      chr = new Uint8Array(n);
      for (var i = 0; i < n; i++) {
        ph0[i] = Math.random() * 4;
        spd[i] = 0.0006 + Math.random() * 0.0013;
        chr[i] = Math.floor(Math.random() * BGC.length);
      }
      colX = new Float32Array(cols);
      hot = new Int32Array(n);
      drawnStill = false;
    }

    function draw(ts) {
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (w !== mw || h !== mh || !ctx) build(w, h);
      var motion = !reduceMotion.matches;
      if (!motion && drawnStill) return;
      drawnStill = !motion;

      var t = motion ? ts * 0.00025 : 0;
      // pointer: the real mouse, or a slow wandering point when nobody is hovering
      var px = mx, py = my;
      if (px < -999 && motion) {
        px = w * (0.5 + 0.44 * Math.sin(t * 2.3));
        py = h * (0.5 + 0.38 * Math.sin(t * 3.7 + 1.3));
      }
      var R2 = HEAT_R * HEAT_R;
      var c, r, i, x, y;
      for (c = 0; c < cols; c++) colX[c] = Math.sin((c * CW + CW / 2) * 0.008 + t) * 1.2;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(' + CYAN[0] + ',' + CYAN[1] + ',' + CYAN[2] + ',0.2)';
      var nh = 0;
      for (r = 0; r < rows; r++) {
        y = r * CH + CH / 2;
        var rowY = Math.cos(y * 0.01 - t * 1.1);
        for (c = 0; c < cols; c++) {
          x = c * CW + CW / 2;
          i = r * cols + c;
          var z = colX[c] + rowY + Math.sin((x + y) * 0.006 + t * 0.7) * 0.8 + Math.cos((x - y) * 0.007 - t * 0.4) * 0.6;
          var p = z / 0.45;
          var on = Math.abs(p - Math.round(p)) < 0.14;
          var ht = heat[i];
          var dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
          if (d2 < R2) ht = Math.min(1, ht + (1 - Math.sqrt(d2) / HEAT_R) * 0.3);
          ht *= 0.9;
          if (ht < 0.004) ht = 0;
          heat[i] = ht;
          if (ht >= 0.03) hot[nh++] = on ? i : -i - 1;
          else if (on) ctx.fillText(ROT[((ph0[i] + ts * spd[i]) % 4) | 0], x, y);
        }
      }
      // heated cells: cyan to orange as they warm; off-contour cells light up too
      for (var k = 0; k < nh; k++) {
        var onC = hot[k] >= 0;
        i = onC ? hot[k] : -hot[k] - 1;
        var hv = heat[i], m = Math.min(1, hv * 1.35);
        x = (i % cols) * CW + CW / 2;
        y = Math.floor(i / cols) * CH + CH / 2;
        ctx.fillStyle = 'rgba(' +
          Math.round(CYAN[0] + (ORANGE[0] - CYAN[0]) * m) + ',' +
          Math.round(CYAN[1] + (ORANGE[1] - CYAN[1]) * m) + ',' +
          Math.round(CYAN[2] + (ORANGE[2] - CYAN[2]) * m) + ',' +
          ((onC ? 0.25 : 0.08) + hv * 0.72).toFixed(3) + ')';
        ctx.fillText(onC ? ROT[((ph0[i] + ts * spd[i]) % 4) | 0] : BGC[chr[i]], x, y);
      }
    }

    function tick(ts) {
      raf = 0;
      draw(ts);
      if (visible && !reduceMotion.matches) raf = requestAnimationFrame(tick);
    }
    function kick() {
      if (!raf && visible) raf = requestAnimationFrame(tick);
    }

    function point(cx, cy) {
      var rc = cv.getBoundingClientRect();
      mx = cx - rc.left;
      my = cy - rc.top;
    }
    function leave() { mx = -9999; my = -9999; }

    section.addEventListener('mousemove', function (e) { point(e.clientX, e.clientY); });
    section.addEventListener('mouseleave', leave);
    section.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0];
      if (t) point(t.clientX, t.clientY);
    }, { passive: true });
    section.addEventListener('touchend', leave);
    section.addEventListener('touchcancel', leave);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        kick();
      }).observe(section);
    } else {
      visible = true;
      kick();
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { drawnStill = false; kick(); }).observe(cv);
    } else {
      window.addEventListener('resize', function () { drawnStill = false; kick(); });
    }
    var onMotionChange = function () { drawnStill = false; kick(); };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);
  }

  // ── portrait edges shredded into background-coloured characters ────────────
  function initPortraitFade() {
    var box = document.querySelector('.portrait');
    if (!box) return;
    var img = box.querySelector('.portrait-img');
    var cv = box.querySelector('.portrait-fade');
    if (!img || !cv || !cv.getContext) return;
    var lastKey = '';

    function draw() {
      var w = cv.clientWidth, h = cv.clientHeight;
      var iw = img.offsetWidth, ih = img.offsetHeight;
      if (!w || !h || !iw || !ih) return;
      var key = w + 'x' + h + 'x' + iw + 'x' + ih;
      if (key === lastKey) return;
      lastKey = key;

      var ctx = setupCanvas(cv, w, h);
      ctx.clearRect(0, 0, w, h);
      var il = img.offsetLeft, it = img.offsetTop;
      var IN = Math.min(90, iw * 0.2), OUT = Math.max(24, il);
      var cols = Math.floor(w / CW), rows = Math.floor(h / CH);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = c * CW + CW / 2, y = r * CH + CH / 2;
          var m = Math.min(x - il, il + iw - x, y - it, it + ih - y);
          var den;
          if (m > 0) {
            if (m > IN) continue;
            den = Math.pow(1 - m / IN, 0.5);
          } else {
            if (-m > OUT) continue;
            den = Math.pow(1 + m / OUT, 0.85);
          }
          if (Math.random() > den) continue;
          ctx.fillStyle = 'rgba(8,12,16,' + Math.min(1, den * 1.1) + ')';
          var ed = Math.abs(m);
          var over = ed < 15 ? 3 : ed < 40 ? 2 : (m > 0 ? 2 : 1);
          for (var k = 0; k < over; k++) {
            var ox = over > 1 ? (Math.random() - 0.5) * 3.5 : 0;
            var oy = over > 1 ? (Math.random() - 0.5) * 3.5 : 0;
            ctx.fillText(FADE[Math.floor(Math.random() * FADE.length)], x + ox, y + oy);
          }
        }
      }
    }

    if (img.complete) draw();
    img.addEventListener('load', draw);
    if ('ResizeObserver' in window) new ResizeObserver(draw).observe(box);
    else window.addEventListener('resize', draw);
  }

  // ── pause the hero wall while it is off screen ─────────────────────────────
  function initHero() {
    var hero = document.getElementById('top');
    if (!hero || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      hero.classList.toggle('is-off', !entries[entries.length - 1].isIntersecting);
    }).observe(hero);
  }

  // ── artwork viewer ─────────────────────────────────────────────────────────
  function initViewer() {
    var dlg = document.getElementById('viewer');
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile'));
    if (!dlg || !tiles.length || typeof dlg.showModal !== 'function') return; // tiles stay plain links

    var imgEl = dlg.querySelector('.viewer-img');
    var posEl = dlg.querySelector('.viewer-pos');
    var nameEl = dlg.querySelector('.viewer-name');
    var yearEl = dlg.querySelector('.viewer-year');
    var mediumEl = dlg.querySelector('.viewer-medium');
    var stage = dlg.querySelector('.viewer-stage');
    var n = tiles.length;
    var idx = 0;

    function pad(v) { return v < 10 ? '0' + v : String(v); }

    function show(i) {
      idx = ((i % n) + n) % n;
      var t = tiles[idx];
      var title = t.getAttribute('data-title') || '';
      var year = t.getAttribute('data-year') || '';
      imgEl.removeAttribute('src');
      imgEl.alt = title + ', ' + year;
      imgEl.src = t.href;
      posEl.textContent = pad(idx + 1) + ' / ' + pad(n);
      nameEl.textContent = title;
      yearEl.textContent = year;
      mediumEl.textContent = t.getAttribute('data-medium') || '';
      dlg.setAttribute('aria-label', title);
      // warm the next piece so stepping through feels instant
      var next = tiles[(idx + 1) % n];
      if (next) { var pre = new Image(); pre.src = next.href; }
    }

    tiles.forEach(function (t, i) {
      t.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // let new-tab clicks through
        e.preventDefault();
        show(i);
        if (!dlg.open) dlg.showModal();
        document.documentElement.classList.add('is-locked');
      });
    });

    dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('[data-prev]').addEventListener('click', function () { show(idx - 1); });
    dlg.querySelector('[data-next]').addEventListener('click', function () { show(idx + 1); });
    stage.addEventListener('click', function (e) { if (e.target === stage) dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    });
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('is-locked');
      imgEl.removeAttribute('src');
    });
  }

  function init() {
    initHero();
    initMesh();
    initPortraitFade();
    initViewer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
