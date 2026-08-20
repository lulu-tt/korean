"""어휘 조사 자료 API — tb_dialect_region 기반.

운영(/dialect/search/coopsearch)과 같은 데이터 모델을 쓴다.
  · 목록 1건 = (지역어형 dlt_tp × 표준어 std_tp) 고유 조합
  · 상세     = 그 조합이 조사된 지점별 행 (시도/시군/조사연도/제보자/음성)
  · 음성     = 운영 파일 서버의 /dialect/map/coop/mp3/{basis_year}/{serial_nm}.mp3
"""
import os
import sqlite3

BASE = "/Users/aaa/inseq/korean"
DB_PATH = os.path.join(BASE, "dialect_local.db")
# 운영 파일서버 원본. 자체 서명 인증서라 브라우저가 직접 받지 못해 server.py 가 중계한다.
MP3_ORIGIN = "https://dialect.inseq.co.kr:9443/dialect/map/coop/mp3"
MP3_BASE = "/api/vocab_audio"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _sex(v):
    """tb_dialect_region.sex — 0=여성, 1=남성 (wb_source 와 동일 규약)."""
    s = str(v or '').strip()
    return {'0': '여성', '1': '남성'}.get(s, s)


def _where(qs):
    """검색 조건 → (WHERE 절, 파라미터). 운영의 wordForm(all/dlt/std)에 대응."""
    kw = (qs.get('q') or [''])[0].strip()
    scope = (qs.get('scope') or ['all'])[0]
    scope = {'dialect': 'dlt', 'standard': 'std', 'all': 'all'}.get(scope, scope)
    match = (qs.get('match') or ['contains'])[0]   # contains | match | startsWith
    sido = (qs.get('sido') or [''])[0].strip()
    sigungu = (qs.get('sigungu') or [''])[0].strip()
    sex = (qs.get('sex') or [''])[0].strip()
    y0 = (qs.get('startYear') or [''])[0].strip()
    y1 = (qs.get('endYear') or [''])[0].strip()

    where, params = ["1=1"], []
    if kw:
        pat = {'match': kw, 'startsWith': kw + '%'}.get(match, '%' + kw + '%')
        cols = {'dlt': ['dlt_tp'], 'std': ['std_tp']}.get(scope, ['dlt_tp', 'std_tp'])
        where.append('(' + ' OR '.join(f"IFNULL({c},'') LIKE ?" for c in cols) + ')')
        params += [pat] * len(cols)
    if sido:
        where.append("sido_cd = ?")
        params.append(sido)
    if sigungu:
        where.append("IFNULL(sigungu_nm,'') LIKE ?")
        params.append('%' + sigungu + '%')
    if sex:
        where.append("sex = ?")
        params.append(sex)
    if y0:
        where.append("CAST(IFNULL(basis_year,'0') AS INTEGER) >= ?")
        params.append(int(y0))
    if y1:
        where.append("CAST(IFNULL(basis_year,'0') AS INTEGER) <= ?")
        params.append(int(y1))
    return ' AND '.join(where), params, kw


def search(qs):
    page = max(1, int((qs.get('page') or ['1'])[0] or 1))
    size = min(100, int((qs.get('size') or ['20'])[0] or 20))
    where, params, kw = _where(qs)
    c = _conn()

    total = c.execute(
        f"SELECT COUNT(*) FROM (SELECT DISTINCT dlt_tp, std_tp FROM tb_dialect_region WHERE {where})",
        params).fetchone()[0]

    rows = c.execute(f"""
        SELECT dlt_tp, std_tp,
               COUNT(*) cnt,
               COUNT(DISTINCT sido_nm) sido_cnt,
               GROUP_CONCAT(DISTINCT sido_nm) sidos
        FROM tb_dialect_region
        WHERE {where}
        GROUP BY dlt_tp, std_tp
        ORDER BY cnt DESC, dlt_tp
        LIMIT ? OFFSET ?""", params + [size, (page - 1) * size]).fetchall()

    data = []
    for r in rows:
        sidos = sorted({s for s in (r['sidos'] or '').split(',') if s})
        data.append({
            "dlt": r['dlt_tp'] or '',
            "std": r['std_tp'] or '',
            "regions": sidos,
            "regionText": ', '.join(sidos),
            "points": r['cnt'],
        })
    c.close()
    return {"status": "success", "keyword": kw, "total": total,
            "page": page, "size": size, "data": data}


def detail(qs):
    """한 (지역어형, 표준어) 조합의 조사 지점 목록. 검색 조건도 함께 적용한다."""
    dlt = (qs.get('dlt') or [''])[0]
    std = (qs.get('std') or [''])[0]
    where, params, _ = _where(qs)
    c = _conn()
    rows = c.execute(f"""
        SELECT sido_nm, sigungu_nm, basis_year, sex, age, serial_nm, file_memo,
               research_degree, source
        FROM tb_dialect_region
        WHERE {where} AND IFNULL(dlt_tp,'') = ? AND IFNULL(std_tp,'') = ?
        ORDER BY sido_nm, sigungu_nm, CAST(IFNULL(basis_year,'0') AS INTEGER)""",
        params + [dlt, std]).fetchall()
    out = []
    for r in rows:
        serial = (r['serial_nm'] or '').strip()
        year = (r['basis_year'] or '').strip()
        out.append({
            "sido": r['sido_nm'] or '',
            "sigungu": r['sigungu_nm'] or '',
            "year": year,
            "sex": _sex(r['sex']),
            "age": r['age'] or '',
            "serial": serial,
            "memo": r['file_memo'] or '',
            "degree": r['research_degree'] or '',
            "audio": f"{MP3_BASE}?year={year}&serial={serial}" if (year and serial) else '',
        })
    c.close()
    return {"status": "success", "dlt": dlt, "std": std, "total": len(out), "data": out}


def audio_origin(year, serial):
    """중계할 원본 mp3 URL."""
    return f"{MP3_ORIGIN}/{year}/{serial}.mp3"


def map_data(qs):
    """지도용 집계 — 한 지역어형이 어느 시도에서 어떤 표준어로 쓰이는지.

    화면의 지도 코드가 기대하는 모양에 맞춘다.
      regionData = { 시도: { 표준어: 건수 } }        ← 색상·범례·마커용
      points     = { 시도: { 표준어: [조사지점…] } } ← 우측 상세 패널용
    """
    dlt = (qs.get('dlt') or [''])[0]
    where, params, _ = _where(qs)
    c = _conn()
    rows = c.execute(f"""
        SELECT sido_nm, sigungu_nm, std_tp, basis_year, sex, age, serial_nm
        FROM tb_dialect_region
        WHERE {where} AND IFNULL(dlt_tp,'') = ?
        ORDER BY sido_nm, std_tp, sigungu_nm""", params + [dlt]).fetchall()
    c.close()

    region, points = {}, {}
    for r in rows:
        sido = (r['sido_nm'] or '').strip()
        std = (r['std_tp'] or '').strip()
        if not sido or not std:
            continue
        region.setdefault(sido, {})
        region[sido][std] = region[sido].get(std, 0) + 1
        year = (r['basis_year'] or '').strip()
        serial = (r['serial_nm'] or '').strip()
        points.setdefault(sido, {}).setdefault(std, []).append({
            "sigungu": r['sigungu_nm'] or '',
            "year": year,
            "sex": _sex(r['sex']),
            "age": r['age'] or '',
            "audio": f"{MP3_BASE}?year={year}&serial={serial}" if (year and serial) else '',
        })
    return {"status": "success", "dlt": dlt,
            "regionCount": len(region), "total": len(rows),
            "regionData": region, "points": points}
