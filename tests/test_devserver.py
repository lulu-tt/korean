#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
개발서버 기준 단위(스모크) 테스트 — 표준 라이브러리 unittest 만 사용, 읽기 전용.

전제: `python3 dev.py` 로 8765(프론트)·8877(관리자)가 떠 있어야 한다.
      (다른 주소는 환경변수 FRONT / ADMIN 으로 지정)

실행
  python3 -m unittest discover -s tests -v

원칙
  · GET 만 쓴다. DB 에 시험값을 남기지 않는다(쓰기 API 는 «존재 여부»만 405/에러 형태로 확인하지 않고 제외).
  · 서버가 안 떠 있으면 전체를 skip 하지 않고 명확히 실패시킨다.
"""
import json
import os
import re
import shutil
import subprocess
import unittest
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

FRONT = os.environ.get("FRONT", "http://127.0.0.1:8765")
ADMIN = os.environ.get("ADMIN", "http://127.0.0.1:8877")
ROOT = Path(__file__).resolve().parent.parent
API = "/mariadb/neibis-api"


def fetch(base, path, timeout=30):
    """(status, content-type, body bytes). HTTP 오류도 예외 없이 돌려준다."""
    try:
        with urllib.request.urlopen(base + path, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()


def jget(base, path):
    st, ct, body = fetch(base, path)
    assert st == 200, "%s%s → HTTP %s" % (base, path, st)
    return json.loads(body)


def setUpModule():
    for base in (FRONT, ADMIN):
        try:
            fetch(base, "/favicon.ico", timeout=5)
        except Exception as e:  # 연결 거부 등
            raise RuntimeError("개발서버에 접속할 수 없습니다: %s (%s) — python3 dev.py 먼저 실행" % (base, e))


# ───────────────────────── 서버 구성 ─────────────────────────
class TestRouting(unittest.TestCase):
    def test_both_ports_serve_both_apps(self):
        """dev.py 는 두 포트 모두에서 프론트·관리자를 같이 받아야 한다(업로드 501 사고 방지)."""
        for base in (FRONT, ADMIN):
            self.assertEqual(fetch(base, "/index.html")[0], 200, base)
            self.assertEqual(fetch(base, API + "/system/user/list")[0], 200, base)

    def test_unknown_paths_404(self):
        self.assertEqual(fetch(FRONT, "/api/nope")[0], 404)
        self.assertEqual(fetch(ADMIN, API + "/nope")[0], 404)


# ───────────────────────── 프론트 API ─────────────────────────
class TestFrontApi(unittest.TestCase):
    def test_notices(self):
        d = jget(FRONT, "/api/notices")
        self.assertEqual(d["status"], "success")
        self.assertTrue(d["data"])
        self.assertIn("title", d["data"][0])

    def test_notice_detail(self):
        d = jget(FRONT, "/api/notice_detail?id=" + jget(FRONT, "/api/notices")["data"][0]["post_id"])
        self.assertEqual(d["status"], "success")

    def test_vocab_search_hit(self):
        d = jget(FRONT, "/api/vocab_search?q=" + urllib.parse.quote("벼"))
        self.assertEqual(d["status"], "success")
        self.assertGreater(d["total"], 0)
        self.assertLessEqual(len(d["data"]), d["size"])
        for k in ("dlt", "std", "regions", "points"):
            self.assertIn(k, d["data"][0])

    def test_vocab_search_miss(self):
        d = jget(FRONT, "/api/vocab_search?q=zzzzqq")
        self.assertEqual(d["total"], 0)
        self.assertEqual(d["data"], [])

    def test_vocab_map(self):
        d = jget(FRONT, "/api/vocab_map?dlt=" + urllib.parse.quote("벼"))
        self.assertEqual(d["status"], "success")
        self.assertIn("points", d)
        self.assertIn("regionData", d)

    def test_oral_search(self):
        d = jget(FRONT, "/api/oral_search?q=" + urllib.parse.quote("벼"))
        self.assertEqual(d["status"], "success")
        self.assertGreater(d["totalTurns"], 0)

    def test_literatures_and_facets(self):
        d = jget(FRONT, "/api/literatures")
        self.assertEqual(d["status"], "success")
        self.assertGreater(d["total"], 0)
        self.assertEqual(jget(FRONT, "/api/literature_facets")["status"], "success")

    def test_region_culture(self):
        self.assertTrue(jget(FRONT, "/api/region_culture")["data"])
        self.assertGreater(jget(FRONT, "/api/region_culture_list")["total"], 0)

    def test_map_point(self):
        self.assertEqual(jget(FRONT, "/api/map_point")["status"], "success")

    def test_weather_awareness_shape(self):
        """기상도 지역 인지도 — 메타/제5상태(std) 포함 여부."""
        d = jget(FRONT, "/api/weather/awareness")
        self.assertIn("meta", d)
        self.assertGreater(d["meta"]["informants"], 0)

    def test_survey_active(self):
        self.assertEqual(jget(FRONT, "/api/survey/active")["status"], "success")

    def test_openapi_mine_anonymous(self):
        """비로그인 상태에서 키 목록이 새지 않는지(데이터 비어 있거나 안전한 status)."""
        d = jget(FRONT, "/api/openapi/mine")
        self.assertIn("status", d)


# ───────────────────────── 관리자 API ─────────────────────────
class TestAdminApi(unittest.TestCase):
    PAGED = [  # (경로, 목록 키)
        ("/board/post/list", "rows"),
        ("/system/user/list", "rows"),
        ("/archive/literature/list", "rows"),
        ("/wordcard/list", "list"),
        ("/symbol/list", "list"),
        ("/vocab/list", "list"),
        ("/headword/list", "list"),
        ("/oral/list", "list"),
        ("/stats/user-connect", "list"),
    ]

    def test_list_endpoints(self):
        for path, key in self.PAGED:
            with self.subTest(path=path):
                d = jget(ADMIN, API + path)
                self.assertTrue(d.get("ok"), d)
                self.assertIsInstance(d[key], list)
                self.assertGreaterEqual(d["total"] if "total" in d else 0, 0)

    def test_paging_respects_size(self):
        # 허용 크기는 10/20/50/100, 그 밖의 값은 10으로 되돌린다(서버 규칙)
        d = jget(ADMIN, API + "/system/user/list?size=20&page=2")
        self.assertEqual(d["page"], 2)
        self.assertEqual(d["size"], 20)
        self.assertLessEqual(len(d["rows"]), 20)
        self.assertEqual(jget(ADMIN, API + "/system/user/list?size=3")["size"], 10)

    def test_user_detail_matches_list(self):
        uid = jget(ADMIN, API + "/system/user/list")["rows"][0]["userId"]
        d = jget(ADMIN, API + "/system/user/detail?userId=" + uid)
        self.assertTrue(d["ok"])
        self.assertEqual(str(d["user"]["userId"]), str(uid))

    def test_user_list_hides_password(self):
        """회원 목록·상세 응답에 비밀번호/해시 필드가 노출되지 않아야 한다."""
        rows = jget(ADMIN, API + "/system/user/list")["rows"]
        blob = json.dumps(rows, ensure_ascii=False).lower()
        for bad in ("password", "passwd", "userpw", "pwhash"):
            self.assertNotIn(bad, blob)

    def test_wordcard_detail_roundtrip(self):
        lst = jget(ADMIN, API + "/wordcard/list")["list"]
        if not lst:
            self.skipTest("단어 카드가 없음")
        d = jget(ADMIN, API + "/wordcard/detail?id=" + urllib.parse.quote(str(lst[0]["id"])))
        self.assertTrue(d.get("ok"), d)
        self.assertFalse(jget(ADMIN, API + "/wordcard/detail?id=").get("ok"))  # id 없으면 거절

    def test_headword_detail_roundtrip(self):
        lst = jget(ADMIN, API + "/headword/list")["list"]
        if not lst:
            self.skipTest("표제어가 없음")
        first = lst[0]
        hid = first.get("headwordId") or first.get("id")
        d = jget(ADMIN, API + "/headword/detail?headwordId=" + urllib.parse.quote(str(hid)))
        self.assertTrue(d.get("ok"), d)


# ───────────────────────── 정적 페이지 ─────────────────────────
class _Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and a.get("src"):
            self.refs.append(a["src"])
        elif tag == "link" and a.get("href") and (a.get("rel") or "").lower() in ("stylesheet", "icon"):
            self.refs.append(a["href"])


def _local(ref):
    ref = ref.split("?")[0].split("#")[0]
    if not ref or re.match(r"^(https?:)?//|^data:|^javascript:", ref):
        return None
    return ref


class TestStaticPages(unittest.TestCase):
    def test_every_root_page_loads_with_local_assets(self):
        pages = sorted(p.name for p in ROOT.glob("*.html"))
        self.assertGreater(len(pages), 20)
        for name in pages:
            with self.subTest(page=name):
                st, ct, body = fetch(FRONT, "/" + urllib.parse.quote(name))
                self.assertEqual(st, 200)
                self.assertIn("text/html", ct)
                p = _Refs()
                p.feed(body.decode("utf-8", "replace"))
                for ref in p.refs:
                    loc = _local(ref)
                    if loc is None or loc.startswith("/"):
                        continue
                    self.assertTrue((ROOT / loc).exists(), "%s 가 참조한 %s 없음" % (name, ref))

    def test_static_content_types(self):
        for path, want in (("/styles.css", "css"), ("/gnb.js", "javascript"), ("/flag.svg", "svg")):
            st, ct, _ = fetch(FRONT, path)
            self.assertEqual(st, 200, path)
            self.assertIn(want, ct, path)


# ───────────────────────── 프론트 JS 문법 ─────────────────────────
@unittest.skipUnless(shutil.which("node"), "node 없음")
class TestJsSyntax(unittest.TestCase):
    def test_root_scripts_parse(self):
        for f in sorted(ROOT.glob("*.js")):
            with self.subTest(js=f.name):
                r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stderr)


# ───────────────────────── 데이터 정합성 ─────────────────────────
class TestProcessedData(unittest.TestCase):
    def test_processed_json_valid(self):
        files = sorted((ROOT / "data" / "processed").glob("*.json"))
        self.assertTrue(files, "data/processed 에 JSON 없음")
        for f in files:
            with self.subTest(json=f.name):
                json.loads(f.read_text("utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
