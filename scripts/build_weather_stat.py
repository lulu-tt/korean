#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기상도 집계 적재 — wb_weather_response → wb_weather_region_stat
==============================================================
판정 로직(임계값·표준어 허용형 비교)은 새로 만들지 않고
etl_awareness_region.py 의 함수를 그대로 불러 쓴다. 기준이 두 곳으로 갈라지면 안 된다.

  · 표준어 허용형 : etl.load_allowlist()      (data/processed/standard_forms_allowlist.json)
  · 표제어 정규화 : etl.norm / etl.head_forms
  · 상태 임계값   : etl.weather_of            w1 ≥0.6 · w2 ≥0.3 · w3 ≥0.1 · w4 <0.1

검증 : 적재 결과를 data/processed/awareness_by_region.json 과 지역×항목 단위로 대조한다.

  python3 scripts/build_weather_stat.py
"""
import collections, importlib.util, io, json, os, sqlite3, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(BASE, 'data', 'gisangdo.db')
REF  = os.path.join(BASE, 'data', 'processed', 'awareness_by_region.json')
ALLOW = os.path.join(BASE, 'data', 'processed', 'standard_forms_allowlist.json')


def load_etl():
    spec = importlib.util.spec_from_file_location(
        'etl', os.path.join(BASE, 'scripts', 'etl_awareness_region.py'))
    m = importlib.util.module_from_spec(spec)
    sys.modules['etl'] = m
    spec.loader.exec_module(m)
    return m


def fetch_records(con):
    """DB → ETL 이 쓰는 레코드 형태. form 은 기저형이 없거나 '*' 면 표제어형으로 대체한다."""
    q = """SELECT f.region_cd rg, f.research_degree year, f.generation age, f.sex sx,
                  r.item_base it, r.headword pres, r.dialect_form base, r.grade g
           FROM wb_weather_response r
           JOIN wb_weather_file f ON f.weather_file_id = r.weather_file_id
           WHERE r.item_base IS NOT NULL AND f.use_yn = 'Y' AND r.use_yn = 'Y'"""
    out = []
    for row in con.execute(q):
        pres = (row['pres'] or '').strip()
        base = (row['base'] or '').strip()
        g = (row['g'] or '').strip()
        out.append({'rg': row['rg'], 'year': row['year'], 'age': int(row['age']),
                    'sx': row['sx'], 'it': row['it'], 'pres': pres,
                    'form': base if base and base != '*' else pres,
                    'g': g if g in ('1', '2', '3', '4') else None})
    return out


def main():
    etl = load_etl()
    if not os.path.exists(DB):
        sys.exit('먼저 load_weather_xlsx.py 로 적재하세요: %s' % DB)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    recs = fetch_records(con)
    allow = etl.load_allowlist()
    print('레코드 %s건 / 표준어 허용형 %d건' % (format(len(recs), ','), len(allow)))

    # 전 지역(9곳)에서 등급이 관측된 항목 = 서비스 대상
    seen = collections.defaultdict(set)
    for r in recs:
        if r['g']:
            seen[r['it']].add(r['rg'])
    core = {it for it, s in seen.items() if len(s) == len(etl.REGION_ORDER)}
    print('전 지역 관측 항목 %d개 / 전체 항목 %d개' % (len(core), len(seen)))

    # 항목별 대표 표제어 (최다 표기)
    pres_by_item = collections.defaultdict(collections.Counter)
    for r in recs:
        if r['pres']:
            pres_by_item[r['it']][r['pres']] += 1
    headword = {it: c.most_common(1)[0][0] for it, c in pres_by_item.items()}

    by = collections.defaultdict(list)
    for r in recs:
        by[(r['it'], r['rg'])].append(r)

    def is_dialect(it, form):
        f = etl.norm(form)
        hw = headword.get(it, '')
        return bool(f) and f not in etl.head_forms(hw) and (it, f) not in allow

    rows_out = []
    tally = collections.Counter()
    # 등급이 없는 항목도 w0 로 남긴다 (API api_weather_recalc 과 같은 기준)
    items = sorted({r['it'] for r in recs})
    for it in items:
        for rg in etl.REGION_ORDER:
            rows = by.get((it, rg), [])
            informants = sorted({(r['year'], r['age'], r['sx']) for r in rows})
            best = {}
            for key in informants:
                mine = [(int(r['g']), r['form']) for r in rows
                        if r['g'] and is_dialect(it, r['form'])
                        and (r['year'], r['age'], r['sx']) == key]
                if mine:
                    best[key] = min(mine)[0]
            dial_rows = [r for r in rows if is_dialect(it, r['form'])]
            n = len(best)
            if n:
                rate = round(sum(1 for v in best.values() if v == 1) / n, 4)
                state, note, std_only = etl.weather_of(rate), None, 'N'
            elif rows and not dial_rows:
                rate, state, std_only = 0.0, 'std', 'Y'
                note = '조사된 %d명 모두 표준어형만 응답' % len(informants)
            else:
                rate, state, std_only = None, 'w0', 'N'
                note = ('지역어형은 나왔으나 사용도/인지도 미기입'
                        if dial_rows else '해당 항목 응답 없음')
            tally[state] += 1
            rows_out.append((rg, it, headword.get(it, ''), state,
                             None if rate is None else round(rate * 100, 2),
                             n, len(dial_rows), std_only,
                             'Y' if it in core else 'N', note))

    con.execute('DELETE FROM wb_weather_region_stat')
    con.executemany("""INSERT INTO wb_weather_region_stat
        (region_cd,item_base,headword,state,use_rate,informant_cnt,dialect_cnt,
         std_only_yn,core_yn,note,calc_dt)
        VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))""", rows_out)

    # 표준어 허용형도 표로 옮긴다
    con.execute('DELETE FROM wb_weather_std_form')
    if os.path.exists(ALLOW):
        d = json.load(io.open(ALLOW, encoding='utf-8'))
        batch, sid = [], 0
        for it, v in d.get('items', {}).items():
            for a in v.get('allow', []):
                sid += 1
                batch.append((sid, it, a.get('form') or a.get('std') or '',
                              '검토필요' if a.get('review') else None))
        con.executemany("""INSERT INTO wb_weather_std_form
            (std_form_id,item_base,std_form,memo,use_yn,reg_id,reg_dt)
            VALUES (?,?,?,?,'Y','etl',datetime('now'))""", batch)
        print('표준어 허용형 적재 %d건' % len(batch))
    con.commit()

    print('집계 적재 %s건 (지역 %d × 항목 %d)'
          % (format(len(rows_out), ','), len(etl.REGION_ORDER), len(items)))
    print('  상태 분포:', dict(tally))

    # ── 검증: 기존 ETL 산출과 지역×항목 대조 ─────────────────────────────
    if os.path.exists(REF):
        ref = json.load(io.open(REF, encoding='utf-8'))
        want = {}
        for e in ref['items']:
            for rg, cell in e['regions'].items():
                want[(e['code'], rg)] = cell['state']
        got = {(r['item_base'], r['region_cd']): r['state']
               for r in con.execute("""SELECT item_base,region_cd,state
                                       FROM wb_weather_region_stat WHERE core_yn='Y'""")}
        common = set(want) & set(got)
        bad = [(k, want[k], got[k]) for k in sorted(common) if want[k] != got[k]]
        print('검증 — ETL 산출 %d칸 / DB core %d칸 / 공통 %d칸'
              % (len(want), len(got), len(common)))
        print('  상태 불일치 %d칸' % len(bad))
        for k, w, g in bad[:10]:
            print('    %s %s : ETL=%s DB=%s' % (k[0], k[1], w, g))
        missing = set(want) - set(got)
        if missing:
            print('  ETL 에만 있는 칸 %d개: %s' % (len(missing), sorted(missing)[:5]))
    con.close()


if __name__ == '__main__':
    main()
