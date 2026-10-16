#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
원격 개발서버(NEIBIS 실제 Java 앱) 기준 테스트 — 읽기 전용·소량·순차.

대상
  사용자  https://dev.neibis.inseq.co.kr:8443/dialect/ko/index.do
  관리자  https://dev.neibis.inseq.co.kr:8443/dialect/neibis/login.do

실행
  python3 -m unittest tests.test_remote_dev -v

관리자 화면까지 보려면(로그인은 사람이 브라우저에서 직접 한다 — 비밀번호를 코드·채팅에 두지 않는다)
  브라우저 개발자도구 > Application > Cookies 의 JSESSIONID 값을 환경변수로 넘긴다.
  DEV_COOKIE='JSESSIONID=xxxxxxxx' python3 -m unittest tests.test_remote_dev -v
  (없으면 관리자 «로그인 필요» 방어 동작만 검증하고 나머지는 skip)

주의
  · 이 서버는 접속 대기열(wait-api/queue)을 거친다 → 쿠키 항아리로 자동 통과.
  · 요청은 순차 + 짧은 간격. 병렬/대량 호출 금지(IP 차단 전례, 2026-10-15).
  · 쓰기(저장·삭제·업로드) 요청은 절대 보내지 않는다.
"""
import http.cookiejar
import os
import re
import ssl
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("DEV_BASE", "https://dev.neibis.inseq.co.kr:8443")
USER = BASE + "/dialect/ko"
ADMIN = BASE + "/dialect/neibis"
DEV_COOKIE = os.environ.get("DEV_COOKIE", "").strip()
PAUSE = float(os.environ.get("DEV_PAUSE", "0.3"))

_ctx = ssl.create_default_context()
_ctx.check_hostname = False  # 개발서버 자체 서명 인증서 대비
_ctx.verify_mode = ssl.CERT_NONE


def _opener(extra_cookie=""):
    """쿠키 항아리 opener. 세션 쿠키는 헤더가 아니라 항아리에 넣어야 대기열 토큰과 함께 전송된다."""
    jar = http.cookiejar.CookieJar()
    host = urllib.parse.urlparse(BASE).hostname
    for part in filter(None, (c.strip() for c in extra_cookie.split(";"))):
        name, _, value = part.partition("=")
        jar.set_cookie(http.cookiejar.Cookie(
            0, name.strip(), value.strip(), None, False, host, True, False,
            "/", False, True, None, True, None, None, {}))
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=_ctx))


def get(op, url, timeout=30):
    """(status, 최종 URL, 본문 str). 리다이렉트(대기열 포함)는 따라간다."""
    time.sleep(PAUSE)
    try:
        with op.open(url, timeout=timeout) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, e.read().decode("utf-8", "replace")


def title(html):
    m = re.search(r"<title>([^<]*)</title>", html)
    return (m.group(1) if m else "").strip()


class TestUserSite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.op = _opener()
        try:
            cls.st, cls.url, cls.html = get(cls.op, USER + "/index.do")
        except Exception as e:
            raise unittest.SkipTest("개발서버 접속 불가: %s" % e)

    def test_index_passes_queue_and_renders(self):
        self.assertEqual(self.st, 200)
        self.assertTrue(self.url.endswith("/dialect/ko/index.do"), self.url)
        self.assertEqual(title(self.html), "지역어 종합 정보")

    def test_gnb_pages_load(self):
        """GNB 의 모든 사용자 메뉴가 200 이고 오류 페이지가 아니어야 한다."""
        links = sorted(set(re.findall(r'href="(/dialect/ko/[^"#?]+\.do)"', self.html)))
        self.assertGreater(len(links), 10)
        for path in links:
            if path.endswith("/login.do") or "/join/" in path or path.endswith("mbr-save.do"):
                continue  # 인증·가입 흐름은 제외
            with self.subTest(path=path):
                st, url, html = get(self.op, BASE + path)
                self.assertEqual(st, 200, url)
                self.assertFalse(title(html).startswith("Error"), "%s → %s" % (path, title(html)))
                self.assertGreater(len(html), 2000)

    def test_unknown_page_not_200(self):
        st, _, _ = get(self.op, USER + "/no-such-page-xyz.do")
        self.assertNotEqual(st, 200)


class TestAdminAuthGuard(unittest.TestCase):
    """쿠키 없이는 관리자 화면 본문이 새지 않아야 한다."""

    @classmethod
    def setUpClass(cls):
        cls.op = _opener()
        try:
            get(cls.op, USER + "/index.do")  # 대기열 토큰만 확보
        except Exception as e:
            raise unittest.SkipTest("개발서버 접속 불가: %s" % e)

    def test_login_page_available(self):
        st, _, html = get(self.op, ADMIN + "/login.do")
        self.assertEqual(st, 200)
        self.assertRegex(html, r'(?i)type="password"')

    def test_protected_pages_deny_anonymous(self):
        for p in ("/index.do", "/system/user.do", "/map/dialect.do", "/survey/vocab.do"):
            with self.subTest(page=p):
                st, _, html = get(self.op, ADMIN + p)
                self.assertTrue(
                    title(html).startswith("Error") or re.search(r'(?i)type="password"', html) or st in (401, 403),
                    "비로그인 요청에 관리자 본문이 노출됨: %s (%s)" % (p, title(html)))


@unittest.skipUnless(DEV_COOKIE, "DEV_COOKIE 미지정 — 관리자 로그인 세션 필요")
class TestAdminAuthenticated(unittest.TestCase):
    PAGES = [  # neibis-cms 의 목록 화면과 1:1 대응(.html → .do)
        "/index.do",
        "/system/user.do",
        "/map/dialect.do", "/map/symbol.do", "/map/wordcard.do", "/map/weather.do",
        "/survey/vocab.do", "/survey/oral.do", "/survey/variant.do", "/survey/surveyList.do",
        "/archive/literature.do", "/archive/data-room.do", "/archive/region-photo.do",
        "/stats/userConnect.do", "/stats/map.do", "/stats/api.do",
        "/bbs/251/list.do", "/bbs/256/list.do",
    ]

    @classmethod
    def setUpClass(cls):
        if not re.fullmatch(r"[\x21-\x7e ;=]+", DEV_COOKIE) or "=" not in DEV_COOKIE:
            raise RuntimeError("DEV_COOKIE 형식 오류: 'JSESSIONID=<실제값>' 이어야 합니다(자리표시자·한글 불가)")
        cls.op = _opener(DEV_COOKIE)
        get(cls.op, USER + "/index.do")  # 대기열 통과

    def test_session_is_valid(self):
        st, _, html = get(self.op, ADMIN + "/index.do")
        self.assertEqual(st, 200)
        self.assertFalse(title(html).startswith("Error"), "세션 만료 — DEV_COOKIE 를 새로 받으세요")

    def test_list_pages_render(self):
        for p in self.PAGES:
            with self.subTest(page=p):
                st, url, html = get(self.op, ADMIN + p)
                # 일부 화면은 서버에 아직 없을 수 있어 404 는 «미구현»으로 구분해 알린다
                if st == 404:
                    self.skipTest("개발서버에 없는 화면: %s" % p)
                self.assertEqual(st, 200, url)
                self.assertFalse(title(html).startswith("Error"), "%s → %s" % (p, title(html)))
                self.assertNotRegex(html, r'(?i)type="password"')


if __name__ == "__main__":
    unittest.main(verbosity=2)
