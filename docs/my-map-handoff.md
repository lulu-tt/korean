# 나만의 지도 제작 — 서비스 분석 & 작업 현황 핸드오프

| 항목 | 내용 |
|------|------|
| **문서 목적** | 운영 서비스 분석 + 로컬 프로토 진행 상황을 정리해 **다른 작업자가 즉시 이어서 개발**할 수 있게 함 |
| **작성 기준일** | 2026-08-03 |
| **메인 작업 경로** | `/Users/aaa/inseq/korean` |
| **Grok worktree** | `/Users/aaa/.grok/worktrees/inseq-korean/2026-07-23-405f2d83` |
| **로컬 미리보기** | `http://127.0.0.1:8765/` (cwd가 `korean` 인 `python -m http.server 8765` 기준) |
| **DB 연동** | **아직 미착수** (최종 단계). 현재는 `localStorage` 프로토 |

---

## 1. 배경과 목표

### 1.1 제품 위치

- GNB: **지역어 지도 > 나만의 지도 제작**
- 마이페이지: **내 정보 > 나의 지도**
- 공개 열람 지도(`dialect_map.html`)와 달리, **회원이 표제어·지역어·스타일·지역을 구성**해 개인 지도를 만든다.

### 1.2 목표 (TO-BE)

1. 운영 `mydialect` 의 **업무 순서·데이터 필드**를 유지한다.
2. UX는 운영의 **다단 팝업 위저드**를 버리고 **한 화면 + 단계 탭**으로 단순화한다.
3. 지도 스택은 로컬과 동일하게 **OpenLayers + `korea-map.js`** (Naver 미사용).
4. 저장 스키마는 **`dialect_local.db` 컬럼명과 정합** → 마지막에 DB 연동만 붙이면 되도록 한다.
5. **기존 누적 데이터 필드 삭제·개명 금지.**

---

## 2. 운영 서비스 분석 (AS-IS)

**대상 사이트:** `https://dialect.korean.go.kr`  
**메뉴:** 회원 전용 「내 지도 그리기」  
**URL:** `/dialect/member/mydialect?topic={headwordNo}`

### 2.1 인증

| 항목 | 내용 |
|------|------|
| 로그인 | `POST /dialect/member/process` (`usid`, `password`, `change=N`) |
| 세션 | `JSESSIONID` 쿠키 |
| 비로그인 | mydialect 접근 시 로그인으로 리다이렉트 |

> 분석용 계정은 대화 중에만 사용. **문서·저장소에 비밀번호를 남기지 말 것.** 공유 계정은 분석 후 변경 권장.

### 2.2 4단계 업무 흐름 (운영)

| 단계 | 기능 | 주요 URL / UI |
|------|------|----------------|
| **1. 표제어 등록** | 내 표제어 목록·추가·수정 | `/dialect/member/myinfo/dialectheadword` |
| **2. 어휘 확보** | 가져오기 / 직접 추가 / 엑셀 | `dialectins`, `dialectinsert?mode=C\|M`, `excel_upload`, `excel_manage` |
| **3. 스타일·지역** | 그룹·순서·상징부호·면색 | `dialectgroup` (대용량 HTML) |
| **4. 지도 조회** | 별도 팝업으로 지도 | `/dialect/map/mymap?headwordNo=` |

메인 목록 AJAX:

- 조회·정렬: `GET /dialect/member/mydialect/search?topic=&order=`
- 삭제: `GET /dialect/member/mydialect/regionDel?topic=&hdId=`

목록 행 필드 예: `hdId`, `headword`, `word`, `mutationGroup`, `mutationSeq`, `faceColor`, `symbolColor`, `fileNm`, `headwordCount`, `regionNmGroup`.

### 2.3 표제어 등록 (1단계) 상세

**목록** `dialectheadword`

| 컬럼 | 의미 |
|------|------|
| 표제어 번호 | `headword_id` |
| 표제어 | `headword` |
| 품사 | `word_class` |
| 의미 | `meaning` |
| 서비스 요청 | `appro` Y/N |
| 서비스 상태 | `use_yn` 등 (조회 위주) |

**추가** `?mode=C` (운영 JS URL에 `&'/>` 오타 있음 → 의도는 `mode=C`)

| 필드 | name | 필수 |
|------|------|------|
| 표제어 | `headword` | Y (max 125) |
| 품사 | `wordClass` | Y |
| 의미 | `meaning` | 권장 |
| 서비스 신청 | `appro` | Y (`Y`/`N`) |
| 서비스 상태 | — | 표시 전용 |

품사 옵션: 명사, 대명사, 수사, 조사, 동사, 형용사, 관형사, 부사, 감탄사, 접사, 구.

**수정** `?mode=M&headwordId=`  
hidden: `headwordId`, `topic`, `topicId`, **`headwordNo`** (지도 topic 키).

### 2.4 지도 렌더 (운영)

- 뷰어: Naver Maps `mymap`
- API 패턴:  
  `/dialect/map/dialect?type=tree|symbol|commentary&headword={headwordNo}`
- 면색 규칙: 지역당 `mapSymbols[0].faceColor` → `bodyColor[regionId]`
- 상징: `/dialect/upload/map/symbol/{symbolColor}_{fileNm}` 등 PNG

### 2.5 운영 Pain Point

1. 단계·팝업 과다 (작성 UX 분절)
2. 스타일 미지정 시 tree/symbol 빈 배열 → 빈 지도
3. Naver vs 로컬 OL 스택 불일치
4. tree→symbol 순차 로드 등 성능 이슈
5. dialectgroup HTML 비대 (~440KB)

### 2.6 관련 설계 문서

- worktree: `design_my_map_tobe.md` (TO-BE UX 상세, PR Plan 등)
- 본 문서: 분석 + **실제 구현 현황** 통합 핸드오프

---

## 3. 로컬 DB 스키마 (연동 시 기준)

파일: `dialect_local.db` (메인 경로)

| 테이블 | 역할 | 규모(분석 시점) |
|--------|------|----------------:|
| `kd_headword` | 표제어 | ~2,556 |
| `tb_headword_dialect` | 지역어 + 그룹/순서/면색/부호 | ~36,296 |
| `tb_headword_dialect_region` | 지역 매핑 | ~233,091 |
| `tb_map_symbol` | 상징 메타 | ~547 |
| `kd_topic` | 주제 분류 | ~121 |

### 3.1 `kd_headword` 주요 컬럼

`headword_id`, `topic_id`, `headword_no`, `sub_no`, `use_no`, `headword`, `original_word`, `word_class`, `meaning`, `usid`, `use_yn`, `appro`, `map_make`, `commentary`, `create_dt`

### 3.2 `tb_headword_dialect`

`hd_id`, `headword_no`, `word`, `face_color` (`"R, G, B"`), `mutation_group`, `mutation_seq`, `map_symbol_id`, `symbol_color`, `create_dt`

### 3.3 `tb_headword_dialect_region`

`hdr_id`, `headword_no`, `word`, `region_id`, `hd_id`, `serial_nm`, `basis_year`, `region_nm`, `create_dt`

### 3.4 공개 지도 export 규칙 (참고)

`scripts/export_map_headword.py`  
정렬: `mutation_group`, `mutation_seq`, `word` → 지역별 첫 방언형 면색.

**원칙:** UI에서 필드를 숨겨도 DB 컬럼을 없애거나 덮어써서 null로 만들지 말 것 (partial update).

---

## 4. 현재 프로토 아키텍처

### 4.1 페이지

| 파일 | 역할 |
|------|------|
| `dialect_my_map.html` | **제작** — 4단계 탭 + 편집 + 실시간 지도 |
| `my_map_view.html` | **지도보기** — dialect_map 유사 3열 (목록·지도·범례) + 설정·다운로드 |
| `mypage_map.html` | **나의 지도** 목록 (지도보기 / 편집 / 삭제) |
| `gnb.js` | `지역어 지도 > 나만의 지도 제작` → `./dialect_my_map.html` |

### 4.2 모듈

| 파일 | 역할 |
|------|------|
| `my-map-store.js` | localStorage 저장소. **DB 컬럼명 정합** 스키마 v2 |
| `my-map-regions.js` | 지역 레지스트리·클릭 PIP·북한 도 단위·중심점 |
| `my-map.js` | 제작 UI 로직 (탭, CRUD, 지도, 최종 저장) |
| `korea-map.js` | 공용 OL 한반도 베이스/라벨/fill/오버레이 |
| `skorea-municipalities.js` | 남한 시·군·구 GeoJSON |
| `skorea-provinces.js` | 남북 시·도 GeoJSON (북한 도 선택에 사용) |

### 4.3 저장소 (프로토)

- 키: `localStorage['myMap.proto.v2']`
- 구조:

```text
{
  schemaVersion: 2,
  dbCompat: 'kd_headword+tb_headword_dialect+tb_headword_dialect_region',
  seq: { headword_id, headword_no, hd_id, hdr_id },
  headwords: [ /* kd_headword 형태 */ ],
  dialects:  [ /* tb_headword_dialect 형태 */ ],
  regions:   [ /* tb_headword_dialect_region 형태 */ ]
}
```

- 세션 흉내: `myMap.sessionUser` (시연 로그인 `demo`)
- 선택 표제어: `myMap.selectedHeadwordNo`
- 덤프: `MyMapStore.exportAll()` / 초기화: `MyMapStore.resetAll()`

### 4.4 지역 ID (프로토)

| 구분 | ID 형식 | 비고 |
|------|---------|------|
| 남한 시·군·구 | `muni_{index}` | `KOREA_MUNICIPALITIES.features` 인덱스 |
| 북한 도·직할시 | `prov_{index}` | `KOREA_PROVINCES` 중 북한만, 라벨 `○○ (북한)` |

- 클릭 판정: **원본 GeoJSON 경위도 PIP** (`pickRegionAtLonLat`) — OL `intersectsCoordinate` 오판 방지
- 중첩 시 bbox 작은 구역 우선
- 면색 fill / 부호 마커: `getGeometry` / `getCentroidLonLat`

> 최종 DB 연동 시 `region_id` 는 **기존 행정코드 체계**로 매핑 테이블이 필요. `muni_*` 는 프로토 전용 키.

---

## 5. 구현된 기능 (완료)

### 5.1 제작 화면 (`dialect_my_map.html`)

- [x] 본문 너비 **4단계 탭** (클릭·키보드 이동)
  1. 표제어 등록  
  2. 어휘 추가  
  3. 그룹·부호·면색·지역  
  4. 지도 확인  
- [x] 탭 가드: 표제어 없이 2+ 이동 시 안내, 지역어 없이 3+ 이동 시 안내
- [x] 표제어 CRUD (품사·의미·appro, use_yn 표시)
- [x] 지역어 추가 + **그룹 선택(순차 생성만)**  
- [x] 그룹 내 순서 자동 부여 / 재정렬 / 삭제 시 압축  
- [x] **그룹 단위 면색** (한 그룹 = 한 색)  
- [x] 면색 **~70색 팔레트** 클릭 즉시 저장  
- [x] 상징 부호 선택 (프로토 카탈로그 6종 shape)  
- [x] 지도 클릭·검색 지역 매핑 (배타 소유, reassign toast)  
- [x] **지도 면색 + 부호 마커** 실시간 미리보기  
- [x] 북한 **도 단위** 선택 (기본 채움 흰색 = 남한과 동일)  
- [x] 최종 저장 (`map_make=Y`) / 지도보기 이동  
- [x] GNB·마이페이지 연결  

### 5.2 지도보기 (`my_map_view.html`) — dialect_map 유사

- [x] **3열**: 좌 표제어 목록 · 중 지도 · 우 표시·범례  
- [x] 지도 설정: 하천/철도/도로/산맥, 시·도·시군구 라벨, 면색·부호 숨기기  
- [x] 다운로드: PNG / PDF(인쇄) / CSV  
- [x] 우측 체크박스로 지역어 on/off  
- [x] 면색·부호 동시 표시  

### 5.3 목록 (`mypage_map.html`)

- [x] 표제어 카드: 지도보기 / 편집 / 삭제  
- [x] 최종저장 여부 표시  

### 5.4 그룹·순서 비즈니스 규칙 (강제)

| 규칙 | 동작 |
|------|------|
| 그룹 순차 생성 | 1 없이 2 생성 불가. 선택지 = 기존 그룹 + next only |
| 순서 순차 | 그룹 내 1..n, 중복 없음, 추가 시 맨 끝 |
| 순서 변경 | select로 이동 후 재번호 |
| 그룹 삭제/이동 후 | seq·group 번호 compact |
| 면색 | `setGroupColor`로 그룹 전원 동일 |

---

## 6. 미구현 / 다음 작업 (우선순위 제안)

### P1 — 운영 패리티 (데이터 입력)

| 항목 | 설명 |
|------|------|
| 어휘 **가져오기** | 공개 지도/조사 표제어에서 이관 (`dialectins` 대응) |
| **엑셀** 업로드·다운로드 | 운영 컬럼 호환 템플릿 |
| 상징 PNG 카탈로그 | `tb_map_symbol` / `upload/map/symbol` 연동 |
| 서비스 신청 후 상태 워크플로 | `use_yn` 관리자 반영 흉내 또는 API |

### P2 — DB 연동 (최종)

1. `MyMapStore` 를 REST 어댑터로 교체 (메서드 시그니처 유지 권장)
2. CRUD → `kd_headword` / `tb_headword_dialect` / `tb_headword_dialect_region`
3. `region_id` 매핑: `muni_*` / `prov_*` → 공식 코드
4. 로그인: 운영/회원 세션 연동 (시연 `demo` 제거)
5. 기존 회원 mydialect 데이터 이관 스크립트

### P3 — 품질·운영

- 지도 클릭 팝업 (지역·어휘 상세) dialect_map 수준  
- 성능: 대량 region fill  
- 접근성·모바일 폴리시  
- 테스트 자동화 (그룹 규칙·PIP)

---

## 7. 주요 API 스케치 (프로토 → DB)

### 현재 (클라이언트)

```js
MyMapStore.listHeadwords()
MyMapStore.saveHeadword({ headword, word_class, meaning, appro, headword_no? })
MyMapStore.listDialects(headwordNo)
MyMapStore.saveDialect({ headword_no, word, mutation_group, mutation_seq?, face_color?, map_symbol_id?, hd_id? })
MyMapStore.groupSelectOptions(headwordNo)  // { existing, nextNew }
MyMapStore.setGroupColor(headwordNo, group, color)
MyMapStore.reorderDialectInGroup(hdId, targetSeq)
MyMapStore.toggleRegion(hdId, { region_id, region_nm })
MyMapStore.buildFillByHeadword(headwordNo)
MyMapStore.finalizeHeadword(headwordNo)
MyMapStore.validateHeadwordReady(headwordNo)

MyMapRegions.pickRegionAtLonLat(lon, lat)
MyMapRegions.pickRegionAtMapCoord(coord3857)
MyMapRegions.getGeometry(regionId)
MyMapRegions.getCentroidLonLat(regionId)
```

### 향후 REST 예시

```
GET/POST   /api/my-maps/headwords
GET/PUT    /api/my-maps/headwords/{headwordNo}
GET/POST   /api/my-maps/headwords/{headwordNo}/dialects
PUT/DELETE /api/my-maps/dialects/{hdId}
POST       /api/my-maps/dialects/{hdId}/regions  (toggle)
POST       /api/my-maps/headwords/{headwordNo}/finalize
```

---

## 8. 로컬 실행 방법

```bash
cd /Users/aaa/inseq/korean
# 이미 8765가 떠 있으면 그 서버 cwd 확인 필수 (옛 서버는 파일 없음 → 404)
python3 -m http.server 8765 --bind 127.0.0.1
```

| URL | 용도 |
|-----|------|
| `/dialect_my_map.html` | 제작 |
| `/my_map_view.html?headword_no=` | 지도보기 |
| `/mypage_map.html` | 목록 |
| `/dialect_map.html` | 공개 지도 (참고 UI) |

**주의:** 과거에 다른 cwd로 띄운 `http.server` 가 8765를 점유하면 **구버전 gnb / 404** 가 난다.  
`lsof -i :8765` 로 cwd 확인. 메인 작업 디렉터리는 **`/Users/aaa/inseq/korean`**.

스크립트 캐시: HTML에 `?v=` 쿼리가 있음. 갱신 후 강력 새로고침.

---

## 9. 파일 변경 맵 (핸드오프 체크리스트)

### 신규

- `dialect_my_map.html`
- `my_map_view.html`
- `mypage_map.html` (기존 스텁 연결·구현)
- `my-map.js`
- `my-map-store.js`
- `my-map-regions.js`
- `docs/my-map-handoff.md` (본 문서)
- (worktree) `design_my_map_tobe.md` — 초기 TO-BE 설계

### 수정

- `gnb.js` — 메뉴 href, active menu path
- `styles.css` — mega-menu current 등 (일부)
- `dialect_our_town.html` / `dialect_gisangdo.html` — 하위 메뉴 옵션 (선택)

### 재사용 (수정 최소화)

- `korea-map.js`, `skorea-*.js`, `dialect_map.html` / `dialect-map-core.js` (UI 참고)

---

## 10. 알려진 이슈·결정

| 항목 | 상태 |
|------|------|
| 운영 Naver vs 로컬 OL | **OL 유지** 결정 |
| 지역 클릭 오매칭 (부산→경기) | PIP를 GeoJSON 경위도로 수정 완료. 재발 시 `updateSize`/캐시 확인 |
| 북한 | 시·군·구 없음 → **도 단위만** |
| 상징 | 프로토는 vector shape 6종. 운영 PNG 세트는 미연동 |
| 엑셀/가져오기 | 미구현 |
| DB | 미연동. localStorage only |
| 운영 dialectheadword URL 오타 | `mode=C&'/>` — 로컬은 재현하지 않음 |

---

## 11. 추천 작업 순서 (다음 담당자)

1. **로컬 서버를 `korean` 루트에서 기동** 후 제작→최종저장→지도보기→목록 E2E 수동 확인  
2. 그룹 규칙 단위 테스트 보강 (store only, node 가능)  
3. 엑셀 import/export 스펙 확정 후 UI  
4. `MyMapStore` REST 스텁 + 서버 CRUD (SQLite `dialect_local.db`)  
5. `region_id` 공식 코드 매핑  
6. 운영 계정 데이터 이관 검증  

---

## 12. 빠른 코드 진입점

| 하고 싶은 일 | 볼 파일 |
|--------------|---------|
| 탭·폼·즉시저장 UI | `my-map.js`, `dialect_my_map.html` |
| 그룹/면색 규칙 | `my-map-store.js` (`saveDialect`, `setGroupColor`, `groupSelectOptions`) |
| 지도 클릭·북한 | `my-map-regions.js` (`pickRegionAtLonLat`) |
| 면색+부호 레이어 | `my-map.js` (`rebuildFill`, `markerStyle`) |
| 3열 뷰어·설정·다운로드 | `my_map_view.html` |
| 메뉴 연결 | `gnb.js` |
| DB 컬럼 확인 | `sqlite3 dialect_local.db` + §3 |
| 공개 지도 면색 로직 | `scripts/export_map_headword.py`, `dialect-map-core.js` |

---

## 13. 변경 이력 (요약)

| 시기 | 내용 |
|------|------|
| 분석 | 운영 mydialect·표제어·mymap·로컬 DB 스키마 조사 |
| 프로토 v1 | 과도 단순 (제목+단어+지역) → 피드백 후 확장 |
| 프로토 v2 | DB 컬럼 정합 localStorage, 4단계 탭, 그룹 규칙, 팔레트 면색 |
| 지도 | PIP 수정, 북한 도, 부호 마커, 흰색 기본 채움 |
| 뷰어 | dialect_map형 3열, 설정·다운로드, 마이페이지 연결 |
| 탭 UI | 본문 너비 4탭 + 클릭/키보드 이동 |

---

*이 문서는 핸드오프용입니다. 구현이 바뀌면 §5·§6·§9를 우선 갱신하세요.*
