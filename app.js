(() => {
  const SONGS = window.SONGS;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];

  const ERAS = [
    { key: '80s', title: 'The 80s', note: 'Rise of the Supreme Hero' },
    { key: '90s', title: 'The 90s', note: 'Megastar mania' },
    { key: '00s', title: '2000s & beyond', note: 'Boss is back' },
  ];
  const MAX_ERRORS = 6; // consecutive unplayable videos before we stop skipping
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    era: 'all',
    shuffle: true,
    mode: 'audio', // 'audio' | 'video'
    queue: [],
    pos: 0,
    player: null,
    ready: false,
    started: false,
    errors: 0,
    altTried: false,
  };

  const els = {
    theatre: $('#theatre'),
    frame: $('.marquee-frame'),
    startBtn: $('#startBtn'),
    startNote: $('#startNote'),
    title: $('#songTitle'),
    film: $('#songFilm'),
    year: $('#songYear'),
    music: $('#songMusic'),
    no: $('#songNo'),
    progress: $('#progress'),
    fill: $('#progressFill'),
    timeNow: $('#timeNow'),
    timeTotal: $('#timeTotal'),
    shuffleBtn: $('#shuffleBtn'),
    msg: $('#playerMsg'),
    list: $('#jukeboxList'),
    vinylLabel: $('#vinylLabel'),
    vinylTitle: $('#vinylTitle'),
    vinylFilm: $('#vinylFilm'),
    mini: $('#mini'),
    miniThumb: $('#miniThumb'),
    miniTitle: $('#miniTitle'),
    miniFilm: $('#miniFilm'),
    miniFill: $('#miniFill'),
  };

  const pad = n => String(n).padStart(2, '0');
  const fmt = s => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}` : '0:00');
  const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
  const thumb = (id, size = 'mqdefault') => `url('https://i.ytimg.com/vi/${id}/${size}.jpg')`;
  const current = () => state.queue[state.pos];

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Rebuilds the queue for the current era/shuffle; `keep` stays as the current song if it fits.
  function buildQueue(keep) {
    const pool = SONGS.filter(s => state.era === 'all' || s.era === state.era);
    if (state.shuffle) {
      const rest = shuffled(pool.filter(s => s !== keep));
      state.queue = keep && pool.includes(keep) ? [keep, ...rest] : rest;
      state.pos = 0;
    } else {
      state.queue = pool;
      state.pos = Math.max(0, pool.indexOf(keep));
    }
  }

  // ───────────── Rendering ─────────────
  function renderJukebox() {
    els.list.innerHTML = '';
    for (const era of ERAS) {
      const songs = SONGS.filter(s => s.era === era.key);
      const block = document.createElement('div');
      block.className = 'era-block reveal';
      block.innerHTML = `<div class="era-head"><h3>${era.title}</h3><span>${era.note} · ${songs.length} songs</span></div>`;
      const cards = document.createElement('div');
      cards.className = 'cards';
      for (const song of songs) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card';
        card.dataset.id = song.id;
        card.innerHTML = `
          <div class="card-thumb" style="background-image:${thumb(song.id)}">
            <span class="card-no">No. ${pad(SONGS.indexOf(song) + 1)}</span>
          </div>
          <div class="card-body">
            <div class="card-title"></div>
            <div class="card-film"></div>
          </div>`;
        card.querySelector('.card-title').textContent = song.title;
        card.querySelector('.card-film').textContent = `${song.film} · ${song.year}`;
        card.addEventListener('click', () => playSong(song));
        cards.appendChild(card);
      }
      block.appendChild(cards);
      els.list.appendChild(block);
    }
  }

  // Four song stills per era, pinned up like lobby cards
  function renderEraStacks() {
    for (const stack of $$('[data-stack]')) {
      const songs = SONGS.filter(s => s.era === stack.dataset.stack);
      const step = Math.max(1, Math.floor(songs.length / 4));
      for (let i = 0; i < 4 && i * step < songs.length; i++) {
        const still = document.createElement('span');
        still.style.backgroundImage = thumb(songs[i * step].id, 'hqdefault');
        stack.appendChild(still);
      }
    }
    // The 80s panel leads with our own still
    const top = $('[data-stack="80s"] span:last-child');
    if (top) top.style.backgroundImage = "url('images/retro-80s.webp')";
  }

  function updateInfo() {
    const song = current();
    if (!song) return;
    const filmLine = `${song.film} · ${song.year}`;
    els.title.textContent = song.title;
    els.film.textContent = song.film;
    els.year.textContent = song.year;
    els.music.textContent = song.music;
    els.no.textContent = `No. ${pad(SONGS.indexOf(song) + 1)}`;
    els.vinylLabel.style.backgroundImage = thumb(song.id);
    els.vinylTitle.textContent = song.title;
    els.vinylFilm.textContent = filmLine;
    els.miniThumb.style.backgroundImage = thumb(song.id);
    els.miniTitle.textContent = song.title;
    els.miniFilm.textContent = filmLine;
    document.title = `${song.title} — ${song.film} | Megastar Talkies`;
    $$('.card').forEach(c => c.classList.toggle('is-current', c.dataset.id === song.id));
    setProgress(0, 0);
  }

  function setProgress(now, total) {
    const pct = total > 0 ? Math.min(100, (now / total) * 100) : 0;
    els.fill.style.width = pct + '%';
    els.miniFill.style.width = pct + '%';
    els.progress.setAttribute('aria-valuenow', Math.round(pct));
    els.timeNow.textContent = fmt(now);
    els.timeTotal.textContent = fmt(total);
  }

  function setPlaying(on) {
    document.body.classList.toggle('is-playing', on);
    $$('[data-act="toggle"]').forEach(b => b.setAttribute('aria-label', on ? 'Pause' : 'Play'));
  }

  function setMode(mode) {
    state.mode = mode === 'video' ? 'video' : 'audio';
    document.body.dataset.mode = state.mode;
    $$('[data-mode-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modeSet === state.mode)));
    try { localStorage.setItem('megastar-mode', state.mode); } catch (e) { /* private browsing */ }
  }

  // ───────────── Playback ─────────────
  function load(autoplay) {
    const song = current();
    if (!song) return;
    state.altTried = false;
    updateInfo();
    if (!state.ready) return;
    if (autoplay) state.player.loadVideoById(song.id);
    else state.player.cueVideoById(song.id);
  }

  function raiseCurtain() {
    state.started = true;
    els.startBtn.classList.add('is-up');
    els.msg.textContent = '';
  }

  function start() {
    if (!state.ready) {
      els.startNote.textContent = location.protocol === 'file:'
        ? 'The YouTube player needs a web address. Run start.bat (or any local server) and open http://localhost:8000.'
        : 'The projector is still warming up — give it a second and try again.';
      return;
    }
    raiseCurtain();
    state.player.playVideo();
  }

  // The radio comes on by itself once the intro is over. Browsers only allow sound
  // after the visitor has interacted with the page, so if that first attempt is
  // blocked, the first click, tap or key press anywhere starts it instead.
  const readyQueue = [];
  function autoStart() {
    const begin = () => {
      if (document.body.classList.contains('is-playing')) return;
      if (!state.started) raiseCurtain();
      state.player.playVideo();
    };
    const run = () => {
      begin();
      addEventListener('pointerdown', begin, { once: true, capture: true });
      addEventListener('keydown', begin, { once: true, capture: true });
    };
    if (state.ready) run();
    else readyQueue.push(run);
  }

  function togglePlay() {
    if (!state.started) return start();
    const playing = state.player.getPlayerState() === YT.PlayerState.PLAYING;
    if (playing) state.player.pauseVideo();
    else state.player.playVideo();
  }

  function step(dir) {
    if (!state.queue.length) return;
    state.pos = (state.pos + dir + state.queue.length) % state.queue.length;
    // a fresh shuffle each time the reel runs out
    if (dir > 0 && state.pos === 0 && state.shuffle) buildQueue();
    if (state.ready && !state.started) raiseCurtain();
    load(state.started);
  }

  // In video mode the screen is the point, so bring it into view; in audio mode stay put.
  function showScreen() {
    if (state.mode === 'video') els.theatre.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function playSong(song) {
    if (state.era !== 'all' && song.era !== state.era) setEra('all', true);
    buildQueue(song);
    if (state.ready && !state.started) raiseCurtain();
    load(state.ready);
    if (!state.ready) start();
    showScreen();
  }

  function setEra(era, silent) {
    state.era = era;
    $$('.chip.era').forEach(b => b.classList.toggle('is-on', b.dataset.era === era));
    if (silent) return;
    const keep = current();
    buildQueue(keep && (era === 'all' || keep.era === era) ? keep : null);
    // only interrupt the current song if it doesn't belong to the chosen era
    if (current() !== keep) load(state.started);
  }

  function playEra(era) {
    setEra(era);
    if (!state.started) start();
    else if (state.player.getPlayerState() !== YT.PlayerState.PLAYING) state.player.playVideo();
    showScreen();
  }

  function onPlayerError() {
    const song = current();
    if (song.alt && !state.altTried) {
      state.altTried = true;
      state.player.loadVideoById(song.alt);
      return;
    }
    state.errors++;
    if (state.errors >= MAX_ERRORS) {
      state.errors = 0;
      setPlaying(false);
      els.msg.textContent = 'Several songs in a row refused to play. Check your connection, then press play.';
      return;
    }
    els.msg.textContent = `"${song.title}" could not be played here — skipping to the next reel.`;
    step(1);
  }

  function onStateChange(e) {
    const S = YT.PlayerState;
    if (e.data === S.PLAYING) {
      state.errors = 0;
      if (!state.started) raiseCurtain();
      els.msg.textContent = '';
      setPlaying(true);
    } else if (e.data === S.PAUSED) {
      setPlaying(false);
    } else if (e.data === S.ENDED) {
      step(1);
    }
  }

  window.onYouTubeIframeAPIReady = () => {
    state.player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: current().id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => {
          state.ready = true;
          els.startNote.textContent = '';
          readyQueue.splice(0).forEach(fn => fn());
        },
        onStateChange,
        onError: onPlayerError,
      },
    });
  };

  setInterval(() => {
    if (!state.ready || !state.started || typeof state.player.getDuration !== 'function') return;
    setProgress(state.player.getCurrentTime(), state.player.getDuration());
  }, 500);

  function seekTo(fraction) {
    if (!state.ready || !state.started) return;
    const total = state.player.getDuration();
    if (total > 0) state.player.seekTo(clamp(fraction) * total, true);
  }

  // ───────────── Whistles & paper showers ─────────────
  let audioCtx;
  function whistleSound() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const t0 = audioCtx.currentTime;
    // two-note wolf whistle: a rising sweep, then a rise-and-fall
    const notes = [
      { at: 0, dur: .32, f: [1500, 3000] },
      { at: .38, dur: .55, f: [1400, 3100, 1700] },
    ];
    for (const n of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = t0 + n.at;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f[0], start);
      n.f.slice(1).forEach((f, i, arr) => {
        osc.frequency.exponentialRampToValueAtTime(f, start + (n.dur * (i + 1)) / arr.length);
      });
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.04);
      gain.gain.setValueAtTime(0.16, start + n.dur - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.02);
    }
  }

  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  const PAPER = ['#f2b632', '#d7261e', '#f6e7c8', '#0f7c7a', '#ffffff'];
  const PETALS = ['#ff9f1c', '#ffbf00', '#f25c05', '#e63946', '#fff1c1']; // marigold and rose
  let bits = [];
  let raf = 0;

  function sizeCanvas() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }

  function shower(colors, round) {
    if (reducedMotion) return;
    sizeCanvas();
    for (let i = 0; i < 160; i++) {
      bits.push({
        round,
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        w: 5 + Math.random() * 8,
        h: 8 + Math.random() * 10,
        vy: 2.5 + Math.random() * 4,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.15 + Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    if (!raf) raf = requestAnimationFrame(drawPaper);
  }

  function drawPaper() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bits = bits.filter(b => b.y < canvas.height + 30);
    for (const b of bits) {
      b.x += b.vx + Math.sin(b.y / 40);
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      if (b.round) {
        ctx.beginPath();
        ctx.ellipse(0, 0, b.w * 0.7, b.h * 0.45 * (0.4 + 0.6 * Math.abs(Math.cos(b.rot))), 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot)));
      }
      ctx.restore();
    }
    raf = bits.length ? requestAnimationFrame(drawPaper) : 0;
  }

  function whistle() {
    whistleSound();
    shower(PAPER, false);
  }

  function flowers() {
    shower(PETALS, true);
  }

  // ───────────── Punch dialogues ─────────────
  // Short quotes of famous lines; wording is from memory, so correct any you know better.
  const DIALOGUES = [
    { te: 'చెయ్యి చూశావా... ఎంత రఫ్‌గా ఉందో! రఫ్ఫాడించేస్తా.', en: "Seen this hand? See how rough it is. I'll rough you up.", film: 'Gang Leader', year: 1991 },
    { te: 'మొక్కే కదా అని పీకేస్తే... పీక కోస్తా!', en: "Pull it out thinking it's only a sapling… and I'll slit your throat.", film: 'Indra', year: 2002 },
    { te: 'తెలుగు భాషలో నాకు నచ్చని ఒకే ఒక్క పదం... క్షమించడం.', en: "The one word I don't like in the Telugu language… forgiveness.", film: 'Tagore', year: 2003 },
    { te: 'పొగరు నా ఒంట్లో ఉంటది... హీరోయిజం నా ఇంట్లో ఉంటది.', en: 'Swagger is in my body… heroism runs in my house.', film: 'Khaidi No. 150', year: 2017 },
    { te: 'రికార్డ్స్‌లో నా పేరు ఉండటం కాదు... నా పేరు మీదే రికార్డ్స్ ఉంటాయి.', en: "My name isn't in the records… the records are in my name.", film: 'Waltair Veerayya', year: 2023 },
  ];
  const punch = $('#punch');
  let dialogueAt = Math.floor(Math.random() * DIALOGUES.length);
  let punchTimer = 0;

  function getAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = audioCtx || new Ctx();
    return audioCtx;
  }

  function noiseBuffer(ac, seconds = 0.3) {
    const buf = ac.createBuffer(1, Math.round(ac.sampleRate * seconds), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // A low drum hit: sine dropping in pitch
  function thump(ac, at, level, from = 170, to = 50, dest = ac.destination) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + 0.14);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(dest);
    osc.start(at); osc.stop(at + 0.24);
  }

  // A sharp stick slap: a burst of filtered noise
  function slap(ac, noise, at, level, freq = 1900, dest = ac.destination, decay = 0.07) {
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = noise;
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(filter).connect(gain).connect(dest);
    src.start(at); src.stop(at + decay + 0.02);
  }

  function dialogue() {
    const d = DIALOGUES[dialogueAt];
    dialogueAt = (dialogueAt + 1) % DIALOGUES.length;
    punch.querySelector('.punch-te').textContent = d.te;
    punch.querySelector('.punch-en').textContent = d.en;
    punch.querySelector('.punch-film').textContent = `${d.film} · ${d.year}`;
    punch.classList.remove('is-on');
    void punch.offsetWidth; // restart the slam animation
    punch.classList.add('is-on');
    clearTimeout(punchTimer);
    punchTimer = setTimeout(() => punch.classList.remove('is-on'), 5200);
    const ac = getAudio();
    if (ac) { // "dishoom"
      const noise = noiseBuffer(ac);
      thump(ac, ac.currentTime, 0.5, 220, 40);
      slap(ac, noise, ac.currentTime, 0.35, 900);
    }
  }

  // ───────────── Teenmaar ─────────────
  // Four bars of the procession beat: bass on 1 and 4, stick slaps accented 1-3 / 4-6.
  let teenmaarTimer = 0;
  function teenmaar() {
    const ac = getAudio();
    const stepLen = 0.15, bars = 4;
    if (ac) {
      const noise = noiseBuffer(ac);
      const accents = [1, 0.35, 0.7, 1, 0.35, 0.7];
      const t0 = ac.currentTime + 0.03;
      for (let i = 0; i < bars * 6; i++) {
        const at = t0 + i * stepLen;
        if (i % 3 === 0) thump(ac, at, 0.45);
        slap(ac, noise, at, 0.22 * accents[i % 6]);
      }
      thump(ac, t0 + bars * 6 * stepLen, 0.55, 200, 40);
    }
    document.documentElement.classList.add('is-teenmaar');
    clearTimeout(teenmaarTimer);
    teenmaarTimer = setTimeout(() => document.documentElement.classList.remove('is-teenmaar'), bars * 6 * stepLen * 1000 + 250);
    shower(PAPER, false);
  }

  // ───────────── Scroll scenes ─────────────
  // Each [data-scene] gets a --p custom property (0 → 1) that the CSS turns into motion.
  //   pin:   progress through a tall wrapper whose child is position: sticky
  //   enter: progress of the element rising into the viewport
  const scenes = $$('[data-scene]');
  const words = [];
  const eraDots = $$('.era-dots i');
  let ticking = false;

  function splitStatement() {
    const root = $('#statementText');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part.trim()) { frag.append(part); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = part;
        words.push(w);
        frag.append(w);
      }
      node.replaceWith(frag);
    }
  }

  function updateScenes() {
    ticking = false;
    const vh = innerHeight;
    if (!reducedMotion) {
      for (const el of scenes) {
        const r = el.getBoundingClientRect();
        const p = el.dataset.scene === 'pin'
          ? clamp(-r.top / Math.max(1, r.height - vh))
          : clamp((vh - r.top) / (vh * 0.75));
        el.style.setProperty('--p', p.toFixed(4));
        if (el.classList.contains('statement-wrap')) {
          // finish lighting the words a little before the pin releases
          const lit = Math.floor(clamp(p / 0.82) * (words.length + 1));
          words.forEach((w, i) => w.classList.toggle('on', i < lit));
        } else if (el.id === 'eras') {
          const active = Math.round(p * (eraDots.length - 1));
          eraDots.forEach((d, i) => d.classList.toggle('on', i === active));
        }
      }
    }
    // mini player appears once the big screen is out of view — after the show has
    // started, or once you've scrolled past the screen
    const fr = els.frame.getBoundingClientRect();
    const screenVisible = fr.bottom > 60 && fr.top < vh;
    els.mini.classList.toggle('is-on', !screenVisible && (state.started || fr.bottom <= 60));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateScenes);
  }

  function watchReveals() {
    const items = $$('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    items.forEach(el => io.observe(el));
  }

  // ───────────── Wiring ─────────────
  const actions = { prev: () => step(-1), next: () => step(1), toggle: togglePlay, whistle, dialogue, teenmaar, flowers };
  punch.addEventListener('click', () => punch.classList.remove('is-on'));
  $$('[data-act]').forEach(b => b.addEventListener('click', actions[b.dataset.act]));
  $$('[data-mode-set]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.modeSet)));
  $$('[data-play-era]').forEach(b => b.addEventListener('click', () => playEra(b.dataset.playEra)));
  $$('.chip.era').forEach(b => b.addEventListener('click', () => setEra(b.dataset.era)));

  els.startBtn.addEventListener('click', start);
  $('#replayIntro').addEventListener('click', () => { scrollTo(0, 0); window.MegastarIntro.play(); });
  $('#vinylCover').addEventListener('click', togglePlay);
  $('#heroPlay').addEventListener('click', () => {
    els.theatre.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (!state.started) start();
  });

  els.shuffleBtn.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
    buildQueue(current());
  });

  els.progress.addEventListener('click', e => {
    const r = els.progress.getBoundingClientRect();
    seekTo((e.clientX - r.left) / r.width);
  });
  els.progress.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!state.ready || !state.started) return;
    e.preventDefault();
    state.player.seekTo(Math.max(0, state.player.getCurrentTime() + (e.key === 'ArrowRight' ? 5 : -5)), true);
  });

  document.addEventListener('keydown', e => {
    if (document.documentElement.classList.contains('intro-on')) return;
    if (e.target.closest('button, a, input, [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'n') step(1);
    else if (k === 'p') step(-1);
    else if (k === 'a') setMode(state.mode === 'audio' ? 'video' : 'audio');
    else if (k === 'w') whistle();
    else if (k === 'd') dialogue();
    else if (k === 't') teenmaar();
    else if (k === 'f') flowers();
  });

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { sizeCanvas(); onScroll(); });

  // ───────────── Boot ─────────────
  let savedMode = 'audio'; // audio-first: the radio is the default, video is opt-in
  try { savedMode = localStorage.getItem('megastar-mode') || 'audio'; } catch (e) { /* private browsing */ }
  setMode(savedMode);

  renderJukebox();
  renderEraStacks();
  splitStatement();
  buildQueue();
  updateInfo();
  watchReveals();
  updateScenes();

  if (location.protocol === 'file:') {
    els.startNote.textContent = 'Tip: YouTube needs a web address to play. Run start.bat and open http://localhost:8000.';
  }
  Promise.resolve(window.MegastarIntro && window.MegastarIntro.finished).then(autoStart);

  const api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(api);
})();
