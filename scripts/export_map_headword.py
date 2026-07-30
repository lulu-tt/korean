#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dialect_local.db → 지역어 지도용 JSON (실데이터 only)

  python3 scripts/export_map_headword.py
  python3 scripts/export_map_headword.py --headword-no 50526
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "dialect_local.db"
OUT = ROOT / "data" / "processed" / "map"
# 계열 수가 많아도 겹치지 않도록 충분한 기본 팔레트
PALETTE = [
    "#EF4444",
    "#22C55E",
    "#3B82F6",
    "#F59E0B",
    "#A855F7",
    "#06B6D4",
    "#F97316",
    "#64748B",
    "#EC4899",
    "#14B8A6",
    "#8B5CF6",
    "#EAB308",
    "#0EA5E9",
    "#84CC16",
    "#F43F5E",
    "#6366F1",
    "#10B981",
    "#D946EF",
    "#78716C",
    "#0891B2",
]


def norm_color(symbol_color, face_color, group_idx: int) -> str:
    sc = symbol_color
    if sc is not None and str(sc).strip() not in ("", "None"):
        s = str(sc).strip()
        if re.fullmatch(r"[0-9A-Fa-f]{6}", s):
            return "#" + s.upper()
        if s.startswith("#") and len(s) == 7:
            return s.upper()
        try:
            n = int(float(s))
            return f"#{n:06X}"
        except Exception:
            pass
    fc = face_color
    if fc and isinstance(fc, str) and "," in fc:
        parts = [int(float(x.strip())) for x in fc.split(",")[:3]]
        return "#{:02X}{:02X}{:02X}".format(*parts)
    return PALETTE[group_idx % len(PALETTE)]


def _hsl_to_hex(h: float, s: float = 0.62, l: float = 0.48) -> str:
    """h: 0–360. 충분히 구분되는 보조 색 생성."""
    h = (h % 360) / 360.0
    s = max(0.0, min(1.0, s))
    l = max(0.0, min(1.0, l))

    def hue2rgb(p, q, t):
        if t < 0:
            t += 1
        if t > 1:
            t -= 1
        if t < 1 / 6:
            return p + (q - p) * 6 * t
        if t < 1 / 2:
            return q
        if t < 2 / 3:
            return p + (q - p) * (2 / 3 - t) * 6
        return p

    if s == 0:
        r = g = b = l
    else:
        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
    return "#{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255))


def _rgb(c: str) -> tuple[int, int, int]:
    s = c.lstrip("#")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def _color_dist(a: str, b: str) -> float:
    """RGB 유클리드 거리 (0–~441)."""
    ar, ag, ab = _rgb(a)
    br, bg, bb = _rgb(b)
    return ((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) ** 0.5


def ensure_unique_group_colors(groups: dict, min_dist: float = 100.0) -> None:
    """
    mutation_group 계열 색이 DB symbol_color 때문에 겹치는 경우
    (곁두리: 곁두리계·제누리계 모두 #FF0000 등) 표시용으로 유일·구분 색 강제.
    동일 hex뿐 아니라 너무 비슷한 색(#FF0000 vs #EF4444)도 피함.
    """
    used: list[str] = []
    ordered = list(groups.keys())

    def canon(c) -> str | None:
        if not c:
            return None
        s = str(c).strip().upper()
        if re.fullmatch(r"#[0-9A-F]{6}", s):
            return s
        if re.fullmatch(r"[0-9A-F]{6}", s):
            return "#" + s
        return None

    def is_ok(c: str) -> bool:
        for u in used:
            if c == u or _color_dist(c, u) < min_dist:
                return False
        return True

    def pick_new(start_hue: int = 0) -> str:
        for cand in PALETTE:
            cu = cand.upper()
            if is_ok(cu):
                return cu
        for i in range(720):
            cand = _hsl_to_hex((start_hue + i) * 137.508)
            if is_ok(cand):
                return cand
        return "#64748B"

    # 1) 원본 색이 서로 충분히 구분되면 유지
    need_new: list[str] = []
    for gkey in ordered:
        c = canon(groups[gkey].get("color"))
        if c and is_ok(c):
            groups[gkey]["color"] = c
            used.append(c)
        else:
            need_new.append(gkey)

    # 2) 충돌/유사 색 → 팔레트·HSL에서 가장 먼 색
    for i, gkey in enumerate(need_new):
        c = pick_new(i * 17)
        groups[gkey]["color"] = c
        used.append(c)


def norm_commentary(text) -> str:
    """kd_headword.commentary 정리. '.' 하나만 든 행은 내용 없음을 뜻한다."""
    s = (text or "").strip()
    if s in ("", "."):
        return ""
    # 줄 끝 공백만 걷어내고 줄 구조(①②③ 목록·빈 줄 단락)는 그대로 살린다
    return "\n".join(line.rstrip() for line in s.replace("\r\n", "\n").split("\n")).strip()


def export_headword(conn: sqlite3.Connection, headword_no: str) -> dict:
    h = conn.execute(
        """SELECT headword_id, headword_no, headword, meaning, word_class, map_make, commentary
           FROM kd_headword WHERE cast(headword_no as text)=? LIMIT 1""",
        (str(headword_no),),
    ).fetchone()
    rows = conn.execute(
        """
        SELECT
          d.hd_id, d.headword_no, d.word, d.face_color, d.mutation_group, d.mutation_seq,
          d.map_symbol_id, d.symbol_color,
          hdr.region_id, hdr.region_nm,
          r.lng, r.lat, r.sido, r.sigungu, r.sigungu_nm
        FROM tb_headword_dialect d
        JOIN tb_headword_dialect_region hdr ON cast(hdr.hd_id as text)=cast(d.hd_id as text)
        LEFT JOIN kd_region_code r ON cast(r.region_id as text)=cast(hdr.region_id as text)
        WHERE cast(d.headword_no as text)=?
        ORDER BY cast(d.mutation_group as int), cast(d.mutation_seq as int), d.word, hdr.region_nm
        """,
        (str(headword_no),),
    ).fetchall()

    groups_raw: OrderedDict = OrderedDict()
    skipped_no_coord = 0
    skipped_misurvey = 0
    for row in rows:
        word = (row["word"] or "").strip()
        if not word or word == "미조사":
            skipped_misurvey += 1
            continue
        try:
            lng = float(row["lng"]) if row["lng"] not in (None, "") else None
            lat = float(row["lat"]) if row["lat"] not in (None, "") else None
        except (TypeError, ValueError):
            lng = lat = None
        if lng is None or lat is None or (lng == 0 and lat == 0):
            skipped_no_coord += 1
            continue
        mg = int(float(row["mutation_group"] or 0))
        if mg not in groups_raw:
            groups_raw[mg] = {
                "color": norm_color(row["symbol_color"], row["face_color"], len(groups_raw)),
                "words": OrderedDict(),
            }
        if row["symbol_color"]:
            groups_raw[mg]["color"] = norm_color(
                row["symbol_color"], row["face_color"], list(groups_raw.keys()).index(mg)
            )
        wmap = groups_raw[mg]["words"]
        if word not in wmap:
            wmap[word] = {"points": [], "seen": set(), "places": []}
        key = (round(lng, 5), round(lat, 5))
        if key in wmap[word]["seen"]:
            continue
        wmap[word]["seen"].add(key)
        wmap[word]["points"].append([lng, lat])
        wmap[word]["places"].append(
            {
                "region_nm": row["region_nm"] or "",
                "sido": row["sido"] or "",
                "sigungu": row["sigungu"] or row["sigungu_nm"] or "",
                "lng": lng,
                "lat": lat,
            }
        )

    groups = {}
    for mg, gdata in groups_raw.items():
        gkey = f"g{mg}"
        variants = []
        for word, wdata in gdata["words"].items():
            variants.append(
                {
                    "word": word,
                    "n": len(wdata["points"]),
                    "points": wdata["points"],
                    "places": wdata["places"],
                }
            )
        variants.sort(key=lambda v: -v["n"])
        label_word = variants[0]["word"] if variants else f"계열{mg}"
        groups[gkey] = {
            "mutation_group": mg,
            "label": label_word + "계",
            "color": gdata["color"],
            "variants": variants,
        }

    # DB 원본 색 중복 제거 (계열마다 표시 색 유일)
    ensure_unique_group_colors(groups)

    return {
        "source": "dialect_local.db",
        "policy": "raw_db_only_no_synthetic_points",
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "headword_no": str(headword_no),
        "headword": h["headword"] if h else None,
        "meaning": h["meaning"] if h else None,
        "word_class": h["word_class"] if h else None,
        # 해설 탭 원문 — kd_headword.commentary ('.'은 내용 없음을 뜻하는 자리표시자)
        "commentary": norm_commentary(h["commentary"] if h else None),
        "stats": {
            "raw_join_rows": len(rows),
            "skipped_misurvey_or_empty": skipped_misurvey,
            "skipped_no_coord": skipped_no_coord,
            "groups": len(groups),
            "variants": sum(len(g["variants"]) for g in groups.values()),
            "points": sum(len(v["points"]) for g in groups.values() for v in g["variants"]),
        },
        "groups": groups,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--headword-no", action="append", dest="headwords")
    ap.add_argument("--limit", type=int, default=12)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(f"file:{args.db.resolve()}?mode=ro&immutable=1", uri=True)
    conn.row_factory = sqlite3.Row

    targets = list(args.headwords or [])
    if not targets:
        targets = ["50526", "50308"]  # 가을, 가위
        more = conn.execute(
            """
            SELECT cast(headword_no as text) FROM kd_headword
            WHERE map_make='Y' AND use_yn='Y'
            ORDER BY cast(headword_no as int) LIMIT ?
            """,
            (args.limit,),
        ).fetchall()
        for (hn,) in more:
            if hn not in targets:
                targets.append(hn)

    index = []
    for hn in targets[: max(args.limit, len(args.headwords or []))]:
        payload = export_headword(conn, hn)
        path = args.out / f"{hn}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(
            f"wrote {path.name} points={payload['stats']['points']} "
            f"groups={payload['stats']['groups']} variants={payload['stats']['variants']}"
        )
        index.append(
            {
                "headword_no": payload["headword_no"],
                "headword": payload["headword"],
                "points": payload["stats"]["points"],
                "groups": payload["stats"]["groups"],
                "variants": payload["stats"]["variants"],
            }
        )

    (args.out / "index.json").write_text(
        json.dumps(
            {
                "source": "dialect_local.db",
                "policy": "raw_db_only_no_synthetic_points",
                "items": index,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    conn.close()
    print(f"index {len(index)} → {args.out / 'index.json'}")


if __name__ == "__main__":
    main()
