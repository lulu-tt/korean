#!/usr/bin/env python3
"""
세대별 지역어 변화 — 종이 모션(페이퍼 컷아웃) 영상 렌더러

흐름: 산속 초가집 → 전통마을 → 기와집/근대화 → 저층 도시 → 현대 도시 → 초고층 스카이라인
      (70대의 어린 시절 → 50대 → 20대)

모든 장면은 코드로 '오린 종이'를 만든다.
  · 조각(Piece)   : 한 가지 색의 종이 한 장. 가장자리를 손으로 오린 듯 흔들고, 종이결을 입히고,
                    아래 조각 위에 작은 그림자를 드리운다.
  · 레이어(Layer) : 조각 묶음(산 한 줄, 집 한 채 …). 한 장의 스프라이트로 미리 구워 두고
                    프레임마다 위치만 바꿔 붙인다 → 빠르다.
  · 움직임        : 뒤에서 앞 순서로 튀어 오르고(overshoot), 앞에서 뒤 순서로 떨어져 나간다.
                    포즈는 12fps(2프레임마다)로만 갱신하고 1px씩 떨게 해 스톱모션 느낌을 낸다.
                    카메라가 천천히 흐르며 깊이(depth)에 따라 시차(parallax)가 생긴다.

사용:
  python3 render.py                      # out/generation_change.mp4
  python3 render.py --stills 6,12,17     # 해당 초의 정지 화면만 out/still_*.png 로
  python3 render.py --sheet              # 장면별 대표 프레임 모음(out/contact_sheet.png)
"""
import argparse
import math
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
FPS = 24
STEP = 2                       # 2프레임마다 포즈 갱신 → 12fps 스톱모션
SW = 2080                      # 장면 폭(카메라 이동 여유 포함)
MARGIN = (SW - W) // 2         # 80
BOTTOM = 1170                  # 화면 아래로 넉넉히 내려 그리는 바닥선

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FONT_PATH = os.path.expanduser('~/Library/Fonts/PretendardVariable.ttf')

D_IN, D_OUT = 0.8, 0.6         # 등장·퇴장 길이(초)


# ───────────────────────── 색 ─────────────────────────
def hexc(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
    c = hexc(c) if isinstance(c, str) else c
    if f >= 1:
        return tuple(int(min(255, v + (255 - v) * (f - 1))) for v in c)
    return tuple(int(v * f) for v in c)


C = dict(
    cream='#EADFC6', card='#F7EFDD', ink='#2B2521', ink2='#6B6158', red='#D9533A', marker='#F2C94C',
    sun='#D9533A', cloud='#E6D4AE',
    straw='#D6AE62', straw_dk='#B98E45', wall='#EFE1C0', wood='#7A5234', door='#5A3B25', win='#F4EBD3',
    roof='#3B4C60', roof_dk='#2C394A', roof_lt='#5C6F85', stone='#A7A092', stone_dk='#8B8477', stone_lt='#C4BEB1',
    hwall='#F1E5CA', ground='#E2D2AB', ground2='#D8C69C',
    teal_far='#86B6A9', teal='#3E8A82', teal_lt='#58A195', teal_dk='#2E6E69',
    green='#6E8B45', green_lt='#8FA85A', green_dk='#4E7A3D', leaf='#5E8F47', leaf_lt='#7DAA5A',
    yellow='#D8BE6A', yellow2='#C5A954', olive='#A5B464', orange='#D9782D', orange_lt='#EB9440',
    trunk='#6B4A2E', brick='#B0674A', concrete='#BDB5A6', road='#6E7277', lane='#EDE3CB',
    water='#5FA3A8', water_lt='#86C0C0', tire='#2E2B29', glass_lt='#CFE3EA',
    car_red='#C8503C', car_teal='#5AA6A0', car_yel='#E0B23C', car_blue='#4C7FA8',
    sky_top='#A9CBE0', sky_bot='#E3ECEA', snow='#F6F5F0', snow_sh='#D7DEE6',
)


# ───────────────────────── 종이결 ─────────────────────────
def make_texture(w, h, seed=7):
    r = np.random.default_rng(seed)
    fine = r.normal(0, 1, (h, w)).astype(np.float32)
    fine = np.asarray(Image.fromarray(np.clip(fine * 40 + 128, 0, 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 128 - 1
    coarse = r.normal(0, 1, (h // 28 + 2, w // 28 + 2)).astype(np.float32)
    coarse = np.asarray(Image.fromarray(np.clip(coarse * 40 + 128, 0, 255).astype(np.uint8))
                        .resize((w, h), Image.BICUBIC), np.float32) / 128 - 1
    fib = Image.new('L', (w, h), 128)
    d = ImageDraw.Draw(fib)
    for _ in range(w * h // 1400):
        x, y = r.uniform(0, w), r.uniform(0, h)
        a = r.uniform(0, math.pi)
        L = r.uniform(6, 22)
        pts = [(x + math.cos(a + k * 0.15) * L * k / 4, y + math.sin(a + k * 0.15) * L * k / 4) for k in range(5)]
        d.line(pts, fill=int(r.choice([150, 108])), width=1)
    fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 128 - 1
    return (1 + 0.035 * fine + 0.03 * coarse + 0.05 * fib).astype(np.float32)


TEX = None


def tex_crop(w, h, rng):
    th, tw = TEX.shape
    ox = int(rng.integers(0, max(1, tw - w)))
    oy = int(rng.integers(0, max(1, th - h)))
    t = TEX[oy:oy + h, ox:ox + w]
    if t.shape != (h, w):
        t = np.pad(t, ((0, h - t.shape[0]), (0, w - t.shape[1])), mode='reflect')
    return t


# ───────────────────────── 도형 ─────────────────────────
def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def ell(cx, cy, rx, ry, n=None):
    n = n or max(24, int((rx + ry) / 3))
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def densify(pts, step=14, closed=True):
    out = []
    n = len(pts)
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        a, b = pts[i], pts[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(d / step))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    if not closed:
        out.append(pts[-1])
    return out


def line(pts, width):
    """열린 선을 두께 있는 다각형으로."""
    p = np.array(densify(pts, 8, closed=False), float)
    if len(p) < 2:
        return []
    t = np.gradient(p, axis=0)
    t /= np.maximum(1e-6, np.hypot(t[:, 0], t[:, 1]))[:, None]
    nrm = np.stack([-t[:, 1], t[:, 0]], 1) * (width / 2)
    return [tuple(v) for v in (p + nrm)] + [tuple(v) for v in (p - nrm)[::-1]]


def wobble(pts, amp, rng):
    p = np.array(densify(pts), float)
    n = len(p)
    if amp <= 0 or n < 8:
        return p
    noise = rng.normal(0, 1, (n, 2))
    k = 7
    pad = np.concatenate([noise[-k:], noise, noise[:k]])
    ker = np.ones(k) / k
    sm = np.stack([np.convolve(pad[:, 0], ker, 'same'), np.convolve(pad[:, 1], ker, 'same')], 1)[k:-k]
    return p + sm * amp * 2.6


class P:
    """종이 한 장(한 가지 색)."""

    def __init__(self, color, shapes, wob=1.2, inner=True):
        self.color = hexc(color) if isinstance(color, str) else color
        self.shapes = [s for s in shapes if s and len(s) >= 3]
        self.wob = wob
        self.inner = inner


# ───────────────────────── 레이어 굽기 ─────────────────────────
def shift(a, dx, dy):
    out = np.zeros_like(a)
    h, w = a.shape
    if abs(dx) >= w or abs(dy) >= h:
        return out
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im, np.float32) / 255


def bake(pieces, seed, shadow_r=7, shadow_a=0.36):
    """조각 목록 → (스프라이트, 그림자, ox, oy). 좌표는 장면 좌표."""
    rng = np.random.default_rng(seed)
    polys = []
    for pc in pieces:
        polys.append([wobble(s, pc.wob, rng) for s in pc.shapes])
    allp = np.concatenate([p for ps in polys for p in ps])
    pad = 30
    ox, oy = int(math.floor(allp[:, 0].min())) - pad, int(math.floor(allp[:, 1].min())) - pad
    w = int(math.ceil(allp[:, 0].max())) + pad - ox
    h = int(math.ceil(allp[:, 1].max())) + pad - oy
    Cp = np.zeros((h, w, 3), np.float32)       # premultiplied
    A = np.zeros((h, w), np.float32)
    union = np.zeros((h, w), np.float32)
    for pc, ps in zip(pieces, polys):
        m = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(m)
        for p in ps:
            d.polygon([(x - ox, y - oy) for x, y in p], fill=255)
        m = np.asarray(m.filter(ImageFilter.GaussianBlur(0.55)), np.float32) / 255
        if pc.inner and union.any():
            sh = blur(shift(m, 3, 4), 2.6) * union * 0.30
            Cp *= (1 - sh)[..., None]
        hi = np.clip(m - shift(m, 2, 2), 0, 1)
        lo = np.clip(m - shift(m, -2, -2), 0, 1)
        tone = 1 + rng.normal(0, 0.012)
        tex = tex_crop(w, h, rng) * (1 + 0.10 * hi - 0.13 * lo) * tone
        col = np.array(pc.color, np.float32) / 255
        rgb = np.clip(col[None, None, :] * tex[..., None], 0, 1)
        Cp = rgb * m[..., None] + Cp * (1 - m[..., None])
        A = m + A * (1 - m)
        union = np.maximum(union, m)
    rgb = np.where(A[..., None] > 1e-4, Cp / np.maximum(A[..., None], 1e-4), 0)
    spr = Image.fromarray(np.dstack([np.clip(rgb * 255, 0, 255), np.clip(A * 255, 0, 255)]).astype(np.uint8))
    sa = blur(union, shadow_r) * shadow_a
    shd = np.zeros((h, w, 4), np.uint8)
    shd[..., 0], shd[..., 1], shd[..., 2] = 48, 36, 26
    shd[..., 3] = np.clip(sa * 255, 0, 255).astype(np.uint8)
    return spr, Image.fromarray(shd), ox, oy


# ───────────────────────── 오브젝트 ─────────────────────────
def mountains(x0, x1, base, peaks, col, facet=None, snow=False):
    def prof(x):
        return max(h * math.exp(-((x - cx) / w) ** 2 * 2.4) for cx, h, w in peaks)

    xs = np.arange(x0, x1 + 1, 10)
    top = [(x, base - prof(x)) for x in xs]
    pcs = [P(col, [[(x0, BOTTOM)] + top + [(x1, BOTTOM)]], wob=1.5)]
    if facet:
        fs = []
        for cx, h, w in peaks:
            pk = base - prof(cx)
            left = [(x, max(base - h * math.exp(-((x - cx) / w) ** 2 * 2.4), base - prof(x)))
                    for x in np.arange(cx - w * 0.95, cx + 1, 8)]
            fold = [(cx - w * 0.2 * t + 8 * math.sin(t * 5), pk + (base + 60 - pk) * t) for t in np.linspace(0, 1, 16)]
            fs.append(left + fold + [(cx - w * 0.95, base + 60)])
        pcs.append(P(facet, fs, wob=1.2))
    if snow:
        caps = []
        for cx, h, w in peaks:
            if h < 500:
                continue
            xs2 = np.arange(cx - w * 0.34, cx + w * 0.34 + 1, 6)
            top2 = [(x, base - prof(x) - 1) for x in xs2]
            bot = []
            for i, x in enumerate(xs2[::-1][::3]):
                bot.append((x, base - prof(x) + 55 + (22 if i % 2 else -6)))
            caps.append(top2 + bot)
        pcs.append(P(C['snow'], caps, wob=1.0))
        sh = []
        for cx, h, w in peaks:
            if h < 500:
                continue
            pk = base - prof(cx)
            sh.append([(cx + 4, pk + 4), (cx + w * 0.3, base - prof(cx + w * 0.3) + 48), (cx + w * 0.08, pk + 80)])
        pcs.append(P(C['snow_sh'], sh, wob=0.8))
    return pcs


def hill(x0, x1, ytop, amp, waves, col, phase=0.0):
    xs = np.arange(x0, x1 + 1, 10)
    top = [(x, ytop + amp * math.sin(2 * math.pi * waves * (x - x0) / (x1 - x0) + phase)) for x in xs]
    return P(col, [[(x0, BOTTOM)] + top + [(x1, BOTTOM)]], wob=1.4)


def blob_hill(pts, col):
    """베지어 한 줄로 윤곽을 준 언덕(끝은 화면 아래로 닫힘)."""
    curve = bez(*pts, n=60)
    return P(col, [curve + [(curve[-1][0], BOTTOM), (curve[0][0], BOTTOM)]], wob=1.6)


def terraces(cx, base, rw, n, bh, cols):
    pcs = []
    for i in range(n - 1, -1, -1):
        y = base - i * bh * 0.95
        r = rw * (1 - i * 0.17)
        top = [(cx + r * math.cos(a), y - bh * 0.9 * math.sin(a)) for a in np.linspace(0, math.pi, 40)]
        pcs.append(P(cols[i % len(cols)], [top + [(cx - r, y + bh), (cx + r, y + bh)]], wob=1.3))
    return pcs


def choga(x, yb, w, h):
    wall_h = h * 0.45
    wt = yb - wall_h
    pcs = [P(C['wall'], [rect(x - w / 2, wt, w, wall_h)])]
    beams = [rect(x - w / 2, wt, 8, wall_h), rect(x + w / 2 - 8, wt, 8, wall_h), rect(x - 4, wt, 8, wall_h),
             rect(x - w / 2, wt + wall_h * 0.28, w, 6)]
    pcs.append(P(C['wood'], beams, wob=0.5))
    pcs.append(P(C['door'], [rect(x + w * 0.12, wt + wall_h * 0.34, w * 0.2, wall_h * 0.66)], wob=0.6))
    pcs.append(P(C['win'], [rect(x - w * 0.36, wt + wall_h * 0.42, w * 0.2, wall_h * 0.3)], wob=0.5))
    cy = wt + h * 0.07
    rx, ry, ex = w * 0.64, h * 0.62, 2.6
    roof = []
    for a in np.linspace(0, math.pi, 50):
        c, s = math.cos(a), math.sin(a)
        roof.append((x + rx * math.copysign(abs(c) ** (2 / ex), c), cy - ry * abs(s) ** (2 / ex)))
    roof += [(x - rx * 0.98 + (2 * rx * 0.98) * t, cy + 4 * math.sin(t * 20)) for t in np.linspace(0, 1, 14)]
    pcs.append(P(C['straw'], [roof], wob=1.4))
    rim = [(x - rx * 0.97 + 2 * rx * 0.97 * t, cy + 2) for t in np.linspace(0, 1, 20)]
    rim += [(x + rx * 0.9 - 2 * rx * 0.9 * t, cy - 13) for t in np.linspace(0, 1, 20)]
    pcs.append(P(C['straw_dk'], [rim], wob=1.0))
    lines = []
    for k in range(1, 4):
        yy = cy - ry * 0.25 * k
        half = rx * (1 - (k * 0.25) ** 2.2) * 0.92
        lines.append(line([(x - half, yy + 3), (x, yy - 3), (x + half, yy + 3)], 2.4))
    pcs.append(P(C['straw_dk'], lines, wob=0.4, inner=False))
    return pcs


def hanok(x, yb, w, h, n_bays=4):
    base_h, wall_h, roof_h = h * 0.12, h * 0.42, h * 0.46
    wt = yb - base_h - wall_h
    pcs = [P(C['stone'], [rect(x - w / 2 - 8, yb - base_h, w + 16, base_h)])]
    pcs.append(P(C['stone_dk'], [rect(x - w / 2 + i * (w / 5), yb - base_h + 3, 3, base_h - 6) for i in range(1, 5)] +
                 [rect(x - w / 2 - 6, yb - base_h * 0.5, w + 12, 2.5)], wob=0.3, inner=False))
    pcs.append(P(C['hwall'], [rect(x - w / 2, wt, w, wall_h)]))
    bay = w / n_bays
    panels = [rect(x - w / 2 + i * bay + 12, wt + wall_h * 0.2, bay - 24, wall_h * 0.72) for i in range(n_bays)]
    pcs.append(P(C['win'], panels, wob=0.5))
    lat = []
    for i in range(n_bays):
        px = x - w / 2 + i * bay + 12
        pw = bay - 24
        for k in range(1, 3):
            lat.append(rect(px + pw * k / 3 - 1, wt + wall_h * 0.2, 2.5, wall_h * 0.72))
        for k in range(1, 4):
            lat.append(rect(px, wt + wall_h * 0.2 + wall_h * 0.72 * k / 4 - 1, pw, 2.5))
    pcs.append(P(C['wood'], lat, wob=0.2, inner=False))
    posts = [rect(x - w / 2 + i * bay - 5, wt, 10, wall_h) for i in range(n_bays + 1)]
    posts += [rect(x - w / 2 - 4, wt, w + 8, 10)]
    pcs.append(P(C['wood'], posts, wob=0.5))
    # 지붕: 처마 끝이 들린 곡선
    ew = w * 0.64
    yt = wt + 6
    up = roof_h * 0.30

    def bottom(xx):
        u = (xx - x) / ew
        return yt + roof_h * 0.12 - up * abs(u) ** 3

    ridge_y = yt - roof_h * 0.66
    rw = w * 0.34
    top = [(x - rw + 2 * rw * t, ridge_y - 6 * abs(2 * t - 1) ** 3) for t in np.linspace(0, 1, 20)]
    right = [(x + rw + (ew - rw) * t, ridge_y + (bottom(x + ew) - ridge_y) * (t ** 0.8) - 14 * math.sin(math.pi * t))
             for t in np.linspace(0, 1, 16)]
    bot = [(xx, bottom(xx)) for xx in np.linspace(x + ew, x - ew, 50)]
    left = [(x - ew + (ew - rw) * t, bottom(x - ew) + (ridge_y - bottom(x - ew)) * (1 - (1 - t) ** 0.8)
             - 14 * math.sin(math.pi * t)) for t in np.linspace(0, 1, 16)]
    pcs.append(P(C['roof'], [top + right + bot + left], wob=1.2))
    rows = []
    for k in (0.3, 0.55, 0.78):
        pts = [(xx, bottom(xx) - (bottom(xx) - ridge_y) * k + 2) for xx in np.linspace(x - ew * (1 - k * 0.45), x + ew * (1 - k * 0.45), 30)]
        rows.append(line(pts, 3))
    pcs.append(P(C['roof_dk'], rows, wob=0.3, inner=False))
    rim = [(xx, bottom(xx) + 1) for xx in np.linspace(x - ew, x + ew, 50)] + \
          [(xx, bottom(xx) - 11) for xx in np.linspace(x + ew * 0.97, x - ew * 0.97, 50)]
    pcs.append(P(C['roof_lt'], [rim], wob=0.8))
    pcs.append(P(C['roof_dk'], [line([(x - rw - 8, ridge_y - 10), (x, ridge_y - 2), (x + rw + 8, ridge_y - 10)], 13)], wob=0.6))
    return pcs


def gate(x, yb, w, h):
    pcs = [P(C['wood'], [rect(x - w / 2, yb - h * 0.7, 14, h * 0.7), rect(x + w / 2 - 14, yb - h * 0.7, 14, h * 0.7)])]
    pcs.append(P(C['door'], [rect(x - w / 2 + 14, yb - h * 0.62, w - 28, h * 0.62)]))
    pcs.append(P(C['wood'], [rect(x - 1.5, yb - h * 0.62, 3, h * 0.62)], wob=0.2, inner=False))
    ew = w * 0.75
    rp = [(x - ew, yb - h * 0.72), (x - w * 0.3, yb - h), (x + w * 0.3, yb - h), (x + ew, yb - h * 0.72),
          (x + ew * 0.7, yb - h * 0.66), (x - ew * 0.7, yb - h * 0.66)]
    pcs.append(P(C['roof'], [rp]))
    pcs.append(P(C['roof_dk'], [line([(x - w * 0.34, yb - h - 4), (x + w * 0.34, yb - h - 4)], 9)], wob=0.4))
    return pcs


def stone_wall(x0, x1, ytop, h, rng):
    pcs = [P(C['stone'], [rect(x0, ytop, x1 - x0, h)])]
    st_l, st_d = [], []
    y = ytop + 16
    row = 0
    while y < ytop + h - 8:
        x = x0 + 10 + (row % 2) * 20
        while x < x1 - 20:
            sw = rng.uniform(24, 42)
            (st_l if rng.random() < 0.5 else st_d).append(ell(x + sw / 2, y, sw / 2 - 2, 8, 14))
            x += sw
        y += 18
        row += 1
    pcs.append(P(C['stone_lt'], st_l, wob=0.6))
    pcs.append(P(C['stone_dk'], st_d, wob=0.6))
    pcs.append(P(C['roof'], [[(x0 - 10, ytop + 4), (x0 + 6, ytop - 16), (x1 - 6, ytop - 16), (x1 + 10, ytop + 4)]]))
    pcs.append(P(C['roof_lt'], [rect(x0 - 8, ytop - 2, x1 - x0 + 16, 7)], wob=0.5))
    return pcs


def tree_round(x, yb, r, col=None, lt=None):
    col, lt = col or C['leaf'], lt or C['leaf_lt']
    pcs = [P(C['trunk'], [[(x - r * 0.1, yb), (x - r * 0.06, yb - r * 1.5), (x + r * 0.06, yb - r * 1.5), (x + r * 0.12, yb)]])]
    pcs.append(P(col, [ell(x, yb - r * 1.75, r, r * 0.82), ell(x - r * 0.62, yb - r * 1.38, r * 0.62, r * 0.5),
                       ell(x + r * 0.62, yb - r * 1.42, r * 0.6, r * 0.48)]))
    pcs.append(P(lt, [ell(x - r * 0.28, yb - r * 2.02, r * 0.46, r * 0.3), ell(x + r * 0.45, yb - r * 1.62, r * 0.3, r * 0.2)]))
    return pcs


def tree_cone(x, yb, h, col, lt):
    pts = []
    for t in np.linspace(0, 1, 20):
        pts.append((x + h * 0.19 * math.sin(math.pi * t ** 0.75), yb - h + h * 0.86 * t))
    for t in np.linspace(1, 0, 20):
        pts.append((x - h * 0.19 * math.sin(math.pi * t ** 0.75), yb - h + h * 0.86 * t))
    pcs = [P(C['trunk'], [rect(x - 4, yb - h * 0.2, 8, h * 0.2)])]
    pcs.append(P(col, [pts]))
    pcs.append(P(lt, [[(x, yb - h)] + [(x - h * 0.19 * math.sin(math.pi * t ** 0.75), yb - h + h * 0.86 * t) for t in np.linspace(0.02, 1, 18)] + [(x - 2, yb - h * 0.16)]]))
    return pcs


def tree_pine(x, yb, s=1.0):
    trunk = line([(x, yb), (x + 14 * s, yb - 80 * s), (x - 6 * s, yb - 150 * s), (x + 10 * s, yb - 200 * s)], 13 * s)
    pcs = [P(C['trunk'], [trunk])]
    pads = [(x - 50 * s, yb - 150 * s, 62 * s), (x + 55 * s, yb - 120 * s, 55 * s), (x + 8 * s, yb - 205 * s, 70 * s),
            (x - 20 * s, yb - 95 * s, 45 * s)]
    pcs.append(P(C['green_dk'], [ell(px, py, r, r * 0.34) for px, py, r in pads]))
    pcs.append(P(C['leaf'], [ell(px - r * 0.15, py - r * 0.14, r * 0.7, r * 0.2) for px, py, r in pads]))
    return pcs


def sun(x, y, r):
    return [P(C['sun'], [ell(x, y, r, r)], wob=1.0)]


def cloud(x, y, s=1.0):
    body = [ell(x, y, 90 * s, 26 * s), ell(x - 40 * s, y - 14 * s, 44 * s, 28 * s), ell(x + 30 * s, y - 20 * s, 52 * s, 34 * s),
            ell(x + 85 * s, y + 2 * s, 46 * s, 20 * s)]
    sp = [(x + 30 * s + math.cos(a) * (6 + a * 5.5) * s, y - 18 * s + math.sin(a) * (6 + a * 5.5) * s) for a in np.linspace(0, 4.2, 40)]
    return [P(C['cloud'], body), P(shade(C['cloud'], 0.86), [line(sp, 5 * s)], wob=0.3, inner=False)]


def person(x, yb, col='#7B4A36', s=1.0):
    return [P(col, [[(x - 9 * s, yb), (x - 6 * s, yb - 30 * s), (x + 6 * s, yb - 30 * s), (x + 9 * s, yb)]], wob=0.4),
            P('#E9C9A0', [ell(x, yb - 37 * s, 6.5 * s, 7 * s)], wob=0.3),
            P('#3A2E26', [ell(x, yb - 42 * s, 7 * s, 3.5 * s)], wob=0.3)]


def car(x, yb, col, s=1.0, bus=False):
    if bus:
        L = 150 * s
        pcs = [P(col, [rect(x - L / 2, yb - 50 * s, L, 40 * s)])]
        pcs.append(P(C['glass_lt'], [rect(x - L / 2 + 10 * s + i * 27 * s, yb - 44 * s, 20 * s, 14 * s) for i in range(5)], wob=0.4))
        pcs.append(P(C['lane'], [rect(x - L / 2, yb - 24 * s, L, 5 * s)], wob=0.3))
        pcs.append(P(C['tire'], [ell(x - L * 0.32, yb - 9 * s, 9 * s, 9 * s), ell(x + L * 0.32, yb - 9 * s, 9 * s, 9 * s)], wob=0.3))
        return pcs
    pcs = [P(col, [[(x - 42 * s, yb - 10 * s), (x - 42 * s, yb - 26 * s), (x - 24 * s, yb - 28 * s), (x - 14 * s, yb - 42 * s),
                    (x + 18 * s, yb - 42 * s), (x + 28 * s, yb - 28 * s), (x + 42 * s, yb - 25 * s), (x + 42 * s, yb - 10 * s)]])]
    pcs.append(P(C['glass_lt'], [[(x - 18 * s, yb - 29 * s), (x - 11 * s, yb - 38 * s), (x, yb - 38 * s), (x, yb - 29 * s)],
                                 [(x + 4 * s, yb - 29 * s), (x + 4 * s, yb - 38 * s), (x + 15 * s, yb - 38 * s), (x + 22 * s, yb - 29 * s)]], wob=0.3))
    pcs.append(P(C['tire'], [ell(x - 24 * s, yb - 9 * s, 8.5 * s, 8.5 * s), ell(x + 24 * s, yb - 9 * s, 8.5 * s, 8.5 * s)], wob=0.3))
    return pcs


def lamp(x, yb, h=120):
    return [P('#4A4540', [rect(x - 3, yb - h, 6, h), rect(x - 8, yb - 6, 16, 6)], wob=0.3),
            P('#F2D48A', [ell(x, yb - h - 8, 9, 11)], wob=0.3)]


def building(xl, yb, w, h, col, win=None, floor=38, colw=30, cap=True, side=True, shop=None):
    col = hexc(col) if isinstance(col, str) else col
    win = win or shade(col, 0.72)
    pcs = [P(col, [rect(xl, yb - h, w, h)])]
    if side:
        pcs.append(P(shade(col, 0.84), [rect(xl + w * 0.8, yb - h, w * 0.2, h)], wob=0.6))
    rows = int((h - 36) / floor)
    cols = max(1, int((w * 0.78 - 12) / colw))
    ws = []
    for r in range(rows):
        for c in range(cols):
            ws.append(rect(xl + 12 + c * colw, yb - h + 22 + r * floor, colw * 0.56, floor * 0.5))
    if ws:
        pcs.append(P(win, ws, wob=0.4, inner=False))
    if cap:
        pcs.append(P(shade(col, 0.7), [rect(xl - 4, yb - h - 4, w + 8, 12)], wob=0.5))
    if shop:
        pcs.append(P(shop, [[(xl, yb - 64), (xl + w, yb - 64), (xl + w + 6, yb - 46), (xl - 6, yb - 46)]], wob=0.5))
    return pcs


def clip_left(poly, cx):
    """다각형에서 x <= cx 인 부분만 남긴다(Sutherland–Hodgman)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ia, ib = a[0] <= cx, b[0] <= cx
        if ia:
            out.append(a)
        if ia != ib:
            t = (cx - a[0]) / (b[0] - a[0])
            out.append((cx, a[1] + (b[1] - a[1]) * t))
    return out


def tower(x, yb, w, h, col, top='flat', stripes=True):
    col = hexc(col) if isinstance(col, str) else col
    lt, dk = shade(col, 1.35), shade(col, 0.78)
    xl = x - w / 2
    if top == 'spire':
        body = [(xl, yb), (xl + w * 0.08, yb - h * 0.8), (x - w * 0.14, yb - h), (x + w * 0.14, yb - h),
                (xl + w * 0.92, yb - h * 0.8), (xl + w, yb)]
    elif top == 'slant':
        body = [(xl, yb), (xl, yb - h * 0.82), (xl + w, yb - h), (xl + w, yb)]
    elif top == 'taper':
        body = [(xl, yb)] + [(x - w / 2 * (1 - 0.72 * t ** 1.6), yb - h * t) for t in np.linspace(0, 1, 20)] + \
               [(x + w / 2 * (1 - 0.72 * t ** 1.6), yb - h * t) for t in np.linspace(1, 0, 20)] + [(xl + w, yb)]
    else:
        body = rect(xl, yb - h, w, h)
    pcs = [P(col, [body], wob=0.9)]
    # 빛 받는 왼쪽 면: 몸체를 세로 중심선에서 잘라 왼쪽 절반만
    pcs.append(P(lt, [clip_left(body, x - w * 0.06)], wob=0.7))
    if stripes:
        st = []
        for k in range(1, 5):
            xx = xl + w * k / 5
            topy = yb - h * 0.96 if top != 'flat' else yb - h
            if top == 'slant':
                topy = yb - h * 0.82 - (h * 0.18) * (k / 5)
            if top == 'taper' or top == 'spire':
                topy = yb - h * (0.78 - 0.4 * abs(k / 5 - 0.5))
            st.append(rect(xx - 1.4, topy + 14, 2.8, yb - topy - 18))
        pcs.append(P(dk, st, wob=0.2, inner=False))
    if top == 'spire':
        pcs.append(P(shade(col, 0.6), [line([(x, yb - h + 4), (x, yb - h - h * 0.13)], 6)], wob=0.2))
    return pcs


def road(x0, x1, y, h, dashes=True):
    pcs = [P(C['road'], [rect(x0, y, x1 - x0, h)], wob=1.0), P(shade(C['road'], 1.25), [rect(x0, y - 4, x1 - x0, 6)], wob=0.5)]
    if dashes:
        pcs.append(P(C['lane'], [rect(x, y + h / 2 - 2.5, 34, 5) for x in range(int(x0) + 20, int(x1), 80)], wob=0.3, inner=False))
    return pcs


def ribbon(pts, width, col=None, dashes=True):
    col = col or C['road']
    pcs = [P(col, [line(pts, width)], wob=0.8), P(shade(col, 1.3), [line([(x, y - width / 2 + 3) for x, y in pts], 5)], wob=0.3, inner=False)]
    if dashes:
        d = densify(pts, 6, closed=False)
        segs = [line(d[i:i + 6], 4) for i in range(0, len(d) - 6, 14)]
        pcs.append(P(C['lane'], segs, wob=0.2, inner=False))
    return pcs


def river(x0, x1, y0, y1, amp=16):
    xs = np.arange(x0, x1 + 1, 12)
    top = [(x, y0 + amp * math.sin(x / 170)) for x in xs]
    bot = [(x, y1 + amp * math.sin(x / 140 + 1.3)) for x in xs[::-1]]
    rip = []
    rng = np.random.default_rng(3)
    for _ in range(14):
        cx, cy = rng.uniform(x0 + 60, x1 - 60), rng.uniform(y0 + 30, y1 - 20)
        rip.append(line([(cx - 40, cy), (cx, cy - 4), (cx + 40, cy)], 3))
    return [P(C['water'], [top + bot], wob=1.2), P(C['water_lt'], rip, wob=0.3, inner=False)]


def pole(x, ytop, yb):
    return [P('#6B4A2E', [rect(x - 6, ytop, 12, yb - ytop), rect(x - 34, ytop + 22, 68, 8), rect(x - 24, ytop + 44, 48, 6)], wob=0.4)]


def wires(xs, ytop):
    ls = []
    for a, b in zip(xs[:-1], xs[1:]):
        for dy in (26, 46):
            pts = [(a + (b - a) * t, ytop + dy + 34 * math.sin(math.pi * t)) for t in np.linspace(0, 1, 30)]
            ls.append(line(pts, 2.4))
    return [P('#3D3833', ls, wob=0.15, inner=False)]


def tufts(pts):
    sh = []
    for x, y in pts:
        sh += [[(x - 10, y), (x - 4, y - 18), (x, y)], [(x - 3, y), (x + 3, y - 24), (x + 6, y)], [(x + 4, y), (x + 12, y - 16), (x + 13, y)]]
    return [P(C['green'], sh, wob=0.3)]


# ───────────────────────── 장면 ─────────────────────────
class Scene:
    def __init__(self, name, sub, gen, t0, t1, bg):
        self.name, self.sub, self.gen, self.t0, self.t1, self.bg = name, sub, gen, t0, t1, bg
        self.items = []

    def add(self, pieces, depth, enter='rise', drift=0.0, rot=False):
        self.items.append(dict(pieces=pieces, depth=depth, enter=enter, drift=drift, rot=rot))


def scene1(s):
    s.add(sun(1560, 150, 78), 0.04, 'drop')
    s.add(cloud(760, 170, 1.0), 0.06, 'slide_l', drift=7)
    s.add(cloud(1840, 120, 0.8), 0.06, 'slide_r', drift=-5)
    s.add(mountains(0, SW, 700, [(260, 380, 300), (760, 470, 330), (1260, 400, 300), (1720, 500, 340), (2060, 380, 280)],
                    C['teal_far'], '#9CC5B8'), 0.12)
    s.add(mountains(0, SW, 780, [(430, 330, 260), (1000, 390, 300), (1560, 350, 280), (1990, 300, 240)], C['teal'], C['teal_lt']), 0.22)
    s.add([hill(0, SW, 735, 14, 2.5, C['olive'])], 0.3)
    grove = []
    for i, x in enumerate(range(1140, 1580, 52)):
        grove += tree_cone(x, 752, 150 + (i * 37) % 60, C['orange'] if i % 2 else C['orange_lt'], C['orange_lt'] if i % 2 else '#F2A95A')
    grove += tree_round(240, 752, 48) + tree_round(360, 748, 40, C['green_dk'], C['leaf']) + tree_round(1720, 752, 52) + tree_round(1840, 750, 42, C['green_dk'], C['leaf'])
    s.add(grove, 0.36, rot=False)
    s.add(terraces(520, 870, 360, 4, 40, [C['yellow'], C['green_lt'], C['yellow2'], C['olive']]), 0.44)
    s.add(terraces(1470, 890, 420, 4, 42, [C['olive'], C['yellow'], C['green_lt'], C['yellow2']]), 0.44)
    for (x, y, w, h) in [(470, 800, 180, 150), (820, 770, 150, 125), (1340, 805, 200, 165), (1080, 890, 220, 180)]:
        s.add(choga(x, y, w, h), 0.55, rot=True)
    s.add(person(1250, 905), 0.58, 'pop')
    s.add(person(640, 905, '#4F6B7A', 0.9), 0.58, 'pop')
    s.add(tree_round(1760, 945, 70) + tree_round(1880, 960, 50, C['green_dk'], C['leaf']), 0.8, 'pop')
    s.add([blob_hill([(1240, BOTTOM), (1500, 960), (1800, 900), (SW, 880)], C['green'])], 0.92)
    s.add([blob_hill([(0, 830), (300, 840), (620, 950), (820, BOTTOM)], C['teal_dk']),
           P(C['teal'], [bez((0, 900), (220, 905), (440, 990), (560, BOTTOM)) + [(0, BOTTOM)]], wob=1.4)], 1.0)


def scene2(s):
    s.add(cloud(1650, 150, 0.9), 0.05, 'slide_r', drift=-6)
    s.add(mountains(0, SW, 700, [(300, 380, 300), (1040, 560, 340), (1720, 470, 320)], '#6FA59A', '#86B8AC'), 0.1)
    s.add(mountains(0, SW, 740, [(180, 300, 220), (640, 360, 260), (1420, 330, 260), (1960, 360, 240)], C['teal'], C['teal_lt']), 0.2)
    s.add(tree_round(290, 700, 60) + tree_pine(430, 710, 0.9) + tree_round(1790, 705, 64, C['green_dk'], C['leaf']), 0.28)
    s.add([P(C['ground'], [rect(-20, 770, SW + 40, BOTTOM - 770)], wob=1.2)], 0.32)
    s.add(hanok(640, 720, 500, 270, 4), 0.42, rot=True)
    s.add(hanok(1430, 712, 540, 290, 5), 0.42, rot=True)
    rng = np.random.default_rng(21)
    s.add(stone_wall(150, 960, 718, 80, rng) + stone_wall(1100, 1960, 718, 80, rng), 0.5)
    s.add(gate(1030, 800, 130, 150), 0.52)
    stones = []
    pts = bez((1030, 830), (1080, 900), (940, 960), (1000, 1100), n=9)
    for i, (x, y) in enumerate(pts[1:]):
        r = 20 + i * 4
        stones.append(ell(x + (14 if i % 2 else -14), y, r * 1.3, r * 0.55))
    s.add([P(C['stone'], stones)], 0.6, 'pop')
    s.add(tufts([(560, 860), (760, 900), (1300, 880), (1500, 930), (870, 1000)]), 0.64, 'pop')
    s.add(tree_pine(170, 880, 1.45), 0.8, rot=True)
    s.add([blob_hill([(1400, BOTTOM), (1600, 960), (1850, 930), (SW, 900)], C['green'])] + tree_round(1800, 1000, 55), 0.92)
    s.add([blob_hill([(0, 900), (250, 910), (500, 1000), (640, BOTTOM)], C['teal_dk'])], 1.0)


def scene3(s):
    s.add(mountains(0, SW, 640, [(250, 330, 280), (820, 400, 320), (1380, 360, 300), (1900, 380, 300)], '#78AEA2', '#90C0B3'), 0.1)
    s.add(mountains(0, SW, 700, [(520, 260, 260), (1180, 300, 280), (1760, 250, 240)], C['teal'], C['teal_lt']), 0.18)
    s.add([P(C['ground'], [rect(-20, 620, SW + 40, BOTTOM - 620)], wob=1.2)], 0.22)
    xs = [380, 900, 1420, 1930]
    s.add(sum([pole(x, 300, 660) for x in xs], []), 0.26)
    s.add(wires(xs, 300), 0.27, 'drop')
    s.add(hanok(600, 620, 300, 170, 3), 0.3)
    s.add(hanok(1200, 612, 340, 180, 4), 0.3)
    s.add(building(1700, 790, 310, 540, C['brick'], '#7E4634', floor=44, colw=40), 0.38)
    s.add(hanok(430, 780, 340, 205, 3), 0.45, rot=True)
    s.add(hanok(980, 790, 380, 220, 4), 0.45, rot=True)
    s.add(hanok(1420, 780, 300, 190, 3), 0.45, rot=True)
    s.add(building(1560, 860, 250, 340, '#A39C8F', '#6F695F', floor=48, colw=46, side=True, shop='#6E8B9A'), 0.5)
    rng = np.random.default_rng(5)
    s.add(stone_wall(120, 700, 800, 44, rng) + stone_wall(760, 1250, 810, 40, rng), 0.54)
    s.add([P(C['ground2'], [rect(-20, 868, SW + 40, 110)], wob=1.0)], 0.58)
    s.add(car(560, 935, C['car_teal']), 0.64, 'slide_l', drift=30)
    s.add(car(820, 942, C['car_red']), 0.64, 'slide_l', drift=26)
    s.add(car(1640, 930, '#4C8F9A'), 0.64, 'slide_r', drift=-24)
    s.add(lamp(1330, 915, 130), 0.62, 'pop')
    s.add(person(1450, 925, '#5E6F4E') + person(1510, 920, '#8A4B3A', 0.95), 0.66, 'pop')
    stones = [ell(1200 + 30 * math.sin(i), 1000 + i * 34, 30 + i * 4, 11 + i) for i in range(5)]
    s.add([P(C['stone'], stones)], 0.7, 'pop')
    s.add([blob_hill([(0, 960), (300, 980), (600, 1060), (720, BOTTOM)], C['green'])] + tree_round(160, 1010, 60), 0.92)
    s.add([blob_hill([(1500, BOTTOM), (1700, 1010), (1900, 980), (SW, 970)], C['green_dk'])], 1.0)


def scene4(s):
    s.add(mountains(0, SW, 540, [(300, 240, 300), (1000, 300, 340), (1700, 260, 320)], '#8DBAAE', '#A1C8BC'), 0.08)
    rng = np.random.default_rng(11)
    back = []
    x = 40
    pal = ['#E4D2AE', '#C9C1B2', '#D8C8A6', '#BFB7A8', '#E9DDC2', '#CFC3AA']
    while x < SW - 60:
        w = rng.uniform(140, 250)
        h = rng.uniform(170, 300)
        back += building(x, 580, w, h, pal[int(rng.integers(0, len(pal)))], floor=36, colw=30)
        x += w + rng.uniform(8, 30)
    s.add(back, 0.22)
    s.add(road(-20, SW + 20, 575, 44), 0.28)
    s.add(car(500, 612, C['car_yel'], 0.8), 0.3, 'slide_l', drift=40)
    s.add(car(1300, 612, C['car_red'], 0.8), 0.3, 'slide_r', drift=-32)
    s.add([hill(-20, SW + 20, 630, 6, 3, C['green_lt'])], 0.33)
    s.add(river(-20, SW + 20, 680, 800), 0.36)
    s.add([P('#B7AFA0', [rect(640, 660, 820, 26)] + [rect(700 + i * 190, 686, 30, 120) for i in range(5)], wob=0.8),
           P('#9A9284', [line([(640 + 95 + i * 190, 686), (640 + 95 + i * 190 + 80, 740), (640 + 95 + i * 190 + 160, 686)], 8) for i in range(4)], wob=0.4)], 0.42)
    s.add([P(C['green'], [[(-20, 820), (400, 800), (900, 840), (1500, 810), (SW + 20, 830), (SW + 20, BOTTOM), (-20, BOTTOM)]])], 0.46)
    s.add(tree_round(250, 830, 42) + tree_round(1560, 820, 46, C['green_dk'], C['leaf']) + tree_round(1000, 835, 38), 0.5, 'pop')
    front = building(40, 940, 220, 300, '#D9C7A2', floor=40, colw=34, shop='#C8503C') + building(270, 940, 200, 230, '#B9B1A2', floor=40, colw=34) + \
        building(1620, 940, 210, 280, '#C9B99A', floor=40, colw=34, shop='#5AA6A0') + building(1840, 940, 220, 340, '#E3D5B8', floor=40, colw=34)
    s.add(front, 0.62)
    s.add(road(-20, SW + 20, 940, 70), 0.7)
    s.add(car(760, 1000, C['car_red'], 1.1, bus=True), 0.74, 'slide_l', drift=36)
    s.add(car(1260, 1000, C['car_teal'], 1.05), 0.74, 'slide_r', drift=-40)
    s.add(car(420, 1000, C['car_yel'], 1.0), 0.74, 'slide_l', drift=30)
    s.add(lamp(560, 940, 150) + lamp(1500, 940, 150), 0.76, 'pop')
    s.add([P(C['green'], [rect(-20, 1026, SW + 40, BOTTOM - 1026)], wob=1.4)] + tree_round(1100, 1080, 44), 0.95)


def scene5(s):
    rng = np.random.default_rng(31)
    pal = ['#8DB6D1', '#A9C2D2', '#7FA3BE', '#B9C9D4', '#9DB3C4']
    back = []
    x = 20
    while x < SW - 40:
        w = rng.uniform(110, 180)
        h = rng.uniform(420, 700)
        back += tower(x + w / 2, 660, w, h, pal[int(rng.integers(0, len(pal)))], top=['flat', 'slant', 'flat'][int(rng.integers(0, 3))])
        x += w + rng.uniform(10, 40)
    s.add(back, 0.14)
    mid = []
    for cx, w, h, col, top in [(300, 170, 520, '#5C8FB5', 'flat'), (620, 150, 640, '#3F6E96', 'slant'), (900, 190, 470, '#D8C8A6', 'flat'),
                               (1180, 160, 700, '#4C7FA8', 'spire'), (1460, 180, 560, '#6D9BBE', 'flat'), (1760, 160, 600, '#2F5E8A', 'slant')]:
        if col == '#D8C8A6':
            mid += building(cx - w / 2, 700, w, h, col, floor=34, colw=30)
        else:
            mid += tower(cx, 700, w, h, col, top=top)
    s.add(mid, 0.28)
    s.add([hill(-20, SW + 20, 700, 8, 2, C['olive'])], 0.34)
    s.add(road(-20, SW + 20, 718, 46), 0.4)
    s.add(car(400, 758, C['car_yel'], 0.8), 0.42, 'slide_l', drift=46)
    s.add(car(1200, 758, C['car_teal'], 0.8), 0.42, 'slide_r', drift=-40)
    s.add([P(C['green_lt'], [[(-20, 800), (SW + 20, 780), (SW + 20, BOTTOM), (-20, BOTTOM)]])], 0.48)
    ramps = ribbon(bez((-40, 1060), (400, 1040), (700, 860), (1040, 800), 60), 70) + \
        ribbon(bez((SW + 40, 900), (1700, 910), (1400, 820), (1040, 800), 60), 62) + \
        ribbon(bez((-40, 880), (500, 900), (900, 980), (1300, BOTTOM), 60), 58)
    pil = [rect(360, 1030, 18, 140), rect(640, 930, 18, 240), rect(1560, 890, 16, 260)]
    s.add([P('#8E9297', pil, wob=0.4)] + ramps, 0.58)
    s.add(car(520, 1000, C['car_red'], 0.9) + car(1500, 880, C['car_yel'], 0.85) + car(820, 955, C['car_blue'], 0.9), 0.62, 'pop')
    s.add(building(1720, 1100, 360, 430, '#D9C7A2', floor=40, colw=36) + building(-10, 1100, 230, 360, '#C9C1B2', floor=40, colw=36), 0.85)
    s.add(tree_round(290, 1110, 48) + tree_round(1660, 1110, 42, C['green_dk'], C['leaf']), 0.9, 'pop')


def scene6(s):
    s.add(cloud(420, 160, 0.8), 0.04, 'slide_l', drift=6)
    s.add(mountains(0, SW, 900, [(420, 520, 330), (1050, 820, 420), (1700, 640, 360)], '#8FA7BD', '#B2C4D4', snow=True), 0.08)
    s.add(mountains(0, SW, 930, [(200, 340, 260), (760, 300, 280), (1420, 360, 300), (1960, 320, 260)], '#4E958C', '#6AAA9F'), 0.16)
    back = []
    for cx, w, h, col in [(160, 120, 360, '#9DB3C4'), (330, 110, 420, '#B9C9D4'), (1650, 130, 400, '#A9C2D2'), (1830, 120, 450, '#9DB3C4'),
                          (1980, 110, 380, '#B9C9D4')]:
        back += tower(cx, 1000, w, h, col)
    s.add(back, 0.24)
    for cx, w, h, col, top in [(560, 130, 560, '#7FA3BE', 'slant'), (780, 150, 720, '#3F6E96', 'spire'), (1030, 170, 900, '#2F5E8A', 'taper'),
                               (1270, 140, 760, '#4C7FA8', 'spire'), (1460, 130, 600, '#9AA7B3', 'slant')]:
        s.add(tower(cx, 1010, w, h, col, top=top), 0.34, rot=False)
    front = []
    for cx, w, h, col in [(120, 200, 300, '#2F5E8A'), (360, 170, 380, '#5C8FB5'), (1600, 180, 340, '#3F6E96'), (1860, 230, 300, '#5C8FB5')]:
        front += tower(cx, 1080, w, h, col)
    s.add(front, 0.55)
    s.add(road(-20, SW + 20, 1010, 60), 0.7)
    s.add(car(600, 1060, C['car_red'], 0.95), 0.74, 'slide_l', drift=50)
    s.add(car(1400, 1060, C['car_yel'], 0.95), 0.74, 'slide_r', drift=-44)


SCENES_SPEC = [
    ('산속 초가집', '70대의 어린 시절', 0, 3.0, 9.2, (C['cream'], '#E3D4B4'), scene1),
    ('전통마을', '70대의 어린 시절', 0, 8.6, 14.6, (C['cream'], '#E3D4B4'), scene2),
    ('기와집과 근대화', '50대의 어린 시절', 1, 14.0, 20.0, ('#E8DCC0', '#E0D0AC'), scene3),
    ('저층 도시', '50대의 어린 시절', 1, 19.4, 25.4, ('#E6DDC8', '#DED3BA'), scene4),
    ('현대 도시', '20대의 어린 시절', 2, 24.8, 30.8, ('#E1E4DE', '#E6DDC8'), scene5),
    ('초고층 스카이라인', '20대의 어린 시절', 2, 30.2, 40.2, (C['sky_top'], C['sky_bot']), scene6),
]
TOTAL = 41.6
TL_SPAN = (3.6, 33.6)       # 세대 표시줄이 떠 있는 구간(웹 삽입판은 끝까지)
GENS = [('70대', '#3E8A82'), ('50대', '#C8913A'), ('20대', '#3F6E96')]


# ───────────────────────── 레이어·애니메이션 ─────────────────────────
def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def ease_out_back(p, s=1.5):
    p = clamp(p)
    q = p - 1
    return 1 + (s + 1) * q ** 3 + s * q ** 2


def ease_in_back(p, s=1.2):
    p = clamp(p)
    return (s + 1) * p ** 3 - s * p ** 2


def smooth(p):
    p = clamp(p)
    return p * p * (3 - 2 * p)


class Layer:
    _id = 0

    def __init__(self, spr, shd, ox, oy, depth, t_in, t_out, enter, exit_='fall', scene=None, drift=0.0,
                 screen=False, rot=False, variants=None, shadow_off=None, alpha_fn=None):
        Layer._id += 1
        self.id = Layer._id
        self.spr, self.shd, self.ox, self.oy = spr, shd, ox, oy
        self.depth, self.t_in, self.t_out = depth, t_in, t_out
        self.enter, self.exit = enter, exit_
        self.scene, self.drift, self.screen = scene, drift, screen
        self.variants = variants          # callable(tq) -> (spr, shd) or None
        self.alpha_fn = alpha_fn
        r = np.random.default_rng(self.id * 97)
        self.rot0 = float(r.uniform(-7, 7)) if rot and spr.size[0] * spr.size[1] < 700_000 else 0.0
        self.shadow_off = shadow_off or (int(5 + 7 * depth), int(7 + 9 * depth))
        self.cache = {}

    def transformed(self, spr, shd, scale, ang):
        key = (id(spr), round(scale, 2), round(ang * 2) / 2)
        if key in self.cache:
            return self.cache[key]
        s, d = spr, shd
        if abs(scale - 1) > 0.005:
            nw, nh = max(1, int(s.size[0] * scale)), max(1, int(s.size[1] * scale))
            s, d = s.resize((nw, nh), Image.BILINEAR), d.resize((nw, nh), Image.BILINEAR)
        if abs(ang) > 0.2:
            s, d = s.rotate(ang, Image.BICUBIC, expand=True), d.rotate(ang, Image.BICUBIC, expand=True)
        if len(self.cache) > 80:
            self.cache.clear()
        self.cache[key] = (s, d)
        return s, d

    def pose(self, tq, cam):
        if tq < self.t_in or tq >= self.t_out + D_OUT:
            return None
        spr, shd = self.variants(tq) if self.variants else (self.spr, self.shd)
        w, h = spr.size
        e = ease_out_back((tq - self.t_in) / D_IN)
        x = self.ox - (0 if self.screen else MARGIN + cam * self.depth)
        y = self.oy
        x += self.drift * max(0.0, tq - self.t_in)
        scale, ang = 1.0, self.rot0 * (1 - e)
        if self.enter == 'rise':
            y += (1 - e) * (H + 60 - self.oy)
        elif self.enter == 'drop':
            y -= (1 - e) * (self.oy + h + 60)
        elif self.enter == 'slide_l':
            x -= (1 - e) * (x + w + 60)
        elif self.enter == 'slide_r':
            x += (1 - e) * (W + 60 - x)
        elif self.enter == 'pop':
            scale = max(0.02, e)
        if tq >= self.t_out:
            e2 = ease_in_back((tq - self.t_out) / D_OUT)
            if self.exit == 'fall':
                y += e2 * (H + 80 - self.oy)
                ang += e2 * self.rot0 * 0.6
            elif self.exit == 'up':
                y -= e2 * (self.oy + h + 80)
            elif self.exit == 'pop':
                scale *= max(0.02, 1 - e2)
        step = int(round(tq * FPS / STEP))
        r = np.random.default_rng((self.id * 7919 + step) & 0xFFFFFFFF)
        jx, jy = r.integers(-1, 2), r.integers(-1, 2)
        s, d = self.transformed(spr, shd, scale, ang)
        # 크기·회전 변화는 아래 가운데를 기준으로
        x += (w - s.size[0]) / 2 + jx
        y += (h - s.size[1]) if self.enter == 'pop' and ang == 0 else (h - s.size[1]) / 2
        y += jy
        a = self.alpha_fn(tq) if self.alpha_fn else 1.0
        return s, d, x, y, a


def paste(dst, src, x, y, alpha=1.0):
    x, y = int(round(x)), int(round(y))
    w, h = src.size
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    crop = src.crop((x0 - x, y0 - y, x1 - x, y1 - y))
    if alpha < 0.999:
        a = np.asarray(crop.getchannel('A'), np.float32) * alpha
        crop = crop.copy()
        crop.putalpha(Image.fromarray(a.astype(np.uint8)))
    dst.alpha_composite(crop, (x0, y0))


# ───────────────────────── 글자 카드 ─────────────────────────
_fonts = {}


def font(size, weight=700):
    k = (size, weight)
    if k not in _fonts:
        f = ImageFont.truetype(FONT_PATH, size)
        f.set_variation_by_axes([weight])
        _fonts[k] = f
    return _fonts[k]


def build_card(lines, seed, pad_x=64, pad_y=46, gap=18, align='center', min_w=0, hl_p=1.0, bg=None):
    """lines: [dict(text,size,weight,color,hl=부분문자열|None)] 또는 dict(chips=[(label,color)], size)."""
    metr = []
    for ln in lines:
        if 'chips' in ln:
            f = font(ln['size'], 800)
            cw = [f.getlength(t) + ln['size'] * 1.3 for t, _ in ln['chips']]
            metr.append((sum(cw) + 22 * (len(cw) - 1), ln['size'] * 1.75))
        else:
            f = font(ln['size'], ln.get('weight', 700))
            metr.append((f.getlength(ln['text']), ln['size'] * 1.22))
    cw_ = max(min_w, max(m[0] for m in metr) + 2 * pad_x)
    ch_ = sum(m[1] for m in metr) + gap * (len(lines) - 1) + 2 * pad_y
    spr, shd, ox, oy = bake([P(bg or C['card'], [rect(0, 0, cw_, ch_)], wob=1.6)], seed, shadow_r=9, shadow_a=0.42)
    spr = spr.copy()
    d = ImageDraw.Draw(spr)
    y = -oy + pad_y
    for ln, (lw, lh) in zip(lines, metr):
        x = -ox + ((cw_ - lw) / 2 if align == 'center' else pad_x)
        if 'chips' in ln:
            f = font(ln['size'], 800)
            for t, col in ln['chips']:
                w = f.getlength(t) + ln['size'] * 1.3
                d.rounded_rectangle((x, y, x + w, y + lh * 0.92), radius=int(lh * 0.46), fill=hexc(col))
                d.text((x + w / 2, y + lh * 0.46), t, font=f, fill=(255, 255, 255), anchor='mm')
                x += w + 22
        else:
            f = font(ln['size'], ln.get('weight', 700))
            base = y + ln['size'] * 0.98
            if ln.get('hl') and hl_p > 0:
                pre = ln['text'].split(ln['hl'])[0]
                hx = x + f.getlength(pre) - 6
                hw = (f.getlength(ln['hl']) + 12) * hl_p
                s_ = ln['size']
                ov = Image.new('RGBA', spr.size, (0, 0, 0, 0))
                ImageDraw.Draw(ov).polygon([(hx, base - s_ * 0.40), (hx + hw, base - s_ * 0.46), (hx + hw + 3, base + s_ * 0.14),
                                            (hx - 2, base + s_ * 0.18)], fill=hexc(C['marker']) + (235,))
                spr.alpha_composite(ov)
                d = ImageDraw.Draw(spr)
            d.text((x, base), ln['text'], font=f, fill=hexc(ln.get('color', C['ink'])), anchor='ls')
        y += lh + gap
    return spr, shd, ox, oy, cw_, ch_


def label_card(idx, name, sub, seed):
    fb, fs = font(46, 800), font(27, 600)
    bw = 64
    wtxt = max(fb.getlength(name), fs.getlength(sub))
    cw_, ch_ = 36 + bw + 26 + wtxt + 44, 132
    spr, shd, ox, oy = bake([P(C['card'], [rect(0, 0, cw_, ch_)], wob=1.5)], seed, shadow_r=8, shadow_a=0.4)
    spr = spr.copy()
    bx, by = -ox + 36 + bw / 2, -oy + ch_ / 2
    b, bs, _, _ = bake([P(C['red'], [ell(0, 0, bw / 2, bw / 2)], wob=0.8)], seed + 1, shadow_r=3, shadow_a=0.3)
    spr.alpha_composite(bs, (int(bx - b.size[0] / 2 + 2), int(by - b.size[1] / 2 + 3)))
    spr.alpha_composite(b, (int(bx - b.size[0] / 2), int(by - b.size[1] / 2)))
    d = ImageDraw.Draw(spr)
    d.text((bx, by), f'{idx:02d}', font=font(28, 800), fill=(255, 255, 255), anchor='mm')
    tx = -ox + 36 + bw + 26
    d.text((tx, -oy + 66), name, font=fb, fill=hexc(C['ink']), anchor='ls')
    d.text((tx, -oy + 106), sub, font=fs, fill=hexc(C['ink2']), anchor='ls')
    return spr, shd, ox, oy


# ───────────────────────── 조립 ─────────────────────────
def build(embed=False):
    global TEX
    t = time.time()
    TEX = make_texture(2600, 1500)
    layers, scenes = [], []
    seed = 100
    for si, (name, sub, gen, t0, t1, bg, fn) in enumerate(SCENES_SPEC):
        s = Scene(name, sub, gen, t0, t1, bg)
        fn(s)
        n = len(s.items)
        st_in = min(0.1, 1.6 / max(1, n - 1))
        st_out = min(0.06, 0.75 / max(1, n - 1))
        for i, it in enumerate(s.items):
            seed += 1
            spr, shd, ox, oy = bake(it['pieces'], seed)
            t_in = t0 + st_in * i
            t_out = t1 - 1.3 + st_out * (n - 1 - i)
            layers.append(Layer(spr, shd, ox, oy, it['depth'], t_in, t_out, it['enter'], 'fall', scene=si,
                                drift=it['drift'], rot=it['rot']))
        scenes.append(s)
        print(f'  장면 {si + 1} "{name}" 레이어 {n}개', flush=True)
    overlays = []
    timeline = build_timeline()
    bgs = [backdrop(s.bg, i) for i, s in enumerate(scenes)]
    if embed:        # 웹 삽입용: 글자 없이 그림만(세대 표시줄·카드 모두 뺌)
        print(f'  준비 완료 {time.time() - t:.1f}s', flush=True)
        return scenes, layers, overlays, None, bgs
    # 장면 이름표
    for si, s in enumerate(scenes):
        spr, shd, ox, oy = label_card(si + 1, s.name, s.sub, 900 + si)
        overlays.append(Layer(spr, shd, 96 + ox, 72 + oy, 0, s.t0 + 0.7, s.t1 - 1.5, 'drop', 'up', screen=True, rot=True))
    # 인트로 제목
    title_lines = [dict(text='세대별 지역어 변화', size=112, weight=860, hl='지역어'),
                   dict(text='같은 말도 세대에 따라 다르게 살아갑니다.', size=44, weight=560, color=C['ink2'])]
    variants = [build_card(title_lines, 700, hl_p=p / 6) for p in range(7)]
    v0 = variants[-1]
    tx, ty = (W - v0[4]) / 2 + v0[2], (H - v0[5]) / 2 - 20 + v0[3]
    overlays.append(Layer(v0[0], v0[1], tx, ty, 0, 0.35, 3.1, 'pop', 'up', screen=True, rot=True,
                          variants=lambda tq, v=variants: v[int(clamp((tq - 1.15) / 0.55) * 6)][:2]))
    # 아웃트로
    out_lines = [dict(chips=GENS, size=40),
                 dict(text='70대·50대·20대의 사용과 인식을 비교하며', size=50, weight=760),
                 dict(text='지역어가 이어지고 변화하는 모습을 발견해 보세요.', size=50, weight=760, hl='이어지고 변화하는')]
    ov = [build_card(out_lines, 800, hl_p=p / 6, pad_y=52, gap=22) for p in range(7)]
    o0 = ov[-1]
    veil = Image.new('RGBA', (W, H), hexc(C['cream']) + (120,))
    overlays.append(Layer(veil, Image.new('RGBA', (W, H), (0, 0, 0, 0)), 0, 0, 0, 34.0, 39.9, 'none', 'up', screen=True,
                          alpha_fn=lambda tq: smooth((tq - 34.0) / 0.6)))
    overlays.append(Layer(o0[0], o0[1], (W - o0[4]) / 2 + o0[2], (H - o0[5]) / 2 + 40 + o0[3], 0, 34.3, 39.9, 'pop', 'up',
                          screen=True, rot=True, variants=lambda tq, v=ov: v[int(clamp((tq - 35.4) / 0.6) * 6)][:2]))
    # 엔딩 제목(작게)
    e = build_card([dict(text='세대별 지역어 변화', size=64, weight=860, hl='지역어')], 810)
    overlays.append(Layer(e[0], e[1], (W - e[4]) / 2 + e[2], (H - e[5]) / 2 + e[3], 0, 40.5, TOTAL + 5, 'pop', 'none',
                          screen=True, rot=True))
    print(f'  준비 완료 {time.time() - t:.1f}s', flush=True)
    return scenes, layers, overlays, timeline, bgs


def backdrop(cols, seed):
    top, bot = np.array(hexc(cols[0]), np.float32), np.array(hexc(cols[1]), np.float32)
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = (top * (1 - g) + bot * g) * np.ones((1, W, 1), np.float32)
    img *= tex_crop(W, H, np.random.default_rng(seed))[..., None]
    return img


def build_timeline():
    wS, hS = 700, 96
    spr, shd, ox, oy = bake([P(C['card'], [rect(0, 0, wS, hS)], wob=1.4)], 950, shadow_r=8, shadow_a=0.4)
    spr = spr.copy()
    d = ImageDraw.Draw(spr)
    xs = [-ox + 130 + i * 220 for i in range(3)]
    cy = -oy + hS / 2
    d.line([(xs[0], cy), (xs[-1], cy)], fill=hexc(C['ink2']) + (160,), width=3)
    markers = []
    for i, (_, col) in enumerate(GENS):
        m, ms, mox, moy = bake([P(col, [rect(-62, -30, 124, 60)], wob=1.0)], 960 + i, shadow_r=3, shadow_a=0.35)
        markers.append((m, ms, mox, moy))
    return dict(spr=spr, shd=shd, ox=ox, oy=oy, xs=xs, cy=cy, markers=markers, w=wS, h=hS)


def gen_pos(tq):
    """타임라인 표시기 위치(0,1,2 사이 실수)."""
    p = 0.0
    for i, (_, _, gen, t0, _, _, _) in enumerate(SCENES_SPEC):
        if i == 0:
            continue
        prev = SCENES_SPEC[i - 1][2]
        if gen != prev:
            p += (gen - prev) * ease_out_back((tq - t0 - 0.3) / 0.7, 1.2)
    return p


def draw_timeline(frame, tl, tq):
    t_in, t_out = TL_SPAN
    if tq < t_in or tq > t_out + D_OUT:
        return
    e = ease_out_back((tq - t_in) / D_IN)
    y = H - tl['h'] - 44 + (1 - e) * 220
    if tq > t_out:
        y += ease_in_back((tq - t_out) / D_OUT) * 260
    x = (W - tl['w']) / 2
    step = int(round(tq * FPS / STEP))
    r = np.random.default_rng(step * 31 + 5)
    x += r.integers(-1, 2)
    paste(frame, tl['shd'], x + tl['ox'] + 6, y + tl['oy'] + 8)
    paste(frame, tl['spr'], x + tl['ox'], y + tl['oy'])
    gp = gen_pos(tq)
    gi = int(round(clamp(gp, 0, 2)))
    mx = x + tl['ox'] + tl['xs'][0] + gp * 220
    m, ms, mox, moy = tl['markers'][gi]
    my = y + tl['oy'] + tl['cy']
    paste(frame, ms, mx + mox + 3, my + moy + 4)
    paste(frame, m, mx + mox, my + moy)
    d = ImageDraw.Draw(frame)
    for i, (lab, _) in enumerate(GENS):
        lx = x + tl['ox'] + tl['xs'][i]
        on = abs(gp - i) < 0.35
        d.text((lx, my), lab, font=font(34, 800), fill=(255, 255, 255) if on else hexc(C['ink2']), anchor='mm')


def compose(tq, scenes, layers, overlays, tl, bgs, vign):
    # 배경: 새 장면 시작 후 0.8초 동안 이전 배경에서 섞어 넘어감
    cur = 0
    for i, s in enumerate(scenes):
        if tq >= s.t0:
            cur = i
    bg = bgs[cur]
    if cur > 0:
        k = smooth((tq - scenes[cur].t0) / 0.8)
        if k < 1:
            bg = bgs[cur - 1] * (1 - k) + bgs[cur] * k
    if tq > 40.2:          # 엔딩: 크림색 종이로
        k = smooth((tq - 40.2) / 0.6)
        bg = bg * (1 - k) + backdrop((C['cream'], '#E3D4B4'), 0) * k
    frame = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('RGBA')
    cams = [-46 + 92 * smooth((tq - s.t0) / (s.t1 - s.t0)) for s in scenes]
    for L in layers:
        p = L.pose(tq, cams[L.scene])
        if not p:
            continue
        s, d, x, y, a = p
        paste(frame, d, x + L.shadow_off[0], y + L.shadow_off[1], a)
        paste(frame, s, x, y, a)
    if tl:
        draw_timeline(frame, tl, tq)
    for L in overlays:
        p = L.pose(tq, 0)
        if not p:
            continue
        s, d, x, y, a = p
        if L.enter != 'none':
            paste(frame, d, x + 8, y + 10, a)
        paste(frame, s, x, y, a)
    arr = np.asarray(frame.convert('RGB'), np.float32)
    step = int(round(tq * FPS / STEP))
    flick = 1 + np.random.default_rng(step + 77).normal(0, 0.006)
    return np.clip(arr * vign[..., None] * flick, 0, 255).astype(np.uint8)


def vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    return (1 - 0.13 * np.clip(r - 0.45, 0, 1) ** 1.6).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='쉼표로 구분한 초 단위 시각')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--embed', action='store_true',
                    help='웹 삽입용 무한반복판: 글자 없음, 빈 종이에서 시작해 빈 종이로 끝남')
    ap.add_argument('--size', help='출력 화면 크기 WxH (예: 1400x1080). 장면 가운데를 이 비율로 잘라 보여 준다')
    ap.add_argument('--out')
    a = ap.parse_args()
    global TL_SPAN, W, H, MARGIN
    if a.size:
        W, H = (int(v) for v in a.size.lower().split('x'))
        if H != 1080 or W > SW:
            ap.error('--size 는 높이 1080, 폭 2080 이하만 지원합니다(장면을 그 좌표로 그렸음)')
        MARGIN = (SW - W) // 2
    t_start, t_end = 0.0, TOTAL
    if a.embed:
        TL_SPAN = (3.6, 39.3)
        t_start, t_end = 2.8, 40.9
    a.out = a.out or os.path.join(OUT, 'generation_change_embed.mp4' if a.embed else 'generation_change.mp4')
    os.makedirs(OUT, exist_ok=True)
    print('종이 조각 굽는 중…', flush=True)
    scenes, layers, overlays, tl, bgs = build(a.embed)
    vign = vignette()

    def at(t):
        tq = round(t * FPS / STEP) * STEP / FPS
        return compose(tq, scenes, layers, overlays, tl, bgs, vign)

    if a.stills or a.sheet:
        ts = [float(x) for x in a.stills.split(',')] if a.stills else [1.8, 6.5, 12.0, 17.5, 22.8, 28.2, 33.0, 37.5]
        ims = []
        for t in ts:
            im = Image.fromarray(at(t))
            im.save(os.path.join(OUT, f'still_{t:05.1f}.png'))
            ims.append(im)
        if a.sheet:
            tw, th = 640, round(640 * H / W)
            cols = 2
            rows = math.ceil(len(ims) / cols)
            sheet = Image.new('RGB', (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12), (40, 36, 32))
            for i, im in enumerate(ims):
                sheet.paste(im.resize((tw, th), Image.LANCZOS), (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
            sheet.save(os.path.join(OUT, 'contact_sheet.png'))
        print('정지 화면 저장:', OUT)
        return

    k0, k1 = int(round(t_start * FPS / STEP)), int(math.ceil(t_end * FPS / STEP))
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t = time.time()
    for k in range(k0, k1):
        tq = k * STEP / FPS
        buf = compose(tq, scenes, layers, overlays, tl, bgs, vign).tobytes()
        for _ in range(STEP):
            ff.stdin.write(buf)
        if k % 24 == 0:
            print(f'  {tq:5.1f}s / {t_end}s  ({time.time() - t:.0f}s 경과)', flush=True)
    ff.stdin.close()
    ff.wait()
    print('완료:', a.out)


if __name__ == '__main__':
    sys.exit(main())
