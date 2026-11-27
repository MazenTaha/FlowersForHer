// The Vase of Letters: its own page at #vase, opened from its card in the folder.
// Bouquets drawn entirely in coloured characters, one dissolving into the next while the
// camera slowly moves in: a single round flower on a long stem (with a thin thread of
// letters falling from the top), a dome of flowers in a tall slim glass vase, the bouquet in
// a round pot with amber rings, a fuller one in a blue pitcher, a wide one in a striped vase,
// and last a close-up of roses, hydrangeas and leaves in a blue vase, which stays and sways.
// Letters follow the shapes: outlines are drawn with - \ | / along their direction, the rest
// picks from a long ramp of letters by brightness, and every letter sits on a dim block of
// its own colour. "Play again" plays it from the start.
//
// The six pictures are painted in a background worker (where the browser allows it), so the
// page never stalls while they're made.
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
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // ================================================================== the painter
  // Self-contained (it is also run inside the worker, from its source text): paints one
  // scene on a small canvas and turns it into letters: per picture pixel, a letter (0 = none)
  // and its colour.
  function makePainter() {
    const SW = 300, SH = 400, TAU = Math.PI * 2;
    const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    const EDGES = "-\\|/";
    const CHARS = [];
    for (const ch of " " + RAMP + EDGES) if (!CHARS.includes(ch)) CHARS.push(ch);
    const RAMP_IDX = Array.from(RAMP, (ch) => CHARS.indexOf(ch));
    const EDGE_IDX = Array.from(EDGES, (ch) => CHARS.indexOf(ch));

    function mulberry32(a) {
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const canvasOf = (w, h) => {
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
      const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
    };

    // ---------------------------------------------------------------- flowers
    const ROSES = [
      ["#c81d3a", "#ff8597", "#5c0816"], ["#e0436c", "#ffc0d0", "#7a1636"], ["#d7263d", "#ff9aa8", "#650d1c"],
      ["#f27aa0", "#ffd6e4", "#8a2550"], ["#b3122e", "#f2667a", "#480612"], ["#ff7f6a", "#ffcabb", "#86331a"],
    ];
    const CREAM = ["#f3dcc0", "#fffaf1", "#9c7a55"];

    function rose(g, x, y, r, [mid, edge, dark], rnd) {
      const turn = rnd() * TAU;
      for (let i = 0; i < 6; i++) {               // outer petals
        const a = turn + i * TAU / 6;
        const px = x + Math.cos(a) * r * 0.42, py = y + Math.sin(a) * r * 0.42;
        const gr = g.createRadialGradient(px, py, 0, px, py, r * 0.62);
        gr.addColorStop(0, mid); gr.addColorStop(1, edge);
        g.fillStyle = gr; g.strokeStyle = dark; g.lineWidth = Math.max(1, r * 0.05);
        g.beginPath(); g.ellipse(px, py, r * 0.6, r * 0.48, a, 0, TAU); g.fill(); g.stroke();
      }
      const cup = g.createRadialGradient(x, y, 0, x, y, r * 0.72);
      cup.addColorStop(0, dark); cup.addColorStop(0.45, mid); cup.addColorStop(1, edge);
      g.fillStyle = cup; g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.fill();
      g.strokeStyle = dark; g.lineWidth = Math.max(1.3, r * 0.08);
      g.beginPath();                               // the spiral in the middle
      for (let s = 0; s <= 4.2 * Math.PI; s += 0.12) {
        const rr = r * 0.66 * (1 - s / (4.6 * Math.PI));
        const sx = x + Math.cos(s + turn) * rr, sy = y + Math.sin(s + turn) * rr * 0.9;
        if (s === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.stroke();
    }

    // a round, many-petalled flower seen from the front (ranunculus / dahlia): rings of petals
    function pom(g, x, y, r, [mid, edge, dark], rnd) {
      const turn = rnd() * TAU;
      for (let k = 0; k < 6; k++) {
        const rr = r * (1 - k / 6.5), n = 12 - k;
        for (let i = 0; i < n; i++) {
          const a = turn + (i + (k % 2) * 0.5) * TAU / n;
          const px = x + Math.cos(a) * rr * 0.72, py = y + Math.sin(a) * rr * 0.72;
          const gr = g.createRadialGradient(px, py, 0, px, py, rr * 0.42);
          gr.addColorStop(0, k > 3 ? dark : mid); gr.addColorStop(1, edge);
          g.fillStyle = gr; g.strokeStyle = dark; g.lineWidth = Math.max(0.8, r * 0.035);
          g.beginPath(); g.ellipse(px, py, rr * 0.4, rr * 0.28, a, 0, TAU); g.fill(); g.stroke();
        }
      }
      g.fillStyle = "#5d8a3a"; g.beginPath(); g.arc(x, y, r * 0.12, 0, TAU); g.fill();
    }

    // blue / violet hydrangea: a cluster of little four-petal florets
    function hydrangea(g, x, y, R, rnd, violet) {
      for (let i = 0; i < 30; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.85;
        const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d, fr = R * (0.16 + 0.06 * rnd());
        const l = 150 + Math.floor(rnd() * 70);
        g.fillStyle = violet ? `rgb(${l - 20}, ${l - 60}, 255)` : `rgb(${l - 80}, ${l - 30}, 255)`;
        g.strokeStyle = "rgba(22, 30, 96, 0.7)"; g.lineWidth = 0.8;
        for (let p = 0; p < 4; p++) {
          const pa = p * TAU / 4 + a;
          g.beginPath(); g.arc(fx + Math.cos(pa) * fr * 0.55, fy + Math.sin(pa) * fr * 0.55, fr * 0.55, 0, TAU);
          g.fill(); g.stroke();
        }
        g.fillStyle = "#eef2ff"; g.beginPath(); g.arc(fx, fy, fr * 0.22, 0, TAU); g.fill();
      }
    }

    function daisy(g, x, y, r, rnd) {
      const turn = rnd() * TAU;
      g.fillStyle = "#fbf7ee"; g.strokeStyle = "#a39a88"; g.lineWidth = 0.8;
      for (let i = 0; i < 10; i++) {
        const a = turn + i * TAU / 10;
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.48, r * 0.2, a, 0, TAU);
        g.fill(); g.stroke();
      }
      g.fillStyle = "#f0a54a"; g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
    }

    function leaf(g, x, y, len, ang, wid) {
      g.save(); g.translate(x, y); g.rotate(ang);
      const gr = g.createLinearGradient(0, -wid, 0, wid);
      gr.addColorStop(0, "#9ad883"); gr.addColorStop(1, "#2a6a33");
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
      g.strokeStyle = "rgba(18, 56, 24, 0.8)"; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(2, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    }

    function stem(g, x0, y0, x1, y1, w) {
      g.strokeStyle = "#3d8644"; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, y0 - (y0 - y1) * 0.55, x1, y1); g.stroke();
    }

    // the thin thread of light from the top (letters falling in a line)
    function thread(g, x, y0, y1, rnd) {
      for (let y = y0; y < y1; y++) {
        if (rnd() < 0.18) continue;
        const a = 0.45 + 0.55 * rnd();
        g.fillStyle = `rgba(${150 + (rnd() * 60) | 0}, ${190 + (rnd() * 50) | 0}, 255, ${a})`;
        g.fillRect(x - 1.5 + (rnd() - 0.5) * 1.5, y, 3, 1);
      }
    }

    // a bouquet: flowers packed in a dome, stems from the vase's mouth, leaves around the edge
    function bouquet(g, o, rnd) {
      const { cx, cy, rx, ry, count, mix, size, mouth } = o;
      const pick = () => {
        let u = rnd();
        for (const [kind, p] of mix) { if (u < p) return kind; u -= p; }
        return "rose";
      };
      const flowers = [];
      for (let tries = 0; tries < 900 && flowers.length < count; tries++) {
        const kind = pick();
        const base = size[0] + (size[1] - size[0]) * rnd();
        const r = kind === "daisy" ? base * 0.72 : kind === "hyd" ? base * 1.08 : base;
        const a = rnd() * TAU, d = Math.sqrt(rnd());
        const x = cx + Math.cos(a) * d * rx, y = cy + Math.sin(a) * d * ry;
        if (y > cy + ry * 0.7) continue;
        if (flowers.some((f) => Math.hypot(f.x - x, f.y - y) < (f.r + r) * 0.62)) continue;
        flowers.push({ kind, x, y, r });
      }
      for (const f of flowers) stem(g, mouth[0] + (f.x - mouth[0]) * 0.12, mouth[1] + 6, f.x, f.y, Math.max(2.5, f.r * 0.12));
      const nl = o.leaves || 10;
      for (let i = 0; i < nl; i++) {
        const a = Math.PI * (0.92 + 1.16 * i / (nl - 1)) + (rnd() - 0.5) * 0.2;
        const len = size[1] * (1.7 + rnd() * 0.6);
        leaf(g, cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.82 + ry * 0.25, len, a + (rnd() - 0.5) * 0.4, len * 0.27);
      }
      for (let i = 0; i < count * 3; i++) {       // greenery packed in between, so no gaps show
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.92;
        const len = size[1] * (1.1 + rnd() * 0.6);
        leaf(g, cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry * 0.9, len, rnd() * TAU, len * 0.3);
      }
      flowers.sort((p, q) => p.y - q.y);
      for (const f of flowers) {
        if (f.kind === "rose") rose(g, f.x, f.y, f.r, rnd() < 0.15 ? CREAM : ROSES[(rnd() * ROSES.length) | 0], rnd);
        else if (f.kind === "pom") pom(g, f.x, f.y, f.r, ROSES[(rnd() * ROSES.length) | 0], rnd);
        else if (f.kind === "hyd") hydrangea(g, f.x, f.y, f.r, rnd, rnd() < 0.35);
        else daisy(g, f.x, f.y, f.r, rnd);
      }
      for (let i = 0; i < (o.dots || 40); i++) {   // baby's breath and amber buds around the edge
        const a = Math.PI * (0.9 + 1.2 * rnd()), d = 0.95 + rnd() * 0.22;
        g.fillStyle = rnd() < 0.8 ? "#fbf7ee" : "#f0a54a";
        g.beginPath(); g.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1.5 + rnd() * 1.6, 0, TAU); g.fill();
      }
    }

    // soft light from the top left over everything painted so far
    function light(g, x, y, r) {
      g.globalCompositeOperation = "source-atop";
      const sh = g.createRadialGradient(x, y, 10, x + 30, y + 40, r);
      sh.addColorStop(0, "rgba(255, 255, 255, 0.14)"); sh.addColorStop(1, "rgba(0, 0, 0, 0.42)");
      g.fillStyle = sh; g.fillRect(0, 0, SW, SH);
      g.globalCompositeOperation = "source-over";
    }

    // ---------------------------------------------------------------- vases
    const glass = (g, x0, x1, stops) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      stops.forEach(([p, c]) => gr.addColorStop(p, c));
      return gr;
    };

    function budVase(g, cx, top, bottom) {          // tall, slim, flaring at the foot
      g.beginPath();
      g.moveTo(cx - 9, top); g.lineTo(cx + 9, top);
      g.bezierCurveTo(cx + 7, top + 60, cx + 8, bottom - 70, cx + 24, bottom - 8);
      g.quadraticCurveTo(cx + 26, bottom, cx + 18, bottom); g.lineTo(cx - 18, bottom);
      g.quadraticCurveTo(cx - 26, bottom, cx - 24, bottom - 8);
      g.bezierCurveTo(cx - 8, bottom - 70, cx - 7, top + 60, cx - 9, top);
      g.closePath();
      g.globalAlpha = 0.82;
      g.fillStyle = glass(g, cx - 26, cx + 26, [[0, "#173a8c"], [0.35, "#4f7fe0"], [0.5, "#b4ccff"], [0.7, "#3a64c6"], [1, "#10266a"]]);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = "#a9c2ff"; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = "#cfe0ff"; g.beginPath(); g.ellipse(cx, top, 9, 2.5, 0, 0, TAU); g.fill();
    }

    function roundPot(g, cx, cy, r) {               // a round pot with amber rings
      g.save();
      g.beginPath(); g.ellipse(cx, cy, r, r * 0.92, 0, 0, TAU); g.closePath();
      const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.3, 4, cx, cy, r * 1.1);
      body.addColorStop(0, "#5a4bb0"); body.addColorStop(0.55, "#2a2470"); body.addColorStop(1, "#0f0d33");
      g.fillStyle = body; g.fill(); g.clip();
      g.strokeStyle = "#e08a1e"; g.lineWidth = 4;
      for (const dy of [-0.62, -0.18, 0.3]) { g.beginPath(); g.ellipse(cx, cy + dy * r, r * 1.05, r * 0.2, 0, 0, Math.PI); g.stroke(); }
      g.strokeStyle = "#f4d6b0"; g.lineWidth = 1.5;
      for (const dy of [-0.4, 0.06]) { g.beginPath(); g.ellipse(cx, cy + dy * r, r * 1.05, r * 0.2, 0, 0, Math.PI); g.stroke(); }
      g.fillStyle = "rgba(255, 255, 255, 0.28)"; g.beginPath(); g.ellipse(cx - r * 0.5, cy - r * 0.1, r * 0.1, r * 0.4, 0.2, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = "#f0a54a"; g.lineWidth = 4;
      g.beginPath(); g.ellipse(cx, cy - r * 0.86, r * 0.5, r * 0.1, 0, 0, TAU); g.stroke();
    }

    function pitcher(g, cx, top, bottom) {          // a blue-violet pitcher with a handle
      const h = bottom - top;
      g.strokeStyle = "#e08a1e"; g.lineWidth = 7; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx + 40, top + h * 0.16); g.bezierCurveTo(cx + 92, top + h * 0.1, cx + 92, top + h * 0.62, cx + 48, top + h * 0.7); g.stroke();
      g.beginPath();
      g.moveTo(cx - 52, top - 6); g.quadraticCurveTo(cx, top + 6, cx + 44, top);
      g.bezierCurveTo(cx + 42, top + h * 0.2, cx + 64, top + h * 0.45, cx + 58, top + h * 0.75);
      g.quadraticCurveTo(cx + 54, bottom, cx + 36, bottom); g.lineTo(cx - 36, bottom);
      g.quadraticCurveTo(cx - 54, bottom, cx - 58, top + h * 0.75);
      g.bezierCurveTo(cx - 64, top + h * 0.45, cx - 40, top + h * 0.2, cx - 52, top - 6);
      g.closePath();
      g.fillStyle = glass(g, cx - 64, cx + 64, [[0, "#1d1a5e"], [0.3, "#4b4fc4"], [0.45, "#8f97f5"], [0.7, "#3b3fa8"], [1, "#141247"]]);
      g.fill();
      g.save(); g.clip();
      g.fillStyle = "#f4d6b0"; g.fillRect(cx - 70, top + h * 0.33, 140, 3);
      g.fillStyle = "#e08a1e"; g.fillRect(cx - 70, top + h * 0.38, 140, 5);
      g.fillStyle = "rgba(255, 255, 255, 0.3)"; g.beginPath(); g.ellipse(cx - 30, top + h * 0.6, 6, h * 0.22, 0.1, 0, TAU); g.fill();
      g.restore();
    }

    function stripedVase(g, cx, top, bottom) {      // wide at the top, narrowing down, with light stripes
      g.save();
      g.beginPath();
      g.moveTo(cx - 60, top); g.lineTo(cx + 60, top);
      g.bezierCurveTo(cx + 58, top + 40, cx + 44, bottom - 40, cx + 36, bottom);
      g.lineTo(cx - 36, bottom);
      g.bezierCurveTo(cx - 44, bottom - 40, cx - 58, top + 40, cx - 60, top);
      g.closePath();
      g.fillStyle = glass(g, cx - 60, cx + 60, [[0, "#122a6e"], [0.35, "#3f6ad6"], [0.5, "#86a8f5"], [0.75, "#2f53b8"], [1, "#0d1d55"]]);
      g.fill(); g.clip();
      for (let y = top + 6; y < bottom; y += 9) { g.fillStyle = "rgba(235, 242, 255, 0.55)"; g.fillRect(cx - 70, y, 140, 3); }
      g.restore();
      g.fillStyle = "#0a1236"; g.beginPath(); g.ellipse(cx, top, 60, 6, 0, 0, TAU); g.fill();
      g.strokeStyle = "#9bb3ff"; g.lineWidth = 2; g.stroke();
    }

    function classicVase(g, cx, top, bottom) {      // cobalt, with a shoulder and an amber band
      const s = (bottom - top) / 140;
      g.save();
      g.beginPath();
      g.moveTo(cx - 26 * s, top); g.quadraticCurveTo(cx, top - 6 * s, cx + 26 * s, top);
      g.lineTo(cx + 20 * s, top + 12 * s);
      g.bezierCurveTo(cx + 20 * s, top + 32 * s, cx + 66 * s, top + 46 * s, cx + 64 * s, top + 82 * s);
      g.bezierCurveTo(cx + 62 * s, top + 114 * s, cx + 36 * s, top + 130 * s, cx + 32 * s, bottom);
      g.lineTo(cx - 32 * s, bottom);
      g.bezierCurveTo(cx - 36 * s, top + 130 * s, cx - 62 * s, top + 114 * s, cx - 64 * s, top + 82 * s);
      g.bezierCurveTo(cx - 66 * s, top + 46 * s, cx - 20 * s, top + 32 * s, cx - 20 * s, top + 12 * s);
      g.closePath();
      g.fillStyle = glass(g, cx - 66 * s, cx + 66 * s, [[0, "#131f55"], [0.3, "#3a5bc4"], [0.45, "#7896f2"], [0.7, "#2b47a6"], [1, "#0d1644"]]);
      g.fill(); g.clip();
      g.fillStyle = "#e08a1e"; g.fillRect(cx - 80 * s, top + 56 * s, 160 * s, 7 * s);
      g.fillStyle = "#f4d6b0"; g.fillRect(cx - 80 * s, top + 100 * s, 160 * s, 3 * s);
      g.fillStyle = "rgba(255, 255, 255, 0.3)"; g.beginPath(); g.ellipse(cx - 38 * s, top + 74 * s, 6 * s, 30 * s, 0.12, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = "#0a1236"; g.beginPath(); g.ellipse(cx, top, 25 * s, 5 * s, 0, 0, TAU); g.fill();
      g.strokeStyle = "#9bb3ff"; g.lineWidth = 2; g.stroke();
    }

    // ---------------------------------------------------------------- the six scenes
    const POM = [["pom", 1]];
    const SCENES = [
      (g, rnd) => {                                 // one round flower on a long stem, a thread above it
        thread(g, 150, 0, 206, rnd);
        stem(g, 150, 400, 150, 250, 5);
        leaf(g, 150, 330, 34, -2.6, 9); leaf(g, 152, 350, 30, -0.5, 8);
        pom(g, 150, 240, 36, ROSES[1], rnd);
        light(g, 120, 200, 200);
      },
      (g, rnd) => {                                 // a dome of flowers in a tall slim vase
        thread(g, 150, 0, 120, rnd);
        bouquet(g, { cx: 150, cy: 168, rx: 74, ry: 46, count: 12, size: [14, 19], mouth: [150, 228], leaves: 8, dots: 28,
          mix: [["rose", 0.45], ["pom", 0.2], ["daisy", 0.2], ["hyd", 0.15]] }, rnd);
        light(g, 120, 130, 220);
        budVase(g, 150, 224, 398);
      },
      (g, rnd) => {                                 // a round pot with amber rings
        bouquet(g, { cx: 150, cy: 176, rx: 98, ry: 60, count: 15, size: [16, 22], mouth: [150, 264],
          mix: [["rose", 0.45], ["pom", 0.15], ["daisy", 0.15], ["hyd", 0.25]] }, rnd);
        light(g, 120, 130, 240);
        roundPot(g, 150, 326, 64);
      },
      (g, rnd) => {                                 // fuller, with more blue, in a pitcher
        bouquet(g, { cx: 150, cy: 162, rx: 112, ry: 72, count: 17, size: [17, 24], mouth: [150, 250],
          mix: [["rose", 0.4], ["pom", 0.1], ["daisy", 0.15], ["hyd", 0.35]] }, rnd);
        light(g, 115, 115, 250);
        pitcher(g, 150, 250, 394);
      },
      (g, rnd) => {                                 // wide, in a striped vase
        bouquet(g, { cx: 150, cy: 152, rx: 122, ry: 80, count: 18, size: [18, 26], mouth: [150, 240], leaves: 12,
          mix: [["rose", 0.45], ["pom", 0.1], ["daisy", 0.1], ["hyd", 0.35]] }, rnd);
        light(g, 115, 110, 260);
        stripedVase(g, 150, 238, 398);
      },
      (g, rnd) => {                                 // close up: big roses, hydrangeas, leaves, the blue vase
        bouquet(g, { cx: 150, cy: 168, rx: 124, ry: 98, count: 20, size: [24, 31], mouth: [150, 300], leaves: 12, dots: 50,
          mix: [["rose", 0.55], ["hyd", 0.35], ["daisy", 0.1]] }, rnd);
        light(g, 110, 100, 280);
        classicVase(g, 150, 298, 440);
      },
    ];

    // paint a scene, then read it back as letters (the same recipe as the video's converter:
    // a long ramp by brightness, - \ | / where there's a strong edge, brightened colours)
    function bake(n) {
      const cv = canvasOf(SW, SH);
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.lineCap = "round"; g.lineJoin = "round";
      SCENES[n](g, mulberry32(101 + n * 7));
      const d = g.getImageData(0, 0, SW, SH).data, N = SW * SH;
      const lum = new Float32Array(N);
      for (let i = 0; i < N; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255 * (d[i * 4 + 3] / 255);
      const gi = new Uint8Array(N), fg = new Uint32Array(N);
      const nr = RAMP_IDX.length;
      for (let y = 1; y < SH - 1; y++) {
        for (let x = 1; x < SW - 1; x++) {
          const i = y * SW + x;
          if (d[i * 4 + 3] < 90) continue;
          const L = Math.pow(lum[i], 0.8);
          const a = lum[i - SW - 1], b = lum[i - SW], c = lum[i - SW + 1], l = lum[i - 1], r = lum[i + 1];
          const e = lum[i + SW - 1], f = lum[i + SW], h = lum[i + SW + 1];
          const gx = (c + 2 * r + h) - (a + 2 * l + e), gy = (e + 2 * f + h) - (a + 2 * b + c);
          const mag = Math.hypot(gx, gy) / 4;
          let ci;
          if (mag > 0.11 && L > 0.12) {
            const ang = ((Math.atan2(gy, gx) * 180 / Math.PI) + 90 + 360) % 180;
            ci = EDGE_IDX[Math.floor(((ang + 22.5) % 180) / 45)];
          } else {
            const k = Math.round(L * (nr - 1));
            if (k < 1) continue;
            ci = RAMP_IDX[Math.min(nr - 1, k)];
          }
          const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2], v = Math.max(R, G, B, 1);
          const k2 = 255 / v * 0.6 + 0.4;
          fg[i] = (Math.min(255, B * k2) << 16) | (Math.min(255, G * k2) << 8) | Math.min(255, R * k2);
          gi[i] = ci;
        }
      }
      return { n, gi, fg };
    }

    const rampPos = new Int16Array(CHARS.length).fill(-1);
    RAMP_IDX.forEach((ci, p) => { rampPos[ci] = p; });
    return { SW, SH, CHARS, RAMP_IDX, rampPos, count: SCENES.length, bake };
  }

  const P = makePainter();
  const { SW, SH, CHARS, RAMP_IDX } = P;

  // ------------------------------------------------------------------ the scenes, as they arrive
  // how each one moves: how long it stays, the camera's zoom from start to end, how high it
  // looks (picture y at the middle), and the y of the vase's mouth (stems above it sway)
  const PLAN = [
    { dur: 2.8, z0: 0.9, z1: 1.04, fy: 205, mouth: 400 },
    { dur: 2.9, z0: 0.94, z1: 1.05, fy: 205, mouth: 228 },
    { dur: 2.9, z0: 0.95, z1: 1.06, fy: 210, mouth: 264 },
    { dur: 2.9, z0: 0.96, z1: 1.07, fy: 205, mouth: 250 },
    { dur: 2.9, z0: 0.98, z1: 1.08, fy: 200, mouth: 240 },
    { dur: Infinity, z0: 1.0, z1: 1.1, fy: 200, mouth: 300 },
  ];
  const FADE = 0.7;                       // each scene dissolves into the next this long
  const scenes = new Array(P.count).fill(null);
  let wanted = false;

  function prepare() {                    // paint the scenes once, in a worker if possible
    if (wanted) return;
    wanted = true;
    let worker = null;
    try {
      if (typeof OffscreenCanvas !== "undefined" && window.Worker) {
        const src = `const P = (${makePainter.toString()})();
          let ok = true;
          try { new OffscreenCanvas(1, 1).getContext("2d").getImageData(0, 0, 1, 1); } catch (e) { ok = false; postMessage({ fail: true }); }
          if (ok) for (let n = 0; n < P.count; n++) { const s = P.bake(n); postMessage(s, [s.gi.buffer, s.fg.buffer]); }`;
        const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
        worker = new Worker(url);
        worker.onmessage = (e) => {
          URL.revokeObjectURL(url);
          if (e.data.fail) { worker.terminate(); mainThread(); return; }
          scenes[e.data.n] = e.data;
          if (e.data.n === P.count - 1) worker.terminate();
        };
        worker.onerror = () => { worker.terminate(); mainThread(); };
        return;
      }
    } catch (e) { if (worker) worker.terminate(); }
    mainThread();
  }
  function mainThread() {                 // no worker: one scene at a time, between frames
    let n = 0;
    const next = () => {
      while (n < P.count && scenes[n]) n++;
      if (n >= P.count) return;
      scenes[n] = P.bake(n);
      setTimeout(next, 60);
    };
    next();
  }

  // ------------------------------------------------------------------ the grid
  let cols = 0, rows = 0, gw = 6, gh = 11;
  let IDX = new Uint8Array(0), FG = new Uint32Array(0), PIDX = new Uint8Array(0), PFG = new Uint32Array(0);
  let HASH = new Float32Array(0);         // each cell's own moment in a dissolve
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

  // as big as the space above the note allows, in the pictures' 3:4 shape
  function layout() {
    const fw = frame.clientWidth, fh = frame.clientHeight;
    const h = Math.max(160, Math.min(fh, fw * 4 / 3)), w = h * 3 / 4;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.min(dpr, 2.5, Math.sqrt(7e5 / (w * h))));   // keep the pixel count sane
    const targetRows = clamp(Math.round(h / 4.4), 60, 130);
    buildAtlas(Math.max(4, Math.round(h * k / targetRows / 1.12)));
    cols = Math.max(20, Math.floor(w * k / gw)); rows = Math.max(20, Math.floor(h * k / gh));
    canvas.width = cols * gw; canvas.height = rows * gh;
    canvas.style.width = `${(cols * gw) / k}px`; canvas.style.height = `${(rows * gh) / k}px`;
    const n = cols * rows;
    IDX = new Uint8Array(n); FG = new Uint32Array(n);
    PIDX = new Uint8Array(n).fill(255); PFG = new Uint32Array(n);   // 255: draw every cell once
    HASH = new Float32Array(n);
    for (let i = 0; i < n; i++) HASH[i] = (Math.imul(i ^ 0x5bd1e995, 2654435761) >>> 0) / 4294967296 * 0.85;
    image = ctx.createImageData(canvas.width, canvas.height);
    image32 = new Uint32Array(image.data.buffer);
  }

  let sparkle = 12345;                    // a cheap random generator, no garbage
  const rand = () => { sparkle = (Math.imul(sparkle, 1664525) + 1013904223) | 0; return sparkle >>> 0; };

  // draw scene `a` (at its own time ta), dissolving into scene `b` (at time tb) by `mix`
  const camA = { s: 0, fy: 0, x0: 0, step: 0 }, camB = { s: 0, fy: 0, x0: 0, step: 0 };
  function camera(cam, n, tl) {
    const W = canvas.width, H = canvas.height, p = PLAN[n];
    const span = Number.isFinite(p.dur) ? p.dur : 4.5;
    const z = p.z0 + (p.z1 - p.z0) * ease(tl / span);
    cam.s = Math.min(W / SW, H / SH) * z;
    cam.fy = p.fy - (H / 2) / cam.s;
    cam.x0 = SW / 2 - (W / 2) / cam.s;
    cam.step = gw / cam.s;
  }
  function render(a, ta, b, tb, mix, t) {
    IDX.fill(0);
    const sa = a >= 0 ? scenes[a] : null, sb = b >= 0 ? scenes[b] : null;
    if (sa) camera(camA, a, ta);
    if (sb) camera(camB, b, tb);
    const sway = reduce ? 0 : 3.2 * Math.sin(t * 0.8) + 1.1 * Math.sin(t * 1.37 + 1);
    const rp = P.rampPos, last = RAMP_IDX.length - 1;
    for (let r = 0; r < rows; r++) {
      for (let pass = 0; pass < 2; pass++) {
        const sc = pass ? sb : sa;
        if (!sc) continue;
        const cam = pass ? camB : camA, n = pass ? b : a;
        const sy = cam.fy + (r + 0.5) * gh / cam.s;
        if (sy < 0 || sy >= SH) continue;
        const up = clamp((PLAN[n].mouth - sy) / 220, 0, 1);
        const dx = sway * up * Math.sqrt(up);               // stems rock, the vase stays put
        const rowBase = (sy | 0) * SW, gi = sc.gi, fg = sc.fg;
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c;
          if ((HASH[k] < mix) !== (pass === 1)) continue;  // in a dissolve, each cell shows one of the two
          const sx = cam.x0 + (c + 0.5) * cam.step - dx;
          if (sx < 0 || sx >= SW) continue;
          const i = rowBase + (sx | 0);
          let ci = gi[i];
          if (!ci) continue;
          const pos = rp[ci];
          if (pos > 0) {                                    // ~3% of letters flicker a step, like video noise
            const rv = rand();
            if (rv < 128849019) ci = RAMP_IDX[clamp(pos + ((rv >>> 8) % 3) - 1, 1, last)];
          }
          IDX[k] = ci; FG[k] = fg[i];
        }
      }
    }
    compose();
  }

  // only the letters that changed since the last frame are redrawn, and only the rows
  // they're in are sent to the canvas. Each letter sits on a dim block of its own colour.
  function compose() {
    const W = canvas.width, px = image32, gsz = gw * gh;
    let top = rows, bottom = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c, ci = IDX[k], col = FG[k];
        if (ci === PIDX[k] && col === PFG[k]) continue;
        PIDX[k] = ci; PFG[k] = col;
        if (r < top) top = r;
        bottom = r;
        let p = r * gh * W + c * gw;
        if (ci === 0) {                                     // empty: clear the cell
          for (let y = 0; y < gh; y++, p += W) px.fill(0, p, p + gw);
          continue;
        }
        const R = col & 255, G = (col >>> 8) & 255, B = (col >>> 16) & 255;
        const bR = (R * 0.17) | 0, bG = (G * 0.17) | 0, bB = (B * 0.17) | 0;
        const dR = R - bR, dG = G - bG, dB = B - bB;
        let a = ci * gsz;
        for (let y = 0; y < gh; y++, p += W - gw) {
          for (let x = 0; x < gw; x++, p++, a++) {
            const w = atlas[a];
            px[p] = 0xff000000 | ((bB + ((dB * w) >> 8)) << 16) | ((bG + ((dG * w) >> 8)) << 8) | (bR + ((dR * w) >> 8));
          }
        }
      }
    }
    if (bottom >= 0) ctx.putImageData(image, 0, 0, 0, top * gh, W, (bottom - top + 1) * gh);
  }

  // ------------------------------------------------------------------ running it
  // the timeline: scene `cur` has been showing for `local` seconds; it starts dissolving into
  // the next FADE seconds before its end (if the next one is painted by then: if not, it waits)
  let raf = 0, running = false, cur = -1, local = 0, t = 0, last = 0, lastDraw = 0;
  function frameNow(dt) {
    t += dt;
    if (cur < 0) {                                          // the first scene fades in from nothing
      if (!scenes[0]) return;
      local += dt;
      if (local >= FADE) cur = 0;                          // (its time keeps counting from here)
      else { render(-1, 0, 0, local, local / FADE, t); return; }
    }
    const p = PLAN[cur], fadeAt = p.dur - FADE;
    const nextReady = cur + 1 < P.count && scenes[cur + 1];
    local = nextReady ? local + dt : Math.min(local + dt, Math.max(local, fadeAt - 0.001));
    if (local >= p.dur) { cur++; local -= p.dur; }
    const q = PLAN[cur];
    if (local > q.dur - FADE) render(cur, local, cur + 1, local - (q.dur - FADE), (local - (q.dur - FADE)) / FADE, t);
    else render(cur, local, -1, 0, 0, t);
  }
  const settled = () => cur === P.count - 1 && local > 5;
  function tick(now) {
    raf = 0;
    if (!running) return;
    const dt = clamp((now - last) / 1000, 0, 0.1);         // no jump after a tab switch
    last = now;
    if (!settled() || now - lastDraw >= 78) {              // full speed while it changes, then ~12 frames a second
      frameNow(settled() ? Math.min(0.2, (now - lastDraw) / 1000) : dt);
      lastDraw = now;
    }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    cur = -1; local = 0; t = 0; last = performance.now(); lastDraw = last;
    if (reduce) { stillLast(); return; }
    running = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function stillLast() {                  // reduced motion: just the last bouquet, when it's ready
    if (!shown) return;
    const n = P.count - 1;
    if (!scenes[n]) { setTimeout(stillLast, 100); return; }
    cur = n; local = 6;
    render(n, local, -1, 0, 0, 0);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function redraw() {                     // after a resize: the current moment again
    if (cur < 0) return;
    const q = PLAN[cur];
    if (local > q.dur - FADE) render(cur, local, cur + 1, local - (q.dur - FADE), (local - (q.dur - FADE)) / FADE, t);
    else render(cur, local, -1, 0, 0, t);
  }

  let shown = false, cameFromHome = false, hideTimer = 0, resizeTimer = 0;
  function show() {
    clearTimeout(hideTimer);
    prepare();
    const wasShown = shown;
    shown = true;
    box.hidden = false;
    layout();
    if (!wasShown) play(); else { redraw(); if (!running && !reduce) { running = true; last = performance.now(); raf = raf || requestAnimationFrame(tick); } }
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

  againBtn.addEventListener("click", () => { if (shown) play(); });
  homeBtn.addEventListener("click", () => {
    if (cameFromHome) { history.back(); return; }      // popstate -> route()
    history.pushState(null, "", homeUrl());
    route();
  });
  window.addEventListener("popstate", route);
  window.addEventListener("resize", () => {
    if (!shown) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); redraw(); }, 120);
  });
  if (onPage()) show();                  // a link straight to the vase
})();
