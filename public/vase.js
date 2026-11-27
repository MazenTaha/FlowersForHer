// The Vase of Letters: its own page at #vase, opened from its card in the folder.
// A vase of roses and blue flowers drawn entirely in coloured characters: a stream of
// letters pours down into the vase, the vase fills from the bottom, then the stems and
// flowers type themselves out from its neck. Afterwards the flowers sway a little and a
// few letters keep flickering. "Pour again" plays it from the start.
//
// Talks to welcome.js through window.ffhVase (the same as license.js):
//   go()      inside the tap on the folder card: puts #vase in the address
//   enter()   the folder has faded away: show the page (or the folder again, if you went back)
(() => {
  "use strict";
  const box = document.getElementById("vase");
  const welcome = window.ffhWelcome;
  if (!box || !welcome) return;

  const canvas = box.querySelector(".vase-art");
  const frame = box.querySelector(".vase-frame");
  const note = box.querySelector(".vase-note");
  const againBtn = box.querySelector(".vase-again");
  const homeBtn = box.querySelector(".home-btn");
  const ctx = canvas.getContext("2d");

  const params = new URLSearchParams(location.search);
  const say = params.has("say") ? params.get("say") : "Asmaa!";
  const name = say.replace(/[\s!?.,~]+$/u, "").trim();
  note.textContent = name ? `Every petal is a letter, all for ${name} ✿` : "Every petal is a letter, all for you ✿";

  const VASE = "#vase";
  const onPage = () => location.hash === VASE;
  const homeUrl = () => location.pathname + location.search;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ characters
  const RAMP = ".:-=+*#%@";              // dark to bright
  const SCRAMBLE = "01<>/\\{}[]$&?;~^";  // letters still deciding what to be
  const STREAM = "|!:;1il'";             // the pour
  const CHARS = [" "];
  const charIndex = (ch) => { let i = CHARS.indexOf(ch); if (i < 0) { CHARS.push(ch); i = CHARS.length - 1; } return i; };
  const RAMP_IDX = Array.from(RAMP, charIndex);
  const SCR_IDX = Array.from(SCRAMBLE, charIndex);
  const STR_IDX = Array.from(STREAM, charIndex);

  // ------------------------------------------------------------------ the picture
  // Painted once, small, on a hidden canvas; every frame reads letters off it.
  const SW = 300, SH = 400;              // its size
  const NECK_X = 150, NECK_Y = 258;      // where the stems leave the vase
  let SR, SG, SB, SA, SGI, REV;          // colour, coverage, letter and "appears at" time per pixel

  function paint() {
    const cv = document.createElement("canvas");
    cv.width = SW; cv.height = SH;
    const g = cv.getContext("2d", { willReadFrequently: true });
    const rnd = mulberry32(11);
    g.lineCap = "round"; g.lineJoin = "round";

    const roses = [            // x, y, radius, colours [middle, edge, shadow]
      [122, 112, 29, ["#c81d3a", "#ff8597", "#5c0816"]],
      [182, 104, 30, ["#ec5d8f", "#ffd3e2", "#86214a"]],
      [80, 134, 24, ["#f3dcc0", "#fffaf1", "#9c7a55"]],
      [222, 134, 25, ["#d7263d", "#ff9aa8", "#650d1c"]],
      [106, 178, 30, ["#f27aa0", "#ffd6e4", "#8a2550"]],
      [196, 176, 31, ["#ff7f57", "#ffc8ae", "#86331a"]],
      [150, 148, 34, ["#d01f3c", "#ff8b9c", "#5a0714"]],
      [150, 206, 24, ["#f6e2c6", "#fffbf2", "#a3815c"]],
    ];
    const blues = [[150, 60, 30], [52, 168, 28], [250, 180, 27], [232, 80, 21], [70, 84, 20]];
    const leaves = [           // x, y, length, angle, width
      [72, 214, 50, 2.55, 13], [228, 214, 50, 0.6, 13], [38, 122, 42, 3.55, 11], [262, 120, 42, -0.42, 11],
      [112, 234, 38, 2.15, 10], [190, 234, 38, 1.0, 10], [104, 54, 36, -2.2, 10], [196, 50, 36, -0.95, 10],
      [30, 196, 34, 2.95, 9], [272, 200, 34, 0.2, 9],
    ];

    // stems, from the neck to every flower
    g.strokeStyle = "#3d8644"; g.lineWidth = 3;
    for (const [x, y] of [...roses, ...blues]) {
      g.beginPath();
      g.moveTo(NECK_X + (x - NECK_X) * 0.1, NECK_Y + 8);
      g.quadraticCurveTo(NECK_X + (x - NECK_X) * 0.45, NECK_Y - 34, x, y);
      g.stroke();
    }
    // leaves, behind the flowers
    for (const [x, y, len, ang, wid] of leaves) {
      g.save(); g.translate(x, y); g.rotate(ang);
      const gr = g.createLinearGradient(0, -wid, 0, wid);
      gr.addColorStop(0, "#9ad883"); gr.addColorStop(1, "#2a6a33");
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
      g.strokeStyle = "rgba(18, 56, 24, 0.75)"; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(2, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    }
    // blue flowers: clusters of little four-petal florets
    for (const [x, y, R] of blues) {
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.85;
        const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d, fr = R * (0.17 + 0.06 * rnd());
        const light = 150 + Math.floor(rnd() * 70);
        g.fillStyle = `rgb(${light - 70}, ${light - 30}, 255)`;
        g.strokeStyle = "rgba(22, 30, 96, 0.65)"; g.lineWidth = 0.8;
        for (let p = 0; p < 4; p++) {
          const pa = p * TAU / 4 + a;
          g.beginPath(); g.arc(fx + Math.cos(pa) * fr * 0.55, fy + Math.sin(pa) * fr * 0.55, fr * 0.55, 0, TAU);
          g.fill(); g.stroke();
        }
        g.fillStyle = "#eef2ff"; g.beginPath(); g.arc(fx, fy, fr * 0.22, 0, TAU); g.fill();
      }
    }
    // roses: a ring of outer petals, a cup, and the spiral in the middle
    for (const [x, y, r, [mid, edge, dark]] of roses) {
      const turn = rnd() * TAU;
      for (let i = 0; i < 6; i++) {
        const a = turn + i * TAU / 6;
        const px = x + Math.cos(a) * r * 0.42, py = y + Math.sin(a) * r * 0.42;
        const gr = g.createRadialGradient(px, py, 0, px, py, r * 0.62);
        gr.addColorStop(0, mid); gr.addColorStop(1, edge);
        g.fillStyle = gr; g.strokeStyle = dark; g.lineWidth = 1;
        g.beginPath(); g.ellipse(px, py, r * 0.6, r * 0.48, a, 0, TAU); g.fill(); g.stroke();
      }
      const cup = g.createRadialGradient(x, y, 0, x, y, r * 0.72);
      cup.addColorStop(0, dark); cup.addColorStop(0.45, mid); cup.addColorStop(1, edge);
      g.fillStyle = cup; g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.fill();
      g.strokeStyle = dark; g.lineWidth = Math.max(1.3, r * 0.08);
      g.beginPath();
      for (let s = 0; s <= 4.2 * Math.PI; s += 0.12) {
        const rr = r * 0.66 * (1 - s / (4.6 * Math.PI));
        const sx = x + Math.cos(s + turn) * rr, sy = y + Math.sin(s + turn) * rr * 0.9;
        if (s === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.stroke();
    }
    // baby's breath and little amber buds around the edge
    for (let i = 0; i < 70; i++) {
      const a = rnd() * TAU, d = 104 + rnd() * 26;
      const x = 150 + Math.cos(a) * d * 1.05, y = 140 + Math.sin(a) * d * 0.92;
      if (y > 236) continue;
      g.fillStyle = rnd() < 0.8 ? "#fbf7ee" : "#f0a54a";
      g.beginPath(); g.arc(x, y, 1.6 + rnd() * 1.6, 0, TAU); g.fill();
    }
    // soft light from the top left, over the whole bouquet
    g.globalCompositeOperation = "source-atop";
    const sh = g.createRadialGradient(118, 104, 10, 150, 150, 220);
    sh.addColorStop(0, "rgba(255, 255, 255, 0.14)"); sh.addColorStop(1, "rgba(0, 0, 0, 0.4)");
    g.fillStyle = sh; g.fillRect(0, 0, SW, SH);
    g.globalCompositeOperation = "source-over";

    // the vase, in front of the stems: cobalt glaze with an amber band
    const vase = new Path2D();
    vase.moveTo(124, 250);
    vase.quadraticCurveTo(150, 244, 176, 250);
    vase.lineTo(170, 262);
    vase.bezierCurveTo(170, 282, 214, 296, 212, 330);
    vase.bezierCurveTo(210, 362, 186, 380, 182, 392);
    vase.lineTo(118, 392);
    vase.bezierCurveTo(114, 380, 90, 362, 88, 330);
    vase.bezierCurveTo(86, 296, 130, 282, 130, 262);
    vase.closePath();
    const glaze = g.createLinearGradient(88, 0, 212, 0);
    glaze.addColorStop(0, "#131f55"); glaze.addColorStop(0.3, "#3a5bc4"); glaze.addColorStop(0.45, "#7896f2");
    glaze.addColorStop(0.7, "#2b47a6"); glaze.addColorStop(1, "#0d1644");
    g.fillStyle = glaze; g.fill(vase);
    g.save(); g.clip(vase);
    g.fillStyle = "#e08a1e"; g.fillRect(80, 304, 140, 7);
    g.fillStyle = "#f4d6b0"; g.fillRect(80, 348, 140, 3);
    for (let x = 96; x < 208; x += 12) { g.beginPath(); g.arc(x, 326, 2.2, 0, TAU); g.fill(); }
    g.fillStyle = "rgba(255, 255, 255, 0.32)";
    g.beginPath(); g.ellipse(112, 322, 6, 30, 0.12, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = "#0a1236"; g.beginPath(); g.ellipse(150, 250, 25, 5, 0, 0, TAU); g.fill();
    g.strokeStyle = "#9bb3ff"; g.lineWidth = 2; g.stroke();

    // read it back: colour (a little livelier), letter, and when each pixel appears
    const d = g.getImageData(0, 0, SW, SH).data, n = SW * SH;
    SR = new Uint8Array(n); SG = new Uint8Array(n); SB = new Uint8Array(n); SA = new Uint8Array(n);
    SGI = new Uint8Array(n); REV = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
      SA[i] = a;
      if (a < 90) continue;
      const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
      const m = 0.62 + 0.62 * lum;
      const grey = (r + gg + b) / 3;
      SR[i] = clamp((grey + (r - grey) * 1.25) * m, 0, 255);
      SG[i] = clamp((grey + (gg - grey) * 1.25) * m, 0, 255);
      SB[i] = clamp((grey + (b - grey) * 1.25) * m, 0, 255);
      let ri = clamp(Math.round(Math.pow(lum, 0.85) * 9.4), 0, RAMP.length - 1);
      if (a < 170) ri = Math.min(ri, 2);
      SGI[i] = RAMP_IDX[ri];
      const x = i % SW, y = (i / SW) | 0;
      const noise = ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296);
      REV[i] = y >= 244
        ? 1.05 + (392 - y) / 140 * 1.1 + noise * 0.12                      // the vase fills from the bottom
        : 2.2 + Math.hypot(x - NECK_X, y - NECK_Y) / 230 * 2.6 + noise * 0.3;   // then the bouquet grows out of it
    }
  }

  // ------------------------------------------------------------------ timing
  const SCR_T = 0.4;                     // how long a letter scrambles before it settles
  const BUILT = 5.6;                     // everything has appeared
  const POUR_IN = 1.1, POUR_OFF = 2.3, POUR_GONE = 3.0;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

  // ------------------------------------------------------------------ the grid
  let cols = 0, rows = 0, gw = 6, gh = 11, IDX = new Uint8Array(0), RGB = new Uint8Array(0);
  let PIDX = new Uint8Array(0), PRGB = new Uint8Array(0);   // what's on the canvas now
  let atlas = null, image = null, image32 = null;

  function buildAtlas(fontPx) {
    const mono = `700 ${fontPx}px Consolas, Menlo, "DejaVu Sans Mono", "Courier New", monospace`;
    const cv = document.createElement("canvas");
    let c2 = cv.getContext("2d");
    c2.font = mono;
    gw = Math.max(2, Math.round(c2.measureText("@").width));
    gh = Math.max(3, Math.round(fontPx * 1.12));
    cv.width = gw * CHARS.length; cv.height = gh;
    c2 = cv.getContext("2d", { willReadFrequently: true });
    c2.font = mono; c2.fillStyle = "#fff"; c2.textBaseline = "alphabetic"; c2.textAlign = "center";
    CHARS.forEach((ch, i) => { if (ch !== " ") c2.fillText(ch, i * gw + gw / 2, Math.round(gh * 0.8)); });
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    atlas = new Uint8Array(CHARS.length * gw * gh);       // how much of each pixel the letter covers
    for (let i = 0; i < CHARS.length; i++)
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++)
        atlas[(i * gh + y) * gw + x] = d[(y * cv.width + i * gw + x) * 4 + 3];
  }

  // as big as the space between the note and the top allows, in the picture's 3:4 shape
  function layout() {
    const fw = frame.clientWidth, fh = frame.clientHeight;
    const h = Math.max(160, Math.min(fh, fw * 4 / 3)), w = h * 3 / 4;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.min(dpr, 2.5, Math.sqrt(8e5 / (w * h))));     // keep the pixel count sane
    const targetRows = clamp(Math.round(h / 4.6), 56, 120);
    buildAtlas(Math.max(4, Math.round(h * k / targetRows / 1.12)));
    cols = Math.max(20, Math.floor(w * k / gw)); rows = Math.max(20, Math.floor(h * k / gh));
    canvas.width = cols * gw; canvas.height = rows * gh;
    canvas.style.width = `${(cols * gw) / k}px`; canvas.style.height = `${(rows * gh) / k}px`;
    IDX = new Uint8Array(cols * rows); RGB = new Uint8Array(cols * rows * 3);
    PIDX = new Uint8Array(cols * rows).fill(255); PRGB = new Uint8Array(cols * rows * 3);   // 255: draw every cell once
    image = ctx.createImageData(canvas.width, canvas.height);
    image32 = new Uint32Array(image.data.buffer);
  }

  let sparkle = 12345;                   // a cheap random generator, no garbage
  const rand = () => { sparkle = (Math.imul(sparkle, 1664525) + 1013904223) | 0; return sparkle >>> 0; };
  const set = (k, ci, r, g, b) => { IDX[k] = ci; RGB[k * 3] = r; RGB[k * 3 + 1] = g; RGB[k * 3 + 2] = b; };

  function render(t) {
    IDX.fill(0);
    const W = canvas.width, H = canvas.height;
    const zoom = 0.84 + 0.16 * easeOut(t / BUILT);       // the camera leans in while it builds
    const s = Math.min(W / SW, H / SH) * zoom;          // canvas pixels per picture pixel
    const fx = SW / 2, fy = SH / 2 + (1 - zoom) * 60;
    const swayAmp = reduce ? 0 : 5 * easeOut((t - BUILT + 0.6) / 1.6);
    const swayPhase = Math.sin(t * 0.8), swayPhase2 = Math.sin(t * 1.3 + 1);
    const settled = t >= BUILT + SCR_T;
    const last = RAMP_IDX.length - 1;
    for (let r = 0; r < rows; r++) {
      const sy = fy + ((r + 0.5) * gh - H / 2) / s;
      if (sy < 0 || sy >= SH) continue;
      const up = clamp((NECK_Y - sy) / 200, 0, 1);
      const dx = swayAmp * up * Math.sqrt(up) * (swayPhase + 0.3 * swayPhase2);   // stems rock, the vase stays put
      const rowBase = (sy | 0) * SW;
      const x0 = fx - (W / 2) / s - dx, step = gw / s;
      for (let c = 0; c < cols; c++) {
        const sx = x0 + (c + 0.5) * step;
        if (sx < 0 || sx >= SW) continue;
        const i = rowBase + (sx | 0);
        if (SA[i] < 90) continue;
        const age = t - REV[i];
        if (age < 0) continue;
        const k = r * cols + c;
        if (age < SCR_T && !settled) {                   // still deciding: a random letter, washed in sky blue
          const f = age / SCR_T, q = 1 - f;
          set(k, SCR_IDX[rand() % SCR_IDX.length], SR[i] * f + 140 * q, SG[i] * f + 215 * q, SB[i] * f + 240 * q);
        } else {
          let ci = SGI[i];
          const rv = rand();
          if (rv < 171798692) {                          // ~4% of letters flicker one step
            const j = RAMP_IDX.indexOf(ci) + ((rv >>> 8) % 3) - 1;
            ci = RAMP_IDX[clamp(j, 0, last)];
          }
          set(k, ci, SR[i], SG[i], SB[i]);
        }
      }
    }
    // the pour: a falling column of letters from the top into the vase's neck
    if (t < POUR_GONE && !reduce) {
      const col0 = Math.round(((NECK_X - fx) * s + W / 2) / gw - 0.5);
      const neckRow = ((NECK_Y - 8 - fy) * s + H / 2) / gh;
      const head = neckRow * Math.pow(clamp(t / POUR_IN, 0, 1), 2);
      const tail = neckRow * easeOut((t - POUR_OFF) / (POUR_GONE - POUR_OFF));
      const fall = Math.floor(t * 38);
      for (let r = Math.max(0, Math.floor(tail)); r < Math.min(rows, head); r++) {
        const b = 0.35 + 0.65 * (r - tail) / Math.max(1, head - tail);
        for (let dc = -1; dc <= 1; dc++) {
          const c = col0 + dc;
          if (c < 0 || c >= cols) continue;
          const hsh = Math.imul((r - fall) * 374761393 + c * 668265263, 1274126177) >>> 0;
          if (dc !== 0 && hsh % 5 !== 0) continue;
          const k = r * cols + c;
          if (IDX[k]) continue;
          const white = r > head - 3 ? 1 : 0.55;
          set(k, STR_IDX[hsh % STR_IDX.length], (120 + 135 * white) * b, (200 + 55 * white) * b, 240 * b);
        }
      }
    }
    compose();
  }

  // only the letters that changed since the last frame are redrawn (the vase barely moves
  // once it's built), and only the rows they're in are sent to the canvas
  function compose() {
    const W = canvas.width, px = image32, gsz = gw * gh;
    let top = rows, bottom = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c, ci = IDX[k], k3 = k * 3;
        const R = RGB[k3], G = RGB[k3 + 1], B = RGB[k3 + 2];
        if (ci === PIDX[k] && R === PRGB[k3] && G === PRGB[k3 + 1] && B === PRGB[k3 + 2]) continue;
        PIDX[k] = ci; PRGB[k3] = R; PRGB[k3 + 1] = G; PRGB[k3 + 2] = B;
        if (r < top) top = r;
        bottom = r;
        const col = (B << 16) | (G << 8) | R;
        let a = ci * gsz, p = r * gh * W + c * gw;
        for (let y = 0; y < gh; y++, p += W - gw) {
          for (let x = 0; x < gw; x++, p++, a++) {
            const w = atlas[a];                        // (the space's glyph is all zeros: it clears the cell)
            px[p] = w ? (w << 24) | col : 0;           // the letter's own edge is its transparency
          }
        }
      }
    }
    if (bottom >= 0) ctx.putImageData(image, 0, 0, 0, top * gh, W, (bottom - top + 1) * gh);
  }

  // ------------------------------------------------------------------ running it
  let raf = 0, running = false, t = 0, last = 0, lastDraw = 0;
  function tick(now) {
    raf = 0;
    if (!running) return;
    t += clamp((now - last) / 1000, 0, 0.1);          // no jump after a tab switch (and a frame's time can be a hair before play())
    last = now;
    if (t < BUILT + 0.5 || now - lastDraw >= 78) {     // full speed while it builds, then ~12 frames a second: the sway is slow
      render(t); lastDraw = now;
    }
    raf = requestAnimationFrame(tick);
  }
  function play(from) {
    t = from; last = performance.now(); lastDraw = 0;
    if (reduce) { render(BUILT + 1); return; }      // just the finished vase, still
    running = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  let shown = false, cameFromHome = false, hideTimer = 0, resizeTimer = 0;
  function show() {
    clearTimeout(hideTimer);
    if (!SR) paint();
    const wasShown = shown;
    shown = true;
    box.hidden = false;
    layout();
    if (!wasShown) play(0); else if (!running) play(t);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("show")));
  }
  function hide(then) {                  // fade out, then stop drawing
    if (!shown) { if (then) then(); return; }
    box.classList.remove("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      stop();
      shown = false;
      box.hidden = true;
      cameFromHome = false;
      if (then) then();
    }, 450);
  }

  // show whichever page the address says
  function route() {
    if (onPage()) { welcome.hide(); show(); return; }
    if (shown) hide(() => welcome.show());
  }

  window.ffhVase = {
    go() { history.pushState({ ffh: "vase" }, "", VASE); cameFromHome = true; },
    enter() {
      if (onPage()) show();
      else { cameFromHome = false; welcome.show(); }   // went back while the folder faded
    },
  };

  againBtn.addEventListener("click", () => { if (shown) play(0); });
  homeBtn.addEventListener("click", () => {
    if (cameFromHome) { history.back(); return; }      // popstate -> route()
    history.pushState(null, "", homeUrl());
    route();
  });
  window.addEventListener("popstate", route);
  window.addEventListener("resize", () => {
    if (!shown) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); render(reduce ? BUILT + 1 : t); }, 120);
  });
  if (onPage()) show();                  // a link straight to the vase
})();
