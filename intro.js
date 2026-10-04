// Animated title sequence: film-leader countdown → sunburst → Chiranjeevi poster → title slam.
// Drawn live on a canvas so it stays sharp at any size. Exposes window.MegastarIntro.
(() => {
  const DURATION = 9.4;   // seconds
  const LEADER = 2.4;     // 3-2-1 countdown
  const PHOTO_AT = 2.9;
  const BEATS = [['80s', 3.3], ['90s', 3.85], ['All-time hits', 4.4]];
  const TITLE_AT = 5.0;
  const SEEN_KEY = 'megastar-intro-seen';
  const C = { ink: '#1b0a09', red: '#d7261e', mustard: '#f2b632', cream: '#f6e7c8', leader: '#d9c79e' };
  // warm poster duotone: shadows → highlights
  const TONES = [[27, 10, 9], [92, 15, 20], [200, 52, 30], [242, 182, 50], [246, 231, 200]];

  const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const easeOutBack = x => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

  let overlay, canvas, ctx, poster, raf = 0, t0 = 0, done = null;
  let gateOpen = false; // assets loaded, animation not yet rolling
  let vw = 0, vh = 0, dpr = 1;

  // Repaints the photo as a hand-painted poster: gradient-mapped tones, soft edges.
  function makePoster(img) {
    const h = Math.min(900, img.naturalHeight);
    const w = Math.round(h * img.naturalWidth / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
        lum = Math.pow(clamp((lum - 0.03) * 1.3), 0.72); // lift the shadows so the dark suit still reads
        const pos = lum * (TONES.length - 1);
        const k = Math.min(TONES.length - 2, Math.floor(pos));
        const f = pos - k;
        for (let ch = 0; ch < 3; ch++) px[i + ch] = TONES[k][ch] + (TONES[k + 1][ch] - TONES[k][ch]) * f;
        const edge = smooth(0, 0.2, x / w) * smooth(0, 0.2, 1 - x / w) * smooth(0, 0.24, 1 - y / h);
        px[i + 3] = 255 * edge * (0.82 + 0.18 * smooth(0.03, 0.22, lum));
      }
    }
    g.putImageData(data, 0, 0);
    return c;
  }

  function resize() {
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }

  function fitFont(text, family, maxW, maxSize) {
    ctx.font = `100px ${family}`;
    return Math.min(maxSize, (maxW / ctx.measureText(text).width) * 100);
  }

  // Poster lettering: ink drop shadow, red offset, then the fill.
  function posterText(text, x, y, size, family, fill) {
    const k = size / 120;
    ctx.font = `${size}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.fillText(text, x + 7 * k, y + 7 * k);
    ctx.fillStyle = C.red; ctx.fillText(text, x + 3 * k, y + 3 * k);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  function star(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawLeader(t) {
    const cx = vw / 2, cy = vh / 2, r = Math.min(vw, vh) * 0.36;
    const count = 3 - Math.floor(t / 0.8);
    const sweep = (t % 0.8) / 0.8;
    ctx.fillStyle = C.leader; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = 'rgba(27,10,9,.2)';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(vw, vh), -Math.PI / 2, -Math.PI / 2 + sweep * Math.PI * 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(2, r * 0.018);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(vw, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, vh); ctx.stroke();
    for (const k of [1, 0.84]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = C.ink;
    ctx.font = `${r * 1.25}px Shrikhand, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy + r * 0.06);
  }

  function drawRays(t) {
    const cx = vw / 2, cy = vh / 2, R = Math.hypot(vw, vh);
    ctx.fillStyle = '#560c11'; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#7a161b';
    const rot = t * 0.16;
    for (let i = 0; i < 24; i += 2) {
      const a = rot + (i * Math.PI) / 12;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a, a + Math.PI / 12);
      ctx.closePath(); ctx.fill();
    }
    const v = ctx.createRadialGradient(cx, cy, Math.min(vw, vh) * 0.25, cx, cy, R * 0.62);
    v.addColorStop(0, 'rgba(27,10,9,0)'); v.addColorStop(1, 'rgba(27,10,9,.85)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, vw, vh);
  }

  function drawPoster(t, land) {
    if (!poster || t < PHOTO_AT) return;
    const k = easeOut((t - PHOTO_AT) / 0.9);
    const h = land ? vh * 0.96 : vh * 0.6;
    const w = (h * poster.width) / poster.height;
    const zoom = 1.14 - 0.14 * k + (t - PHOTO_AT) * 0.007;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(land ? vw * 0.73 : vw * 0.5, (land ? vh : vh * 0.64) + (1 - k) * vh * 0.22);
    ctx.scale(zoom, zoom);
    ctx.drawImage(poster, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawBeats(t, tx, ty, tw, land) {
    if (t < BEATS[0][1] || t >= TITLE_AT) return;
    let cur = BEATS[0];
    for (const b of BEATS) if (t >= b[1]) cur = b;
    const k = easeOutBack((t - cur[1]) / 0.22);
    const size = fitFont(cur[0], 'Shrikhand, serif', tw, land ? vh * 0.34 : vh * 0.17);
    ctx.save();
    ctx.translate(tx, ty); ctx.rotate(-0.07); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
    posterText(cur[0], 0, 0, size, 'Shrikhand, serif', C.mustard);
    ctx.restore();
  }

  function drawTitle(t, tx, ty, tw, land) {
    if (t < TITLE_AT) return;
    const tel = "Ramabhadra, 'Anek Telugu', sans-serif";
    const size = fitFont('మెగాస్టార్', tel, tw, land ? vh * 0.2 : vh * 0.095);
    const y1 = ty - size * 0.85, y2 = y1 + size * 1.32;

    // stars burst out from behind the title
    const sb = (t - TITLE_AT) / 1.3;
    if (sb < 1) {
      ctx.fillStyle = C.mustard; ctx.globalAlpha = 1 - sb;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.3;
        const d = easeOut(sb) * Math.min(vw, vh) * (0.3 + (i % 3) * 0.12);
        star(tx + Math.cos(a) * d, ty + Math.sin(a) * d * 0.8, size * (0.1 + (i % 4) * 0.03), a + sb * 3);
      }
      ctx.globalAlpha = 1;
    }

    [['మెగాస్టార్', y1, 0], ['టాకీస్', y2, 0.22]].forEach(([text, y, delay]) => {
      const p = (t - TITLE_AT - delay) / 0.4;
      if (p <= 0) return;
      const k = easeOutBack(p);
      ctx.save();
      ctx.globalAlpha = clamp(p * 3);
      ctx.translate(tx, y); ctx.scale(2.6 - 1.6 * k, 2.6 - 1.6 * k);
      posterText(text, 0, 0, size, tel, C.mustard);
      ctx.restore();
    });

    const e = easeOut((t - TITLE_AT - 0.75) / 0.5);
    if (e > 0) {
      const es = size * 0.4;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(tx, y2 + size * 1.0 + (1 - e) * 24); ctx.rotate(-0.05);
      posterText('Megastar Talkies', 0, 0, es, 'Shrikhand, serif', C.cream);
      ctx.restore();
    }
    const m = easeOut((t - TITLE_AT - 1.4) / 0.6);
    if (m > 0) {
      const ms = Math.max(10, Math.min(size * 0.11, tw / 34));
      ctx.globalAlpha = m;
      ctx.font = `700 ${ms}px 'Space Mono', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.mustard;
      ctx.fillText('CHIRANJEEVI RETRO RADIO  ·  80s  ·  90s  ·  ALL-TIME HITS', tx, y2 + size * 1.62);
      ctx.globalAlpha = 1;
    }
  }

  // Marquee bulbs chasing around the frame
  function drawBulbs(t) {
    if (t < TITLE_AT) return;
    const inset = 16, gap = 28, phase = Math.floor(t * 4);
    const nx = Math.max(2, Math.round((vw - inset * 2) / gap)), ny = Math.max(2, Math.round((vh - inset * 2) / gap));
    const pts = [];
    for (let i = 0; i <= nx; i++) pts.push([inset + (i * (vw - inset * 2)) / nx, inset]);
    for (let i = 1; i <= ny; i++) pts.push([vw - inset, inset + (i * (vh - inset * 2)) / ny]);
    for (let i = nx - 1; i >= 0; i--) pts.push([inset + (i * (vw - inset * 2)) / nx, vh - inset]);
    for (let i = ny - 1; i >= 1; i--) pts.push([inset, inset + (i * (vh - inset * 2)) / ny]);
    const a = clamp((t - TITLE_AT) / 0.4);
    pts.forEach(([x, y], i) => {
      const on = (i + phase) % 2 === 0;
      ctx.globalAlpha = a * (on ? 1 : 0.35);
      ctx.fillStyle = on ? '#fff3c4' : C.mustard;
      ctx.beginPath(); ctx.arc(x, y, on ? 4.2 : 3.4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function flash(t, at, len, strength) {
    const a = (1 - (t - at) / len) * strength;
    if (t < at || a <= 0) return;
    ctx.fillStyle = `rgba(255,246,220,${a})`; ctx.fillRect(0, 0, vw, vh);
  }

  // Old-print wear: flicker and the odd scratch
  function drawWear(t) {
    ctx.fillStyle = `rgba(27,10,9,${Math.random() * (t < LEADER ? 0.1 : 0.04)})`;
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = `rgba(27,10,9,${t < LEADER ? 0.35 : 0.14})`; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.45) continue;
      const x = Math.random() * vw;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 12, vh); ctx.stroke();
    }
  }

  function draw(t) {
    const land = vw > vh * 1.05;
    const tx = land ? vw * 0.31 : vw * 0.5;
    const ty = land ? vh * 0.4 : vh * 0.7;
    const tw = land ? vw * 0.5 : vw * 0.84;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (t < LEADER) {
      drawLeader(t);
    } else {
      drawRays(t);
      drawPoster(t, land);
      drawBeats(t, tx, ty, tw, land);
      drawTitle(t, tx, ty, tw, land);
      drawBulbs(t);
      flash(t, LEADER, 0.35, 0.9);
      flash(t, TITLE_AT, 0.28, 0.6);
    }
    drawWear(t);
    const out = (t - (DURATION - 0.7)) / 0.7;
    if (out > 0) { ctx.fillStyle = `rgba(27,10,9,${clamp(out)})`; ctx.fillRect(0, 0, vw, vh); }
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    draw(Math.min(t, DURATION));
    if (t >= DURATION) return finish();
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (!overlay) return;
    gateOpen = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('intro-on');
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private browsing */ }
    const el = overlay;
    overlay = null;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 600);
    if (done) done();
  }

  function onKey(e) {
    if (e.key === 'Escape') finish();
    else if (e.key === 'Enter' && !gateOpen) finish(); // at the gate, Enter presses the start button
  }

  function loadAssets() {
    const fonts = document.fonts
      ? Promise.all([
          document.fonts.load('40px Ramabhadra', 'మెగాస్టార్ టాకీస్'),
          document.fonts.load('40px Shrikhand', 'Megastar 321'),
          document.fonts.load("700 20px 'Space Mono'", 'RADIO'),
        ]).catch(() => {})
      : Promise.resolve();
    const photo = poster ? Promise.resolve() : new Promise(resolve => {
      const img = new Image();
      img.onload = () => { try { poster = makePoster(img); } catch (e) { /* draw without the photo */ } resolve(); };
      img.onerror = resolve;
      img.src = 'images/namaste.jpg';
    });
    const timeout = new Promise(resolve => setTimeout(resolve, 2500));
    return Promise.race([Promise.all([fonts, photo]), timeout]);
  }

  // Starts the animation and tells the page, so the opening music can start in step.
  function begin() {
    if (!overlay || !gateOpen) return;
    gateOpen = false;
    cancelAnimationFrame(raf);
    const gate = overlay.querySelector('.intro-gate');
    if (gate) gate.remove();
    window.dispatchEvent(new Event('megastar:intro-start'));
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Waiting at the gate: the leader's first frame flickers until someone starts the show.
  function idle() {
    draw(0.01);
    raf = requestAnimationFrame(idle);
  }

  // gate: wait for a tap before rolling. Browsers only allow sound after the visitor
  // interacts, so the automatic first run asks for one.
  function play({ gate = false } = {}) {
    if (overlay) finish();
    overlay = document.createElement('div');
    overlay.className = 'intro';
    overlay.innerHTML = '<canvas></canvas>'
      + (gate ? '<button class="intro-gate" type="button"><span lang="te">ఆట మొదలు!</span><small>Tap to start the show · sound on</small></button>' : '')
      + '<button class="intro-skip" type="button">Skip intro</button>';
    document.body.appendChild(overlay);
    document.documentElement.classList.add('intro-on');
    canvas = overlay.querySelector('canvas');
    ctx = canvas.getContext('2d');
    api.canvas = canvas;
    overlay.querySelector('.intro-skip').addEventListener('click', finish);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', resize);
    resize();
    const mine = overlay;
    api.finished = new Promise(resolve => {
      done = resolve;
      loadAssets().then(() => {
        if (overlay !== mine) return; // skipped while loading
        gateOpen = true;
        const gateBtn = overlay.querySelector('.intro-gate');
        if (!gateBtn) return begin();
        gateBtn.classList.add('is-ready');
        gateBtn.addEventListener('click', begin);
        gateBtn.focus();
        raf = requestAnimationFrame(idle);
      });
    });
    return api.finished;
  }

  // `finished` resolves when the most recent run ends (or is skipped)
  const api = { play, skip: finish, duration: DURATION, canvas: null, finished: null };
  window.MegastarIntro = api;

  // Plays once per browser session; never for people who ask for reduced motion.
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { /* private browsing */ }
  if (!seen && !matchMedia('(prefers-reduced-motion: reduce)').matches) play({ gate: true });
})();
