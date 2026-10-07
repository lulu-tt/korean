#!/usr/bin/env python3
"""
Open API 자료 배너용 일러스트(openapi.png / openapi.webp) 생성기.

같은 폴더의 weather·generations 그림(굵은 남색 윤곽선, 민트·코발트·버터옐로 평면 색, 투명 배경)과
같은 결로 맞춘다: 데이터 문서 + 코드 상자 + 연결선 + 인증키. 글자·숫자는 넣지 않는다.

  python3 openapi_illustration.py
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 1254
S = 2                      # 2배로 그린 뒤 줄여 가장자리를 매끄럽게
NAVY = (31, 42, 84, 255)
MINT = (190, 230, 211, 255)
COBALT = (47, 98, 224, 255)
BUTTER = (247, 212, 107, 255)
IVORY = (255, 252, 243, 255)
WHITE = (255, 255, 255, 255)
LINE = 15                  # 윤곽선 두께(최종 크기 기준)


def sc(v):
    return [round(x * S) for x in v] if isinstance(v, (list, tuple)) else round(v * S)


def outlined(draw, shapes, fill):
    """shapes: [('rrect', box, r) | ('ellipse', box) | ('poly', pts)] — 남색으로 두껍게 깐 뒤 안쪽을 채운다(겹친 부분에 이음선이 안 생김)."""
    g = LINE
    for kind, *a in shapes:
        if kind == 'rrect':
            (x0, y0, x1, y1), r = a
            draw.rounded_rectangle(sc((x0 - g, y0 - g, x1 + g, y1 + g)), radius=sc(r + g), fill=NAVY)
        elif kind == 'ellipse':
            x0, y0, x1, y1 = a[0]
            draw.ellipse(sc((x0 - g, y0 - g, x1 + g, y1 + g)), fill=NAVY)
    for kind, *a in shapes:
        if kind == 'rrect':
            draw.rounded_rectangle(sc(a[0]), radius=sc(a[1]), fill=fill)
        elif kind == 'ellipse':
            draw.ellipse(sc(a[0]), fill=fill)


def stroke(draw, pts, width, color=NAVY):
    draw.line([tuple(sc(p)) for p in pts], fill=color, width=sc(width), joint='curve')
    r = width / 2
    for p in (pts[0], pts[-1]):
        draw.ellipse(sc((p[0] - r, p[1] - r, p[0] + r, p[1] + r)), fill=color)


def main():
    im = Image.new('RGBA', (SIZE * S, SIZE * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 연결선(문서 → 코드 상자): 점선 곡선
    pts = []
    for i in range(41):
        t = i / 40
        x = (1 - t) ** 3 * 655 + 3 * (1 - t) ** 2 * t * 780 + 3 * (1 - t) * t * t * 760 + t ** 3 * 860
        y = (1 - t) ** 3 * 690 + 3 * (1 - t) ** 2 * t * 690 + 3 * (1 - t) * t * t * 600 + t ** 3 * 560
        pts.append((x, y))
    for i in range(0, 40, 6):
        stroke(d, pts[i:i + 3], 14)

    # 데이터 문서(민트) — 머리띠와 줄
    outlined(d, [('rrect', (230, 330, 655, 925), 52)], MINT)
    d.rounded_rectangle(sc((285, 395, 600, 455)), radius=sc(22), fill=COBALT)
    for k, w in enumerate((290, 240, 270, 200)):
        y = 520 + k * 92
        d.ellipse(sc((285, y - 17, 319, y + 17)), fill=BUTTER)
        d.rounded_rectangle(sc((345, y - 15, 345 + w, y + 15)), radius=sc(15), fill=WHITE)

    # 코드 상자(코발트) — 꺾쇠 한 쌍(글자 아님)
    outlined(d, [('rrect', (735, 235, 1060, 560), 64)], COBALT)
    stroke(d, [(855, 330), (800, 397), (855, 464)], 30, IVORY)
    stroke(d, [(940, 330), (995, 397), (940, 464)], 30, IVORY)

    # 반짝임 선(기존 그림의 말풍선 옆 짧은 선과 같은 장치)
    for a, b in (((1095, 230), (1140, 190)), ((1110, 300), (1170, 292)), ((1085, 170), (1098, 120))):
        stroke(d, [a, b], 14)

    # 인증키(버터옐로)
    outlined(d, [('ellipse', (700, 715, 905, 920)), ('rrect', (860, 790, 1110, 845), 22),
                 ('rrect', (1010, 830, 1050, 905), 14), ('rrect', (1065, 830, 1100, 885), 14)], BUTTER)
    d.ellipse(sc((765, 780, 840, 855)), fill=NAVY)
    d.ellipse(sc((780, 795, 825, 840)), fill=IVORY)

    out = im.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(os.path.join(HERE, 'openapi.png'))
    out.save(os.path.join(HERE, 'openapi.webp'), quality=90, method=6)
    print('saved openapi.png / openapi.webp')


if __name__ == '__main__':
    main()
