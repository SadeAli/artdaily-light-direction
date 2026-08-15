/* ============================================================
   game.js — Light Direction. A hidden sun lambert-shades a matte
   form (sphere → blended blobs); the player reads the shading and
   places the sun on an azimuth ring + elevation arc, then locks
   it in. Score = 3D angular error between guessed and true light
   vectors. Six forms per round; contrast falls and elevations go
   extreme as the round ramps. Skeleton: init → item → lock →
   reveal → … → ArtDaily.report once per round.
   ============================================================ */
(function () {
  'use strict';

  var SLUG = 'light-direction';
  var ITEMS_PER_ROUND = 6;
  var GRACE_DEG = 3;    /* errors under this still score 100 */
  var ZERO_SPAN = 42;   /* score hits 0 at grace + this = 45° off */
  var REVEAL_MS = 2600; /* reveal auto-advances (tap skips) */

  /* ============================================================
     pure scoring math — inputs in, 0–100 out, no canvas/DOM.
     ============================================================ */

  /* azimuth: screen-plane angle around the form, 0° = light from the
     right, 90° = from the top, counterclockwise. elevation: 0° = raking
     edge light in the picture plane, 90° = frontal, straight out of the
     page. Returns a unit vector (x right, y up, z toward the viewer). */
  function lightVec(azDeg, elDeg) {
    var az = azDeg * Math.PI / 180;
    var el = elDeg * Math.PI / 180;
    return {
      x: Math.cos(el) * Math.cos(az),
      y: Math.cos(el) * Math.sin(az),
      z: Math.sin(el),
    };
  }

  function angleBetweenDeg(a, b) {
    var d = a.x * b.x + a.y * b.y + a.z * b.z;
    if (d > 1) d = 1;
    if (d < -1) d = -1;
    return Math.acos(d) * 180 / Math.PI;
  }

  /* 100 inside the 3° grace cone, then linear down to 0 at 45° off. */
  function itemScore(errDeg) {
    if (!isFinite(errDeg)) return 0;
    var t = 1 - Math.max(0, errDeg - GRACE_DEG) / ZERO_SPAN;
    return 100 * Math.max(0, Math.min(1, t));
  }

  function roundScore(itemScores) {
    if (!itemScores.length) return 0;
    var sum = 0;
    for (var i = 0; i < itemScores.length; i++) sum += itemScores[i];
    return sum / itemScores.length;
  }

  /* wrap-lambert shading: dot in [-1,1] → display value in [0,1].
     wrap softens the terminator; ambient/top set the value range
     (the contrast ramp squeezes them together). */
  function shadeIntensity(dot, wrap, ambient, top) {
    var lit = (dot + wrap) / (1 + wrap);
    if (lit < 0) lit = 0;
    if (lit > 1) lit = 1;
    return ambient + (top - ambient) * lit;
  }

  /* ============================================================
     drill state + chrome
     ============================================================ */

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var hint = document.getElementById('hint');
  var toast = document.getElementById('toast');
  var hudRound = document.getElementById('hudRound');
  var hudScore = document.getElementById('hudScore');
  var hudBest = document.getElementById('hudBest');
  var btnRound = document.getElementById('btnRound');

  ArtDaily.init({ slug: SLUG });

  var MONO = 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace';
  var HAND = 'Caveat, "Segoe Print", "Comic Sans MS", cursive';

  /* ---- theme-aware inks (re-read on every repaint) ---- */
  function inks() {
    var cs = getComputedStyle(document.documentElement);
    function v(name) { return cs.getPropertyValue(name).trim(); }
    return {
      ink: v('--ink'),
      muted: v('--muted'),
      line: v('--line'),
      card: v('--card'),
      accent: v('--game-accent') || v('--mint'),
    };
  }

  function parseColor(str) {
    var m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) {
      return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    }
    m = /^#([0-9a-f]{3})$/i.exec(str);
    if (m) {
      return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    }
    m = /^rgba?\(([^)]+)\)/i.exec(str);
    if (m) {
      var p = m[1].split(/[,\s/]+/);
      return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0];
    }
    return [128, 128, 128];
  }

  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

  /* the form always shades between --card and --ink, brighter of the
     two as the lit end — a matte grey form on paper in both themes. */
  function shadeStops(c) {
    var a = parseColor(c.ink), b = parseColor(c.card);
    return (lum(a) >= lum(b)) ? { hi: a, lo: b } : { hi: b, lo: a };
  }

  /* muted is fine for hairlines but a touch light for small canvas
     text on paper (3.9:1) — ink it toward graphite for labels. */
  function labelInk(c) {
    if (ArtDaily.theme() === 'dark') return c.muted;
    var m = parseColor(c.muted), k = parseColor(c.ink);
    return 'rgb(' +
      Math.round(m[0] * 0.75 + k[0] * 0.25) + ',' +
      Math.round(m[1] * 0.75 + k[1] * 0.25) + ',' +
      Math.round(m[2] * 0.75 + k[2] * 0.25) + ')';
  }

  /* accent inked toward graphite on paper (mirrors the HUD css rule). */
  function accentInk(c) {
    if (ArtDaily.theme() === 'dark') return c.accent;
    var a = parseColor(c.accent), k = parseColor(c.ink);
    return 'rgb(' +
      Math.round(a[0] * 0.55 + k[0] * 0.45) + ',' +
      Math.round(a[1] * 0.55 + k[1] * 0.45) + ',' +
      Math.round(a[2] * 0.55 + k[2] * 0.45) + ')';
  }

  /* ---- crisp canvas at any devicePixelRatio; height tracks width ---- */
  var W = 0, H = 0;
  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    /* taller sheet on phones so ring + arc both breathe */
    H = Math.round(W * (W < 520 ? 0.92 : 0.62));
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    formCache.key = null;
    patchCache.key = null;
  }

  /* ---- layout: form + azimuth ring on the left, elevation arc
     bottom-right. Every touch band is ≥ 44px wide. ---- */
  var lay = null;
  function layout() {
    var formR = Math.round(Math.min(W, H) * 0.16);
    formR = Math.max(40, Math.min(78, formR));
    var ringR = Math.min(formR + 46, Math.floor((H - 24) / 2));
    if (ringR < formR + 30) formR = Math.max(30, ringR - 30);
    var cx = Math.max(ringR + 16, Math.round(W * 0.36));
    var cy = Math.min(Math.max(Math.round(H * 0.47), ringR + 14), H - ringR - 8);
    var arcC = { x: W - 28, y: H - 26 };
    var ar = Math.max(54, Math.min(120, arcC.x - (cx + ringR) - 26));
    lay = { formR: formR, ringR: ringR, cx: cx, cy: cy, arcC: arcC, ar: ar };
  }

  /* ---- round state ---- */
  var round = 0, idx = 0, items = [], scores = [], lastErr = 0;
  var phase = 'idle'; /* 'aim' | 'reveal' | 'done' */
  var guess = { az: 90, el: 40 };
  var revealTimer = null;

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  /* forms are sphere sets in formR units (y up, z toward the viewer),
     normalized to fit the unit disc; ≥2 spheres get blended normals. */
  function normalizeSpheres(s) {
    var m = 0, i, e;
    for (i = 0; i < s.length; i++) {
      e = Math.sqrt(s[i].x * s[i].x + s[i].y * s[i].y) + s[i].r;
      if (e > m) m = e;
    }
    for (i = 0; i < s.length; i++) {
      s[i].x /= m; s[i].y /= m; s[i].z /= m; s[i].r /= m;
    }
    return s;
  }

  function makeSpheres(i) {
    if (i < 2) return [{ x: 0, y: 0, z: 0, r: 1 }];
    if (i === 2) {
      /* capsule: two equal spheres along a random axis */
      var a = rand(0, Math.PI), d = 0.42;
      return normalizeSpheres([
        { x: Math.cos(a) * d, y: Math.sin(a) * d, z: rand(-0.1, 0.1), r: 0.72 },
        { x: -Math.cos(a) * d, y: -Math.sin(a) * d, z: rand(-0.1, 0.1), r: 0.72 },
      ]);
    }
    var s = [{ x: rand(-0.12, 0.12), y: rand(-0.12, 0.12), z: 0, r: 0.78 }];
    var lumps = (i === 3) ? 1 : 2;
    for (var j = 0; j < lumps; j++) {
      var ang = rand(0, Math.PI * 2), dist = rand(0.35, 0.55);
      s.push({
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        z: rand(-0.22, 0.22),
        r: rand(0.42, 0.6),
      });
    }
    return normalizeSpheres(s);
  }

  /* difficulty ramp: contrast falls (ambient up, top down, wrap up),
     forms get lumpier, and the last two items pull elevation to the
     extremes where reads are hardest. */
  function makeItem(i) {
    var t = i / (ITEMS_PER_ROUND - 1);
    var el = (i >= 4)
      ? ((Math.random() < 0.5) ? rand(15, 24) : rand(56, 65))
      : rand(20, 55);
    return {
      az: rand(0, 360),
      el: el,
      ambient: 0.08 + 0.22 * t,
      top: 0.97 - 0.09 * t,
      wrap: 0.06 + 0.30 * t,
      spheres: makeSpheres(i),
    };
  }

  /* ============================================================
     per-pixel form renderer (cached per item + theme + size)
     ============================================================ */

  /* soft-max normal blending over the sphere set: the front-most
     surface wins, overlaps melt smoothly — a lumpy matte blob. */
  function renderForm(spheres, Lv, opt, R, stops) {
    var dpr = window.devicePixelRatio || 1;
    var pad = 1.18;
    var box = Math.ceil(2 * R * pad);
    var dev = Math.max(2, Math.round(box * dpr));
    var off = document.createElement('canvas');
    off.width = dev; off.height = dev;
    var octx = off.getContext('2d');
    var img = octx.createImageData(dev, dev);
    var data = img.data;
    var K = 0.32;                 /* blend softness, formR units */
    var aa = 1.5 / (R * dpr);     /* ~1.5 device px of edge AA */
    var n = spheres.length;
    var lo = stops.lo, hi = stops.hi;
    for (var py = 0; py < dev; py++) {
      var v = -(((py + 0.5) / dpr) - box / 2) / R; /* y up */
      for (var px = 0; px < dev; px++) {
        var u = (((px + 0.5) / dpr) - box / 2) / R;
        var maxEdge = -1e9, wsum = 0, nx = 0, ny = 0, nz = 0;
        var rimx = 0, rimy = 0;
        for (var i = 0; i < n; i++) {
          var s = spheres[i];
          var dx = u - s.x, dy = v - s.y;
          var dd = Math.sqrt(dx * dx + dy * dy);
          var edge = s.r - dd;
          if (edge > maxEdge) {
            maxEdge = edge;
            rimx = dx / (dd || 1);
            rimy = dy / (dd || 1);
          }
          if (edge <= 0) continue;
          var zi = s.z + Math.sqrt(s.r * s.r - dd * dd);
          var w = Math.exp(zi / K);
          wsum += w;
          nx += w * dx / s.r;
          ny += w * dy / s.r;
          nz += w * (zi - s.z) / s.r;
        }
        var alpha = (maxEdge + aa * 0.5) / aa;
        if (alpha <= 0) continue;
        if (alpha > 1) alpha = 1;
        if (wsum === 0) { nx = rimx; ny = rimy; nz = 0; }
        var inv = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        var dot = (nx * Lv.x + ny * Lv.y + nz * Lv.z) * inv;
        var lit = shadeIntensity(dot, opt.wrap, opt.ambient, opt.top);
        var o = (py * dev + px) * 4;
        data[o] = Math.round(lo[0] + (hi[0] - lo[0]) * lit);
        data[o + 1] = Math.round(lo[1] + (hi[1] - lo[1]) * lit);
        data[o + 2] = Math.round(lo[2] + (hi[2] - lo[2]) * lit);
        data[o + 3] = Math.round(alpha * 255);
      }
    }
    octx.putImageData(img, 0, 0);
    return { canvas: off, box: box };
  }

  var formCache = { key: null, form: null };
  var patchCache = { key: null, you: null, truth: null };

  function cacheKey() {
    return [round, idx, W, ArtDaily.theme(), window.devicePixelRatio || 1].join(':');
  }

  function ensureForm(it, c) {
    var key = cacheKey();
    if (formCache.key === key) return formCache.form;
    formCache.key = key;
    formCache.form = renderForm(it.spheres, lightVec(it.az, it.el), it, lay.formR, shadeStops(c));
    return formCache.form;
  }

  /* the guess is frozen during reveal, so caching on item is safe. */
  function ensurePatches(it, c) {
    var key = cacheKey();
    if (patchCache.key === key) return patchCache;
    var unit = [{ x: 0, y: 0, z: 0, r: 1 }];
    patchCache.key = key;
    patchCache.you = renderForm(unit, lightVec(guess.az, guess.el), it, 24, shadeStops(c));
    patchCache.truth = renderForm(unit, lightVec(it.az, it.el), it, 24, shadeStops(c));
    return patchCache;
  }

  /* ============================================================
     painting (canvas bg stays clear so the CSS grid shows)
     ============================================================ */

  function ringPos(azDeg, r) {
    var a = azDeg * Math.PI / 180;
    return { x: lay.cx + r * Math.cos(a), y: lay.cy - r * Math.sin(a) };
  }

  function arcPos(elDeg, r) {
    var phi = (180 - elDeg) * Math.PI / 180;
    return { x: lay.arcC.x + r * Math.cos(phi), y: lay.arcC.y - r * Math.sin(phi) };
  }

  function sunMarker(x, y, r, strokeCol, fillCol) {
    var i, a;
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeCol;
    for (i = 0; i < 8; i++) {
      a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
      ctx.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.stroke();
  }

  function drawGround(c, it) {
    var g = lay.cy + lay.formR * 1.32;
    ctx.save();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(lay.cx - lay.formR * 1.7, g);
    ctx.lineTo(lay.cx + lay.formR * 1.7, g);
    ctx.stroke();
    ctx.setLineDash([]);
    /* cast-shadow hint: falls away from the light, stretches when the
       sun is low, fades out when the light comes from below. */
    var a = it.az * Math.PI / 180;
    var sx = Math.cos(a), sy = Math.sin(a);
    var len = 1 - it.el / 90;
    var vis = 0.35 + sy;
    if (vis < 0) vis = 0;
    if (vis > 1) vis = 1;
    if (vis > 0) {
      var ex = lay.cx - sx * lay.formR * (0.35 + 1.1 * len);
      var rx = lay.formR * (0.55 + 0.75 * len);
      var ry = lay.formR * 0.16;
      ctx.fillStyle = c.ink;
      ctx.globalAlpha = 0.10 * vis;
      ctx.beginPath();
      ctx.ellipse(ex, g, rx * 1.25, ry * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.16 * vis;
      ctx.beginPath();
      ctx.ellipse(ex, g, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRing(c) {
    ctx.save();
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([1, 7]);
    ctx.beginPath();
    ctx.arc(lay.cx, lay.cy, lay.ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (var i = 0; i < 4; i++) {
      var p1 = ringPos(i * 90, lay.ringR - 5);
      var p2 = ringPos(i * 90, lay.ringR + 5);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArc(c) {
    var el, p;
    ctx.save();
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([1, 7]);
    ctx.beginPath();
    for (el = 0; el <= 90; el += 6) {
      p = arcPos(el, lay.ar);
      if (el === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (el = 0; el <= 90; el += 30) {
      var p1 = arcPos(el, lay.ar - 5);
      var p2 = arcPos(el, lay.ar + 5);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.fillStyle = labelInk(c);
    ctx.font = '600 10px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText('frontal', lay.arcC.x - 2, lay.arcC.y - lay.ar - 8);
    ctx.textAlign = 'center';
    ctx.fillText('raking', lay.arcC.x - lay.ar, lay.arcC.y + 14);
    ctx.restore();
  }

  /* short-way arc from guess to truth — the visible size of the miss. */
  function deltaArc(cx, cy, r, fromDeg, toDeg, col) {
    var d = ((toDeg - fromDeg + 540) % 360) - 180;
    if (Math.abs(d) < 0.5) return;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -fromDeg * Math.PI / 180, -(fromDeg + d) * Math.PI / 180, d > 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawMarkers(c, it, reveal) {
    var g = ringPos(guess.az, lay.ringR);
    var ge = arcPos(guess.el, lay.ar);
    if (reveal) {
      var tr = ringPos(it.az, lay.ringR);
      var te = arcPos(it.el, lay.ar);
      var da = accentInk(c); /* raw mint sits under 3:1 on paper */
      deltaArc(lay.cx, lay.cy, lay.ringR, guess.az, it.az, da);
      deltaArc(lay.arcC.x, lay.arcC.y, lay.ar, 180 - guess.el, 180 - it.el, da);
      sunMarker(g.x, g.y, 10, c.muted, 'transparent');
      sunMarker(ge.x, ge.y, 8, c.muted, 'transparent');
      sunMarker(tr.x, tr.y, 13, c.ink, c.accent);
      sunMarker(te.x, te.y, 10, c.ink, c.accent);
    } else {
      sunMarker(g.x, g.y, 13, c.ink, c.card);
      sunMarker(ge.x, ge.y, 10, c.ink, c.card);
      /* live degree readouts in the margins */
      ctx.fillStyle = labelInk(c);
      ctx.font = '600 11px ' + MONO;
      ctx.textAlign = 'center';
      var tp = ringPos(guess.az, lay.ringR + 24);
      ctx.fillText(Math.round(guess.az) + '°', Math.max(16, Math.min(W - 16, tp.x)), Math.max(12, Math.min(H - 4, tp.y + 4)));
      var ep = arcPos(guess.el, lay.ar + 22);
      ctx.fillText(Math.round(guess.el) + '°', Math.max(16, Math.min(W - 16, ep.x)), Math.max(12, Math.min(H - 4, ep.y + 4)));
    }
  }

  function drawReveal(c, it) {
    var patches = ensurePatches(it, c);
    var pr = 24, py = H - 52;
    var xs = [34, 112];
    var labels = ['you', 'true'];
    var imgs = [patches.you, patches.truth];
    ctx.save();
    for (var i = 0; i < 2; i++) {
      var b = imgs[i].box;
      ctx.drawImage(imgs[i].canvas, xs[i] - b / 2, py - b / 2, b, b);
      ctx.fillStyle = labelInk(c);
      ctx.font = '600 10px ' + MONO;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], xs[i], py + pr + 16);
    }
    ctx.fillStyle = accentInk(c);
    ctx.font = '700 24px ' + HAND;
    ctx.textAlign = 'center';
    ctx.fillText('off by ' + Math.round(lastErr) + '°', W / 2, 28);
    ctx.restore();
  }

  function draw() {
    var c = inks();
    ctx.clearRect(0, 0, W, H);
    if (phase === 'idle' || !items.length) return;
    var it = items[idx];
    var reveal = (phase === 'reveal' || phase === 'done');
    drawGround(c, it);
    var f = ensureForm(it, c);
    ctx.drawImage(f.canvas, lay.cx - f.box / 2, lay.cy - f.box / 2, f.box, f.box);
    drawRing(c);
    drawArc(c);
    if (reveal) drawReveal(c, it);
    drawMarkers(c, it, reveal);
  }

  /* ============================================================
     round flow
     ============================================================ */

  function setBtn(label, sym) {
    btnRound.textContent = '';
    btnRound.appendChild(document.createTextNode(label + ' '));
    var s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = sym;
    btnRound.appendChild(s);
  }

  function newRound() {
    clearTimeout(revealTimer);
    round += 1;
    idx = 0;
    scores = [];
    items = [];
    for (var i = 0; i < ITEMS_PER_ROUND; i++) items.push(makeItem(i));
    hudRound.textContent = String(round);
    hudScore.textContent = '–';
    startItem();
  }

  function startItem() {
    phase = 'aim';
    guess = { az: 90, el: 40 };
    formCache.key = null;
    patchCache.key = null;
    setBtn('lock it in', '☀');
    hint.textContent = 'form ' + (idx + 1) + ' of ' + ITEMS_PER_ROUND +
      ' — where is the light? drag the ring and the arc, then lock it in.';
    draw();
  }

  function quip(err) {
    if (err <= GRACE_DEG) return 'dead on.';
    if (err <= 10) return 'sharp eye.';
    if (err <= 20) return 'close — check the highlight.';
    if (err <= 32) return 'warm — trace highlight to terminator.';
    return 'flipped? the terminator tells you.';
  }

  function lockIn() {
    if (phase !== 'aim') return;
    var it = items[idx];
    lastErr = angleBetweenDeg(lightVec(guess.az, guess.el), lightVec(it.az, it.el));
    scores.push(itemScore(lastErr));
    phase = 'reveal';
    setBtn(idx === ITEMS_PER_ROUND - 1 ? 'finish' : 'next', '→');
    hint.textContent = 'off by ' + Math.round(lastErr) + '° — ' + quip(lastErr);
    clearTimeout(revealTimer);
    revealTimer = setTimeout(advance, REVEAL_MS);
    draw();
  }

  function advance() {
    clearTimeout(revealTimer);
    if (phase !== 'reveal') return;
    if (idx >= ITEMS_PER_ROUND - 1) { finishRound(); return; }
    idx += 1;
    startItem();
  }

  function finishRound() {
    phase = 'done';
    var res = ArtDaily.report(roundScore(scores));
    hudScore.textContent = String(res.score);
    hudBest.textContent = res.best === null ? '–' : String(res.best);
    setBtn('new round', '↻');
    hint.textContent = 'round done — press “new round” to go again.';
    showToast((res.isNewBest ? 'new best! ' : 'score ') + res.score + ' / 100', res.isNewBest);
    draw();
  }

  var toastTimer = null;
  function showToast(msg, celebrate) {
    toast.innerHTML = '';
    var s = document.createElement('span');
    s.className = celebrate ? 'toast-accent' : '';
    s.textContent = msg;
    toast.appendChild(s);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  /* ============================================================
     input — drag the ring (azimuth) or the arc (elevation);
     both bands are ≥ 68px wide. Tap anywhere during reveal to skip.
     ============================================================ */

  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function applyAz(p) {
    var a = Math.atan2(lay.cy - p.y, p.x - lay.cx) * 180 / Math.PI;
    guess.az = ((a % 360) + 360) % 360;
    draw();
  }

  function applyEl(p) {
    /* clamp the pointer into the arc's quadrant so atan2 stays in
       [90°,180°] and the marker never jumps. */
    var px = Math.min(p.x, lay.arcC.x - 0.001);
    var py = Math.min(p.y, lay.arcC.y - 0.001);
    var phi = Math.atan2(lay.arcC.y - py, px - lay.arcC.x) * 180 / Math.PI;
    if (phi < 90) phi = 90;
    if (phi > 180) phi = 180;
    guess.el = 180 - phi;
    draw();
  }

  var drag = null;
  canvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    if (phase === 'reveal') { advance(); return; }
    if (phase !== 'aim') return;
    var p = pointerPos(ev);
    var dRing = Math.abs(Math.hypot(p.x - lay.cx, p.y - lay.cy) - lay.ringR);
    var dArc = Math.hypot(p.x - lay.arcC.x, p.y - lay.arcC.y);
    if (dRing <= 34) {
      drag = 'az';
      applyAz(p);
    } else if (dArc >= lay.ar - 44 && dArc <= lay.ar + 44 && p.x <= lay.arcC.x + 24 && p.y <= lay.arcC.y + 24) {
      drag = 'el';
      applyEl(p);
    } else {
      return;
    }
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!drag || phase !== 'aim') return;
    ev.preventDefault();
    var p = pointerPos(ev);
    if (drag === 'az') applyAz(p); else applyEl(p);
  });

  function endDrag() { drag = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* keyboard: arrows aim (shift = coarse), enter/space locks. */
  canvas.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'Enter' || k === ' ') {
      ev.preventDefault();
      if (phase === 'aim') lockIn();
      else if (phase === 'reveal') advance();
      else if (phase === 'done') newRound();
      return;
    }
    if (phase !== 'aim') return;
    var step = ev.shiftKey ? 15 : 3;
    var estep = ev.shiftKey ? 10 : 2;
    if (k === 'ArrowLeft') { guess.az = ((guess.az + step) % 360 + 360) % 360; }
    else if (k === 'ArrowRight') { guess.az = ((guess.az - step) % 360 + 360) % 360; }
    else if (k === 'ArrowUp') { guess.el = Math.min(90, guess.el + estep); }
    else if (k === 'ArrowDown') { guess.el = Math.max(0, guess.el - estep); }
    else return;
    ev.preventDefault();
    draw();
  });

  /* ---- chrome wiring ---- */
  btnRound.addEventListener('click', function () {
    if (phase === 'aim') lockIn();
    else if (phase === 'reveal') advance();
    else newRound();
  });

  var btnHow = document.getElementById('btnHow');
  var howTo = document.getElementById('howTo');
  btnHow.addEventListener('click', function () {
    howTo.hidden = !howTo.hidden;
    btnHow.setAttribute('aria-expanded', String(!howTo.hidden));
  });

  ArtDaily.onTheme(function () {
    formCache.key = null;
    patchCache.key = null;
    draw();
  });
  window.addEventListener('resize', function () { fitCanvas(); draw(); });

  /* ---- boot ---- */
  fitCanvas();
  var best = ArtDaily.best();
  hudBest.textContent = best === null ? '–' : String(best);
  newRound();
})();
