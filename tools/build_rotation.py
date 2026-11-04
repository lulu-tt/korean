# 「사진으로 보는 생활어」 카드 사진 로테이션용 경량 이미지 생성
# - 원본: 국어원 사진(work/kordic-refs, manifest.json) — 주제당 최대 4장, 서로 다른 어휘 우선, 설명용 도해 사진은 뒤로
# - 출력: assets/rotation/<사진ID>.webp (500×700 커버 크롭, WebP q78) + assets/rotation/rotation.js (주제명 → [{src, label}])
import json, os, sys
from PIL import Image
REFS = "/Users/aaa/Documents/vibe-site-review/work/kordic-refs/manifest.json"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "rotation")
W, H, Q = 500, 700, 78
DIAGRAM_LAST = {4: [0], 5: [0], 24: [0], 27: [0]}   # 글씨·화살표가 들어간 설명용 사진(첫 장) → 뒤로
os.makedirs(OUT, exist_ok=True)
M = json.load(open(REFS, encoding="utf-8"))
def pick(t):
    ok = [(i, s) for i, s in enumerate(t["samples"]) if os.path.exists(s["file"])]
    last = DIAGRAM_LAST.get(t["no"], [])
    ok = [x for x in ok if x[0] not in last] + [x for x in ok if x[0] in last]
    seen, S = set(), []
    for i, s in ok:
        if s["title"] not in seen: S.append(s); seen.add(s["title"])
    for i, s in ok:
        if len(S) >= 4: break
        if s not in S: S.append(s)
    return S[:4]
def is_diagram(src):
    """국어원 설명용 사진의 노란 라벨·화살표(#f5c518 계열) 비율로 판별"""
    im = Image.open(src).convert("RGB"); im.thumbnail((200, 200)); px = list(im.getdata())
    y = sum(1 for r, g, b in px if r > 200 and g > 160 and b < 70 and r - b > 150)
    return y / len(px) > 0.004
def webp(src, dst):
    im = Image.open(src).convert("RGB"); w, h = im.size; r = W / H
    if w / h > r: nw = int(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = int(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.resize((W, H), Image.LANCZOS).save(dst, "WEBP", quality=Q, method=6)
data, total = {}, 0
POOL = "/Users/aaa/Documents/vibe-site-review/work/kordic-refs/pool/manifest.json"   # 주제 전체 목록에서 서로 다른 장면만 고른 결과(있으면 우선)
P = json.load(open(POOL, encoding="utf-8")) if os.path.exists(POOL) else {}
for t in M:
    items = []
    chosen = [{"title": x["title"], "file": x["file"]} for x in P.get(t["topic"], [])] or pick(t)
    chosen.sort(key=lambda s: is_diagram(s["file"]))   # 노란 글씨·화살표가 있는 설명용 사진은 뒤로(안정 정렬)
    for s in chosen:
        base = os.path.splitext(os.path.basename(s["file"]))[0]
        pid = base.split("_", 1)[-1] if "/kordic-refs/pool/" not in s["file"] else base
        dst = os.path.join(OUT, pid + ".webp"); webp(s["file"], dst); total += os.path.getsize(dst)
        items.append({"src": "./assets/rotation/" + pid + ".webp", "label": s["title"]})
    data[t["topic"]] = items
# 첫 줄 실사 영상 4편과 같은 사진·순서(영상 속 라벨 기준으로 국어원 사이트에서 원본 확보, kordic-refs/first4)
F4 = "/Users/aaa/Documents/vibe-site-review/work/kordic-refs/first4/manifest.json"
if os.path.exists(F4):
    for subj, items in json.load(open(F4, encoding="utf-8")).items():
        out = []
        for s in items:
            pid = os.path.splitext(os.path.basename(s["file"]))[0]
            dst = os.path.join(OUT, pid + ".webp"); webp(s["file"], dst); total += os.path.getsize(dst)
            out.append({"src": "./assets/rotation/" + pid + ".webp", "label": s["title"]})
        data = {subj: out, **data}
js = "/* 자동 생성: tools/build_rotation.py — 주제명 → 로테이션 사진(경량 WebP)과 어휘 라벨 */\nwindow.CATEGORY_ROTATIONS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
open(os.path.join(OUT, "rotation.js"), "w", encoding="utf-8").write(js)
print(len(data), "topics", sum(len(v) for v in data.values()), "images", round(total / 1024 / 1024, 2), "MB")
