# 음운 시트 ETL (실엑셀 원문 only)

## 정책

- **응답 셀 값은 엑셀에 있는 문자열만** 저장합니다.
- 합성·시연·추정 데이터(가짜 사용률, 합류 판정 등)를 **생성하지 않습니다**.
- 허용 가공: trim, `20101.0`→`20101`, HTML 엔티티 복원, 파일명 NFC 정규화.
- `place_name` / `survey_year` 는 헤더 파싱 **보조 필드**이며, 정본은 `raw_header`, `raw_text` 입니다.

## 실행

```bash
cd /Users/aaa/inseq/korean
python3 scripts/etl_phonology.py
# 옵션
python3 scripts/etl_phonology.py --data-dir ./data --out-dir ./data/processed
```

의존성: `openpyxl`, `xlrd`

## 산출물 (`data/processed/`)

| 파일 | 설명 |
|------|------|
| `dialect_phonology.db` | SQLite (import_batch, survey_site, item, response) |
| `phonology_meta.json` | 건수·지점·배치 메타 |
| `phonology_items.json` | 항목 인덱스(부모/자식) |
| `phonology_responses.jsonl` | 전체 응답 1행 1 JSON |
| `items/{code}.json` | 항목별 응답 (뷰어용) |
| `site_map.json` / `site_map.csv` | 지점 헤더 매핑 |
| `etl_report.md` | 검증 리포트 |

## 뷰어

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/dialect_phonology_compare.html
```

`file://` 로는 JSON fetch가 막힐 수 있습니다.

## 재적재

관리자가 엑셀을 교체한 뒤 동일 명령을 다시 실행하면 `data/processed` 를 덮어씁니다.
DB는 매번 새로 생성합니다 (전체 교체).
