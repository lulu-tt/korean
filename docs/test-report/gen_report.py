# -*- coding: utf-8 -*-
"""개발서버 단위 테스트 결과서 CSV 생성 (사용자/관리자). 결과값은 2026-10-16 ego 브라우저 점검 로그 기준."""
import csv
B = "https://dev.neibis.inseq.co.kr:8443"
DATE = "2026-10-16"
HDR = ["번호", "대분류", "화면명", "링크", "테스트 방법", "입력 데이터", "기대 결과", "테스트 결과", "확인 내용", "비고", "테스트일"]

U_LOAD = "주소로 직접 접속(대기열 통과 후) → 화면 제목·본문 렌더링 확인"
A_LOAD = "관리자 로그인 상태에서 주소로 직접 접속 → 화면 제목·목록 표시 확인"
IN_NONE = "없음(조회만)"
EXP_U = "HTTP 200, 오류 페이지 없음, 화면 제목 표시"
EXP_A = "오류 안내 페이지 없음, 목록/본문 표시"

user = [
 ("메인", "메인", "/dialect/ko/index.do", "PASS", "제목 '지역어 종합 정보', GNB 5개 메뉴 표시", ""),
 ("지역어 검색", "통합자료검색", "/dialect/ko/proj/89/srch/search.do", "PASS", "검색 화면 표시", "검색어 입력·결과 동작은 미검증"),
 ("지역어 검색", "어휘조사자료", "/dialect/ko/proj/90/word-exmn/list.do", "PASS", "목록 40행 표시", ""),
 ("지역어 검색", "구술발화조사자료", "/dialect/ko/proj/91/cnvrs-exmn/list.do", "PASS", "본문 렌더링(대용량 페이지)", ""),
 ("지역어 검색", "지역어 변이형 비교", "/dialect/ko/proj/92/vrnt/list.do", "PASS", "화면 표시", "비교 조회 동작은 미검증"),
 ("지역어 지도", "지역어 지도", "/dialect/ko/proj/93/map/list.do", "PASS", "화면 표시", "지도 렌더링·표제어 선택은 미검증"),
 ("지역어 지도", "지역어 지도 비교", "/dialect/ko/proj/94/map/cmpr.do", "PASS", "화면 표시", "비교 동작은 미검증"),
 ("지역어 지도", "지역어 기상도", "/dialect/ko/proj/96/wther/list.do", "PASS", "화면 표시", "기상도 지도 렌더링은 미검증"),
 ("지역어 지도", "세대별 지역어 변화", "/dialect/ko/proj/119/dlt-flctn/list.do", "PASS", "화면 표시", ""),
 ("지역어 자료관", "문학 속 지역어", "/dialect/ko/proj/97/ltrt/list.do", "PASS", "본문 표시", ""),
 ("지역어 자료관", "사진으로 보는 생활어", "/dialect/ko/proj/98/rgn-photo/list.do", "PASS", "화면 표시(표 행 0, 본문 짧음)", "목록 데이터가 스크립트로 로드되는지는 미확인"),
 ("지역어 자료관", "자료실", "/dialect/ko/bbs/99/list.do", "PASS", "목록 12행 표시", ""),
 ("알림마당", "공지사항", "/dialect/ko/bbs/101/list.do", "PASS", "목록 10행 표시", ""),
 ("알림마당", "도움말", "/dialect/ko/bbs/102/list.do", "PASS", "화면 표시(표 행 0)", "도움말 게시물 0건인지 확인 필요"),
 ("알림마당", "의견제시", "/dialect/ko/bbs/103/list.do", "PASS(로그인 유도)", "비로그인 접속 시 로그인 화면으로 이동", "로그인 필요 메뉴 — 의도된 동작으로 판단"),
]
admin = [
 ("대시보드", "대시보드", "/dialect/neibis/index.do", "PASS", "제목 '대시보드', 표 7행"),
 ("조사 자료", "어휘조사자료", "/dialect/neibis/proj/55/word-exmn/list.do", "PASS", "전체 321,533건, 25행 표시"),
 ("조사 자료", "구술발화 조사 자료", "/dialect/neibis/proj/56/cnvrs-exmn/list.do", "PASS", "전체 1,831건, 22행 표시"),
 ("조사 자료", "지역별 이형태 관리", "/dialect/neibis/proj/57/vrnt/list.do", "PASS", "전체 452건, 25행 표시"),
 ("조사 자료", "검색 표준어 어휘 관리", "/dialect/neibis/proj/58/srch-std-word/list.do", "PASS", "전체 2,983건, 21행 표시"),
 ("조사 자료", "검색 주제 분류 관리", "/dialect/neibis/proj/59/srch-tpc-clsf/list.do", "PASS", "전체 71건, 21행 표시"),
 ("지역어 지도", "지역어 지도 서비스", "/dialect/neibis/proj/68/map/list.do", "PASS", "전체 1,354건, 20행 표시"),
 ("지역어 지도", "지역어 기상도", "/dialect/neibis/proj/69/wther/list.do", "PASS", "전체 41건, 20행 표시"),
 ("지역어 지도", "세대별 지역어 변화", "/dialect/neibis/proj/118/dlt-flctn/list.do", "PASS", "전체 17건, 21행 표시"),
 ("지역어 지도", "상징 부호 관리", "/dialect/neibis/proj/70/symbl/list.do", "PASS", "전체 565건, 17행 표시"),
 ("알림마당", "공지사항", "/dialect/neibis/bbs/71/list.do", "PASS", "전체 16건, 19행 표시"),
 ("알림마당", "도움말", "/dialect/neibis/bbs/72/list.do", "PASS", "전체 8건, 17행 표시"),
 ("알림마당", "의견제시", "/dialect/neibis/bbs/73/list.do", "PASS", "전체 21건, 20행 표시"),
 ("지역어 자료관", "문학 속 지역어", "/dialect/neibis/proj/74/ltrt/list.do", "PASS", "전체 1,988건, 21행 표시"),
 ("지역어 자료관", "사진으로 보는 생활어", "/dialect/neibis/proj/75/rgn-photo/list.do", "PASS", "전체 2,869건, 22행 표시"),
 ("지역어 자료관", "자료실", "/dialect/neibis/bbs/76/list.do", "PASS", "전체 33건, 21행 표시"),
 ("OPEN API 관리", "사용현황", "/dialect/neibis/proj/77/openapi/use-list.do", "PASS", "전체 1건, 10행 표시"),
 ("OPEN API 관리", "호출 단어 순위", "/dialect/neibis/proj/78/openapi/word-rank.do", "PASS", "전체 4건, 11행 표시"),
 ("OPEN API 관리", "호출 URL 순위", "/dialect/neibis/proj/79/openapi/url-rank.do", "PASS", "전체 1건, 8행 표시"),
 ("회원", "사용자 계정관리", "/dialect/neibis/proj/65/mbr-mngr/list.do", "PASS", "전체 3건, 15행 표시"),
 ("회원", "제보자 관리", "/dialect/neibis/proj/66/infmt/list.do", "PASS", "전체 686건, 19행 표시"),
 ("통계", "사용자 방문자 통계", "/dialect/stats/user/cnt-list.do", "PASS", "통계 표 9행 표시"),
]

def write(name, rows):
    with open(name, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(HDR)
        for i, r in enumerate(rows, 1): w.writerow([i] + list(r))

ur = [(m, n, B + p, U_LOAD, IN_NONE, EXP_U, res, c, note, DATE) for m, n, p, res, c, note in user]
ar = [(m, n, B + p, A_LOAD, IN_NONE, EXP_A, res, c, "읽기 전용 점검(등록·수정·삭제 미실시)", DATE) for m, n, p, res, c in admin]
write("test_report_user.csv", ur); write("test_report_admin.csv", ar)
print(len(ur), len(ar))
