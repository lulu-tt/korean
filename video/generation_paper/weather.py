#!/usr/bin/env python3
"""
지역어 기상도 — 종이 모션 영상 렌더러 (글자 없음, 웹 삽입용 무한 반복)

실제 시·도 경계(skorea-provinces.js, KOSTAT 2018)를 종이 타일로 오려 붙이고,
날씨가 바뀔 때마다 타일이 카드처럼 뒤집히며 색이 바뀐다 — '말의 날씨'가 변하는 기상도.

  맑음 → 온난전선(서→동) → 비·한랭전선(북→남) → 북쪽 눈 → 갬·무지개(남→북) → 사라짐 → 처음으로

종이 조각 굽기·등장 애니메이션·종이결은 render.py 것을 그대로 쓴다.

사용:
  python3 weather.py                 # out/gisangdo_paper.mp4 (1920x1080, 24fps 원본)
  python3 weather.py --sheet         # 대표 프레임 모음 out/gisangdo_sheet.png
"""
import argparse
import json
import math
import os
import subprocess
import time

import numpy as np
from PIL import Image

import render as R
from render import P, bake, ell, line, bez, rect, hexc, shade, ease_out_back, ease_in_back, smooth, clamp, paste, Layer

W, H = 1920, 1080
FPS, STEP = R.FPS, R.STEP
TOTAL = 38.0
CROP_W = 1400       # 출력은 가운데 1400x1080(웹 영역 비율 1.3:1). 장면은 1920 폭 좌표로 그린다
CROP_X = (W - CROP_W) // 2
REPO = os.path.abspath(os.path.join(R.HERE, '..', '..'))

# 지도 투영(등장방형 + 위도 보정)
LON0, LAT0, SC = 127.75, 35.84, 178.0
KX = SC * math.cos(math.radians(LAT0))


def proj(lon, lat):
    return 960 + (lon - LON0) * KX, 540 - (lat - LAT0) * SC


# ───────────────────────── 색 ─────────────────────────
SEA = ('#BCD8E2', '#A6C9D7')
LAND = '#EADFC6'
NK_LAND = '#DDD3BD'
RAMP = ['#5E8FC7', '#8FBFD4', '#A9C98A', '#F0CC6A', '#EC9A4E']       # 차가움 → 따뜻함
SNOW = ['#F5F6F7', '#DCE6EF', '#B3CADF']


def ramp(stops, v):
    v = clamp(v) * (len(stops) - 1)
    i = min(int(v), len(stops) - 2)
    t = v - i
    a, b = np.array(hexc(stops[i]), float), np.array(hexc(stops[i + 1]), float)
    return tuple(int(x) for x in a * (1 - t) + b * t)


# ───────────────────────── 지도 ─────────────────────────
def poly_area(p):
    p = np.asarray(p)
    return 0.5 * abs(np.dot(p[:, 0], np.roll(p[:, 1], 1)) - np.dot(p[:, 1], np.roll(p[:, 0], 1)))


def load_provinces():
    s = open(os.path.join(REPO, 'skorea-provinces.js'), encoding='utf-8').read()
    d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    out = []
    for f in d['features']:
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        rings = []
        for pg in polys:
            ring = [proj(lon, lat) for lon, lat in pg[0]]      # 바깥 고리만(구멍은 위 타일이 덮음)
            if poly_area(ring) > 60:
                rings.append(ring)
        if rings:
            out.append(dict(name=f['properties']['name'], region=f['properties']['region'], rings=rings,
                            area=sum(poly_area(r) for r in rings)))
    return out


# ───────────────────────── 날씨 조각 ─────────────────────────
def sun(x, y, r):
    rays = []
    for k in range(12):
        a = 2 * math.pi * k / 12
        a1, a2 = a - 0.13, a + 0.13
        rays.append([(x + math.cos(a1) * r * 1.12, y + math.sin(a1) * r * 1.12), (x + math.cos(a) * r * 1.62, y + math.sin(a) * r * 1.62),
                     (x + math.cos(a2) * r * 1.12, y + math.sin(a2) * r * 1.12)])
    return [P('#F0B648', rays, wob=0.6), P('#F2C24F', [ell(x, y, r, r)], wob=0.9), P('#F7D877', [ell(x - r * 0.12, y - r * 0.12, r * 0.7, r * 0.7)], wob=0.7)]


def cloud(x, y, s, col, lt=None, swirl=True):
    col = hexc(col)
    lt = lt or shade(col, 1.12)
    body = [ell(x, y, 120 * s, 34 * s), ell(x - 60 * s, y - 20 * s, 60 * s, 40 * s), ell(x + 20 * s, y - 42 * s, 72 * s, 52 * s),
            ell(x + 95 * s, y - 8 * s, 58 * s, 34 * s)]
    pcs = [P(col, body, wob=1.2), P(lt, [ell(x + 8 * s, y - 56 * s, 44 * s, 24 * s), ell(x - 66 * s, y - 32 * s, 30 * s, 16 * s)], wob=0.8)]
    if swirl:
        sp = [(x + 20 * s + math.cos(a) * (6 + a * 7) * s, y - 38 * s + math.sin(a) * (6 + a * 7) * s) for a in np.linspace(0, 4.4, 44)]
        pcs.append(P(shade(col, 0.86), [line(sp, 5 * s)], wob=0.3, inner=False))
    return pcs


def drops(x0, y0, w, h, n, phase, rng_seed, col='#5E8FC7'):
    rng = np.random.default_rng(rng_seed)
    xs, ys = rng.uniform(0, w, n), rng.uniform(0, h, n)
    shapes = []
    for x, y in zip(xs, ys):
        yy = (y + phase * h / 3) % h
        shapes.append(line([(x0 + x, y0 + yy), (x0 + x - 7, y0 + yy + 26)], 6))
    return [P(col, shapes, wob=0.3)]


def flakes(x0, y0, w, h, n, phase, rng_seed):
    rng = np.random.default_rng(rng_seed)
    xs, ys, rs = rng.uniform(0, w, n), rng.uniform(0, h, n), rng.uniform(9, 15, n)
    shapes = []
    for x, y, r in zip(xs, ys, rs):
        yy = (y + phase * h / 4) % h
        xx = x + 10 * math.sin(phase * 1.6 + y)
        for k in range(3):
            a = math.pi * k / 3 + 0.3
            shapes.append(line([(x0 + xx - math.cos(a) * r, y0 + yy - math.sin(a) * r), (x0 + xx + math.cos(a) * r, y0 + yy + math.sin(a) * r)], 4))
    return [P('#FFFFFF', shapes, wob=0.2)]


def front(pts, kind, side=1):
    """전선: 한랭(파란 삼각) / 온난(빨간 반원). 기호는 진행 방향(선의 왼쪽 법선) 쪽."""
    col = '#4F7FBF' if kind == 'cold' else '#D9533A'
    d = np.array(R.densify(pts, 4, closed=False), float)
    pcs = [P(col, [line(pts, 9)], wob=0.4)]
    t = np.gradient(d, axis=0)
    t /= np.maximum(1e-6, np.hypot(t[:, 0], t[:, 1]))[:, None]
    nrm = np.stack([t[:, 1], -t[:, 0]], 1) * side
    # 누적 길이를 따라 일정 간격으로 기호 배치
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(d, axis=0).T))]
    sym = []
    for s0 in np.arange(40, seg[-1] - 40, 90):
        i = int(np.searchsorted(seg, s0))
        c, tv, nv = d[i], t[i], nrm[i]
        if kind == 'cold':
            sym.append([tuple(c - tv * 20), tuple(c + nv * 30), tuple(c + tv * 20)])
        else:
            sym.append([tuple(c + tv * 20 * math.cos(a) + nv * 20 * math.sin(a)) for a in np.linspace(0, math.pi, 16)])
    pcs.append(P(col, sym, wob=0.4))
    return pcs


def pressure(cx, cy, r, cols, seed):
    rng = np.random.default_rng(seed)
    pcs = []
    for k, col in enumerate(cols):
        rr = r * (1 - k / (len(cols) + 0.6))
        ph = rng.uniform(0, 6)
        pts = [(cx + math.cos(a) * rr * (1 + 0.08 * math.sin(3 * a + ph)) * 1.25, cy + math.sin(a) * rr * (1 + 0.08 * math.sin(2 * a + ph)))
               for a in np.linspace(0, 2 * math.pi, 90, endpoint=False)]
        pcs.append(P(col, [pts], wob=1.4))
    return pcs


def swirl(x, y, s, col='#E8F1F4'):
    a = np.linspace(0, 5.2, 60)
    pts = [(x + math.cos(t) * (8 + t * 13) * s + t * 30 * s, y + math.sin(t) * (8 + t * 13) * s * 0.7) for t in a]
    tail = [(x + 5.2 * 30 * s + k * 26 * s, y + math.sin(5.2) * (8 + 5.2 * 13) * s * 0.7 + k * 2) for k in range(1, 9)]
    return [P(col, [line(pts + tail, 7 * s)], wob=0.3)]


def rainbow(cx, cy, r, band=20):
    cols = ['#E26A4A', '#EFA24A', '#F1CF5E', '#9CC47A', '#6FA7D1']
    pcs = []
    for k, col in enumerate(cols):
        ro, ri = r - k * band, r - (k + 1) * band
        outer = [(cx + math.cos(a) * ro, cy - math.sin(a) * ro) for a in np.linspace(0, math.pi, 60)]
        inner = [(cx + math.cos(a) * ri, cy - math.sin(a) * ri) for a in np.linspace(math.pi, 0, 60)]
        pcs.append(P(col, [outer + inner], wob=0.8))
    return pcs


# ───────────────────────── 시·도 타일(뒤집기) ─────────────────────────
FLIP = 0.22     # 반쪽 뒤집기 시간(초)


class Tile:
    def __init__(self, prov, seed):
        self.p = prov
        self.seed = seed
        self.sprites = {}
        self.events = []       # (t, 상태키 또는 None)
        self.cache = {}

    def sprite(self, key, color):
        if key not in self.sprites:
            self.sprites[key] = bake([P(color, self.p['rings'], wob=0.7)], self.seed + len(self.sprites) * 13, shadow_r=5, shadow_a=0.34)
        return self.sprites[key]

    def pose(self, tq):
        ev = self.events
        k = -1
        for i, (t, _) in enumerate(ev):
            if t <= tq:
                k = i
        if k < 0:
            return None
        t, key = ev[k]
        prev = ev[k - 1][1] if k > 0 else None
        dt = tq - t
        if dt < FLIP and prev is not None:
            return prev, 1 - smooth(dt / FLIP), math.sin(math.pi * dt / FLIP / 2)
        if key is None:
            return None
        grow = (dt - (FLIP if prev is not None else 0)) / (FLIP * 1.4)
        if grow < 0:
            return None
        lift = math.sin(math.pi * clamp(grow) / 2) if grow < 1 else 0
        return key, max(0.02, ease_out_back(grow, 1.3)), (1 - lift) if grow < 1 else 0

    def squashed(self, key, sx):
        ck = (key, round(sx, 2))
        if ck not in self.cache:
            spr, shd, ox, oy = self.sprites[key]
            if abs(sx - 1) < 0.01:
                self.cache[ck] = (spr, shd, ox, oy)
            else:
                nw = max(1, int(spr.size[0] * sx))
                s2, d2 = spr.resize((nw, spr.size[1]), Image.BILINEAR), shd.resize((nw, shd.size[1]), Image.BILINEAR)
                self.cache[ck] = (s2, d2, ox + (spr.size[0] - nw) / 2, oy)
        return self.cache[ck]


# ───────────────────────── 조립 ─────────────────────────
class Mover(Layer):
    """등장 후 (vx, vy) 로 이동하는 레이어(전선·구름)."""

    def __init__(self, *a, vy=0.0, **k):
        super().__init__(*a, **k)
        self.vy = vy

    def pose(self, tq, cam):
        p = super().pose(tq, cam)
        if not p:
            return None
        s, d, x, y, a = p
        return s, d, x, y + self.vy * max(0.0, tq - self.t_in), a


def L(pieces, seed, t_in, t_out, enter='pop', exit_='up', drift=0.0, vy=0.0, rot=False, variants=None, depth=0.5):
    spr, shd, ox, oy = bake(pieces, seed)
    return Mover(spr, shd, ox, oy, depth, t_in, t_out, enter, exit_, screen=True, drift=drift, vy=vy, rot=rot, variants=variants)


def flipbook(make, n, seed, t_in, t_out, enter='pop', exit_='up', drift=0.0):
    frames = [bake(make(k), seed + k) for k in range(n)]
    spr, shd, ox, oy = frames[0]

    def var(tq, fr=frames):
        k = int(round(tq * FPS / STEP)) % len(fr)
        return fr[k][0], fr[k][1]
    return Mover(spr, shd, ox, oy, 0.5, t_in, t_out, enter, exit_, screen=True, drift=drift, variants=var)


def build():
    t0 = time.time()
    R.TEX = R.make_texture(2600, 1500)
    provs = load_provinces()
    kr = sorted([p for p in provs if p['region'] == 'KR'], key=lambda p: -p['area'])
    kp = [p for p in provs if p['region'] == 'KP']

    back, front_ = [], []
    # 바다 위 기압 등고선(천천히 흐름)
    back.append(L(pressure(330, 480, 250, ['#C4DEE6', '#B3D3DF', '#A3C9D7', '#96C0D0'], 3), 11, 0.3, 35.8, 'pop', 'fall', drift=4))
    back.append(L(pressure(1650, 720, 230, ['#C4DEE6', '#B1D2DE', '#A0C7D6'], 4), 12, 0.5, 35.9, 'pop', 'fall', drift=-3))
    back.append(L(pressure(1580, 170, 160, ['#C2DCE5', '#AFD0DC'], 5), 13, 0.7, 35.7, 'pop', 'fall', drift=-5))
    # 땅(북한은 무채색, 남한은 타일 아래 바탕)
    back.append(L([P(NK_LAND, [r for p in kp for r in p['rings']], wob=0.8)], 21, 0.8, 35.5, 'drop', 'up'))
    back.append(L([P(LAND, [r for p in kr for r in p['rings']], wob=0.8)], 22, 1.0, 35.4, 'rise', 'fall'))

    # 시·도 타일과 상태 전환 일정
    tiles = []
    xs = [np.mean([np.mean(np.asarray(r)[:, 0]) for r in p['rings']]) for p in kr]
    ys = [np.mean([np.mean(np.asarray(r)[:, 1]) for r in p['rings']]) for p in kr]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    rng = np.random.default_rng(8)
    for i, p in enumerate(kr):
        tl = Tile(p, 300 + i * 50)
        u, v = (xs[i] - x0) / (x1 - x0), (ys[i] - y0) / (y1 - y0)     # u: 서→동, v: 북→남
        n = rng.normal(0, 1, 5)
        states = [
            ('sun', ramp(RAMP, 0.80 + 0.12 * n[0]), 1.3 + 0.9 * math.hypot(u - .5, v - .5)),                # 가운데부터 펼쳐짐
            ('warm', ramp(RAMP, 0.30 + 0.62 * u + 0.08 * n[1]), 9.4 + 1.8 * u),                             # 온난전선 서→동
            ('rain', ramp(RAMP, 0.06 + 0.42 * (1 - v) + 0.07 * n[2]), 15.0 + 2.4 * v),                      # 한랭전선 북→남
            ('snow', ramp(SNOW, 0.05 + 0.85 * v + 0.06 * n[3]), 21.6 + 2.0 * v),                            # 북쪽부터 눈
            ('clear', ramp(RAMP, 0.55 + 0.38 * v + 0.10 * n[4]), 28.4 + 2.0 * (1 - v)),                     # 남쪽부터 갬
        ]
        for key, col, t in states:
            tl.sprite(key, col)
            tl.events.append((t, key))
        tl.events.append((33.9 + 1.0 * math.hypot(u - .5, v - .5), None))
        tiles.append(tl)

    # ① 맑음
    front_.append(L(sun(1500, 250, 70), 31, 2.2, 9.6, 'drop', 'up', rot=True))
    front_.append(L(cloud(520, 200, 0.7, '#F4EFE3'), 32, 3.0, 9.2, 'slide_l', 'up', drift=10))
    front_.append(L(cloud(1330, 900, 0.55, '#F4EFE3'), 33, 3.6, 9.4, 'slide_r', 'up', drift=-8))
    # ② 온난전선이 서쪽에서 들어와 동쪽으로
    front_.append(L(front(bez((560, 60), (640, 330), (500, 700), (600, 1060), 50), 'warm'), 41, 8.6, 13.4, 'slide_l', 'fall', drift=180))
    front_.append(L(cloud(560, 330, 0.9, '#E6E4DE'), 42, 9.0, 13.8, 'slide_l', 'up', drift=36))
    front_.append(L(cloud(440, 760, 0.75, '#DAD9D4'), 43, 9.6, 13.8, 'slide_l', 'up', drift=40))
    # ③ 비 + 한랭전선이 북쪽에서 남쪽으로
    front_.append(L(front(bez((600, 150), (900, 60), (1200, 240), (1480, 120), 50), 'cold', side=-1), 51, 14.4, 19.6, 'slide_r', 'fall', vy=120))
    for k, (cx, cy, s) in enumerate([(820, 520, 1.15), (1180, 640, 1.0), (760, 830, 0.9)]):
        front_.append(L(cloud(cx, cy, s, '#8E9BA8', '#A7B3BE'), 52 + k, 14.0 + 0.25 * k, 20.3, 'drop', 'up', drift=6))
        front_.append(flipbook(lambda ph, cx=cx, cy=cy, s=s, k=k: drops(cx - 120 * s, cy + 20 * s, 240 * s, 190 * s, 26, ph, 70 + k),
                               3, 60 + k * 5, 14.5 + 0.25 * k, 20.0, 'pop', 'fall', drift=6))
    # ④ 북쪽에 눈, 바람 소용돌이
    for k, (cx, cy, s) in enumerate([(900, 230, 1.1), (1260, 330, 0.9)]):
        front_.append(L(cloud(cx, cy, s, '#E9EEF2', '#F7F9FA'), 71 + k, 20.8 + 0.3 * k, 27.4, 'drop', 'up', drift=-5))
        front_.append(flipbook(lambda ph, cx=cx, cy=cy, s=s, k=k: flakes(cx - 140 * s, cy + 30 * s, 280 * s, 330 * s, 16, ph, 90 + k),
                               4, 80 + k * 5, 21.3 + 0.3 * k, 27.2, 'pop', 'fall', drift=-5))
    front_.append(L(swirl(360, 840, 1.0), 76, 21.8, 27.0, 'slide_l', 'up', drift=30))
    front_.append(L(swirl(1480, 520, 0.8), 77, 22.4, 27.0, 'slide_r', 'up', drift=-24))
    # ⑤ 갬 + 무지개
    front_.append(L(rainbow(1420, 830, 220), 81, 28.6, 34.0, 'pop', 'fall'))
    front_.append(L(sun(430, 260, 62), 82, 27.8, 34.2, 'drop', 'up', rot=True))
    front_.append(L(cloud(1500, 250, 0.6, '#F4EFE3'), 83, 29.2, 34.1, 'slide_r', 'up', drift=-10))

    top, bot = np.array(hexc(SEA[0]), np.float32), np.array(hexc(SEA[1]), np.float32)
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    sea = (top * (1 - g) + bot * g) * np.ones((1, W, 1), np.float32) * R.tex_crop(W, H, np.random.default_rng(2))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.hypot((xx - W / 2) / (CROP_W / 2), (yy - H / 2) / (H / 2))
    vign = (1 - 0.12 * np.clip(rr - 0.45, 0, 1) ** 1.6).astype(np.float32)
    print(f'  준비 완료 {time.time() - t0:.1f}s (시·도 {len(tiles)}개)', flush=True)
    return dict(back=back, tiles=tiles, front=front_, sea=Image.fromarray(np.clip(sea, 0, 255).astype(np.uint8)).convert('RGBA'), vign=vign)


def compose(tq, S):
    frame = S['sea'].copy()
    for Ly in S['back']:
        p = Ly.pose(tq, 0)
        if p:
            s, d, x, y, a = p
            paste(frame, d, x + 6, y + 8, a)
            paste(frame, s, x, y, a)
    step = int(round(tq * FPS / STEP))
    for tl in S['tiles']:
        p = tl.pose(tq)
        if not p:
            continue
        key, sx, lift = p
        s, d, ox, oy = tl.squashed(key, sx)
        r = np.random.default_rng((tl.seed * 131 + step) & 0xFFFFFFFF)
        jx, jy = r.integers(-1, 2), r.integers(-1, 2)
        up = 10 * lift
        paste(frame, d, ox + 3 + up * 0.6 + jx, oy + 5 + up + jy)
        paste(frame, s, ox + jx, oy - up + jy)
    for Ly in S['front']:
        p = Ly.pose(tq, 0)
        if p:
            s, d, x, y, a = p
            paste(frame, d, x + 7, y + 10, a)
            paste(frame, s, x, y, a)
    arr = np.asarray(frame.convert('RGB'), np.float32)
    flick = 1 + np.random.default_rng(step + 77).normal(0, 0.006)
    out = np.clip(arr * S['vign'][..., None] * flick, 0, 255).astype(np.uint8)
    return np.ascontiguousarray(out[:, CROP_X:CROP_X + CROP_W])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--out', default=os.path.join(R.OUT, 'gisangdo_paper.mp4'))
    a = ap.parse_args()
    os.makedirs(R.OUT, exist_ok=True)
    print('종이 조각 굽는 중…', flush=True)
    S = build()

    def at(t):
        return compose(round(t * FPS / STEP) * STEP / FPS, S)

    if a.sheet:
        ts = [0.9, 2.2, 6.0, 10.5, 16.2, 18.5, 24.5, 31.0, 34.6, 37.0]
        tw, th, cols = 640, round(640 * H / CROP_W), 2
        rows = math.ceil(len(ts) / cols)
        sheet = Image.new('RGB', (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12), (40, 36, 32))
        for i, t in enumerate(ts):
            im = Image.fromarray(at(t))
            if t in (6.0, 18.5, 24.5, 31.0):
                im.save(os.path.join(R.OUT, f'gisangdo_{t:04.1f}.png'))
            sheet.paste(im.resize((tw, th), Image.LANCZOS), (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
        sheet.save(os.path.join(R.OUT, 'gisangdo_sheet.png'))
        print('저장:', os.path.join(R.OUT, 'gisangdo_sheet.png'))
        return

    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{CROP_W}x{H}', '-r', str(FPS),
           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', a.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(math.ceil(TOTAL * FPS / STEP))
    t = time.time()
    for k in range(n):
        buf = compose(k * STEP / FPS, S).tobytes()
        for _ in range(STEP):
            ff.stdin.write(buf)
        if k % 48 == 0:
            print(f'  {k * STEP / FPS:5.1f}s / {TOTAL}s ({time.time() - t:.0f}s)', flush=True)
    ff.stdin.close()
    ff.wait()
    print('완료:', a.out)


if __name__ == '__main__':
    main()
