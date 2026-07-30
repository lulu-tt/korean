#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dialect_local.db → 지역어 지도 '예문' 탭용 JSON (실데이터 only)

  python3 scripts/export_examples_headword.py                    # 지도 export가 있는 표제어 전체
  python3 scripts/export_examples_headword.py --headword-no 50526
  python3 scripts/export_examples_headword.py --headword-no 50526 --verbose

두 경로에서 예문을 모은다.

  1) 구술발화 (narrative)  : wb_trs_line 중 headword_no가 구술발화 질문번호(10xxx)인 행.
     방언형 단위 태깅이 없으므로 텍스트 검색으로 찾고, 정밀도는
     "전사부에는 방언형이 있고 { } 대역부에는 표준어 표제어가 있다"는
     조건으로 확보한다. (예: '돌아가실 때까지' → 대역부에 '가을' 없음 → 제외)

  2) 어휘조사 응답 (survey) : pt_question에서 표제어 이름으로 조사 항목번호를 찾아
     wb_trs_line.headword_no 로 정확히 매칭. 단답형이지만 태깅이 정확하다.

DB에 인덱스가 없으므로 wb_trs_line 전체 스캔은 1회로 끝내고
부가 정보(지점·주제·제보자·음성)는 작은 테이블을 메모리에 올려서 붙인다.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "dialect_local.db"
OUT = ROOT / "data" / "processed" / "examples"
MAP_OUT = ROOT / "data" / "processed" / "map"

MAX_EXAMPLES = 24          # 표제어당 최종 예문 수
MAX_PER_REGION = 2         # 한 조사 지점에서 가져올 최대 예문 수
MAX_SURVEY = 40            # 어휘조사 응답 수
MIN_LEN = 8                # 너무 짧은 발화 제외(전사부 기준)
MAX_LEN = 320              # 너무 긴 발화 제외

JAMO_RE = re.compile(r"[ㄱ-ㅎㅏ-ㅣ]+$")   # 끝에 붙은 낱자(가을ㄱ)
PUA_RE = re.compile("[\\ue000-\\uf8ff]")             # DB에 섞인 사용자 정의 영역 문자
YEAR_RE = re.compile(r"(20\d{2})$")                       # kd_headword '벽2018'
LEAD_MARK_RE = re.compile(r"^\s*(?:=\s*\d+|[#@*&]|\s)+")  # 화자·파일 마커
GLOSS_JUNK_RE = re.compile(r"^[\d\s#@*&]+")               # {111111122222예, ...}, {#고구마…}
ALT_PAIR_RE = re.compile(r"%\d+.*?%\d+", re.S)            # %1 재전사 %2 (같은 발화의 다른 전사층)
ALT_TAIL_RE = re.compile(r"%\d+.*$", re.S)                # 닫히지 않은 %n
SPACE_RE = re.compile(r"\s+")
BRACE_RE = re.compile(r"^(?P<d>.*?)\{(?P<g>.*)\}[^{}]*$", re.S)
PAREN_RE = re.compile(r"^(?P<d>.*?)\((?P<g>.*)\)[^()]*$", re.S)

SEX_LABEL = {"0": "여성", "1": "남성"}

# 대역부에서 표제어가 '단어로' 쓰였는지 판정할 때 허용하는 조사·어미.
# 단순 부분문자열 검사로는 '벌'이 '벌써', '형'이 '에이형/형편'에 걸린다.
PARTICLES = sorted(
    (
        "에서부터 으로부터 에게서 한테서 이라고 이라는 에서는 에서도 으로는 으로도 으로만"
        " 에게는 한테는 라고 라는 에서 에게 한테 으로 부터 까지 처럼 보다 만큼 조차 마다"
        " 밖에 이나 에는 에도 에만 이랑 이며 이라 이고 이다"
        " 은 는 이 가 을 를 에 의 도 만 로 과 와 랑 나 고 라 서 야 여 뿐 씩 들 께 엔 엘 다"
    ).split(),
    key=len,
    reverse=True,
)


def is_hangul(ch: str) -> bool:
    return "가" <= ch <= "힣"


def word_occurs(text: str, word: str) -> bool:
    """text 안에서 word가 '한 단어로' 쓰였는가.

    어절 첫머리에 오고, 뒤에는 조사(연쇄 허용)나 비한글만 붙어야 한다.
    '가을에/가을로는/가을이다' → 참, '벌써/형편/에이형이나' → 거짓.
    """
    if not word:
        return False
    start = 0
    while True:
        i = text.find(word, start)
        if i < 0:
            return False
        start = i + 1
        if i > 0 and is_hangul(text[i - 1]):
            continue                                  # 어절 중간 (에이'형'이나)
        rest = text[i + len(word) :]
        if not rest or not is_hangul(rest[0]):
            return True                               # 뒤에 공백·마침표 등
        for p in PARTICLES:                           # 긴 조사부터
            if rest.startswith(p):
                return True                           # 조사가 붙었으면 단어로 본다
        # 조사가 아닌 음절이 붙음 → 다른 단어 (벌'써', 형'님', 가을'걷이')


# ── 문자열 유틸 ──────────────────────────────────────────────────────────
def strip_final_consonant(s: str) -> str:
    """'가을' → '가으'. 전사에서 연음된 형태(가으레·가으리)를 잡기 위한 검색 키."""
    if not s:
        return s
    code = ord(s[-1]) - 0xAC00
    if 0 <= code < 11172:
        jong = code % 28
        if jong:
            return s[:-1] + chr(0xAC00 + (code - jong))
    return s


def clean_headword(h: str | None) -> str:
    h = (h or "").strip()
    return YEAR_RE.sub("", h).strip()


def build_search_keys(words: list[str], std: str) -> tuple[list[str], dict[str, str], list[str]]:
    """방언형 목록 → 전사부 검색 키.

    반환: (검색 키 목록, 검색 키 → 대표 방언형, 원형 방언형 목록)
    '가을' 같은 원형뿐 아니라 종성을 뗀 '가으'도 키로 쓴다. 전사에서는
    조사가 연음되어 '가으레·가으리'로 적히기 때문이다. 대신 표시용 라벨은
    항상 원형 방언형으로 되돌린다.
    """
    min_len = 1 if len(std) <= 1 else 2
    variants: set[str] = set()
    for w in words:
        w = PUA_RE.sub("", (w or "")).strip()
        if not w or w == "미조사":
            continue
        w = JAMO_RE.sub("", w).strip()
        if len(w) < min_len:
            continue
        variants.add(w)

    canon: dict[str, str] = {v: v for v in variants}
    for v in sorted(variants):
        if len(v) < 2:
            continue
        sf = strip_final_consonant(v)
        if len(sf) >= 2:
            canon.setdefault(sf, v)
    # 1음절 표제어(벌·형·겨…)는 동형이의어가 많다. 표준어형과 같은 1음절 키로
    # 검색하면 '벌써·벌이·처벌'까지 걸리므로, 판별력 있는 2음절 이상 방언형만 쓴다.
    if len(std) <= 1:
        canon = {k: v for k, v in canon.items() if len(k) >= 2}

    # 긴 키부터 매칭해야 어느 방언형인지 정확히 라벨링된다
    keys = sorted(canon, key=lambda k: (-len(k), k))
    return keys, canon, sorted(variants)


def split_utterances(line: str) -> list[str]:
    """한 행에 여러 발화가 줄바꿈으로 들어있는 경우가 있다."""
    return [u for u in (x.strip() for x in re.split(r"[\r\n]+", line or "")) if u]


def parse_utterance(u: str) -> tuple[str, str, str] | None:
    """발화 → (화자, 전사부, 표준어 대역). 대역이 없으면 None."""
    speaker = ""
    head = u.lstrip()
    if head.startswith("#"):
        speaker = "제보자"
    elif head.startswith("@"):
        speaker = "조사자"

    m = BRACE_RE.match(u) or PAREN_RE.match(u)
    if not m:
        return None
    dialect = clean_transcript(LEAD_MARK_RE.sub("", m.group("d")))
    gloss = clean_transcript(GLOSS_JUNK_RE.sub("", m.group("g")))
    if not dialect or not gloss:
        return None
    return speaker, dialect, gloss


def clean_transcript(s: str) -> str:
    """같은 발화를 두 층으로 전사한 %1…%2 블록을 걷어내고 공백을 정리한다."""
    s = ALT_PAIR_RE.sub(" ", s or "")
    s = ALT_TAIL_RE.sub(" ", s)
    return SPACE_RE.sub(" ", s).strip()


# ── 부가 정보 조회용 룩업 ────────────────────────────────────────────────
class Lookups:
    def __init__(self, conn: sqlite3.Connection):
        self.trs_file = {
            r["trs_id"]: r
            for r in conn.execute(
                """SELECT trs_id, research_region_id, trs_file_nm, audio_filename, use_yn
                   FROM wb_trs_file"""
            )
        }
        self.region = {
            r["research_region_id"]: r
            for r in conn.execute(
                """SELECT research_region_id, region_nm, research_year, sigungu_code,
                          sigungu_nm, legal_region_code, researcher
                   FROM wb_research_region"""
            )
        }
        # 시군구 코드 → 지도 region_id / 경위도 (legal_region_code 조인은 커버리지가 낮다)
        self.sigungu = {
            r["sigungu_code"]: r
            for r in conn.execute(
                """SELECT sigungu_code, MAX(region_id) AS region_id,
                          MAX(lng) AS lng, MAX(lat) AS lat, MAX(sido) AS sido,
                          MAX(sigungu) AS sigungu
                   FROM kd_region_code
                   WHERE region_id IS NOT NULL AND region_id<>''
                   GROUP BY sigungu_code"""
            )
        }
        # 주제보자: wb_region_id_source 브리지를 거쳐야 커버리지가 94%대로 올라간다
        src = {
            r["source_id"]: r
            for r in conn.execute(
                "SELECT source_id, name, sex, age, job, education FROM wb_source"
            )
        }
        self.informant: dict[str, sqlite3.Row] = {}
        for b in conn.execute(
            "SELECT research_region_id, se, source_id FROM wb_region_id_source ORDER BY se"
        ):
            rid = b["research_region_id"]
            if rid in self.informant:
                continue
            s = src.get(b["source_id"])
            if s:
                self.informant[rid] = s

        self.question = {
            r["headword_no"]: r["meaning"]
            for r in conn.execute("SELECT headword_no, meaning FROM kd_headword_no")
        }
        self.topics = []
        for t in conn.execute(
            """SELECT topic, sub_topic, headword_start_no, headword_end_no
               FROM kd_topic WHERE last_level='1'"""
        ):
            try:
                lo = int(t["headword_start_no"])
                hi = int(t["headword_end_no"])
            except (TypeError, ValueError):
                continue
            self.topics.append((lo, hi, t["topic"] or "", t["sub_topic"] or ""))

    def topic_of(self, headword_no: str) -> tuple[str, str]:
        try:
            n = int(headword_no)
        except (TypeError, ValueError):
            return "", ""
        for lo, hi, topic, sub in self.topics:
            if lo <= n <= hi:
                return topic, sub
        return "", ""

    def context(self, trs_id: str) -> dict:
        f = self.trs_file.get(trs_id)
        if not f:
            return {}
        rid = f["research_region_id"]
        rr = self.region.get(rid)
        sg = self.sigungu.get(rr["sigungu_code"]) if rr else None
        inf = self.informant.get(rid)
        out = {
            "research_region_id": rid,
            "region": (rr["region_nm"] if rr else "") or "",
            "year": (rr["research_year"] if rr else "") or "",
            "sido": (sg["sido"] if sg else "") or "",
            "sigungu": (sg["sigungu"] if sg else "") or ((rr["sigungu_nm"] if rr else "") or ""),
            "region_id": (sg["region_id"] if sg else "") or "",
            "audio": f["audio_filename"] or "",
            "trs_file": f["trs_file_nm"] or "",
        }
        if sg and sg["lng"] and sg["lat"]:
            try:
                out["lng"] = float(sg["lng"])
                out["lat"] = float(sg["lat"])
            except (TypeError, ValueError):
                pass
        if inf:
            out["informant"] = {
                "sex": SEX_LABEL.get(str(inf["sex"] or ""), ""),
                "age": str(inf["age"] or ""),
                "job": inf["job"] or "",
            }
        return out


# ── 예문 수집 ────────────────────────────────────────────────────────────
def fetch_narrative(
    conn, keys: list[str], canon: dict[str, str], std: str, lk: Lookups, verbose=False
) -> tuple[list[dict], dict]:
    """구술발화 전사에서 예문 추출."""
    if not keys:
        return [], {"scanned": 0, "matched": 0}

    like = " OR ".join(["l.trs_line LIKE ?"] * len(keys))
    sql = f"""
        SELECT l.trs_id, l.trs_line_no, l.headword_no, l.start_time, l.end_time, l.trs_line
        FROM wb_trs_line l
        WHERE l.trs_line_se='text'
          AND l.headword_no LIKE '10%'
          AND l.trs_line LIKE '%' || ? || '%'
          AND ({like})
    """
    params = [std] + [f"%{k}%" for k in keys]
    rows = conn.execute(sql, params).fetchall()

    cands: list[dict] = []
    for row in rows:
        ctx = lk.context(row["trs_id"])
        if not ctx:
            continue
        topic, sub = lk.topic_of(row["headword_no"])
        for u in split_utterances(row["trs_line"]):
            parsed = parse_utterance(u)
            if not parsed:
                continue
            speaker, dialect, gloss = parsed
            if not word_occurs(gloss, std):      # 대역부에 표준어가 '단어로' 있어야 함
                continue
            hit = next((k for k in keys if k in dialect), None)
            if not hit:
                continue
            if not (MIN_LEN <= len(dialect) <= MAX_LEN):
                continue
            variant = canon.get(hit, hit)
            cands.append(
                {
                    "route": "narrative",
                    "variant": variant,
                    "matched_key": hit,
                    "is_standard": variant == std,
                    "speaker": speaker,
                    "dialect": dialect,
                    "standard": gloss,
                    "topic": topic,
                    "subtopic": sub,
                    "question": lk.question.get(row["headword_no"], "") or "",
                    "trs_id": row["trs_id"],
                    "line_no": row["trs_line_no"],
                    "start": row["start_time"] or "",
                    "end": row["end_time"] or "",
                    **ctx,
                }
            )
    if verbose:
        print(f"    narrative: rows={len(rows)} utterances_kept={len(cands)}")
    return cands, {"scanned": len(rows), "matched": len(cands)}


def fetch_survey(conn, std: str, lk: Lookups, verbose=False) -> tuple[list[dict], dict]:
    """어휘조사 응답 전사 — pt_question 항목번호로 정확 매칭."""
    items = [
        r["headword_no"]
        for r in conn.execute(
            "SELECT DISTINCT headword_no FROM pt_question WHERE headword=?", (std,)
        )
        if r["headword_no"]
    ]
    if not items:
        return [], {"items": [], "matched": 0}

    ph = ",".join("?" * len(items))
    rows = conn.execute(
        f"""SELECT trs_id, trs_line_no, headword_no, headword_se, start_time, end_time, trs_line
            FROM wb_trs_line
            WHERE trs_line_se='text' AND headword_no IN ({ph})""",
        items,
    ).fetchall()

    out: list[dict] = []
    for row in rows:
        ctx = lk.context(row["trs_id"])
        if not ctx:
            continue
        text = LEAD_MARK_RE.sub("", (row["trs_line"] or "").strip()).strip()
        if not text:
            continue
        parsed = parse_utterance(row["trs_line"] or "")
        out.append(
            {
                "route": "survey",
                "item_no": row["headword_se"] or row["headword_no"],
                "dialect": parsed[1] if parsed else text,
                "standard": parsed[2] if parsed else "",
                "trs_id": row["trs_id"],
                "line_no": row["trs_line_no"],
                "start": row["start_time"] or "",
                "end": row["end_time"] or "",
                **ctx,
            }
        )
    if verbose:
        print(f"    survey: items={items} rows={len(rows)} kept={len(out)}")
    return out, {"items": items, "matched": len(out)}


def pick_examples(cands: list[dict]) -> list[dict]:
    """중복 제거 → 방언형·지점을 고르게 섞어서 선별.

    한 지점의 전사 파일에 같은 방언형이 수십 번 나오므로, 그대로 자르면
    한 지점 예문만 쌓인다. 방언형별로 나눠 라운드로빈하면서 지점 쿼터를
    적용한다.
    """
    seen_text: set[str] = set()
    uniq: list[dict] = []
    for c in cands:
        key = SPACE_RE.sub("", c["dialect"])
        if key in seen_text:
            continue
        seen_text.add(key)
        uniq.append(c)

    # 방언형별 후보 — 제보자 발화 · 읽기 좋은 길이 우선
    buckets: dict[str, list[dict]] = defaultdict(list)
    for c in uniq:
        buckets[c["variant"]].append(c)
    for items in buckets.values():
        items.sort(
            key=lambda c: (
                0 if c["speaker"] == "제보자" else 1,
                0 if 30 <= len(c["dialect"]) <= 200 else 1,
                -len(c["dialect"]),
            )
        )

    # 비표준 방언형 먼저, 그다음 후보가 많은 순
    order = sorted(
        buckets,
        key=lambda v: (0 if not buckets[v][0]["is_standard"] else 1, -len(buckets[v]), v),
    )

    picked: list[dict] = []
    chosen: set[int] = set()
    for region_cap in (MAX_PER_REGION, MAX_PER_REGION * 2, MAX_EXAMPLES):
        if len(picked) >= MAX_EXAMPLES:
            break
        per_region: defaultdict[str, int] = defaultdict(int)
        for c in picked:
            per_region[c.get("research_region_id") or ""] += 1
        cursor = {v: 0 for v in order}
        progressed = True
        while progressed and len(picked) < MAX_EXAMPLES:
            progressed = False
            for v in order:
                if len(picked) >= MAX_EXAMPLES:
                    break
                items = buckets[v]
                i = cursor[v]
                while i < len(items):
                    c = items[i]
                    i += 1
                    rid = c.get("research_region_id") or ""
                    if id(c) in chosen or per_region[rid] >= region_cap:
                        continue
                    per_region[rid] += 1
                    chosen.add(id(c))
                    picked.append(c)
                    progressed = True
                    break
                cursor[v] = i

    picked.sort(key=lambda c: (c.get("sido", ""), c.get("region", ""), c["variant"]))
    for i, c in enumerate(picked, 1):
        c["no"] = i
    return picked


def export_headword(conn, headword_no: str, lk: Lookups, verbose=False) -> dict:
    h = conn.execute(
        """SELECT headword_no, headword, meaning, word_class
           FROM kd_headword WHERE cast(headword_no as text)=? LIMIT 1""",
        (str(headword_no),),
    ).fetchone()
    std = clean_headword(h["headword"] if h else "")

    words = [
        r["word"]
        for r in conn.execute(
            "SELECT DISTINCT word FROM tb_headword_dialect WHERE cast(headword_no as text)=?",
            (str(headword_no),),
        )
    ]
    keys, canon, variants = build_search_keys(words, std) if std else ([], {}, [])

    cands, nstat = (
        fetch_narrative(conn, keys, canon, std, lk, verbose)
        if std
        else ([], {"scanned": 0, "matched": 0})
    )
    examples = pick_examples(cands)
    survey, sstat = fetch_survey(conn, std, lk, verbose) if std else ([], {"items": [], "matched": 0})
    survey = survey[:MAX_SURVEY]

    return {
        "source": "dialect_local.db",
        "policy": "raw_db_only_gloss_verified_search",
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "headword_no": str(headword_no),
        "headword": std,
        "word_class": (h["word_class"] if h else "") or "",
        "search_keys": keys,
        "variants": variants,
        "survey_items": sstat["items"],
        "stats": {
            "narrative_rows_scanned": nstat["scanned"],
            "narrative_utterances_matched": nstat["matched"],
            "examples": len(examples),
            "regions": len({e.get("research_region_id") for e in examples}),
            "survey": len(survey),
        },
        "examples": examples,
        "survey": survey,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--headword-no", action="append", dest="headwords")
    ap.add_argument("--limit", type=int, default=0, help="0=제한 없음")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(f"file:{args.db.resolve()}?mode=ro&immutable=1", uri=True)
    conn.row_factory = sqlite3.Row

    targets = list(args.headwords or [])
    if not targets:
        # 지도 JSON이 이미 있는 표제어만 (예문 탭은 지도와 같은 표제어에서만 열린다)
        targets = sorted(p.stem for p in MAP_OUT.glob("*.json") if p.stem != "index")
    if args.limit:
        targets = targets[: args.limit]

    print(f"loading lookups… (targets={len(targets)})")
    lk = Lookups(conn)

    index = []
    for hn in targets:
        payload = export_headword(conn, hn, lk, args.verbose)
        (args.out / f"{hn}.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )
        st = payload["stats"]
        print(
            f"wrote {hn}.json  headword={payload['headword'] or '-'} "
            f"examples={st['examples']} regions={st['regions']} survey={st['survey']} "
            f"(scanned={st['narrative_rows_scanned']})"
        )
        index.append(
            {
                "headword_no": payload["headword_no"],
                "headword": payload["headword"],
                "examples": st["examples"],
                "survey": st["survey"],
            }
        )

    (args.out / "index.json").write_text(
        json.dumps(
            {
                "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "count": len(index),
                "items": index,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"wrote index.json ({len(index)} headwords)")


if __name__ == "__main__":
    main()
