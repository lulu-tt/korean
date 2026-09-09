# -*- coding: utf-8 -*-
"""로컬 기상도 DB → Turso 반영.

    python3 scripts/sync_weather_turso.py            # 미리보기(무엇이 바뀌는지만)
    python3 scripts/sync_weather_turso.py --apply    # 실제 반영

왜 전량 교체인가
  관리자에서 파일을 재업로드하면 그 파일 행을 지우고 다시 넣어 id 가 전부 바뀐다.
  그래서 '달라진 것만 골라 보내기' 가 성립하지 않는다. 기상도 두 표를 로컬 그대로
  갈아 끼우는 편이 단순하고, 결과가 로컬과 반드시 같다.

미리 계산까지 함께 한다
  요청마다 60,559행을 읽어 판정하면 7초쯤 걸린다. 그래서 자료를 넣은 바로 뒤에
  같은 실행에서 build_output() 결과를 만들어 wb_weather_built* 에 넣는다.
  둘이 같은 실행에서 나오므로 자료와 계산이 어긋날 수 없다 — 예전 정적 JSON 이
  조용히 낡던 문제가 생기지 않는다.

건드리지 않는 것
  단어 카드 표(wb_wordcard*) 는 그대로 둔다. 기상도와 원천이 다르다.

인증
  turso CLI 로그인을 쓴다. 토큰을 다루지 않는다.
  Vercel 에 넣은 토큰은 읽기 전용이라 이 반영에 쓸 수 없다.
"""
import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get("WEATHER_DB", os.path.join(BASE, "data", "gisangdo.db"))
TURSO_DB = os.environ.get("TURSO_DB_NAME", "korean-dialect")

FCOL = ["weather_file_id", "file_nm", "region_cd", "region_nm", "research_year",
        "research_degree", "generation", "sex", "row_cnt", "item_cnt", "src_layout",
        "use_yn", "reg_id", "reg_dt", "upt_id", "upt_dt"]
RCOL = ["response_id", "weather_file_id", "line_no", "serial_no", "item_cd", "item_base",
        "headword", "dialect_form", "grade", "grade_valid_yn", "use_yn", "reg_dt", "upt_dt"]

# 한 문장에 담는 행 수. 문장 하나가 커지면 CLI 가 받아주지 못한다.
PER_FILE, PER_RESP = 50, 400


def turso_cli():
    for p in (shutil.which("turso"), os.path.expanduser("~/.turso/turso")):
        if p and os.path.exists(p):
            return p
    sys.exit("turso CLI 를 찾지 못했습니다. curl -sSfL https://get.tur.so/install.sh | bash")


def ask(cli, sql):
    r = subprocess.run([cli, "db", "shell", TURSO_DB, sql],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit("Turso 조회 실패: %s" % (r.stderr.strip() or r.stdout.strip()))
    return r.stdout


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


CACHE_KEY = "awareness"
PART_CHARS = 250_000        # 한 조각 크기. SQL 문장 하나가 너무 커지지 않게 나눈다.

BUILT_DDL = """
CREATE TABLE IF NOT EXISTS wb_weather_built (
  cache_key TEXT PRIMARY KEY, sig TEXT NOT NULL,
  built_dt TEXT NOT NULL, parts INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS wb_weather_built_part (
  cache_key TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (cache_key, seq));
"""


def live_sig(con):
    """지금 자료의 지문. api/index.py 의 live_sig() 와 같은 식이어야 한다."""
    n = con.execute("SELECT COUNT(*) FROM wb_weather_response").fetchone()[0]
    d = con.execute("SELECT MAX(reg_dt) FROM wb_weather_file").fetchone()[0]
    return "%s|%s" % (n, d or "")


def built_payload(con):
    """판정까지 끝낸 결과. 조립은 etl 의 build_output() 한 곳에서만 한다."""
    import importlib.util
    path = os.path.join(BASE, "scripts", "etl_awareness_region.py")
    spec = importlib.util.spec_from_file_location("etl_awareness_region", path)
    E = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(E)
    recs, nfiles = E.load_records_from_db(DB)
    out = E.build_output(recs, nfiles)
    E.fill_db_qc(out, DB)
    return json.dumps(out, ensure_ascii=False)


def statements(con):
    """자식 표를 먼저 지운다 — 외래키 참조가 남으면 부모를 못 지운다."""
    yield "DELETE FROM wb_weather_response;"
    yield "DELETE FROM wb_weather_file;"
    for table, cols, per in (("wb_weather_file", FCOL, PER_FILE),
                             ("wb_weather_response", RCOL, PER_RESP)):
        rows = con.execute("SELECT %s FROM %s" % (",".join(cols), table)).fetchall()
        for i in range(0, len(rows), per):
            vals = ",".join("(" + ",".join(lit(r[c]) for c in cols) + ")"
                            for r in rows[i:i + per])
            yield "INSERT INTO %s (%s) VALUES %s;" % (table, ",".join(cols), vals)

    # 미리 계산한 결과. 자료를 넣은 바로 뒤에 같은 실행에서 만들어, 둘이 어긋날 수 없게 한다.
    for stmt in BUILT_DDL.strip().split(";"):
        if stmt.strip():
            yield stmt.strip() + ";"
    sig = live_sig(con)
    payload = built_payload(con)
    parts = [payload[i:i + PART_CHARS] for i in range(0, len(payload), PART_CHARS)]
    yield "DELETE FROM wb_weather_built_part WHERE cache_key = %s;" % lit(CACHE_KEY)
    yield "DELETE FROM wb_weather_built WHERE cache_key = %s;" % lit(CACHE_KEY)
    for i, chunk in enumerate(parts, 1):
        yield ("INSERT INTO wb_weather_built_part (cache_key, seq, payload)"
               " VALUES (%s,%d,%s);" % (lit(CACHE_KEY), i, lit(chunk)))
    # 조각이 다 들어간 뒤에 머리글을 쓴다 — 중간에 끊기면 캐시가 없는 상태로 남고,
    # API 는 그때 직접 계산한다(낡은 값을 내려주지 않는다).
    yield ("INSERT INTO wb_weather_built (cache_key, sig, built_dt, parts)"
           " VALUES (%s,%s,datetime('now'),%d);"
           % (lit(CACHE_KEY), lit(sig), len(parts)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 반영한다")
    a = ap.parse_args()

    cli = turso_cli()
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    nf = con.execute("SELECT COUNT(*) FROM wb_weather_file").fetchone()[0]
    nr = con.execute("SELECT COUNT(*) FROM wb_weather_response").fetchone()[0]
    print("  로컬  %s\n        파일 %d · 응답 %d" % (DB, nf, nr))
    print("  Turso %s" % TURSO_DB)
    print(ask(cli, "SELECT 'files' AS what, COUNT(*) AS n FROM wb_weather_file"
                   " UNION ALL SELECT 'resp', COUNT(*) FROM wb_weather_response").rstrip())

    if not a.apply:
        print("\n  미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.")
        return

    tmp = tempfile.mkdtemp(prefix="turso_sync_")
    try:
        parts = []
        for i, s in enumerate(statements(con), 1):
            p = os.path.join(tmp, "%04d.sql" % i)
            with open(p, "w", encoding="utf-8") as f:
                f.write(s + "\n")
            parts.append(p)
        print("\n  문장 %d개 전송 시작 (기상도 두 표 교체 + 미리 계산 저장)" % len(parts))
        for i, p in enumerate(parts, 1):
            with open(p, encoding="utf-8") as f:
                r = subprocess.run([cli, "db", "shell", TURSO_DB],
                                   stdin=f, capture_output=True, text=True)
            if r.returncode:
                sys.exit("\n  %d/%d 실패: %s" % (i, len(parts),
                                                 r.stderr.strip() or r.stdout.strip()))
            if i % 20 == 0 or i == len(parts):
                print("    %d/%d" % (i, len(parts)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        con.close()

    print("\n  반영 후 Turso")
    print(ask(cli, "SELECT research_degree AS yr, COUNT(*) AS files FROM wb_weather_file"
                   " GROUP BY 1 UNION ALL SELECT 'resp', COUNT(*) FROM wb_weather_response"
                   " UNION ALL SELECT 'wordcard(건드리지 않음)', COUNT(*)"
                   " FROM wb_wordcard").rstrip())
    print(ask(cli, "SELECT cache_key, parts, built_dt, sig FROM wb_weather_built").rstrip())


if __name__ == "__main__":
    main()
