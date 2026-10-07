#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
음운 응답의 (항목 × 지점) 중복 정리

왜 생겼나
  response 의 유일키가 (item_code, site_id, source_file) 였다. 지점 대조를
  (도, 헤더)로 바꾼 뒤로는 같은 지점이 여러 파일에서 올라와도 site_id 가 같은데,
  파일명이 다르면 유일키가 달라져 같은 칸이 새 행으로 쌓였다.
  (예: 강원을 «지역별이형태_강원.xlsx» 로 올린 뒤 «변이형비교_음운_강원.xlsx» 로
   다시 올리면 6지점 × 1,599항목 = 9,594칸이 한 벌 더 생긴다)

무엇을 하나
  1. (항목, 지점)마다 가장 최근에 적재된 행만 남긴다
  2. UNIQUE INDEX 를 걸어 재발을 막는다
  3. 조회용 산출물과 관리자 시드를 다시 내보낸다

사용
  python3 scripts/repair_phonology_dupes.py --dry-run
  python3 scripts/repair_phonology_dupes.py
"""
from __future__ import annotations

import argparse
import importlib.util
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "processed" / "dialect_phonology.db"


def load_admin():
    """serve.py 의 내보내기·시드 함수를 그대로 쓴다(적재 경로와 같은 코드)."""
    path = ROOT / "neibis-cms" / "serve.py"
    spec = importlib.util.spec_from_file_location("neibis_admin", str(path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules["neibis_admin"] = mod
    spec.loader.exec_module(mod)
    return mod


def report(con) -> tuple[int, int]:
    total = con.execute("SELECT COUNT(*) FROM response").fetchone()[0]
    dup = con.execute("""
        SELECT COALESCE(SUM(n - 1), 0) FROM (
            SELECT COUNT(*) n FROM response
            GROUP BY item_code, site_id HAVING COUNT(*) > 1)""").fetchone()[0]
    return total, dup


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="세어만 보고 고치지 않는다")
    args = ap.parse_args()

    if not DB.is_file():
        sys.exit("DB 를 찾을 수 없습니다: %s" % DB)

    con = sqlite3.connect(str(DB))
    con.row_factory = sqlite3.Row
    total, dup = report(con)
    print("현재 응답 %s행 · 지울 중복 %s행 → 정리 후 %s행"
          % (format(total, ","), format(dup, ","), format(total - dup, ",")))

    for r in con.execute("""
            SELECT s.province_name p, COUNT(*) n, COUNT(DISTINCT r.source_file) f
            FROM response r JOIN survey_site s ON s.site_id = r.site_id
            GROUP BY s.province_name HAVING f > 1 ORDER BY s.province_name"""):
        print("  %-3s 응답 %s행 · 출처 파일 %d개" % (r["p"], format(r["n"], ","), r["f"]))

    if args.dry_run:
        print("\n--dry-run 이라 아무것도 바꾸지 않았습니다.")
        return
    if not dup:
        print("\n중복이 없습니다. 인덱스만 확인합니다.")

    with con:
        # (항목, 지점)마다 가장 나중에 적재된 행(id 최대)만 남긴다
        con.execute("""
            DELETE FROM response WHERE id NOT IN (
                SELECT MAX(id) FROM response GROUP BY item_code, site_id)""")
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_response_item_site "
                    "ON response(item_code, site_id)")
    con.execute("VACUUM")

    total2, dup2 = report(con)
    print("\n정리 완료: 응답 %s행 · 남은 중복 %s" % (format(total2, ","), dup2))

    # 조회용 산출물·시드 재생성 — DB 만 고치면 화면은 그대로다
    admin = load_admin()
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    today = datetime.now().strftime("%Y-%m-%d")
    items_dir = ROOT / "data" / "processed" / "items"
    if items_dir.is_dir():
        for f in items_dir.glob("*.json"):
            f.unlink()
    admin.E = None  # noqa — 사용하지 않음(가독성용)
    etl_spec = importlib.util.spec_from_file_location(
        "etl_phonology", str(ROOT / "scripts" / "etl_phonology.py"))
    E = importlib.util.module_from_spec(etl_spec)
    etl_spec.loader.exec_module(E)
    paths = E.export_json(con, ROOT / "data" / "processed",
                          admin._vb_site_map_rows(con), now)
    n_seed = admin._vb_write_seed(con, today)
    print("재출력:", ", ".join(sorted(Path(v).name for v in paths.values())))
    print("시드:", n_seed, "항목")
    con.close()


if __name__ == "__main__":
    main()
