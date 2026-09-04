#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
지도 팝업 제보자 목록을 정적 파일로 뽑는다.

운영(server.py /api/map_point)은 tb_dialect_region 을 (방언형 × 시·군) 으로 조회한다.
API 가 없는 배포(GitHub Pages·Vercel 정적)에서도 같은 내용을 보이도록,
표제어별 지도 payload(data/processed/map/<no>.json)에 실제로 찍히는
(방언형, 시·군) 짝만 골라 미리 조회해 둔다.

  python3 scripts/export_map_points.py

출력: data/processed/map_points/<headword_no>.json
  { "headword": "자치기", "points": { "자치기│강원도│속초시": [ {y,s,a,m,f}, ... ] } }
    y=조사연도 s=성별 a=나이 m=파일메모 f=방언형(원표기, 여럿이면 | 로 이음)
"""
from __future__ import annotations

import json
import sqlite3
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "dialect_local.db"
SRC = ROOT / "data" / "processed" / "map"
OUT = ROOT / "data" / "processed" / "map_points"

LIMIT = 40  # 한 지점 제보자 수 상한. 실제 최대는 30명 안쪽이라 사실상 자르지 않는다.


def sex_label(v):
    # tb_dialect_region.sex 는 0=여 · 1=남 (server.py 와 같은 규약)
    s = str(v or "").strip()
    if s in ("0", "여", "여성"):
        return "여"
    if s in ("1", "남", "남성"):
        return "남"
    return s or ""


def word_keys(dlt: str):
    """server.py 의 dlt_tp = ? / LIKE '단어(%' / LIKE '%|단어%' 를 뒤집은 것."""
    d = (dlt or "").strip()
    if not d:
        return []
    out = [d]
    if "(" in d:
        out.append(d.split("(")[0].strip())
    if "|" in d:
        for seg in d.split("|"):
            seg = seg.strip()
            if seg:
                out.append(seg)
                if "(" in seg:
                    out.append(seg.split("(")[0].strip())
    seen, uniq = set(), []
    for x in out:
        if x and x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq


def build_index():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT dlt_tp, std_tp, basis_year, sido_nm, sigungu_nm, sex, age, file_memo
        FROM tb_dialect_region
        WHERE (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) IN ('Y','N'))
        """
    )
    by_word = collections.defaultdict(list)
    by_std = collections.defaultdict(list)
    for r in cur:
        sido = (r["sido_nm"] or "").strip()
        sgg = (r["sigungu_nm"] or "").strip()
        if not sgg:
            continue
        rec = {
            "y": (r["basis_year"] or "").strip(),
            "s": sex_label(r["sex"]),
            "a": (str(r["age"]) if r["age"] is not None else "").strip(),
            "f": (r["dlt_tp"] or "").strip(),
        }
        memo = (r["file_memo"] or "").strip()
        if memo:
            rec["m"] = memo
        for w in word_keys(r["dlt_tp"]):
            by_word[(w, sido, sgg)].append(rec)
        std = (r["std_tp"] or "").strip()
        if std:
            by_std[(std, sido, sgg)].append(rec)
    conn.close()
    return by_word, by_std


def dedupe(rows):
    """제보자(조사연도·성별·나이) 단위로 묶어 최근 순. 화면의 묶는 단위와 같게 맞춘다.

    server.py 는 원자료 8행을 먼저 자른 뒤 화면에서 사람 단위로 묶는다.
    같은 사람이 표기를 달리해 여러 행으로 들어 있으면 8행이 3~4명으로 줄어,
    실제로 조사된 제보자가 목록에서 빠진다. 여기서는 사람으로 먼저 묶으므로
    결과는 언제나 운영 API 의 상위집합이다.
    """
    people, order = {}, []
    for r in sorted(rows, key=lambda x: x["y"], reverse=True):
        key = (r["y"], r["s"], r["a"])
        if key not in people:
            if len(order) >= LIMIT:
                continue
            people[key] = {"y": r["y"], "s": r["s"], "a": r["a"], "f": [], "m": []}
            order.append(key)
        it = people[key]
        if r["f"] and r["f"] not in it["f"]:
            it["f"].append(r["f"])
        m = r.get("m")
        if m and m not in it["m"]:
            it["m"].append(m)
    out = []
    for key in order:
        it = people[key]
        rec = {"y": it["y"], "s": it["s"], "a": it["a"]}
        if it["f"]:
            rec["f"] = "|".join(it["f"])
        if it["m"]:
            rec["m"] = " · ".join(it["m"])
        out.append(rec)
    return out


def main():
    by_word, by_std = build_index()
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC.glob("*.json"))
    tot_pairs = tot_hit = n_hw = 0
    for p in files:
        d = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(d, dict) or "headword" not in d or "groups" not in d:
            continue  # index.json·경계 GeoJSON 등 표제어 payload 가 아닌 파일
        hw = (d.get("headword") or "").strip()
        points = {}
        for g in (d.get("groups") or {}).values():
            for v in g.get("variants") or []:
                w = (v.get("word") or "").strip()
                for pl in v.get("places") or []:
                    sido = (pl.get("sido") or "").strip()
                    sgg = (pl.get("sigungu") or "").strip()
                    if not (w and sgg):
                        continue
                    key = "│".join([w, sido, sgg])
                    if key in points:
                        continue
                    tot_pairs += 1
                    rows = by_word.get((w, sido, sgg)) or by_std.get((w, sido, sgg)) or []
                    if rows:
                        tot_hit += 1
                        points[key] = dedupe(rows)
        n_hw += 1
        out = {
            "headword": hw,
            "headwordNo": d.get("headword_no"),
            "source": "tb_dialect_region",
            "points": points,
        }
        (OUT / p.name).write_text(
            json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
    print("표제어 %d개 · (방언형×시군) %d짝 중 %d짝에 제보자 있음 (%.1f%%)"
          % (n_hw, tot_pairs, tot_hit, 100.0 * tot_hit / max(tot_pairs, 1)))


if __name__ == "__main__":
    main()
