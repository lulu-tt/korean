# -*- coding: utf-8 -*-
"""Vercel 서버리스 API — Turso(클라우드 SQLite)를 읽어 기상도 자료를 내려준다.

왜 서버에서 계산하는가
  판정(점수·상태·세대·성별)을 화면 JS 에 다시 구현하면 로컬 서버(server.py)와
  갈라져 숫자가 어긋난다. 조립은 scripts/etl_awareness_region.py 의
  build_output() 한 곳에서만 한다 — 이 파일은 Turso 에서 레코드를 읽어 그 함수에
  넘길 뿐이다.

토큰
  TURSO_AUTH_TOKEN 환경변수로 받는다. 저장소나 화면 JS 에 넣지 않는다.
  화면 JS 에 두면 페이지를 연 사람 누구나 개발자 도구로 볼 수 있다.

쓰기
  이 배포에는 인증이 없다. 누구나 URL 만 알면 부를 수 있으므로 읽기만 연다.
  저장·삭제·업로드는 로컬 관리자(serve.py)에서 한다.
"""
from http.server import BaseHTTPRequestHandler
import importlib.util
import json
import os
import urllib.parse
import urllib.request

TURSO_URL = os.environ.get(
    "TURSO_DATABASE_URL",
    "https://korean-weather-lulu-tt.aws-ap-northeast-1.turso.io/v2/pipeline")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ETL = None


def etl():
    """ETL 모듈 로드 — build_output() 이 판정의 유일한 출처다."""
    global _ETL
    if _ETL is None:
        path = os.path.join(_ROOT, "scripts", "etl_awareness_region.py")
        spec = importlib.util.spec_from_file_location("etl_awareness_region", path)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)          # openpyxl 은 엑셀 경로에서만 쓰므로 지연 임포트다
        _ETL = m
    return _ETL


def turso(sqls):
    """SELECT 여러 개를 한 번에. 각 결과의 rows 목록을 돌려준다."""
    if not TURSO_TOKEN:
        raise RuntimeError("TURSO_AUTH_TOKEN 환경변수가 없습니다 (Vercel 프로젝트 설정에 추가)")
    body = {"requests": [{"type": "execute", "stmt": {"sql": s}} for s in sqls]
                        + [{"type": "close"}]}
    req = urllib.request.Request(
        TURSO_URL, data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + TURSO_TOKEN,
                 "Content-Type": "application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=30))
    out = []
    for i, r in enumerate(res.get("results", [])[:len(sqls)]):
        if r.get("type") == "error" or "error" in r:
            raise RuntimeError("SQL %d: %s" % (i + 1, r.get("error", {}).get("message", "?")))
        out.append(r["response"]["result"]["rows"])
    return out


def cell(c):
    """Turso 셀 → 파이썬 값. NULL 은 value 키 자체가 없다."""
    return c.get("value")


def load_records():
    """Turso → build_output() 이 받는 레코드. server.py 의 load_records_from_db 와 같은 모양."""
    files, rows = turso([
        "SELECT weather_file_id, file_nm, region_cd, research_degree, generation, sex,"
        " row_cnt, item_cnt, src_layout, reg_dt, region_nm"
        " FROM wb_weather_file WHERE use_yn='Y' ORDER BY region_cd, generation, sex",
        "SELECT r.response_id, f.region_cd, f.research_degree, f.generation, f.sex,"
        " r.item_base, r.headword, r.dialect_form, r.grade, r.upt_dt"
        " FROM wb_weather_response r JOIN wb_weather_file f USING(weather_file_id)"
        " WHERE r.item_base IS NOT NULL AND r.use_yn='Y' AND f.use_yn='Y'",
    ])
    E = etl()
    recs = []
    for x in rows:
        pres = (cell(x[6]) or "").strip()
        base = (cell(x[7]) or "").strip()
        recs.append({
            "rg": cell(x[1]), "year": cell(x[2]), "age": int(cell(x[3]) or 0),
            "sx": cell(x[4]), "it": cell(x[5]), "pres": pres, "base": base,
            "form": base if base and base != "*" else pres,
            "g": E.grade_of(cell(x[8])),
            "rid": cell(x[0]), "upt": cell(x[9]),
        })
    return files, recs


def build():
    files, recs = load_records()
    E = etl()
    out = E.build_output(recs, len(files))
    q = out["meta"]["qc"]
    q["files"] = len(files)
    q["rowsTotal"] = len(recs)
    q["gradeFilled"] = sum(1 for r in recs if r["g"])
    out["meta"]["source"] = "Turso (wb_weather_*)"
    out["meta"]["origin"] = "turso"
    return out, files, recs


def file_list():
    files, recs = load_records()
    edited = {}
    for r in recs:
        if r.get("upt"):
            edited[r["rg"]] = edited.get(r["rg"], 0)
    lst = []
    for x in files:
        lst.append({
            "weather_file_id": cell(x[0]), "file_nm": cell(x[1]),
            "region_cd": cell(x[2]), "region_nm": cell(x[10]) or cell(x[2]),
            "research_year": 2000 + int(cell(x[3]) or 0),
            "generation": cell(x[4]), "sex": cell(x[5]),
            "row_cnt": cell(x[6]), "item_cnt": cell(x[7]),
            "src_layout": cell(x[8]), "use_yn": "Y", "reg_dt": cell(x[9]),
            "sexNm": "여" if cell(x[5]) == "F" else "남",
            "genNm": "%s대" % cell(x[4]),
            "editedCnt": 0,
        })
    return {"ok": True, "total": len(lst), "list": lst,
            "responseCnt": len(recs), "gradeBadCnt": 0}


def responses(item):
    order = {c: i for i, c in enumerate(
        ["GG", "GW", "CB", "CN", "JB", "JN", "GB", "GN", "JJ"])}
    rows = turso([
        "SELECT r.response_id, r.line_no, r.serial_no, r.item_cd, r.headword,"
        " r.dialect_form, r.grade, r.grade_valid_yn, r.upt_dt,"
        " f.file_nm, f.region_cd, f.region_nm, f.research_degree, f.generation, f.sex"
        " FROM wb_weather_response r JOIN wb_weather_file f USING(weather_file_id)"
        " WHERE r.item_base='%s' AND r.use_yn='Y' AND f.use_yn='Y'" % item.replace("'", "")
    ])[0]
    out = []
    for x in rows:
        form = (cell(x[5]) or "").strip()
        pres = (cell(x[4]) or "").strip()
        out.append({
            "rid": cell(x[0]), "lineNo": cell(x[1]), "serialNo": cell(x[2]) or "",
            "itemCd": cell(x[3]) or "", "headword": pres, "form": form,
            "shown": form if form and form != "*" else pres,
            "grade": (cell(x[6]) or "") if cell(x[7]) == "Y" else "",
            "gradeRaw": cell(x[6]) or "", "edited": bool(cell(x[8])),
            "file": cell(x[9]), "region": cell(x[10]),
            "regionNm": cell(x[11]) or cell(x[10]),
            "year": cell(x[12]) or "", "age": cell(x[13]), "sex": cell(x[14]),
        })
    out.sort(key=lambda r: (order.get(r["region"], 99), r["age"] or 0,
                            r["sex"] or "", r["file"], r["lineNo"] or 0))
    return {"ok": True, "item": item, "total": len(out), "rows": out}


READONLY = {"ok": False, "message":
            "이 배포는 읽기 전용입니다. 자료 수정·업로드는 관리자 서버에서 해 주세요."}


class handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=60")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path
        qs = urllib.parse.parse_qs(u.query)
        try:
            if p.endswith("/weather/awareness"):
                out, _, _ = build()
                return self._json(out)
            if p.endswith("/weather/files"):
                return self._json(file_list())
            if p.endswith("/weather/responses"):
                item = (qs.get("item") or [""])[0]
                if not item:
                    return self._json({"ok": False, "message": "항목코드가 필요합니다."}, 400)
                return self._json(responses(item))
        except Exception as e:
            return self._json({"ok": False, "message": str(e)}, 500)
        self._json({"ok": False, "message": "알 수 없는 경로: " + p}, 404)

    def do_POST(self):
        # 인증이 없는 배포라 쓰기를 열지 않는다.
        self._json(READONLY, 405)
