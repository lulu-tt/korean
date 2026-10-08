#!/usr/bin/env python3
"""
세대별 지역어 변화 — 숫자·차트 종이 모션 영상 (아우타다, 보고서 교차표 실측값)

render.py 의 종이 질감·스톱모션 규칙을 그대로 쓰고, 막대·도넛·사람 그림을 오린 종이로 만든다.
  ① 한눈에 보기   : 세대별 '지금 쓰는 사람' 막대가 차오르고 숫자가 올라간 뒤 −81%p
  ② 세대별로 자세히: 도넛이 시계 방향으로 그려지며 표준어/지역어/둘 다/모름·안 씀 구성
  ③ 남녀 차이     : 사람 그림에 아래부터 색이 차오른다(채워진 만큼이 쓰는 사람)

데이터: data/processed/word_stories.json 의 ct = [표준어, 지역어, 둘 다, 모름·안 씀]
'지금 쓰는 사람' = 지역어 + 둘 다.

  python3 stats.py                 # out/stats_paper.mp4 (1400x1080, 24fps)
  python3 stats.py --sheet         # 대표 프레임 모음
  python3 stats.py --word 아우타다  # 다른 단어(교차표 있는 단어)
"""
import argparse
import json
import math
import os
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw

import render as R
from render import P, bake, ell, rect, ease_out_back, ease_in_back, smooth, clamp, paste, Layer

W, H = 1400, 1080
R.W, R.H = W, H
FPS, STEP = R.FPS, R.STEP
REPO = os.path.abspath(os.path.join(R.HERE, '..', '..'))

INK = (30, 42, 60)
INK2 = (104, 115, 132)
TRACK = (226, 231, 239)
OCHRE = (205, 132, 38)
OCHRE_DK = (180, 108, 26)
BLUE_STD = (37, 99, 176)
BOTH = (92, 92, 92)
NONE = (194, 189, 179)
MALE = (45, 100, 230)
FEMALE = (196, 24, 92)
RED = (184, 52, 40)
CARD = (250, 247, 240)

SCENES = [(0.4, 11.0), (11.4, 22.4), (22.8, 33.8)]
TOTAL = 34.8


# ───────────────────────── 데이터 ─────────────────────────
def load(word):
    d = json.load(open(os.path.join(REPO, 'data/processed/word_stories.json'), encoding='utf-8'))
    items = d if isinstance(d, list) else (d.get('words') or d.get('items') or next(v for v in d.values() if isinstance(v, list)))
    it = next(x for x in items if x['word'] == word and x.get('ct'))
    ct = it['ct']
    gens = {}
    for g in ('70', '50', '20'):
        m, f = ct[g + 'M'], ct[g + 'F']
        tot = [a + b for a, b in zip(m, f)]
        n = sum(tot)
        gens[g] = dict(n=n, parts=[v / n for v in tot],          # 표준어, 지역어, 둘 다, 모름
                       use=(tot[1] + tot[2]) / n,
                       m=(m[1] + m[2], sum(m)), f=(f[1] + f[2], sum(f)))
    return it['word'], gens


def pct(v):
    return int(round(v * 100))


# ───────────────────────── 종이 글자·마스크 굽기 ─────────────────────────
def bake_mask(mask, color, seed, shadow_a=0.32):
    """L 마스크(0~255) → 종이결·오린 가장자리를 입힌 스프라이트와 그림자."""
    rng = np.random.default_rng(seed)
    m = np.asarray(mask, np.float32) / 255
    h, w = m.shape
    hi = np.clip(m - R.shift(m, 2, 2), 0, 1)
    lo = np.clip(m - R.shift(m, -2, -2), 0, 1)
    tex = R.tex_crop(w, h, rng) * (1 + 0.10 * hi - 0.13 * lo)
    rgb = np.clip(np.array(color, np.float32)[None, None] / 255 * tex[..., None], 0, 1)
    spr = Image.fromarray(np.dstack([rgb * 255, m * 255]).astype(np.uint8))
    sa = R.blur(m, 4) * shadow_a
    shd = np.zeros((h, w, 4), np.uint8)
    shd[..., :3] = (48, 36, 26)
    shd[..., 3] = (sa * 255).astype(np.uint8)
    return spr, Image.fromarray(shd)


def text_mask(runs, cw, ch, align='left', base=None, gap=3):
    """runs: [(글자, 크기, 굵기)] 를 한 기준선에 이어 쓴 마스크(고정 캔버스 → 숫자가 바뀌어도 자리 고정)."""
    m = Image.new('L', (cw, ch), 0)
    d = ImageDraw.Draw(m)
    widths = [R.font(s, w).getlength(t) for t, s, w in runs]
    total = sum(widths) + gap * (len(runs) - 1)
    x = {'left': 14, 'center': (cw - total) / 2, 'right': cw - total - 14}[align]
    base = base if base is not None else ch * 0.78
    for (t, s, w), wd in zip(runs, widths):
        d.text((x, base), t, font=R.font(s, w), fill=255, anchor='ls')
        x += wd + gap
    return m.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(0.5))


def text_sprite(runs, color, cw, ch, seed, align='left', base=None):
    return bake_mask(text_mask(runs, cw, ch, align, base), color, seed)


def L(spr, shd, x, y, t_in, t_out, enter='rise', exit_='fall', variants=None, rot=False):
    return Layer(spr, shd, x, y, 0.5, t_in, t_out, enter, exit_, screen=True, variants=variants, rot=rot)


class Counter:
    """0 → 목표값으로 올라가는 숫자. 값마다 한 번만 구워 캐시."""

    def __init__(self, target, t0, dur, make):
        self.target, self.t0, self.dur, self.make, self.cache = target, t0, dur, make, {}

    def __call__(self, tq):
        v = int(round(self.target * smooth((tq - self.t0) / self.dur)))
        if v not in self.cache:
            self.cache[v] = self.make(v)
        return self.cache[v]


class Reveal:
    """완성 스프라이트를 진행도(0~1)에 따라 일부만 보이게(가로 막대·각도·아래부터 채우기)."""

    def __init__(self, spr, shd, field, t0, dur, ease=smooth, steps=48):
        self.spr, self.shd, self.field = spr, shd, field   # field: 0~1 값 지도(작을수록 먼저 보임)
        self.t0, self.dur, self.ease, self.steps, self.cache = t0, dur, ease, steps, {}

    def __call__(self, tq):
        p = clamp(self.ease((tq - self.t0) / self.dur))
        k = int(round(p * self.steps))
        if k not in self.cache:
            vis = (self.field <= k / self.steps + 1e-6).astype(np.float32)
            out = []
            for im in (self.spr, self.shd):
                a = np.asarray(im).copy()
                a[..., 3] = (a[..., 3] * vis).astype(np.uint8)
                out.append(Image.fromarray(a))
            self.cache[k] = tuple(out)
        return self.cache[k]


# ───────────────────────── 장면 ─────────────────────────
def scene_bars(word, gens, t0, t1, seed):
    lay = []
    # 단어 꼬리표 + 부제
    tag, tagd, ox, oy = bake([P(CARD, [rect(0, 0, 300, 92)], wob=1.3)], seed, shadow_r=7, shadow_a=0.38)
    tag = tag.copy()
    ImageDraw.Draw(tag).text((-ox + 150, -oy + 64), word, font=R.font(46, 860), fill=INK, anchor='ms')
    lay.append(L(tag, tagd, 170 + ox, 110 + oy, t0, t1 - 1.0, 'drop', 'up', rot=True))
    s, d = text_sprite([('지금 쓰는 사람의 비율', 28, 650)], INK2, 420, 60, seed + 1)
    lay.append(L(s, d, 488, 128, t0 + 0.25, t1 - 1.0, 'drop', 'up'))

    x0, x1, bh = 330, 1000, 64
    for i, g in enumerate(('70', '50', '20')):
        y = 350 + i * 175
        st = t0 + 0.5 + i * 0.18
        s, d = text_sprite([(g + '대', 46, 820)], INK, 150, 80, seed + 10 + i)
        lay.append(L(s, d, 170, y - 8, st, t1 - 0.9 + i * 0.08, 'slide_l'))
        tr, trd, ox, oy = bake([P(TRACK, [rect(x0, y, x1 - x0, bh)], wob=1.0)], seed + 20 + i, shadow_r=4, shadow_a=0.22)
        lay.append(L(tr, trd, ox, oy, st + 0.1, t1 - 0.9 + i * 0.08, 'rise'))
        u = gens[g]['use']
        fs, fd = None, None
        grow_t = t0 + 1.6 + i * 0.35
        if u > 0.004:
            fx1 = x0 + (x1 - x0) * u
            fs, fd, fox, foy = bake([P(OCHRE, [rect(x0, y, fx1 - x0, bh)], wob=1.0)], seed + 30 + i, shadow_r=4, shadow_a=0.28)
            xs = np.arange(fs.size[0])[None, :] + fox
            field = np.broadcast_to(np.clip((xs - x0) / max(1, fx1 - x0), 0, 1), (fs.size[1], fs.size[0]))
            rv = Reveal(fs, fd, field, grow_t, 1.5 + 0.8 * u)
            lay.append(L(fs, fd, fox, foy, grow_t, t1 - 0.9 + i * 0.08, 'none', variants=rv))
        num = pct(u)

        def make(v, i=i):
            return text_sprite([(str(v), 74, 860), ('%', 34, 800)], OCHRE_DK, 220, 100, seed + 40 + i * 101 + v, 'right')
        cnt = Counter(num, grow_t, 1.5 + 0.8 * u, make)
        s0, d0 = make(num)
        lay.append(L(s0, d0, 1010, y - 18, grow_t - 0.2, t1 - 0.9 + i * 0.08, 'pop', variants=cnt))

    # 70대 → 20대 차이
    diff = pct(gens['70']['use']) - pct(gens['20']['use'])
    t_pop = t0 + 4.4
    s, d = text_sprite([('70대 → 20대', 30, 760)], INK2, 300, 56, seed + 60, 'center')
    lay.append(L(s, d, 550, 832, t_pop - 0.2, t1 - 1.1, 'pop'))
    s, d = text_sprite([('−' + str(diff), 112, 900), ('%p', 44, 820)], RED, 420, 140, seed + 61, 'center', base=118)
    lay.append(L(s, d, 490, 876, t_pop, t1 - 1.1, 'pop', rot=True))
    return lay


def annulus(cx, cy, r0, r1, a0, a1):
    """시계 방향, 위쪽(12시)에서 0°."""
    n = max(4, int((a1 - a0) / 3))
    out = [(cx + r1 * math.sin(math.radians(a)), cy - r1 * math.cos(math.radians(a))) for a in np.linspace(a0, a1, n)]
    inn = [(cx + r0 * math.sin(math.radians(a)), cy - r0 * math.cos(math.radians(a))) for a in np.linspace(a1, a0, n)]
    return out + inn


def scene_donuts(word, gens, t0, t1, seed):
    lay = []
    s, d = text_sprite([('세대별 구성', 34, 820)], INK, 320, 64, seed)
    lay.append(L(s, d, 170, 104, t0, t1 - 1.0, 'drop', 'up'))
    cols = [BLUE_STD, OCHRE, BOTH, NONE]
    for i, g in enumerate(('20', '50', '70')):
        cx, cy, r0, r1 = 330 + i * 370, 450, 92, 150
        st = t0 + 0.3 + i * 0.2
        # 바탕 고리: 처음부터 고리 모양으로 오려 그림자도 고리를 따라가게(가운데는 배경 종이가 보임)
        base, based, ox, oy = bake([P(TRACK, [annulus(cx, cy, r0, r1, 0, 359.5)], wob=1.0)], seed + 10 + i, shadow_r=6, shadow_a=0.3)
        lay.append(L(base, based, ox, oy, st, t1 - 0.9 + i * 0.1, 'pop'))
        # 구성 조각(한 번에 굽고 각도로 드러냄)
        parts = gens[g]['parts']
        pcs, a0 = [], 0.0
        for v, c in zip(parts, cols):
            if v <= 0:
                continue
            a1 = a0 + 360 * v
            pcs.append(P(c, [annulus(cx, cy, r0 + 2, r1 - 2, a0, a1)], wob=0.8))
            a0 = a1
        sp, sd, sox, soy = bake(pcs, seed + 20 + i, shadow_r=4, shadow_a=0.3)
        yy, xx = np.mgrid[0:sp.size[1], 0:sp.size[0]]
        ang = (np.degrees(np.arctan2(xx + sox - cx, -(yy + soy - cy))) % 360) / 360
        sweep_t = t0 + 1.2 + i * 0.45
        rv = Reveal(sp, sd, ang, sweep_t, 1.8, ease=lambda p: 1 - (1 - clamp(p)) ** 2.2)
        lay.append(L(sp, sd, sox, soy, sweep_t, t1 - 0.9 + i * 0.1, 'none', variants=rv))
        # 가운데 글자
        s, d = text_sprite([(g + '대', 44, 860)], INK, 200, 70, seed + 30 + i, 'center')
        lay.append(L(s, d, cx - 100, cy - 52, st + 0.3, t1 - 0.9 + i * 0.1, 'pop'))
        s, d = text_sprite([(f"{gens[g]['n']}명", 26, 650)], INK2, 200, 50, seed + 40 + i, 'center')
        lay.append(L(s, d, cx - 100, cy + 8, st + 0.4, t1 - 0.9 + i * 0.1, 'pop'))
        # 아래: 지금 쓰는 사람 비율
        num = pct(gens[g]['use'])

        def make(v, i=i):
            return text_sprite([(str(v), 64, 860), ('%', 30, 800)], OCHRE_DK, 260, 90, seed + 50 + i * 101 + v, 'center')
        s0, d0 = make(num)
        lay.append(L(s0, d0, cx - 130, cy + r1 + 22, sweep_t, t1 - 0.9 + i * 0.1, 'pop', variants=Counter(num, sweep_t, 1.8, make)))
    # 범례
    labels = [('표준어', BLUE_STD), ('지역어', OCHRE), ('둘 다', BOTH), ('모름·안 씀', NONE)]
    x = 300
    for k, (lab, c) in enumerate(labels):
        dot, dotd, ox, oy = bake([P(c, [rect(x, 902, 26, 26)], wob=0.6)], seed + 70 + k, shadow_r=3, shadow_a=0.25)
        lay.append(L(dot, dotd, ox, oy, t0 + 2.6 + k * 0.1, t1 - 1.1, 'rise'))
        s, d = text_sprite([(lab, 26, 650)], INK2, 200, 50, seed + 80 + k)
        lay.append(L(s, d, x + 26, 890, t0 + 2.65 + k * 0.1, t1 - 1.1, 'rise'))
        x += 46 + R.font(26, 650).getlength(lab) + 50
    return lay


def figure(cx, top, sex):
    head = ell(cx, top + 26, 26, 26, 40)
    if sex == 'm':
        body = [(cx - 36, top + 64), (cx + 36, top + 64), (cx + 33, top + 176), (cx - 33, top + 176)]
        legs = [rect(cx - 27, top + 172, 22, 112), rect(cx + 5, top + 172, 22, 112)]
    else:
        body = [(cx - 20, top + 62), (cx + 20, top + 62), (cx + 42, top + 186), (cx - 42, top + 186)]
        legs = [rect(cx - 20, top + 182, 16, 102), rect(cx + 4, top + 182, 16, 102)]
    return [head, body] + legs


def scene_gender(word, gens, t0, t1, seed):
    lay = []
    s, d = text_sprite([('남녀 차이', 34, 820)], INK, 320, 64, seed)
    lay.append(L(s, d, 170, 104, t0, t1 - 1.0, 'drop', 'up'))
    top, bottom = 352, 352 + 284
    for i, g in enumerate(('20', '50', '70')):
        gx = 330 + i * 370
        for j, (sex, col) in enumerate((('m', MALE), ('f', FEMALE))):
            cx = gx - 62 + j * 124
            st = t0 + 0.3 + i * 0.2 + j * 0.08
            shapes = figure(cx, top, sex)
            bs, bd, ox, oy = bake([P(TRACK, shapes, wob=0.8)], seed + 10 + i * 2 + j, shadow_r=5, shadow_a=0.3)
            lay.append(L(bs, bd, ox, oy, st, t1 - 0.9 + i * 0.1, 'rise'))
            used, n = gens[g][sex]
            v = used / n if n else 0
            fill_t = t0 + 1.4 + i * 0.4
            if v > 0.004:
                fs, fd, fox, foy = bake([P(col, shapes, wob=0.8)], seed + 30 + i * 2 + j, shadow_r=3, shadow_a=0.2)
                ys = np.arange(fs.size[1])[:, None] + foy
                # 아래(bottom)부터 v 만큼: field 가 작은 곳이 먼저 보임
                field = np.broadcast_to(np.clip((bottom - ys) / (bottom - top), 0, 1) / v, (fs.size[1], fs.size[0]))
                field = np.where(field <= 1.0, field, 9.0)
                rv = Reveal(fs, fd, field, fill_t, 1.6)
                lay.append(L(fs, fd, fox, foy, fill_t, t1 - 0.9 + i * 0.1, 'none', variants=rv))
            num = pct(v)

            def make(val, col=col, i=i, j=j):
                return text_sprite([(str(val), 52, 860), ('%', 26, 800)], col, 170, 76, seed + 50 + (i * 2 + j) * 101 + val, 'center')
            s0, d0 = make(num)
            lay.append(L(s0, d0, cx - 85, top - 92, fill_t, t1 - 0.9 + i * 0.1, 'pop', variants=Counter(num, fill_t, 1.6, make)))
            s, d = text_sprite([(f'{n}명 중 {used}명', 22, 600)], INK2, 170, 44, seed + 70 + i * 2 + j, 'center')
            lay.append(L(s, d, cx - 85, bottom + 18, st + 0.4, t1 - 0.9 + i * 0.1, 'rise'))
        s, d = text_sprite([(g + '대', 40, 860)], INK, 200, 64, seed + 90 + i, 'center')
        lay.append(L(s, d, gx - 100, bottom + 66, t0 + 0.6 + i * 0.2, t1 - 0.9 + i * 0.1, 'rise'))
    # 범례: 남·여
    for k, (lab, c) in enumerate((('남', MALE), ('여', FEMALE))):
        x = 1030 + k * 110
        dot, dotd, ox, oy = bake([P(c, [ell(x + 12, 128, 12, 12)], wob=0.5)], seed + 95 + k, shadow_r=3, shadow_a=0.25)
        lay.append(L(dot, dotd, ox, oy, t0 + 0.2, t1 - 1.0, 'drop', 'up'))
        s, d = text_sprite([(lab, 28, 700)], INK2, 80, 56, seed + 97 + k)
        lay.append(L(s, d, x + 22, 100, t0 + 0.25, t1 - 1.0, 'drop', 'up'))
    return lay


# ───────────────────────── 조립·출력 ─────────────────────────
def build(word):
    R.TEX = R.make_texture(2600, 1500)
    word, gens = load(word)
    layers = []
    layers += scene_bars(word, gens, *SCENES[0], 1000)
    layers += scene_donuts(word, gens, *SCENES[1], 2000)
    layers += scene_gender(word, gens, *SCENES[2], 3000)
    top, bot = np.array((236, 226, 203), np.float32), np.array((228, 216, 188), np.float32)
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg = (top * (1 - g) + bot * g) * np.ones((1, W, 1), np.float32) * R.tex_crop(W, H, np.random.default_rng(4))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    vign = (1 - 0.12 * np.clip(rr - 0.45, 0, 1) ** 1.6).astype(np.float32)
    return word, gens, layers, Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('RGBA'), vign


def compose(tq, layers, bg, vign):
    frame = bg.copy()
    for Ly in layers:
        p = Ly.pose(tq, 0)
        if p:
            s, d, x, y, a = p
            paste(frame, d, x + 4, y + 6, a)
            paste(frame, s, x, y, a)
    step = int(round(tq * FPS / STEP))
    flick = 1 + np.random.default_rng(step + 77).normal(0, 0.006)
    return np.clip(np.asarray(frame.convert('RGB'), np.float32) * vign[..., None] * flick, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--word', default='아우타다')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--out', default=os.path.join(R.OUT, 'stats_paper.mp4'))
    a = ap.parse_args()
    os.makedirs(R.OUT, exist_ok=True)
    t = time.time()
    word, gens, layers, bg, vign = build(a.word)
    print(f'  {word}: ' + ', '.join(f"{g}대 {pct(v['use'])}%" for g, v in gens.items()) + f'  ({time.time() - t:.1f}s)', flush=True)

    def at(sec):
        return compose(round(sec * FPS / STEP) * STEP / FPS, layers, bg, vign)

    if a.sheet:
        ts = [1.4, 3.0, 6.5, 12.6, 14.2, 18.0, 24.4, 26.0, 30.0, 34.5]
        tw, th, cols = 560, round(560 * H / W), 2
        rows = math.ceil(len(ts) / cols)
        sheet = Image.new('RGB', (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12), (40, 36, 32))
        for i, s in enumerate(ts):
            sheet.paste(Image.fromarray(at(s)).resize((tw, th), Image.LANCZOS), (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
        sheet.save(os.path.join(R.OUT, 'stats_sheet.png'))
        print('저장:', os.path.join(R.OUT, 'stats_sheet.png'))
        return
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', a.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(math.ceil(TOTAL * FPS / STEP))
    for k in range(n):
        buf = compose(k * STEP / FPS, layers, bg, vign).tobytes()
        for _ in range(STEP):
            ff.stdin.write(buf)
    ff.stdin.close()
    ff.wait()
    print('완료:', a.out, f'({time.time() - t:.0f}s)')


if __name__ == '__main__':
    main()
