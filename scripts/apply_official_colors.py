#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
공식(국립국어원) 지역어 지도의 faceColor 로 우리 처리 데이터의 그룹 색을 맞춘다.

전제(확인됨): 우리 mutation_group(계열) 묶음이 공식의 색 그룹과 1:1 대응하고,
  공식은 단어마다, 그리고 지역마다 faceColor 가 일정하다.

그룹 색 결정:
  1) 단어-투표: variants[].word 를 공식 word→color 로 조회해 최빈 색
  2) 지역-투표(폴백): 1)이 비면 그룹이 덮는 지역(place)을 공식 region→color 로 조회
     (우리 철자와 공식 철자가 달라 단어매칭이 실패하는 계열 구제)
  3) 둘 다 없으면 기존 색 유지

출력은 원본과 동일한 1줄 포맷(json.dumps ensure_ascii=False)으로 써서 diff 를 색 변경만으로 유지.

사용: python3 scripts/apply_official_colors.py --official <word2color.json> \
        --region <region2color.json> [--dir data/processed/map] [--dry]
"""
import json, os, re, sys, argparse

def rgb_to_hex(rgb):
    m = re.search(r'(\d+)\D+(\d+)\D+(\d+)', str(rgb))
    if not m:
        return None
    return '#%02X%02X%02X' % (min(255, int(m.group(1))), min(255, int(m.group(2))), min(255, int(m.group(3))))

def nk(nm):
    nm = str(nm or '').strip()
    m = re.search(r'(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시)', nm)
    if m:
        return m.group(1)
    t = re.sub(r'^(경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도|제주도)\s*', '', nm).strip()
    cm = re.match(r'^(.+시)\s+.+구$', t)
    if cm:
        return cm.group(1)
    jm = re.match(r'^(제주시|서귀포시)\b', t)
    if jm:
        return jm.group(1)
    t = re.sub(r'\s*\(.*\)$', '', t).strip()
    return t.split()[0] if t.split() else t

def vote(d):
    best, bestn = None, 0
    for c, n in d.items():
        if n > bestn:
            best, bestn = c, n
    return best

ap = argparse.ArgumentParser()
ap.add_argument('--official', required=True)
ap.add_argument('--region', default=None)
ap.add_argument('--dir', default='data/processed/map')
ap.add_argument('--dry', action='store_true')
a = ap.parse_args()

OFF = json.load(open(a.official, encoding='utf-8'))
REG = json.load(open(a.region, encoding='utf-8')) if a.region else {}

changed_total = by_word = by_region = 0
unmatched = []
files = sorted(f for f in os.listdir(a.dir) if re.match(r'^\d+\.json$', f))

for fn in files:
    hw = fn[:-5]
    off = OFF.get(hw, {})
    reg = REG.get(hw, {})
    path = os.path.join(a.dir, fn)
    obj = json.loads(open(path, encoding='utf-8').read())
    groups = obj.get('groups') or {}
    changed = 0
    for gk, g in groups.items():
        wv = {}
        for v in (g.get('variants') or []):
            w = v.get('word')
            if not w or w == '미조사':
                continue
            c = off.get(w)
            if c:
                wv[c] = wv.get(c, 0) + 1
        pick, via = vote(wv), 'word'
        if not pick:
            rv = {}
            for v in (g.get('variants') or []):
                for pl in (v.get('places') or []):
                    k = nk(pl.get('region_nm') or ((pl.get('sido', '') + ' ') if pl.get('sido') else '') + (pl.get('sigungu') or ''))
                    c = reg.get(k)
                    if c:
                        rv[c] = rv.get(c, 0) + 1
            pick, via = vote(rv), 'region'
        if not pick:
            unmatched.append('%s:%s(%s)' % (hw, gk, '/'.join(v.get('word', '') for v in (g.get('variants') or []))))
            continue
        hexv = rgb_to_hex(pick)
        if hexv and g.get('color') != hexv:
            g['color'] = hexv
            changed += 1
            changed_total += 1
            if via == 'word':
                by_word += 1
            else:
                by_region += 1
    if changed and not a.dry:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(obj, ensure_ascii=False))

print('처리 파일:', len(files), '| 색 교체:', changed_total, '(단어', by_word, '/ 지역', by_region, ')')
if unmatched:
    print('미매칭(%d):\n  %s' % (len(unmatched), '\n  '.join(unmatched)))
