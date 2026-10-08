#!/usr/bin/env python3
"""
세대별 지역어 변화 — 서비스 홍보용 차트 종이 모션 (특정 단어·실제 수치 없음)

'여러 조사 결과를 다양한 차트로 볼 수 있다'는 것을 보여 주는 장식 영상.
차트 값은 실제 데이터가 아니라 모양을 보여 주기 위한 임의의 값이며, 숫자는 화면에 쓰지 않는다.

  ① 세대별 비교 : 70·50·20대 막대가 차오른 뒤 다른 값으로 두 번 바뀐다
  ② 응답 구성   : 도넛 세 개가 시계 방향으로 그려지고, 새 구성이 두 번 덮어 그려진다
  ③ 남녀 차이   : 사람 그림의 색이 아래에서 차오르고 높이가 두 번 바뀐다
  ④ 한 화면에   : 막대·도넛·추이선·사람 그림 카드가 대시보드처럼 모여 함께 움직인다

  python3 promo.py            # out/promo_paper.mp4 (1400x1080, 24fps)
  python3 promo.py --sheet    # 대표 프레임 모음
"""
import argparse
import math
import os
import subprocess
import time

import numpy as np
from PIL import Image

import render as R
from render import P, bake, ell, rect, line, smooth, clamp, paste
from stats import (W, H, FPS, STEP, INK, INK2, TRACK, OCHRE, BLUE_STD, BOTH, NONE, MALE, FEMALE, CARD,
                   text_sprite, L, Reveal, annulus, figure)

D = 1.3          # 값이 바뀌는 데 걸리는 시간(초)
TOTAL = 37.0


class Level:
    """완성(100%) 스프라이트를 값(0~1)만큼만 보이게. keys=[(시각, 값)] 사이를 부드럽게 오간다."""

    def __init__(self, spr, shd, field, keys, steps=60):
        self.spr, self.shd, self.field, self.keys, self.steps, self.cache = spr, shd, field, keys, steps, {}

    def value(self, tq):
        v = 0.0
        for t, target in self.keys:
            if tq < t:
                break
            v = v + (target - v) * smooth((tq - t) / D)
        return v

    def __call__(self, tq):
        k = int(round(clamp(self.value(tq)) * self.steps))
        if k not in self.cache:
            vis = (self.field <= k / self.steps + 1e-6).astype(np.float32) if k else np.zeros_like(self.field)
            out = []
            for im in (self.spr, self.shd):
                a = np.asarray(im).copy()
                a[..., 3] = (a[..., 3] * vis).astype(np.uint8)
                out.append(Image.fromarray(a))
            self.cache[k] = tuple(out)
        return self.cache[k]


def heading(text, t0, t1, seed, x=170, y=104):
    s, d = text_sprite([(text, 34, 820)], INK, 360, 64, seed)
    return L(s, d, x, y, t0, t1, 'drop', 'up')


def hbar(x0, y, w, h, color, keys, t_in, t_out, seed):
    """가로 막대: 바탕 + 값만큼 채운 막대(Level)."""
    lay = []
    tr, trd, ox, oy = bake([P(TRACK, [rect(x0, y, w, h)], wob=1.0)], seed, shadow_r=4, shadow_a=0.22)
    lay.append(L(tr, trd, ox, oy, t_in, t_out, 'rise'))
    fs, fd, fox, foy = bake([P(color, [rect(x0, y, w, h)], wob=1.0)], seed + 1, shadow_r=4, shadow_a=0.28)
    xs = np.arange(fs.size[0])[None, :] + fox
    field = np.broadcast_to(np.clip((xs - x0) / w, 0, 1.2), (fs.size[1], fs.size[0]))
    lay.append(L(fs, fd, fox, foy, keys[0][0], t_out, 'none', variants=Level(fs, fd, field, keys)))
    return lay


def donut(cx, cy, r0, r1, comps, t_in, t_out, seed):
    """comps=[(시작 시각, [표준어, 지역어, 둘 다, 모름])] — 새 구성이 시계 방향으로 덮어 그려진다."""
    cols = [BLUE_STD, OCHRE, BOTH, NONE]
    lay = []
    base, based, ox, oy = bake([P(TRACK, [annulus(cx, cy, r0, r1, 0, 359.5)], wob=1.0)], seed, shadow_r=6, shadow_a=0.3)
    lay.append(L(base, based, ox, oy, t_in, t_out, 'pop'))
    for k, (t, parts) in enumerate(comps):
        pcs, a0 = [], 0.0
        for v, c in zip(parts, cols):
            if v <= 0:
                continue
            a1 = a0 + 360 * v
            pcs.append(P(c, [annulus(cx, cy, r0 + 2, r1 - 2, a0, a1)], wob=0.8))
            a0 = a1
        sp, sd, sox, soy = bake(pcs, seed + 10 + k, shadow_r=4, shadow_a=0.3)
        yy, xx = np.mgrid[0:sp.size[1], 0:sp.size[0]]
        ang = (np.degrees(np.arctan2(xx + sox - cx, -(yy + soy - cy))) % 360) / 360
        lay.append(L(sp, sd, sox, soy, t, t_out, 'none', variants=Reveal(sp, sd, ang, t, 1.6, ease=lambda p: 1 - (1 - clamp(p)) ** 2.2)))
    return lay


def person(cx, top, sex, color, keys, t_in, t_out, seed, s=1.0):
    shapes = figure(cx, top, sex) if s == 1.0 else [[(cx + (x - cx) * s, top + (y - top) * s) for x, y in sh] for sh in figure(cx, top, sex)]
    bottom = top + 284 * s
    lay = []
    bs, bd, ox, oy = bake([P(TRACK, shapes, wob=0.8)], seed, shadow_r=5, shadow_a=0.3)
    lay.append(L(bs, bd, ox, oy, t_in, t_out, 'rise'))
    fs, fd, fox, foy = bake([P(color, shapes, wob=0.8)], seed + 1, shadow_r=3, shadow_a=0.2)
    ys = np.arange(fs.size[1])[:, None] + foy
    field = np.broadcast_to(np.clip((bottom - ys) / (bottom - top), 0, 1.2), (fs.size[1], fs.size[0]))
    lay.append(L(fs, fd, fox, foy, keys[0][0], t_out, 'none', variants=Level(fs, fd, field, keys)))
    return lay


def gen_label(g, x, y, t_in, t_out, seed, size=46, align='left', w=150):
    s, d = text_sprite([(g + '대', size, 820)], INK, w, int(size * 1.7), seed, align)
    return L(s, d, x, y, t_in, t_out, 'slide_l' if align == 'left' else 'rise')


# ───────────────────────── 장면 ─────────────────────────
def scene_bars(t0, t1, seed):
    lay = [heading('세대별 비교', t0, t1 - 1.0, seed)]
    vals = [(.78, .44, .10), (.36, .64, .82), (.60, .28, .70)]
    for i, g in enumerate(('70', '50', '20')):
        y = 330 + i * 190
        st = t0 + 0.4 + i * 0.15
        out = t1 - 0.9 + i * 0.08
        lay.append(gen_label(g, 170, y - 8, st, out, seed + 10 + i))
        keys = [(t0 + 1.5 + i * 0.25 + k * 2.8, vals[k][i]) for k in range(3)]
        lay += hbar(330, y, 900, 64, OCHRE, keys, st + 0.1, out, seed + 20 + i * 3)
    return lay


def scene_donuts(t0, t1, seed):
    lay = [heading('응답 구성', t0, t1 - 1.0, seed)]
    comps = [[(.12, .44, .03, .41), (.08, .81, 0, .11), (0, 0, 0, 1)],
             [(.30, .25, .10, .35), (.18, .52, .08, .22), (.10, .30, 0, .60)],
             [(.05, .70, .05, .20), (.40, .10, .05, .45), (.22, .58, .04, .16)]]
    for i in range(3):
        cx, cy = 330 + i * 370, 500
        st = t0 + 0.3 + i * 0.2
        out = t1 - 0.9 + i * 0.1
        cs = [(t0 + 1.1 + i * 0.35 + k * 2.9, comps[k][i]) for k in range(3)]
        lay += donut(cx, cy, 96, 158, cs, st, out, seed + 10 + i * 10)
        g = ('20', '50', '70')[i]
        s, d = text_sprite([(g + '대', 44, 860)], INK, 200, 70, seed + 50 + i, 'center')
        lay.append(L(s, d, cx - 100, cy - 36, st + 0.3, out, 'pop'))
    labels = [('표준어', BLUE_STD), ('지역어', OCHRE), ('둘 다', BOTH), ('모름·안 씀', NONE)]
    x = 300
    for k, (lab, c) in enumerate(labels):
        dot, dotd, ox, oy = bake([P(c, [rect(x, 792, 26, 26)], wob=0.6)], seed + 70 + k, shadow_r=3, shadow_a=0.25)
        lay.append(L(dot, dotd, ox, oy, t0 + 1.6 + k * 0.1, t1 - 1.1, 'rise'))
        s, d = text_sprite([(lab, 26, 650)], INK2, 200, 50, seed + 80 + k)
        lay.append(L(s, d, x + 26, 780, t0 + 1.65 + k * 0.1, t1 - 1.1, 'rise'))
        x += 46 + R.font(26, 650).getlength(lab) + 50
    return lay


def scene_gender(t0, t1, seed):
    lay = [heading('남녀 차이', t0, t1 - 1.0, seed)]
    vals = [[(.15, .30), (.55, .40), (.35, .70)],
            [(.45, .70), (.25, .50), (.60, .35)],
            [(.75, .88), (.60, .80), (.82, .66)]]
    top = 330
    for i, g in enumerate(('20', '50', '70')):
        gx = 330 + i * 370
        out = t1 - 0.9 + i * 0.1
        for j, (sex, col) in enumerate((('m', MALE), ('f', FEMALE))):
            cx = gx - 62 + j * 124
            keys = [(t0 + 1.3 + i * 0.3 + k * 2.8, vals[i][k][j]) for k in range(3)]
            lay += person(cx, top, sex, col, keys, t0 + 0.3 + i * 0.2 + j * 0.08, out, seed + 10 + (i * 2 + j) * 3)
        lay.append(gen_label(g, gx - 100, top + 300, t0 + 0.6 + i * 0.2, out, seed + 60 + i, 40, 'center', 200))
    for k, (lab, c) in enumerate((('남', MALE), ('여', FEMALE))):
        x = 1030 + k * 110
        dot, dotd, ox, oy = bake([P(c, [ell(x + 12, 128, 12, 12)], wob=0.5)], seed + 95 + k, shadow_r=3, shadow_a=0.25)
        lay.append(L(dot, dotd, ox, oy, t0 + 0.2, t1 - 1.0, 'drop', 'up'))
        s, d = text_sprite([(lab, 28, 700)], INK2, 80, 56, seed + 97 + k)
        lay.append(L(s, d, x + 22, 100, t0 + 0.25, t1 - 1.0, 'drop', 'up'))
    return lay


def scene_dashboard(t0, t1, seed):
    """네 장의 카드가 대시보드처럼 모여, 각자 값이 바뀐다."""
    lay = []
    cw, ch = 505, 350
    pos = [(170, 150), (725, 150), (170, 545), (725, 545)]
    for k, (x, y) in enumerate(pos):
        cs, cd, ox, oy = bake([P(CARD, [rect(x, y, cw, ch)], wob=1.3)], seed + k, shadow_r=8, shadow_a=0.34)
        lay.append(L(cs, cd, ox, oy, t0 + k * 0.15, t1 - 0.8 + (3 - k) * 0.06, 'drop' if k < 2 else 'rise', rot=True))
    out = t1 - 0.8
    a = t0 + 1.0
    # ① 막대 3줄
    x, y = pos[0]
    for i, v in enumerate(((.8, .5, .7), (.45, .75, .3), (.15, .35, .6))):
        keys = [(a + 0.2 * i + 2.2 * k, v[k]) for k in range(3)]
        lay += hbar(x + 50, y + 80 + i * 85, cw - 100, 40, OCHRE, keys, t0 + 0.6, out, seed + 20 + i * 3)
    # ② 도넛 2개
    x, y = pos[1]
    lay += donut(x + 150, y + ch / 2, 58, 100, [(a, (.15, .5, .05, .3)), (a + 2.4, (.1, .7, 0, .2)), (a + 4.6, (.3, .3, .1, .3))], t0 + 0.7, out, seed + 40)
    lay += donut(x + 360, y + ch / 2, 58, 100, [(a + 0.3, (0, .2, 0, .8)), (a + 2.7, (.2, .4, .1, .3)), (a + 4.9, (.05, .8, .05, .1))], t0 + 0.75, out, seed + 60)
    # ③ 추이선(왼쪽에서 오른쪽으로 그려짐) + 점
    x, y = pos[2]
    gx0, gx1, gy0, gy1 = x + 50, x + cw - 50, y + 60, y + ch - 60
    grid = [rect(gx0, gy0 + (gy1 - gy0) * k / 3 - 1.5, gx1 - gx0, 3) for k in range(4)]
    gs, gd, ox, oy = bake([P(TRACK, grid, wob=0.3)], seed + 80, shadow_r=2, shadow_a=0.12)
    lay.append(L(gs, gd, ox, oy, t0 + 0.7, out, 'rise'))
    for li, (col, ys) in enumerate(((OCHRE, (.25, .35, .3, .55, .62, .8)), (BLUE_STD, (.7, .6, .62, .45, .4, .3)))):
        pts = [(gx0 + (gx1 - gx0) * k / 5, gy1 - (gy1 - gy0) * v) for k, v in enumerate(ys)]
        ls, ld, lox, loy = bake([P(col, [line(pts, 10)], wob=0.4)], seed + 82 + li, shadow_r=3, shadow_a=0.25)
        xs = np.arange(ls.size[0])[None, :] + lox
        field = np.broadcast_to(np.clip((xs - gx0) / (gx1 - gx0), 0, 1), (ls.size[1], ls.size[0]))
        lay.append(L(ls, ld, lox, loy, a + li * 0.5, out, 'none', variants=Reveal(ls, ld, field, a + li * 0.5, 2.2)))
        for k, (px, py) in enumerate(pts):
            ds, dd, dox, doy = bake([P(col, [ell(px, py, 13, 13)], wob=0.4), P(CARD, [ell(px, py, 5, 5)], wob=0.2)], seed + 90 + li * 10 + k, shadow_r=3, shadow_a=0.25)
            lay.append(L(ds, dd, dox, doy, a + li * 0.5 + 2.2 * k / 5, out, 'pop'))
    # ④ 사람 그림 두 쌍(작게)
    x, y = pos[3]
    for j, (sex, col) in enumerate((('m', MALE), ('f', FEMALE), ('m', MALE), ('f', FEMALE))):
        cx = x + 95 + j * 105
        v = ((.3, .7, .5), (.6, .4, .8), (.8, .55, .35), (.45, .85, .6))[j]
        keys = [(a + 0.15 * j + 2.3 * k, v[k]) for k in range(3)]
        lay += person(cx, y + 50, sex, col, keys, t0 + 0.7 + j * 0.06, out, seed + 120 + j * 3, s=0.88)
    return lay


SCENES = [(0.3, 9.6), (10.0, 19.3), (19.7, 28.6), (29.0, 36.2)]


def build():
    R.TEX = R.make_texture(2600, 1500)
    layers = []
    for fn, (t0, t1), seed in zip((scene_bars, scene_donuts, scene_gender, scene_dashboard), SCENES, (1000, 2000, 3000, 4000)):
        layers += fn(t0, t1, seed)
    top, bot = np.array((236, 226, 203), np.float32), np.array((228, 216, 188), np.float32)
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg = (top * (1 - g) + bot * g) * np.ones((1, W, 1), np.float32) * R.tex_crop(W, H, np.random.default_rng(4))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    vign = (1 - 0.12 * np.clip(rr - 0.45, 0, 1) ** 1.6).astype(np.float32)
    return layers, Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('RGBA'), vign


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
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--out', default=os.path.join(R.OUT, 'promo_paper.mp4'))
    a = ap.parse_args()
    os.makedirs(R.OUT, exist_ok=True)
    t = time.time()
    layers, bg, vign = build()
    print(f'  레이어 {len(layers)}개 ({time.time() - t:.1f}s)', flush=True)

    def at(sec):
        return compose(round(sec * FPS / STEP) * STEP / FPS, layers, bg, vign)

    if a.sheet:
        ts = [2.4, 5.6, 8.4, 12.2, 15.6, 18.4, 21.8, 25.0, 31.6, 34.4]
        tw, th, cols = 560, round(560 * H / W), 2
        rows = math.ceil(len(ts) / cols)
        sheet = Image.new('RGB', (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12), (40, 36, 32))
        for i, s in enumerate(ts):
            sheet.paste(Image.fromarray(at(s)).resize((tw, th), Image.LANCZOS), (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
        sheet.save(os.path.join(R.OUT, 'promo_sheet.png'))
        print('저장:', os.path.join(R.OUT, 'promo_sheet.png'))
        return
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', a.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(math.ceil(TOTAL * FPS / STEP))):
        buf = compose(k * STEP / FPS, layers, bg, vign).tobytes()
        for _ in range(STEP):
            ff.stdin.write(buf)
    ff.stdin.close()
    ff.wait()
    print('완료:', a.out, f'({time.time() - t:.0f}s)')


if __name__ == '__main__':
    main()
