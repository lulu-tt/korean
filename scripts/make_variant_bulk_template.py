#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
변이형(음운) 비교 — 일괄등록 서식(xlsx) 생성

목적
  · 관리자 화면(variant.do) 일괄등록의 '단위'를 서식으로 고정한다.
    ① 항목(비교단위)  ② 조사지점  ③ 지점 응답(통합자료)  ③-1 지점 응답(개별)
  · ③ 시트는 국립국어원 통합자료(data/dialect_phonology_compare/*.xls*)와
    레이아웃을 동일하게 유지한다. (1행 제목 / 2행 헤더 / 3행부터 데이터)
    → 원본 파일을 변형 없이 그대로 업로드할 수 있어야 하므로 서식을 원본에 맞춘다.

사용
  python3 scripts/make_variant_bulk_template.py
  python3 scripts/make_variant_bulk_template.py --out <경로.xlsx>
"""
from __future__ import annotations

import argparse
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = (
    ROOT / "neibis-cms" / "mariadb" / "neibis" / "survey" / "data"
    / "변이형비교_일괄등록_양식.xlsx"
)

# ── 서식 스타일 ────────────────────────────────────────────────────
C_HEAD = "FF1F3864"      # 헤더 배경(감청)
C_HEAD_REQ = "FF7B2D26"  # 필수열 헤더 배경(적벽돌)
C_SAMPLE = "FFFFF7E6"    # 예시행 배경(연노랑)
C_NOTE = "FF64748B"      # 설명 텍스트

F_TITLE = Font(name="맑은 고딕", size=14, bold=True, color="FF1F3864")
F_H2 = Font(name="맑은 고딕", size=11, bold=True, color="FF1F3864")
F_HEAD = Font(name="맑은 고딕", size=10, bold=True, color="FFFFFFFF")
F_BODY = Font(name="맑은 고딕", size=10)
F_NOTE = Font(name="맑은 고딕", size=9, color=C_NOTE)
F_SAMPLE = Font(name="맑은 고딕", size=10, color="FF7C4A03", italic=True)

THIN = Side(style="thin", color="FFBFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

WRAP = Alignment(horizontal="left", vertical="center", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


def put(ws, row, col, value, font=F_BODY, align=WRAP, fill=None, border=True):
    c = ws.cell(row=row, column=col, value=value)
    c.font = font
    c.alignment = align
    if fill:
        c.fill = PatternFill("solid", fgColor=fill)
    if border:
        c.border = BOX
    return c


def write_header(ws, row, cols):
    """cols = [(제목, 폭, 필수여부)] → 헤더행 작성 + 열 폭 지정."""
    for i, (title, width, req) in enumerate(cols, start=1):
        put(
            ws, row, i,
            title + ("*" if req else ""),
            font=F_HEAD, align=CENTER,
            fill=C_HEAD_REQ if req else C_HEAD,
        )
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[row].height = 30


def write_sample(ws, start_row, rows):
    for r, vals in enumerate(rows, start=start_row):
        for c, v in enumerate(vals, start=1):
            put(ws, r, c, v, font=F_SAMPLE, fill=C_SAMPLE)
    return start_row + len(rows)


def add_list_validation(ws, col_letter, values, first_row, last_row=500):
    dv = DataValidation(
        type="list",
        formula1='"' + ",".join(values) + '"',
        allow_blank=True,
        showDropDown=False,
    )
    dv.error = "목록에 있는 값만 입력할 수 있습니다: " + ", ".join(values)
    dv.errorTitle = "입력값 확인"
    ws.add_data_validation(dv)
    dv.add(f"{col_letter}{first_row}:{col_letter}{last_row}")


# ── 시트 0: 안내 ───────────────────────────────────────────────────
GUIDE_BLOCKS = [
    (
        "업로드 유형 (일괄등록 팝업에서 유형을 먼저 선택하세요)",
        [
            ("① 항목", "시트 「①항목」", "비교단위(표제어)와 하위 환경을 등록·수정합니다. 응답은 포함하지 않습니다."),
            ("② 조사지점", "시트 「②조사지점」", "도·지점명·조사연도를 등록합니다. ③ 업로드 전에 지점이 먼저 있어야 합니다."),
            ("③ 지점 응답(통합)", "시트 「③응답(음운)」", "국립국어원 통합자료와 같은 형태. 항목×지점 응답을 한 번에 적재합니다."),
            ("③-1 지점 응답(개별)", "시트 「③-1응답(개별)」", "일부 셀만 고칠 때 사용합니다. 한 행 = 한 응답."),
        ],
    ),
]

GUIDE_RULES = [
    "항목코드 체계 — 부모(비교단위)는 5자리 숫자(31001), 하위 환경은 «부모코드-0-순번»(31001-0-1) 형식입니다.",
    "대역(앞 3자리) — 310: 체언 대립 / 320·321·322·323: 활용. 항목코드에서 자동 판정되므로 비워도 됩니다.",
    "결측 — 조사되지 않았거나 응답이 없으면 빈칸으로 두거나 «*»를 입력합니다. 임의로 값을 채우지 마세요.",
    "다중 이형태 — 한 지점에서 둘 이상 나온 경우 «|»로 구분합니다. 예) 테보다 | 테보덤",
    "조사자 주석 — «(+…)» 형태의 주석은 원문 그대로 두세요. 저장 시 원문이 보존되고, 표시·검색에서만 분리됩니다.",
    "지점열 헤더 규격 — «도명 지점명(연도)». 도명·연도는 생략 가능합니다. 예) 경기 용인(2004) / 강원 삼척 / 가시",
    "재업로드 — 같은 (항목코드 × 지점)에 값이 이미 있으면 덮어씁니다. 업로드 이력은 배치 단위로 남습니다.",
    "국립국어원 통합자료(경기·강원·충북·충남·전북·전남·경북·경남·제주) 원본 파일은 변형 없이 「③」 유형으로 그대로 올릴 수 있습니다.",
]


def sheet_guide(wb: Workbook):
    ws = wb.create_sheet("안내")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 4
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 22
    ws.column_dimensions["D"].width = 88

    r = 2
    c = ws.cell(row=r, column=2, value="변이형(음운) 비교 — 일괄등록 서식")
    c.font = F_TITLE
    r += 1
    c = ws.cell(row=r, column=2, value="NEIBIS 관리자 > 조사자료 > 변이형 비교 > 일괄 등록")
    c.font = F_NOTE
    r += 2

    for title, rows in GUIDE_BLOCKS:
        ws.cell(row=r, column=2, value=title).font = F_H2
        r += 1
        for i, (a, b, d) in enumerate(rows):
            put(ws, r, 2, a, font=Font(name="맑은 고딕", size=10, bold=True), fill="FFF1F5F9")
            put(ws, r, 3, b)
            put(ws, r, 4, d)
            ws.row_dimensions[r].height = 24
            r += 1
        r += 1

    ws.cell(row=r, column=2, value="공통 입력 규칙").font = F_H2
    r += 1
    for i, text in enumerate(GUIDE_RULES, start=1):
        put(ws, r, 2, str(i), align=CENTER, fill="FFF1F5F9")
        cell = put(ws, r, 3, text)
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
        cell.alignment = WRAP
        ws.row_dimensions[r].height = 26
        r += 1

    r += 1
    for sheet_title, notes in (
        ("「①항목」 작성 규칙", ITEM_NOTES),
        ("「②조사지점」 작성 규칙", SITE_NOTES),
        ("「③응답(음운)」 작성 규칙", WIDE_NOTES),
        ("「③-1응답(개별)」 작성 규칙", LONG_NOTES),
    ):
        ws.cell(row=r, column=2, value=sheet_title).font = F_H2
        r += 1
        for note in notes:
            cell = put(ws, r, 2, "· " + note)
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
            cell.alignment = WRAP
            ws.row_dimensions[r].height = 26
            r += 1
        r += 1

    ws.cell(
        row=r, column=2,
        value="※ 연노랑 배경 행은 작성 예시입니다. 업로드 전에 삭제하세요. 헤더행(굵은 배경)은 지우거나 순서를 바꾸지 마세요.",
    ).font = F_NOTE
    r += 1
    ws.cell(
        row=r, column=2,
        value="※ 각 데이터 시트는 «1행 제목 / 2행 헤더 / 3행부터 데이터»입니다. 데이터 아래에 메모를 적으면 업로드 시 데이터로 읽힙니다.",
    ).font = F_NOTE
    return ws


# ── 시트 1: ①항목 ─────────────────────────────────────────────────
ITEM_COLS = [
    ("항목코드", 16, True),
    ("표준어", 26, True),
    ("구분", 10, True),
    ("상위항목코드", 16, False),
    ("대역", 8, False),
    ("정렬순서", 10, False),
    ("사용여부", 10, False),
    ("비고", 40, False),
]

ITEM_SAMPLE = [
    ["31001", "테(輪)", "부모", "", "310", 1, "Y", "체언 대립 — 비교단위"],
    ["31001-0-1", "-이/가", "환경", "31001", "310", 1, "Y", ""],
    ["31001-0-2", "-보다", "환경", "31001", "310", 2, "Y", ""],
    ["32001", "막-(防)[ㄱ]", "부모", "", "320", 1, "Y", "활용 — 비교단위"],
    ["32001-0-1", "-지", "환경", "32001", "320", 1, "Y", ""],
    ["32001-0-2", "-고", "환경", "32001", "320", 2, "Y", ""],
    ["32001-0-3", "-더라", "환경", "32001", "320", 3, "Y", ""],
]

ITEM_NOTES = [
    "구분: «부모» = 비교단위(표제어), «환경» = 부모에 딸린 조사·어미 환경.",
    "상위항목코드: 구분이 «환경»일 때만 입력합니다. 비워두면 항목코드에서 «-» 앞부분으로 자동 판정합니다.",
    "대역·정렬순서·사용여부·비고는 생략 가능합니다. (사용여부 기본값 Y)",
    "이미 등록된 항목코드는 표준어·정렬·사용여부·비고만 갱신되고 새로 만들어지지 않습니다.",
]


def sheet_item(wb: Workbook):
    ws = wb.create_sheet("①항목")
    put(ws, 1, 1, "① 항목(비교단위) 일괄등록 — 한 행 = 한 항목", font=F_H2, border=False)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(ITEM_COLS))
    write_header(ws, 2, ITEM_COLS)
    write_sample(ws, 3, ITEM_SAMPLE)
    ws.freeze_panes = "A3"

    add_list_validation(ws, "C", ["부모", "환경"], 3)
    add_list_validation(ws, "G", ["Y", "N"], 3)
    # 데이터 영역 아래에는 아무것도 쓰지 않는다. (파서가 설명문을 데이터로 읽는다)
    return ws


# ── 시트 2: ②조사지점 ─────────────────────────────────────────────
SITE_COLS = [
    ("지점열 헤더(원문)", 26, True),
    ("도코드", 10, True),
    ("도명", 10, False),
    ("지점명", 14, True),
    ("조사연도", 10, False),
    ("지점ID(수정 시)", 30, False),
    ("사용여부", 10, False),
    ("비고", 34, False),
]

SITE_SAMPLE = [
    ["경기 용인(2004)", "GG", "경기", "용인", 2004, "", "Y", ""],
    ["강원 삼척", "GW", "강원", "삼척", "", "", "Y", "조사연도 미상"],
    ["SJB_IS(임실)", "JB", "전북", "임실", "", "", "Y", "원본 헤더에 조사코드 포함"],
    ["가시", "JJ", "제주", "가시", "", "", "Y", "제주 마을 단위"],
    ["중국 돈화(2004)", "CB", "충북", "돈화", 2004, "", "Y", "국외 지점(충북 보고서 수록)"],
]

PROV_CODES = ["GG", "GW", "CB", "CN", "JB", "JN", "GB", "GN", "JJ"]

SITE_NOTES = [
    "지점열 헤더(원문)이 정본입니다. 「③응답(음운)」의 지점 열 제목과 «글자 그대로» 일치해야 응답이 연결됩니다.",
    "도코드: GG 경기 / GW 강원 / CB 충북 / CN 충남 / JB 전북 / JN 전남 / GB 경북 / GN 경남 / JJ 제주",
    "지점ID는 시스템이 생성합니다. 신규 등록 시 비워두고, 기존 지점을 고칠 때만 조회한 값을 넣으세요.",
    "조사연도를 모르면 비워둡니다. 임의 연도를 넣지 마세요.",
]


def sheet_site(wb: Workbook):
    ws = wb.create_sheet("②조사지점")
    put(ws, 1, 1, "② 조사지점 일괄등록 — 한 행 = 한 지점", font=F_H2, border=False)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(SITE_COLS))
    write_header(ws, 2, SITE_COLS)
    write_sample(ws, 3, SITE_SAMPLE)
    ws.freeze_panes = "A3"

    add_list_validation(ws, "B", PROV_CODES, 3)
    add_list_validation(ws, "G", ["Y", "N"], 3)
    return ws


# ── 시트 3: ③응답(통합) ───────────────────────────────────────────
# 국립국어원 통합자료와 동일 레이아웃: 1행 제목 / 2행 헤더 / 3행부터 데이터.
WIDE_HEADER = [
    "항목번호", "표준어",
    "경기 용인(2004)", "경기 화성(2005)", "경기 포천(2006)",
    "경기 파주(2007)", "경기 양평(2008)", "경기 이천(2010)",
]

# 경기 통합자료 실제 원문 발췌 (data/dialect_phonology_compare/…경기…xlsx)
WIDE_SAMPLE = [
    ["31001", "테(輪)", "테", "", "", "", "", ""],
    ["31001-0-1", "-이/가", "테가 이:쁘다", "태가", "테가", "테가", "테가", "테가"],
    ["31001-0-2", "-보다", "테보덤", "태보다", "", "", "테를", ""],
    ["31002", "태(胎)", "태", "", "", "", "", ""],
    ["31002-0-1", "-이/가", "태가", "태가", "태가", "태가", "태가", "태가"],
    ["31002-0-2", "-보다", "*", "태보다", "", "", "태를", ""],
    ["32001", "막-(防)[ㄱ]", "막는다", "", "", "", "", "망는다"],
    ["32001-0-1", "-지", "막찌", "막찌", "막찌 마", "막찌", "망는다 | 흐르지", "막찌"],
    ["32001-0-2", "-고", "막꼬", "마꼬 이따 | 막꼬", "막꾸", "막꾸", "막꾸", "마꾸"],
]

WIDE_NOTES = [
    "레이아웃은 국립국어원 통합자료와 같습니다. 1행 제목 / 2행 헤더 / 3행부터 데이터 — 행 위치를 바꾸지 마세요.",
    "A열 제목은 «항목번호» «Code» «code» 중 아무 것이나 인식합니다. 지점 열은 C열부터 필요한 만큼 늘릴 수 있습니다.",
    "지점 열 제목은 「②조사지점」의 «지점열 헤더(원문)»과 글자 그대로 일치해야 합니다. 미등록 지점은 검증 단계에서 확인을 요구합니다.",
    "부모행(31001)은 표제어 확인용입니다. 부모행 응답 셀도 원문 그대로 적재됩니다.",
    "빈칸·«*»는 결측으로 기록됩니다(원문 보존). 다중 이형태는 «|»로 구분합니다.",
    "경북 통합자료처럼 부모행이 없고 표준어가 «테(輪)-이/가»로 합쳐진 파일도 그대로 올릴 수 있습니다(자동 분리).",
    "표준어(B열)는 참고용입니다. 이미 등록된 항목의 표준어는 이 파일 값으로 덮어쓰지 않고, 차이가 있으면 검증 리포트에 경고로 표시합니다.",
]


def sheet_wide(wb: Workbook):
    # 시트명에 '음운'을 포함시켜 원본 통합자료와 같은 경로로 파싱되게 한다.
    ws = wb.create_sheet("③응답(음운)")
    put(
        ws, 1, 1,
        "③ 지점 응답 일괄등록(통합자료형) — 행 = 항목, 열 = 조사지점",
        font=F_H2, border=False,
    )
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(WIDE_HEADER))

    for i, title in enumerate(WIDE_HEADER, start=1):
        put(
            ws, 2, i, title, font=F_HEAD, align=CENTER,
            fill=C_HEAD_REQ if i <= 2 else C_HEAD,
        )
        ws.column_dimensions[get_column_letter(i)].width = 16 if i <= 2 else 22
    ws.column_dimensions["B"].width = 20
    ws.row_dimensions[2].height = 30

    write_sample(ws, 3, WIDE_SAMPLE)
    ws.freeze_panes = "C3"
    return ws


# ── 시트 4: ③-1응답(개별) ─────────────────────────────────────────
LONG_COLS = [
    ("항목코드", 16, True),
    ("지점열 헤더(원문)", 26, True),
    ("도코드", 10, False),
    ("지점명", 14, False),
    ("조사연도", 10, False),
    ("응답 원문", 40, True),
    ("결측", 8, False),
    ("비고", 30, False),
]

LONG_SAMPLE = [
    ["31001-0-1", "경기 용인(2004)", "GG", "용인", 2004, "테가 이:쁘다", "N", ""],
    ["31001-0-2", "경기 양평(2008)", "GG", "양평", 2008, "테를", "N", ""],
    ["31002-0-2", "경기 용인(2004)", "GG", "용인", 2004, "*", "Y", "조사 안 됨"],
    ["32001-0-1", "경기 양평(2008)", "GG", "양평", 2008, "망는다 | 흐르지", "N", "다중 이형태"],
]

LONG_NOTES = [
    "일부 셀만 수정·추가할 때 씁니다. 한 행 = (항목코드 × 지점) 응답 1건.",
    "지점은 «지점열 헤더(원문)»으로 찾습니다. 도코드·지점명·조사연도는 확인용 보조 열입니다.",
    "결측: Y로 두면 응답 원문을 결측으로 기록합니다. 비우면 응답 원문이 빈칸·«*»인지로 자동 판정합니다.",
    "여기에 없는 (항목×지점) 조합은 건드리지 않습니다. 이 시트로는 기존 값이 지워지지 않습니다.",
]


def sheet_long(wb: Workbook):
    ws = wb.create_sheet("③-1응답(개별)")
    put(ws, 1, 1, "③-1 지점 응답 일괄등록(개별형) — 한 행 = 한 응답", font=F_H2, border=False)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(LONG_COLS))
    write_header(ws, 2, LONG_COLS)
    write_sample(ws, 3, LONG_SAMPLE)
    ws.freeze_panes = "A3"

    add_list_validation(ws, "C", PROV_CODES, 3)
    add_list_validation(ws, "G", ["Y", "N"], 3)
    return ws


# ── 시트 5: 참조 ──────────────────────────────────────────────────
BAND_REF = [
    ("310", "체언 대립", "31001~31282", "테(輪) / 태(胎) / 떼(群)", "-이/가, -보다 (환경 2개)"),
    ("320", "활용", "32001~32435", "막-(防)[ㄱ]", "-지, -고, -더라, -으니까, -아/어 (환경 5개)"),
    ("321", "활용", "32101~32300", "", ""),
    ("322", "활용", "32201~32300", "", ""),
    ("323", "활용", "32301~32282", "", ""),
]

HEADER_REF = [
    ("경기·충남·전남·경남", "지명(연도)", "용인(2004)", "지명·연도 모두 인식"),
    ("강원", "도명 지명", "강원 삼척", "연도 없음"),
    ("충북", "도명 지명(연도)", "충북 제천(2005)", "권장 규격"),
    ("전북", "조사코드(지명)", "SJB_IS(임실)", "괄호 안 지명 추출"),
    ("경북·제주", "지명 단독", "의성 / 가시", "연도 없음, 제주는 마을 단위"),
]


def sheet_ref(wb: Workbook):
    ws = wb.create_sheet("참조")
    ws.sheet_view.showGridLines = False

    put(ws, 1, 1, "코드 대역", font=F_H2, border=False)
    cols = [("대역", 10, False), ("분류명", 14, False), ("코드 범위", 18, False),
            ("표제어 예", 24, False), ("하위 환경 예", 42, False)]
    write_header(ws, 2, cols)
    r = 3
    for row in BAND_REF:
        for i, v in enumerate(row, start=1):
            put(ws, r, i, v)
        r += 1

    r += 2
    put(ws, r, 1, "지점열 헤더 표기 형식 (국립국어원 통합자료 기준)", font=F_H2, border=False)
    r += 1
    cols2 = [("보고서", 20, False), ("형식", 20, False), ("예", 20, False), ("비고", 30, False)]
    write_header(ws, r, cols2)
    r += 1
    for row in HEADER_REF:
        for i, v in enumerate(row, start=1):
            put(ws, r, i, v)
        r += 1

    r += 1
    c = ws.cell(
        row=r, column=1,
        value="※ 위 5가지 형식은 모두 그대로 인식합니다. 신규 작성 시에는 «도명 지점명(연도)» 규격을 권장합니다.",
    )
    c.font = F_NOTE
    return ws


def build(out: Path) -> Path:
    wb = Workbook()
    wb.remove(wb.active)
    sheet_guide(wb)
    sheet_item(wb)
    sheet_site(wb)
    sheet_wide(wb)
    sheet_long(wb)
    sheet_ref(wb)
    wb.properties.title = "변이형(음운) 비교 일괄등록 서식"
    wb.properties.creator = "NEIBIS"
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()
    p = build(Path(args.out))
    print("생성:", p)
