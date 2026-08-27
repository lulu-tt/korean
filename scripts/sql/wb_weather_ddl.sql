-- ============================================================================
-- 지역어 기상도 전용 테이블 (CUBRID)
--
--  설계 전제
--   · 원자료 파일 1개 = 제보자 1명. 지역·연차·세대·성별은 파일명에서 읽는다.
--       파일명 규약 {지역2}{연차2}{세대2}{성별1}VE.xlsx  예) CB2420FVE
--   · 한 행 = (제보자, 항목, 어형) 하나. 같은 항목에 어형이 여러 개면 행이 늘어난다.
--   · 추가 어형 행은 일련번호를 비워 두는 관행이 있다(전체의 6.8%) → serial_no NULL 허용.
--   · 등급(사용도/인지도) 1 사용 / 2 이해 / 3 인지 / 4 무지. '*' 는 조사자 제시·제보자 미발화.
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
  CONSTRAINT pk_wb_weather_response PRIMARY KEY (response_id),
  CONSTRAINT fk_wwr_file FOREIGN KEY (weather_file_id)
    REFERENCES wb_weather_file (weather_file_id)
);
CREATE INDEX ix_wwr_file   ON wb_weather_response (weather_file_id, line_no);
CREATE INDEX ix_wwr_item   ON wb_weather_response (item_base, grade_valid_yn);
CREATE INDEX ix_wwr_head   ON wb_weather_response (headword);

-- ── 3. 지역 단위 집계 (화면이 읽는 결과) ────────────────────────────────
--  세대(20/50/70)별 집계 표는 두지 않는다. 세대별 제보자가 1~2명이라
--  비율로 쓸 수 없고 사례로만 인용해야 하기 때문이다. 필요하면 2번 표를 직접 조회한다.
DROP TABLE IF EXISTS wb_weather_region_stat;
CREATE TABLE wb_weather_region_stat (
  region_cd         CHAR(2)       NOT NULL,
  item_base         VARCHAR(5)    NOT NULL,
  headword          VARCHAR(100),
  state             VARCHAR(4)    NOT NULL,           -- w1 w2 w3 w4 / std / w0
  use_rate          DECIMAL(5,2),                     -- 등급1 비율 (%)
  informant_cnt     INTEGER       DEFAULT 0,          -- 조사된 제보자 수
  dialect_cnt       INTEGER       DEFAULT 0,          -- 지역어형 응답 수
  std_only_yn       CHAR(1)       DEFAULT 'N',        -- 전원 표준어형만 응답
  core_yn           CHAR(1)       DEFAULT 'N',        -- 9개 지역 전부에서 등급 관측(서비스 대상)
  note              VARCHAR(500),
  calc_dt           DATETIME      DEFAULT SYSDATETIME,
  CONSTRAINT pk_wb_weather_region_stat PRIMARY KEY (region_cd, item_base)
);
CREATE INDEX ix_wwrs_state ON wb_weather_region_stat (item_base, state);

-- ── 4. 표준어 허용형 (표준어권 판정용) ──────────────────────────────────
--  지금 data/processed/standard_forms_allowlist.json 이 하는 일. 표로 옮겨 관리자가 편집한다.
DROP TABLE IF EXISTS wb_weather_std_form;
CREATE TABLE wb_weather_std_form (
  std_form_id       INTEGER       NOT NULL,
  item_base         VARCHAR(5)    NOT NULL,
  std_form          VARCHAR(200)  NOT NULL,           -- 표준어로 처리할 어형
  memo              VARCHAR(300),
  use_yn            CHAR(1)       DEFAULT 'Y',
  reg_id            VARCHAR(50),
  reg_dt            DATETIME      DEFAULT SYSDATETIME,
  CONSTRAINT pk_wb_weather_std_form PRIMARY KEY (std_form_id),
  CONSTRAINT uq_wwsf UNIQUE (item_base, std_form)
);
