#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
프론트 + 관리자를 한 프로세스로 띄우는 통합 진입점

왜 하나로 합칠 수 있나
  · 두 앱의 URL 공간이 겹치지 않는다. 관리자 화면·API는 전부 «/mariadb/…»
    아래에만 있고, 프로젝트 루트에는 mariadb 디렉터리가 없다.
  · 그래서 경로만 보고 갈라 주면 **기존 주소를 하나도 바꾸지 않고** 합쳐진다.
  · 8765·8877 둘 다 열어 두므로 어느 쪽 링크를 눌러도 같은 서버가 받는다.
    («정적 서버로 잘못 띄워 업로드가 죽는» 사고가 이 지점에서 났다)

경로 분기
  /mariadb/…   → 관리자 (neibis-cms/serve.py, 문서 루트 neibis-cms/)
  그 밖의 전부  → 프론트 (server.py, 문서 루트 프로젝트 루트)

사용
  python3 dev.py                  # 8765 + 8877 둘 다
  python3 dev.py --port 8877      # 한 포트만
"""
from __future__ import annotations

import argparse
import http.server
import importlib.util
import socketserver
import sys
import threading
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ADMIN_DIR = ROOT / "neibis-cms"
ADMIN_PREFIX = "/mariadb"


def _load(name: str, path: Path):
    """디렉터리명에 «-» 가 있어 일반 import 가 안 되므로 파일 경로로 읽는다."""
    if not path.is_file():
        sys.exit("파일을 찾을 수 없습니다: %s" % path)
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


front = _load("neibis_front", ROOT / "server.py")
admin = _load("neibis_admin", ADMIN_DIR / "serve.py")

FRONT_ROOT = str(getattr(front, "DIRECTORY", ROOT))
ADMIN_ROOT = str(getattr(admin, "ROOT", ADMIN_DIR))


class Router(admin.Handler, front.Handler):
    """
    두 핸들러를 함께 상속한다. MRO 는 Router → 관리자 → 프론트 → SimpleHTTP 라서
    각 클래스 안의 zero-arg super() 가 정상으로 이어진다. 메서드를 남의 클래스에서
    빌려 호출하는 방식은 super() 가 TypeError 를 내므로 쓰지 않는다.

    겹치는 메서드는 do_GET / do_POST / end_headers 셋뿐이고, 그 셋만 여기서 가른다.
    translate_path 는 관리자 것이 쓰이는데(«.do» → «.html» 치환) 프론트 요청에도
    해가 없다 — 문서 루트는 self.directory 로 결정되기 때문이다.
    """

    _to_admin = False           # end_headers 가 dispatch 보다 먼저 불릴 수 있다

    def _route(self):
        if self.path.startswith("/neibis-cms/mariadb"):
            self.path = self.path[len("/neibis-cms"):]
        path = urllib.parse.urlparse(self.path).path
        self._to_admin = path == ADMIN_PREFIX or path.startswith(ADMIN_PREFIX + "/")
        self.directory = ADMIN_ROOT if self._to_admin else FRONT_ROOT
        return self._to_admin

    def do_GET(self):
        return admin.Handler.do_GET(self) if self._route() else front.Handler.do_GET(self)

    def do_POST(self):
        return admin.Handler.do_POST(self) if self._route() else front.Handler.do_POST(self)

    def do_HEAD(self):
        self._route()
        return http.server.SimpleHTTPRequestHandler.do_HEAD(self)

    def end_headers(self):
        if self._to_admin:
            return admin.Handler.end_headers(self)
        return front.Handler.end_headers(self)


class Server(socketserver.ThreadingTCPServer):
    """음성(wav) 스트리밍이 커넥션을 오래 붙잡는다. 단일 스레드면 그동안 전부 막힌다."""
    daemon_threads = True
    allow_reuse_address = True
    # 기본 대기열(5)은 페이지가 이미지·스크립트·영상을 한꺼번에 요청하면 넘쳐 일부가 연결 끊김(RESET)으로 실패한다.
    request_queue_size = 128


def serve(port: int) -> Server:
    httpd = Server(("127.0.0.1", port), Router)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser(description="프론트+관리자 통합 개발 서버")
    ap.add_argument("--port", type=int, action="append",
                    help="열 포트. 여러 번 지정 가능. 기본값 8765·8877")
    args = ap.parse_args()
    ports = args.port or [8765, 8877]

    opened = []
    for p in ports:
        try:
            opened.append((p, serve(p)))
        except OSError as e:
            sys.exit("포트 %d 를 열 수 없습니다: %s\n"
                     "  이미 떠 있는 서버가 있는지 확인하세요: lsof -t -iTCP:%d -sTCP:LISTEN"
                     % (p, e, p))

    first = ports[0]
    print("통합 개발 서버 — 프론트 + 관리자 한 프로세스")
    print("  프론트  %s  →  http://127.0.0.1:%d/dialect_map.html" % (FRONT_ROOT, first))
    print("  관리자  %s  →  http://127.0.0.1:%d/mariadb/neibis/survey/variant.html"
          % (ADMIN_ROOT, first))
    print("  열린 포트: %s (어느 쪽이든 같은 서버가 받습니다)"
          % ", ".join(str(p) for p in ports))
    print("  종료: Ctrl+C")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\n종료합니다.")
        for _, httpd in opened:
            httpd.shutdown()


if __name__ == "__main__":
    main()
