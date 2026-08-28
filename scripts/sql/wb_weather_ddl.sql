-- ============================================================================
-- 지역어 기상도 전용 테이블 (CUBRID)
--
--  설계 전제
--   · 원자료 파일 1개 = 제보자 1명. 지역·연차·세대·성별은 파일명에서 읽는다.
--       파일명 규약 {지역2}{연차2}{세대2}{성별1}VE.xlsx  예) CB2420FVE
--   · 한 행 = (제보자, 항목, 어형) 하나. 같은 항목에 어형이 여러 개면 행이 늘어난다.
--   · 추가 어형 행은 일련번호를 비워 두는 관행이 있다(전체의 6.8%) → serial_no NULL 허용.
--   · 등급(사용도/인지도) 1 사용 / 2 이해 / 3 인지 / 4 무지. '*' 는 조사자 제시·제보자 미발화.
--   · 지역 점수 = 그 지역 제보자가 지역어형에 준 등급의 점수 평균
--       ① 사용 100 · ② 이해 75 · ③ 인지 50 · ④ 무지 25
--     상태 경계는 등급 사이의 중간값(87.5/62.5/37.5)이다. 별도 임계값을 두지 않는다.
--
--  기존 표와 겹치지 않는 이유
--   · wb_trs_file 계열은 전사파일(.trs/.eaf) 단위이고 타임코드·화자 구조를 갖는다.
--   · tb_dialect_new 는 응답 단위지만 등급(사용도/인지도) 축이 없다.
--   기상도는 '어형별 등급'이 핵심 축이라 별도 표가 맞다.
-- ============================================================================

-- ── 1. 업로드 파일 = 제보자 ──────────────────────────────────────────────
DROP TABLE IF EXISTS wb_weather_file;
CREATE TABLE wb_weather_file (
  weather_file_id   INTEGER       NOT NULL,           -- PK
  file_nm           VARCHAR(255)  NOT NULL,           -- 원본 파일명 (CB2420FVE.xlsx)
  region_cd         CHAR(2)       NOT NULL,           -- GG GW CB CN JB JN GB GN JJ
  region_nm         VARCHAR(20),                      -- 경기 강원 충북 …
  research_year     INTEGER,                          -- 2024
  research_degree   VARCHAR(4),                       -- 연차 코드 (파일명 2자리, 예 24)
  generation        INTEGER,                          -- 20 50 70
  sex               CHAR(1),                          -- M 남 / F 여
  row_cnt           INTEGER       DEFAULT 0,          -- 적재된 응답 행수
  item_cnt          INTEGER       DEFAULT 0,          -- 서로 다른 항목 수
  src_layout        VARCHAR(10),                      -- 'V5' 정리양식 5열 / 'RAW' 옛 14열
  use_yn            CHAR(1)       DEFAULT 'Y',
  reg_id            VARCHAR(50),
  reg_dt            DATETIME      DEFAULT SYSDATETIME,
  upt_id            VARCHAR(50),
  upt_dt            DATETIME,
  CONSTRAINT pk_wb_weather_file PRIMARY KEY (weather_file_id),
  CONSTRAINT uq_wb_weather_file_nm UNIQUE (file_nm)
);
CREATE INDEX ix_wwf_region  ON wb_weather_file (region_cd, generation, sex);
CREATE INDEX ix_wwf_year    ON wb_weather_file (research_year);

-- ── 2. 응답 상세 (행 단위 원자료) ───────────────────────────────────────
DROP TABLE IF EXISTS wb_weather_response;
CREATE TABLE wb_weather_response (
  response_id       INTEGER       NOT NULL,           -- PK
  weather_file_id   INTEGER       NOT NULL,           -- → wb_weather_file
  line_no           INTEGER       NOT NULL,           -- 파일 내 행 순번 (원본 순서 보존)
  serial_no         VARCHAR(30),                      -- 일련번호. 추가 어형 행은 NULL
  item_cd           VARCHAR(20)   NOT NULL,           -- 항목번호 (20101, 21804-A-1 …)
  item_base         VARCHAR(5),                       -- 항목번호 앞 5자리 (묶음·조인용)
  headword          VARCHAR(100),                     -- 표제어형
  dialect_form      VARCHAR(200),                     -- 방언형(기저형). 미발화는 '*'
  grade             VARCHAR(2),                       -- 1 2 3 4 / '*' / NULL(미기입)
  grade_valid_yn    CHAR(1)       DEFAULT 'N',        -- 집계 대상 여부 (grade in 1~4)
  use_yn            CHAR(1)       DEFAULT 'Y',
  reg_dt            DATETIME      DEFAULT SYSDATETIME,
  upt_dt            DATETIME,                         -- 관리자가 고친 행. 재업로드 경고의 근거
  CONSTRAINT pk_wb_weather_response PRIMARY KEY (response_id),
  CONSTRAINT fk_wwr_file FOREIGN KEY (weather_file_id)
    REFERENCES wb_weather_file (weather_file_id)
);
CREATE INDEX ix_wwr_file   ON wb_weather_response (weather_file_id, line_no);
CREATE INDEX ix_wwr_item   ON wb_weather_response (item_base, grade_valid_yn);
CREATE INDEX ix_wwr_head   ON wb_weather_response (headword);
