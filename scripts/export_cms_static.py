#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""관리자 목록 화면의 정적 대체본을 만든다.

Vercel 배포본에는 CMS API 함수가 없다(vercel.json 은 weather/wordcard 만 넘긴다).
그래서 지역어 지도(dialect.html)·상징 부호(symbol.html) 목록이 404 로 비어 있다.
두 화면은 API 가 죽으면 이 파일로 물러난다.

조립을 여기서 새로 쓰지 않는다 — neibis-cms/serve.py 의 api_*_list 를 그대로
불러 쓴다. SQL 을 두 벌 두면 목록 규칙이 갈라진다(단어 카드에서 겪은 것).

    python3 scripts/export_cms_static.py
"""
import importlib.util
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CMS = os.path.join(ROOT, 'neibis-cms')
OUT = os.path.join(CMS, 'mariadb', 'neibis', 'data', 'cms')

# serve.py 는 상대 경로로 자료를 찾는다 — 그 디렉터리에서 불러야 한다
PAGE_SIZE = 300          # api_headword_list 가 허용하는 값 (10·50·100·200·300)


def load_serve():
    cwd = os.getcwd()
    os.chdir(CMS)
    try:
        spec = importlib.util.spec_from_file_location('cms_serve', os.path.join(CMS, 'serve.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        os.chdir(cwd)


def collect(fn, extra=None, page_size=PAGE_SIZE, cap=None):
    """페이지를 돌며 모은다. 응답 형태는 API 와 같게 두고 list 만 채운다.
       cap 이 있으면 거기까지만 담고 truncated 로 표시한다."""
    page, rows, first = 1, [], None
    while True:
        # 목록 키와 페이지 크기 이름이 화면마다 다르다 — 둘 다 넘겨 두고 받는 쪽에서 고른다
        qs = {'page': [str(page)], 'pageSize': [str(page_size)], 'size': [str(page_size)]}
        if extra:
            qs.update({k: [v] for k, v in extra.items()})
        res = fn(qs)
        if not res.get('ok'):
            sys.exit('API 가 실패를 돌려줌: %s' % res.get('message'))
        if first is None:
            first = res
            key = 'list' if isinstance(res.get('list'), list) else 'rows'
        got = res.get(key) or []
        rows.extend(got)
        if cap and len(rows) >= cap:
            rows = rows[:cap]
            break
        if len(rows) >= (res.get('total') or 0) or not got:
            break
        page += 1
    out = dict(first)
    total = first.get('total') or len(rows)
    out[key] = rows
    out['page'] = 1
    out['pageSize'] = len(rows)
    out['size'] = len(rows)
    out['totalPages'] = 1
    out['static'] = True
    out['truncated'] = len(rows) < total          # 일부만 담았는지
    out['availableTotal'] = len(rows)             # 실제로 담긴 건수
    out['total'] = total                          # 원래 전체 건수(있는 그대로)
    return out


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    io.open(p, 'w', encoding='utf-8').write(
        json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    n = len(data.get('list') if isinstance(data.get('list'), list) else data.get('rows') or [])
    mark = '  ← 전체 %s 중 일부' % f"{data['total']:,}" if data.get('truncated') else ''
    print('  %-22s %6d행  %7.1f KB%s' % (name, n, os.path.getsize(p) / 1024, mark))


# 내보낼 목록 — (파일명, serve.py 함수, 추가 질의, 페이지크기, 상한)
#   상한(cap) 은 '이 건수까지만 담는다'. 어휘 조사 자료는 31만 행이라 전량이
#   불가능하다 → 앞쪽 일부만 담고, 화면에 몇 건만 담았는지 반드시 밝힌다.
#   조용히 잘라 두면 배포본이 '자료가 이만큼뿐'인 것처럼 보인다.
SPECS = [
    ('headword_list.json',   'api_headword_list',      {'SearchType': '3'}, 300,  None),
    ('symbol_list.json',     'api_symbol_list',        None,                100,  None),
    ('source_list.json',     'api_source_list',        None,                100,  None),
    ('oral_list.json',       'api_oral_list',          None,                100,  None),
    ('literature_list.json', 'api_literature_list',    None,                100,  None),
    ('user_list.json',       'api_user_list',          None,                100,  None),
    ('survey_list.json',     'api_survey_list',        None,                100,  None),
    ('survey_legacy.json',   'api_survey_legacy_list', None,                100,  None),
    ('stats_openapi.json',   'api_openapi_usage_list',      None,                100,  None),
    ('vocab_list.json',      'api_vocab_list',         None,                100,  2000),
]
BBS_IDS = ['246', '251', '252', '253', '254', '256']


def main():
    m = load_serve()
    print('정적 대체본 생성')
    for name, fname, extra, size, cap in SPECS:
        fn = getattr(m, fname, None)
        if fn is None:
            print('  %-22s 건너뜀 — serve.py 에 %s 가 없음' % (name, fname))
            continue
        try:
            write(name, collect(fn, extra, size, cap))
        except SystemExit:
            raise
        except Exception as e:
            print('  %-22s 실패 — %s' % (name, e))

    fn = getattr(m, 'api_board_post_list', None)
    if fn is not None:
        for b in BBS_IDS:
            try:
                write('bbs_%s.json' % b, collect(fn, {'bbsId': b}, 100))
            except Exception as e:
                print('  bbs_%-17s 실패 — %s' % (b + '.json', e))
    print('저장 위치:', OUT)


if __name__ == '__main__':
    main()
