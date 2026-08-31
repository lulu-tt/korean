# -*- coding: utf-8 -*-
"""로컬 기상도 DB → Turso 반영.

    python3 scripts/sync_weather_turso.py            # 미리보기(무엇이 바뀌는지만)
    python3 scripts/sync_weather_turso.py --apply    # 실제 반영

왜 전량 교체인가
  관리자에서 파일을 재업로드하면 그 파일 행을 지우고 다시 넣어 id 가 전부 바뀐다.
  그래서 '달라진 것만 골라 보내기' 가 성립하지 않는다. 기상도 두 표를 로컬 그대로
  갈아 끼우는 편이 단순하고, 결과가 로컬과 반드시 같다.

건드리지 않는 것
  단어 카드 표(wb_wordcard*) 는 그대로 둔다. 기상도와 원천이 다르다.

인증
  turso CLI 로그인을 쓴다. 토큰을 다루지 않는다.
  Vercel 에 넣은 토큰은 읽기 전용이라 이 반영에 쓸 수 없다.
"""
import argparse
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
        print("\n  문장 %d개 전송 시작 (기상도 두 표만 교체)" % len(parts))
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


if __name__ == "__main__":
    main()
