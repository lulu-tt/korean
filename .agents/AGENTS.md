# Project Coding Rules & Standards

## 1. GNB, 서브 비주얼, Footer 공통 영역 준수
- `korean` 폴더 내에 생성하는 모든 HTML 페이지는 공통 GNB, 타이틀 영역(서브 비주얼 및 로케이션 바), Footer 마크업 구조를 완벽하게 유지하여 설계합니다.
- **Favicon & 이미지 상대 경로 지정**: 로고 이미지 및 파비콘 주소 등은 깨짐 방지를 위해 항상 상대 경로(`./logo_dialect.png`, `./favicon.ico`)로 일관되게 선언합니다.

## 2. GNB 메가메뉴 일치화
- 하위 2Depth 메뉴는 마우스 오버 시 메가메뉴 패널로 확장되는 최신 인터랙션 스크립트와 스타일을 공유합니다.
- 대메뉴 하단 활성화 표시 밑줄(`border-bottom: 3px solid var(--blue)`) 및 선택 메뉴 텍스트 아래 밑줄만 표시하는 미적 규칙을 유지합니다.
- **메뉴명 최신화**: '지역어 검색' > '통합자료검색'과 같이 일괄 최신화된 메뉴명 구조를 반영하여 페이지를 개발합니다.

## 3. 레이아웃 흔들림(Layout Shift) 방지 필수
- 본문이 긴 페이지와 짧은 페이지 간의 전환 시, 브라우저 우측 세로 스크롤바 유무에 의해 레이아웃 전체가 좌우로 움직이며 흔들리는 현상을 차단합니다.
- 이를 위해 모든 HTML 파일은 `styles.css`에 선언된 `html { scrollbar-gutter: stable; }` 공통 레이아웃 규칙을 상속받아 흔들림 없는 뷰포트를 제공해야 합니다.

## 4. 관리자 개발서버(AS-IS) 및 DB 접속/재기동 절차
- **서버 용도**: `korean` 관리자 개발서버 (as-is) (`inseqdev-proj-t550`)
- **IP**: `192.168.0.223` (SSH Port 22)
- **계정/비밀번호**: `tomcat` / `xhazot123!@#$$%%`
- **서버 중단/재기동 명령 절차**:
  1. `./02-tomcat-proj-pgm-kill.sh` (프로세스 종료)
  2. `./02-tomcat-proj-pgm-start.sh` (프로세스 시작)
- **CUBRID DB 접속 정보**:
  - Host / IP: `192.168.0.221` (Port 30000)
  - Database: `dialect`
  - 계정 / 비밀번호: `dialect` / `dialect1!`
  - JDBC URL: `jdbc:cubrid:192.168.0.221:30000:dialect:::`


