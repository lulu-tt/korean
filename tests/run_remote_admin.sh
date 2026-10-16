#!/bin/bash
# 관리자 인증 구간 테스트 — JSESSIONID 값만 붙여넣으면 된다(화면에 표시되지 않음, 기록도 남지 않음).
cd "$(dirname "$0")/.." || exit 1
printf 'JSESSIONID 값만 붙여넣고 Enter (JSESSIONID= 는 빼고): '
read -rs v; echo
v="${v#JSESSIONID=}"; v="$(printf '%s' "$v" | tr -d '[:space:]')"
[ -z "$v" ] && { echo "값이 비어 있습니다"; exit 1; }
DEV_COOKIE="JSESSIONID=$v" python3 -m unittest tests.test_remote_dev.TestAdminAuthenticated -v
