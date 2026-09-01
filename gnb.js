/*
 * gnb.js — 공통 상단 배너(masthead) + 헤더(GNB) 주입.
 *
 * 마크업은 퍼블리싱 산출물 publishing/html/ko/_include/inc-header.html,
 * inc-masthead.html 을 옮겨 온 것이다. 원본은 w3-include-html 로 불러오지만
 * 여기서는 JS 로 넣는다. 인클루드된 마크업의 ../../../assets/ 는 페이지 기준으로
 * 풀려서 그대로 두면 깨지므로 경로는 ./publishing/assets/ 로 바꿔 두었다.
 *
 * 메뉴는 아래 MENU 자료구조에서 렌더링한다. 활성 표시는 현재 파일명으로 정한다.
 * 목록에 없는 상세 페이지는 PARENT 에서 부모 링크를 찾는다.
 *
 * 동작(드롭다운, 모바일 전체메뉴, 내 정보 팝업)은 퍼블리싱의
 * publishing/assets/_common/js/ui-global.js 가 맡는다. 각 페이지가 이 파일과
 * 함께 그 스크립트를 불러온다.
 */

const GNB_MENU = [
  {
    title: '지역어 검색',
    items: [
      { label: '통합자료검색',       href: './dialect_search_prototype.html' },
      { label: '어휘조사자료',       href: './vocab_dialect.html' },
      { label: '구술발화조사자료',   href: './oral_dialect.html' },
      { label: '지역어 변이형 비교', href: './dialect_phonology_compare.html' },
    ],
  },
  {
    title: '지역어 지도',
    items: [
      { label: '지역어 지도',        href: './dialect_map.html' },
      { label: '지역어 지도 비교',   href: './dialect_our_town.html' },
      { label: '나만의 지도 제작',   href: './dialect_my_map.html' },
      { label: '지역어 현황(기상도)', href: './dialect_gisangdo.html' },
      { label: '세대별 지역어 변화', href: './dialect_wordcard.html' },
    ],
  },
  {
    title: '지역어 자료관',
    items: [
      { label: '문학 속 지역어',       href: './literature_dialect.html' },
      { label: '사진으로 보는 생활어', href: './region_culture.html' },
      { label: '자료실',               href: './data_room.html' },
      { label: 'Open API',             href: './openapi_intro.html' },
    ],
  },
  {
    title: '알림마당',
    items: [
      { label: '공지사항', href: './notice.html' },
      { label: '도움말',   href: './faq.html' },
      { label: '의견제시', href: './mypage_opinion_write.html' },
    ],
  },
  {
    title: '누리집소개',
    items: [
      { label: '사업소개', href: './about_intro.html' },
      { label: '사업연혁', href: './about_history.html' },
      { label: '조사현황', href: './about_coverage.html' },
    ],
  },
];

// 메뉴에 직접 걸려 있지 않은 페이지 -> 활성 표시를 물려받을 메뉴 페이지.
// 상세/변형 페이지들이다.
const GNB_PARENT = {
  'vocab_dialect_live.html':    'vocab_dialect.html',
  'oral_dialect_live.html':     'oral_dialect.html',
  'my_map_view.html':           'dialect_my_map.html',
  'dialect_awareness.html':     'dialect_map.html',
  'region_culture_list.html':   'region_culture.html',
  'region_culture_detail.html': 'region_culture.html',
  'data_room_detail.html':      'data_room.html',
  'notice_detail.html':         'notice.html',
  'openapi_guide.html':         'openapi_intro.html',
  'openapi_key.html':           'openapi_intro.html',
};

const GNB_UTIL = [
  { label: '나의 정보 수정',  href: './mypage_edit.html' },
  { label: '나의 의견 제시',  href: './mypage_opinion.html' },
  { label: '나의 지도',       href: './mypage_map.html' },
  { label: '회원탈퇴',        href: '#' },
];

function gnbCurrentPage() {
  const file = (location.pathname.split('/').pop() || 'index.html');
  return GNB_PARENT[file] ? GNB_PARENT[file] : file;
}

function gnbEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const gnbContainer = document.getElementById('gnb-common');
  if (!gnbContainer) return;

  const current = gnbCurrentPage();
  const chev = '<i class="svg-icon ico-chevron-gray ico-sm" aria-hidden="true"></i>';
  const chevRight = '<i class="svg-icon ico-chevron-gray ico-sm ico-right" aria-hidden="true"></i>';

  // 현재 페이지가 속한 대메뉴 인덱스. 없으면 -1(어느 것도 활성 아님).
  const activeGroup = GNB_MENU.findIndex(
    (g) => g.items.some((it) => it.href.replace('./', '') === current)
  );

  const isActiveItem = (it) => it.href.replace('./', '') === current;

  const desktopMenu = GNB_MENU.map((group, gi) => {
    const panelId = `gnb-panel-${gi + 1}`;
    const on = gi === activeGroup;
    const links = group.items.map((it) => `
                  <li>
                    <a href="${gnbEsc(it.href)}" class="gnb-panel-link${isActiveItem(it) ? ' active' : ''}"${isActiveItem(it) ? ' aria-current="page"' : ''}>
                      ${gnbEsc(it.label)}${chevRight}
                    </a>
                  </li>`).join('');
    return `
          <li class="gnb-item">
            <button type="button" class="gnb-toggle${on ? ' active' : ''}"${on ? ' aria-current="page"' : ''} aria-expanded="false" aria-haspopup="true" aria-controls="${panelId}">
              ${gnbEsc(group.title)}${chev}
            </button>
            <div class="gnb-panel" id="${panelId}" hidden>
              <div class="inner">
                <strong class="gnb-panel-tit">${gnbEsc(group.title)}</strong>
                <ul class="gnb-panel-list">${links}
                </ul>
              </div>
            </div>
          </li>`;
  }).join('');

  const mobileMenu = GNB_MENU.map((group, gi) => {
    const panelId = `mobile-panel-${gi + 1}`;
    const on = gi === activeGroup;
    const links = group.items.map((it) => `
            <li><a href="${gnbEsc(it.href)}" class="mobile-menu-sub-link${isActiveItem(it) ? ' active' : ''}"${isActiveItem(it) ? ' aria-current="page"' : ''}>${gnbEsc(it.label)}</a></li>`).join('');
    return `
        <li class="mobile-menu-item">
          <button type="button" class="mobile-menu-toggle${on ? ' active' : ''}" aria-expanded="${on}" aria-controls="${panelId}">
            ${gnbEsc(group.title)}
            <i class="svg-icon ico-chevron-gray" aria-hidden="true"></i>
          </button>
          <ul class="mobile-menu-panel" id="${panelId}"${on ? '' : ' hidden'}>${links}
          </ul>
        </li>`;
  }).join('');

  const utilLinks = GNB_UTIL.map(
    (it) => `<a href="${gnbEsc(it.href)}" class="util-mypage-link" role="menuitem">${gnbEsc(it.label)}</a>`
  ).join('\n            ');

  const mobileUtilLinks = GNB_UTIL.map(
    (it) => `<li><a href="${gnbEsc(it.href)}" class="mobile-menu-sub-link">${gnbEsc(it.label)}</a></li>`
  ).join('\n            ');

  const branding = `
        <div class="branding">
          <a href="./index.html" class="logo logo-korean">
            <img src="./publishing/assets/_common/images/logo-korean@2x.png" alt="문화체육관광부 국립국어원 로고" />
          </a>
          <a href="./index.html" class="logo logo-dialect">
            <img src="./publishing/assets/_common/images/logo-dialect@2x.png" alt="지역어 종합 정보 로고" />
          </a>
        </div>`;

  gnbContainer.innerHTML = `
<div class="masthead">
  <div class="inner">
    <i class="svg-icon ico-flag ico-xl" aria-hidden="true"></i>
    이 누리집은 대한민국 공식 전자정부 누리집입니다.
  </div>
</div>

<header class="header">
  <div class="inner">
    <div class="header-nav">${branding}
    </div>

    <nav class="gnb" id="gnb" aria-label="주 메뉴">
      <ul class="gnb-list">${desktopMenu}
      </ul>
    </nav>

    <ul class="util-menu">
      <li>
        <strong class="util-nickname">
          <i class="svg-icon ico-user" aria-hidden="true"></i>
          닉네임은홍길동입니다
        </strong>
      </li>
      <li class="util-mypage">
        <button type="button" class="util-link util-mypage-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="util-mypage-panel">
          내 정보${chev}
        </button>
        <div class="util-mypage-pop" id="util-mypage-panel" role="menu" aria-label="내 정보 메뉴" hidden>
            ${utilLinks}
        </div>
      </li>
      <li>
        <a href="./login.html" class="util-link">
          <i class="svg-icon ico-logout ico-sm" aria-hidden="true"></i>
          나가기
        </a>
      </li>
    </ul>

    <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="mobile-menu" aria-label="전체메뉴 열기">
      <span class="sr-only">전체메뉴 열기</span>
    </button>
  </div>

  <div class="mobile-menu" id="mobile-menu">
    <div class="mobile-menu-head">${branding}
      <button type="button" class="mobile-menu-close" aria-label="메뉴 닫기">
        <span class="sr-only">메뉴 닫기</span>
      </button>
    </div>

    <div class="mobile-menu-util">
      <span class="util-link util-nickname">
        <i class="svg-icon ico-user" aria-hidden="true"></i>
        닉네임은홍길동입니다
      </span>
      <span class="util-divider" aria-hidden="true"></span>
      <a href="./login.html" class="util-link">
        <i class="svg-icon ico-logout ico-sm" aria-hidden="true"></i>
        나가기
      </a>
    </div>

    <ul class="mobile-menu-list">${mobileMenu}
      <li class="mobile-menu-item">
        <button type="button" class="mobile-menu-toggle" aria-expanded="false" aria-controls="mobile-panel-my">
          내 정보
          <i class="svg-icon ico-chevron-gray" aria-hidden="true"></i>
        </button>
        <ul class="mobile-menu-panel" id="mobile-panel-my" hidden>
            ${mobileUtilLinks}
        </ul>
      </li>
    </ul>
  </div>
</header>
  `;
});
