"""구술발화 조사 자료 API — wb_trs_file_talk / wb_trs_line_talk 기반.

server.py 의 do_GET 에서 handle_oral(...) 로 위임한다.
검색어 탭(발화 턴 단위)과 원문 검색 탭(파일 단위)을 하나로 합친 응답을 만든다.
"""
import json
import os
import re
import sqlite3

BASE = "/Users/aaa/inseq/korean"
DB_PATH = os.path.join(BASE, "dialect_local.db")
AUDIO_DIRS = [os.path.join(BASE, "data", "uploads"), os.path.join(BASE, "data")]

# 화자 마커: @ / @1 / # / #2 … 뒤에 공백이나 %가 와야 한다.
# (#10207 같은 주제 코드가 화자로 오인되는 것을 막는다)
MARK = re.compile(r'[@#][1-9]?(?=[\s%])')


def parse_turns(raw):
    """trs_line 한 행 → 발화 턴 리스트.
    한 행(=Sync 구간)에 턴이 여러 개 들어 있는 복합 행이 약 7% 있다."""
    s = (raw or '').strip()
    starts = [m.start() for m in MARK.finditer(s)]
    if not starts:
        return []
    out = []
    for i, p in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(s)
        seg = s[p:end]
        m = MARK.match(seg)
        tok = m.group(0)
        speaker = ('조사자' if tok[0] == '@' else '제보자') + (tok[1:] or '')
        body = seg[m.end():].strip()
        m2 = re.search(r'%2\s*\{(.*?)\}', body, re.S)
        std = m2.group(1).strip() if m2 else ''
        m1 = re.search(r'%1(.*?)(?=%2|$)', body, re.S)
        morph = m1.group(1).strip() if m1 else ''
        pre = (body[:m1.start()] if m1 else (body[:m2.start()] if m2 else body)).strip()
        pre = re.sub(r'^[\d.]+\s+', '', pre)
        pre = re.sub(r'\}\s*\d+\s*$', '', pre).strip()
        if not morph and not std:
            morph, pre = pre, ''
        out.append({"speaker": speaker, "phoneme": pre, "morph": morph, "std": std})
    return out


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def find_audio(audio_filename, wave_file_nm):
    """audio_filename → 디스크의 wav 경로. 없으면 None."""
    base = str(audio_filename or '').strip()
    if not base:
        base = re.sub(r'\.(eaf|trs)$', '', str(wave_file_nm or ''), flags=re.I)
    base = re.sub(r'\.wav$', '', base, flags=re.I)
    if not base:
        return None
    for d in AUDIO_DIRS:
        p = os.path.join(d, base + ".wav")
        if os.path.exists(p):
            return p
    root = os.path.join(BASE, "data")
    if os.path.isdir(root):
        for sub in os.listdir(root):
            p = os.path.join(root, sub, base + ".wav")
            if os.path.exists(p):
                return p
    return None


def _sex(v):
    """wb_source.sex 코드. 파일명 규약(…FUT/…MUT)과 337건 전수 대조 결과 0=여성, 1=남성."""
    s = str(v or '').strip()
    if s in ('0', '여', '여성'):
        return '여성'
    if s in ('1', '남', '남성'):
        return '남성'
    return s



# 2차 조사(.eaf) 파일명 규약:  CN 22 70 F UT 105 00
#   [2]지역  [2]조사연도  [2]연령대(20/50/70)  [1]성별(F/M)
# 정답셋 332건 전수 검증: 성별 예외 0건, 연령대 20→19~29 / 50→50~58 / 70→70~84.
# 60대는 50 코드로, 80~90대는 70 코드로 들어간다(단일후보 사례로 확인).
_FNAME = re.compile(r'^[A-Z]{2}(\d{2})(\d{2})([FM])UT')


def _band(age):
    """제보자 나이 → 파일명 연령대 코드."""
    try:
        a = int(str(age).strip())
    except (TypeError, ValueError):
        return None
    if a < 40:
        return '20'
    if a < 70:
        return '50'
    return '70'


def _informant(c, trs_id):
    """제보자 조회.
    A) wb_source.research_region_id 직접 매칭 (1차 조사·2023년 2차)
    B) 없으면 wb_source.residence = wb_research_region.region_nm (2022년 2차)
       2022년 제보자 56명은 research_region_id 가 비어 있어 거주지 문자열로만 연결된다.
       지역명이 같은 조사세션이 여럿이라 파일명의 성별·연령대 코드로 좁힌다."""
    row = c.execute("SELECT trs_file_nm FROM wb_trs_file_talk WHERE trs_id = ?", (trs_id,)).fetchone()
    fname = (row['trs_file_nm'] if row else '') or ''

    rows = c.execute(
        """SELECT s.source_id, s.name, s.sex, s.age
           FROM wb_source s
           JOIN wb_trs_file_talk f ON f.research_region_id = s.research_region_id
           WHERE f.trs_id = ?
           ORDER BY CAST(s.source_id AS INTEGER)""", (trs_id,)).fetchall()
    via = 'region_id'
    if not rows:
        rows = c.execute(
            """SELECT s.source_id, s.name, s.sex, s.age
               FROM wb_source s
               JOIN wb_research_region r ON r.region_nm = s.residence
               JOIN wb_trs_file_talk f ON f.research_region_id = r.research_region_id
               WHERE f.trs_id = ? AND IFNULL(s.residence,'') <> ''
               ORDER BY CAST(s.source_id AS INTEGER)""", (trs_id,)).fetchall()
        via = 'residence'
        m = _FNAME.match(fname)
        if m and len(rows) > 1:
            want_band, want_sex = m.group(2), ('0' if m.group(3) == 'F' else '1')
            narrowed = [r for r in rows
                        if str(r['sex']) == want_sex and _band(r['age']) == want_band]
            if narrowed:
                rows, via = narrowed, 'residence+filename'
    if not rows:
        return {"sex": "", "age": "", "candidates": 0, "via": ""}
    r = rows[0]
    # 성명은 개인정보라 응답에 담지 않는다(성별·나이만 노출).
    return {"sex": _sex(r["sex"]), "age": r["age"] or "",
            "candidates": len(rows), "via": via}


def search(qs):
    kw = (qs.get('q') or [''])[0].strip()
    sido = (qs.get('sido') or [''])[0].strip()
    page = max(1, int((qs.get('page') or ['1'])[0] or 1))
    size = min(50, int((qs.get('size') or ['10'])[0] or 10))
    scope = (qs.get('scope') or ['all'])[0]   # all | morph | std | phoneme
    scope = {'dialect': 'morph', 'standard': 'std'}.get(scope, scope)

    c = _conn()
    where = ["f.use_yn = 'Y'", "l.trs_line_se = 'text'"]
    params = []
    if kw:
        where.append("l.trs_line LIKE ?")
        params.append('%' + kw + '%')
    if sido:
        where.append("substr(IFNULL(r.legal_region_code,''),1,2) = ?")
        params.append(sido)

    sql = f"""
        SELECT l.trs_id, l.trs_line_no, l.trs_line, l.start_time, l.end_time,
               f.upper_headword, f.headword, f.trs_file_nm, f.audio_filename, f.wave_file_nm,
               r.region_nm, r.research_year, r.sigungu_code
        FROM wb_trs_line_talk l
        JOIN wb_trs_file_talk f ON f.trs_id = l.trs_id
        LEFT JOIN wb_research_region r ON r.research_region_id = f.research_region_id
        WHERE {' AND '.join(where)}
        ORDER BY CAST(l.trs_id AS INTEGER), CAST(l.trs_line_no AS INTEGER)
    """
    rows = c.execute(sql, params).fetchall()

    src = {}
    for r in c.execute("SELECT research_region_id, sex, age FROM wb_source"):
        src.setdefault(r['research_region_id'], (r['sex'], r['age']))

    files = {}
    order = []
    total_turns = 0
    for r in rows:
        turns = parse_turns(r['trs_line'])
        hit = []
        for t in turns:
            fields = {'morph': [t['morph']], 'std': [t['std']], 'phoneme': [t['phoneme']],
                      'all': [t['morph'], t['std'], t['phoneme']]}[scope]
            if kw and not any(kw in (x or '') for x in fields):
                continue
            hit.append(t)
        if kw and not hit:
            continue
        if not kw:
            hit = turns
        tid = r['trs_id']
        if tid not in files:
            order.append(tid)
            reg = (r['region_nm'] or '').split()
            sx, ag = src.get(r['trs_id'], (None, None))
            files[tid] = {
                "trsId": tid,
                "topicUpper": r['upper_headword'] or '',
                "topic": r['headword'] or '',
                "region": ' '.join(reg[:2]) if reg else '',
                "regionFull": r['region_nm'] or '',
                "year": r['research_year'] or '',
                "fileName": r['trs_file_nm'] or '',
                "audio": bool(find_audio(r['audio_filename'], r['wave_file_nm'])),
                "sentences": [],
            }
        for t in hit:
            total_turns += 1
            files[tid]["sentences"].append({
                "lineNo": r['trs_line_no'],
                "speaker": t['speaker'],
                "phoneme": t['phoneme'],
                "morph": t['morph'],
                "std": t['std'],
                "start": float(r['start_time'] or 0),
                "end": float(r['end_time'] or 0),
                "shared": len(turns) > 1,   # 같은 시간 구간을 여러 턴이 공유
            })

    # 제보자 정보 보강
    for tid, f in files.items():
        inf = _informant(c, tid)
        f['sex'] = inf['sex']
        f['age'] = inf['age']
        f['informantCandidates'] = inf['candidates']
    c.close()

    total_files = len(order)
    start = (page - 1) * size
    data = [files[t] for t in order[start:start + size]]
    return {
        "status": "success",
        "keyword": kw,
        "totalTurns": total_turns,
        "totalFiles": total_files,
        "page": page,
        "size": size,
        "data": data,
    }


def detail(qs):
    tid = (qs.get('trsId') or [''])[0].strip()
    c = _conn()
    f = c.execute("""SELECT f.*, r.region_nm, r.research_year
                     FROM wb_trs_file_talk f
                     LEFT JOIN wb_research_region r ON r.research_region_id = f.research_region_id
                     WHERE f.trs_id = ?""", (tid,)).fetchone()
    if not f:
        c.close()
        return {"status": "error", "message": "not found"}
    out = []
    # trs_line_no 는 파일 내에서 중복·역전이 있어(1,615건 중 493건) 시간순으로 정렬한다.
    for r in c.execute("""SELECT trs_line_no, trs_line, start_time, end_time
                          FROM wb_trs_line_talk WHERE trs_id = ? AND trs_line_se = 'text'
                          ORDER BY CAST(start_time AS REAL), CAST(trs_line_no AS INTEGER)""", (tid,)):
        turns = parse_turns(r['trs_line'])
        for t in turns:
            out.append({**t, "lineNo": r['trs_line_no'],
                        "start": float(r['start_time'] or 0),
                        "end": float(r['end_time'] or 0),
                        "shared": len(turns) > 1})
    inf = _informant(c, tid)
    c.close()
    return {"status": "success",
            "trsId": tid,
            "sex": inf['sex'],
            "age": inf['age'],
            "informantCandidates": inf['candidates'],
            "informantVia": inf['via'],
            "fileName": f['trs_file_nm'],
            "region": f['region_nm'],
            "year": f['research_year'],
            "topicUpper": f['upper_headword'],
            "topic": f['headword'],
            "audio": bool(find_audio(f['audio_filename'], f['wave_file_nm'])),
            "lines": out}


def audio_path(trs_id):
    c = _conn()
    f = c.execute("SELECT audio_filename, wave_file_nm FROM wb_trs_file_talk WHERE trs_id = ?",
                  (trs_id,)).fetchone()
    c.close()
    if not f:
        return None
    return find_audio(f['audio_filename'], f['wave_file_nm'])
