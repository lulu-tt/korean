#!/usr/bin/env python3
"""수업용 화면(초등 5-2 「표준어와 방언」)에 '자료 사본'을 넣는다.

화면들은 평소에 기존 자료(지역어 지도·지점별 응답·구술발화 예문·세대별 조사·문학 속 지역어)를
그때그때 불러온다. 그런데 앱의 파일 미리보기처럼 자료 파일·서버에 접근할 수 없는 곳에서 열면
아무것도 안 나온다. 그래서 각 화면이 쓰는 자료만 골라 같은 원본에서 뽑아
<!-- SNAPSHOT:BEGIN --> … <!-- SNAPSHOT:END --> 사이에 넣어 둔다.
화면은 불러오기에 실패할 때만 이 사본을 쓴다(원본이 우선).

원본 자료나 화면의 낱말 목록을 바꿨으면 이 스크립트를 다시 돌릴 것:
    python3 scripts/build_class_snapshots.py
"""
import base64
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'data', 'processed')
BEGIN, END = '<!-- SNAPSHOT:BEGIN -->', '<!-- SNAPSHOT:END -->'


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def img_data_uri(rel):
    """화면의 사진 경로(./image/x 또는 ./image/x.jpg)를 360px·화질 50으로 줄인 data URI로(미리보기 파일 크기 한도 때문). 파일이 없으면 None."""
    path = os.path.join(ROOT, rel.lstrip('./'))
    if not os.path.splitext(path)[1]:
        path += '.jpg'
    if not os.path.isfile(path):
        return None
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'x.jpg')
        try:  # macOS sips로 축소(없으면 원본 그대로)
            subprocess.run(['sips', '-Z', '360', '-s', 'formatOptions', '50', path, '--out', out],
                           check=True, capture_output=True)
            data = open(out, 'rb').read()
        except Exception:
            data = open(path, 'rb').read()
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()


def trim_map(m, with_points):
    groups = {}
    for k, g in (m.get('groups') or {}).items():
        vs = []
        for v in g.get('variants') or []:
            x = {'word': v['word'], 'n': v.get('n', 0)}
            if with_points:
                x['points'] = [[round(a, 4), round(b, 4)] for a, b in v.get('points') or []]
            vs.append(x)
        groups[k] = {'label': g.get('label'), 'color': g.get('color'), 'variants': vs}
    return {'headword': m.get('headword'), 'meaning': m.get('meaning'), 'groups': groups}


def snap_town(html):
    snap = {}
    for no, img in re.findall(r"no: '(\d+)',\s*rc: '[^']*',\s*img: '([^']*)'", html):
        snap['./data/processed/map/%s.json' % no] = trim_map(load(os.path.join(P, 'map', no + '.json')), True)
        pts = load(os.path.join(P, 'map_points', no + '.json'))
        snap['./data/processed/map_points/%s.json' % no] = {
            'points': {k: [{'f': x.get('f', '')} for x in v] for k, v in (pts.get('points') or {}).items()}}
        if img:
            uri = img_data_uri(img)
            if uri:
                snap['img:' + img] = uri
    return snap


def snap_grandma(html):
    ws = load(os.path.join(P, 'word_stories.json'))
    snap = {}
    used = re.findall(r"ws: '(\d+)', no: '(\d+)', ex: '([\d/]+)'", html)
    keep = {w for w, _, _ in used}
    snap['./data/processed/word_stories.json'] = {'coding': ws['coding'],
                                                  'words': [w for w in ws['words'] if w['id'] in keep]}
    for _, no, ex in used:
        snap['./data/processed/map/%s.json' % no] = trim_map(load(os.path.join(P, 'map', no + '.json')), False)
        exj = load(os.path.join(P, 'examples', no + '.json'))
        tid, line = ex.split('/')
        pick = [e for e in exj.get('examples') or [] if str(e.get('trs_id')) == tid and str(e.get('line_no')) == line]
        fields = ('trs_id', 'line_no', 'variant', 'matched_key', 'dialect', 'standard', 'sido', 'sigungu', 'year')
        snap['./data/processed/examples/%s.json' % no] = {'examples': [{k: e.get(k) for k in fields} for e in pick]}
    for img in re.findall(r"img: '([^']+)'", html):
        uri = img_data_uri(img)
        if uri:
            snap['img:' + img] = uri
    return snap


def snap_literature(html):
    """문학 속 지역어: 화면이 부르는 /api/literatures 와 같은 원본(dialect_local.db), 없으면 정적 JSON."""
    books = re.findall(r"\{ q: '([^']+)',\s*book: '([^']+)'", html)
    db = os.path.join(ROOT, 'dialect_local.db')
    items = {}
    if os.path.isfile(db):
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        for q, _ in books:
            r = con.execute("SELECT * FROM tb_literature WHERE dlt_tp = ? LIMIT 1", (q,)).fetchone()
            if not r:
                continue
            exs = con.execute("SELECT * FROM tb_literature_example WHERE liter_id = ?", (r['liter_id'],)).fetchall()
            # DB 열 이름(word_example)을 API·정적 JSON과 같은 이름(example)으로 맞춘다
            items[q] = dict(r, examples=[dict(dict(e), example=e['word_example']) for e in exs])
    if len(items) < len(books):
        for it in load(os.path.join(ROOT, 'data', 'literature_data.json'))['data']:
            if it['dlt_tp'] in dict(books) and it['dlt_tp'] not in items:
                items[it['dlt_tp']] = it
    snap = {}
    for q, book in books:
        it = items.get(q)
        if not it:
            continue
        exs = [e for e in it.get('examples') or [] if e.get('book_name') == book] or (it.get('examples') or [])[:1]
        snap['lit:' + q] = {k: it.get(k) for k in ('liter_id', 'dlt_tp', 'std_tp', 'mean', 'region_nm', 'rel_dlt', 'word_desc')}
        snap['lit:' + q]['examples'] = [{k: e.get(k) for k in ('example', 'writer', 'book_name', 'publish_year')} for e in exs]
    return snap


PAGES = {
    'dialect_town_words.html': snap_town,
    'dialect_grandma_story.html': snap_grandma,
    'dialect_literature_cards.html': snap_literature,
}


def main():
    for name, fn in PAGES.items():
        path = os.path.join(ROOT, name)
        html = open(path, encoding='utf-8').read()
        if BEGIN not in html or END not in html:
            sys.exit('%s: 사본 자리 표시(%s … %s)가 없습니다' % (name, BEGIN, END))
        snap = fn(html)
        body = json.dumps(snap, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
        block = '%s\n<script type="application/json" id="class-snapshot">%s</script>\n%s' % (BEGIN, body, END)
        html = html[:html.index(BEGIN)] + block + html[html.index(END) + len(END):]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        print('%-32s 자료 %d건, %d KB' % (name, len(snap), len(body.encode()) // 1024))


if __name__ == '__main__':
    main()
