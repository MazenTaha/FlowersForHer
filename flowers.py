"""
Flowers For Her - an animated ASCII lily bouquet.

A small 3D bouquet of lilies (with buds, stems, leaves and a ribbon bow) is
built from point clouds with numpy, lit, projected and drawn as coloured ASCII
characters. The stems grow, the lilies bloom open one after another and stay
open, swaying gently, while stars twinkle behind them.

Run:
    python flowers.py                     # window (needs pygame)
    python flowers.py --terminal          # draw in the terminal instead
    python flowers.py --message "For you" # optional line under the bouquet

Keys (window): Space = pause, S = save screenshot, Esc / Q = quit.
"""

import argparse
import math
import os
import shutil
import sys
import time

import numpy as np

TAU = 2 * math.pi

# Light -> dense. Brightness of a cell picks the character.
RAMP = ".:-=+*#%@"
STAR_CHARS = ".'+*"

# Every character that can appear; index 0 is an empty cell.
CHARS = [" "]


def char_index(ch):
    if ch not in CHARS:
        CHARS.append(ch)
    return CHARS.index(ch)


RAMP_IDX = np.array([char_index(c) for c in RAMP])
STAR_IDX = np.array([char_index(c) for c in STAR_CHARS])

# Lily colours: petal middle, petal edge, throat (centre), speckles
PALETTE = [
    ((236, 64, 140), (255, 228, 240), (236, 240, 160), (130, 15, 60)),   # stargazer pink
    ((252, 252, 250), (255, 255, 255), (214, 238, 150), (205, 110, 140)),# white
    ((250, 150, 196), (255, 232, 244), (246, 240, 175), (185, 55, 110)), # soft pink
    ((252, 168, 118), (255, 226, 196), (250, 225, 140), (165, 65, 35)),  # peach
    ((250, 214, 84), (255, 244, 176), (240, 232, 120), (170, 90, 30)),   # yellow
    ((244, 98, 122), (255, 200, 212), (250, 222, 150), (140, 25, 45)),   # rose
]
BUD_GREEN = np.array([140.0, 190.0, 100.0])
RIBBON = np.array([245.0, 120.0, 170.0])

BLOOM_TIME = 3.5   # seconds for one lily to open


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def normalize(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def bloom_curve(tau):
    """0 = closed bud, 1 = fully open. Opens once and stays open."""
    return smoothstep(tau / BLOOM_TIME)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def basis(axis):
    """Two unit vectors perpendicular to each axis (F,3)."""
    helper = np.where(np.abs(axis[:, 2:3]) < 0.9, [[0.0, 0.0, 1.0]], [[1.0, 0.0, 0.0]])
    e1 = normalize(np.cross(axis, helper))
    e2 = np.cross(axis, e1)
    return e1, e2


# ===================================================================== intro
# A cute 2D cat walks in from the left, stops in the middle, says the name in
# a comic speech bubble, then walks out to the right. Then the flowers grow.

WALK_IN, TALK, WALK_OUT = 4.0, 3.0, 3.2          # seconds
INTRO_END = WALK_IN + TALK + WALK_OUT

# calico cat: white fur with orange and black patches
CAL_WHITE = np.array([250.0, 246.0, 238.0])
CAL_ORANGE = np.array([242.0, 150.0, 60.0])
CAL_BLACK = np.array([74.0, 64.0, 70.0])
PINK = np.array([255.0, 140.0, 172.0])
EYE_GREEN = np.array([135.0, 200.0, 95.0])
EYE = np.array([30.0, 22.0, 28.0])
WHITE = np.array([255.0, 255.0, 255.0])


def _ellipse(X, Y, cx, cy, rx, ry):
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0


def _capsule(X, Y, ax, ay, bx, by, r):
    dx, dy = bx - ax, by - ay
    h = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
    return (X - ax - h * dx) ** 2 + (Y - ay - h * dy) ** 2 <= r * r


def _triangle(X, Y, p0, p1, p2):
    def side(a, b):
        return (X - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (Y - b[1])
    d1, d2, d3 = side(p0, p1), side(p1, p2), side(p2, p0)
    return ~(((d1 < 0) | (d2 < 0) | (d3 < 0)) & ((d1 > 0) | (d2 > 0) | (d3 > 0)))


def _outline(mask):
    inner = (mask & np.roll(mask, 1, 0) & np.roll(mask, -1, 0)
             & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
    edge = mask & ~inner
    edge[0, :] |= mask[0, :]
    edge[-1, :] |= mask[-1, :]
    edge[:, 0] |= mask[:, 0]
    edge[:, -1] |= mask[:, -1]
    return edge


def draw_cat(idx, rgb, cx, gy, s, aspect, t, walk, moving, hop, mouth_open):
    """Draw the cat with its body centre at column cx and feet on row gy.
    s = rows per cat unit; the cat is about 2.6 units tall, facing right."""
    rows, cols = idx.shape
    sx = s * aspect
    c0, c1 = max(0, int(cx - 2.1 * sx)), min(cols, int(cx + 2.2 * sx) + 1)
    r0, r1 = max(0, int(gy - 3.0 * s - hop * s)), min(rows, int(gy + 0.3 * s) + 1)
    if c0 >= c1 or r0 >= r1:
        return
    X, Y = np.meshgrid((np.arange(c0, c1) + 0.5 - cx) / sx, (gy - (np.arange(r0, r1) + 0.5)) / s)
    Y = Y - hop
    bob = 0.05 * abs(math.sin(walk)) if moving else 0.025 * math.sin(t * 2.2)
    Yb = Y - bob
    col = np.zeros(X.shape + (3,))
    mask = np.zeros(X.shape, bool)

    def paint(m, c):
        mask[m] = True
        col[m] = c

    # legs: far ones first (darker), near ones after the body
    def leg(lx, ph, shade, top=None):
        sw = math.sin(walk + ph) if moving else 0.0
        lift = 0.12 * max(0.0, math.cos(walk + ph)) if moving else 0.0
        fx = lx + 0.2 * sw
        limb = _capsule(X, Yb, lx, 0.62, fx, 0.12 + lift, 0.13)
        paint(limb, CAL_WHITE * shade)
        if top is not None:                       # coloured patch on the upper leg
            paint(limb & (Yb > 0.36), top * shade)
        paint(_ellipse(X, Yb, fx + 0.05, 0.09 + lift, 0.17, 0.095), CAL_WHITE * shade)

    leg(0.68, math.pi, 0.75)
    leg(-0.47, 0.0, 0.75, CAL_ORANGE)

    # tail: orange and black bands
    wag = math.sin(t * (3.0 if moving else 5.0)) * 0.3
    pts = [(-0.92 - 0.42 * u + wag * u * u, 0.98 + 1.15 * u - 0.15 * u ** 3) for u in np.linspace(0, 1, 14)]
    for k in range(len(pts) - 1):
        u = k / (len(pts) - 1)
        c = CAL_BLACK if (k // 3) % 2 else CAL_ORANGE
        paint(_capsule(X, Yb, *pts[k], *pts[k + 1], 0.13 - 0.04 * u), c)

    # body: white with orange and black patches
    body = _ellipse(X, Yb, 0.0, 0.95, 1.02, 0.53)
    paint(body, CAL_WHITE)
    paint(body & _ellipse(X, Yb, -0.52, 1.12, 0.5, 0.36), CAL_ORANGE)
    paint(body & _ellipse(X, Yb, 0.18, 1.24, 0.38, 0.22), CAL_BLACK)
    paint(body & _ellipse(X, Yb, 0.62, 1.08, 0.2, 0.16), CAL_ORANGE)

    leg(0.55, 0.0, 1.0)
    leg(-0.6, math.pi, 1.0, CAL_ORANGE)

    # head: big and round (chibi), one orange ear, one black ear, green eyes
    hx, hy = 1.0, 1.62
    paint(_triangle(X, Yb, (0.4, 1.95), (0.5, 2.64), (0.9, 2.2)), CAL_ORANGE)
    paint(_triangle(X, Yb, (1.1, 2.2), (1.5, 2.64), (1.6, 1.95)), CAL_BLACK)
    paint(_triangle(X, Yb, (0.51, 2.04), (0.56, 2.46), (0.81, 2.18)), PINK)
    paint(_triangle(X, Yb, (1.19, 2.18), (1.44, 2.46), (1.49, 2.04)), PINK)
    head = _ellipse(X, Yb, hx, hy, 0.74, 0.64)
    paint(head, CAL_WHITE)
    paint(head & _ellipse(X, Yb, 0.52, 1.98, 0.42, 0.3), CAL_ORANGE)
    paint(head & _ellipse(X, Yb, 1.47, 2.03, 0.36, 0.25), CAL_BLACK)
    paint(_ellipse(X, Yb, 0.56, 1.45, 0.12, 0.075), PINK)
    paint(_ellipse(X, Yb, 1.44, 1.45, 0.12, 0.075), PINK)

    blink = (t % 3.4) < 0.14
    for ex in (0.74, 1.26):
        if blink:
            paint(_capsule(X, Yb, ex - 0.1, 1.66, ex + 0.1, 1.66, 0.035), EYE)
        else:
            paint(_ellipse(X, Yb, ex, 1.66, 0.12, 0.165), EYE_GREEN)
            paint(_ellipse(X, Yb, ex, 1.65, 0.07, 0.12), EYE)
            paint(_ellipse(X, Yb, ex + 0.035, 1.72, 0.045, 0.05), WHITE)
    paint(_triangle(X, Yb, (0.93, 1.51), (1.07, 1.51), (1.0, 1.43)), PINK)
    if mouth_open:
        paint(_ellipse(X, Yb, 1.0, 1.32, 0.08, 0.07), np.array([190.0, 55.0, 80.0]))

    # light from the top, darker outline all around
    br = np.clip(0.72 + 0.28 * (Y - 0.2) / 2.2, 0.6, 1.0)
    edge = _outline(mask)
    shade = np.where(edge, 0.55, 1.0)[..., None]
    ri = np.where(edge, 6, np.clip(np.rint(5 + br * 3).astype(int), 0, len(RAMP) - 1))
    sub_i, sub_c = idx[r0:r1, c0:c1], rgb[r0:r1, c0:c1]
    sub_i[mask] = RAMP_IDX[ri][mask]
    sub_c[mask] = np.clip(col * shade * (0.8 + 0.2 * br[..., None]), 0, 255).astype(np.uint8)[mask]

    # whiskers
    dash = char_index("-")
    for x0, x1, y in ((0.27, 0.02, 1.47), (0.29, 0.05, 1.37), (1.73, 1.98, 1.47), (1.71, 1.95, 1.37)):
        n = int(abs(x1 - x0) * sx) + 1
        for k in range(n + 1):
            xx = x0 + (x1 - x0) * k / max(n, 1)
            c = int(cx + xx * sx)
            r = int(gy - (y + bob + hop) * s)
            if 0 <= r < rows and 0 <= c < cols:
                idx[r, c] = dash
                rgb[r, c] = (250, 240, 230)


_TEXT_CACHE = {}


def text_mask(text, th, aspect):
    """Big letters for the speech bubble: a (th, tw) bool mask, or None if no font."""
    key = (text, th, round(aspect, 2))
    if key not in _TEXT_CACHE:
        mask = None
        try:
            os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
            import pygame
            pygame.font.init()
            font = pygame.font.SysFont("comicsansms,arialroundedmtbold,arial", 96, bold=True)
            full = pygame.surfarray.array_alpha(font.render(text, True, (255, 255, 255)))
            xs = np.nonzero(full.max(1) > 0)[0]
            ys = np.nonzero(full.max(0) > 0)[0]
            a = full[xs[0]:xs[-1] + 1, ys[0]:ys[-1] + 1].astype(float)
            iw, ih = a.shape
            tw = max(1, int(round(iw / ih * th * aspect)))
            xi = np.arange(iw) * tw // iw
            yi = np.arange(ih) * th // ih
            acc = np.zeros((tw, th))
            cnt = np.zeros((tw, th))
            np.add.at(acc, (xi[:, None], yi[None, :]), a)
            np.add.at(cnt, (xi[:, None], yi[None, :]), 1)
            mask = (acc / np.maximum(cnt, 1) > 85).T

            # At this size the gap in "!" closes up and it looks like "l",
            # so redraw every "!" by hand: a bar, an empty row, then a dot.
            for i, ch in enumerate(text):
                if ch != "!":
                    continue
                p0, p1 = font.size(text[:i])[0], font.size(text[:i + 1])[0]
                ink = full[p0:p1]
                cols_ink = np.nonzero(ink.max(1) > 0)[0]
                rows_ink = np.nonzero(ink.max(0) > 0)[0]
                if len(cols_ink) == 0:
                    continue
                to_c = lambda px: (px - xs[0]) * tw / iw
                to_r = lambda py: (py - ys[0]) * th / ih
                mask[:, max(0, int(to_c(p0))):min(tw, int(math.ceil(to_c(p1))))] = False
                cc = to_c(p0 + (cols_ink[0] + cols_ink[-1]) / 2)
                bw = max(2, int(round(to_c(p0 + cols_ink[-1]) - to_c(p0 + cols_ink[0]))))
                c_a = int(round(cc - bw / 2))
                c_b = min(tw, c_a + bw)
                c_a = max(0, c_a)
                top = max(0, int(to_r(rows_ink[0])))
                bot = min(th - 1, int(math.ceil(to_r(rows_ink[-1] + 1))) - 1)
                dot = 2 if bot - top >= 6 else 1
                gap = 2 if bot - top >= 8 else 1
                mask[top:bot + 1, c_a:c_b] = False
                mask[top:bot + 1 - dot - gap, c_a:c_b] = True   # the bar
                mask[bot + 1 - dot:bot + 1, c_a:c_b] = True     # the dot (gap left empty)
        except Exception:
            mask = None
        _TEXT_CACHE[key] = mask
    return _TEXT_CACHE[key]


def draw_bubble(idx, rgb, text, tip_c, tip_r, aspect, k):
    """Comic speech bubble whose tail points at (tip_c, tip_r). k = pop-in scale."""
    if k <= 0.02:
        return
    rows, cols = idx.shape
    th = max(3, int(round(rows * 0.1)))
    tm = text_mask(text, th, aspect)
    if tm is None:
        th, tw = 1, len(text)
    else:
        tw = tm.shape[1]
    pad_r = max(1, int(round(th * 0.6)))
    pad_c = int(round(pad_r * aspect * 1.3)) + 1
    hh, hw = th / 2 + pad_r, tw / 2 + pad_c
    bx = min(max(tip_c + hw * 0.55, hw + 1), cols - hw - 1)
    by = max(tip_r - hh - max(2.0, th * 0.7), hh + 1)

    R, C = np.meshgrid(np.arange(rows) + 0.5, np.arange(cols) + 0.5, indexing="ij")
    bub = ((C - bx) / (hw * k)) ** 4 + ((R - by) / (hh * k)) ** 4 <= 1.0
    base_y = by + hh * k * 0.7
    tip = (bx + (tip_c - bx) * k, by + (tip_r - by) * k)
    bub |= _triangle(C, R, (bx - hw * k * 0.42, base_y), (bx - hw * k * 0.12, base_y), tip)
    edge = _outline(bub)
    idx[bub] = char_index("#")
    rgb[bub] = (255, 255, 255)
    idx[edge] = char_index("@")
    rgb[edge] = (255, 165, 200)

    if k > 0.85:
        top, left = int(round(by - th / 2)), int(round(bx - tw / 2))
        if tm is None:
            for j, ch in enumerate(text):
                if 0 <= top < rows and 0 <= left + j < cols:
                    idx[top, left + j] = char_index(ch)
                    rgb[top, left + j] = (225, 35, 115)
        else:
            rr, cc = np.nonzero(tm)
            rr, cc = rr + top, cc + left
            ok = (rr >= 0) & (rr < rows) & (cc >= 0) & (cc < cols)
            idx[rr[ok], cc[ok]] = char_index("@")
            rgb[rr[ok], cc[ok]] = (225, 35, 115)


def _pop(u):
    """Ease-out with a little overshoot, 0 -> 1."""
    u = min(max(u, 0.0), 1.0)
    c = 1.7
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2


def draw_intro(idx, rgb, t, say, aspect):
    rows, cols = idx.shape
    text_mask(say, max(3, int(round(rows * 0.1))), aspect)   # load the font early (cached)
    s = rows * 0.28 / 2.7                     # cat is ~28% of the screen height
    sx = s * aspect
    gy = rows * 0.8
    start, mid, end = -2.3 * sx, cols * 0.5 - 0.15 * sx, cols + 2.3 * sx
    hop, mouth, bubble = 0.0, False, 0.0

    if t < WALK_IN:                           # walk in, slowing down at the middle
        u = t / WALK_IN
        x = start + (mid - start) * (1 - (1 - u) ** 2)
        moving = u < 0.97
    elif t < WALK_IN + TALK:                  # stop, hop and say the name
        x, moving = mid, False
        tt = t - WALK_IN
        if 0.15 < tt < 0.55:
            hop = 0.3 * math.sin(math.pi * (tt - 0.15) / 0.4)
        mouth = 0.3 < tt < 1.3 and math.sin(tt * 16) > 0
        bubble = _pop((tt - 0.3) / 0.35) * (1.0 - smoothstep((tt - (TALK - 0.35)) / 0.3))
    else:                                     # walk out to the right
        u = (t - WALK_IN - TALK) / WALK_OUT
        x = mid + (end - mid) * u * u
        moving = True
    walk = (x - start) / sx * 3.4

    draw_cat(idx, rgb, x, gy, s, aspect, t, walk, moving, hop, mouth)
    draw_bubble(idx, rgb, say, x + 1.3 * sx, gy - (2.75 + hop) * s, aspect, bubble)


class Bouquet:
    NU, NV = 36, 13       # samples along / across a petal
    NT, NA = 120, 6       # samples along / around a stem
    NS, NVL = 60, 9       # samples along / across a leaf

    def __init__(self, seed=7, message="", say="Asmaa!", intro=True):
        rng = np.random.default_rng(seed)
        self.message = message
        self.msg_idx = [char_index(c) for c in message]
        self.say = say
        self.intro = intro and bool(say)
        for c in say + "-#@":
            char_index(c)

        # ---- flower heads (x, y in the bouquet, size, colour, how far it opens)
        #      big open lilies facing you, a few buds and half-open buds on top
        heads = [
            (0.00, 0.80, 0.72, 0, 1.0),
            (-0.98, 0.42, 0.66, 2, 1.0),
            (0.98, 0.48, 0.66, 1, 1.0),
            (-0.50, -0.30, 0.70, 1, 1.0),
            (0.52, -0.26, 0.70, 0, 1.0),
            (-1.30, -0.62, 0.58, 3, 1.0),
            (1.30, -0.58, 0.58, 2, 1.0),
            (-0.50, 1.55, 0.36, 5, 0.38),    # half-open buds
            (0.60, 1.50, 0.36, 4, 0.30),
            (-1.55, 1.05, 0.32, 0, 0.08),    # closed buds
            (1.55, 1.10, 0.32, 3, 0.08),
            (0.05, 1.85, 0.30, 2, 0.06),
        ]
        center = np.array([0.0, 2.55, 0.0])
        F = self.F = len(heads)
        hx = np.array([h[0] for h in heads])
        hy = np.array([h[1] for h in heads])
        hz = 0.25 - 0.22 * hy + rng.uniform(-0.05, 0.05, F)   # lower flowers sit in front
        self.head0 = center + np.stack([hx, hy, hz], -1)
        bud = np.array([h[4] for h in heads]) < 0.5
        self.axis0 = normalize(np.stack([hx * (0.28 + bud * 0.2), hy * 0.3 + 0.2 + bud * 0.7, 1.0 - bud * 0.55], -1))
        self.size = np.array([h[2] for h in heads])
        self.emax = np.array([h[4] for h in heads])
        colours = [PALETTE[h[3]] for h in heads]
        self.base_col = np.array([c[0] for c in colours], float)
        self.edge_col = np.array([c[1] for c in colours], float)
        self.throat_col = np.array([c[2] for c in colours], float)
        self.speck_col = np.array([c[3] for c in colours], float)
        # lilies open one after another, from the middle outwards
        order = np.argsort(np.hypot(hx, hy - 0.3))
        self.phase = np.empty(F)
        self.phase[order] = 2.6 + np.arange(F) * 0.45
        self.petal_rot = rng.uniform(0, TAU, F)
        self.wind_phase = rng.uniform(0, TAU, F)
        self.stem_base = np.stack([rng.uniform(-0.07, 0.07, F), np.zeros(F), rng.uniform(-0.07, 0.07, F)], -1)
        self.stem_col = np.array([60, 140, 50]) * rng.uniform(0.85, 1.15, (F, 1))

        # ---- petal parameter grids
        self.u = np.linspace(0, 1, self.NU)
        self.v = np.linspace(-1, 1, self.NV)
        U = self.u[None, None, :, None]
        self.theta = 0.30 * math.pi + 0.45 * math.pi * U ** 2   # open petal curls back at the tip
        du = 1.0 / (self.NU - 1)
        self.cr = np.cumsum(np.sin(self.theta), axis=2) * du
        self.cz = np.cumsum(np.cos(self.theta), axis=2) * du
        alt = np.array([1.0, 0.8, 1.0, 0.8, 1.0, 0.8])[None, :, None, None]
        self.wf = 1.8 - alt                             # 3 wide petals + 3 narrower sepals
        self.lf = 0.96 + 0.04 * (alt - 0.8) / 0.2
        self.rf = 0.96 + 0.04 * (alt - 0.8) / 0.2
        V = self.v[None, None, None, :]
        self.speck = ((rng.random((F, 6, self.NU, self.NV)) < 0.09)
                      & (U > 0.1) & (U < 0.5) & (np.abs(V) < 0.6))

        # ---- leaves around the bottom of the bundle
        NL = 16
        laz = np.arange(NL) * TAU / NL + rng.uniform(-0.15, 0.15, NL)
        ly = rng.uniform(0.1, 0.7, NL)
        lr = 0.06 + 0.12 * ly
        self.leaf_anchor = np.stack([lr * np.cos(laz), ly, lr * np.sin(laz)], -1)
        self.leaf_dir = np.stack([np.cos(laz), np.zeros(NL), np.sin(laz)], -1)
        self.leaf_len = rng.uniform(0.8, 1.5, NL)
        self.leaf_rise = rng.uniform(0.9, 1.7, NL)
        self.leaf_w = rng.uniform(0.07, 0.12, NL)
        self.leaf_twist = rng.uniform(-1.2, 1.2, NL)
        self.leaf_col = np.array([45, 130, 50]) * rng.uniform(0.8, 1.25, (NL, 1))
        self.leaf_phase = rng.uniform(0, TAU, NL)

        self._stars_key = None

    # ------------------------------------------------------------------ scene
    def _points(self, t):
        """All coloured 3D points of the bouquet at time t."""
        F = self.F
        parts = []
        g = float(smoothstep(t / 3.0))            # intro: everything grows up

        # wind
        wp = self.wind_phase
        hy = self.head0[:, 1:2] / 3.0
        wind = np.stack([0.045 * np.sin(1.1 * t + wp) + 0.015 * np.sin(2.3 * t + 2 * wp),
                         0.012 * np.sin(1.7 * t + wp),
                         0.03 * np.sin(0.9 * t + 1.7 * wp)], -1) * hy
        head_final = self.head0 + wind
        axis = normalize(self.axis0 + wind * 0.8)

        # ---- stems (cubic bezier tubes)
        P0 = self.stem_base
        P3 = head_final
        P2 = P3 - axis * 0.3 - [0.0, 0.7, 0.0]
        P1 = np.stack([0.08 * P3[:, 0], np.full(F, 0.95), 0.08 * P3[:, 2]], -1) + P0 * 0.5
        ts = np.linspace(0, 1, self.NT) * g
        T = ts[None, :, None]
        Bz = ((1 - T) ** 3 * P0[:, None] + 3 * (1 - T) ** 2 * T * P1[:, None]
              + 3 * (1 - T) * T ** 2 * P2[:, None] + T ** 3 * P3[:, None])
        D = (3 * (1 - T) ** 2 * (P1 - P0)[:, None] + 6 * (1 - T) * T * (P2 - P1)[:, None]
             + 3 * T ** 2 * (P3 - P2)[:, None])
        Tn = normalize(D)
        Nn = normalize(np.cross(Tn, [0.0, 0.0, 1.0]))
        Bn = np.cross(Tn, Nn)
        ang = np.linspace(0, TAU, self.NA, endpoint=False)
        ring = (np.cos(ang)[None, None, :, None] * Nn[:, :, None]
                + np.sin(ang)[None, None, :, None] * Bn[:, :, None])
        radius = (0.028 - 0.01 * ts)[None, :, None, None]
        sp = Bz[:, :, None] + radius * ring
        scol = self.stem_col[:, None, None, :] * (0.7 + 0.4 * ts)[None, :, None, None]
        parts.append((sp, ring, np.broadcast_to(scol, sp.shape), -1.0, 100 + np.arange(F)[:, None, None]))

        # ---- leaves
        s = np.linspace(0, 1, self.NS)[None, :, None]
        v = np.linspace(-1, 1, self.NVL)[None, None, :]
        up = np.array([0.0, 1.0, 0.0])
        d = self.leaf_dir[:, None, None, :]
        side = normalize(np.cross(self.leaf_dir, up))[:, None, None, :]
        ln = (self.leaf_len * g)[:, None, None]
        rise = self.leaf_rise[:, None, None]
        center = (self.leaf_anchor[:, None, None, :] + d * (ln * s)[..., None]
                  + up * (ln * (rise * s - (rise + 0.1) * s ** 2))[..., None])
        w = (self.leaf_w * g)[:, None, None] * np.sin(np.pi * s ** 0.6) ** 0.8
        tw = (self.leaf_twist[:, None, None] * s)[..., None]
        side_t = np.cos(tw) * side + np.sin(tw) * up
        lp = center + side_t * (v * w)[..., None] + up * (0.35 * w * v ** 2)[..., None]
        lw = np.sin(1.2 * t + self.leaf_phase)[:, None, None, None]
        lp = lp + np.array([0.05, 0.0, 0.03]) * lw * (s ** 2 * ln)[..., None]
        ln_ = np.cross(np.gradient(lp, axis=1), np.gradient(lp, axis=2))
        lcol = self.leaf_col[:, None, None, :] * np.where(np.abs(v) < 0.12, 1.3, 0.9 + 0.2 * (1 - np.abs(v)))[..., None]
        parts.append((lp, ln_, np.broadcast_to(lcol, lp.shape), -1.0, 200 + np.arange(len(lp))[:, None, None]))

        # ---- flower heads
        hs = float(smoothstep((g - 0.55) / 0.45))
        if hs > 0:
            head = Bz[:, -1]
            # bloom once, then "breathe" very gently while open
            breathe = 1.0 - 0.035 * (0.5 + 0.5 * np.sin(1.3 * t + self.wind_phase))
            e = (bloom_curve(t - self.phase) * self.emax * breathe)[:, None, None, None]
            L = (self.size * hs)[:, None, None, None]
            U = self.u[None, None, :, None]
            V = self.v[None, None, None, :]

            # closed bud: petals wrap into a pointed oval
            dv = V * (math.pi / 6) * 1.04
            R = L * 0.31 * self.rf * np.sin(math.pi * U ** 0.85) ** 0.75
            Ac, Bc, Cc = R * np.cos(dv), R * np.sin(dv), L * 1.05 * self.lf * U
            # open lily: petals spread and curl back, edges lifted
            th = self.theta
            wdt = L * 0.25 * self.wf * np.sin(math.pi * U ** 0.65) ** 0.85
            gr = 0.3 * wdt * V ** 2
            Ao = L * self.lf * (0.06 + self.cr) - np.cos(th) * gr
            Bo = V * wdt
            Co = L * self.lf * self.cz + np.sin(th) * gr
            A = Ac + (Ao - Ac) * e
            B = Bc + (Bo - Bc) * e
            C = Cc + (Co - Cc) * e

            e1, e2 = basis(axis)
            phi = self.petal_rot[:, None] + np.arange(6)[None, :] * (math.pi / 3)
            rk = np.cos(phi)[..., None] * e1[:, None] + np.sin(phi)[..., None] * e2[:, None]
            tk = -np.sin(phi)[..., None] * e1[:, None] + np.cos(phi)[..., None] * e2[:, None]
            pos = (head[:, None, None, None, :]
                   + A[..., None] * rk[:, :, None, None, :]
                   + B[..., None] * tk[:, :, None, None, :]
                   + C[..., None] * axis[:, None, None, None, :])
            nrm = np.cross(np.gradient(pos, axis=2), np.gradient(pos, axis=3))

            # lily colouring: strong colour down the middle, pale edges,
            # green-yellow throat, dark speckles near the centre
            base = self.base_col[:, None, None, None, :]
            edge = self.edge_col[:, None, None, None, :]
            em = (np.clip(np.abs(V) * 1.15, 0, 1) ** 1.6 * 0.85)[..., None]
            col = base * (1 - em) + edge * em
            tb = (np.clip(1 - U / 0.32, 0, 1) ** 1.4)[..., None]
            col = col * (1 - tb) + self.throat_col[:, None, None, None, :] * tb
            col = np.where(self.speck[..., None], self.speck_col[:, None, None, None, :], col)
            gmix = ((1 - e) * 0.35)[..., None]
            col = col * (1 - gmix) + BUD_GREEN * gmix
            parts.append((pos, nrm, col, -1.0, np.arange(F)[:, None, None, None]))

            # stamens + pistil for flowers that are open enough
            open_ = e[:, 0, 0, 0] > 0.2
            if open_.any():
                hd, ax, ee = head[open_], axis[open_], e[open_, 0, 0, 0]
                sz = self.size[open_] * hs
                a1, a2 = e1[open_], e2[open_]
                ph = phi[open_] + math.pi / 6
                rs = np.cos(ph)[..., None] * a1[:, None] + np.sin(ph)[..., None] * a2[:, None]
                sl = np.linspace(0, 1, 18)[None, None, :, None]
                Ls = (sz * 0.72 * ee)[:, None, None, None]
                fil = hd[:, None, None, :] + ax[:, None, None, :] * (Ls * 0.8 * sl) + rs[:, :, None, :] * (Ls * 0.62 * sl ** 1.4)
                fid = np.nonzero(open_)[0]
                parts.append((fil, None, np.broadcast_to([215.0, 235.0, 170.0], fil.shape), 0.85, fid[:, None, None]))
                off = np.array([[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                                [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0]], float)
                anth = fil[:, :, -1:, :] + off[None, None] * (0.032 * sz)[:, None, None, None]
                parts.append((anth, None, np.broadcast_to([190.0, 80.0, 30.0], anth.shape), 0.7, fid[:, None, None]))
                sl2 = np.linspace(0, 1, 18)[None, :, None]
                Lp = (sz * 0.7 * ee)[:, None, None]
                pis = hd[:, None, :] + ax[:, None, :] * (Lp * sl2) + a1[:, None, :] * (0.08 * Lp * sl2 ** 2)
                parts.append((pis, None, np.broadcast_to([200.0, 225.0, 140.0], pis.shape), 0.75, fid[:, None]))
                stg = pis[:, -1:, :] + off[None, :5] * (0.03 * sz)[:, None, None]
                parts.append((stg, None, np.broadcast_to([120.0, 155.0, 60.0], stg.shape), 0.55, fid[:, None]))

        # ---- a ribbon bow tying the stems together
        if g > 0.3:
            k = float(smoothstep((g - 0.3) / 0.5))
            bc = np.array([0.0, 1.05, 0.0])
            a = np.linspace(0, TAU, 56, endpoint=False)[:, None]
            h = np.linspace(-0.07, 0.07, 6)[None, :]
            rad = 0.15 * k
            band_n = np.stack([np.cos(a) + 0 * h, 0 * a + 0 * h, np.sin(a) + 0 * h], -1)
            band = bc + band_n * rad + np.stack([0 * a + 0 * h, h * k + 0 * a, 0 * a + 0 * h], -1)
            parts.append((band, band_n, np.broadcast_to(RIBBON, band.shape), -1.0, 300))
            front = bc + [0.0, 0.0, rad + 0.06]
            # two loops (tubes) and two tails (strips)
            la = np.linspace(0, TAU, 48)[:, None]
            ta = np.linspace(0, TAU, 8, endpoint=False)[None, :]
            for sgn in (-1.0, 1.0):
                cl = np.stack([sgn * 0.21 * (1 - np.cos(la)) * k, 0.13 * np.sin(la) * k, 0 * la + 0.03], -1)
                tan = normalize(np.stack([sgn * 0.21 * np.sin(la), 0.13 * np.cos(la), 0 * la], -1))
                side = np.stack([tan[..., 1], -tan[..., 0], 0 * la], -1)       # in-plane normal
                tube_n = np.cos(ta)[..., None] * side + np.sin(ta)[..., None] * np.array([0.0, 0.0, 1.0])
                loop = front + cl + 0.045 * k * tube_n
                parts.append((loop, tube_n, np.broadcast_to(RIBBON * 1.05, loop.shape), -1.0, 301))
                s2 = np.linspace(0, 1, 30)[:, None]
                w2 = np.linspace(-1, 1, 5)[None, :]
                tail = front + np.stack([sgn * (0.05 + 0.12 * s2) * k + 0.035 * w2 * k,
                                         -0.42 * s2 * k + 0 * w2,
                                         0.02 + 0.04 * np.sin(s2 * 6 + t) * s2 + 0 * w2], -1)
                tail_n = np.cross(np.gradient(tail, axis=0), np.gradient(tail, axis=1))
                parts.append((tail, tail_n, np.broadcast_to(RIBBON * 0.95, tail.shape), -1.0, 302))
            knot = front + np.stack([0.04 * np.cos(la) * k + 0 * ta, 0.04 * np.sin(la) * k + 0 * ta,
                                     0.05 + 0.01 * np.sin(ta) + 0 * la], -1)
            parts.append((knot, None, np.broadcast_to(RIBBON * 1.1, knot.shape), 0.85, 303))

        # P: positions, N: normals, C: colours, FL: fixed brightness (-1 = lit), ID: object id
        P = np.concatenate([p.reshape(-1, 3) for p, *_ in parts])
        N = np.concatenate([(n if n is not None else np.zeros_like(p)).reshape(-1, 3) for p, n, *_ in parts])
        C = np.concatenate([np.asarray(c, float).reshape(-1, 3) for _, _, c, *_ in parts])
        FL = np.concatenate([np.full(p.size // 3, f) for p, _, _, f, _ in parts])
        ID = np.concatenate([np.broadcast_to(i, p.shape[:-1]).reshape(-1) for p, _, _, _, i in parts])
        return P, N, C, FL, ID

    # ------------------------------------------------------------- rendering
    def _stars(self, cols, rows):
        key = (cols, rows)
        if self._stars_key != key:
            rng = np.random.default_rng(3)
            n = int(cols * rows * 0.006)
            pastel = np.array([[255, 200, 228], [222, 208, 255], [255, 250, 236], [200, 236, 255]])
            self._star_data = (rng.integers(0, rows, n), rng.integers(0, cols, n),
                               rng.uniform(0, TAU, n), rng.uniform(0.6, 2.2, n),
                               pastel[rng.integers(0, len(pastel), n)])
            self._stars_key = key
        return self._star_data

    def frame(self, t, cols, rows, aspect=2.0):
        """Return (char index grid (rows, cols), colour grid (rows, cols, 3) uint8)."""
        idx = np.zeros((rows, cols), np.int32)
        rgb = np.zeros((rows, cols, 3), np.uint8)

        # twinkling stars behind the bouquet
        sy, sx, sph, ssp, scol = self._stars(cols, rows)
        sb = 0.12 + 0.88 * (0.5 + 0.5 * np.sin(ssp * t + sph)) ** 3
        idx[sy, sx] = STAR_IDX[np.minimum((sb * len(STAR_IDX)).astype(int), len(STAR_IDX) - 1)]
        rgb[sy, sx] = (sb[:, None] * scol * 0.85).astype(np.uint8)

        # intro: the cat walks by and says hi, then the bouquet starts growing
        if self.intro:
            if t < INTRO_END:
                draw_intro(idx, rgb, t, self.say, aspect)
                return idx, rgb
            t = t - INTRO_END

        P, N, C, FL, ID = self._points(t)

        # camera: gentle sway around the vertical axis, looking slightly down
        R = rot_x(0.16) @ rot_y(0.22 * math.sin(TAU * t / 20.0))
        Pc = (P - [0.0, 2.2, 0.0]) @ R.T
        x, y, z = Pc[:, 0], Pc[:, 1], Pc[:, 2]
        f = 12.0 / (12.0 - z)
        scale = min(rows / 4.9, cols / (4.4 * aspect))
        ix = np.floor(cols / 2 + x * f * scale * aspect).astype(np.int64)
        iy = np.floor(rows / 2 - y * f * scale).astype(np.int64)
        ok = (ix >= 0) & (ix < cols) & (iy >= 0) & (iy < rows)

        # z-buffer: keep the nearest point in every cell
        key = iy[ok] * cols + ix[ok]
        sel = np.nonzero(ok)[0]
        order = np.lexsort((-z[sel], key))
        ks = key[order]
        first = np.ones(len(ks), bool)
        first[1:] = ks[1:] != ks[:-1]
        win = sel[order[first]]
        cell = ks[first]

        # lighting
        n = normalize(N[win] @ R.T)
        light = normalize(np.array([-0.35, 0.5, 0.8]))
        half = normalize(light + [0.0, 0.0, 1.0])
        lam = np.abs(n @ light)
        spec = np.abs(n @ half) ** 30
        br = 0.22 + 0.78 * lam ** 1.1 + 0.3 * spec
        br = np.where(FL[win] >= 0, FL[win], br)
        br *= 0.78 + 0.22 * np.clip((z[win] + 2) / 4, 0, 1)
        br = np.clip(br, 0, 1)

        # shimmer: characters flicker a little every frame
        jitter = np.random.randint(-1, 2, len(br)) * (np.random.random(len(br)) < 0.04)
        ri = np.clip(np.rint(br * (len(RAMP) - 1)).astype(int) + jitter, 0, len(RAMP) - 1)
        col = np.clip(C[win] * (0.55 + 0.75 * br)[:, None], 0, 255).astype(np.uint8)

        # outlines: darken a cell when a different, nearer object sits next to it
        zg = np.full(rows * cols, -1e9)
        zg[cell] = z[win]
        ig = np.full(rows * cols, -1)
        ig[cell] = ID[win]
        zg, ig = zg.reshape(rows, cols), ig.reshape(rows, cols)
        edge = np.zeros((rows, cols), bool)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            zn = np.roll(zg, (dy, dx), (0, 1))
            inn = np.roll(ig, (dy, dx), (0, 1))
            edge |= (inn >= 0) & (inn != ig) & (zn > zg + 0.04)
        e_cell = edge.reshape(-1)[cell]
        ri = np.where(e_cell, np.maximum(ri - 3, 0), ri)
        col = np.where(e_cell[:, None], (col * 0.55).astype(np.uint8), col)

        idx.reshape(-1)[cell] = RAMP_IDX[ri]
        rgb.reshape(-1, 3)[cell] = col

        # optional message under the bouquet
        if self.msg_idx and rows > 4:
            r = rows - 2
            c0 = max(0, (cols - len(self.msg_idx)) // 2)
            pulse = 0.8 + 0.2 * math.sin(t * 2.0)
            for k, ci in enumerate(self.msg_idx[: cols - c0]):
                idx[r, c0 + k] = ci
                rgb[r, c0 + k] = (np.array([255, 150, 190]) * pulse).astype(np.uint8)
        return idx, rgb


# ---------------------------------------------------------------- terminal
def to_ansi(idx, rgb, tint):
    chars = np.array(CHARS, dtype=object)[idx]
    q = ((rgb // 8) * 8).astype(np.int32)
    bg = (q * tint).astype(np.int32)
    q, bg = q.tolist(), bg.tolist()
    use_bg = tint > 0
    lines = []
    for r in range(idx.shape[0]):
        crow, qrow, brow = chars[r], q[r], bg[r]
        out, last = [], None
        for c in range(idx.shape[1]):
            ch = crow[c]
            if ch == " ":
                if use_bg and last is not None:
                    out.append("\x1b[48;2;0;0;0m")
                    last = None
            else:
                cc = qrow[c]
                key = (cc, brow[c]) if use_bg else cc
                if key != last:
                    if use_bg:
                        b = brow[c]
                        out.append("\x1b[38;2;%d;%d;%d;48;2;%d;%d;%dm" % (cc[0], cc[1], cc[2], b[0], b[1], b[2]))
                    else:
                        out.append("\x1b[38;2;%d;%d;%dm" % (cc[0], cc[1], cc[2]))
                    last = key
            out.append(ch)
        if use_bg and last is not None:
            out.append("\x1b[48;2;0;0;0m")
        lines.append("".join(out))
    return "\n".join(lines)


def run_terminal(bq, args):
    if os.name == "nt":
        os.system("")  # turn on ANSI escape handling in the Windows console
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    out = sys.stdout

    if args.save:
        cols, rows = shutil.get_terminal_size((120, 45))
        idx, rgb = bq.frame(args.at, cols, rows - 1, args.aspect)
        with open(args.save, "w", encoding="utf-8") as fh:
            fh.write("\n".join("".join(CHARS[i] for i in row) for row in idx))
        print("saved", args.save)
        return

    out.write("\x1b[?1049h\x1b[?25l\x1b[48;2;0;0;0m\x1b[2J")
    last_size = None
    try:
        t0 = time.perf_counter()
        while True:
            start = time.perf_counter()
            size = shutil.get_terminal_size((120, 45))
            cols, rows = size.columns, size.lines - 1
            if size != last_size:
                out.write("\x1b[48;2;0;0;0m\x1b[2J")
                last_size = size
            idx, rgb = bq.frame(start - t0, cols, rows, args.aspect)
            out.write("\x1b[H\x1b[48;2;0;0;0m" + to_ansi(idx, rgb, args.tint))
            out.flush()
            time.sleep(max(0.0, 1.0 / args.fps - (time.perf_counter() - start)))
    except KeyboardInterrupt:
        pass
    finally:
        out.write("\x1b[0m\x1b[2J\x1b[H\x1b[?25h\x1b[?1049l")
        out.flush()


# ------------------------------------------------------------------ window
def run_window(bq, args):
    import pygame

    pygame.init()
    font = pygame.font.SysFont("consolas,menlo,dejavusansmono,couriernew,monospace", args.font_size, bold=True)
    gw, gh = font.size("@")

    if args.save:
        W, H = args.width or 900, args.height or 1000
    else:
        info = pygame.display.Info()
        H = args.height or int(info.current_h * 0.82)
        W = args.width or int(H * 0.9)
    cols, rows = W // gw, H // gh

    # glyph atlas: one greyscale coverage mask per character
    atlas = np.zeros((len(CHARS), gw, gh), np.uint16)
    for i, ch in enumerate(CHARS):
        if ch == " ":
            continue
        a = pygame.surfarray.array3d(font.render(ch, True, (255, 255, 255), (0, 0, 0)))[:, :, 0]
        w, h = min(gw, a.shape[0]), min(gh, a.shape[1])
        atlas[i, :w, :h] = a[:w, :h]
    bg_level = int(np.clip(args.tint, 0, 1) * 256)

    def compose(t):
        idx, rgb = bq.frame(t, cols, rows, gh / gw)
        glyph = atlas[idx].transpose(1, 2, 0, 3)                  # (cols, gw, rows, gh)
        colr = rgb.transpose(1, 0, 2).astype(np.uint16)[:, None, :, None, :]
        # character in full colour on a dim tint of the same colour
        weight = bg_level + ((glyph * (256 - bg_level)) >> 8)
        img = (weight[..., None] * colr) >> 8
        return img.reshape(cols * gw, rows * gh, 3).astype(np.uint8)

    if args.save:
        surf = pygame.Surface((cols * gw, rows * gh))
        pygame.surfarray.blit_array(surf, compose(args.at))
        pygame.image.save(surf, args.save)
        print("saved", args.save)
        return

    screen = pygame.display.set_mode((cols * gw, rows * gh))
    pygame.display.set_caption("Flowers for her")
    clock = pygame.time.Clock()
    t, paused, shots = 0.0, False, 0
    running = True
    while running:
        dt = clock.tick(args.fps) / 1000.0
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
            elif ev.type == pygame.KEYDOWN:
                if ev.key in (pygame.K_ESCAPE, pygame.K_q):
                    running = False
                elif ev.key == pygame.K_SPACE:
                    paused = not paused
                elif ev.key == pygame.K_s:
                    shots += 1
                    pygame.image.save(screen, "flowers_%d.png" % shots)
        if not paused:
            t += min(dt, 0.1)
        pygame.surfarray.blit_array(screen, compose(t))
        pygame.display.flip()
    pygame.quit()


def main():
    ap = argparse.ArgumentParser(description="Animated ASCII lily bouquet.")
    ap.add_argument("--terminal", action="store_true", help="draw in the terminal instead of a window")
    ap.add_argument("--message", default="", help="text shown under the bouquet")
    ap.add_argument("--say", default="Asmaa!", help="what the cat says in the intro")
    ap.add_argument("--no-intro", action="store_true", help="skip the walking cat and start with the flowers")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--font-size", type=int, default=9, help="window: character size (smaller = more detail)")
    ap.add_argument("--width", type=int, default=0, help="window width in pixels")
    ap.add_argument("--height", type=int, default=0, help="window height in pixels")
    ap.add_argument("--aspect", type=float, default=2.0, help="terminal: character height / width")
    ap.add_argument("--tint", type=float, default=0.45,
                    help="0-1: dim colour behind each character (0 = pure ASCII on black)")
    ap.add_argument("--seed", type=int, default=7, help="different seed = different bouquet")
    ap.add_argument("--save", help="render one frame to this file and exit")
    ap.add_argument("--at", type=float, default=8.0, help="time (s) of the frame for --save")
    args = ap.parse_args()

    bq = Bouquet(seed=args.seed, message=args.message, say=args.say, intro=not args.no_intro)
    if args.terminal:
        run_terminal(bq, args)
        return
    try:
        import pygame  # noqa: F401
    except ImportError:
        print("pygame not installed - drawing in the terminal (pip install pygame for the window).")
        time.sleep(1.5)
        run_terminal(bq, args)
        return
    os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
    run_window(bq, args)


if __name__ == "__main__":
    main()
