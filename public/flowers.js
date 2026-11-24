/*
 * Flowers For Her - web version.
 *
 * A calico cat walks in, says the name in a comic speech bubble and walks
 * away; then a 3D bouquet of lilies grows and blooms. Everything is drawn as
 * coloured ASCII characters on a <canvas>.
 *
 * URL options:  ?say=Asmaa!   ?message=For%20you   ?intro=0   ?tint=0.45   ?seed=7   ?music=0   ?yt=VIDEO_ID
 * Music: "Heartbeat" (invisible YouTube player) starts together with the flowers (volume: top right).
 * Keys: Space = pause, R = restart. The "Re-bloom" button regrows the flowers.
 */
"use strict";

(() => {
  const TAU = Math.PI * 2;
  const params = new URLSearchParams(location.search);
  const SAY = params.has("say") ? params.get("say") : "Asmaa!";
  const MESSAGE = params.get("message") || "";
  const INTRO = SAY !== "" && params.get("intro") !== "0";
  const TINT = Math.min(1, Math.max(0, parseFloat(params.get("tint") || "0.45")));
  const SEED = parseInt(params.get("seed") || "7", 10) || 7;

  // ------------------------------------------------------------------ chars
  const RAMP = ".:-=+*#%@";
  const STAR_CHARS = ".'+*";
  const CHARS = [" "];
  const charIndex = (ch) => {
    let i = CHARS.indexOf(ch);
    if (i < 0) { CHARS.push(ch); i = CHARS.length - 1; }
    return i;
  };
  const RAMP_IDX = Array.from(RAMP, charIndex);
  Array.from("-=.oO" + MESSAGE, charIndex);   // dust, speed lines, message: known before the first frame
  const STAR_IDX = Array.from(STAR_CHARS, charIndex);
  for (const ch of SAY + MESSAGE + "-#@") charIndex(ch);

  // ---------------------------------------------------------------- helpers
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smoothstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1e-9; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // ---------------------------------------------------------------- palette
  // lily colours: petal middle, petal edge, throat, speckles
  const PALETTE = [
    [[236, 64, 140], [255, 228, 240], [236, 240, 160], [130, 15, 60]],    // stargazer pink
    [[252, 252, 250], [255, 255, 255], [214, 238, 150], [205, 110, 140]], // white
    [[250, 150, 196], [255, 232, 244], [246, 240, 175], [185, 55, 110]],  // soft pink
    [[252, 168, 118], [255, 226, 196], [250, 225, 140], [165, 65, 35]],   // peach
    [[250, 214, 84], [255, 244, 176], [240, 232, 120], [170, 90, 30]],    // yellow
    [[244, 98, 122], [255, 200, 212], [250, 222, 150], [140, 25, 45]],    // rose
  ];
  const BUD_GREEN = [140, 190, 100];
  const RIBBON = [245, 120, 170];
  const BLOOM_TIME = 3.5;

  // ================================================================ bouquet
  const NU = 36, NV = 13, NT = 120, NA = 6, NS = 60, NVL = 9;
  const STEM_COS = Float64Array.from({ length: NA }, (_, a) => Math.cos(a * TAU / NA));
  const STEM_SIN = Float64Array.from({ length: NA }, (_, a) => Math.sin(a * TAU / NA));
  const STAMEN_OFF = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                      [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0]];

  function makeBouquet(seed) {
    const rnd = mulberry32(seed * 9973 + 1);
    const U = (a, b) => a + (b - a) * rnd();
    const heads = [
      [0.0, 0.8, 0.72, 0, 1.0], [-0.98, 0.42, 0.66, 2, 1.0], [0.98, 0.48, 0.66, 1, 1.0],
      [-0.5, -0.3, 0.7, 1, 1.0], [0.52, -0.26, 0.7, 0, 1.0], [-1.3, -0.62, 0.58, 3, 1.0],
      [1.3, -0.58, 0.58, 2, 1.0],
      [-0.5, 1.55, 0.36, 5, 0.38], [0.6, 1.5, 0.36, 4, 0.3],          // half-open buds
      [-1.55, 1.05, 0.32, 0, 0.08], [1.55, 1.1, 0.32, 3, 0.08], [0.05, 1.85, 0.3, 2, 0.06],
    ];
    const F = heads.length;
    const b = { F, head0: [], axis0: [], size: [], emax: [], base: [], edge: [], throat: [], speck: [],
                phase: [], petalRot: [], windPhase: [], stemBase: [], stemCol: [] };
    for (const [hx, hy, sz, ci, em] of heads) {
      const bud = em < 0.5 ? 1 : 0;
      const hz = 0.25 - 0.22 * hy + U(-0.05, 0.05);
      b.head0.push([hx, 2.55 + hy, hz]);
      b.axis0.push(norm3([hx * (0.28 + bud * 0.2), hy * 0.3 + 0.2 + bud * 0.7, 1 - bud * 0.55]));
      b.size.push(sz); b.emax.push(em);
      const p = PALETTE[ci];
      b.base.push(p[0]); b.edge.push(p[1]); b.throat.push(p[2]); b.speck.push(p[3]);
      b.petalRot.push(U(0, TAU)); b.windPhase.push(U(0, TAU));
      b.stemBase.push([U(-0.07, 0.07), 0, U(-0.07, 0.07)]);
      const k = U(0.85, 1.15);
      b.stemCol.push([60 * k, 140 * k, 50 * k]);
    }
    // lilies open one after another, from the middle outwards
    const order = heads.map((h, i) => i).sort((i, j) =>
      Math.hypot(heads[i][0], heads[i][1] - 0.3) - Math.hypot(heads[j][0], heads[j][1] - 0.3));
    order.forEach((i, k) => { b.phase[i] = 2.6 + k * 0.45; });

    // petal grids
    b.u = Float32Array.from({ length: NU }, (_, i) => i / (NU - 1));
    b.v = Float32Array.from({ length: NV }, (_, i) => -1 + 2 * i / (NV - 1));
    b.theta = b.u.map((u) => 0.3 * Math.PI + 0.45 * Math.PI * u * u);
    b.cr = new Float32Array(NU); b.cz = new Float32Array(NU);
    let sr = 0, sz = 0;
    for (let i = 0; i < NU; i++) {
      sr += Math.sin(b.theta[i]); sz += Math.cos(b.theta[i]);
      b.cr[i] = sr / (NU - 1); b.cz[i] = sz / (NU - 1);
    }
    // per-row / per-column petal factors that never change (computed once, not per frame)
    b.Rp = Float64Array.from(b.u, (u) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.85))), 0.75));
    b.Wp = Float64Array.from(b.u, (u) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.65))), 0.85));
    b.cth = Float64Array.from(b.theta, (th) => Math.cos(th));
    b.sth = Float64Array.from(b.theta, (th) => Math.sin(th));
    b.cdv = Float64Array.from(b.v, (v) => Math.cos(v * (Math.PI / 6) * 1.04));
    b.sdv = Float64Array.from(b.v, (v) => Math.sin(v * (Math.PI / 6) * 1.04));
    const alt = [1, 0.8, 1, 0.8, 1, 0.8];
    b.wf = alt.map((a) => 1.8 - a);
    b.lf = alt.map((a) => 0.96 + 0.04 * (a - 0.8) / 0.2);
    b.rf = b.lf.slice();
    b.speckMask = new Uint8Array(F * 6 * NU * NV);
    for (let f = 0; f < F; f++) for (let k = 0; k < 6; k++) for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const u = b.u[i], v = b.v[j];
      b.speckMask[((f * 6 + k) * NU + i) * NV + j] = rnd() < 0.09 && u > 0.1 && u < 0.5 && Math.abs(v) < 0.6 ? 1 : 0;
    }
    // petal colours (pale edges, throat) per flower, row and column: also fixed
    b.pcol = new Float64Array(F * NU * NV * 3);
    for (let f = 0; f < F; f++) for (let i = 0; i < NU; i++) {
      const tb = Math.pow(clamp(1 - b.u[i] / 0.32, 0, 1), 1.4);
      for (let j = 0; j < NV; j++) {
        const em = EM[j], q = ((f * NU + i) * NV + j) * 3;
        for (let c = 0; c < 3; c++) b.pcol[q + c] = (b.base[f][c] * (1 - em) + b.edge[f][c] * em) * (1 - tb) + b.throat[f][c] * tb;
      }
    }

    // leaves
    const NL = 16;
    b.leaves = [];
    for (let k = 0; k < NL; k++) {
      const az = k * TAU / NL + U(-0.15, 0.15), ly = U(0.1, 0.7), lr = 0.06 + 0.12 * ly;
      const c = U(0.8, 1.25);
      b.leaves.push({
        anchor: [lr * Math.cos(az), ly, lr * Math.sin(az)], dir: [Math.cos(az), 0, Math.sin(az)],
        len: U(0.8, 1.5), rise: U(0.9, 1.7), w: U(0.07, 0.12), twist: U(-1.2, 1.2),
        col: [45 * c, 130 * c, 50 * c], phase: U(0, TAU),
      });
    }
    return b;
  }

  // how much of the pale edge colour shows at each point across a petal
  const EM = Float32Array.from({ length: NV }, (_, j) =>
    Math.pow(clamp(Math.abs(-1 + 2 * j / (NV - 1)) * 1.15, 0, 1), 1.6) * 0.85);

  // ---- point buffer (positions, normals, colours, fixed brightness, object id)
  const CAP = 90000;
  const PP = new Float32Array(CAP * 3), PN = new Float32Array(CAP * 3), PC = new Float32Array(CAP * 3);
  const PF = new Float32Array(CAP), PID = new Int16Array(CAP);
  let np = 0;
  function add(x, y, z, nx, ny, nz, r, g, bl, fl, id) {
    if (np >= CAP) return;
    const k = np * 3;
    PP[k] = x; PP[k + 1] = y; PP[k + 2] = z;
    PN[k] = nx; PN[k + 1] = ny; PN[k + 2] = nz;
    PC[k] = r; PC[k + 1] = g; PC[k + 2] = bl;
    PF[np] = fl; PID[np] = id; np++;
  }
  // a surface grid in GP/GC (n1 x n2); normals from neighbouring points
  const GP = new Float32Array(2048 * 3), GC = new Float32Array(2048 * 3);
  function emitGrid(n1, n2, fl, id) {
    for (let i = 0; i < n1; i++) {
      const i0 = i > 0 ? i - 1 : i, i1 = i < n1 - 1 ? i + 1 : i;
      for (let j = 0; j < n2; j++) {
        const j0 = j > 0 ? j - 1 : j, j1 = j < n2 - 1 ? j + 1 : j;
        const a = (i1 * n2 + j) * 3, bb = (i0 * n2 + j) * 3, c = (i * n2 + j1) * 3, d = (i * n2 + j0) * 3;
        const ux = GP[a] - GP[bb], uy = GP[a + 1] - GP[bb + 1], uz = GP[a + 2] - GP[bb + 2];
        const vx = GP[c] - GP[d], vy = GP[c + 1] - GP[d + 1], vz = GP[c + 2] - GP[d + 2];
        const k = (i * n2 + j) * 3;
        add(GP[k], GP[k + 1], GP[k + 2], uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx,
            GC[k], GC[k + 1], GC[k + 2], fl, id);
      }
    }
  }

  function bouquetPoints(B, t) {
    np = 0;
    const F = B.F;
    const g = smoothstep(t / 3.0);
    const heads = [], axes = [];

    // ---- stems
    for (let f = 0; f < F; f++) {
      const wp = B.windPhase[f], hy = B.head0[f][1] / 3;
      const wind = [(0.045 * Math.sin(1.1 * t + wp) + 0.015 * Math.sin(2.3 * t + 2 * wp)) * hy,
                    0.012 * Math.sin(1.7 * t + wp) * hy, 0.03 * Math.sin(0.9 * t + 1.7 * wp) * hy];
      const P3 = [B.head0[f][0] + wind[0], B.head0[f][1] + wind[1], B.head0[f][2] + wind[2]];
      const ax = norm3([B.axis0[f][0] + wind[0] * 0.8, B.axis0[f][1] + wind[1] * 0.8, B.axis0[f][2] + wind[2] * 0.8]);
      axes.push(ax);
      const P0 = B.stemBase[f];
      const P2 = [P3[0] - ax[0] * 0.3, P3[1] - ax[1] * 0.3 - 0.7, P3[2] - ax[2] * 0.3];
      const P1 = [0.08 * P3[0] + P0[0] * 0.5, 0.95, 0.08 * P3[2] + P0[2] * 0.5];
      // plain numbers instead of little arrays: this loop runs ~1500 times a frame
      let bx = P0[0], by = P0[1], bz = P0[2];
      const sc = B.stemCol[f];
      for (let j = 0; j < NT; j++) {
        const T = j / (NT - 1) * g, s1 = 1 - T;
        const w0 = s1 * s1 * s1, w1 = 3 * s1 * s1 * T, w2 = 3 * s1 * T * T, w3 = T * T * T;
        const k0 = 3 * s1 * s1, k1 = 6 * s1 * T, k2 = 3 * T * T;
        bx = w0 * P0[0] + w1 * P1[0] + w2 * P2[0] + w3 * P3[0];
        by = w0 * P0[1] + w1 * P1[1] + w2 * P2[1] + w3 * P3[1];
        bz = w0 * P0[2] + w1 * P1[2] + w2 * P2[2] + w3 * P3[2];
        let dx = k0 * (P1[0] - P0[0]) + k1 * (P2[0] - P1[0]) + k2 * (P3[0] - P2[0]);
        let dy = k0 * (P1[1] - P0[1]) + k1 * (P2[1] - P1[1]) + k2 * (P3[1] - P2[1]);
        let dz = k0 * (P1[2] - P0[2]) + k1 * (P2[2] - P1[2]) + k2 * (P3[2] - P2[2]);
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9; dx /= dl; dy /= dl; dz /= dl;
        const nl = Math.sqrt(dy * dy + dx * dx) || 1e-9, nx = dy / nl, ny = -dx / nl;      // normal = (dy, -dx, 0)
        const qx = -dz * ny, qy = dz * nx, qz = dx * ny - dy * nx;                         // binormal = d x n
        const rad = 0.028 - 0.01 * T, cs = 0.7 + 0.4 * T;
        for (let a = 0; a < NA; a++) {
          const ca = STEM_COS[a], sa = STEM_SIN[a];
          const rx = ca * nx + sa * qx, ry = ca * ny + sa * qy, rz = sa * qz;
          add(bx + rad * rx, by + rad * ry, bz + rad * rz, rx, ry, rz, sc[0] * cs, sc[1] * cs, sc[2] * cs, -1, 100 + f);
        }
      }
      heads.push([bx, by, bz]);
    }

    // ---- leaves
    B.leaves.forEach((L, li) => {
      const d = L.dir, side = norm3(cross3(d, [0, 1, 0]));
      const ln = L.len * g, lw = Math.sin(1.2 * t + L.phase);
      for (let i = 0; i < NS; i++) {
        const s = i / (NS - 1);
        const h = ln * (L.rise * s - (L.rise + 0.1) * s * s);
        const w = L.w * g * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(s, 0.6))), 0.8);
        const tw = L.twist * s, ct = Math.cos(tw), st = Math.sin(tw);
        const sway = s * s * ln * lw;
        for (let j = 0; j < NVL; j++) {
          const v = -1 + 2 * j / (NVL - 1);
          const k = (i * NVL + j) * 3;
          const lift = 0.35 * w * v * v;
          GP[k] = L.anchor[0] + d[0] * ln * s + ct * side[0] * v * w + 0.05 * sway;
          GP[k + 1] = L.anchor[1] + h + st * v * w + lift;
          GP[k + 2] = L.anchor[2] + d[2] * ln * s + ct * side[2] * v * w + 0.03 * sway;
          const m = Math.abs(v) < 0.12 ? 1.3 : 0.9 + 0.2 * (1 - Math.abs(v));
          GC[k] = L.col[0] * m; GC[k + 1] = L.col[1] * m; GC[k + 2] = L.col[2] * m;
        }
      }
      emitGrid(NS, NVL, -1, 200 + li);
    });

    // ---- lily heads
    const hs = smoothstep((g - 0.55) / 0.45);
    if (hs > 0) {
      for (let f = 0; f < F; f++) {
        const ax = axes[f], hd = heads[f];
        const breathe = 1 - 0.035 * (0.5 + 0.5 * Math.sin(1.3 * t + B.windPhase[f]));
        const e = smoothstep((t - B.phase[f]) / BLOOM_TIME) * B.emax[f] * breathe;
        const L = B.size[f] * hs;
        const helper = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const e1 = norm3(cross3(ax, helper)), e2 = cross3(ax, e1);
        const spk = B.speck[f];
        const gmix = (1 - e) * 0.35;
        for (let k = 0; k < 6; k++) {
          const phi = B.petalRot[f] + k * Math.PI / 3, cp = Math.cos(phi), sp = Math.sin(phi);
          const rk = [cp * e1[0] + sp * e2[0], cp * e1[1] + sp * e2[1], cp * e1[2] + sp * e2[2]];
          const tk = [-sp * e1[0] + cp * e2[0], -sp * e1[1] + cp * e2[1], -sp * e1[2] + cp * e2[2]];
          const wf = B.wf[k], lf = B.lf[k], rf = B.rf[k];
          const LR = L * 0.31 * rf, LW = L * 0.25 * wf;
          const g1 = 1 - gmix, bg0 = BUD_GREEN[0] * gmix, bg1 = BUD_GREEN[1] * gmix, bg2 = BUD_GREEN[2] * gmix;
          const sp0 = spk[0] * g1 + bg0, sp1 = spk[1] * g1 + bg1, sp2 = spk[2] * g1 + bg2;
          const mrow = (f * 6 + k) * NU;
          for (let i = 0; i < NU; i++) {
            const u = B.u[i], cth = B.cth[i], sth = B.sth[i];
            const R = LR * B.Rp[i], wdt = LW * B.Wp[i], Cc = L * 1.05 * lf * u;
            const Aoi = L * lf * (0.06 + B.cr[i]), Coi = L * lf * B.cz[i];
            const mi = (mrow + i) * NV, pi = (f * NU + i) * NV;
            for (let j = 0; j < NV; j++) {
              const v = B.v[j];
              const Ac = R * B.cdv[j], Bc = R * B.sdv[j];
              const gr = 0.3 * wdt * v * v;
              const Ao = Aoi - cth * gr, Bo = v * wdt, Co = Coi + sth * gr;
              const A = Ac + (Ao - Ac) * e, Bb = Bc + (Bo - Bc) * e, C = Cc + (Co - Cc) * e;
              const q = (i * NV + j) * 3;
              GP[q] = hd[0] + A * rk[0] + Bb * tk[0] + C * ax[0];
              GP[q + 1] = hd[1] + A * rk[1] + Bb * tk[1] + C * ax[1];
              GP[q + 2] = hd[2] + A * rk[2] + Bb * tk[2] + C * ax[2];
              if (B.speckMask[mi + j]) { GC[q] = sp0; GC[q + 1] = sp1; GC[q + 2] = sp2; }
              else {
                const pc = (pi + j) * 3;
                GC[q] = B.pcol[pc] * g1 + bg0; GC[q + 1] = B.pcol[pc + 1] * g1 + bg1; GC[q + 2] = B.pcol[pc + 2] * g1 + bg2;
              }
            }
          }
          emitGrid(NU, NV, -1, f);
        }

        // stamens + pistil
        if (e > 0.2) {
          const sz = B.size[f] * hs;
          const Ls = sz * 0.72 * e, Lp = sz * 0.7 * e;
          const OFF = STAMEN_OFF;
          for (let k = 0; k < 6; k++) {
            const ph = B.petalRot[f] + k * Math.PI / 3 + Math.PI / 6, cph = Math.cos(ph), sph = Math.sin(ph);
            const rs0 = cph * e1[0] + sph * e2[0], rs1 = cph * e1[1] + sph * e2[1], rs2 = cph * e1[2] + sph * e2[2];
            let ex = hd[0], ey = hd[1], ez = hd[2];
            for (let i = 0; i < 18; i++) {
              const s = i / 17, a = Ls * 0.8 * s, r = Ls * 0.62 * Math.pow(s, 1.4);
              ex = hd[0] + ax[0] * a + rs0 * r; ey = hd[1] + ax[1] * a + rs1 * r; ez = hd[2] + ax[2] * a + rs2 * r;
              add(ex, ey, ez, 0, 0, 0, 215, 235, 170, 0.85, f);
            }
            for (let o = 0; o < OFF.length; o++) add(ex + OFF[o][0] * 0.032 * sz, ey + OFF[o][1] * 0.032 * sz, ez + OFF[o][2] * 0.032 * sz,
                                                     0, 0, 0, 190, 80, 30, 0.7, f);
          }
          let tx = hd[0], ty = hd[1], tz = hd[2];
          for (let i = 0; i < 18; i++) {
            const s = i / 17;
            tx = hd[0] + ax[0] * Lp * s + e1[0] * 0.08 * Lp * s * s;
            ty = hd[1] + ax[1] * Lp * s + e1[1] * 0.08 * Lp * s * s;
            tz = hd[2] + ax[2] * Lp * s + e1[2] * 0.08 * Lp * s * s;
            add(tx, ty, tz, 0, 0, 0, 200, 225, 140, 0.75, f);
          }
          for (let o = 0; o < 5; o++) add(tx + OFF[o][0] * 0.03 * sz, ty + OFF[o][1] * 0.03 * sz, tz + OFF[o][2] * 0.03 * sz,
                                          0, 0, 0, 120, 155, 60, 0.55, f);
        }
      }
    }

    // ---- ribbon bow
    if (g > 0.3) {
      const k = smoothstep((g - 0.3) / 0.5), rad = 0.15 * k, bc = [0, 1.05, 0];
      for (let a = 0; a < 56; a++) {
        const ca = Math.cos(a * TAU / 56), sa = Math.sin(a * TAU / 56);
        for (let h = 0; h < 6; h++) {
          const hh = (-0.07 + 0.14 * h / 5) * k;
          add(bc[0] + ca * rad, bc[1] + hh, bc[2] + sa * rad, ca, 0, sa, RIBBON[0], RIBBON[1], RIBBON[2], -1, 300);
        }
      }
      const fr = [bc[0], bc[1], bc[2] + rad + 0.06];
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < 48; i++) {
          const la = i * TAU / 47, cl = Math.cos(la), sl = Math.sin(la);
          const tan = norm3([sgn * 0.21 * sl, 0.13 * cl, 0]);
          const side = [tan[1], -tan[0], 0];
          for (let j = 0; j < 8; j++) {
            const ta = j * TAU / 8, ct = Math.cos(ta), st = Math.sin(ta);
            const n = [ct * side[0], ct * side[1], st];
            add(fr[0] + sgn * 0.21 * (1 - cl) * k + 0.045 * k * n[0], fr[1] + 0.13 * sl * k + 0.045 * k * n[1],
                fr[2] + 0.03 + 0.045 * k * n[2], n[0], n[1], n[2], RIBBON[0] * 1.05, RIBBON[1] * 1.05, RIBBON[2] * 1.05, -1, 301);
          }
        }
        for (let i = 0; i < 30; i++) {
          const s2 = i / 29;
          for (let j = 0; j < 5; j++) {
            const w2 = -1 + j / 2, q = (i * 5 + j) * 3;
            GP[q] = fr[0] + sgn * (0.05 + 0.12 * s2) * k + 0.035 * w2 * k;
            GP[q + 1] = fr[1] - 0.42 * s2 * k;
            GP[q + 2] = fr[2] + 0.02 + 0.04 * Math.sin(s2 * 6 + t) * s2;
            GC[q] = RIBBON[0] * 0.95; GC[q + 1] = RIBBON[1] * 0.95; GC[q + 2] = RIBBON[2] * 0.95;
          }
        }
        emitGrid(30, 5, -1, 302);
      }
      for (let i = 0; i < 48; i++) {
        const la = i * TAU / 47;
        for (let j = 0; j < 8; j++) {
          add(fr[0] + 0.04 * Math.cos(la) * k, fr[1] + 0.04 * Math.sin(la) * k, fr[2] + 0.05 + 0.01 * Math.sin(j * TAU / 8),
              0, 0, 0, RIBBON[0] * 1.1, RIBBON[1] * 1.1, RIBBON[2] * 1.1, 0.85, 303);
        }
      }
    }
  }

  // ================================================================ frame grid
  let cols = 0, rows = 0, aspect = 2;
  let IDX = new Int32Array(0), RGB = new Uint8Array(0);
  let ZB = new Float32Array(0), WIN = new Int32Array(0), IG = new Int32Array(0);
  let stars = null;

  function resizeGrid(c, r) {
    cols = c; rows = r;
    IDX = new Int32Array(c * r); RGB = new Uint8Array(c * r * 3);
    ZB = new Float32Array(c * r); WIN = new Int32Array(c * r); IG = new Int32Array(c * r);
    const rnd = mulberry32(3);
    const n = Math.floor(c * r * 0.006);
    const pastel = [[255, 200, 228], [222, 208, 255], [255, 250, 236], [200, 236, 255]];
    stars = Array.from({ length: n }, () => ({
      r: Math.floor(rnd() * r), c: Math.floor(rnd() * c), ph: rnd() * TAU, sp: 0.6 + 1.6 * rnd(),
      col: pastel[Math.floor(rnd() * pastel.length)],
    }));
  }

  const setCell = (k, ci, r, g, b) => {
    IDX[k] = ci; RGB[k * 3] = clamp(r, 0, 255); RGB[k * 3 + 1] = clamp(g, 0, 255); RGB[k * 3 + 2] = clamp(b, 0, 255);
  };

  function drawStars(t) {
    for (const s of stars) {
      const b = 0.12 + 0.88 * Math.pow(0.5 + 0.5 * Math.sin(s.sp * t + s.ph), 3);
      const ci = STAR_IDX[Math.min(STAR_IDX.length - 1, Math.floor(b * STAR_IDX.length))];
      setCell(s.r * cols + s.c, ci, b * s.col[0] * 0.85, b * s.col[1] * 0.85, b * s.col[2] * 0.85);
    }
  }

  const LIGHT = norm3([-0.35, 0.5, 0.8]);
  const HALF = norm3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

  const ZS = new Float32Array(CAP);      // depth of every point (reused every frame)
  let sparkle = 12345;                   // state of the little random generator for the shimmer
  function drawBouquet(B, t) {
    bouquetPoints(B, t);
    const ay = 0.22 * Math.sin(TAU * t / 20), axr = 0.16;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(axr), sx = Math.sin(axr);
    // M = Rx(axr) * Ry(ay)
    const M = [cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy];
    const scale = Math.min(rows / 4.9, cols / (3.9 * aspect));
    ZB.fill(-1e9); WIN.fill(-1);
    for (let i = 0; i < np; i++) {
      const k = i * 3, X = PP[k], Y = PP[k + 1] - 2.2, Z = PP[k + 2];
      const x = M[0] * X + M[1] * Y + M[2] * Z, y = M[3] * X + M[4] * Y + M[5] * Z, z = M[6] * X + M[7] * Y + M[8] * Z;
      const f = 12 / (12 - z);
      const ix = Math.floor(cols / 2 + x * f * scale * aspect), iy = Math.floor(rows / 2 - y * f * scale);
      ZS[i] = z;
      if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) continue;
      const c = iy * cols + ix;
      if (z > ZB[c]) { ZB[c] = z; WIN[c] = i; }
    }
    // ids for outlines
    for (let c = 0; c < cols * rows; c++) IG[c] = WIN[c] >= 0 ? PID[WIN[c]] : -1;
    const nr = RAMP.length;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const c = r * cols + cc, w = WIN[c];
        if (w < 0) continue;
        const k = w * 3;
        let br;
        if (PF[w] >= 0) br = PF[w];
        else {
          const X = PN[k], Y = PN[k + 1], Z = PN[k + 2];
          let nx = M[0] * X + M[1] * Y + M[2] * Z, ny = M[3] * X + M[4] * Y + M[5] * Z, nz = M[6] * X + M[7] * Y + M[8] * Z;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-9; nx /= l; ny /= l; nz /= l;
          const lam = Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const spec = Math.pow(Math.abs(nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 30);
          br = 0.22 + 0.78 * Math.pow(lam, 1.1) + 0.3 * spec;
        }
        br *= 0.78 + 0.22 * clamp((ZS[w] + 2) / 4, 0, 1);
        br = clamp(br, 0, 1);
        sparkle = (Math.imul(sparkle, 1664525) + 1013904223) | 0;      // cheap random, no garbage
        const jitter = (sparkle >>> 0) < 171798692 ? ((sparkle >>> 8) % 3) - 1 : 0;   // ~4% of cells
        let ri = clamp(Math.round(br * (nr - 1)) + jitter, 0, nr - 1);
        let m = 0.55 + 0.75 * br;
        // outline: a different, nearer object right next to this cell
        const z = ZB[c], id = IG[c];
        let q;
        if ((cc + 1 < cols && (q = IG[c + 1]) >= 0 && q !== id && ZB[c + 1] > z + 0.04) ||
            (cc > 0 && (q = IG[c - 1]) >= 0 && q !== id && ZB[c - 1] > z + 0.04) ||
            (r + 1 < rows && (q = IG[c + cols]) >= 0 && q !== id && ZB[c + cols] > z + 0.04) ||
            (r > 0 && (q = IG[c - cols]) >= 0 && q !== id && ZB[c - cols] > z + 0.04)) {
          ri = Math.max(ri - 3, 0); m *= 0.55;
        }
        setCell(c, RAMP_IDX[ri], PC[k] * m, PC[k + 1] * m, PC[k + 2] * m);
      }
    }
  }

  function drawMessage(t) {
    if (!MESSAGE || rows < 5) return;
    const r = rows - 2, c0 = Math.max(0, Math.floor((cols - MESSAGE.length) / 2));
    const pulse = 0.8 + 0.2 * Math.sin(t * 2);
    for (let i = 0; i < MESSAGE.length && c0 + i < cols; i++)
      setCell(r * cols + c0 + i, charIndex(MESSAGE[i]), 255 * pulse, 150 * pulse, 190 * pulse);
  }

  // ================================================================= intro
  const WALK_IN = 4.0, TALK = 3.0, WALK_OUT = 3.2, INTRO_END = WALK_IN + TALK + WALK_OUT;
  const CAL_WHITE = [250, 246, 238], CAL_ORANGE = [242, 150, 60], CAL_BLACK = [74, 64, 70];
  const PINK = [255, 140, 172], EYE_GREEN = [135, 200, 95], EYE = [30, 22, 28], WHITE = [255, 255, 255];
  const MOUTH = [110, 25, 45];

  const ellipse = (cx, cy, rx, ry) => (X, Y) => ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1;
  const capsule = (ax, ay, bx, by, r) => (X, Y) => {
    const dx = bx - ax, dy = by - ay;
    const h = clamp(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1);
    return (X - ax - h * dx) ** 2 + (Y - ay - h * dy) ** 2 <= r * r;
  };
  const triangle = (p0, p1, p2) => (X, Y) => {
    const side = (a, b) => (X - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (Y - b[1]);
    const d1 = side(p0, p1), d2 = side(p1, p2), d3 = side(p2, p0);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const both = (a, b) => (X, Y) => a(X, Y) && b(X, Y);
  const mul = (c, s) => [c[0] * s, c[1] * s, c[2] * s];

  // A chibi calico: big round head, fluffy cheeks, shiny eyes, little bean body.
  // Everything is drawn in cat units (feet on Y = 0, facing right) and squashed,
  // leaned and bobbed by the pose P, so it moves like a cartoon.
  const NECK_X = 0.45, NECK_Y = 0.95;      // the head tilts around this point

  // cat units -> screen cell (for whiskers and the speech bubble)
  function catToScreen(cx, gy, s, P, x, y, inHead) {
    if (inHead) {
      const dx = x - NECK_X, dy = y - NECK_Y, c = Math.cos(P.headTilt), sn = Math.sin(P.headTilt);
      x = NECK_X + dx * c - dy * sn; y = NECK_Y + dx * sn + dy * c + P.headBob;
    }
    y += P.bob;
    x *= P.sqx; y *= P.sqy;
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const X = x * cl - y * sl, Y = x * sl + y * cl;
    return [cx + X * s * aspect, gy - (Y + P.hop) * s];
  }

  // Cat shapes are plain data checked by one function (no wrapped closures), so testing
  // thousands of cells a frame makes no garbage. Each shape lives in a "space":
  // 0 = ground (legs, waving paw), 1 = body (rides the bounce), 2 = head (tilted), 3 = flicking ear.
  const SH_E = 0, SH_C = 1, SH_T = 2, SH_U = 3;      // ellipse, capsule, triangle, union of ellipses
  const shE = (cx, cy, rx, ry) => ({ k: SH_E, a: cx, b: cy, c: rx, d: ry, e: 0, f: 0, list: null });
  const shC = (ax, ay, bx, by, r) => ({ k: SH_C, a: ax, b: ay, c: bx, d: by, e: r, f: 0, list: null });
  const shT = (p0, p1, p2) => ({ k: SH_T, a: p0[0], b: p0[1], c: p1[0], d: p1[1], e: p2[0], f: p2[1], list: null });
  const shU = (...list) => ({ k: SH_U, a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, list });
  let catIdx = new Int16Array(0), catBr = new Float32Array(0);   // reused raster buffers
  // the frame's shapes flattened into number tables, so the per-cell test below is plain
  // arithmetic (no function calls, no objects): that's what keeps it garbage-free
  const FK = new Int8Array(512), FP = new Float64Array(512 * 6);
  const QR = new Int16Array(256), QC = new Int16Array(256), QS = new Int8Array(256), QM = new Float64Array(256);

  function drawCat(cx, gy, s, P) {
    const sx = s * aspect, t = P.t;
    const c0 = Math.max(0, Math.floor(cx - 2.3 * sx)), c1 = Math.min(cols, Math.ceil(cx + 2.4 * sx));
    const r0 = Math.max(0, Math.floor(gy - (3.4 + P.hop) * s)), r1 = Math.min(rows, Math.ceil(gy + 0.3 * s));
    if (c0 >= c1 || r0 >= r1) return;
    const shapes = [];   // painting order; the last shape that covers a cell wins
    let layer = 0;       // parts on a higher layer get an ink line where they overlap lower ones
    const paint = (shape, col, sp, extra) => shapes.push({ shape, col, sp, lay: layer,
      clip: extra && extra.clip || null, minY: extra && extra.minY !== undefined ? extra.minY : -1e9 });
    const bob = P.bob;

    // legs: a diagonal trot, paws lifting in an arc
    const leg = (hx, ph, shade, thigh) => {
      const a = P.walk + ph;
      const sw = P.moving ? Math.sin(a) : 0, lift = P.moving ? Math.max(0, Math.cos(a)) : 0;
      const fx = hx + 0.17 * sw * P.stride, fy = 0.08 + 0.14 * lift * P.stride;
      const limb = shC(hx, 0.46 + bob, fx, fy, 0.11);
      paint(limb, mul(CAL_WHITE, shade), 0);
      if (thigh) paint(limb, mul(thigh, shade), 0, { minY: 0.3 + bob });
      paint(shE(fx + 0.04, fy - 0.005, 0.14, 0.085), mul(CAL_WHITE, shade), 0);
    };
    leg(0.36, Math.PI, 0.72);                     // far front
    leg(-0.5, 0, 0.72, CAL_ORANGE);               // far back
    layer = 1;

    // tail: a striped S that sways in a travelling wave, fluffy tip
    {
      let tx = -0.66, ty = 0.68, px = tx, py = ty;
      const N = 12, segL = 0.1;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const ang = 2.25 - 0.9 * u - 1.3 * u * u * u + P.tailWag * 0.38 * u * Math.sin(t * P.tailSpeed - u * 3.2);
        tx += Math.cos(ang) * segL; ty += Math.sin(ang) * segL;
        const band = u < 0.34 ? CAL_ORANGE : u < 0.58 ? CAL_BLACK : u < 0.8 ? CAL_ORANGE : CAL_BLACK;
        paint(shC(px, py, tx, ty, 0.095 - 0.012 * u), band, 1);
        px = tx; py = ty;
      }
      paint(shE(tx, ty, 0.11, 0.1), CAL_BLACK, 1);
    }

    // body: a little bean with calico patches and a white chest
    layer = 2;
    const body = shU(shE(-0.1, 0.68, 0.7, 0.38), shE(0.32, 0.74, 0.34, 0.34));
    paint(body, CAL_WHITE, 1);
    paint(shE(-0.42, 0.86, 0.42, 0.28), CAL_ORANGE, 1, { clip: body });
    paint(shE(0.0, 1.0, 0.26, 0.15), CAL_BLACK, 1, { clip: body });
    paint(shE(-0.74, 0.62, 0.16, 0.2), CAL_BLACK, 1, { clip: body });
    layer = 3;
    leg(-0.62, Math.PI, 1, CAL_ORANGE);           // near back
    if (P.wave <= 0.02) leg(0.26, 0, 1);          // near front (unless it's waving)
    layer = 4;

    // head (the black ear flicks around its base now and then)
    paint(shT([0.2, 1.74], [0.29, 2.33], [0.68, 1.96]), CAL_ORANGE, 2);
    paint(shT([0.9, 1.96], [1.27, 2.33], [1.37, 1.74]), CAL_BLACK, 3);
    paint(shT([0.3, 1.82], [0.34, 2.18], [0.58, 1.97]), PINK, 2);
    paint(shT([1.0, 1.97], [1.23, 2.18], [1.27, 1.82]), PINK, 3);
    const skull = shU(shE(0.78, 1.45, 0.66, 0.53), shE(0.3, 1.24, 0.25, 0.18), shE(1.26, 1.24, 0.25, 0.18));
    paint(skull, CAL_WHITE, 2);
    paint(shE(0.34, 1.76, 0.42, 0.32), CAL_ORANGE, 2, { clip: skull });
    paint(shE(1.22, 1.82, 0.32, 0.22), CAL_BLACK, 2, { clip: skull });
    paint(shE(0.36, 1.26, 0.12, 0.065), PINK, 2);      // blush
    paint(shE(1.2, 1.26, 0.12, 0.065), PINK, 2);
    paint(shT([0.71, 1.33], [0.85, 1.33], [0.78, 1.26]), PINK, 2);   // nose
    if (P.mouth > 0) {
      paint(shE(0.78, 1.14, 0.1, 0.06 + 0.05 * P.mouth), MOUTH, 2);
      paint(shE(0.78, 1.09, 0.06, 0.03), PINK, 2);                    // tongue
    }

    // the waving paw (in front of everything)
    layer = 5;
    if (P.wave > 0.02) {
      const ang = -1.45 + P.wave * (1.75 + 0.36 * Math.sin(P.wavePh));   // up and out in front, waving
      const sxp = 0.45, syp = 0.66 + bob;
      const px = sxp + 1.1 * Math.cos(ang), py = syp + 1.1 * Math.sin(ang);
      paint(shC(sxp, syp, px, py, 0.105), CAL_WHITE, 0);
      paint(shE(px, py, 0.13, 0.12), CAL_WHITE, 0);
      paint(shE(px + 0.02 * Math.cos(ang), py + 0.06, 0.05, 0.035), PINK, 0);  // toe bean
    }

    // rasterise: each cell -> cat units (undo hop, lean and squash), then into each space
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const hc = Math.cos(P.headTilt), hs = Math.sin(P.headTilt);
    const tw = P.earTwitch * 0.3, ec = Math.cos(tw), es = Math.sin(tw), EPX = 1.14, EPY = 1.86;
    const W = c1 - c0, H = r1 - r0, n = W * H;
    if (catIdx.length < n) { catIdx = new Int16Array(n * 2); catBr = new Float32Array(n * 2); }
    const ns = shapes.length;
    let nf = 0;
    const flat = (o) => {                        // shape object -> record index (union: children follow)
      const i = nf++;
      FK[i] = o.k;
      if (o.k === SH_U) {
        const first = nf;
        for (const ch of o.list) flat(ch);
        FP[i * 6] = first; FP[i * 6 + 1] = o.list.length;
      } else {
        FP[i * 6] = o.a; FP[i * 6 + 1] = o.b; FP[i * 6 + 2] = o.c; FP[i * 6 + 3] = o.d; FP[i * 6 + 4] = o.e; FP[i * 6 + 5] = o.f;
      }
      return i;
    };
    for (let q = 0; q < ns; q++) {
      const it = shapes[q];
      QR[q] = flat(it.shape); QC[q] = it.clip ? flat(it.clip) : -1; QS[q] = it.sp; QM[q] = it.minY;
    }
    for (let r = 0; r < H; r++) {
      const Ys = (gy - (r0 + r + 0.5)) / s - P.hop;
      for (let c = 0; c < W; c++) {
        const Xs = (c0 + c + 0.5 - cx) / sx;
        const X = (Xs * cl + Ys * sl) / P.sqx, Y = (-Xs * sl + Ys * cl) / P.sqy;
        const Yb = Y - bob;
        const hdx = X - NECK_X, hdy = Y - bob - P.headBob - NECK_Y;
        const Xh = NECK_X + hdx * hc + hdy * hs, Yh = NECK_Y - hdx * hs + hdy * hc;
        const edx = Xh - EPX, edy = Yh - EPY;
        const Xe = EPX + edx * ec + edy * es, Ye = EPY - edx * es + edy * ec;
        let best = -1;
        for (let q = 0; q < ns; q++) {
          const sp = QS[q];
          const x = sp === 0 ? X : sp === 1 ? X : sp === 2 ? Xh : Xe;
          const y = sp === 0 ? Y : sp === 1 ? Yb : sp === 2 ? Yh : Ye;
          if (!(y > QM[q])) continue;
          let ok = true;
          for (let pass = 0; pass < 2 && ok; pass++) {        // the shape, then its clip (if any)
            const i = pass === 0 ? QR[q] : QC[q];
            if (i < 0) break;
            let lo = i, hi = i + 1;
            if (FK[i] === SH_U) { lo = FP[i * 6]; hi = lo + FP[i * 6 + 1]; }
            let hit = false;
            for (let j = lo; j < hi && !hit; j++) {
              const o = j * 6, A = FP[o], Bq = FP[o + 1], Cq = FP[o + 2], Dq = FP[o + 3], Eq = FP[o + 4], Fq = FP[o + 5];
              const kind = FK[j];
              if (kind === SH_E) {
                hit = ((x - A) / Cq) ** 2 + ((y - Bq) / Dq) ** 2 <= 1;
              } else if (kind === SH_C) {
                const dx = Cq - A, dy = Dq - Bq;
                const h = clamp(((x - A) * dx + (y - Bq) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1);
                hit = (x - A - h * dx) ** 2 + (y - Bq - h * dy) ** 2 <= Eq * Eq;
              } else {
                const d1 = (x - Cq) * (Bq - Dq) - (A - Cq) * (y - Dq);
                const d2 = (x - Eq) * (Dq - Fq) - (Cq - Eq) * (y - Fq);
                const d3 = (x - A) * (Fq - Bq) - (Eq - A) * (y - Bq);
                hit = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
              }
            }
            ok = hit;
          }
          if (ok) best = q;
        }
        catIdx[r * W + c] = best;
        catBr[r * W + c] = clamp(0.74 + 0.26 * (Y - 0.2) / 2.0, 0.62, 1);
      }
    }
    // "solid" neighbour: filled and not on a lower layer (else this cell gets an ink line)
    const solid = (r, c, lay) => {
      if (r < 0 || r >= H || c < 0 || c >= W) return false;
      const q = catIdx[r * W + c];
      return q >= 0 && shapes[q].lay >= lay;
    };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const q = catIdx[r * W + c];
      if (q < 0) continue;
      const col = shapes[q].col, lay = shapes[q].lay;
      const edge = !(solid(r - 1, c, lay) && solid(r + 1, c, lay) && solid(r, c - 1, lay) && solid(r, c + 1, lay))
        || r === 0 || c === 0 || r === H - 1 || c === W - 1;
      const br = catBr[r * W + c];
      const ri = edge ? 6 : clamp(Math.round(5 + br * 3), 0, RAMP.length - 1);
      const m = (edge ? 0.55 : 1) * (0.8 + 0.2 * br);
      setCell((r0 + r) * cols + c0 + c, RAMP_IDX[ri], col[0] * m, col[1] * m, col[2] * m);
    }

    // eyes, laid out cell by cell (sized to the cat) so they stay crisp:
    // open = big and dark with a white shine and a green glint, happy = ^, blink = a line
    const ink = (c, r, col) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) setCell(r * cols + c, RAMP_IDX[RAMP.length - 1], col[0], col[1], col[2]);
    };
    const DARK = [40, 28, 36], GLINT = [80, 165, 80];
    const ew = Math.max(2, Math.round(0.26 * sx)), eh = Math.max(2, Math.round(0.36 * s));
    for (const ex of [0.52, 1.04]) {
      const [ec, er] = catToScreen(cx, gy, s, P, ex, 1.45, true);
      const cL = Math.round(ec - ew / 2), rT = Math.round(er - eh / 2);
      if (P.happy) {                                   // ^
        const hh = Math.max(2, eh), half = (ew - 1) / 2;
        for (let i = 0; i < ew; i++) ink(cL + i, rT + Math.round(Math.abs(i - half) / Math.max(half, 0.5) * (hh - 1)), DARK);
      } else if (P.blink) {
        for (let i = 0; i < ew; i++) ink(cL + i, rT + (eh >> 1), DARK);
      } else {
        const round = ew >= 4 && eh >= 3;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
          if (round && (j === 0 || j === eh - 1) && (i === 0 || i === ew - 1)) continue;   // rounded corners
          ink(cL + i, rT + j, DARK);
        }
        ink(cL + ew - 2, rT + (eh >= 4 ? 1 : 0), WHITE);                         // one-cell shine, top right
        if (ew >= 6) ink(cL + ew - 3, rT + (eh >= 4 ? 1 : 0), WHITE);
        if (eh >= 3) ink(cL + Math.floor((ew - 1) / 2), rT + eh - 1, GLINT);        // green glint, bottom middle
      }
    }

    // whiskers (they twitch now and then)
    const dash = charIndex("-"), wz = 0.03 * Math.sin(t * 9) * (P.earTwitch > 0.1 ? 1 : 0);
    for (const [x0, y0, x1, y1] of [[0.28, 1.3, 0.0, 1.34 + wz], [0.28, 1.22, 0.02, 1.15 - wz],
                                    [1.28, 1.3, 1.58, 1.34 + wz], [1.28, 1.22, 1.56, 1.15 - wz]]) {
      const [ac, ar] = catToScreen(cx, gy, s, P, x0, y0, true), [bc, br] = catToScreen(cx, gy, s, P, x1, y1, true);
      const n = Math.max(1, Math.round(Math.abs(bc - ac)));
      for (let k = 0; k <= n; k++) {
        const c = Math.floor(ac + (bc - ac) * k / n), r = Math.floor(ar + (br - ar) * k / n);
        if (r >= 0 && r < rows && c >= 0 && c < cols && !IDX[r * cols + c]) setCell(r * cols + c, dash, 250, 240, 230);
      }
    }
  }

  // little dust puffs where the cat skids to a stop or pushes off
  function drawDust(cx, gy, s, age, dir) {
    if (age < 0 || age > 0.7) return;
    const sx = s * aspect, fade = 1 - age / 0.7;
    const chars = [charIndex("."), charIndex("o"), charIndex("O")];
    for (let k = 0; k < 5; k++) {
      const spread = 0.35 + 0.25 * k;
      const x = cx + dir * (0.5 + spread * (0.6 + age * 1.6)) * sx;
      const y = gy - (0.08 + age * (0.5 + 0.12 * k)) * s;
      const big = age < 0.25 ? 2 : age < 0.45 ? 1 : 0;
      const c = Math.floor(x), r = Math.floor(y);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        const v = 215 * fade;
        setCell(r * cols + c, chars[Math.max(0, big - (k % 2))], v, v * 0.95, v * 0.9);
      }
    }
  }

  // cartoon speed lines behind the running cat
  function drawSpeedLines(cx, gy, s, speed, t) {
    const k = clamp((speed - 2.5) / 3, 0, 1);
    if (k <= 0) return;
    const sx = s * aspect, dash = charIndex("-"), eq = charIndex("=");
    for (let i = 0; i < 4; i++) {
      const r = Math.floor(gy - (0.45 + 0.5 * i) * s);
      const len = Math.round(sx * k * (1.2 + 0.6 * Math.sin(i * 2.1 + t * 7)));
      const startC = Math.floor(cx - (1.2 + 0.25 * (i % 2)) * sx);
      for (let j = 0; j < len; j++) {
        const c = startC - j;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const f = (1 - j / len) * k * 230;
        setCell(r * cols + c, j < len * 0.3 ? eq : dash, f, f, f * 1.05);
      }
    }
  }

  // ---- big letters for the speech bubble (with a hand-drawn "!")
  const BUBBLE_FONT = '"Comic Neue", "Comic Sans MS", "Chalkboard SE", cursive';
  const textCache = new Map();
  function textMask(text, th, asp) {
    const key = `${text}|${th}|${asp.toFixed(2)}`;
    if (textCache.has(key)) return textCache.get(key);
    const fs = 120, pad = 24;
    const cv = document.createElement("canvas");
    let ctx = cv.getContext("2d");
    const font = `700 ${fs}px ${BUBBLE_FONT}`;
    ctx.font = font;
    cv.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
    cv.height = Math.ceil(fs * 1.8);
    ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.font = font; ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
    ctx.fillText(text, pad, Math.round(fs * 1.3));
    const Wc = cv.width, Hc = cv.height, data = ctx.getImageData(0, 0, Wc, Hc).data;
    const al = (x, y) => data[(y * Wc + x) * 4 + 3];
    let xs0 = Wc, xs1 = -1, ys0 = Hc, ys1 = -1;
    for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) if (al(x, y) > 0) {
      if (x < xs0) xs0 = x; if (x > xs1) xs1 = x; if (y < ys0) ys0 = y; if (y > ys1) ys1 = y;
    }
    if (xs1 < 0) { textCache.set(key, null); return null; }
    const iw = xs1 - xs0 + 1, ih = ys1 - ys0 + 1;
    const tw = Math.max(1, Math.round(iw / ih * th * asp));
    const acc = new Float32Array(tw * th), cnt = new Float32Array(tw * th);
    for (let y = ys0; y <= ys1; y++) {
      const r = Math.floor((y - ys0) * th / ih);
      for (let x = xs0; x <= xs1; x++) {
        const c = Math.floor((x - xs0) * tw / iw);
        acc[r * tw + c] += al(x, y); cnt[r * tw + c] += 1;
      }
    }
    const mask = new Uint8Array(tw * th);
    for (let i = 0; i < mask.length; i++) mask[i] = acc[i] / Math.max(cnt[i], 1) > 85 ? 1 : 0;

    // at this size the gap in "!" closes up and it looks like "l": draw it by hand
    const toC = (px) => (px - xs0) * tw / iw, toR = (py) => (py - ys0) * th / ih;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "!") continue;
      const p0 = pad + ctx.measureText(text.slice(0, i)).width, p1 = pad + ctx.measureText(text.slice(0, i + 1)).width;
      let ic0 = 1e9, ic1 = -1, ir0 = 1e9, ir1 = -1;
      for (let x = Math.floor(p0); x < Math.ceil(p1) && x < Wc; x++) for (let y = 0; y < Hc; y++) if (al(x, y) > 0) {
        if (x < ic0) ic0 = x; if (x > ic1) ic1 = x; if (y < ir0) ir0 = y; if (y > ir1) ir1 = y;
      }
      if (ic1 < 0) continue;
      const ca0 = Math.max(0, Math.floor(toC(p0))), cb0 = Math.min(tw, Math.ceil(toC(p1)));
      for (let r = 0; r < th; r++) for (let c = ca0; c < cb0; c++) mask[r * tw + c] = 0;
      const cc = toC((ic0 + ic1) / 2), bw = Math.max(2, Math.round(toC(ic1) - toC(ic0)));
      let ca = Math.round(cc - bw / 2);
      const cb = Math.min(tw, ca + bw); ca = Math.max(0, ca);
      const top = Math.max(0, Math.floor(toR(ir0))), bot = Math.min(th - 1, Math.ceil(toR(ir1 + 1)) - 1);
      const dot = bot - top >= 6 ? 2 : 1, gap = bot - top >= 8 ? 2 : 1;
      for (let c = ca; c < cb; c++) {
        for (let r = top; r <= bot - dot - gap; r++) mask[r * tw + c] = 1;   // the bar
        for (let r = bot - dot + 1; r <= bot; r++) mask[r * tw + c] = 1;     // the dot
      }
    }
    const res = { mask, tw, th };
    textCache.set(key, res);
    return res;
  }

  function bubbleLayout() {
    let th = Math.max(3, Math.round(rows * 0.1));
    for (;;) {
      const tm = textMask(SAY, th, aspect);
      const tw = tm ? tm.tw : SAY.length, h = tm ? th : 1;
      const padR = Math.max(1, Math.round(h * 0.6)), padC = Math.round(padR * aspect * 1.3) + 1;
      if (tw + 2 * padC + 4 <= cols || th <= 3 || !tm) return { tm, tw, th: h, padR, padC };
      th--;
    }
  }

  function drawBubble(tipC, tipR, k) {
    if (k <= 0.02) return;
    const { tm, tw, th, padR, padC } = bubbleLayout();
    const hh = th / 2 + padR, hw = tw / 2 + padC;
    const bx = Math.min(Math.max(tipC + hw * 0.55, hw + 1), cols - hw - 1);
    const by = Math.max(tipR - hh - Math.max(2, th * 0.7), hh + 1);
    const baseY = by + hh * k * 0.7;
    const tip = [bx + (tipC - bx) * k, by + (tipR - by) * k];
    // tail starts on the part of the bubble closest to the cat, so it stays short and solid
    const tb = bx + clamp(tipC - hw * 0.15 - bx, -hw * 0.6, hw * 0.6) * k;
    const tbw = Math.max(3, hw * 0.3) * k / 2;
    const tail = triangle([tb - tbw, baseY], [tb + tbw, baseY], tip);
    const inside = (c, r) => {
      const C = c + 0.5, R = r + 0.5;
      return ((C - bx) / (hw * k)) ** 4 + ((R - by) / (hh * k)) ** 4 <= 1 || tail(C, R);
    };
    const r0 = Math.max(0, Math.floor(Math.min(by - hh * k, tip[1])) - 1), r1 = Math.min(rows - 1, Math.ceil(Math.max(by + hh * k, tip[1])) + 1);
    const c0 = Math.max(0, Math.floor(Math.min(bx - hw * k, tip[0])) - 1), c1 = Math.min(cols - 1, Math.ceil(Math.max(bx + hw * k, tip[0])) + 1);
    const fill = charIndex("#"), rim = charIndex("@");
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!inside(c, r)) continue;
      const edge = !(inside(c - 1, r) && inside(c + 1, r) && inside(c, r - 1) && inside(c, r + 1))
        || r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      if (edge) setCell(r * cols + c, rim, 255, 165, 200);
      else setCell(r * cols + c, fill, 255, 255, 255);
    }
    if (k > 0.85) {
      const top = Math.round(by - th / 2), left = Math.round(bx - tw / 2);
      if (!tm) {
        for (let j = 0; j < SAY.length; j++) {
          const r = top, c = left + j;
          if (r >= 0 && r < rows && c >= 0 && c < cols) setCell(r * cols + c, charIndex(SAY[j]), 225, 35, 115);
        }
      } else {
        for (let r = 0; r < tm.th; r++) for (let c = 0; c < tm.tw; c++) {
          if (!tm.mask[r * tm.tw + c]) continue;
          const rr = r + top, cc = c + left;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) setCell(rr * cols + cc, rim, 225, 35, 115);
        }
      }
    }
  }

  function pop(u) {
    u = clamp(u, 0, 1);
    const c = 1.7;
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
  }

  // where the cat is at time t: trot in, skid to a stop, stand and talk, wind up, zoom off
  const BRAKE_AT = 3.2, STOP_AT = 3.6, LEAVE_WINDUP = 0.35;
  function catX(t, start, mid, end) {
    const d = mid - start;
    if (t < BRAKE_AT) return start + d * 0.94 * Math.max(0, t) / BRAKE_AT;
    if (t < STOP_AT) { const u = (t - BRAKE_AT) / (STOP_AT - BRAKE_AT); return start + d * (0.94 + 0.06 * (1 - (1 - u) ** 2)); }
    const te = t - WALK_IN - TALK - LEAVE_WINDUP;
    if (te <= 0) return mid;
    return mid + (end - mid) * Math.pow(Math.min(1, te / (WALK_OUT - LEAVE_WINDUP)), 1.7);
  }

  // a damped wobble: 0 -> peak -> settles
  const wobble = (q, freq, damp) => (q < 0 ? 0 : Math.exp(-damp * q) * Math.sin(freq * q));

  function drawIntro(t) {
    const s = rows * 0.235 / 2.6, sx = s * aspect, gy = rows * 0.78;   // ~85% of the old cat
    const start = -2.4 * sx, mid = cols * 0.5 - 0.3 * sx, end = cols + 2.6 * sx;
    const x = catX(t, start, mid, end);
    const speed = Math.abs(x - catX(t - 0.04, start, mid, end)) / 0.04 / sx;   // cat units per second
    const moving = speed > 0.05;
    const walk = (x - start) / sx * 3.4;
    const breathe = 0.014 * Math.sin(t * 3.2);
    const P = {
      t, walk, moving, stride: 1, hop: 0, sqx: 1 - breathe, sqy: 1 + breathe, lean: 0,
      headTilt: 0, headBob: 0, bob: 0, mouth: 0, happy: false, blink: (t % 3.1) < 0.12,
      wave: 0, wavePh: 0, earTwitch: Math.max(0, Math.sin(((t % 2.7) / 0.25) * Math.PI)) * ((t % 2.7) < 0.25 ? 1 : 0),
      tailWag: 1, tailSpeed: 4,
    };
    if (moving) {                                     // bouncy trot with squash and stretch
      const st = Math.abs(Math.sin(walk)), k = Math.min(1.6, 0.75 + speed * 0.14);
      P.bob = 0.1 * k * st;
      P.sqy = 1 + 0.07 * k * (st - 0.5); P.sqx = 1 / P.sqy;
      P.lean = -0.05 * k;                             // leaning into the run
      P.headBob = 0.045 * Math.sin(2 * walk - 0.9);   // the head follows a beat later
      P.headTilt = 0.06 * Math.sin(walk);
      P.stride = Math.min(1.4, 0.85 + speed * 0.1);
      P.tailSpeed = 5 + speed;
    }
    const stopAge = t - BRAKE_AT;                     // skid: leans back, wobbles, settles
    if (stopAge > 0 && t < WALK_IN) {
      P.lean += 0.2 * wobble(stopAge, 7.5, 3.2);
      const sq = 0.08 * wobble(t - STOP_AT, 14, 6);
      P.sqy -= sq; P.sqx += sq * 0.6;
    }

    let bubble = 0;
    const tt = t - WALK_IN;
    if (tt >= 0 && tt < TALK) {                       // crouch, hop, say the name, wave
      if (tt < 0.18) {
        const c = Math.sin(Math.PI / 2 * tt / 0.18);
        P.sqy = 1 - 0.14 * c; P.sqx = 1 + 0.09 * c;
      } else if (tt < 0.6) {
        const p = (tt - 0.18) / 0.42;
        P.hop = 0.5 * Math.sin(Math.PI * p);
        P.sqy = 1 + 0.12 * Math.abs(Math.cos(Math.PI * p)); P.sqx = 1 / P.sqy;
      } else {
        const sq = 0.13 * wobble(tt - 0.6, 15, 6);
        P.sqy -= sq; P.sqx += sq * 0.6;
      }
      P.mouth = tt > 0.35 && tt < 1.35 ? (Math.sin(tt * 15) > -0.2 ? 1 : 0.3) : 0;
      P.happy = tt > 1.35 && tt < 2.5;
      P.wave = smoothstep((tt - 1.0) / 0.22) * (1 - smoothstep((tt - 2.4) / 0.22));
      P.wavePh = tt * 12;
      P.headTilt = -0.17 * smoothstep((tt - 0.9) / 0.35) * (1 - smoothstep((tt - 2.5) / 0.35));
      P.tailSpeed = 8;
      if (tt > 1.9 && tt < 2.15) P.earTwitch = Math.sin((tt - 1.9) / 0.25 * Math.PI);
      bubble = pop((tt - 0.35) / 0.35) * (1 - smoothstep((tt - (TALK - 0.35)) / 0.3));
    }
    const te = t - WALK_IN - TALK;
    if (te >= 0 && te < LEAVE_WINDUP) {               // wind-up before zooming off
      const c = smoothstep(te / 0.3);
      P.sqy = 1 - 0.12 * c; P.sqx = 1 + 0.08 * c; P.lean = 0.14 * c;
    }

    drawCat(x, gy, s, P);
    drawDust(x - 0.1 * sx, gy, s, t - STOP_AT + 0.15, 1);                    // skid puff in front
    drawDust(x - 0.4 * sx, gy, s, te - LEAVE_WINDUP, -1);                     // push-off puff behind
    if (te > LEAVE_WINDUP) drawSpeedLines(x, gy, s, speed, t);
    const [bc, br] = catToScreen(x, gy, s, P, 1.2, 2.4, true);
    drawBubble(bc, br, bubble);
  }

  // ================================================================ display
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  let gw = 6, gh = 11, atlas = null, atlasChars = 0, image = null, image32 = null, bgLevel = Math.round(TINT * 256);

  function buildAtlas(fontPx) {
    const mono = `700 ${fontPx}px Consolas, Menlo, "DejaVu Sans Mono", "Courier New", monospace`;
    const cv = document.createElement("canvas");
    let c2 = cv.getContext("2d");
    c2.font = mono;
    gw = Math.max(2, Math.round(c2.measureText("@").width));
    gh = Math.max(3, Math.round(fontPx * 1.12));
    cv.width = gw * CHARS.length; cv.height = gh;
    c2 = cv.getContext("2d", { willReadFrequently: true });
    c2.fillStyle = "#000"; c2.fillRect(0, 0, cv.width, cv.height);
    c2.font = mono; c2.fillStyle = "#fff"; c2.textBaseline = "alphabetic"; c2.textAlign = "center";
    CHARS.forEach((ch, i) => { if (ch !== " ") c2.fillText(ch, i * gw + gw / 2, Math.round(gh * 0.8)); });
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    atlas = new Uint16Array(CHARS.length * gw * gh);   // glyph brightness with the tint already mixed in
    for (let i = 0; i < CHARS.length; i++)
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++)
        atlas[(i * gh + y) * gw + x] = bgLevel + ((d[(y * cv.width + i * gw + x) * 4] * (256 - bgLevel)) >> 8);
    atlasChars = CHARS.length;
  }

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(0.6, Math.min(dpr, 2, Math.sqrt(2.6e6 / (vw * vh))));   // keep the pixel count sane
    const fontPx = Math.max(6, Math.round(vh * k / 100 / 1.12));             // about 100 rows of text
    buildAtlas(fontPx);
    const c = Math.max(20, Math.floor(vw * k / gw)), r = Math.max(12, Math.floor(vh * k / gh));
    canvas.width = c * gw; canvas.height = r * gh;
    canvas.style.width = `${(c * gw) / k}px`; canvas.style.height = `${(r * gh) / k}px`;
    aspect = gh / gw;
    resizeGrid(c, r);
    image = ctx.createImageData(canvas.width, canvas.height);
    image32 = new Uint32Array(image.data.buffer);
    textCache.clear();
  }

  function compose() {
    if (atlasChars !== CHARS.length) buildAtlas(Math.round(gh / 1.12));
    const W = canvas.width, px = image32;      // one 32-bit write per pixel (RGBA, little-endian)
    px.fill(0xff000000);
    const gsz = gw * gh;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c, R = RGB[k * 3], G = RGB[k * 3 + 1], Bc = RGB[k * 3 + 2];
        if ((R | G | Bc) === 0) continue;
        let a = IDX[k] * gsz, p = r * gh * W + c * gw;
        for (let y = 0; y < gh; y++, p += W - gw) {
          for (let x = 0; x < gw; x++, p++, a++) {
            const w = atlas[a];
            px[p] = 0xff000000 | (((Bc * w) >> 8) << 16) | (((G * w) >> 8) << 8) | ((R * w) >> 8);
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  // ---------------------------------------------------------------- music
  // "Heartbeat" plays through YouTube's player, kept invisible. It starts together with
  // the flowers: the song is buffered (muted) while the cat walks, and the bouquet's first
  // frame waits until YouTube really is playing, so sound and growth begin on the same
  // frame. It loops while the bouquet stays and restarts with Re-bloom.
  // Browsers only allow sound after a tap, so the page first shows "tap to open". iPhones
  // are strictest: the player must be *started during that tap*, or the song is refused
  // later. So "tap to open" only appears once the player has loaded, and the tap itself
  // starts the player (muted, just to buffer); YouTube then plays when the flowers start.
  // The YouTube video itself is never shown, and there is no other button to tap.
  const MUSIC_ON = params.get("music") !== "0";
  const YT_ID = /^[\w-]{11}$/.test(params.get("yt") || "") ? params.get("yt") : "WOD_R7Yu8vw";   // ids are 11 chars
  const YT_START = Math.max(0, parseFloat(params.get("ytstart") || "0") || 0);   // skip silence at the start
  const FADE_IN = 0.15, FADE_OUT = 0.5;     // short fade-in: just enough to avoid a click
  const MAX_HOLD = 3.0;                     // never wait longer than this for the music
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const music = {
    player: null, ready: false, failed: false,
    want: false,        // the bouquet wants music now
    playing: false,     // YouTube says it's playing (and it isn't the muted pre-buffer)
    priming: false, primed: false, primeTimer: 0,
    fade: 0, sentVol: -1, sentMute: null,
    volume: 0.7, muted: false, paused: false,
  };
  try {
    const s = JSON.parse(localStorage.getItem("ffh-sound") || "null");
    if (s && typeof s.volume === "number") {
      music.volume = Math.min(1, Math.max(0, s.volume));
      music.muted = !!s.muted;
    }
  } catch (e) { /* storage blocked: defaults are fine */ }

  const ytBox = document.getElementById("yt");
  let gateWaiting = false;               // "tap to open" is on screen
  let gateLoading = false;               // ...but not tappable yet: the player is still loading
  let lastForcedPause = 0;

  function musicFailed() {
    music.failed = true;
    music.want = false;
    if (ytBox) ytBox.hidden = true;
    hideSound();
    gateReady();                         // no music: let the page open anyway
  }

  function loadYouTube() {
    if (!MUSIC_ON || !ytBox) return;
    window.onYouTubeIframeAPIReady = () => {
      try { createPlayer(); } catch (e) { musicFailed(); }
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = musicFailed;
    document.head.appendChild(s);
  }

  function createPlayer() {
      music.player = new YT.Player("yt-player", {
        host: "https://www.youtube-nocookie.com",          // YouTube's privacy-enhanced mode
        width: 200, height: 200, videoId: YT_ID,
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, fs: 0,
                      iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => {
            music.ready = true;
            music.sentVol = -1; music.sentMute = null;
            if (gateWaiting) gateReady();
            else if (music.want && !music.paused) playFromStart();
            else if (started) primeMusic();
            if (started) showSound();                // page opened before YouTube was ready
          },
          onStateChange: (e) => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) {
              if (music.priming) {
                endPriming();
                if (!music.want) return;             // buffered: wait silently for the flowers
              }
              music.playing = true;
            } else if (e.data === S.ENDED) {
              music.playing = false;
              if (music.want && !music.paused) playFromStart(true);   // loop
            } else if (e.data === S.PAUSED || e.data === S.BUFFERING) {
              music.playing = false;
            }
          },
          onError: musicFailed,
        },
      });
  }

  // while the cat walks: play a moment muted so YouTube has the start buffered
  function primeMusic() {
    if (!music.ready || music.failed || music.primed || music.priming || music.want) return;
    music.priming = true;
    applyVolume();                       // mutes (see applyVolume)
    music.player.seekTo(YT_START, true);
    music.player.playVideo();
    music.primeTimer = setTimeout(endPriming, 6000);   // never started: give up quietly
  }
  function endPriming() {
    if (!music.priming) return;
    clearTimeout(music.primeTimer);
    music.priming = false;
    music.primed = true;
    if (!music.want) {
      music.player.pauseVideo();
      music.player.seekTo(YT_START, true);
    }
    applyVolume();
  }

  function playFromStart(looping) {
    const p = music.player;
    if (!music.ready || music.failed) return;
    if (!looping) music.fade = 0;
    music.playing = false;
    applyVolume();
    p.seekTo(YT_START, true);
    p.playVideo();
  }

  function musicStart() {
    if (music.want || music.failed) return;
    music.want = true;
    if (!music.paused) playFromStart();
  }

  function musicRestart() {              // Re-bloom: back to the start of the song
    if (!music.want) { musicStart(); return; }
    if (!music.paused) playFromStart();
  }

  function musicStop() {
    if (!music.want) return;
    music.want = false;            // musicUpdate fades it out, then pauses
    if (music.fade === 0 && music.ready && !music.failed) {   // never got going: stop right away
      music.player.pauseVideo();
    }
  }

  function musicPause(pause) {
    music.paused = pause;
    if (!music.ready || music.failed || !music.want) return;
    if (pause) music.player.pauseVideo();
    else music.player.playVideo();
  }

  // should the flowers wait for the song? (only at their very first frame)
  function musicHolding() {
    if (!MUSIC_ON || music.failed || music.paused) return false;
    return !music.playing;
  }

  // every frame: fade in/out and send the volume to YouTube when it changes
  function musicUpdate(dt) {
    if (!music.ready || music.failed) return;
    const st = music.player.getPlayerState();
    if (music.want && !music.priming && st === YT.PlayerState.PLAYING) music.playing = true;   // missed event
    if (!music.want && !music.priming && music.fade === 0 && st === YT.PlayerState.PLAYING) {
      const now = performance.now();               // playing when it shouldn't (a pause got lost)
      if (now - lastForcedPause > 500) { music.player.pauseVideo(); lastForcedPause = now; }
    }
    if (music.want) {
      if (music.playing) music.fade = Math.min(1, music.fade + dt / FADE_IN);
    } else if (music.fade > 0) {
      music.fade = Math.max(0, music.fade - dt / FADE_OUT);
      if (music.fade === 0) {
        music.player.pauseVideo();
      }
    }
    applyVolume();
  }

  // ------------------------------------------------------------- sound control
  const soundBox = document.getElementById("sound");
  const muteBtn = document.getElementById("mute");
  const volSlider = document.getElementById("volume");

  function applyVolume() {
    const silent = music.muted || music.volume === 0;
    if (music.ready && !music.failed) {
      const vol = Math.round(100 * music.fade * music.volume * music.volume);   // squared: feels even
      if (vol !== music.sentVol) { music.player.setVolume(vol); music.sentVol = vol; }
      const mute = silent || music.priming;        // iPhones ignore setVolume but obey mute
      if (mute !== music.sentMute) {
        if (mute) music.player.mute(); else music.player.unMute();
        music.sentMute = mute;
      }
    }
    if (!soundBox) return;
    const pct = Math.round(music.volume * 100);
    volSlider.value = String(pct);
    volSlider.style.setProperty("--v", `${pct}%`);
    soundBox.dataset.level = silent ? "0" : music.volume < 0.5 ? "1" : "2";
    soundBox.classList.toggle("muted", silent);
    muteBtn.setAttribute("aria-label", silent ? "Unmute music" : "Mute music");
    muteBtn.setAttribute("aria-pressed", silent ? "true" : "false");
  }

  function saveVolume() {
    try {
      localStorage.setItem("ffh-sound", JSON.stringify({ volume: music.volume, muted: music.muted }));
    } catch (e) { /* not saved, that's ok */ }
  }

  function showSound() {
    if (!soundBox || music.failed || !music.ready) return;     // only once there is music to control
    soundBox.hidden = false;
    requestAnimationFrame(() => soundBox.classList.add("show"));
  }
  function hideSound() {
    if (soundBox) soundBox.hidden = true;
  }

  if (soundBox) {
    if (IOS) soundBox.classList.add("no-slider");    // iPhone volume is the hardware buttons
    muteBtn.addEventListener("click", () => {
      if (music.muted || music.volume === 0) {
        music.muted = false;
        if (music.volume === 0) music.volume = 0.5;
      } else {
        music.muted = true;
      }
      applyVolume(); saveVolume();
    });
    volSlider.addEventListener("input", () => {
      music.volume = Math.min(1, Math.max(0, volSlider.value / 100));
      music.muted = false;
      applyVolume();
    });
    volSlider.addEventListener("change", saveVolume);
    applyVolume();
  }

  // ---------------------------------------------------------------- loop
  const bouquet = makeBouquet(SEED);
  let t = 0, last = performance.now(), paused = false, started = false;
  const B0 = INTRO ? INTRO_END : 0;      // time the bouquet starts
  let held = 0;                          // seconds the first flower frame waited for the song

  function setPaused(p) {
    paused = p;
    musicPause(p);
  }

  // "Re-bloom" button: shows once the lilies are open, regrows the bouquet (no cat replay)
  const rebloomBtn = document.getElementById("rebloom");
  const BLOOMED_AT = 9.5;          // bouquet seconds until (nearly) every lily is open
  let buttonShown = false;
  function setButton(show) {
    if (!rebloomBtn || show === buttonShown) return;
    buttonShown = show;
    rebloomBtn.classList.toggle("show", show);
    rebloomBtn.tabIndex = show ? 0 : -1;
  }
  function rebloom() {
    t = B0;
    held = 0;
    setPaused(false);
    setButton(false);
    musicRestart();
  }
  if (rebloomBtn) rebloomBtn.addEventListener("click", rebloom);

  function renderFrame(time) {
    IDX.fill(0); RGB.fill(0);
    drawStars(time);
    if (INTRO && time < INTRO_END) {
      drawIntro(time);
      setButton(false);
      if (started) musicStop();
    } else {
      const tb = INTRO ? time - INTRO_END : time;
      drawBouquet(bouquet, tb);
      drawMessage(tb);
      setButton(tb > BLOOMED_AT);
      if (started) musicStart();
    }
    compose();
  }

  function tick(now) {
    const dt = Math.min(0.25, (now - last) / 1000);   // keeps real speed on slow phones, no jump after a tab switch
    last = now;
    if (!paused) {
      let nt = t + dt;
      // the flowers' first frame waits for the song, so both start together
      if (started && t <= B0 && nt >= B0) {
        if (t < B0) { t = B0; renderFrame(t); }       // reach the first frame (starts the music)
        if (musicHolding() && held < MAX_HOLD) { held += dt; nt = B0; }
      }
      if (nt < B0) held = 0;
      t = nt;
    }
    renderFrame(t);
    musicUpdate(dt);
    requestAnimationFrame(tick);
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); if (!started) renderFrame(0); }, 150);
  });
  window.addEventListener("keydown", (e) => {
    if (!started) return;
    if (e.code === "Space" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)) {
      setPaused(!paused); e.preventDefault();
    }
    if (e.key === "r" || e.key === "R") { t = 0; held = 0; setPaused(false); if (!INTRO) musicRestart(); }
  });

  // background tab: the animation stops, so the song waits too (and they stay in sync)
  document.addEventListener("visibilitychange", () => {
    if (!music.ready || music.failed || !music.want || paused) return;
    if (document.hidden) music.player.pauseVideo(); else music.player.playVideo();
  });

  // debugging / screenshots: window.renderAt(seconds) draws one frame and pauses
  window.renderAt = (sec) => { setPaused(true); t = sec; renderFrame(t); };
  window.musicState = () => ({
    ready: music.ready, failed: music.failed, want: music.want, playing: music.playing,
    fade: +music.fade.toFixed(2), volume: music.sentVol, muted: music.sentMute,
    priming: music.priming, primed: music.primed, held: +held.toFixed(2),
    bouquetTime: +(t - B0).toFixed(2),
    youtube: music.ready ? music.player.getPlayerState() : null,
    at: music.ready ? +music.player.getCurrentTime().toFixed(1) : null,
  });

  function begin() {
    started = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  const welcome = window.ffhWelcome || null;   // the folder screen, if it loaded
  loadYouTube();
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(`700 120px "Comic Neue"`), new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();
  fontReady.catch(() => {}).then(() => {
    layout();
    // the folder opening screen (welcome.js): tapping its "Flowers for her" paper opens the page
    if (welcome) {
      renderFrame(0);                    // the starry sky behind the folder
      gateWaiting = true;
      if (MUSIC_ON && !music.ready && !music.failed) {
        gateLoading = true;              // the paper opens the page once YouTube has loaded
        setTimeout(gateReady, 10000);    // YouTube very slow or blocked: open without music
      }
      welcome.connect(() => {
        if (gateLoading || !gateWaiting) return null;
        gateWaiting = false;
        primeMusic();                    // right inside the tap: this is what unlocks iPhones
        return () => { if (MUSIC_ON) showSound(); else hideSound(); begin(); };
      });
      welcome.setReady(!gateLoading);
      return;
    }
    const gate = document.getElementById("gate");
    if (!MUSIC_ON || !gate) { hideSound(); begin(); return; }
    renderFrame(0);                      // the starry sky behind "tap to open"
    gate.hidden = false;
    gateWaiting = true;
    if (!music.ready && !music.failed) {
      gateLoading = true;                // "tap to open" appears once YouTube has loaded
      gate.classList.add("loading");
      setTimeout(gateReady, 10000);      // YouTube very slow or blocked: open without music
    }
    gate.focus({ preventScroll: true });
    gate.addEventListener("click", () => { if (!gateLoading) openGate(); });
  });

  function gateReady() {
    if (!gateLoading) return;
    gateLoading = false;
    if (welcome) { welcome.setReady(true); return; }
    const gate = document.getElementById("gate");
    if (gate) gate.classList.remove("loading");
  }

  function openGate() {
    if (!gateWaiting) return;
    gateWaiting = false;
    const gate = document.getElementById("gate");
    gate.classList.add("gone");
    setTimeout(() => { gate.hidden = true; }, 500);
    primeMusic();                        // right inside the tap: this is what unlocks iPhones
    showSound();
    begin();
  }
})();
