#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
지역별 인지도(기상도) ETL
========================
입력 : data/dialect_gisangdo/*.xlsx  (2024년 차 어휘 조사 원자료, 제보자 1명 = 파일 1개)
출력 : data/processed/awareness_by_region.json

파일명 규약 : {지역2}{연차2}{세대2}{성별1}VE.xlsx  예) CB2420FVE = 충북·24년차·20대·여성

원자료 구조
-----------
한 행 = (제보자, 항목, 어형) 하나. J열 '사용도/인지도'의 1~4가 그 **어형**에 대한 등급이다.
  1 사용(현재 일상에서 씀) / 2 이해(써 봤으나 지금은 안 씀) / 3 인지(들어는 봄) / 4 무지(처음 들음)
'방언형(어절)'이 '*'이거나 비어 있으면 조사자가 제시만 하고 제보자가 발화하지 않은 형태다.

상태 판정 (지역 단위)
--------------------
  w1~w4 : 지역어형에 등급이 있는 경우. 사용률(등급1 비율)을 기상도 임계값에 태운다.
  std   : 조사는 됐으나 응답이 전부 표준어형 → '표준어권'(제5상태). 결측이 아니다.
  w0    : 조사 자체가 없거나, 지역어형 행은 있는데 등급이 비어 판단 불가 → '관측 없음'.
"""
import collections, glob, io, json, os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(BASE, 'data', 'dialect_gisangdo')
OUT  = os.path.join(BASE, 'data', 'processed', 'awareness_by_region.json')
ALLOW = os.path.join(BASE, 'data', 'processed', 'standard_forms_allowlist.json')

REGION_ORDER = ['GG', 'GW', 'CB', 'CN', 'JB', 'JN', 'GB', 'GN', 'JJ']
REGION_NAMES = {'GG': '경기', 'GW': '강원', 'CB': '충북', 'CN': '충남', 'JB': '전북',
                'JN': '전남', 'GB': '경북', 'GN': '경남', 'JJ': '제주'}
VALID = {'1', '2', '3', '4'}

# 표제어 → dialect_gisangdo.html WORDLIST 표기 (동음이의 구분 괄호)
WORD_ALIAS = {'가': '가(邊)', '새끼': '새끼(繩)', '아우 타다': '아우타다', '키': '키(箕)'}

norm = lambda s: re.sub(r'[:\s]', '', re.sub(r'\([^)]*\)', '', s or ''))


def head_forms(hw):
    """표제어의 표준형 집합. '할머니(호칭)'→{할머니}, '서 되/세 되'→{서되, 세되}."""
    return {norm(p) for p in re.split(r'[/·]', hw or '') if norm(p)}


def load_allowlist():
    """표준어로 처리할 어형 집합 {(항목코드, 정규화어형)}. 없으면 빈 집합."""
    if not os.path.exists(ALLOW):
        print('  경고: 표준어 허용형 목록이 없어 표제어 일치만으로 판정합니다')
        return set()
    d = json.load(io.open(ALLOW, encoding='utf-8'))
    out = {(code, norm(a['form'])) for code, v in d['items'].items() for a in v['allow']}
    print('표준어 허용형 %d건 적용 (%s)' % (len(out), os.path.basename(ALLOW)))
    return out


QC = {'files': 0, 'rowsTotal': 0, 'rowsBadCode': 0, 'gradeFilled': 0, 'skipped': []}



def _norm(h):
    return re.sub(r'\s+', '', str(h or ''))


def resolve_columns(ws):
    """원자료 서식이 13가지로 제각각이라 열 위치를 헤더에서 찾는다.
       (충남 20대 여·70대 여 파일은 타임코드 열이 없어 항목번호가 1번째에 온다.)"""
    try:
        hdr = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    except StopIteration:
        return None
    idx = {_norm(h): i for i, h in enumerate(hdr) if h}

    def find(*names):
        for n in names:
            if n in idx:
                return idx[n]
        return None

    col = {
        'code':  find('항목번호'),
        'head':  find('표제어', '표준어형', '표제어형'),
        'base':  find('방언형(기저형)'),
        'grade': find('인지도/사용도', '사용도/인지도'),
    }
    return None if col['code'] is None or col['grade'] is None else col


def cell(row, i):
    return row[i] if i is not None and i < len(row) else None


def load_records():
    import openpyxl
    recs = []
    # ~$ 로 시작하는 파일은 엑셀이 열려 있을 때 생기는 잠금 파일이라 제외한다
    files = sorted(f for f in glob.glob(os.path.join(SRC, '*.xlsx'))
                   if not os.path.basename(f).startswith('~$'))
    if not files:
        sys.exit('원자료를 찾지 못했습니다: %s' % SRC)
    layouts = collections.defaultdict(list)   # 서식(열 구성)이 몇 가지인지
    for path in files:
        f = os.path.basename(path)
        m = re.match(r'([A-Z]{2})(\d{2})(\d{2})([MF])VE', f)
        if not m:
            print('  건너뜀(파일명 규약 불일치):', f)
            continue
        rg, yr, age, sx = m.groups()
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        ws = wb[wb.sheetnames[0]]
        col = resolve_columns(ws)
        try:
            hdr0 = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
            layouts['|'.join(_norm(h) for h in hdr0)].append(f)
        except StopIteration:
            pass
        if col is None:
            print('  건너뜀(열 구성을 알 수 없음):', f)
            QC['skipped'].append(f)
            wb.close()
            continue
        for row in ws.iter_rows(min_row=2, values_only=True):
            code = cell(row, col['code'])
            if code is None:
                continue
            QC['rowsTotal'] += 1
            mm = re.match(r'^(\d{5})', str(code).strip())
            if not mm:          # 항목번호 칸에 표제어가 들어간 오류 행
                QC['rowsBadCode'] += 1
                continue
            pres = str(cell(row, col['head'])).strip() if cell(row, col['head']) else ''
            base = str(cell(row, col['base'])).strip() if cell(row, col['base']) else ''
            form = base if base and base != '*' else pres
            _g = cell(row, col['grade'])
            g = str(_g).strip() if _g not in (None, '') else None
            if g in VALID:
                QC['gradeFilled'] += 1
            recs.append({'rg': rg, 'year': yr, 'age': int(age), 'sx': sx,
                         'it': mm.group(1), 'pres': pres, 'form': form,
                         'g': g if g in VALID else None})
        wb.close()
    QC['files'] = len(files)
    # 원자료 서식이 제각각이라 열 위치를 헤더로 찾는다. 몇 가지였는지 검수 화면에 알린다.
    QC['layouts'] = len(layouts)
    common = max(layouts.values(), key=len) if layouts else []
    QC['layoutOdd'] = sorted(f for v in layouts.values() if v is not common for f in v)
    return recs, len(files)


def weather_of(rate):
    """dialect_gisangdo.html weatherOf()와 동일한 임계값."""
    if rate is None:
        return 'w0'
    if rate >= 0.6: return 'w1'
    if rate >= 0.3: return 'w2'
    if rate >= 0.1: return 'w3'
    return 'w4'


WEATHER_DB = os.path.join(BASE, 'data', 'gisangdo.db')


def load_records_from_db(db_path=None):
    """전용 테이블(wb_weather_response) → build_output 이 받는 레코드 형태.

    엑셀을 다시 읽지 않고 DB 를 원천으로 삼는 경로. 관리자에서 원자료를 올린 뒤
    정적 JSON 을 다시 뽑을 때(--from-db) 와 프론트 API(server.py) 가 함께 쓴다.
    """
    import sqlite3
    path = db_path or WEATHER_DB
    if not os.path.exists(path):
        raise FileNotFoundError('기상도 DB가 없습니다: %s' % path)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            """SELECT r.response_id rid,
                      f.region_cd rg, f.research_degree yr, f.generation age, f.sex sx,
                      r.item_base it, r.headword pres, r.dialect_form base, r.grade g
               FROM wb_weather_response r
               JOIN wb_weather_file f ON f.weather_file_id = r.weather_file_id
               WHERE r.item_base IS NOT NULL AND f.use_yn = 'Y' AND r.use_yn = 'Y'"""
        ).fetchall()
        nfiles = con.execute(
            "SELECT COUNT(*) FROM wb_weather_file WHERE use_yn='Y'").fetchone()[0]
    finally:
        con.close()
    recs = []
    for r in rows:
        pres = (r['pres'] or '').strip()
        base = (r['base'] or '').strip()
        g = (r['g'] or '').strip()
        recs.append({'rg': r['rg'], 'year': r['yr'], 'age': int(r['age']), 'sx': r['sx'],
                     'it': r['it'], 'pres': pres,
                     'form': base if base and base != '*' else pres,
                     'g': g if g in VALID else None,
                     # 관리자 편집이 '어느 행을 고칠지' 알 수 있게 행 id 를 함께 싣는다.
                     # 제보자 한 명·한 항목에 행이 여러 개라(표준어형 응답 + 지역어형 제시)
                     # 이게 없으면 어느 행을 고쳐야 하는지 알 수 없다.
                     'rid': r['rid']})
    return recs, nfiles


def fill_db_qc(out, db_path=None):
    """QC 는 엑셀을 읽을 때만 채워지는 값이라, DB 원천일 때 다시 채운다."""
    import sqlite3
    path = db_path or WEATHER_DB
    out['meta']['source'] = 'wb_weather_response (전용 테이블)'
    out['meta']['origin'] = 'db'
    if not os.path.exists(path):
        return out
    con = sqlite3.connect(path)
    try:
        qc = out['meta']['qc']
        qc['files'] = con.execute(
            "SELECT COUNT(*) FROM wb_weather_file WHERE use_yn='Y'").fetchone()[0]
        qc['rowsTotal'] = con.execute('SELECT COUNT(*) FROM wb_weather_response').fetchone()[0]
        qc['gradeFilled'] = con.execute(
            "SELECT COUNT(*) FROM wb_weather_response WHERE grade_valid_yn='Y'").fetchone()[0]
        qc['gradeBad'] = con.execute(
            """SELECT COUNT(*) FROM wb_weather_response
               WHERE grade IS NOT NULL AND grade<>'*' AND grade_valid_yn='N'""").fetchone()[0]
        qc['layouts'] = con.execute(
            'SELECT COUNT(DISTINCT src_layout) FROM wb_weather_file').fetchone()[0]
        qc['calcDt'] = con.execute('SELECT MAX(reg_dt) FROM wb_weather_file').fetchone()[0]
        qc.pop('layoutOdd', None)
    finally:
        con.close()
    return out


def build_output(recs, nfiles):
    """레코드 목록 → awareness_by_region.json 과 같은 구조.

    원자료 엑셀(load_records)에서도, DB(wb_weather_response)에서도 같은 함수를 쓴다.
    구조와 판정이 두 곳으로 갈라지면 화면이 달라지므로 조립은 반드시 여기 한 곳에서만 한다."""
    allow = load_allowlist()
    print('제보자 파일 %d개 / 레코드 %d건' % (nfiles, len(recs)))

    # 9개 지역 전부에서 등급이 관측된 항목만 서비스 대상으로 삼는다 (=101개)
    seen = collections.defaultdict(set)
    for r in recs:
        if r['g']:
            seen[r['it']].add(r['rg'])
    core = sorted(it for it, s in seen.items() if len(s) == len(REGION_ORDER))
    print('전 지역 관측 항목: %d개' % len(core))

    headword = {}
    for it in core:
        c = collections.Counter(r['pres'] for r in recs if r['it'] == it and r['pres'])
        headword[it] = c.most_common(1)[0][0]

    by_item = collections.defaultdict(list)
    for r in recs:
        if r['it'] in set(core):
            by_item[r['it']].append(r)

    allow_review = 0
    if os.path.exists(ALLOW):
        _d = json.load(io.open(ALLOW, encoding='utf-8'))
        allow_review = sum(1 for v in _d['items'].values() for a in v['allow'] if a.get('review'))

    # 제보자 명부 — 한 세대·성별에 여러 명이 올 수 있으므로 (연차,세대,성별)로 식별한다.
    # 식별자는 원자료 파일명 어간과 같다: GG2420F = 경기·24년차·20대·여
    _seen = collections.defaultdict(set)
    for r in recs:
        _seen[r['rg']].add((r['year'], r['age'], r['sx']))
    roster = {rg: [{'id': '%s%s%02d%s' % (rg, y, a, sx), 'year': y, 'age': a, 'sex': sx}
                   for (y, a, sx) in sorted(v)]
              for rg, v in _seen.items()}

    items, tally = [], collections.Counter()
    def is_dialect(it, form):
        """그 어형을 지역어형으로 볼지. 표제어 일치와 허용형은 표준어로 처리한다."""
        f = norm(form)
        return bool(f) and f not in head_forms(headword[it]) and (it, f) not in allow

    for it in core:
        H = norm(headword[it])
        entry = {'code': it,
                 'word': WORD_ALIAS.get(headword[it], headword[it]),
                 'headword': headword[it],
                 'regions': {}}
        for rg in REGION_ORDER:
            rows = [r for r in by_item[it] if r['rg'] == rg]  # H 대신 is_dialect() 사용
            informants = sorted({(r['year'], r['age'], r['sx']) for r in rows})

            # 제보자별 지역어형 최선 등급(작을수록 살아 있음)
            best, bestform, bestrid, forms = {}, {}, {}, collections.Counter()
            for key in informants:
                mine = [(int(r['g']), r['form'], r.get('rid')) for r in rows
                        if r['g'] and is_dialect(it, r['form'])
                        and (r['year'], r['age'], r['sx']) == key]
                if mine:
                    lo = min(mine, key=lambda x: (x[0], x[1] or ''))
                    best[key] = lo[0]
                    bestform[key] = lo[1]
                    bestrid[key] = lo[2]
                    forms[lo[1]] += 1

            # 명부 전원을 한 줄씩 — 관리자 그리드가 '칸 하나 = 사람 한 명'으로
            # 편집할 수 있게, 집계 이전의 원자료 상태를 그대로 남긴다.
            #   d 지역어형 응답(등급 있음) · s 표준어형만 응답 · x 등급 미기입/무응답
            panel = []
            for inf in roster.get(rg, []):
                key = (inf['year'], inf['age'], inf['sex'])
                base = {'id': inf['id'], 'age': inf['age'], 'sex': inf['sex']}
                mine = [r for r in rows if (r['year'], r['age'], r['sx']) == key]
                if key in best:
                    base.update({'st': 'd', 'grade': best[key], 'form': bestform[key]})
                    if bestrid.get(key) is not None:
                        base['rid'] = bestrid[key]      # 편집 대상 행 (DB 원천일 때만)
                elif mine and not [r for r in mine if is_dialect(it, r['form'])]:
                    base['st'] = 's'
                else:
                    d = [r for r in mine if is_dialect(it, r['form'])]
                    base.update({'st': 'x', 'form': d[0]['form'] if d else None})
                panel.append(base)

            dial_rows = [r for r in rows if is_dialect(it, r['form'])]
            n = len(best)
            if n:
                use = sum(1 for v in best.values() if v == 1)
                rate = round(use / n, 4)
                state = weather_of(rate)
                cell = {'state': state, 'n': n, 'useRate': rate,
                        'dist': {str(k): sum(1 for v in best.values() if v == k) for k in (1, 2, 3, 4)},
                        'forms': [{'form': f, 'n': c} for f, c in forms.most_common()],
                        'cases': [{'id': '%s%s%02d%s' % (rg, y, a, s), 'age': a, 'sex': s,
                                   'grade': best[(y, a, s)], 'form': bestform[(y, a, s)]}
                                  for (y, a, s) in sorted(best)]}
                cell['gens'] = {}
                for g in (20, 50, 70):
                    mine = {k: v for k, v in best.items() if k[1] == g}
                    if mine:
                        cell['gens'][str(g)] = {'state': 'w%d' % min(mine.values()),
                                                'n': len(mine),
                                                'cases': [{'sex': s, 'grade': mine[(y, a, s)]}
                                                          for (y, a, s) in sorted(mine)]}
                    else:
                        gen_rows = [r for r in rows if r['age'] == g]
                        cell['gens'][str(g)] = {
                            'state': 'std' if gen_rows and not [r for r in gen_rows if is_dialect(it, r['form'])] else 'w0',
                            'n': 0}
            elif rows and not dial_rows:
                # 조사됐고 응답이 전부 표준어형 → 표준어권(확정)
                state = 'std'
                cell = {'state': state, 'n': 0, 'useRate': 0.0,
                        'respondents': len(informants),
                        'note': '조사된 %d명 모두 표준어형만 응답' % len(informants)}
            else:
                state = 'w0'
                cell = {'state': state, 'n': 0,
                        'note': ('지역어형은 나왔으나 사용도/인지도 미기입'
                                 if dial_rows else '해당 항목 응답 없음')}
            cell['panel'] = panel
            entry['regions'][rg] = cell
            tally[state] += 1
        items.append(entry)

    # 지역별로 실제 조사된 제보자 구성 — '조사 안 함'과 '지역어형 안 나옴'을 구분하기 위해

    out = {
        'meta': {
            'title': '지역별 인지도(기상도) — 어휘 조사 실측',
            'source': 'data/dialect_gisangdo/*.xlsx (2024년 차 어휘 조사 원자료)',
            'informants': nfiles,
            'items': len(items),
            'scale': '1 사용 · 2 이해 · 3 인지 · 4 무지 (어형 단위 부여)',
            'metric': '지역어형 사용률 = 그 지역 제보자 중 지역어형에 등급 1을 준 비율',
            'thresholds': 'w1 ≥0.6 · w2 ≥0.3 · w3 ≥0.1 · w4 <0.1 (dialect_gisangdo.html weatherOf와 동일)',
            'qc': dict(QC, coreItems=len(core),
                       cells=len(REGION_ORDER) * len(core),
                       states=dict(tally),
                       allowForms=len(allow),
                       allowReview=allow_review),
            'caveat': ('셀당 제보자 2~6명. 지역×세대 셀은 1~2명이므로 비율이 아닌 사례(cases)로만 제공. '
                       '등급 기입률이 조사자별 63~100%로 달라 지역 간 절대 비교는 피할 것. '
                       '서울은 조사 지역에 포함되지 않음.'),
        },
        'regionOrder': REGION_ORDER,
        'regionNames': REGION_NAMES,
        'regionSites': {'GG': '부천', 'GW': '홍천', 'CB': '진천', 'CN': '천안', 'GB': '구미',
                        'GN': '김해', 'JB': '정읍', 'JN': '광양', 'JJ': '서귀포 대정읍'},
        'regionRoster': roster,
        'states': {
            'w1':  {'label': '맑음',      'icon': 'ti-sun',       'emoji': '☀️', 'desc': '지역어를 지금도 씀'},
            'w2':  {'label': '구름조금',  'icon': 'ti-cloud',     'emoji': '🌤️', 'desc': '써 봤으나 지금은 안 씀'},
            'w3':  {'label': '흐리고 비', 'icon': 'ti-cloud-rain','emoji': '🌧️', 'desc': '들어는 봄'},
            'w4':  {'label': '천둥번개',  'icon': 'ti-cloud-bolt','emoji': '⛈️', 'desc': '처음 들음'},
            'std': {'label': '표준어권',  'icon': 'ti-circle-check', 'emoji': '🔵',
                    'desc': '조사됐으나 지역어형이 나오지 않음 · 표준어로 통일'},
            'w0':  {'label': '관측 없음', 'icon': 'ti-cloud-off', 'emoji': '🌫️', 'desc': '자료 없음'},
        },
        'items': items,
    }
    return out


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description='지역별 인지도(기상도) ETL')
    ap.add_argument('--from-db', action='store_true',
                    help='엑셀 대신 전용 테이블(wb_weather_response)에서 읽는다')
    ap.add_argument('--db', default=None, help='기상도 DB 경로 (기본 data/gisangdo.db)')
    ap.add_argument('--out', default=OUT, help='산출 JSON 경로')
    a = ap.parse_args(argv)

    if a.from_db:
        recs, nfiles = load_records_from_db(a.db)
        print('DB 원천 — 제보자 %d명 / 레코드 %d건' % (nfiles, len(recs)))
        out = build_output(recs, nfiles)
        fill_db_qc(out, a.db)
    else:
        recs, nfiles = load_records()
        out = build_output(recs, nfiles)

    with io.open(a.out, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    OUT_USED = a.out

    tally = out['meta']['qc']['states']
    print('상태 분포 (항목×지역 %d셀):' % sum(tally.values()))
    for k in ['w1', 'w2', 'w3', 'w4', 'std', 'w0']:
        print('  %-4s %4d' % (k, tally.get(k, 0)))
    print('저장:', OUT_USED)


if __name__ == '__main__':
    main()
