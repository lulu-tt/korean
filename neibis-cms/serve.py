#!/usr/bin/env python3
"""
NEIBIS 프로토타입 서버.
- neibis-cms/ 정적 파일 서빙
- .do → 같은 이름 .html 매핑
- 로컬 dialect_local.db JSON API
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import re
import socketserver
import sqlite3
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
USER_MAP_ROOT = Path(os.environ.get("USER_MAP_ROOT", "/Users/aaa/inseq/korean"))
PORT = int(os.environ.get("PORT", "8877"))

# 로컬 지역어 DB (환경변수로 덮어쓰기 가능)
DB_PATH = Path(
    os.environ.get(
        "DIALECT_DB",
        str(Path.home() / "inseq/korean/dialect_local.db"),
    )
)
# 워크스페이스 상대 경로 fallback
if not DB_PATH.is_file():
    alt = Path("/Users/aaa/inseq/korean/dialect_local.db")
    if alt.is_file():
        DB_PATH = alt

# 구술발화(ELAN .eaf + .wav) 원천 데이터 루트. 하위 폴더(예: JB2320FUT)를 스캔.
ORAL_DATA_ROOT = Path(
    os.environ.get("ORAL_DATA_ROOT", "/Users/aaa/inseq/korean/data")
)


def db_connect():
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"DB not found: {DB_PATH}")
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con


def _fmt_epoch_ms(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    # pure epoch ms
    if s.isdigit() and len(s) >= 12:
        try:
            return datetime.fromtimestamp(int(s) / 1000).strftime("%Y-%m-%d")
        except Exception:
            return None
    # already date-like
    if len(s) >= 8 and s[0:4].isdigit():
        return s[:10].replace("/", "-").replace(".", "-")
    return None


def fmt_reg_dt(reg_dt, upt_dt=None, file_nm=None) -> str:
    """등록일: reg_dt → upt_dt → 파일명(에폭 ms) 순으로 표시."""
    for cand in (reg_dt, upt_dt):
        formatted = _fmt_epoch_ms(cand)
        if formatted:
            return formatted
    if file_nm:
        base = str(file_nm).rsplit(".", 1)[0]
        formatted = _fmt_epoch_ms(base)
        if formatted:
            return formatted
    return "-"


# ── 구술발화(ELAN) 파서 ────────────────────────────────────────────────
# 국립국어원 지역어 구술발화 표준 대주제(항목 블록 코드 → 주제명)
ORAL_TOPIC_MAP = {
    "10100": "조사 마을의 환경과 배경",
    "10200": "일생 의례와 경험",
    "10300": "생업 활동과 경제 생활",
    "10400": "의생활",
    "10500": "식생활",
    "10600": "주생활",
    "10700": "질병과 건강",
    "10800": "세시 풍속과 여가 문화",
    "10900": "언어·자유 발화",
}

# 시도명 → 프런트 select 코드 (oral.html 검색폼과 동일)
SIDO_NM_TO_CD = {
    "서울": "11", "부산": "26", "대구": "27", "인천": "28", "광주": "29",
    "대전": "30", "울산": "31", "세종": "36", "경기": "41", "강원": "42",
    "충청북도": "43", "충북": "43", "충청남도": "44", "충남": "44",
    "전라북도": "45", "전북": "45", "전라남도": "46", "전남": "46",
    "경상북도": "47", "경북": "47", "경상남도": "48", "경남": "48",
    "제주": "50",
}


def _sido_cd_of(region: str) -> str:
    """조사지역 문자열 앞부분에서 시도 코드 추정."""
    r = (region or "").strip()
    for nm, cd in SIDO_NM_TO_CD.items():
        if r.startswith(nm):
            return cd
    return ""


def _ms_to_hms(ms) -> str:
    try:
        total = int(ms) // 1000
    except (TypeError, ValueError):
        return "00:00:00"
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _oral_id_of(eaf_path: Path) -> str:
    """파일 식별자: '_업로드용' 접미사와 확장자를 뗀 베이스명 (예: JB2320FUT10100).

    macOS 파일명은 NFD(자모 분해)로 저장되므로 NFC 정규화 후 접미사 제거.
    """
    stem = unicodedata.normalize("NFC", eaf_path.stem)
    return re.sub(r"_업로드용$", "", stem)


_ORAL_CACHE: dict[str, dict] = {}  # id -> {"mtime": float, "data": {...}}


def parse_eaf(eaf_path: Path) -> dict:
    """ELAN .eaf 파싱 → 메타데이터 + 시간정렬 세그먼트.

    반환:
      {
        oralId, region, sidoCd, year, contentCode, topic,
        informant, sex, birth, durationMs, segmentCount,
        segments: [{seq, speaker, startMs, endMs, form, std, item}],
        tiers: {tierId: annotationCount, ...},
      }
    형태음소전사/표준어대역은 같은 화자 내에서 시작 TIME_SLOT 기준으로 짝지음.
    """
    root = ET.parse(str(eaf_path)).getroot()

    # 1) TIME_SLOT_ID → ms
    tsmap: dict[str, int] = {}
    for ts in root.iter("TIME_SLOT"):
        try:
            tsmap[ts.get("TIME_SLOT_ID")] = int(ts.get("TIME_VALUE") or 0)
        except (TypeError, ValueError):
            tsmap[ts.get("TIME_SLOT_ID")] = 0

    def tier_annotations(tier) -> list[dict]:
        out = []
        for ann in tier.findall(".//ALIGNABLE_ANNOTATION"):
            v = ann.find("ANNOTATION_VALUE")
            out.append({
                "start": tsmap.get(ann.get("TIME_SLOT_REF1"), 0),
                "end": tsmap.get(ann.get("TIME_SLOT_REF2"), 0),
                "text": (v.text or "").strip() if v is not None else "",
            })
        return out

    tiers_by_id: dict[str, list] = {}
    tier_counts: dict[str, int] = {}
    meta_raw = ""
    item_anns: list[dict] = []
    for tier in root.findall("TIER"):
        tid = tier.get("TIER_ID") or ""
        anns = tier_annotations(tier)
        tiers_by_id[tid] = anns
        tier_counts[tid] = len(anns)
        if tid == "메타데이터" and anns:
            meta_raw = anns[0]["text"]
        if tid == "항목번호":
            item_anns = anns

    # 2) 메타데이터 파싱 (key:value / 구분)
    meta: dict[str, str] = {}
    for kv in meta_raw.split("/"):
        if ":" in kv:
            k, val = kv.split(":", 1)
            meta[k.strip()] = val.strip()

    region = meta.get("조사지역", "")
    content_code = meta.get("조사내용", "")
    oral_id = _oral_id_of(eaf_path)
    if not content_code:
        m = re.search(r"(\d{5})", oral_id)
        content_code = m.group(1) if m else ""

    # 3) 화자별 형태음소전사 ↔ 표준어대역 짝짓기
    def pair_speaker(speaker: str) -> list[dict]:
        form_anns = tiers_by_id.get(f"{speaker}(형태음소전사)", [])
        std_anns = tiers_by_id.get(f"{speaker}(표준어대역)", [])
        std_by_start = {a["start"]: a["text"] for a in std_anns}
        segs = []
        for i, a in enumerate(form_anns):
            std = std_by_start.get(a["start"])
            if std is None and i < len(std_anns):  # 시작슬롯 불일치 시 순번 폴백
                std = std_anns[i]["text"]
            segs.append({
                "speaker": speaker,
                "startMs": a["start"],
                "endMs": a["end"],
                "form": a["text"],
                "std": std or "",
            })
        return segs

    segments = pair_speaker("조사자") + pair_speaker("제보자1") + pair_speaker("제보자2")
    segments.sort(key=lambda s: (s["startMs"], 0 if s["speaker"] == "조사자" else 1))

    # 항목번호를 시간구간으로 매핑 (희소)
    def item_at(start_ms: int) -> str:
        cur = ""
        for it in item_anns:
            if it["start"] <= start_ms:
                cur = it["text"]
        return cur

    for i, s in enumerate(segments, 1):
        s["seq"] = i
        s["item"] = item_at(s["startMs"])

    duration_ms = max((tsmap.values() or [0]))

    return {
        "oralId": oral_id,
        "region": region,
        "sidoCd": _sido_cd_of(region),
        "year": meta.get("조사연도", ""),
        "contentCode": content_code,
        "topic": ORAL_TOPIC_MAP.get(content_code, content_code or "-"),
        "informant": meta.get("제보자이름", ""),
        "sex": meta.get("성별", ""),
        "birth": meta.get("출생연도", ""),
        "durationMs": duration_ms,
        "segmentCount": len(segments),
        "segments": segments,
        "tiers": tier_counts,
    }


def _scan_oral_files() -> list[Path]:
    """데이터 루트 하위의 모든 .eaf 경로 (정렬)."""
    if not ORAL_DATA_ROOT.is_dir():
        return []
    return sorted(ORAL_DATA_ROOT.rglob("*.eaf"))


def _load_oral(eaf_path: Path) -> dict:
    """mtime 캐시가 적용된 parse_eaf."""
    oral_id = _oral_id_of(eaf_path)
    try:
        mtime = eaf_path.stat().st_mtime
    except OSError:
        mtime = 0.0
    cached = _ORAL_CACHE.get(oral_id)
    if cached and cached["mtime"] == mtime and cached.get("path") == str(eaf_path):
        return cached["data"]
    data = parse_eaf(eaf_path)
    # WAV 매칭 (같은 폴더, 같은 베이스, .wav)
    wav = eaf_path.with_name(_oral_id_of(eaf_path) + ".wav")
    data["hasMedia"] = wav.is_file()
    try:
        data["relPath"] = str(eaf_path.relative_to(ORAL_DATA_ROOT))
    except ValueError:
        data["relPath"] = eaf_path.name
    _ORAL_CACHE[oral_id] = {"mtime": mtime, "path": str(eaf_path), "data": data}
    return data


# 시도 코드 → region_nm 접두어 (wb_research_region.region_nm 매칭용)
SIDO_CD_TO_PREFIX = {
    "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주",
    "30": "대전", "31": "울산", "36": "세종", "41": "경기", "42": "강원",
    "43": "충청북도", "44": "충청남도", "45": "전라북도", "46": "전라남도",
    "47": "경상북도", "48": "경상남도", "50": "제주",
}


def _sec_to_hms(sec) -> str:
    try:
        total = int(float(sec))
    except (TypeError, ValueError):
        return "00:00:00"
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _parse_trs_line(txt: str) -> dict:
    """.trs 라인 마커 파싱 (첫 발화 턴 기준).
    @=조사자, #n=제보자n / %1=형태음소전사, %2 {..}=표준어대역.
    한 행에 여러 턴이 들어간 복합 라인(2009 .trs 등)은 singleTurn=False로 표시하고
    첫 턴만 파싱해 표시한다(저장 시 손실 방지를 위해 편집 대상에서 제외).
    """
    raw = txt or ""
    t = raw.strip()
    speaker = "조사자"
    m = re.match(r"^\s*(@|#\d*)", t)
    if m:
        tok = m.group(1)
        speaker = "조사자" if tok == "@" else ("제보자" + (tok[1:] or "1"))
        t = t[m.end():].strip()
    # 표준어대역: 첫 번째 %2 {...} (non-greedy → 첫 턴만)
    m2 = re.search(r"%2\s*\{(.*?)\}", t, re.S)
    std = m2.group(1).strip() if m2 else ""
    # 형태음소전사: 첫 %1 부터 첫 %2 직전까지
    m1 = re.search(r"%1\s*(.*?)(?=\s*%2|$)", t, re.S)
    if m1:
        form = m1.group(1).strip()
    else:
        form = (t[: m2.start()].strip() if m2 else t).strip()
    if not form and not std:
        form = raw.strip()
    single_turn = raw.count("%1") == 1
    return {"speaker": speaker, "form": form, "std": std, "singleTurn": single_turn}


def _oral_media_id(audio_filename, trs_file_nm) -> str:
    """미디어 파일 베이스명 (audio_filename 우선, 없으면 파일명에서 확장자 제거)."""
    if audio_filename:
        return str(audio_filename)
    base = str(trs_file_nm or "")
    return base.rsplit(".", 1)[0] if "." in base else base


def api_oral_list(qs: dict) -> dict:
    """구술발화조사자료 목록 — 기존 DB(wb_trs_file_talk) 기반."""
    def q1(key, default=""):
        return (qs.get(key) or [default])[0].strip()

    try:
        page = max(1, int(q1("page", "1")))
    except ValueError:
        page = 1
    try:
        page_size = int(q1("pageSize", "10"))
    except ValueError:
        page_size = 10
    if page_size not in (10, 50, 100, 200, 300):
        page_size = 10

    sido = q1("sido") or q1("sidoCd")
    year = q1("year") or q1("researchYear")
    sex = q1("sex")           # '' | man | woman | wom | 남 | 여
    q = q1("q") or q1("searchValue")

    where: list[str] = []
    params: list = []
    if year:
        where.append("IFNULL(rr.research_year,'') = ?")
        params.append(year)
    if sido:
        pref = SIDO_CD_TO_PREFIX.get(sido)
        if pref:
            where.append("(IFNULL(rr.region_nm,'') LIKE ? OR IFNULL(rr.sigungu_nm,'') LIKE ?)")
            params += [pref + "%", pref + "%"]
    if q:
        like = "%" + q + "%"
        where.append(
            "(IFNULL(f.trs_file_nm,'') LIKE ? OR IFNULL(f.upper_headword,'') LIKE ? "
            "OR IFNULL(f.headword,'') LIKE ? OR IFNULL(rr.region_nm,'') LIKE ?)"
        )
        params += [like, like, like, like]
    sex_code = "0" if sex in ("man", "남") else ("1" if sex in ("woman", "wom", "여") else "")
    if sex_code:
        where.append(
            "EXISTS (SELECT 1 FROM wb_source s WHERE s.research_region_id = f.research_region_id AND s.sex = ?)"
        )
        params.append(sex_code)
    wh = ("WHERE " + " AND ".join(where)) if where else ""
    offset = (page - 1) * page_size

    with db_connect() as con:
        total = con.execute(
            f"""SELECT COUNT(*) FROM wb_trs_file_talk f
                LEFT JOIN wb_research_region rr ON rr.research_region_id = f.research_region_id {wh}""",
            params,
        ).fetchone()[0]
        rows = con.execute(
            f"""
            SELECT f.trs_id, f.trs_file_nm, f.wave_file_nm, f.audio_filename,
                   f.upper_headword, f.headword, f.trs_time, f.use_yn,
                   f.research_degree, f.remark,
                   rr.region_nm, rr.sigungu_nm, rr.research_year
            FROM wb_trs_file_talk f
            LEFT JOIN wb_research_region rr ON rr.research_region_id = f.research_region_id
            {wh}
            ORDER BY CAST(f.trs_id AS INTEGER) DESC
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

        trs_ids = [str(r["trs_id"]) for r in rows if r["trs_id"] is not None]
        durmap: dict[str, float] = {}
        segmap: dict[str, int] = {}
        if trs_ids:
            ph = ",".join("?" * len(trs_ids))
            for nr in con.execute(
                f"""SELECT trs_id, MAX(CAST(end_time AS REAL)) dur, COUNT(*) cnt
                    FROM wb_trs_line_talk
                    WHERE trs_line_se='text' AND trs_id IN ({ph})
                    GROUP BY trs_id""",
                trs_ids,
            ).fetchall():
                durmap[str(nr["trs_id"])] = nr["dur"] or 0
                segmap[str(nr["trs_id"])] = nr["cnt"] or 0

    items = []
    for idx, r in enumerate(rows, start=offset + 1):
        tid = str(r["trs_id"])
        dur_sec = durmap.get(tid, 0)
        audio_id = _oral_media_id(r["audio_filename"], r["trs_file_nm"])
        items.append({
            "no": idx,
            "oralId": tid,
            "year": r["research_year"] or "",
            "region": r["region_nm"] or r["sigungu_nm"] or "-",
            "topic": r["upper_headword"] or r["headword"] or "-",
            "fileName": r["trs_file_nm"] or (audio_id + ".eaf"),
            "duration": _sec_to_hms(dur_sec),
            "durationMs": int((dur_sec or 0) * 1000),
            "segmentCount": segmap.get(tid, 0),
            "researchDegree": r["research_degree"] or "",
            "hasMedia": _find_oral_media(audio_id, "wav") is not None,
            "openYn": (r["use_yn"] or "Y"),
            "audioState": "이상없음",
        })

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "ok": True,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "list": items,
        "db": str(DB_PATH),
    }


def api_oral_detail(qs: dict) -> dict:
    """구술발화 상세 — wb_trs_line_talk 라인을 세그먼트로 반환."""
    trs_id = (qs.get("id") or qs.get("trsId") or qs.get("oralId") or [""])[0].strip()
    if not trs_id:
        return {"ok": False, "message": "id 파라미터가 필요합니다."}

    with db_connect() as con:
        f = con.execute(
            """
            SELECT f.trs_id, f.research_region_id, f.trs_file_nm, f.wave_file_nm,
                   f.audio_filename, f.upper_headword, f.headword, f.use_yn, f.remark,
                   rr.region_nm, rr.sigungu_nm, rr.research_year,
                   rr.researcher, rr.transcriber, rr.mic, rr.recorder
            FROM wb_trs_file_talk f
            LEFT JOIN wb_research_region rr ON rr.research_region_id = f.research_region_id
            WHERE f.trs_id = ?
            """,
            (trs_id,),
        ).fetchone()
        if not f:
            return {"ok": False, "message": f"해당 자료를 찾을 수 없습니다: {trs_id}"}
        src = con.execute(
            """SELECT name, sex, age, birth FROM wb_source
               WHERE research_region_id = ?
               ORDER BY CAST(source_id AS INTEGER) LIMIT 1""",
            (f["research_region_id"],),
        ).fetchone()
        lines = con.execute(
            """SELECT trs_line_id, trs_line_no, trs_line, start_time, end_time
               FROM wb_trs_line_talk
               WHERE trs_id = ? AND trs_line_se = 'text'
               ORDER BY CAST(trs_line_no AS INTEGER)""",
            (trs_id,),
        ).fetchall()

    def to_ms(v):
        try:
            return int(float(v) * 1000)
        except (TypeError, ValueError):
            return 0

    segments = []
    for i, ln in enumerate(lines, 1):
        p = _parse_trs_line(ln["trs_line"])
        segments.append({
            "seq": i,
            "trsLineId": str(ln["trs_line_id"]) if ln["trs_line_id"] is not None else "",
            "speaker": p["speaker"],
            "startMs": to_ms(ln["start_time"]),
            "endMs": to_ms(ln["end_time"]),
            "form": p["form"],
            "std": p["std"],
            "singleTurn": p["singleTurn"],
            "raw": ln["trs_line"] or "",
            "item": ln["trs_line_no"] or "",
        })
    dur_ms = max((s["endMs"] for s in segments), default=0)

    sex_map = {"0": "남", "1": "여"}
    sex_raw = (src["sex"] if src else "") or ""
    audio_id = _oral_media_id(f["audio_filename"], f["trs_file_nm"])
    has_media = _find_oral_media(audio_id, "wav") is not None

    return {
        "ok": True,
        "oralId": str(f["trs_id"]),
        "region": f["region_nm"] or f["sigungu_nm"] or "-",
        "year": f["research_year"] or "",
        "topic": f["upper_headword"] or f["headword"] or "-",
        "informant": (src["name"] if src else "") or "",
        "sex": sex_map.get(sex_raw, sex_raw),
        "age": (src["age"] if src else "") or "",
        "birth": (src["birth"] if src else "") or "",
        "researcher": f["researcher"] or "",
        "transcriber": f["transcriber"] or "",
        "duration": _sec_to_hms(dur_ms / 1000),
        "durationMs": dur_ms,
        "segmentCount": len(segments),
        "hasMedia": has_media,
        "mediaUrl": f"/oral-media/{audio_id}.wav" if has_media else "",
        "fileName": f["trs_file_nm"] or (audio_id + ".eaf"),
        "wavFileName": f["wave_file_nm"] or (audio_id + ".wav"),
        "segments": segments,
    }


def api_oral_meta(qs: dict) -> dict:
    """구술발화 수정폼 메타 — 조사지역/제보자/지역내 파일목록 (wb_research_region 등)."""
    trs_id = (qs.get("id") or qs.get("trsId") or qs.get("oralId") or [""])[0].strip()
    if not trs_id:
        return {"ok": False, "message": "id 파라미터가 필요합니다."}

    with db_connect() as con:
        f = con.execute(
            """SELECT trs_id, research_region_id, upper_headword, headword,
                      use_yn, trs_file_nm, audio_filename
               FROM wb_trs_file_talk WHERE trs_id = ?""",
            (trs_id,),
        ).fetchone()
        if not f:
            return {"ok": False, "message": f"해당 자료를 찾을 수 없습니다: {trs_id}"}
        rrid = f["research_region_id"]
        rr = con.execute(
            "SELECT * FROM wb_research_region WHERE research_region_id = ?", (rrid,)
        ).fetchone()
        sources = con.execute(
            """SELECT se, name, sex, age, birth FROM wb_source
               WHERE research_region_id = ? ORDER BY se, CAST(source_id AS INTEGER)""",
            (rrid,),
        ).fetchall()
        files = con.execute(
            """SELECT trs_id, trs_file_nm, trs_time, wave_file_nm, wave_time, ver, upper_headword
               FROM wb_trs_file_talk WHERE research_region_id = ?
               ORDER BY CAST(trs_id AS INTEGER)""",
            (rrid,),
        ).fetchall()

    sex_map = {"0": "남", "1": "여"}

    def src_dict(s):
        return {
            "name": s["name"] or "",
            "sex": sex_map.get(s["sex"] or "", s["sex"] or ""),
            "age": s["age"] or "",
            "birth": s["birth"] or "",
            "label": f"{s['name'] or ''} ( {sex_map.get(s['sex'] or '', '')} {s['age'] or ''} )".strip(),
        }

    mains = [src_dict(s) for s in sources if (s["se"] in ("0", None, ""))]
    subs = [src_dict(s) for s in sources if (s["se"] not in ("0", None, ""))]

    file_list = []
    for r in files:
        file_list.append({
            "trsId": str(r["trs_id"]),
            "trsFileNm": r["trs_file_nm"] or "",
            "trsTime": _sec_to_hms(r["trs_time"]) if r["trs_time"] else "00:00:00",
            "waveFileNm": r["wave_file_nm"] or "",
            "waveTime": _sec_to_hms(r["wave_time"]) if r["wave_time"] else "00:00:00",
            "ver": r["ver"] or "-",
            "topic": r["upper_headword"] or "",
        })

    region = {}
    if rr:
        keys = rr.keys()
        sigungu = rr["sigungu_nm"] if "sigungu_nm" in keys else ""
        region = {
            "researchRegionId": str(rrid or ""),
            "regionNm": rr["region_nm"] or "",
            "sigunguNm": sigungu or "",
            "researchYear": rr["research_year"] or "",
            "regionRemark": rr["region_remark"] or "",
            "researchPlace": rr["research_place"] or "",
            "firstPlace": rr["first_place"] or "",
            "researcher": rr["researcher"] or "",
            "transcriber": rr["transcriber"] or "",
            "mic": rr["mic"] or "",
            "recorder": rr["recorder"] or "",
            "fileUniqueness": rr["file_uniqueness"] or "",
            "legalRegionCode": rr["legal_region_code"] or "",
            "regionNmYn": rr["region_nm_yn"] or "",
            "startDate": _fmt_epoch_ms(rr["start_date"]) or "",
            "endDate": _fmt_epoch_ms(rr["end_date"]) or "",
        }

    return {
        "ok": True,
        "trsId": str(f["trs_id"]),
        "headword": f["upper_headword"] or f["headword"] or "",
        "useYn": f["use_yn"] or "Y",
        "fileName": f["trs_file_nm"] or "",
        "region": region,
        "mainSources": mains,
        "subSources": subs,
        "files": file_list,
    }


def _date_to_epoch_ms(v) -> str:
    """'YYYY-MM-DD' → epoch ms 문자열. 이미 epoch ms거나 비면 그대로/빈값."""
    s = str(v or "").strip()
    if not s:
        return ""
    if s.isdigit():
        return s
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if not m:
        return s
    try:
        dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return str(int(dt.timestamp() * 1000))
    except ValueError:
        return s


def api_oral_save_meta(body: dict) -> dict:
    """구술발화 수정폼 메타 저장 — wb_trs_file_talk + wb_research_region UPDATE."""
    trs_id = str(body.get("trsId") or "").strip()
    if not trs_id:
        return {"ok": False, "message": "trsId가 필요합니다."}
    region = body.get("region") or {}
    headword = (body.get("headword") or "").strip()
    use_yn = "N" if str(body.get("useYn") or "Y").upper() == "N" else "Y"

    with db_connect() as con:
        f = con.execute(
            "SELECT research_region_id FROM wb_trs_file_talk WHERE trs_id = ?", (trs_id,)
        ).fetchone()
        if not f:
            return {"ok": False, "message": f"해당 자료를 찾을 수 없습니다: {trs_id}"}
        rrid = f["research_region_id"]

        con.execute(
            "UPDATE wb_trs_file_talk SET upper_headword = ?, use_yn = ? WHERE trs_id = ?",
            (headword, use_yn, trs_id),
        )
        if rrid is not None:
            con.execute(
                """UPDATE wb_research_region SET
                       research_year = ?, region_remark = ?, research_place = ?,
                       first_place = ?, researcher = ?, transcriber = ?,
                       mic = ?, recorder = ?, file_uniqueness = ?,
                       start_date = ?, end_date = ?
                   WHERE research_region_id = ?""",
                (
                    (region.get("researchYear") or "").strip(),
                    (region.get("regionRemark") or "").strip(),
                    (region.get("researchPlace") or "").strip(),
                    (region.get("firstPlace") or "").strip(),
                    (region.get("researcher") or "").strip(),
                    (region.get("transcriber") or "").strip(),
                    (region.get("mic") or "").strip(),
                    (region.get("recorder") or "").strip(),
                    (region.get("fileUniqueness") or "").strip(),
                    _date_to_epoch_ms(region.get("startDate")),
                    _date_to_epoch_ms(region.get("endDate")),
                    rrid,
                ),
            )
        con.commit()
    return {"ok": True, "trsId": trs_id, "message": "저장되었습니다."}


def api_oral_raw(qs: dict) -> dict:
    """trs 보기 — 원본 .trs 소스 재구성 (구조 라인 포함 모든 wb_trs_line_talk 행)."""
    trs_id = (qs.get("id") or qs.get("trsId") or qs.get("oralId") or [""])[0].strip()
    if not trs_id:
        return {"ok": False, "message": "id 파라미터가 필요합니다."}
    with db_connect() as con:
        f = con.execute(
            "SELECT trs_file_nm FROM wb_trs_file_talk WHERE trs_id = ?", (trs_id,)
        ).fetchone()
        if not f:
            return {"ok": False, "message": f"해당 자료를 찾을 수 없습니다: {trs_id}"}
        rows = con.execute(
            """SELECT trs_line FROM wb_trs_line_talk
               WHERE trs_id = ? ORDER BY CAST(trs_line_id AS INTEGER)""",
            (trs_id,),
        ).fetchall()
    raw = "\n".join((r["trs_line"] or "") for r in rows)
    return {
        "ok": True,
        "trsId": trs_id,
        "fileName": f["trs_file_nm"] or ("trs " + trs_id),
        "lineCount": len(rows),
        "raw": raw,
    }


def _speaker_to_marker(speaker: str) -> str:
    s = (speaker or "").strip()
    if s == "조사자":
        return "@"
    m = re.match(r"제보자(\d*)", s)
    if m:
        return "#" + (m.group(1) or "1")
    return "@"


def _compose_trs_line(speaker: str, form: str, std: str) -> str:
    """화자+형태음소전사+표준어대역 → .trs 라인 재구성."""
    mark = _speaker_to_marker(speaker)
    form = (form or "").strip()
    std = (std or "").strip()
    line = mark + " %1" + form
    if std:
        line += " %2 {" + std + "}"
    return line


def api_oral_save_lines(body: dict) -> dict:
    """전사 라인 저장 — wb_trs_line_talk.trs_line UPDATE (화자+형태음소+표준어대역 재구성)."""
    trs_id = str(body.get("trsId") or "").strip()
    lines = body.get("lines") or []
    if not trs_id:
        return {"ok": False, "message": "trsId가 필요합니다."}
    if not isinstance(lines, list) or not lines:
        return {"ok": False, "message": "저장할 라인이 없습니다."}

    updated = 0
    skipped = 0
    with db_connect() as con:
        exists = con.execute(
            "SELECT 1 FROM wb_trs_file_talk WHERE trs_id = ?", (trs_id,)
        ).fetchone()
        if not exists:
            return {"ok": False, "message": f"해당 자료를 찾을 수 없습니다: {trs_id}"}
        for ln in lines:
            line_id = str((ln or {}).get("trsLineId") or "").strip()
            if not line_id:
                continue
            cur_row = con.execute(
                "SELECT trs_line FROM wb_trs_line_talk WHERE trs_line_id = ? AND trs_id = ?",
                (line_id, trs_id),
            ).fetchone()
            if not cur_row:
                continue
            # 안전장치: 단일 턴(%1 정확히 1개)만 구조화 저장 허용.
            # 헤더(0개)·복합 멀티턴(2개 이상)은 재구성 시 손실되므로 제외.
            if (cur_row["trs_line"] or "").count("%1") != 1:
                skipped += 1
                continue
            new_text = _compose_trs_line(
                ln.get("speaker", ""), ln.get("form", ""), ln.get("std", "")
            )
            cur = con.execute(
                "UPDATE wb_trs_line_talk SET trs_line = ? WHERE trs_line_id = ? AND trs_id = ?",
                (new_text, line_id, trs_id),
            )
            updated += cur.rowcount
        con.commit()
    msg = f"{updated}개 라인 저장됨"
    if skipped:
        msg += f" (복합 라인 {skipped}개 제외)"
    return {"ok": True, "trsId": trs_id, "updated": updated, "skipped": skipped, "message": msg}


def _find_oral_media(oral_id: str, ext: str) -> Path | None:
    """id + 확장자로 원천 파일 경로 탐색 (.wav/.eaf)."""
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", oral_id):
        return None
    for p in _scan_oral_files():
        if _oral_id_of(p) == oral_id:
            if ext == "eaf":
                return p if p.is_file() else None
            cand = p.with_name(oral_id + "." + ext)
            return cand if cand.is_file() else None
    return None


def api_vocab_detail(qs: dict) -> dict:
    """어휘조사자료 상세 (dialect_region_id 기준 + 동일 dialect_id 지역/용례)."""
    rid = (
        (qs.get("id") or qs.get("dialectRegionId") or qs.get("dialect_region_id") or [""])[0]
        .strip()
    )
    if not rid:
        return {"ok": False, "message": "id(dialect_region_id)가 필요합니다."}

    def sex_label(v) -> str:
        s = str(v or "").strip()
        if s == "0":
            return "남"
        if s == "1":
            return "여"
        return s or ""

    with db_connect() as con:
        row = con.execute(
            """
            SELECT * FROM tb_dialect_region
            WHERE dialect_region_id = ?
            LIMIT 1
            """,
            (rid,),
        ).fetchone()
        if not row:
            return {"ok": False, "message": f"자료를 찾을 수 없습니다. (id={rid})"}

        dialect_id = str(row["dialect_id"] or "").strip()
        new_row = None
        if dialect_id:
            new_row = con.execute(
                """
                SELECT * FROM tb_dialect_new
                WHERE dialect_id = ?
                LIMIT 1
                """,
                (dialect_id,),
            ).fetchone()

        # 동일 dialect_id 의 지역(음성) 블록 전체 (없으면 현재 1건)
        if dialect_id:
            regions = con.execute(
                """
                SELECT * FROM tb_dialect_region
                WHERE dialect_id = ?
                ORDER BY CAST(dialect_region_id AS INTEGER)
                """,
                (dialect_id,),
            ).fetchall()
        else:
            regions = [row]

        examples = []
        if dialect_id:
            examples = con.execute(
                """
                SELECT * FROM tb_dialect_example
                WHERE dialect_id = ?
                ORDER BY CAST(example_id AS INTEGER)
                """,
                (dialect_id,),
            ).fetchall()

    n = dict(new_row) if new_row else {}
    r0 = dict(row)

    # 표제어 계열: dialect_new 우선, 없으면 region
    dlt_tp = (n.get("dlt_tp") or r0.get("dlt_tp") or "") or ""
    std_tp = (n.get("std_tp") or r0.get("std_tp") or "") or ""
    item_nm = (n.get("item_nm") or r0.get("item_nm") or "") or ""
    use_yn = (n.get("use_yn") or r0.get("use_yn") or "") or ""

    region_items = []
    for r in regions:
        rd = dict(r)
        region_items.append(
            {
                "dialectRegionId": rd.get("dialect_region_id") or "",
                "dialectId": rd.get("dialect_id") or "",
                "serialNm": rd.get("serial_nm") or "",
                "source": rd.get("source") or "",
                "sidoCd": rd.get("sido_cd") or "",
                "sidoNm": rd.get("sido_nm") or "",
                "sigunguNm": rd.get("sigungu_nm") or "",
                "basisYear": rd.get("basis_year") or "",
                "sex": rd.get("sex") or "",
                "sexLabel": sex_label(rd.get("sex")),
                "age": rd.get("age") or "",
                "useYn": rd.get("use_yn") or "",
                "infoYn": (rd.get("info_yn") or "").strip(),
                "fileMemo": rd.get("file_memo") or "",
                "etc": rd.get("etc") or "",
                "dltTell": rd.get("dlt_tell") or "",
                "fileOpenYn": "",  # filled below if needed
                "itemNm": rd.get("item_nm") or "",
                "dltTp": rd.get("dlt_tp") or "",
                "stdTp": rd.get("std_tp") or "",
                "researchDegree": rd.get("research_degree") or "",
            }
        )

    # 파일공개: dialect_new 공통 값 (지역 단위 컬럼 없음)
    file_open = (n.get("file_open_yn") or "") or ""
    for it in region_items:
        it["fileOpenYn"] = file_open

    example_items = []
    for e in examples:
        ed = dict(e)
        example_items.append(
            {
                "exampleId": ed.get("example_id") or "",
                "dialectId": ed.get("dialect_id") or "",
                "dltExam": ed.get("dlt_exam") or "",
                "stdExam": ed.get("std_exam") or "",
                "sidoCodeExam": ed.get("sido_code_exam") or "",
                "sigunguCodeExam": ed.get("sigungu_code_exam") or "",
                "sidoNmExam": ed.get("sido_nm_exam") or "",
                "sigunguNmExam": ed.get("sigungu_nm_exam") or "",
                "sourceExam": ed.get("source_exam") or "",
            }
        )

    return {
        "ok": True,
        "dialectRegionId": r0.get("dialect_region_id") or "",
        "dialectId": dialect_id,
        "dltTp": dlt_tp,
        "dltSeg": (n.get("dlt_seg") or "") or "",
        "wordClass": (n.get("word_class") or "") or "",
        "stdTp": std_tp,
        "addMean": (n.get("add_mean") or "") or "",
        "mean": (n.get("mean") or "") or "",
        "itemNm": item_nm,
        "useYn": use_yn,
        "relDlt": (n.get("rel_dlt") or "") or "",
        "reference": (n.get("reference") or "") or "",
        "memo": (n.get("memo") or "") or "",
        "fileOpenYn": file_open,
        "regions": region_items,
        "examples": example_items,
        "db": str(DB_PATH),
    }


def api_vocab_list(qs: dict) -> dict:
    """어휘조사자료 목록 (tb_dialect_region + tb_dialect_new.file_open_yn/mean)."""
    try:
        page = max(1, int((qs.get("page") or ["1"])[0]))
    except ValueError:
        page = 1
    try:
        page_size = int((qs.get("pageSize") or ["10"])[0])
    except ValueError:
        page_size = 10
    if page_size not in (10, 50, 100, 200, 300):
        page_size = 10

    source = (qs.get("source") or [""])[0].strip()  # '' | dlt | sam
    use_yn = (qs.get("useYn") or qs.get("use_yn") or [""])[0].strip().upper()  # '' | Y | N
    sex = (qs.get("sex") or [""])[0].strip()  # '' | man | woman
    degree = (qs.get("degree") or [""])[0].strip()
    start_year = (qs.get("startYear") or [""])[0].strip()
    end_year = (qs.get("endYear") or [""])[0].strip()
    # ages: "2,5,7" (decade codes) or empty = all
    ages_raw = (qs.get("ages") or qs.get("age") or [""])[0].strip()
    # regions: "42:삼척시,41:"  (sido_cd:sigungu_nm, empty sigungu = whole sido)
    regions_raw = (qs.get("regions") or [""])[0].strip()
    # targets JSON: [{"field":"dlt|std|mean","op":"contains|match|startsWith|endsWith","value":"...","join":"in|notin"}]
    targets_raw = (qs.get("targets") or [""])[0].strip()
    # simple free-text fallback (방언형/표준어/일련번호/항목번호)
    q = (qs.get("q") or qs.get("searchValue") or [""])[0].strip()

    where: list[str] = []
    params: list = []
    need_mean_join = False

    if source == "dlt":
        where.append("(r.source LIKE '%지역어%' OR IFNULL(r.source,'') = '')")
    elif source == "sam":
        where.append("r.source LIKE '%우리말샘%'")

    if use_yn in ("Y", "N"):
        where.append("IFNULL(r.use_yn,'') = ?")
        params.append(use_yn)

    if sex == "man":
        where.append("r.sex = '0'")
    elif sex == "woman":
        where.append("r.sex = '1'")

    if degree in ("1", "2"):
        where.append("r.research_degree = ?")
        params.append(degree)

    if start_year.isdigit():
        where.append("CAST(IFNULL(r.basis_year,'0') AS INTEGER) >= ?")
        params.append(int(start_year))
    if end_year.isdigit():
        where.append("CAST(IFNULL(r.basis_year,'0') AS INTEGER) <= ?")
        params.append(int(end_year))

    if ages_raw:
        age_parts = [a.strip() for a in ages_raw.split(",") if a.strip().isdigit()]
        age_ors = []
        for a in age_parts:
            decade = int(a)
            if decade == 9:
                age_ors.append("CAST(IFNULL(r.age,'0') AS INTEGER) >= 90")
            elif decade > 0:
                lo = decade * 10
                hi = lo + 9
                age_ors.append(
                    "(CAST(IFNULL(r.age,'0') AS INTEGER) BETWEEN ? AND ?)"
                )
                params.extend([lo, hi])
        if age_ors:
            where.append("(" + " OR ".join(age_ors) + ")")

    if regions_raw:
        region_ors = []
        for part in regions_raw.split(","):
            part = part.strip()
            if not part:
                continue
            if ":" in part:
                sido_cd, sigungu_nm = part.split(":", 1)
            else:
                sido_cd, sigungu_nm = part, ""
            sido_cd = sido_cd.strip()
            sigungu_nm = sigungu_nm.strip()
            if not sido_cd and not sigungu_nm:
                continue
            bits = []
            if sido_cd:
                bits.append("r.sido_cd = ?")
                params.append(sido_cd)
            if sigungu_nm:
                bits.append("r.sigungu_nm = ?")
                params.append(sigungu_nm)
            if bits:
                region_ors.append("(" + " AND ".join(bits) + ")")
        if region_ors:
            where.append("(" + " OR ".join(region_ors) + ")")

    # multi-target text search
    targets: list = []
    if targets_raw:
        try:
            parsed = json.loads(targets_raw)
            if isinstance(parsed, list):
                targets = parsed
        except Exception:
            targets = []

    field_map = {
        "dlt": "r.dlt_tp",
        "std": "r.std_tp",
        "mean": "IFNULL(n.mean,'')",
        "serial": "r.serial_nm",
        "item": "IFNULL(r.item_nm,'')",
    }

    def _like_clause(col: str, op: str, value: str) -> tuple[str, list]:
        op = (op or "contains").strip()
        if op == "match":
            return f"{col} = ?", [value]
        if op == "startsWith":
            return f"{col} LIKE ?", [value + "%"]
        if op == "endsWith":
            return f"{col} LIKE ?", ["%" + value]
        return f"{col} LIKE ?", ["%" + value + "%"]

    for i, t in enumerate(targets):
        if not isinstance(t, dict):
            continue
        val = str(t.get("value") or "").strip()
        if not val:
            continue
        field = str(t.get("field") or "dlt").strip()
        col = field_map.get(field, "r.dlt_tp")
        if field == "mean":
            need_mean_join = True
        clause, cparams = _like_clause(col, str(t.get("op") or "contains"), val)
        join = str(t.get("join") or "in").strip()  # in = AND, notin = AND NOT
        if join == "notin":
            where.append("NOT (" + clause + ")")
        else:
            where.append(clause)
        params.extend(cparams)

    if q and not targets:
        where.append(
            "(r.dlt_tp LIKE ? OR r.std_tp LIKE ? OR r.serial_nm LIKE ? OR IFNULL(r.item_nm,'') LIKE ?)"
        )
        like = f"%{q}%"
        params.extend([like, like, like, like])

    wh = (" WHERE " + " AND ".join(where)) if where else ""
    # mean 검색 시에만 dialect_new 조인 (dialect_id 1건으로 축약해 중복 방지)
    if need_mean_join:
        join_sql = (
            " LEFT JOIN ("
            "   SELECT dialect_id, MAX(IFNULL(mean,'')) AS mean"
            "   FROM tb_dialect_new GROUP BY dialect_id"
            " ) n ON n.dialect_id = r.dialect_id "
        )
    else:
        join_sql = ""

    with db_connect() as con:
        total = con.execute(
            f"SELECT COUNT(*) FROM tb_dialect_region r{join_sql}{wh}", params
        ).fetchone()[0]
        offset = (page - 1) * page_size
        rows = con.execute(
            f"""
            SELECT r.dialect_region_id, r.dialect_id, r.serial_nm, r.item_nm,
                   r.dlt_tp, r.std_tp, r.use_yn, r.source,
                   r.sido_cd, r.sido_nm, r.sigungu_nm, r.basis_year,
                   r.sex, r.age, r.research_degree
            FROM tb_dialect_region r
            {join_sql}
            {wh}
            ORDER BY CAST(r.dialect_region_id AS INTEGER) DESC
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

        # 페이지 단위 file_open_yn / mean 배치 조회 (JOIN 중복 회피)
        extra: dict[str, dict] = {}
        dialect_ids = [str(r["dialect_id"] or "") for r in rows if r["dialect_id"]]
        dialect_ids = list(dict.fromkeys(dialect_ids))  # unique, order-preserving
        if dialect_ids:
            ph = ",".join("?" * len(dialect_ids))
            for nr in con.execute(
                f"""
                SELECT dialect_id, file_open_yn, mean
                FROM tb_dialect_new
                WHERE dialect_id IN ({ph})
                """,
                dialect_ids,
            ).fetchall():
                did = str(nr["dialect_id"] or "")
                if did and did not in extra:
                    extra[did] = {
                        "file_open_yn": nr["file_open_yn"] or "",
                        "mean": nr["mean"] or "",
                    }

    def sex_label(v) -> str:
        s = str(v or "").strip()
        if s == "0":
            return "남"
        if s == "1":
            return "여"
        return s or "-"

    items = []
    for r in rows:
        did = str(r["dialect_id"] or "")
        ex = extra.get(did) or {}
        items.append(
            {
                "dialectRegionId": r["dialect_region_id"] or "",
                "dialectId": did,
                "serialNm": r["serial_nm"] or "",
                "itemNm": r["item_nm"] or "",
                "dltTp": r["dlt_tp"] or "",
                "stdTp": r["std_tp"] or "",
                "useYn": r["use_yn"] or "",
                "source": r["source"] or "",
                "sidoCd": r["sido_cd"] or "",
                "sidoNm": r["sido_nm"] or "",
                "sigunguNm": r["sigungu_nm"] or "",
                "basisYear": r["basis_year"] or "",
                "sex": r["sex"] or "",
                "sexLabel": sex_label(r["sex"]),
                "age": r["age"] or "",
                "researchDegree": r["research_degree"] or "",
                "fileOpenYn": ex.get("file_open_yn") or "",
                "mean": ex.get("mean") or "",
            }
        )

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "ok": True,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "list": items,
        "db": str(DB_PATH),
    }


def api_symbol_list(qs: dict) -> dict:
    search = (qs.get("searchValue") or [""])[0].strip()
    try:
        page = max(1, int((qs.get("page") or ["1"])[0]))
    except ValueError:
        page = 1
    try:
        page_size = int((qs.get("pageSize") or ["10"])[0])
    except ValueError:
        page_size = 10
    if page_size not in (10, 50, 100, 200, 300):
        page_size = 10

    where = []
    params: list = []
    if search in ("A", "B"):
        where.append("s.symbol_shape = ?")
        params.append(search)
    wh = (" WHERE " + " AND ".join(where)) if where else ""

    with db_connect() as con:
        total = con.execute(
            f"SELECT COUNT(*) FROM tb_symbol s{wh}", params
        ).fetchone()[0]
        offset = (page - 1) * page_size
        rows = con.execute(
            f"""
            SELECT s.symbol_id, s.symbol_nm, s.use_yn, s.reg_dt, s.upt_dt, s.symbol_gb,
                   s.symbol_shape, m.file_nm, m.icon
            FROM tb_symbol s
            LEFT JOIN tb_map_symbol m ON m.map_symbol_id = s.map_symbol_id
            {wh}
            ORDER BY CAST(s.symbol_id AS INTEGER)
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

    items = []
    for r in rows:
        icon = r["icon"] or ""
        # icon 컬럼이 raw base64 문자열
        if icon and not str(icon).startswith("data:"):
            icon_src = f"data:image/png;base64,{icon}" if len(str(icon)) > 20 else ""
        else:
            icon_src = str(icon) if icon else ""
        items.append(
            {
                "symbolId": r["symbol_id"],
                "symbolNm": r["symbol_nm"] or "",
                "useYn": r["use_yn"] or "",
                "regDt": fmt_reg_dt(r["reg_dt"], r["upt_dt"], r["file_nm"]),
                "symbolGb": r["symbol_gb"] or "",
                "symbolShape": r["symbol_shape"] or "",
                "fileNm": r["file_nm"] or "",
                "iconSrc": icon_src,
            }
        )

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "ok": True,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "list": items,
        "db": str(DB_PATH),
    }


# 게시 상태(status) 정의 — kd_headword.use_yn / appro 조합만으로 표현
#   published(게시중): use_yn='Y'
#   pending(승인대기): appro='Y' AND use_yn!='Y'
#   draft(미게시):     use_yn!='Y' AND appro!='Y'
STATUS_SQL = {
    "published": "h.use_yn = 'Y'",
    "pending": "h.appro = 'Y' AND IFNULL(h.use_yn,'') != 'Y'",
    "draft": "IFNULL(h.use_yn,'') != 'Y' AND IFNULL(h.appro,'') != 'Y'",
}


_silhouette_cache: dict = {}


def _tintable_silhouette(icon_b64: str) -> str:
    """icon(검정 잉크+흰 내부 디테일)에서 '어둡고 불투명한' 픽셀만 흰색 실루엣으로 추출.
    흰색 내부 디테일은 구멍(투명)으로 보존 → 모양 구분 유지 + 그룹색으로 틴트 가능."""
    icon = str(icon_b64 or "").strip()
    if not icon:
        return ""
    if icon.startswith("data:"):
        icon = icon.split(",", 1)[-1]
    if icon in _silhouette_cache:
        return _silhouette_cache[icon]
    uri = ""
    try:
        import base64 as _b64, io as _io
        from PIL import Image, ImageChops
        im = Image.open(_io.BytesIO(_b64.b64decode(icon))).convert("RGBA")
        alpha = im.getchannel("A")
        gray = im.convert("L")
        opaque = alpha.point(lambda v: 255 if v > 90 else 0)
        dark = gray.point(lambda v: 255 if v < 140 else 0)
        sil = ImageChops.multiply(opaque, dark)     # 불투명 AND 어두운 곳만
        if sil.getextrema()[1] == 0:                # 밝은 아이콘이면 알파 전체로 폴백
            sil = opaque
        white = Image.new("RGBA", im.size, (255, 255, 255, 255))
        white.putalpha(sil)
        buf = _io.BytesIO()
        white.save(buf, format="PNG")
        uri = "data:image/png;base64," + _b64.b64encode(buf.getvalue()).decode()
    except Exception:
        uri = ""
    _silhouette_cache[icon] = uri
    return uri


def api_symbol_catalog(qs: dict) -> dict:
    """편집기 부호 그리드용 카탈로그 — symbol.do 와 동일 소스(DB tb_map_symbol).
    icon(base64) data URI 를 그대로 제공(마스크 중복 문제 해소 · symbol.do 와 동일 이미지)."""
    with db_connect() as con:
        rows = con.execute(
            """
            SELECT m.map_symbol_id, m.file_nm, m.icon,
                   (SELECT s.symbol_nm FROM tb_symbol s
                     WHERE s.map_symbol_id = m.map_symbol_id
                       AND IFNULL(s.symbol_nm,'') != '' LIMIT 1) AS nm
            FROM tb_map_symbol m
            WHERE IFNULL(m.file_nm,'') != ''
            ORDER BY CAST(m.map_symbol_id AS INTEGER)
            """
        ).fetchall()
    items = [
        {
            "mapSymbolId": r["map_symbol_id"],
            "fileNm": r["file_nm"],
            "iconSrc": _tintable_silhouette(r["icon"]),
            "label": r["nm"] or ("부호 " + str(r["map_symbol_id"])),
        }
        for r in rows
    ]
    return {"ok": True, "total": len(items), "list": items}


def api_headword_list(qs: dict) -> dict:
    """지역어 지도 표제어 목록 (kd_headword)."""
    search_text = (qs.get("searchText") or [""])[0].strip()
    search_type = (qs.get("SearchType") or ["3"])[0].strip() or "3"
    status = (qs.get("status") or [""])[0].strip().lower()  # ''=전체 / pending / published / draft
    try:
        page = max(1, int((qs.get("page") or ["1"])[0]))
    except ValueError:
        page = 1
    try:
        page_size = int((qs.get("pageSize") or ["10"])[0])
    except ValueError:
        page_size = 10
    if page_size not in (10, 50, 100, 200, 300):
        page_size = 10

    where = []
    params: list = []

    # SearchType: 1관리자 2사용자 3전체 4게시승인
    if search_type == "1":
        # 관리자 계열(map*, isskor 등) + 빈 usid
        where.append(
            "(h.usid IS NULL OR trim(h.usid) = '' OR h.usid LIKE 'map%' OR h.usid IN ('isskor','iss','admin','diquest'))"
        )
    elif search_type == "2":
        where.append(
            "(h.usid IS NOT NULL AND trim(h.usid) != '' AND h.usid NOT LIKE 'map%' AND h.usid NOT IN ('isskor','iss','admin','diquest'))"
        )
    elif search_type == "4":
        where.append("(h.appro = 'Y' OR h.use_yn = 'Y')")
    # type 3: no filter

    if search_text:
        where.append("(h.headword LIKE ? OR h.headword_no LIKE ? OR IFNULL(h.meaning,'') LIKE ?)")
        like = f"%{search_text}%"
        params.extend([like, like, like])

    # 구분·검색어까지가 상태 요약(counts)의 모수. 상태 필터는 목록에만 추가 적용.
    base_wh = (" WHERE " + " AND ".join(where)) if where else ""
    base_params = list(params)

    list_where = list(where)
    if status in STATUS_SQL:
        list_where.append("(" + STATUS_SQL[status] + ")")
    wh = (" WHERE " + " AND ".join(list_where)) if list_where else ""

    with db_connect() as con:
        # 상태별 요약 카운트 (현재 구분·검색어 기준)
        crow = con.execute(
            f"""
            SELECT COUNT(*) AS all_cnt,
                   SUM(CASE WHEN {STATUS_SQL['published']} THEN 1 ELSE 0 END) AS published_cnt,
                   SUM(CASE WHEN {STATUS_SQL['pending']}   THEN 1 ELSE 0 END) AS pending_cnt,
                   SUM(CASE WHEN {STATUS_SQL['draft']}     THEN 1 ELSE 0 END) AS draft_cnt
            FROM kd_headword h{base_wh}
            """,
            base_params,
        ).fetchone()
        counts = {
            "all": crow["all_cnt"] or 0,
            "published": crow["published_cnt"] or 0,
            "pending": crow["pending_cnt"] or 0,
            "draft": crow["draft_cnt"] or 0,
        }
        total = con.execute(
            f"SELECT COUNT(*) FROM kd_headword h{wh}", params
        ).fetchone()[0]
        offset = (page - 1) * page_size
        rows = con.execute(
            f"""
            SELECT h.headword_id, h.headword_no, h.headword, h.word_class,
                   h.meaning, h.commentary, h.usid, h.use_yn, h.appro, h.topic_id, h.create_dt,
                   (SELECT COUNT(*) FROM tb_headword_dialect d
                     WHERE d.headword_no = h.headword_no) AS word_count,
                   (SELECT COUNT(DISTINCT d.mutation_group) FROM tb_headword_dialect d
                     WHERE d.headword_no = h.headword_no
                       AND d.mutation_group IS NOT NULL AND trim(d.mutation_group) != '') AS group_count
            FROM kd_headword h
            {wh}
            ORDER BY CAST(h.headword_no AS INTEGER) DESC
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

    def clip(s, n=80):
        s = (s or "").replace("\n", " ").strip()
        return s if len(s) <= n else s[: n - 1] + "…"

    def status_of(use_yn, appro):
        if (use_yn or "") == "Y":
            return "published"
        if (appro or "") == "Y":
            return "pending"
        return "draft"

    items = []
    for r in rows:
        items.append(
            {
                "headwordId": r["headword_id"],
                "headwordNo": r["headword_no"],
                "headword": r["headword"] or "",
                "wordClass": r["word_class"] or "",
                "wordCount": r["word_count"] or 0,
                "groupCount": r["group_count"] or 0,
                "meaning": clip(r["meaning"], 100),
                "meaningFull": r["meaning"] or "",
                "commentary": clip(r["commentary"], 100),
                "commentaryFull": r["commentary"] or "",
                "appro": r["appro"] or "",
                "useYn": r["use_yn"] or "",
                "status": status_of(r["use_yn"], r["appro"]),
                "usid": r["usid"] or "",
                "topicId": r["topic_id"] or "",
                "createDt": _fmt_epoch_ms(r["create_dt"]) or "-",
            }
        )

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "ok": True,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "counts": counts,
        "list": items,
    }


def api_headword_status(body: dict) -> dict:
    """게시 상태 전이 — use_yn·appro 두 필드만 갱신 (단건/일괄 지원).

    action:
      publish   게시(승인)      → use_yn=Y, appro=N
      unpublish 게시 중지        → use_yn=N, appro=N
      pending   승인대기로 되돌림 → use_yn=N, appro=Y
      reject    반려             → use_yn=N, appro=N (별도 반려 컬럼 없음 → 미게시로 수렴)
    """
    action = (body.get("action") or "").strip().lower()
    nos = body.get("headwordNos")
    if not isinstance(nos, list):
        nos = []
    single = str(body.get("headwordNo") or body.get("headword_no") or "").strip()
    if single:
        nos.append(single)
    nos = [str(n).strip() for n in nos if str(n).strip()]
    if not nos:
        return {"ok": False, "message": "대상 표제어(headwordNo)가 없습니다."}

    trans = {
        "publish": ("Y", "N"),
        "unpublish": ("N", "N"),
        "pending": ("N", "Y"),
        "reject": ("N", "N"),
    }
    if action not in trans:
        return {"ok": False, "message": f"알 수 없는 action: {action}"}
    use_yn, appro = trans[action]

    with db_connect() as con:
        ph = ",".join(["?"] * len(nos))
        cur = con.execute(
            f"UPDATE kd_headword SET use_yn=?, appro=? WHERE headword_no IN ({ph})",
            [use_yn, appro] + nos,
        )
        con.commit()
        updated = cur.rowcount

    return {
        "ok": True,
        "message": "상태가 변경되었습니다.",
        "action": action,
        "updated": updated,
        "count": len(nos),
    }


def api_headword_detail(qs: dict) -> dict:
    headword_no = (qs.get("headwordNo") or qs.get("headword_no") or [""])[0].strip()
    headword_id = (qs.get("headwordId") or qs.get("headword_id") or [""])[0].strip()
    if not headword_no and not headword_id:
        return {"ok": False, "message": "headwordNo 또는 headwordId 가 필요합니다."}
    with db_connect() as con:
        if headword_no:
            row = con.execute(
                "SELECT * FROM kd_headword WHERE headword_no = ? LIMIT 1",
                (headword_no,),
            ).fetchone()
        else:
            row = con.execute(
                "SELECT * FROM kd_headword WHERE headword_id = ? LIMIT 1",
                (headword_id,),
            ).fetchone()
    if not row:
        return {"ok": False, "message": "표제어를 찾을 수 없습니다."}
    d = dict(row)
    return {
        "ok": True,
        "data": {
            "headwordId": d.get("headword_id") or "",
            "headwordNo": d.get("headword_no") or "",
            "topicId": d.get("topic_id") or "",
            "headword": d.get("headword") or "",
            "wordClass": d.get("word_class") or "",
            "meaning": d.get("meaning") or "",
            "commentary": d.get("commentary") or "",
            "usid": d.get("usid") or "",
            "useYn": d.get("use_yn") or "N",
            "appro": d.get("appro") or "N",
            "mapMake": d.get("map_make") or "",
            "createDt": _fmt_epoch_ms(d.get("create_dt")) or "-",
        },
    }


def api_headword_search_by_name(qs: dict) -> dict:
    """표제어 blur 시 동일 표제어 품사·의미 자동완성 (원본 headword_search)."""
    headword = (qs.get("headword") or [""])[0].strip()
    if not headword:
        return {"ok": True, "list": []}
    with db_connect() as con:
        rows = con.execute(
            """
            SELECT headword, word_class, meaning, commentary
            FROM kd_headword
            WHERE headword = ?
            ORDER BY CAST(headword_no AS INTEGER) DESC
            LIMIT 5
            """,
            (headword,),
        ).fetchall()
    return {
        "ok": True,
        "list": [
            {
                "headword": r["headword"] or "",
                "wordClass": r["word_class"] or "",
                "meaning": r["meaning"] or "",
                "commentary": r["commentary"] or "",
            }
            for r in rows
        ],
    }


def api_headword_save(body: dict) -> dict:
    """표제어 등록(C) / 수정(M) — 로컬 SQLite."""
    import time

    mode = (body.get("mode") or "C").strip().upper()
    headword = (body.get("headword") or "").strip()
    word_class = (body.get("wordClass") or body.get("word_class") or "").strip()
    meaning = (body.get("meaning") or "").strip()
    commentary = (body.get("commentary") or "").strip()
    use_yn = (body.get("useYn") or body.get("use_yn") or "N").strip() or "N"
    appro = (body.get("appro") or "N").strip() or "N"
    headword_no = str(body.get("headwordNo") or body.get("headword_no") or "").strip()
    headword_id = str(body.get("headwordId") or body.get("headword_id") or "").strip()

    def provided(*keys):
        return any((k in body and body[k] is not None) for k in keys)

    # 삭제(D): 표제어 + 하위 지역어·지역 일괄 삭제
    if mode == "D":
        if not headword_no and not headword_id:
            return {"ok": False, "message": "삭제 대상 headwordNo 가 없습니다."}
        with db_connect() as con:
            if not headword_no and headword_id:
                row = con.execute(
                    "SELECT headword_no FROM kd_headword WHERE headword_id=?", (headword_id,)
                ).fetchone()
                headword_no = row["headword_no"] if row else ""
            if headword_no:
                con.execute("DELETE FROM tb_headword_dialect_region WHERE headword_no=?", (headword_no,))
                con.execute("DELETE FROM tb_headword_dialect WHERE headword_no=?", (headword_no,))
                cur = con.execute("DELETE FROM kd_headword WHERE headword_no=?", (headword_no,))
            else:
                cur = con.execute("DELETE FROM kd_headword WHERE headword_id=?", (headword_id,))
            con.commit()
            if cur.rowcount == 0:
                return {"ok": False, "message": "삭제할 표제어를 찾지 못했습니다."}
        return {"ok": True, "message": "삭제되었습니다.", "mode": "D", "headwordNo": headword_no}

    if not headword:
        return {"ok": False, "message": "표제어를 입력하세요."}
    if len(headword) > 125:
        return {"ok": False, "message": "표제어는 125자 이내로 입력해 주세요."}
    if mode == "C":
        # 등록 시에만 필수 (해설/commentary 는 nullable → 선택)
        if not word_class:
            return {"ok": False, "message": "품사를 선택하세요."}
        if not meaning:
            return {"ok": False, "message": "의미를 입력하세요."}

    # 원본 로직: 서비스 반영(Y)이면 승인요청 N, 승인요청 Y면 서비스 N
    if use_yn == "Y":
        appro = "N"
    if appro == "Y":
        use_yn = "N"

    now_ms = str(int(time.time() * 1000))

    with db_connect() as con:
        if mode == "M":
            if not headword_no and not headword_id:
                return {"ok": False, "message": "수정 대상 headwordNo 가 없습니다."}
            # 부분 업데이트 — 전달된 컬럼만 갱신 (미전송 필드 보존)
            sets, vals = ["headword=?"], [headword]
            if provided("wordClass", "word_class"):
                sets.append("word_class=?"); vals.append(word_class)
            if provided("meaning"):
                sets.append("meaning=?"); vals.append(meaning)
            if provided("commentary"):
                sets.append("commentary=?"); vals.append(commentary)
            if provided("useYn", "use_yn", "appro"):
                sets.append("use_yn=?"); vals.append(use_yn)
                sets.append("appro=?"); vals.append(appro)
            where = "headword_no=?" if headword_no else "headword_id=?"
            vals.append(headword_no or headword_id)
            cur = con.execute(
                "UPDATE kd_headword SET " + ", ".join(sets) + " WHERE " + where, vals
            )
            if cur.rowcount == 0:
                return {"ok": False, "message": "수정할 표제어를 찾지 못했습니다."}
            con.commit()
            return {
                "ok": True,
                "message": "저장되었습니다.",
                "mode": "M",
                "headwordNo": headword_no,
            }

        # Create
        max_id = con.execute(
            "SELECT MAX(CAST(headword_id AS INTEGER)) FROM kd_headword"
        ).fetchone()[0]
        max_no = con.execute(
            "SELECT MAX(CAST(headword_no AS INTEGER)) FROM kd_headword"
        ).fetchone()[0]
        new_id = str(int(max_id or 0) + 1)
        new_no = str(int(max_no or 0) + 1)
        con.execute(
            """
            INSERT INTO kd_headword (
              headword_id, topic_id, headword_no, sub_no, use_no,
              headword, original_word, word_class, meaning, usid,
              use_yn, appro, map_make, commentary, create_dt
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                new_id,
                body.get("topicId") or "",
                new_no,
                body.get("subNo") or "0",
                body.get("useNo") or "",
                headword,
                body.get("originalWord") or "",
                word_class,
                meaning,
                body.get("usid") or "admin",
                use_yn,
                appro,
                body.get("mapMake") or "Y",
                commentary,
                now_ms,
            ),
        )
        con.commit()
        return {
            "ok": True,
            "message": "등록되었습니다.",
            "mode": "C",
            "headwordId": new_id,
            "headwordNo": new_no,
        }


def api_dialect_list(qs: dict) -> dict:
    """표제어별 지역어(어휘) 목록 + 지역 건수."""
    headword_no = (qs.get("headwordNo") or qs.get("headword_no") or [""])[0].strip()
    if not headword_no:
        return {"ok": False, "message": "headwordNo 가 필요합니다."}
    with db_connect() as con:
        rows = con.execute(
            """
            SELECT d.hd_id, d.headword_no, d.word, d.face_color, d.mutation_group,
                   d.mutation_seq, d.map_symbol_id, d.symbol_color, d.create_dt,
                   (SELECT COUNT(*) FROM tb_headword_dialect_region r
                     WHERE r.hd_id = d.hd_id) AS region_count
            FROM tb_headword_dialect d
            WHERE d.headword_no = ?
            ORDER BY
              CASE WHEN d.mutation_group IS NULL OR trim(d.mutation_group)='' THEN 9999
                   ELSE CAST(d.mutation_group AS INTEGER) END,
              CASE WHEN d.mutation_seq IS NULL OR trim(d.mutation_seq)='' THEN 9999
                   ELSE CAST(d.mutation_seq AS INTEGER) END,
              CAST(d.hd_id AS INTEGER)
            """,
            (headword_no,),
        ).fetchall()
        # group colors: first non-empty face_color per group
        items = []
        for r in rows:
            # full=1 이면 전체 지역, 아니면 미리보기 8개
            full = (qs.get("full") or ["0"])[0] in ("1", "true", "True", "yes")
            lim_sql = "" if full else " LIMIT 8"
            # 지도 렌더용 지역 해석 힌트를 kd_region_code 로 보강.
            #   MyMapRegions.search 는 "광주시" 같은 시·군명만 매칭됨(전체명 "경기도 광주시"는 실패).
            #   → mapKey(시·군명) + sido(중복 해소용) 를 함께 내려 클라이언트가 정확히 muni_ 로 해석.
            regs = con.execute(
                f"""
                SELECT r.hdr_id, r.region_nm, r.region_id,
                       (SELECT c.dialect_map_key FROM kd_region_code c WHERE c.region_id = r.region_id LIMIT 1) AS map_key,
                       (SELECT c.sigungu       FROM kd_region_code c WHERE c.region_id = r.region_id LIMIT 1) AS sgg,
                       (SELECT c.sido          FROM kd_region_code c WHERE c.region_id = r.region_id LIMIT 1) AS sido
                FROM tb_headword_dialect_region r
                WHERE r.hd_id = ?
                ORDER BY CAST(r.hdr_id AS INTEGER)
                {lim_sql}
                """,
                (r["hd_id"],),
            ).fetchall()

            def region_name(x):
                nm = (x["region_nm"] or "").strip()
                if nm:
                    return nm
                return (x["map_key"] or "").strip() or (x["sgg"] or "").strip()
            items.append(
                {
                    "hdId": r["hd_id"],
                    "headwordNo": r["headword_no"],
                    "word": r["word"] or "",
                    "faceColor": r["face_color"] or "",
                    "mutationGroup": r["mutation_group"] or "",
                    "mutationSeq": r["mutation_seq"] or "",
                    "mapSymbolId": r["map_symbol_id"] or "",
                    "symbolColor": r["symbol_color"] or "",
                    "regionCount": r["region_count"] or 0,
                    "regions": [
                        {
                            "hdrId": x["hdr_id"] or "",
                            "regionNm": region_name(x),
                            "regionId": x["region_id"] or "",
                            "mapKey": (x["sgg"] or x["map_key"] or "").strip(),
                            "sido": (x["sido"] or "").strip(),
                        }
                        for x in regs
                    ],
                }
            )
    return {"ok": True, "headwordNo": headword_no, "total": len(items), "list": items}


def api_dialect_save(body: dict) -> dict:
    """지역어 등록/수정/삭제."""
    import time

    mode = (body.get("mode") or "C").strip().upper()
    headword_no = str(body.get("headwordNo") or body.get("headword_no") or "").strip()
    hd_id = str(body.get("hdId") or body.get("hd_id") or "").strip()
    word = (body.get("word") or "").strip()
    group = str(body.get("mutationGroup") or body.get("mutation_group") or "").strip()
    seq = str(body.get("mutationSeq") or body.get("mutation_seq") or "").strip()
    map_symbol_id = str(body.get("mapSymbolId") or body.get("map_symbol_id") or "").strip()
    face_color = str(body.get("faceColor") or body.get("face_color") or "").strip()
    symbol_color = str(body.get("symbolColor") or body.get("symbol_color") or "").strip()

    with db_connect() as con:
        if mode == "D":
            if not hd_id:
                return {"ok": False, "message": "삭제 대상 hdId 가 없습니다."}
            con.execute("DELETE FROM tb_headword_dialect_region WHERE hd_id = ?", (hd_id,))
            cur = con.execute("DELETE FROM tb_headword_dialect WHERE hd_id = ?", (hd_id,))
            con.commit()
            if cur.rowcount == 0:
                return {"ok": False, "message": "삭제할 지역어를 찾지 못했습니다."}
            return {"ok": True, "message": "삭제되었습니다.", "mode": "D", "hdId": hd_id}

        if not headword_no:
            return {"ok": False, "message": "headwordNo 가 필요합니다."}
        if not word:
            return {"ok": False, "message": "지역어를 입력하세요."}

        # group sequential rule soft-check on create
        if mode == "C" and group:
            try:
                gnum = int(group)
            except ValueError:
                gnum = 0
            if gnum > 1:
                exists = con.execute(
                    """
                    SELECT 1 FROM tb_headword_dialect
                    WHERE headword_no=? AND mutation_group=?
                    LIMIT 1
                    """,
                    (headword_no, str(gnum - 1)),
                ).fetchone()
                if not exists:
                    # allow if any lower group exists
                    lower = con.execute(
                        """
                        SELECT 1 FROM tb_headword_dialect
                        WHERE headword_no=? AND mutation_group IS NOT NULL
                          AND trim(mutation_group)!=''
                          AND CAST(mutation_group AS INTEGER) < ?
                        LIMIT 1
                        """,
                        (headword_no, gnum),
                    ).fetchone()
                    if not lower and gnum > 1:
                        prev = con.execute(
                            """
                            SELECT 1 FROM tb_headword_dialect
                            WHERE headword_no=? AND mutation_group=?
                            LIMIT 1
                            """,
                            (headword_no, str(gnum - 1)),
                        ).fetchone()
                        if not prev:
                            return {
                                "ok": False,
                                "message": f"{gnum}그룹을 만들려면 먼저 {gnum-1}그룹이 있어야 합니다.",
                            }

        if mode == "M":
            if not hd_id:
                return {"ok": False, "message": "수정 대상 hdId 가 없습니다."}
            cur = con.execute(
                """
                UPDATE tb_headword_dialect
                SET word=?, mutation_group=?, mutation_seq=?, map_symbol_id=?,
                    face_color=?, symbol_color=?
                WHERE hd_id=?
                """,
                (word, group, seq, map_symbol_id, face_color, symbol_color, hd_id),
            )
            if cur.rowcount == 0:
                return {"ok": False, "message": "수정할 지역어를 찾지 못했습니다."}
            con.commit()
            return {"ok": True, "message": "저장되었습니다.", "mode": "M", "hdId": hd_id}

        # Create — auto seq at end of group
        if not seq:
            mx = con.execute(
                """
                SELECT MAX(CAST(mutation_seq AS INTEGER)) FROM tb_headword_dialect
                WHERE headword_no=? AND IFNULL(mutation_group,'')=?
                """,
                (headword_no, group),
            ).fetchone()[0]
            seq = str(int(mx or 0) + 1)
        if not group:
            group = "1"
        max_hd = con.execute(
            "SELECT MAX(CAST(hd_id AS INTEGER)) FROM tb_headword_dialect"
        ).fetchone()[0]
        new_hd = str(int(max_hd or 0) + 1)
        now_ms = str(int(time.time() * 1000))
        con.execute(
            """
            INSERT INTO tb_headword_dialect (
              hd_id, headword_no, word, face_color, mutation_group, mutation_seq,
              map_symbol_id, symbol_color, create_dt
            ) VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                new_hd,
                headword_no,
                word,
                face_color,
                group,
                seq,
                map_symbol_id,
                symbol_color,
                now_ms,
            ),
        )
        con.commit()
        return {
            "ok": True,
            "message": "지역어가 추가되었습니다.",
            "mode": "C",
            "hdId": new_hd,
            "headwordNo": headword_no,
        }


def api_dialect_region_save(body: dict) -> dict:
    """지역 추가/삭제 (간단 텍스트 region_nm)."""
    import time

    mode = (body.get("mode") or "C").strip().upper()
    hd_id = str(body.get("hdId") or body.get("hd_id") or "").strip()
    headword_no = str(body.get("headwordNo") or body.get("headword_no") or "").strip()
    word = (body.get("word") or "").strip()
    region_nm = (body.get("regionNm") or body.get("region_nm") or "").strip()
    hdr_id = str(body.get("hdrId") or body.get("hdr_id") or "").strip()

    with db_connect() as con:
        if mode == "D":
            if not hdr_id:
                return {"ok": False, "message": "삭제 대상 hdrId 가 없습니다."}
            cur = con.execute(
                "DELETE FROM tb_headword_dialect_region WHERE hdr_id = ?", (hdr_id,)
            )
            con.commit()
            if cur.rowcount == 0:
                return {"ok": False, "message": "삭제할 지역을 찾지 못했습니다."}
            return {"ok": True, "message": "지역이 삭제되었습니다.", "mode": "D"}

        if not hd_id or not region_nm:
            return {"ok": False, "message": "hdId 와 지역명이 필요합니다."}
        drow = con.execute(
            "SELECT headword_no, word FROM tb_headword_dialect WHERE hd_id=?",
            (hd_id,),
        ).fetchone()
        if not drow:
            return {"ok": False, "message": "지역어를 찾을 수 없습니다."}
        if not headword_no:
            headword_no = drow["headword_no"]
        if not word:
            word = drow["word"] or ""
        max_hdr = con.execute(
            "SELECT MAX(CAST(hdr_id AS INTEGER)) FROM tb_headword_dialect_region"
        ).fetchone()[0]
        new_hdr = str(int(max_hdr or 0) + 1)
        now_ms = str(int(time.time() * 1000))
        region_id = str(body.get("regionId") or body.get("region_id") or "").strip()
        con.execute(
            """
            INSERT INTO tb_headword_dialect_region (
              hdr_id, headword_no, word, region_id, hd_id, serial_nm, basis_year, region_nm, create_dt
            ) VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (new_hdr, headword_no, word, region_id, hd_id, "", "", region_nm, now_ms),
        )
        con.commit()
        return {
            "ok": True,
            "message": "지역이 추가되었습니다.",
            "mode": "C",
            "hdrId": new_hdr,
            "hdId": hd_id,
        }


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # strip query for file mapping
        path_only = path.split("?", 1)[0]
        fs = super().translate_path(path_only)
        stripped = fs.rstrip()
        if stripped.endswith(".do"):
            html = stripped[:-3] + ".html"
            if os.path.exists(html):
                return html
        return fs

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


    def _serve_file_range(self, fs: Path, ctype: str):
        """정적 파일을 HTTP Range 지원으로 스트리밍 (오디오 탐색용)."""
        try:
            size = fs.stat().st_size
        except OSError:
            self.send_error(404, "Not Found")
            return
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        status = 200
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if m:
                g1, g2 = m.group(1), m.group(2)
                if g1:
                    start = int(g1)
                    end = int(g2) if g2 else size - 1
                elif g2:  # suffix: 마지막 N바이트
                    start = max(0, size - int(g2))
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command == "HEAD":
            return
        with fs.open("rb") as f:
            f.seek(start)
            remaining = length
            chunk = 64 * 1024
            while remaining > 0:
                buf = f.read(min(chunk, remaining))
                if not buf:
                    break
                try:
                    self.wfile.write(buf)
                except (BrokenPipeError, ConnectionResetError):
                    break
                remaining -= len(buf)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            body = {}

        if path in (
            "/mariadb/neibis-api/headword/save",
            "/mariadb/neibis-api/v1/headword/save",
        ):
            try:
                self._send_json(api_headword_save(body))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/headword/status",
            "/mariadb/neibis-api/v1/headword/status",
        ):
            try:
                self._send_json(api_headword_status(body))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/dialect/save",
            "/mariadb/neibis-api/v1/dialect/save",
            "/mariadb/neibis-api/headword/dialect/save",
        ):
            try:
                self._send_json(api_dialect_save(body))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/dialect/region/save",
            "/mariadb/neibis-api/v1/dialect/region/save",
        ):
            try:
                self._send_json(api_dialect_region_save(body))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/save-meta",
            "/mariadb/neibis-api/v1/oral/save-meta",
            "/mariadb/neibis-api/survey/oral/save-meta",
        ):
            try:
                self._send_json(api_oral_save_meta(body))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/save-lines",
            "/mariadb/neibis-api/v1/oral/save-lines",
            "/mariadb/neibis-api/survey/oral/save-lines",
        ):
            try:
                self._send_json(api_oral_save_lines(body))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        self.send_error(404, "Not Found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path in (
            "/mariadb/neibis-api/symbol/list",
            "/mariadb/neibis-api/v1/symbol/list",
        ):
            try:
                self._send_json(api_symbol_list(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/vocab/list",
            "/mariadb/neibis-api/v1/vocab/list",
            "/mariadb/neibis-api/survey/vocab/list",
        ):
            try:
                self._send_json(api_vocab_list(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/vocab/detail",
            "/mariadb/neibis-api/v1/vocab/detail",
            "/mariadb/neibis-api/survey/vocab/detail",
        ):
            try:
                self._send_json(api_vocab_detail(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/symbol/catalog",
            "/mariadb/neibis-api/v1/symbol/catalog",
        ):
            try:
                self._send_json(api_symbol_catalog(qs))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/headword/list",
            "/mariadb/neibis-api/v1/headword/list",
            "/mariadb/neibis-api/map/dialect/list",
        ):
            try:
                self._send_json(api_headword_list(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/headword/detail",
            "/mariadb/neibis-api/v1/headword/detail",
        ):
            try:
                self._send_json(api_headword_detail(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/headword/search",
            "/mariadb/neibis-api/v1/headword/search",
        ):
            try:
                self._send_json(api_headword_search_by_name(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/dialect/list",
            "/mariadb/neibis-api/v1/dialect/list",
            "/mariadb/neibis-api/headword/dialect/list",
        ):
            try:
                self._send_json(api_dialect_list(qs))
            except FileNotFoundError as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/list",
            "/mariadb/neibis-api/v1/oral/list",
            "/mariadb/neibis-api/survey/oral/list",
        ):
            try:
                self._send_json(api_oral_list(qs))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/detail",
            "/mariadb/neibis-api/v1/oral/detail",
            "/mariadb/neibis-api/survey/oral/detail",
        ):
            try:
                self._send_json(api_oral_detail(qs))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/meta",
            "/mariadb/neibis-api/v1/oral/meta",
            "/mariadb/neibis-api/survey/oral/meta",
        ):
            try:
                self._send_json(api_oral_meta(qs))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        if path in (
            "/mariadb/neibis-api/oral/raw",
            "/mariadb/neibis-api/v1/oral/raw",
            "/mariadb/neibis-api/survey/oral/raw",
        ):
            try:
                self._send_json(api_oral_raw(qs))
            except Exception as e:
                self._send_json({"ok": False, "message": str(e)}, 500)
            return

        # 구술발화 원천 미디어/전사파일 서빙 (Range 지원)
        if path.startswith("/oral-media/"):
            name = urllib.parse.unquote(path[len("/oral-media/"):])
            m = re.fullmatch(r"([A-Za-z0-9_\-]+)\.(wav|eaf)", name)
            if not m:
                self.send_error(404, "Not Found")
                return
            fs = _find_oral_media(m.group(1), m.group(2))
            if fs is None:
                self.send_error(404, "Not Found")
                return
            ctype = "audio/wav" if m.group(2) == "wav" else "application/xml; charset=utf-8"
            self._serve_file_range(fs, ctype)
            return

        if path == "/mariadb/neibis-api/health":
            self._send_json(
                {
                    "ok": True,
                    "db": str(DB_PATH),
                    "dbExists": DB_PATH.is_file(),
                }
            )
            return

        # 사용자 지도 자산 (OpenLayers 데이터·스크립트·symbol_mask)
        if path.startswith("/user-map/"):
            rel = path[len("/user-map/"):]
            # path traversal guard
            rel = rel.lstrip("/").replace("\\", "/")
            if ".." in rel.split("/"):
                self.send_error(403, "Forbidden")
                return
            fs = (USER_MAP_ROOT / rel).resolve()
            try:
                fs.relative_to(USER_MAP_ROOT.resolve())
            except ValueError:
                self.send_error(403, "Forbidden")
                return
            if not fs.is_file():
                self.send_error(404, "Not Found")
                return
            ctype = "application/octet-stream"
            if fs.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            elif fs.suffix == ".css":
                ctype = "text/css; charset=utf-8"
            elif fs.suffix == ".png":
                ctype = "image/png"
            elif fs.suffix == ".json":
                ctype = "application/json; charset=utf-8"
            data = fs.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(data)
            return

        return super().do_GET()

    def end_headers(self):
        # 개발 편의: 정적 파일(HTML/JS/CSS)에도 no-cache 부여 (이미 Cache-Control 지정된 응답은 유지)
        try:
            buf = getattr(self, "_headers_buffer", None) or []
            if not any(b"cache-control" in line.lower() for line in buf):
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        except Exception:
            pass
        super().end_headers()

    def log_message(self, fmt, *args):
        # quieter default
        sys_stderr = getattr(self, "", None)
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    with Server(("", PORT), handler) as httpd:
        print(f"NEIBIS prototype serving {ROOT} at http://localhost:{PORT}")
        print(f"DB: {DB_PATH} (exists={DB_PATH.is_file()})")
        print("API: GET /mariadb/neibis-api/symbol/list?searchValue=&page=1&pageSize=10")
        print("API: GET /mariadb/neibis-api/vocab/list?page=1&pageSize=10")
        httpd.serve_forever()
