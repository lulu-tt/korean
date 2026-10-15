#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
운영개발(공식)이 추정색으로 칠하는 미조사 지역을 각 표제어 데이터에 misurveyFill 로 추가.

- 입력: --region <region2color.json>  { "<hw>": { "<nk키>": "r,g,b" } }  (공식 region→color, 조사+미조사 전체)
- 우리 데이터의 조사 지역(groups.places / regions)을 nk 키로 모아, 공식에는 있고 우리엔 없는
  지역만 misurveyFill 로 추가(=미조사 추정 + 데이터 공백). 색은 공식값(hex).
- 마커(실측 점)는 건드리지 않음. 면색(dialect-map-core)만 이 값을 폴백으로 사용.
- 원본 1줄 포맷 유지. misurveyFill 이 비면 파일을 쓰지 않음(불필요한 diff 방지).

사용: python3 scripts/add_misurvey_fill.py --region <path> [--dir data/processed/map] [--dry]
"""
import json, os, re, argparse

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

def hexv(rgb):
    m = re.search(r'(\d+)\D+(\d+)\D+(\d+)', str(rgb))
    return '#%02X%02X%02X' % (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None

ap = argparse.ArgumentParser()
ap.add_argument('--region', required=True)
ap.add_argument('--dir', default='data/processed/map')
ap.add_argument('--dry', action='store_true')
a = ap.parse_args()

REG = json.load(open(a.region, encoding='utf-8'))
files = sorted(f for f in os.listdir(a.dir) if re.match(r'^\d+\.json$', f))
added_files = 0
added_regions = 0

for fn in files:
    hw = fn[:-5]
    off = REG.get(hw, {})
    path = os.path.join(a.dir, fn)
    obj = json.loads(open(path, encoding='utf-8').read())
    our = set()
    # ourKeys 는 '실측 지점(groups.places)'만 기준 — payload.regions 의 과거 미조사 패딩은 제외.
    #  그래야 공식이 칠하는 미조사 지역이 misurveyFill 로 제대로 들어가고, 공식이 안 칠하는 곳은 흰색.
    for gk, g in (obj.get('groups') or {}).items():
        for v in (g.get('variants') or []):
            for pl in (v.get('places') or []):
                our.add(nk(pl.get('region_nm') or (((pl.get('sido', '') + ' ') if pl.get('sido') else '') + (pl.get('sigungu') or ''))))
    mis = {}
    for k, c in off.items():
        if k and k not in our:
            h = hexv(c)
            if h:
                mis[k] = h
    # 변화 없으면(기존 misurveyFill 과 동일, 혹은 둘 다 없음) 건너뜀
    if mis == (obj.get('misurveyFill') or {}):
        continue
    if mis:
        obj['misurveyFill'] = mis
    elif 'misurveyFill' in obj:
        del obj['misurveyFill']
    added_files += 1
    added_regions += len(mis)
    if not a.dry:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(obj, ensure_ascii=False))

print('misurveyFill 변경 파일:', added_files, '| 총 추가 지역:', added_regions)
