# CMS 목록 정적 대체본

Vercel·GitHub Pages 배포본에는 CMS API 함수가 없다(`vercel.json` 은
`weather/*` 와 `wordcard/*` 만 함수로 넘긴다). 나머지 목록 API 는 404 다.

각 관리 화면은 API 가 실패하면 이 폴더의 JSON 으로 물러난다.
응답 모양을 API 와 같게 맞춰 두어, 화면의 목록·페이저 코드는 그대로 쓴다.

## 다시 만들기

    python3 scripts/export_cms_static.py

`neibis-cms/serve.py` 의 `api_*_list` 를 그대로 불러 쓴다.
SQL 을 두 벌 두면 목록 규칙이 갈라진다.

## 담긴 것

| 파일 | 화면 | 건수 |
|---|---|---|
| headword_list.json | map/dialect.html | 2,556 |
| symbol_list.json | map/symbol.html | 570 |
| source_list.json | survey/source.html | 691 |
| oral_list.json | survey/oral.html | 1,832 |
| literature_list.json | archive/literature.html | 2,000 |
| user_list.json | system/user.html | 615 |
| survey_list.json | survey/surveyList.html | 3 |
| survey_legacy.json | survey/survey-legacy.html | 2 |
| stats_openapi.json | stats/api.html | 27 |
| vocab_list.json | survey/vocab.html | **2,000 / 313,783** |
| bbs_246·251·252·253·254·256.json | bbs/*/list.html | 각 20 |

`vocab_list.json` 만 전량이 아니다 — 31만 행은 정적으로 담을 수 없다.
`truncated: true` 와 `availableTotal` 로 표시해 두었고, 화면도 그 사실을 알린다.

## 안 되는 것

등록·수정·삭제·상태 변경은 API 가 있어야 한다. 배포본에서는 열람만 된다.
