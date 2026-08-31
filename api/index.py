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

def _pipeline_url(u):
    """Turso 주소를 HTTP 파이프라인 주소로 맞춘다.

    대시보드가 알려주는 주소는 libsql://<host> 인데 urllib 은 그 스킴을 모른다.
    끝의 /v2/pipeline 도 붙었다 안 붙었다 하므로 여기서 한 번에 정리한다.
    """
    u = (u or "").strip().rstrip("/")
    if u.startswith("libsql://"):
        u = "https://" + u[len("libsql://"):]
    elif not u.startswith(("http://", "https://")):
        u = "https://" + u
    if not u.endswith("/v2/pipeline"):
        u += "/v2/pipeline"
    return u


TURSO_URL = _pipeline_url(os.environ.get(
    "TURSO_DATABASE_URL",
    "https://korean-weather-lulu-tt.aws-ap-northeast-1.turso.io/v2/pipeline"))
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
    """Turso 셀 → 파이썬 값.

    NULL 은 value 키 자체가 없다. 정수·실수도 JSON 에는 문자열로 실려 오므로
    type 을 보고 되돌린다 — 그냥 두면 rid 가 '22420' 처럼 문자열이 되어
    로컬(server.py)이 내려주는 값과 달라진다.
    """
    if "value" not in c:
        return None
    v = c["value"]
    t = c.get("type")
    if t == "integer":
        try:
            return int(v)
        except (TypeError, ValueError):
            return v
    if t == "float":
        try:
            return float(v)
        except (TypeError, ValueError):
            return v
    return v


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
    # 로컬은 fill_db_qc(sqlite) 가 채우는 자리다. 여기서 같은 값을 Turso 로 채운다.
    # meta.years 는 관리자 검색의 연차 선택지를 만드는 근거라 비면 그 칸이 빈다.
    bad, lay, cdt, yrs = turso([
        "SELECT COUNT(*) FROM wb_weather_response"
        " WHERE grade IS NOT NULL AND grade<>'*' AND grade_valid_yn='N'",
        "SELECT COUNT(DISTINCT src_layout) FROM wb_weather_file WHERE use_yn='Y'",
        "SELECT MAX(reg_dt) FROM wb_weather_file",
        "SELECT research_degree, MAX(research_year), COUNT(*) FROM wb_weather_file"
        " WHERE use_yn='Y' GROUP BY research_degree ORDER BY research_degree",
    ])
    q["gradeBad"] = cell(bad[0][0])
    q["layouts"] = cell(lay[0][0])
    q["calcDt"] = cell(cdt[0][0])
    q.pop("layoutOdd", None)
    out["meta"]["year"] = ""
    out["meta"]["years"] = [{"degree": cell(r[0]), "year": cell(r[1]), "files": cell(r[2])}
                            for r in yrs]
    out["meta"]["source"] = "Turso (wb_weather_*)"
    out["meta"]["origin"] = "turso"
    return out, files, recs


def file_list():
    """적재 현황 — serve.py 의 api_weather_files 와 같은 질의를 그대로 쓴다.

    30,043행을 다 끌어오지 않고 개수는 DB 에서 센다. editedCnt·gradeBadCnt 는
    화면이 재업로드 경고와 자료 오류를 띄우는 근거라 비워 두면 안 된다.
    """
    rows, edited, resp, bad = turso([
        "SELECT weather_file_id, file_nm, region_cd, region_nm, research_year,"
        " generation, sex, row_cnt, item_cnt, src_layout, use_yn, reg_dt"
        " FROM wb_weather_file ORDER BY region_cd, generation, sex",
        "SELECT weather_file_id, COUNT(*) FROM wb_weather_response"
        " WHERE upt_dt IS NOT NULL GROUP BY weather_file_id",
        "SELECT COUNT(*) FROM wb_weather_response",
        "SELECT COUNT(*) FROM wb_weather_response"
        " WHERE grade IS NOT NULL AND grade<>'*' AND grade_valid_yn='N'",
    ])
    ed = {cell(r[0]): cell(r[1]) for r in edited}
    cols = ["weather_file_id", "file_nm", "region_cd", "region_nm", "research_year",
            "generation", "sex", "row_cnt", "item_cnt", "src_layout", "use_yn", "reg_dt"]
    lst = []
    for r in rows:
        x = {c: cell(r[i]) for i, c in enumerate(cols)}
        x["sexNm"] = "여" if x["sex"] == "F" else "남"
        x["genNm"] = "%s대" % x["generation"]
        x["editedCnt"] = ed.get(x["weather_file_id"], 0)
        lst.append(x)
    return {"ok": True, "total": len(lst), "list": lst,
            "responseCnt": cell(resp[0][0]), "gradeBadCnt": cell(bad[0][0])}


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



# ── 단어 카드(wb_wordcard) — 관리자 목록 화면이 읽는 두 API의 읽기 전용 판 ─────
#   serve.py 의 api_wordcard_list / api_wordcard_meta 와 응답 모양을 맞춘다.
#   맞추지 않으면 화면이 필드를 못 찾아 빈 표가 된다.
WC_GROUPS = ["20M", "20F", "50M", "50F", "70M", "70F"]
WC_CODING_DEFAULT = [
    {"k": "std", "label": "표준어를 씀", "color": "#185FA5"},
    {"k": "dia", "label": "지역어를 씀", "color": "#BA7517"},
    {"k": "mix", "label": "둘 다 씀", "color": "#5F5E5A"},
    {"k": "none", "label": "모름·안 씀", "color": "#C0BDB6"},
]


def _sq(v):
    """SQL 문자열 리터럴. Turso 파이프라인에 값을 따로 못 실어 직접 만든다."""
    return "'" + str(v).replace("'", "''") + "'"


def wordcard_list(qs):
    def q1(k, d=""):
        return (qs.get(k) or [d])[0] or d

    kw = str(q1("searchValue")).strip()
    expose = str(q1("searchExpose")).strip()
    try:
        page = max(1, int(q1("page", "1")))
    except Exception:
        page = 1
    try:
        page_size = int(q1("pageSize", "10"))
    except Exception:
        page_size = 10
    page_size = min(max(page_size, 1), 500)

    where = []
    if kw:
        like = _sq("%" + kw + "%")
        where.append("(item_cd LIKE %s OR word LIKE %s OR hook LIKE %s)" % (like, like, like))
    if expose == "Y":
        where.append("has_ct = 1")
    elif expose == "N":
        where.append("has_ct = 0")
    cond = (" WHERE " + " AND ".join(where)) if where else ""

    cnt, exp, rows = turso([
        "SELECT COUNT(*) FROM wb_wordcard" + cond,
        "SELECT COUNT(*) FROM wb_wordcard" + cond + (" AND" if cond else " WHERE") + " has_ct = 1",
        "SELECT item_cd, word, hook, has_ct FROM wb_wordcard" + cond
        + " ORDER BY sort_no, item_cd",
    ])
    total = int(cell(cnt[0][0]) or 0)
    exposed = int(cell(exp[0][0]) or 0)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    page_rows = rows[(page - 1) * page_size: page * page_size]

    ids = [cell(r[0]) for r in page_rows]
    ct = {}
    if ids:
        cts, = turso([
            "SELECT item_cd, cnt_std, cnt_dia, cnt_mix, cnt_non FROM wb_wordcard_ct"
            " WHERE item_cd IN (" + ",".join(_sq(i) for i in ids) + ")"])
        for r in cts:
            n = sum(int(cell(r[i]) or 0) for i in range(1, 5))
            ct[cell(r[0])] = ct.get(cell(r[0]), 0) + n

    lst = [{
        "id": cell(r[0]),
        "word": cell(r[1]) or "",
        "hook": cell(r[2]) or "",
        "hasCT": bool(int(cell(r[3]) or 0)),
        "ctTotal": ct.get(cell(r[0]), 0),
    } for r in page_rows]

    return {"ok": True, "total": total, "exposed": exposed, "hidden": total - exposed,
            "page": page, "pageSize": page_size, "totalPages": total_pages, "list": lst}


def _wc_cfg(rows):
    """wb_wordcard_meta → {key: 값}. 값은 JSON 문자열로 들어 있다."""
    out = {}
    for r in rows:
        try:
            out[cell(r[0])] = json.loads(cell(r[1]) or "null")
        except Exception:
            pass
    return out


def wordcard_meta():
    n, cfg = turso(["SELECT COUNT(*) FROM wb_wordcard",
                    "SELECT cfg_key, cfg_val FROM wb_wordcard_meta"])
    c = _wc_cfg(cfg)
    return {"ok": True,
            "coding": c.get("coding") or WC_CODING_DEFAULT,
            "groups": WC_GROUPS,
            "meta": c.get("meta") or {},
            "total": cell(n[0][0])}


def wordcard_detail(qs):
    """수정 화면이 읽는 한 장. serve.py 의 api_wordcard_detail 과 같은 모양이다."""
    wid = (qs.get("id") or [""])[0].strip()
    if not wid:
        return {"ok": False, "message": "항목 ID가 없습니다."}
    rows, cts, cfg = turso([
        "SELECT item_cd, word, hook, story, reg_dt, upt_dt FROM wb_wordcard"
        " WHERE item_cd = " + _sq(wid),
        "SELECT grp, cnt_std, cnt_dia, cnt_mix, cnt_non FROM wb_wordcard_ct"
        " WHERE item_cd = " + _sq(wid),
        "SELECT cfg_key, cfg_val FROM wb_wordcard_meta",
    ])
    if not rows:
        return {"ok": False, "message": "항목을 찾을 수 없습니다: " + wid}
    r = rows[0]
    ct = {cell(x[0]): [cell(x[i]) for i in range(1, 5)] for x in cts}
    ordered = {g: ct[g] for g in WC_GROUPS if g in ct}   # 화면 표 순서를 고정한다
    item = {"id": cell(r[0]), "word": cell(r[1]), "hook": cell(r[2]) or "",
            "story": cell(r[3]) or ""}
    if ordered:
        item["ct"] = ordered
    item["hasCT"] = bool(ordered)
    item["regDt"] = cell(r[4]) or ""
    item["uptDt"] = cell(r[5]) or ""
    return {"ok": True, "item": item,
            "coding": _wc_cfg(cfg).get("coding") or WC_CODING_DEFAULT}


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
        qs = urllib.parse.parse_qs(u.query)
        # Vercel rewrite 는 목적지 경로로 갈아치우므로 self.path 에 원래 경로가 없다.
        # vercel.json 이 넘겨주는 action 을 먼저 보고, 없으면 경로 끝으로 판단한다
        # (로컬에서 이 파일을 직접 띄워 볼 때를 위한 길).
        act = (qs.get("action") or [""])[0]
        if not act:
            seg = [x for x in u.path.split("/") if x]
            if len(seg) >= 2:
                act = seg[-2] + "-" + seg[-1]
        try:
            if act in ("weather-awareness", "awareness"):
                out, _, _ = build()
                return self._json(out)
            if act in ("weather-files", "files"):
                return self._json(file_list())
            if act in ("weather-responses", "responses"):
                item = (qs.get("item") or [""])[0]
                if not item:
                    return self._json({"ok": False, "message": "항목코드가 필요합니다."}, 400)
                return self._json(responses(item))
            if act in ("wordcard-list", "list"):
                return self._json(wordcard_list(qs))
            if act in ("wordcard-meta", "meta"):
                return self._json(wordcard_meta())
            if act in ("wordcard-detail", "detail"):
                return self._json(wordcard_detail(qs))
        except Exception as e:
            return self._json({"ok": False, "message": str(e)}, 500)
        self._json({"ok": False, "message": "알 수 없는 경로: " + self.path}, 404)

    def do_POST(self):
        # 인증이 없는 배포라 쓰기를 열지 않는다.
        self._json(READONLY, 405)
