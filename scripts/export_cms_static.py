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
OUT = os.path.join(CMS, 'mariadb', 'neibis', 'map', 'data', 'cms')

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


def collect(fn, extra=None, page_size=PAGE_SIZE):
    """페이지를 돌며 전량을 모은다. 응답 형태는 API 와 같게 두고 list 만 채운다."""
    page, rows, first = 1, [], None
    while True:
        qs = {'page': [str(page)], 'pageSize': [str(page_size)]}
        if extra:
            qs.update({k: [v] for k, v in extra.items()})
        res = fn(qs)
        if not res.get('ok'):
            sys.exit('API 가 실패를 돌려줌: %s' % res.get('message'))
        if first is None:
            first = res
        got = res.get('list') or []
        rows.extend(got)
        if len(rows) >= (res.get('total') or 0) or not got:
            break
        page += 1
    out = dict(first)
    out['list'] = rows
    out['page'] = 1
    out['pageSize'] = len(rows)
    out['totalPages'] = 1
    out['static'] = True
    return out


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    io.open(p, 'w', encoding='utf-8').write(
        json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('  %-22s %6d행  %7.1f KB' % (name, len(data['list']), os.path.getsize(p) / 1024))


def main():
    m = load_serve()
    print('정적 대체본 생성')
    write('headword_list.json', collect(m.api_headword_list, {'SearchType': '3'}))
    write('symbol_list.json', collect(m.api_symbol_list, page_size=100))
    print('저장 위치:', OUT)


if __name__ == '__main__':
    main()
