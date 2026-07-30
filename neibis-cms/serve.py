#!/usr/bin/env python3
"""
NEIBIS 프로토타입 정적 서버.
- neibis-cms/ 를 웹 루트로 서빙 (원본 절대경로 /mariadb/... 그대로 동작)
- .do 요청을 같은 이름의 .html 파일로 매핑 (원본 URL 구조로 클릭 탐색 가능)
  예) /mariadb/neibis/bbs/246/list.do  ->  .../bbs/246/list.html
"""
import functools
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8877"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        fs = super().translate_path(path)
        stripped = fs.rstrip()  # 일부 href 에 끝 공백(list.do ) 이 있음
        if stripped.endswith(".do"):
            html = stripped[:-3] + ".html"
            if os.path.exists(html):
                return html
        return fs


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with Server(("", PORT), handler) as httpd:
        print(f"NEIBIS prototype serving {ROOT} at http://localhost:{PORT}")
        httpd.serve_forever()
