import http.server
import socketserver
import sqlite3
import json
import os
import re
import time
import uuid
import urllib.parse
import urllib.request
import ssl
import zlib
from datetime import datetime
import oral_api
import vocab_api

PORT = 8765
DIRECTORY = "/Users/aaa/inseq/korean"
DB_PATH = "/Users/aaa/inseq/korean/dialect_local.db"
IMAGE_DIR = os.path.join(DIRECTORY, "image")

# 보유 중인 지역어 사진. DB에는 4천여 건이 등록돼 있으나 원본 파일은 일부만 반입된
# 상태여서, 누락된 건은 아래 목록에서 하나를 골라 대체한다.
_REAL_PHOTOS = sorted(
    f for f in os.listdir(IMAGE_DIR)
    if re.fullmatch(r"(19|20)\d{7}(-\d+)?\.jpg", f)
) if os.path.isdir(IMAGE_DIR) else []


# 운영(dialect.inseq.co.kr)의 분류별 대표 사진. 운영 페이지에서 추출한 지정값이며,
# DB의 어떤 컬럼으로도 재현되지 않아 매핑으로 보관한다.
SUBJECT_THUMB = {
    "구덕과 차롱": "200801003",
    "그물 손질부터 어판장까지": "201002001",
    "김치": "200706001-1",
    "나주소반장": "200810001",
    "남사당놀이": "200808001",
    "남원목기": "200903001",
    "대고장": "200704301",
    "도검": "200908056",
    "돌살": "201104001",
    "두석장": "200805003",
    "떡": "200911640-1",
    "모필장": "200804003",
    "미역업": "200704101",
    "민속음식": "200701201",
    "배첩장": "200906001",
    "부채장": "200710219",
    "북 메우기": "200909001",
    "비양도의 고기잡이": "201001001",
    "사기장": "200708201",
    "사찰생활어(승려어)": "200807003",
    "숭어들이": "201204001-1",
    "승무": "200809101-1",
    "심마니": "200707188",
    "악기장": "200710459",
    "안동포길쌈": "200802006",
    "어부": "200701102-1",
    "어촌 생활어 기초 어휘": "201005233",
    "염전": "201003012",
    "오징어 잡이에서 덕장까지": "201202004-1",
    "옹기장": "200708088",
    "유기장": "200704535",
    "자염": "201103001-1",
    "장 담그기": "200904041-1",
    "장아찌": "200706101-1",
    "젓갈": "200706243",
    "죽렴장": "200710101-1",
    "죽방렴": "201004028",
    "참빗장": "200710094",
    "채낚기": "201204107",
    "채상장": "200710400-1",
    "초고장": "200809005",
    "추자도 고기잡이": "201201001-1",
    "토속음식": "200902003-1",
    "한과": "200910007",
    "해녀": "200701001",
    "호상옷": "200901003",
}


def photo_img(sys_file_name, file_ext, seed=0):
    """DB에 등록된 사진 경로를 반환하고, 파일이 없으면 보유 사진으로 대체한다."""
    if sys_file_name:
        name = f"{sys_file_name}.{file_ext}"
        if os.path.isfile(os.path.join(IMAGE_DIR, name)):
            return f"./image/{name}"
    if not _REAL_PHOTOS:
        return "./image/200911310.jpg"
    # 같은 자료는 항상 같은 사진이 나오도록 안정적인 인덱스를 만든다.
    # (hash()는 실행마다 값이 바뀌므로 crc32를 쓴다.)
    idx = zlib.crc32(str(seed).encode("utf-8")) % len(_REAL_PHOTOS)
    return f"./image/{_REAL_PHOTOS[idx]}"


def _epoch_ms_to_date(ms) -> str:
    s = str(ms or "").strip()
    if not s:
        return ""
    try:
        return datetime.fromtimestamp(int(s) / 1000).strftime("%Y-%m-%d")
    except (ValueError, OverflowError, OSError):
        return ""


def _db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _next_id(con, table, col) -> int:
    row = con.execute(f"SELECT MAX(CAST({col} AS INTEGER)) FROM {table}").fetchone()
    return (row[0] or 0) + 1


def api_survey_active():
    """메인 노출용 — 현재 진행 중인 설문 1건(가장 최근 등록)."""
    now_ms = int(time.time() * 1000)
    with _db_connect() as con:
        row = con.execute(
            """SELECT * FROM tb_survey_new
               WHERE CAST(start_date AS INTEGER) <= ?
                 AND CAST(end_date AS INTEGER) >= ?
               ORDER BY CAST(survey_no AS INTEGER) DESC
               LIMIT 1""",
            (now_ms, now_ms),
        ).fetchone()
        if not row:
            return {"status": "success", "data": None}
        sid = str(row["survey_no"])
        questions = []
        for q in con.execute(
            """SELECT question_no, question_title, question_order
               FROM tb_survey_question_new WHERE survey_no=?
               ORDER BY CAST(question_order AS INTEGER), CAST(question_no AS INTEGER)""",
            (sid,),
        ).fetchall():
            examples = [
                {"exampleNo": str(e["example_no"]), "exampleTitle": e["example_title"] or ""}
                for e in con.execute(
                    """SELECT example_no, example_title FROM tb_survey_example_new
                       WHERE question_no=? ORDER BY CAST(example_no AS INTEGER)""",
                    (q["question_no"],),
                ).fetchall()
            ]
            questions.append({
                "questionNo": str(q["question_no"]),
                "questionTitle": q["question_title"] or "",
                "examples": examples,
            })
        return {"status": "success", "data": {
            "surveyNo": sid,
            "surveyTitle": row["survey_title"] or "",
            "surveyCntnts": row["survey_cntnts"] or "",
            "startDate": _epoch_ms_to_date(row["start_date"]),
            "endDate": _epoch_ms_to_date(row["end_date"]),
            "prsnlInputYn": (row["prsnl_input_yn"] or "N").upper(),
            "prsnlInfoCntnts": row["prsnl_info_cntnts"] or "",
            "questionCnt": len(questions),
            "questions": questions,
        }}


def api_survey_answer_save(body: dict):
    """메인 설문 팝업 제출 — tb_survey_answer_new (+ 개인정보)."""
    sid = str(body.get("surveyNo") or "").strip()
    answers = body.get("answers") or []
    if not sid:
        return {"status": "error", "message": "survey_no 가 필요합니다."}
    if not isinstance(answers, list) or not answers:
        return {"status": "error", "message": "응답이 없습니다."}

    now_ms = int(time.time() * 1000)
    with _db_connect() as con:
        srv = con.execute(
            "SELECT * FROM tb_survey_new WHERE survey_no=? LIMIT 1", (sid,)
        ).fetchone()
        if not srv:
            return {"status": "error", "message": "설문을 찾을 수 없습니다."}
        try:
            start_ms = int(str(srv["start_date"] or "0"))
            end_ms = int(str(srv["end_date"] or "0"))
        except ValueError:
            start_ms, end_ms = 0, 0
        if now_ms < start_ms or now_ms > end_ms:
            return {"status": "error", "message": "진행 중인 설문이 아닙니다."}

        qrows = con.execute(
            """SELECT question_no FROM tb_survey_question_new WHERE survey_no=?
               ORDER BY CAST(question_order AS INTEGER), CAST(question_no AS INTEGER)""",
            (sid,),
        ).fetchall()
        qnos = [str(q["question_no"]) for q in qrows]
        if not qnos:
            return {"status": "error", "message": "등록된 문항이 없습니다."}

        picked = {}
        for a in answers:
            qno = str(a.get("questionNo") or "").strip()
            eno = str(a.get("exampleNo") or "").strip()
            if qno and eno:
                picked[qno] = eno
        missing = [qno for qno in qnos if qno not in picked]
        if missing:
            return {"status": "error", "message": "답변을 선택해주세요."}

        for qno, eno in picked.items():
            if qno not in qnos:
                return {"status": "error", "message": "잘못된 문항입니다."}
            ok = con.execute(
                "SELECT 1 FROM tb_survey_example_new WHERE example_no=? AND question_no=? LIMIT 1",
                (eno, qno),
            ).fetchone()
            if not ok:
                return {"status": "error", "message": "잘못된 보기입니다."}

        serial = str(uuid.uuid4())
        answer_dt = str(now_ms)
        next_no = _next_id(con, "tb_survey_answer_new", "answer_no")
        for qno in qnos:
            con.execute(
                """INSERT INTO tb_survey_answer_new
                   (answer_no, question_no, answer_serial, example_no, answer_dt)
                   VALUES (?,?,?,?,?)""",
                (str(next_no), qno, serial, picked[qno], answer_dt),
            )
            next_no += 1

        if (srv["prsnl_input_yn"] or "N").upper() == "Y":
            agree = "Y" if str(body.get("personalInfoAgree") or "N").upper() == "Y" else "N"
            phone = (body.get("personalContAgree") or "").strip() if agree == "Y" else ""
            if len(phone) > 40:
                phone = phone[:40]
            con.execute(
                """INSERT INTO tb_survey_answer_personal_info
                   (answer_serial, prsnl_consent_yn, prsnl_info_answer, answer_dt)
                   VALUES (?,?,?,?)""",
                (serial, agree, phone, answer_dt),
            )
        con.commit()
    return {"status": "success", "json": "SUCCESS", "message": "참여해 주셔서 감사합니다."}


def _ensure_api_purpose_col(con) -> None:
    cols = {str(r[1]) for r in con.execute("PRAGMA table_info(pt_user)").fetchall()}
    if "api_purpose" not in cols:
        con.execute("ALTER TABLE pt_user ADD COLUMN api_purpose TEXT")
        con.commit()


def _next_user_id(con) -> int:
    row = con.execute("SELECT MAX(CAST(user_id AS INTEGER)) FROM pt_user").fetchone()
    return (row[0] or 0) + 1


def _openapi_user_payload(row) -> dict:
    return {
        "usid": row["usid"] or "",
        "username": row["username"] or "",
        "apiKey": row["api_key"] or "",
        "apiUrl": row["api_url"] or "",
        "apiPurpose": row["api_purpose"] or "",
        "apiDt": int(row["api_dt"]) if str(row["api_dt"] or "").isdigit() else 0,
    }


def api_openapi_mine(qs: dict) -> dict:
    usid = ((qs.get("usid") or [""])[0] or "").strip()
    if not usid:
        return {"status": "success", "data": None}
    with _db_connect() as con:
        _ensure_api_purpose_col(con)
        row = con.execute(
            "SELECT usid, username, api_key, api_url, api_purpose, api_dt FROM pt_user WHERE usid=? LIMIT 1",
            (usid,),
        ).fetchone()
        if not row or not (row["api_key"] or "").strip():
            return {"status": "success", "data": None}
        return {"status": "success", "data": _openapi_user_payload(row)}


def api_openapi_issue(body: dict) -> dict:
    """인증키 발급 — pt_user.api_key / api_url / api_purpose / api_dt."""
    usid = str(body.get("usid") or body.get("userId") or "").strip()
    if not usid:
        usid = "hanguk_user"
    if len(usid) > 50 or not re.fullmatch(r"[A-Za-z0-9_.\-]+", usid):
        return {"status": "error", "message": "아이디 형식이 올바르지 않습니다."}
    url = str(body.get("apiUrl") or "").strip()
    purpose = str(body.get("apiPurpose") or "").strip()
    if not url:
        return {"status": "error", "message": "사용 URL을 입력해 주세요."}
    if not purpose:
        return {"status": "error", "message": "사용목적을 입력해 주세요."}
    if len(url) > 500:
        url = url[:500]
    if len(purpose) > 500:
        purpose = purpose[:500]
    now_ms = str(int(time.time() * 1000))
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    key = "".join(chars[b % len(chars)] for b in os.urandom(30))

    with _db_connect() as con:
        _ensure_api_purpose_col(con)
        row = con.execute("SELECT * FROM pt_user WHERE usid=? LIMIT 1", (usid,)).fetchone()
        if row and (row["api_key"] or "").strip():
            # 이미 발급됨 — 목적/URL만 비어 있으면 보강, 키는 유지
            need_url = not (row["api_url"] or "").strip()
            need_purpose = not (row["api_purpose"] or "").strip()
            if need_url or need_purpose:
                con.execute(
                    "UPDATE pt_user SET api_url=?, api_purpose=? WHERE usid=?",
                    (url if need_url else row["api_url"],
                     purpose if need_purpose else row["api_purpose"],
                     usid),
                )
                con.commit()
                row = con.execute(
                    "SELECT usid, username, api_key, api_url, api_purpose, api_dt FROM pt_user WHERE usid=?",
                    (usid,),
                ).fetchone()
            return {
                "status": "success",
                "already": True,
                "message": "이미 발급된 인증키가 있습니다.",
                "data": _openapi_user_payload(row),
            }
        if row:
            con.execute(
                """UPDATE pt_user
                   SET api_key=?, api_url=?, api_purpose=?, api_dt=?, update_dt=?
                   WHERE usid=?""",
                (key, url, purpose, now_ms, now_ms, usid),
            )
        else:
            uid = _next_user_id(con)
            con.execute(
                """INSERT INTO pt_user
                   (user_id, usergroup_id, usid, username, auth, fail_count,
                    api_key, api_url, api_purpose, api_dt, write_dt, update_dt, writer)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (str(uid), "3", usid, usid, "9", "0",
                 key, url, purpose, now_ms, now_ms, now_ms, usid),
            )
        con.commit()
        saved = con.execute(
            "SELECT usid, username, api_key, api_url, api_purpose, api_dt FROM pt_user WHERE usid=?",
            (usid,),
        ).fetchone()
    return {
        "status": "success",
        "already": False,
        "message": "API 인증 키가 발급되었습니다.",
        "data": _openapi_user_payload(saved),
    }


# ────────────────────────────────────────────────────────────────────────────
# 기상도 — 전용 테이블(wb_weather_*)에서 화면 구조를 만들어 준다
#
# 구조 조립과 상태 판정은 scripts/etl_awareness_region.py 의 build_output() 한 곳에서만
# 한다 — 두 곳으로 갈라지면 지도 색이 달라진다.
#
# 이 API 가 유일한 자료 경로다. 예전에는 실패하면 정적 JSON 으로 되돌아갔는데,
# 그러면 자료를 새로 올려도 낡은 지도가 말없이 계속 보였다. 지금은 실패를 드러낸다.
# ────────────────────────────────────────────────────────────────────────────
WEATHER_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'gisangdo.db')


def _load_etl():
    """ETL 모듈 로드. 구조 조립·판정·DB 로더가 모두 거기 한 곳에 있다."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'scripts', 'etl_awareness_region.py')
    spec = importlib.util.spec_from_file_location('etl_awareness_region', path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


_WEATHER_CACHE = {'sig': None, 'data': None}


def api_weather_awareness(year=None):
    """기상도 화면 자료 — 전용 테이블 기준. 적재 상태가 그대로면 캐시를 쓴다."""
    import re as _re
    import sqlite3

    year = _re.sub(r'\D', '', str(year or ''))[-2:]
    sig = None
    if os.path.exists(WEATHER_DB_PATH):
        con = sqlite3.connect(WEATHER_DB_PATH)
        try:
            n = con.execute('SELECT COUNT(*) FROM wb_weather_response').fetchone()[0]
            d = con.execute('SELECT MAX(reg_dt) FROM wb_weather_file').fetchone()[0]
            sig = (n, d, os.path.getmtime(WEATHER_DB_PATH), year)
        finally:
            con.close()
    if sig and _WEATHER_CACHE['sig'] == sig and _WEATHER_CACHE['data'] is not None:
        return _WEATHER_CACHE['data']

    etl = _load_etl()
    recs, nfiles = etl.load_records_from_db(WEATHER_DB_PATH, year)
    out = etl.build_output(recs, nfiles)
    etl.fill_db_qc(out, WEATHER_DB_PATH, year)
    _WEATHER_CACHE['sig'] = sig
    _WEATHER_CACHE['data'] = out
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 개발 서버: Cache-Control이 없으면 브라우저가 휴리스틱 캐싱으로 옛 JSON을
        # 재검증 없이 재사용한다(export를 다시 만들어도 화면에 반영되지 않음).
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # Notice List API
        if parsed_url.path == '/api/notices':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT post_id, board_id, post_title, view_count, fix_yn, create_dt
                    FROM tb_board_post 
                    WHERE board_id = 'notice' AND use_yn = 'Y'
                    ORDER BY fix_yn DESC, CAST(create_dt AS INTEGER) DESC
                """)
                rows = cursor.fetchall()
                
                notices = []
                for row in rows:
                    notices.append({
                        "post_id": row["post_id"],
                        "title": row["post_title"],
                        "view_count": row["view_count"],
                        "fix_yn": row["fix_yn"],
                        "create_dt": row["create_dt"]
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "data": notices}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Notice Detail API
        elif parsed_url.path == '/api/notice_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            post_id = query_params.get('id', [None])[0]
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                if not post_id:
                    cursor.execute("""
                        SELECT post_id, board_id, post_title, post_content, view_count, fix_yn, create_dt
                        FROM tb_board_post 
                        WHERE board_id = 'notice' AND use_yn = 'Y'
                        ORDER BY CAST(create_dt AS INTEGER) DESC LIMIT 1
                    """)
                else:
                    cursor.execute("""
                        SELECT post_id, board_id, post_title, post_content, view_count, fix_yn, create_dt
                        FROM tb_board_post 
                        WHERE post_id = ? AND board_id = 'notice'
                    """, (post_id,))
                
                row = cursor.fetchone()
                if row:
                    new_views = int(row["view_count"] or 0) + 1
                    cursor.execute("UPDATE tb_board_post SET view_count = ? WHERE post_id = ?", (str(new_views), row["post_id"]))
                    conn.commit()
                    
                    cursor.execute("""
                        SELECT post_id, post_title FROM tb_board_post
                        WHERE board_id = 'notice' AND use_yn = 'Y' AND CAST(create_dt AS INTEGER) < CAST(? AS INTEGER)
                        ORDER BY CAST(create_dt AS INTEGER) DESC LIMIT 1
                    """, (row["create_dt"],))
                    prev_row = cursor.fetchone()
                    
                    cursor.execute("""
                        SELECT post_id, post_title FROM tb_board_post
                        WHERE board_id = 'notice' AND use_yn = 'Y' AND CAST(create_dt AS INTEGER) > CAST(? AS INTEGER)
                        ORDER BY CAST(create_dt AS INTEGER) ASC LIMIT 1
                    """, (row["create_dt"],))
                    next_row = cursor.fetchone()
                    
                    detail = {
                        "post_id": row["post_id"],
                        "title": row["post_title"],
                        "content": row["post_content"],
                        "view_count": new_views,
                        "fix_yn": row["fix_yn"],
                        "create_dt": row["create_dt"],
                        "prev_post": {"post_id": prev_row["post_id"], "title": prev_row["post_title"]} if prev_row else None,
                        "next_post": {"post_id": next_row["post_id"], "title": next_row["post_title"]} if next_row else None
                    }
                    self.wfile.write(json.dumps({"status": "success", "data": detail}, ensure_ascii=False).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Post not found"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Literature Dialect List API (dialect_local.db · tb_literature + tb_literature_example)
        elif parsed_url.path == '/api/literatures':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()

            q = query_params.get('q', [''])[0].strip()
            region = query_params.get('region', [''])[0].strip()
            writer = query_params.get('writer', [''])[0].strip()
            book = query_params.get('book', [''])[0].strip()
            target = query_params.get('target', ['all'])[0].strip().lower()  # all | dialect | standard
            match_mode = query_params.get('match', ['contains'])[0].strip().lower()  # contains | exact | prefix | suffix
            try:
                page = max(1, int(query_params.get('page', [1])[0]))
            except (TypeError, ValueError):
                page = 1
            try:
                limit = min(100, max(1, int(query_params.get('limit', [12])[0])))
            except (TypeError, ValueError):
                limit = 12
            offset = (page - 1) * limit

            def like_pattern(term, mode):
                if mode in ('exact', 'eq', '일치'):
                    return term
                if mode in ('prefix', 'start', '시작문자'):
                    return f"{term}%"
                if mode in ('suffix', 'end', '끝문자'):
                    return f"%{term}"
                return f"%{term}%"

            def op_sql(col, mode):
                if mode in ('exact', 'eq', '일치'):
                    return f"{col} = ?"
                return f"{col} LIKE ?"

            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                # 공개 노출 기본: use_yn = 'Y' (없으면 포함)
                where_clauses = ["(l.use_yn IS NULL OR l.use_yn = '' OR UPPER(l.use_yn) = 'Y')"]
                params = []

                if q:
                    pat = like_pattern(q, match_mode)
                    if target in ('dialect', 'dlt', '지역어'):
                        where_clauses.append(op_sql('l.dlt_tp', match_mode))
                        params.append(pat if match_mode not in ('exact', 'eq', '일치') else q)
                    elif target in ('standard', 'std', '표준어'):
                        where_clauses.append(op_sql('l.std_tp', match_mode))
                        params.append(pat if match_mode not in ('exact', 'eq', '일치') else q)
                    else:
                        # 전체: 표제어·표준어·뜻·관련방언·지역·용례·작가·작품
                        where_clauses.append(
                            "("
                            + " OR ".join([
                                op_sql('l.dlt_tp', match_mode),
                                op_sql('l.std_tp', match_mode),
                                op_sql('l.mean', match_mode),
                                op_sql('l.rel_dlt', match_mode),
                                op_sql('l.region_nm', match_mode),
                                op_sql('e.word_example', match_mode),
                                op_sql('e.writer', match_mode),
                                op_sql('e.book_name', match_mode),
                            ])
                            + ")"
                        )
                        pval = pat if match_mode not in ('exact', 'eq', '일치') else q
                        params.extend([pval] * 8)

                # 다중 지역: comma-separated → OR (예: 강원도,경상도)
                regions = [r.strip() for r in region.replace('|', ',').split(',') if r.strip() and r.strip() != '전체']
                if regions:
                    region_ors = []
                    for r in regions:
                        region_ors.append("l.region_nm LIKE ?")
                        params.append(f"%{r}%")
                    where_clauses.append("(" + " OR ".join(region_ors) + ")")

                if writer and writer not in ('전체', '(전체)', 'all'):
                    where_clauses.append("TRIM(e.writer) = ?")
                    params.append(writer)

                if book and book not in ('전체', '(전체)', 'all'):
                    where_clauses.append("TRIM(e.book_name) = ?")
                    params.append(book)

                where_sql = " WHERE " + " AND ".join(where_clauses)

                cursor.execute(f"""
                    SELECT COUNT(DISTINCT l.liter_id) AS total
                    FROM tb_literature l
                    LEFT JOIN tb_literature_example e
                      ON l.liter_id = e.liter_id
                     AND (e.use_yn IS NULL OR e.use_yn = '' OR UPPER(e.use_yn) = 'Y')
                    {where_sql}
                """, params)
                total_count = cursor.fetchone()["total"]

                cursor.execute(f"""
                    SELECT l.liter_id, l.dlt_tp, l.std_tp, l.word_class, l.mean,
                           l.region_nm, l.rel_dlt, l.word_desc,
                           l.exh_book_nm, l.exh_author, l.exh_publish_com, l.exh_publish_year
                    FROM tb_literature l
                    LEFT JOIN tb_literature_example e
                      ON l.liter_id = e.liter_id
                     AND (e.use_yn IS NULL OR e.use_yn = '' OR UPPER(e.use_yn) = 'Y')
                    {where_sql}
                    GROUP BY l.liter_id
                    ORDER BY CAST(l.liter_id AS INTEGER) ASC
                    LIMIT ? OFFSET ?
                """, params + [limit, offset])

                lit_rows = cursor.fetchall()
                result = []

                for row in lit_rows:
                    liter_id = row["liter_id"]
                    ex_params = [liter_id]
                    ex_sql = """
                        SELECT word_example, std_example, writer, book_name,
                               publish_company, publish_year, page_no
                        FROM tb_literature_example
                        WHERE liter_id = ?
                          AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    """
                    # 작가/작품 필터 시 용례도 동일 조건으로 좁힘
                    if writer and writer not in ('전체', '(전체)', 'all'):
                        ex_sql += " AND TRIM(writer) = ?"
                        ex_params.append(writer)
                    if book and book not in ('전체', '(전체)', 'all'):
                        ex_sql += " AND TRIM(book_name) = ?"
                        ex_params.append(book)
                    ex_sql += " ORDER BY CAST(liter_exam_id AS INTEGER) ASC"
                    cursor.execute(ex_sql, ex_params)
                    examples = []
                    for ex in cursor.fetchall():
                        examples.append({
                            "example": ex["word_example"] or "",
                            "std_example": ex["std_example"] or "",
                            "writer": ex["writer"] or "",
                            "book_name": ex["book_name"] or "",
                            "publish_year": ex["publish_year"] or "",
                            "page_no": ex["page_no"] or "",
                        })

                    # 해설 출처: 〈책명, 저자, 출판사, 연도〉
                    src_parts = [
                        (row["exh_book_nm"] or "").strip(),
                        (row["exh_author"] or "").strip(),
                        (row["exh_publish_com"] or "").strip(),
                        (row["exh_publish_year"] or "").strip(),
                    ]
                    src_parts = [p for p in src_parts if p]
                    mean_src = "〈" + ", ".join(src_parts) + "〉" if src_parts else ""

                    result.append({
                        "liter_id": row["liter_id"],
                        "dlt_tp": row["dlt_tp"] or "",
                        "std_tp": row["std_tp"] or "",
                        "word_class": row["word_class"] or "",
                        "mean": row["mean"] or "",
                        "mean_src": mean_src,
                        "region_nm": row["region_nm"] or "",
                        "rel_dlt": row["rel_dlt"] or "",
                        "word_desc": row["word_desc"] or "",
                        "exh_book_nm": (row["exh_book_nm"] or "").strip(),
                        "exh_author": (row["exh_author"] or "").strip(),
                        "exh_publish_com": (row["exh_publish_com"] or "").strip(),
                        "exh_publish_year": (row["exh_publish_year"] or "").strip(),
                        "examples": examples,
                    })

                conn.close()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "data": result,
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Literature facets: distinct writers / books from local DB
        elif parsed_url.path == '/api/literature_facets':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()

            writer = query_params.get('writer', [''])[0].strip()

            def hangul_cho(s):
                if not s:
                    return ''
                ch = s.strip()[0]
                if '가' <= ch <= '힣':
                    cho = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
                           'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
                    return cho[(ord(ch) - 0xAC00) // 588]
                return ch

            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT TRIM(writer) AS name, COUNT(*) AS cnt
                    FROM tb_literature_example
                    WHERE writer IS NOT NULL AND TRIM(writer) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    GROUP BY TRIM(writer)
                    ORDER BY name COLLATE NOCASE ASC
                """)
                authors = []
                for r in cursor.fetchall():
                    authors.append({
                        "name": r["name"],
                        "count": r["cnt"],
                        "cho": hangul_cho(r["name"]),
                    })

                book_sql = """
                    SELECT TRIM(book_name) AS name, COUNT(*) AS cnt
                    FROM tb_literature_example
                    WHERE book_name IS NOT NULL AND TRIM(book_name) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                """
                book_params = []
                if writer and writer not in ('전체', '(전체)', 'all'):
                    book_sql += " AND TRIM(writer) = ?"
                    book_params.append(writer)
                book_sql += " GROUP BY TRIM(book_name) ORDER BY name COLLATE NOCASE ASC"
                cursor.execute(book_sql, book_params)
                books = [{"name": r["name"], "count": r["cnt"]} for r in cursor.fetchall()]

                cursor.execute("""
                    SELECT region_nm AS name, COUNT(*) AS cnt
                    FROM tb_literature
                    WHERE region_nm IS NOT NULL AND TRIM(region_nm) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    GROUP BY region_nm
                    ORDER BY cnt DESC
                """)
                regions = [{"name": r["name"], "count": r["cnt"]} for r in cursor.fetchall()]

                conn.close()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "data": {
                        "authors": authors,
                        "books": books,
                        "regions": regions,
                    },
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Region Culture Category API
        elif parsed_url.path == '/api/region_culture':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            q = query_params.get('q', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_sql = ""
                params = []
                if q:
                    where_sql = "WHERE (p.title LIKE ? OR p.mean LIKE ? OR p.subject LIKE ? OR p.research_area LIKE ?)"
                    params = [f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"]
                
                cursor.execute(f"""
                    SELECT p.subject, COUNT(DISTINCT p.region_photo_id) as total_count,
                           GROUP_CONCAT(DISTINCT p.research_area) as regions
                    FROM tb_region_photo p
                    WHERE p.use_yn = 'Y' AND p.subject IS NOT NULL AND p.subject != ''
                    {("AND " + where_sql[6:]) if where_sql else ""}
                    GROUP BY p.subject
                    ORDER BY p.subject
                """, params)
                
                rows = cursor.fetchall()
                categories = []
                for row in rows:
                    subject = row["subject"]
                    cursor.execute("""
                        SELECT p.title, p.mean, f.sys_file_name, f.file_ext
                        FROM tb_region_photo p
                        LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                        WHERE p.subject = ? AND p.use_yn = 'Y'
                        ORDER BY (f.sys_file_name = ?) DESC, CAST(f.file_idx AS INTEGER)
                        LIMIT 3
                    """, (subject, SUBJECT_THUMB.get(subject, "")))
                    sample_items = []
                    for item in cursor.fetchall():
                        img_path = photo_img(item["sys_file_name"], item["file_ext"], item["title"] or subject)
                        sample_items.append({
                            "title": item["title"],
                            "mean": item["mean"],
                            "img": img_path
                        })
                    
                    categories.append({
                        "subject": subject,
                        "total_count": row["total_count"],
                        "regions": row["regions"] or "전국",
                        "samples": sample_items
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "data": categories}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Region Culture Item List API
        elif parsed_url.path == '/api/region_culture_list':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            subject = query_params.get('subject', [''])[0].strip()
            q = query_params.get('q', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_clauses = ["p.use_yn = 'Y'"]
                params = []
                if subject:
                    where_clauses.append("p.subject = ?")
                    params.append(subject)
                if q:
                    where_clauses.append("(p.title LIKE ? OR p.mean LIKE ? OR p.cor_standard_language LIKE ? OR p.usage LIKE ?)")
                    params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
                    
                where_sql = " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(f"""
                    SELECT p.region_photo_id, p.title, p.mean, p.cor_standard_language, p.research_area, p.subject, p.usage,
                           f.sys_file_name, f.file_ext
                    FROM tb_region_photo p
                    LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                    {where_sql}
                    GROUP BY p.region_photo_id
                    ORDER BY CAST(p.region_photo_id AS INTEGER) ASC
                """, params)
                
                rows = cursor.fetchall()
                items = []
                for row in rows:
                    img_path = photo_img(row["sys_file_name"], row["file_ext"], row["region_photo_id"])
                    items.append({
                        "id": row["region_photo_id"],
                        "title": row["title"],
                        "mean": row["mean"],
                        "std": row["cor_standard_language"] or "",
                        "region": row["research_area"] or "전국",
                        "subject": row["subject"],
                        "usage": row["usage"] or "",
                        "img": img_path
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "total": len(items), "data": items}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
        # Region Culture Item Detail API
        elif parsed_url.path == '/api/region_culture_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            photo_id = query_params.get('id', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT p.*
                    FROM tb_region_photo p
                    WHERE p.region_photo_id = ? AND p.use_yn = 'Y'
                """, (photo_id,))
                
                row = cursor.fetchone()
                if row:
                    # Fetch all attached photos
                    cursor.execute("""
                        SELECT sys_file_name, file_ext, ori_file_name
                        FROM tb_region_photo_file
                        WHERE region_photo_id = ?
                        ORDER BY CAST(file_idx AS INTEGER) ASC
                    """, (photo_id,))
                    file_rows = cursor.fetchall()
                    
                    images = []
                    for f in file_rows:
                        if f["sys_file_name"]:
                            images.append(photo_img(f["sys_file_name"], f["file_ext"], f["sys_file_name"]))
                    if not images:
                        images = [photo_img(None, None, photo_id)]

                    # Fetch related items in same subject
                    subject = row["subject"]
                    cursor.execute("""
                        SELECT p.region_photo_id, p.title, p.mean, f.sys_file_name, f.file_ext
                        FROM tb_region_photo p
                        LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                        WHERE p.subject = ? AND p.region_photo_id != ? AND p.use_yn = 'Y'
                        GROUP BY p.region_photo_id
                        LIMIT 8
                    """, (subject, photo_id))
                    
                    related = []
                    for r in cursor.fetchall():
                        r_img = photo_img(r["sys_file_name"], r["file_ext"], r["region_photo_id"])
                        related.append({
                            "id": r["region_photo_id"],
                            "title": r["title"],
                            "mean": r["mean"] or "",
                            "img": r_img
                        })

                    detail = {
                        "id": row["region_photo_id"],
                        "title": row["title"],
                        "mean": row["mean"] or "",
                        "etc_info": row["etc_info"] or "",
                        "std": row["cor_standard_language"] or "",
                        "region": row["research_area"] or "전국",
                        "subject": row["subject"] or "",
                        "word_class": row["word_class"] or "",
                        "usage": row["usage"] or "",
                        "make_year": row["make_year"] or "",
                        "data_source": row["data_source"] or "민족생활어 조사 자료",
                        "another_name": row["another_name"] or "",
                        "images": images,
                        "related": related
                    }
                    self.wfile.write(json.dumps({"status": "success", "data": detail}, ensure_ascii=False).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Item not found"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Map point detail — 지도 기호 클릭 팝업용 (tb_dialect_region)
        elif parsed_url.path == '/api/map_point':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            word = (query_params.get('word') or [''])[0].strip()
            std = (query_params.get('std') or query_params.get('headword') or [''])[0].strip()
            sido = (query_params.get('sido') or [''])[0].strip()
            sigungu = (query_params.get('sigungu') or [''])[0].strip()
            region = (query_params.get('region') or [''])[0].strip()
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                where = ["(use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y' OR use_yn = 'N')"]
                params = []
                # 지역어형 우선, 없으면 표준어
                if word:
                    where.append("(dlt_tp = ? OR dlt_tp LIKE ? OR dlt_tp LIKE ?)")
                    params.extend([word, word + '(%', '%|' + word + '%'])
                elif std:
                    where.append("(std_tp = ? OR dlt_tp = ?)")
                    params.extend([std, std])
                if sigungu:
                    where.append("(sigungu_nm = ? OR sigungu_nm LIKE ?)")
                    params.extend([sigungu, '%' + sigungu + '%'])
                if sido:
                    where.append("(sido_nm = ? OR sido_nm LIKE ?)")
                    params.extend([sido, '%' + sido.replace('특별자치', '').replace('광역시','').replace('특별시','')[:2] + '%'])
                if region and not (sido or sigungu):
                    where.append("(sido_nm || ' ' || IFNULL(sigungu_nm,'') LIKE ? OR IFNULL(sigungu_nm,'') LIKE ?)")
                    params.extend(['%' + region + '%', '%' + region.split()[-1] + '%'])
                sql = f"""
                    SELECT dlt_tp, std_tp, item_nm, source, serial_nm, basis_year,
                           sido_nm, sigungu_nm, sex, age, research_degree, file_memo, etc
                    FROM tb_dialect_region
                    WHERE {' AND '.join(where)}
                    ORDER BY
                      CASE WHEN dlt_tp = ? THEN 0 ELSE 1 END,
                      CAST(basis_year AS INTEGER) DESC
                    LIMIT 8
                """
                cur.execute(sql, params + [word or std or ''])
                rows = cur.fetchall()
                # 완화 재시도: 단어만
                if not rows and word:
                    cur.execute("""
                        SELECT dlt_tp, std_tp, item_nm, source, serial_nm, basis_year,
                               sido_nm, sigungu_nm, sex, age, research_degree, file_memo, etc
                        FROM tb_dialect_region
                        WHERE (dlt_tp = ? OR std_tp = ?)
                          AND (sigungu_nm = ? OR ? = '')
                        ORDER BY CAST(basis_year AS INTEGER) DESC
                        LIMIT 8
                    """, (word, word, sigungu, sigungu))
                    rows = cur.fetchall()
                conn.close()

                def sex_label(v):
                    s = str(v or '').strip()
                    if s in ('0', '남', '남성'):
                        return '남'
                    if s in ('1', '여', '여성'):
                        return '여'
                    return s or ''

                data = []
                for r in rows:
                    data.append({
                        "dltTp": r["dlt_tp"] or "",
                        "stdTp": r["std_tp"] or "",
                        "itemNm": r["item_nm"] or "",
                        "source": r["source"] or "",
                        "serialNm": r["serial_nm"] or "",
                        "basisYear": r["basis_year"] or "",
                        "sidoNm": r["sido_nm"] or "",
                        "sigunguNm": r["sigungu_nm"] or "",
                        "sex": sex_label(r["sex"]),
                        "age": r["age"] or "",
                        "researchDegree": r["research_degree"] or "",
                        "fileMemo": r["file_memo"] or "",
                        "etc": r["etc"] or "",
                    })
                self.wfile.write(json.dumps({
                    "status": "success",
                    "total": len(data),
                    "data": data,
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # ── 구술발화 조사 자료: 검색(발화 턴 단위 + 파일 단위 동시 집계) ──
        elif parsed_url.path == '/api/oral_search':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = oral_api.search(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        # ── 구술발화 조사 자료: 원문 전문(3단 전사) ──
        elif parsed_url.path == '/api/oral_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = oral_api.detail(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        # ── 구술발화 음성: 문장 단위 재생을 위해 Range 요청(206) 지원 ──
        elif parsed_url.path == '/api/oral_audio':
            trs_id = (query_params.get('trsId') or [''])[0].strip()
            path = None
            try:
                path = oral_api.audio_path(trs_id)
            except Exception:
                path = None
            if not path or not os.path.exists(path):
                self.send_response(404)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {"status": "error", "message": "audio not found", "trsId": trs_id},
                    ensure_ascii=False).encode('utf-8'))
                return
            size = os.path.getsize(path)
            rng = self.headers.get('Range')
            start, end = 0, size - 1
            partial = False
            if rng:
                m = re.match(r'bytes=(\d*)-(\d*)', rng)
                if m:
                    if m.group(1):
                        start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                    if start <= end < size:
                        partial = True
            self.send_response(206 if partial else 200)
            self.send_header('Content-type', 'audio/wav')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(end - start + 1))
            if partial:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            with open(path, 'rb') as f:
                f.seek(start)
                remain = end - start + 1
                while remain > 0:
                    chunk = f.read(min(65536, remain))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remain -= len(chunk)
            return

        # ── 어휘 조사 자료: 목록(지역어형×표준어 조합 단위) ──
        elif parsed_url.path == '/api/vocab_search':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = vocab_api.search(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        # ── 어휘 조사 자료: 상세(조사 지점별 목록 + 음성 URL) ──
        elif parsed_url.path == '/api/vocab_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = vocab_api.detail(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        # ── 어휘 음성 중계: 운영 파일서버가 자체 서명 인증서라 브라우저가 직접 못 받는다 ──
        elif parsed_url.path == '/api/vocab_audio':
            year = (query_params.get('year') or [''])[0].strip()
            serial = (query_params.get('serial') or [''])[0].strip()
            if not re.fullmatch(r'\d{4}', year) or not re.fullmatch(r'[A-Za-z0-9_-]+', serial):
                self.send_response(400)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": "bad params"}).encode('utf-8'))
                return
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            try:
                with urllib.request.urlopen(vocab_api.audio_origin(year, serial), context=ctx, timeout=20) as up:
                    body = up.read()
            except Exception as e:
                self.send_response(404)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)},
                                            ensure_ascii=False).encode('utf-8'))
                return
            self.send_response(200)
            self.send_header('Content-type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Accept-Ranges', 'none')
            self.end_headers()
            self.wfile.write(body)
            return

        # ── 어휘 지도: 지역어형 1개의 시도별 표준어 분포 ──
        elif parsed_url.path == '/api/vocab_map':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = vocab_api.map_data(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        elif parsed_url.path == '/api/openapi/mine':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = api_openapi_mine(query_params)
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        # ── 메인 설문조사 팝업: 진행 중인 설문 1건 ──
        elif parsed_url.path == '/api/weather/awareness':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            try:
                res = api_weather_awareness(
                    (urllib.parse.parse_qs(parsed_url.query).get('year') or [''])[0])
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        elif parsed_url.path == '/api/survey/active':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                res = api_survey_active()
            except Exception as e:
                res = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length > 0 else b""
        ctype = (self.headers.get('Content-Type') or "").split(";")[0].strip().lower()

        def send_json(obj, status=200):
            self.send_response(status)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(obj, ensure_ascii=False).encode('utf-8'))

        body = {}
        if raw:
            try:
                if ctype in ("application/json", "text/json", ""):
                    body = json.loads(raw.decode("utf-8") or "{}")
                else:
                    parsed = urllib.parse.parse_qs(raw.decode("utf-8"), keep_blank_values=True)
                    body = {k: (v[0] if len(v) == 1 else v) for k, v in parsed.items()}
            except Exception:
                send_json({"status": "error", "message": "요청 본문을 해석할 수 없습니다."}, 400)
                return
        if not isinstance(body, dict):
            body = {}

        if parsed_url.path == '/api/survey/answer':
            try:
                res = api_survey_answer_save(body)
                send_json(res, 200 if res.get("status") == "success" else 400)
            except Exception as e:
                send_json({"status": "error", "message": str(e)}, 500)
            return

        if parsed_url.path == '/api/openapi/issue':
            try:
                res = api_openapi_issue(body)
                send_json(res, 200 if res.get("status") == "success" else 400)
            except Exception as e:
                send_json({"status": "error", "message": str(e)}, 500)
            return

        self.send_error(404, "Not Found")

class ThreadedServer(socketserver.ThreadingTCPServer):
    """음성(wav) 스트리밍이 한 커넥션을 오래 붙잡는다.
    단일 스레드 TCPServer 로는 재생 중 다른 요청(페이지·검색·구간 탐색)이 전부 막힌다."""
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with ThreadedServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving HTTP on 127.0.0.1 port {PORT} (http://127.0.0.1:{PORT}/) with API support...")
        httpd.serve_forever()
