/*
 * Flowers For Her - web version.
 *
 * A calico cat walks in, says the name in a comic speech bubble and walks
 * away; then a 3D bouquet of lilies grows and blooms. Everything is drawn as
 * coloured ASCII characters on a <canvas>.
 *
 * URL options:  ?say=Asmaa!   ?message=For%20you   ?intro=0   ?tint=0.45   ?seed=7
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
    const alt = [1, 0.8, 1, 0.8, 1, 0.8];
    b.wf = alt.map((a) => 1.8 - a);
    b.lf = alt.map((a) => 0.96 + 0.04 * (a - 0.8) / 0.2);
    b.rf = b.lf.slice();
    b.speckMask = new Uint8Array(F * 6 * NU * NV);
    for (let f = 0; f < F; f++) for (let k = 0; k < 6; k++) for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const u = b.u[i], v = b.v[j];
      b.speckMask[((f * 6 + k) * NU + i) * NV + j] = rnd() < 0.09 && u > 0.1 && u < 0.5 && Math.abs(v) < 0.6 ? 1 : 0;
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
      let head = P0;
      const Bp = [0, 0, 0], D0 = [0, 0, 0];
      for (let j = 0; j < NT; j++) {
        const T = j / (NT - 1) * g, s1 = 1 - T;
        const w0 = s1 * s1 * s1, w1 = 3 * s1 * s1 * T, w2 = 3 * s1 * T * T, w3 = T * T * T;
        for (let q = 0; q < 3; q++) {
          Bp[q] = w0 * P0[q] + w1 * P1[q] + w2 * P2[q] + w3 * P3[q];
          D0[q] = 3 * s1 * s1 * (P1[q] - P0[q]) + 6 * s1 * T * (P2[q] - P1[q]) + 3 * T * T * (P3[q] - P2[q]);
        }
        const D = norm3(D0);
        const Nn = norm3([D[1], -D[0], 0]), Bn = cross3(D, Nn);
        const rad = 0.028 - 0.01 * T, cs = 0.7 + 0.4 * T, sc = B.stemCol[f];
        for (let a = 0; a < NA; a++) {
          const ca = Math.cos(a * TAU / NA), sa = Math.sin(a * TAU / NA);
          const rx = ca * Nn[0] + sa * Bn[0], ry = ca * Nn[1] + sa * Bn[1], rz = ca * Nn[2] + sa * Bn[2];
          add(Bp[0] + rad * rx, Bp[1] + rad * ry, Bp[2] + rad * rz, rx, ry, rz, sc[0] * cs, sc[1] * cs, sc[2] * cs, -1, 100 + f);
        }
      }
      head = Bp.slice();
      heads.push(head);
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
        const base = B.base[f], edge = B.edge[f], thr = B.throat[f], spk = B.speck[f];
        const gmix = (1 - e) * 0.35;
        for (let k = 0; k < 6; k++) {
          const phi = B.petalRot[f] + k * Math.PI / 3, cp = Math.cos(phi), sp = Math.sin(phi);
          const rk = [cp * e1[0] + sp * e2[0], cp * e1[1] + sp * e2[1], cp * e1[2] + sp * e2[2]];
          const tk = [-sp * e1[0] + cp * e2[0], -sp * e1[1] + cp * e2[1], -sp * e1[2] + cp * e2[2]];
          const wf = B.wf[k], lf = B.lf[k], rf = B.rf[k];
          for (let i = 0; i < NU; i++) {
            const u = B.u[i], th = B.theta[i], cth = Math.cos(th), sth = Math.sin(th);
            const R = L * 0.31 * rf * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.85))), 0.75);
            const wdt = L * 0.25 * wf * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.65))), 0.85);
            const tb = Math.pow(clamp(1 - u / 0.32, 0, 1), 1.4);
            for (let j = 0; j < NV; j++) {
              const v = B.v[j], dv = v * (Math.PI / 6) * 1.04;
              const Ac = R * Math.cos(dv), Bc = R * Math.sin(dv), Cc = L * 1.05 * lf * u;
              const gr = 0.3 * wdt * v * v;
              const Ao = L * lf * (0.06 + B.cr[i]) - cth * gr, Bo = v * wdt, Co = L * lf * B.cz[i] + sth * gr;
              const A = Ac + (Ao - Ac) * e, Bb = Bc + (Bo - Bc) * e, C = Cc + (Co - Cc) * e;
              const q = (i * NV + j) * 3;
              const speck = B.speckMask[((f * 6 + k) * NU + i) * NV + j];
              const em = EM[j];
              for (let c = 0; c < 3; c++) {
                GP[q + c] = hd[c] + A * rk[c] + Bb * tk[c] + C * ax[c];
                const col = speck ? spk[c] : (base[c] * (1 - em) + edge[c] * em) * (1 - tb) + thr[c] * tb;
                GC[q + c] = col * (1 - gmix) + BUD_GREEN[c] * gmix;
              }
            }
          }
          emitGrid(NU, NV, -1, f);
        }

        // stamens + pistil
        if (e > 0.2) {
          const sz = B.size[f] * hs;
          const Ls = sz * 0.72 * e, Lp = sz * 0.7 * e;
          const OFF = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                       [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0]];
          for (let k = 0; k < 6; k++) {
            const ph = B.petalRot[f] + k * Math.PI / 3 + Math.PI / 6;
            const rs = [0, 1, 2].map((c) => Math.cos(ph) * e1[c] + Math.sin(ph) * e2[c]);
            let end = hd;
            for (let i = 0; i < 18; i++) {
              const s = i / 17, a = Ls * 0.8 * s, r = Ls * 0.62 * Math.pow(s, 1.4);
              end = [0, 1, 2].map((c) => hd[c] + ax[c] * a + rs[c] * r);
              add(end[0], end[1], end[2], 0, 0, 0, 215, 235, 170, 0.85, f);
            }
            for (const o of OFF) add(end[0] + o[0] * 0.032 * sz, end[1] + o[1] * 0.032 * sz, end[2] + o[2] * 0.032 * sz,
                                     0, 0, 0, 190, 80, 30, 0.7, f);
          }
          let tip = hd;
          for (let i = 0; i < 18; i++) {
            const s = i / 17;
            tip = [0, 1, 2].map((c) => hd[c] + ax[c] * Lp * s + e1[c] * 0.08 * Lp * s * s);
            add(tip[0], tip[1], tip[2], 0, 0, 0, 200, 225, 140, 0.75, f);
          }
          for (const o of OFF.slice(0, 5)) add(tip[0] + o[0] * 0.03 * sz, tip[1] + o[1] * 0.03 * sz, tip[2] + o[2] * 0.03 * sz,
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

  function drawBouquet(B, t) {
    bouquetPoints(B, t);
    const ay = 0.22 * Math.sin(TAU * t / 20), axr = 0.16;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(axr), sx = Math.sin(axr);
    // M = Rx(axr) * Ry(ay)
    const M = [cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy];
    const scale = Math.min(rows / 4.9, cols / (3.9 * aspect));
    ZB.fill(-1e9); WIN.fill(-1);
    const ZS = new Float32Array(np);
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
          const l = Math.hypot(nx, ny, nz) || 1e-9; nx /= l; ny /= l; nz /= l;
          const lam = Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const spec = Math.pow(Math.abs(nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 30);
          br = 0.22 + 0.78 * Math.pow(lam, 1.1) + 0.3 * spec;
        }
        br *= 0.78 + 0.22 * clamp((ZS[w] + 2) / 4, 0, 1);
        br = clamp(br, 0, 1);
        const jitter = Math.random() < 0.04 ? Math.floor(Math.random() * 3) - 1 : 0;
        let ri = clamp(Math.round(br * (nr - 1)) + jitter, 0, nr - 1);
        let m = 0.55 + 0.75 * br;
        // outline: a different, nearer object right next to this cell
        const z = ZB[c], id = IG[c];
        const nb = (q) => IG[q] >= 0 && IG[q] !== id && ZB[q] > z + 0.04;
        if ((cc + 1 < cols && nb(c + 1)) || (cc > 0 && nb(c - 1)) || (r + 1 < rows && nb(c + cols)) || (r > 0 && nb(c - cols))) {
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
  const MOUTH = [190, 55, 80];

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

  function drawCat(cx, gy, s, t, walk, moving, hop, mouthOpen) {
    const sx = s * aspect;
    const c0 = Math.max(0, Math.floor(cx - 2.1 * sx)), c1 = Math.min(cols, Math.floor(cx + 2.2 * sx) + 1);
    const r0 = Math.max(0, Math.floor(gy - 3.0 * s - hop * s)), r1 = Math.min(rows, Math.floor(gy + 0.3 * s) + 1);
    if (c0 >= c1 || r0 >= r1) return;
    const bob = moving ? 0.05 * Math.abs(Math.sin(walk)) : 0.025 * Math.sin(t * 2.2);
    const shapes = [];   // [test(X, Yb), colour] in painting order
    const paint = (test, col) => shapes.push([test, col]);

    const leg = (lx, ph, shade, top) => {
      const sw = moving ? Math.sin(walk + ph) : 0;
      const lift = moving ? 0.12 * Math.max(0, Math.cos(walk + ph)) : 0;
      const fx = lx + 0.2 * sw;
      const limb = capsule(lx, 0.62, fx, 0.12 + lift, 0.13);
      paint(limb, mul(CAL_WHITE, shade));
      if (top) paint((X, Y) => Y > 0.36 && limb(X, Y), mul(top, shade));
      paint(ellipse(fx + 0.05, 0.09 + lift, 0.17, 0.095), mul(CAL_WHITE, shade));
    };
    leg(0.68, Math.PI, 0.75);
    leg(-0.47, 0, 0.75, CAL_ORANGE);

    // tail with orange and black bands
    const wag = Math.sin(t * (moving ? 3 : 5)) * 0.3;
    const pts = [];
    for (let i = 0; i < 14; i++) { const u = i / 13; pts.push([-0.92 - 0.42 * u + wag * u * u, 0.98 + 1.15 * u - 0.15 * u ** 3]); }
    for (let k = 0; k < 13; k++) {
      const u = k / 13;
      paint(capsule(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.13 - 0.04 * u), Math.floor(k / 3) % 2 ? CAL_BLACK : CAL_ORANGE);
    }

    // body with calico patches
    const body = ellipse(0, 0.95, 1.02, 0.53);
    paint(body, CAL_WHITE);
    paint(both(body, ellipse(-0.52, 1.12, 0.5, 0.36)), CAL_ORANGE);
    paint(both(body, ellipse(0.18, 1.24, 0.38, 0.22)), CAL_BLACK);
    paint(both(body, ellipse(0.62, 1.08, 0.2, 0.16)), CAL_ORANGE);
    leg(0.55, 0, 1);
    leg(-0.6, Math.PI, 1, CAL_ORANGE);

    // head: one orange ear, one black ear, green eyes
    paint(triangle([0.4, 1.95], [0.5, 2.64], [0.9, 2.2]), CAL_ORANGE);
    paint(triangle([1.1, 2.2], [1.5, 2.64], [1.6, 1.95]), CAL_BLACK);
    paint(triangle([0.51, 2.04], [0.56, 2.46], [0.81, 2.18]), PINK);
    paint(triangle([1.19, 2.18], [1.44, 2.46], [1.49, 2.04]), PINK);
    const head = ellipse(1.0, 1.62, 0.74, 0.64);
    paint(head, CAL_WHITE);
    paint(both(head, ellipse(0.52, 1.98, 0.42, 0.3)), CAL_ORANGE);
    paint(both(head, ellipse(1.47, 2.03, 0.36, 0.25)), CAL_BLACK);
    paint(ellipse(0.56, 1.45, 0.12, 0.075), PINK);
    paint(ellipse(1.44, 1.45, 0.12, 0.075), PINK);
    const blink = (t % 3.4) < 0.14;
    for (const ex of [0.74, 1.26]) {
      if (blink) paint(capsule(ex - 0.1, 1.66, ex + 0.1, 1.66, 0.035), EYE);
      else {
        paint(ellipse(ex, 1.66, 0.12, 0.165), EYE_GREEN);
        paint(ellipse(ex, 1.65, 0.07, 0.12), EYE);
        paint(ellipse(ex + 0.035, 1.72, 0.045, 0.05), WHITE);
      }
    }
    paint(triangle([0.93, 1.51], [1.07, 1.51], [1.0, 1.43]), PINK);
    if (mouthOpen) paint(ellipse(1.0, 1.32, 0.08, 0.07), MOUTH);

    // rasterise the shapes into the bounding box
    const W = c1 - c0, H = r1 - r0;
    const colA = new Array(W * H).fill(null), brA = new Float32Array(W * H);
    for (let r = 0; r < H; r++) {
      const Y = (gy - (r0 + r + 0.5)) / s - hop, Yb = Y - bob;
      for (let c = 0; c < W; c++) {
        const X = (c0 + c + 0.5 - cx) / sx;
        let col = null;
        for (let q = 0; q < shapes.length; q++) if (shapes[q][0](X, Yb)) col = shapes[q][1];
        colA[r * W + c] = col;
        brA[r * W + c] = clamp(0.72 + 0.28 * (Y - 0.2) / 2.2, 0.6, 1);
      }
    }
    const filled = (r, c) => r >= 0 && r < H && c >= 0 && c < W && colA[r * W + c] !== null;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const col = colA[r * W + c];
      if (!col) continue;
      const edge = !(filled(r - 1, c) && filled(r + 1, c) && filled(r, c - 1) && filled(r, c + 1))
        || r === 0 || c === 0 || r === H - 1 || c === W - 1;
      const br = brA[r * W + c];
      const ri = edge ? 6 : clamp(Math.round(5 + br * 3), 0, RAMP.length - 1);
      const m = (edge ? 0.55 : 1) * (0.8 + 0.2 * br);
      setCell((r0 + r) * cols + c0 + c, RAMP_IDX[ri], col[0] * m, col[1] * m, col[2] * m);
    }

    // whiskers
    const dash = charIndex("-");
    for (const [x0, x1, y] of [[0.27, 0.02, 1.47], [0.29, 0.05, 1.37], [1.73, 1.98, 1.47], [1.71, 1.95, 1.37]]) {
      const n = Math.floor(Math.abs(x1 - x0) * sx) + 1;
      for (let k = 0; k <= n; k++) {
        const xx = x0 + (x1 - x0) * k / Math.max(n, 1);
        const c = Math.floor(cx + xx * sx), r = Math.floor(gy - (y + bob + hop) * s);
        if (r >= 0 && r < rows && c >= 0 && c < cols) setCell(r * cols + c, dash, 250, 240, 230);
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

  function drawIntro(t) {
    const s = rows * 0.28 / 2.7, sx = s * aspect, gy = rows * 0.8;
    const start = -2.3 * sx, mid = cols * 0.5 - 0.15 * sx, end = cols + 2.3 * sx;
    let x, moving, hop = 0, mouth = false, bubble = 0;
    if (t < WALK_IN) {                       // walk in, slowing down at the middle
      const u = t / WALK_IN;
      x = start + (mid - start) * (1 - (1 - u) ** 2);
      moving = u < 0.97;
    } else if (t < WALK_IN + TALK) {         // stop, hop and say the name
      x = mid; moving = false;
      const tt = t - WALK_IN;
      if (tt > 0.15 && tt < 0.55) hop = 0.3 * Math.sin(Math.PI * (tt - 0.15) / 0.4);
      mouth = tt > 0.3 && tt < 1.3 && Math.sin(tt * 16) > 0;
      bubble = pop((tt - 0.3) / 0.35) * (1 - smoothstep((tt - (TALK - 0.35)) / 0.3));
    } else {                                 // walk out to the right
      const u = (t - WALK_IN - TALK) / WALK_OUT;
      x = mid + (end - mid) * u * u;
      moving = true;
    }
    const walk = (x - start) / sx * 3.4;
    drawCat(x, gy, s, t, walk, moving, hop, mouth);
    drawBubble(x + 1.3 * sx, gy - (2.45 + 0.3 + hop) * s, bubble);
  }

  // ================================================================ display
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  let gw = 6, gh = 11, atlas = null, atlasChars = 0, image = null, bgLevel = Math.round(TINT * 256);

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
    atlas = new Uint8Array(CHARS.length * gw * gh);
    for (let i = 0; i < CHARS.length; i++)
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++)
        atlas[(i * gh + y) * gw + x] = d[(y * cv.width + i * gw + x) * 4];
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
    textCache.clear();
  }

  function compose() {
    if (atlasChars !== CHARS.length) buildAtlas(Math.round(gh / 1.12));
    const W = canvas.width, data = image.data;
    new Uint32Array(data.buffer).fill(0xff000000);
    const gsz = gw * gh, bg = bgLevel;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c, R = RGB[k * 3], G = RGB[k * 3 + 1], Bc = RGB[k * 3 + 2];
        if ((R | G | Bc) === 0) continue;
        const go = IDX[k] * gsz;
        let p = ((r * gh) * W + c * gw) * 4;
        for (let y = 0; y < gh; y++, p += (W - gw) * 4) {
          for (let x = 0; x < gw; x++, p += 4) {
            const w = bg + ((atlas[go + y * gw + x] * (256 - bg)) >> 8);
            data[p] = (R * w) >> 8; data[p + 1] = (G * w) >> 8; data[p + 2] = (Bc * w) >> 8;
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  // ---------------------------------------------------------------- loop
  const bouquet = makeBouquet(SEED);
  let t = 0, last = performance.now(), paused = false;

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
    t = INTRO ? INTRO_END : 0;
    paused = false;
    setButton(false);
  }
  if (rebloomBtn) rebloomBtn.addEventListener("click", rebloom);

  function renderFrame(time) {
    IDX.fill(0); RGB.fill(0);
    drawStars(time);
    if (INTRO && time < INTRO_END) {
      drawIntro(time);
      setButton(false);
    } else {
      const tb = INTRO ? time - INTRO_END : time;
      drawBouquet(bouquet, tb);
      drawMessage(tb);
      setButton(tb > BLOOMED_AT);
    }
    compose();
  }

  function tick(now) {
    const dt = Math.min(0.25, (now - last) / 1000);   // keeps real speed on slow phones, no jump after a tab switch
    last = now;
    if (!paused) t += dt;
    renderFrame(t);
    requestAnimationFrame(tick);
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { paused = !paused; e.preventDefault(); }
    if (e.key === "r" || e.key === "R") t = 0;
  });

  // debugging / screenshots: window.renderAt(seconds) draws one frame and pauses
  window.renderAt = (sec) => { paused = true; t = sec; renderFrame(t); };

  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(`700 120px "Comic Neue"`), new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();
  fontReady.catch(() => {}).then(() => {
    layout();
    last = performance.now();
    requestAnimationFrame(tick);
  });
})();
