#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dialect_local.db → 메인 '오늘의 지역어' 단어·퀴즈 JSON (실데이터 only)

  python3 scripts/export_today_quiz.py
  python3 scripts/export_today_quiz.py --verbose

퀴즈 카드는 tb_quiz 30문항을 **원문항 그대로** 내보낸다. 보기 순서도,
정답 위치도 출제자가 정한 그대로 둔다(정답 위치는 ①~⑤에 4·4·3·4·5로
이미 고르게 퍼져 있어 섞을 이유가 없다). 보기마다 붙은 해설(quiz_dtl_exp)도
함께 실어서 '정답 확인하기'를 누르면 왜 그런지 보여줄 수 있게 한다.

  객관식 20 (quiz_tp 0001) — 보기 5개, 세 갈래
      negative  "다음 중 '부추'를 가리키는 방언형이 아닌 것은?"      10문항
      positive  "다음 중 '(먹는)김'을 가리키는 방언형은?"             5문항
      reverse   "'자부름'이라는 경상도 지역의 방언은 무엇을…"         5문항
  주관식 10 (quiz_tp 0002) — 보기 없음. 지역이 시군 단위라 가장 정밀하다.
      "경남 산청 지역에서는 '시렁'을 뭐라고 부를까요?" → 실겅

단어 카드는 지도(data/processed/map/index.json)에 있는 표준어만 만든다.
지도가 없으면 '지도 보기'를 걸 수 없어 카드가 반쪽이 되기 때문이다.

DB에 없는 값은 만들지 않는다. 뜻풀이 문장·예문·품사는 tb_quiz 에 없으므로
내보내지 않는다(표준어 단어 자체는 있으므로 std 로 그대로 싣는다).

단어 카드는 원문항에 그 형태로 들어 있지 않아서 보기 해설에서 뽑는다.
부정형 보기 4개는 quiz_dtl_exp 가 곧 지역이고, 함정 보기 해설은
"'부루'는 충남…에서 '상추'를 가리키는 말" 꼴이라 그 자체가 한 쌍이 된다.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "dialect_local.db"
OUT = ROOT / "data" / "processed" / "today_quiz.json"
MAP_INDEX = ROOT / "data" / "processed" / "map" / "index.json"

SOURCE = "한국정신문화연구원 『한국방언자료집』(1987-1995)"
PILL_MAX = 10              # region-pill 에 들어갈 지역 표기 길이

Q = "[‘’“”']"          # DB에 ‘ ’ “ ” ' 가 섞여 있다

# "다음 중 ‘부추’를 가리키는 방언형이 아닌 것은?" / "…방언형은?"
RE_STD_IN_Q = re.compile(rf"다음\s*중\s*{Q}\s*(.+?)\s*{Q}\s*[을를]?\s*가리키는")
# "‘고자리’라는 …" / "‘자부름’이라는 …"  — 받침 있는 말 뒤에는 조사가 '이라는'이 된다
RE_REVERSE = re.compile(rf"^\s*{Q}(.+?){Q}\s*이?라는\s*(.+?)\s*의\s*방언은")
# "경남 산청 지역에서는 ‘시렁’을 뭐라고 부를까요?"
RE_SUBJECTIVE = re.compile(rf"^\s*(.+?)\s*에서는\s*{Q}(.+?){Q}")

# "‘부루’는 충남 일부 지역과 경북 북부 지역에서 ‘상추’를 가리키는 말"
RE_EXP_FULL = re.compile(
    rf"^\s*{Q}(.+?){Q}\s*[는은]\s*(.+?)에서\s*{Q}(.+?){Q}\s*[을를]\s*(?:가리키는|일컫는)"
)
# "전남 지역에서 ‘김(seaweed)’을 가리키는 말"  (앞에 방언형이 안 붙은 꼴)
RE_EXP_REGION = re.compile(
    rf"^\s*(.+?)에서\s*{Q}(.+?){Q}\s*[을를]\s*(?:가리키는|일컫는)"
)

PAREN_RE = re.compile(r"\s*[(（][^)）]*[)）]\s*")     # 김(seaweed) → 김
REGION_TAIL_RE = re.compile(r"\s*(?:지역|전역)$")     # "경상도 지역" → "경상도"
REGION_SPLIT_RE = re.compile(r"지역|전역|,|[와과]\s")   # 첫 마디만 남길 때 쓰는 구분자


def clean_word(s: str) -> str:
    """보기·정답 문자열에서 괄호 주석과 따옴표를 걷어낸다."""
    s = re.sub(Q, "", (s or "").strip())
    return PAREN_RE.sub("", s).strip()


def short_region(s: str) -> str:
    """region-pill 에 들어갈 짧은 지역 표기. 원문은 regionNote 로 따로 남긴다.

    해설의 지역 기술은 "경기 북부 지역과 강원", "충남 일부 지역과 경북 북부 지역"
    처럼 여러 마디가 이어진다. 칩 한 줄에 넣어야 하므로 첫 마디만 남긴다.
    """
    s = (s or "").strip()
    if not s:
        return ""
    head = REGION_SPLIT_RE.split(re.sub(Q, "", s))[0].strip()
    head = re.sub(r"\s*일부$", "", head).strip().rstrip("·, ")
    if len(head) <= PILL_MAX:
        return head
    return head.split("·")[0].split(" ")[0]          # 그래도 길면 첫 시도명만


def load_map_index() -> dict[str, str]:
    """지도에 export 된 표제어 → 표제어번호. 지도가 없는 단어는 '지도 보기'를 걸지 않는다."""
    if not MAP_INDEX.exists():
        return {}
    items = json.loads(MAP_INDEX.read_text(encoding="utf-8")).get("items", [])
    return {
        unicodedata.normalize("NFC", (i.get("headword") or "").strip()): str(i.get("headword_no"))
        for i in items
        if i.get("headword") and i.get("headword_no")
    }


def interleave(items: list, key) -> list:
    """같은 부류가 연달아 나오지 않게 섞는다.

    화면은 풀에서 연속으로 8장을 잘라 쓰므로, quizId 순으로 두면
    같은 표제어의 방언형('멍'·'멍지')이나 같은 유형의 문항이 한 화면에 몰린다.
    부류별로 줄을 세워 한 개씩 번갈아 뽑는다.
    """
    buckets: dict = {}
    for it in items:
        buckets.setdefault(key(it), []).append(it)
    order = sorted(buckets, key=lambda k: (-len(buckets[k]), str(k)))
    out = []
    while any(buckets[k] for k in order):
        for k in order:
            if buckets[k]:
                out.append(buckets[k].pop(0))
    return out


# ──────────────────────────────────────────────────────────────
# 1) 퀴즈 카드 — 원문항 그대로
# ──────────────────────────────────────────────────────────────
def build_quizzes(conn: sqlite3.Connection, verbose: bool) -> tuple[list[dict], dict]:
    details = defaultdict(list)
    for r in conn.execute(
        "SELECT quiz_id, quiz_dtl_nm, quiz_dtl_exp FROM tb_quiz_detail"
        " ORDER BY CAST(quiz_dtl_id AS INTEGER)"
    ):
        details[r["quiz_id"]].append(r)

    out: list[dict] = []
    stats = defaultdict(int)

    for q in conn.execute(
        "SELECT quiz_id, quiz_tp, quiz_question, quiz_answer, quiz_origin, use_yn"
        " FROM tb_quiz ORDER BY CAST(quiz_id AS INTEGER)"
    ):
        if (q["use_yn"] or "Y") != "Y":
            stats["skipped_unused"] += 1
            continue

        qid = int(q["quiz_id"])
        question = (q["quiz_question"] or "").strip()
        answer = clean_word(q["quiz_answer"])
        origin = (q["quiz_origin"] or "").strip() or SOURCE

        # ── 주관식: 보기가 없다. 생각해 보고 답을 여는 카드.
        if q["quiz_tp"] == "0002":
            m = RE_SUBJECTIVE.search(question)
            if not m:
                stats["skipped_parse"] += 1
                if verbose:
                    print(f"  [skip] 주관식 파싱 실패 quiz_id={qid}: {question}")
                continue
            region = m.group(1).strip()
            out.append(
                {
                    "quizId": qid,
                    "type": "short",
                    "kind": "subjective",
                    "focus": clean_word(m.group(2)),        # 카드 큰 글씨 = 표준어
                    "question": question,
                    "answer": answer,
                    "region": short_region(region),
                    "regionNote": region,
                    "source": origin,
                }
            )
            stats["subjective"] += 1
            continue

        # ── 객관식: 보기·정답 위치를 원문 그대로 보존
        rows = details.get(q["quiz_id"], [])
        names = [clean_word(r["quiz_dtl_nm"]) for r in rows]
        if len(names) < 2:
            stats["skipped_no_options"] += 1
            continue
        if answer not in names:
            stats["skipped_answer_mismatch"] += 1
            if verbose:
                print(f"  [skip] 정답이 보기에 없음 quiz_id={qid}: {answer!r} / {names}")
            continue

        rev = RE_REVERSE.search(question)
        if rev:
            kind, focus = "reverse", clean_word(rev.group(1))   # 큰 글씨 = 방언형
            region = rev.group(2).strip()
        else:
            kind = "negative" if "아닌 것" in question else "positive"
            std = RE_STD_IN_Q.search(question)
            focus = clean_word(std.group(1)) if std else ""     # 큰 글씨 = 표준어
            region = ""
            if not focus:
                stats["skipped_parse"] += 1
                if verbose:
                    print(f"  [skip] 표제어 파싱 실패 quiz_id={qid}: {question}")
                continue

        out.append(
            {
                "quizId": qid,
                "type": "choice",
                "kind": kind,
                "focus": focus,
                "question": question,
                "opts": [
                    {"t": n, "exp": (r["quiz_dtl_exp"] or "").strip()}
                    for n, r in zip(names, rows)
                ],
                "ans": names.index(answer),
                "region": short_region(region),
                "regionNote": region,
                "source": origin,
            }
        )
        stats[kind] += 1

    return interleave(out, lambda q: q["kind"]), dict(stats)


# ──────────────────────────────────────────────────────────────
# 2) 단어 카드 — 보기 해설에서 (방언형 · 표준어 · 지역) 뽑기
# ──────────────────────────────────────────────────────────────
def build_words(conn: sqlite3.Connection, map_index: dict, verbose: bool) -> tuple[list[dict], dict]:
    quizzes = {
        r["quiz_id"]: r
        for r in conn.execute(
            "SELECT quiz_id, quiz_tp, quiz_question, quiz_answer FROM tb_quiz"
        )
    }
    details = defaultdict(list)
    for r in conn.execute(
        "SELECT quiz_id, quiz_dtl_nm, quiz_dtl_exp FROM tb_quiz_detail"
        " ORDER BY CAST(quiz_dtl_id AS INTEGER)"
    ):
        details[r["quiz_id"]].append(r)

    triples: list[dict] = []
    stats = defaultdict(int)

    def add(word, std, region, quiz_id, kind):
        word, std = clean_word(word), clean_word(std)
        region = (region or "").strip()
        if not word or not std or word == std:
            stats["skipped_empty"] += 1
            return
        triples.append(
            {
                "word": word,
                "std": std,
                "region": short_region(region),
                "regionNote": region,
                "quizId": int(quiz_id),
                "kind": kind,
            }
        )
        stats[kind] += 1

    for qid, q in quizzes.items():
        question = (q["quiz_question"] or "").strip()
        answer = clean_word(q["quiz_answer"])

        if q["quiz_tp"] == "0002":
            if m := RE_SUBJECTIVE.search(question):
                add(answer, m.group(2), m.group(1), qid, "subjective")
            continue

        if m := RE_REVERSE.search(question):
            add(m.group(1), answer, m.group(2), qid, "reverse")
            continue

        std_m = RE_STD_IN_Q.search(question)
        std_in_q = clean_word(std_m.group(1)) if std_m else ""
        negative = "아닌 것" in question

        for row in details.get(qid, []):
            name = clean_word(row["quiz_dtl_nm"])
            exp = (row["quiz_dtl_exp"] or "").strip()
            is_answer = name == answer

            if em := RE_EXP_FULL.search(exp):        # 방언형·지역·표준어를 다 갖춘 해설
                add(em.group(1), em.group(3), em.group(2), qid, "exp_full")
                continue
            if em := RE_EXP_REGION.search(exp):      # 지역·표준어만 갖춘 해설
                add(name, em.group(2), em.group(1), qid, "exp_region")
                continue

            # 해설이 순수 지역 문자열이거나 비어 있는 경우
            if negative and is_answer:
                continue                             # 함정인데 근거가 없으면 버린다
            if not negative and not is_answer:
                continue                             # 긍정형 오답은 근거가 없다
            if std_in_q:
                add(name, std_in_q, exp, qid, "plain")

    # (방언형, 표준어) 중복 제거 — 지역 설명이 긴 쪽을 남긴다
    best: dict[tuple[str, str], dict] = {}
    for t in triples:
        key = (t["word"], t["std"])
        if key not in best or len(t["regionNote"]) > len(best[key]["regionNote"]):
            best[key] = t
    stats["deduped"] = len(triples) - len(best)

    forms_of = defaultdict(list)
    for t in best.values():
        forms_of[t["std"]].append(t)

    words = []
    for t in sorted(best.values(), key=lambda x: (x["quizId"], x["word"])):
        # 지도에 export 된 표준어만 카드로 만든다.
        # 지도가 없으면 '지도 보기'를 걸 수 없고, 카드가 반쪽이 된다.
        headword_no = map_index.get(unicodedata.normalize("NFC", t["std"]), "")
        if not headword_no:
            stats["skipped_no_map"] += 1
            continue
        related = [{"w": t["std"], "r": "표준어"}]
        for o in forms_of[t["std"]]:
            if o["word"] != t["word"] and len(related) < 4:
                related.append({"w": o["word"], "r": o["region"] or "지역어"})
        words.append(
            {
                "word": t["word"],
                "region": t["region"],
                "regionNote": t["regionNote"],
                "std": t["std"],          # 문장으로 짓지 않고 DB 값 그대로 둔다
                "headwordNo": headword_no,
                "related": related,
                "source": SOURCE,
                "quizId": t["quizId"],
            }
        )
    return interleave(words, lambda w: w["std"]), dict(stats)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    quizzes, qstats = build_quizzes(conn, args.verbose)
    words, wstats = build_words(conn, load_map_index(), args.verbose)

    payload = {
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
        "stats": {
            "quizzes": len(quizzes),
            "words": len(words),
            "words_all_mapped": all(w.get("headwordNo") for w in words),
            "quiz_breakdown": qstats,
            "word_breakdown": wstats,
        },
        "quizzes": quizzes,
        "words": words,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"wrote {args.out.relative_to(ROOT)}")
    print(f"  퀴즈 카드 {len(quizzes)}  ·  단어 카드 {len(words)} (모두 지도 연결됨)")
    print(f"  지도 없어 제외한 방언형 {wstats.get('skipped_no_map', 0)}")
    print(f"  퀴즈 내역 {qstats}")
    print(f"  단어 내역 {wstats}")


if __name__ == "__main__":
    main()
