document.addEventListener('DOMContentLoaded', () => {
  const gnbContainer = document.getElementById('gnb-common');
  if (!gnbContainer) return;

  // 1. GNB 마크업 동적 삽입
  gnbContainer.innerHTML = `
<div class="gov-banner" id="krds-masthead">
  <div class="wrap gov-banner__inner">
    <span class="gov-banner__text">이 누리집은 대한민국 공식 전자정부 누리집입니다.</span>
  </div>
</div>

<header class="topbar">
  <div class="wrap topbar__inner">
    <div class="brand" onclick="location.href='./index.html'" style="cursor:pointer;">
      <img src="./logo_korean_horizontal.png" alt="문화체육관광부 국립국어원" class="brand__logo-org">
      <img src="./logo_dialect.png" alt="지역어 종합 정보 Center for Korean Dialects" class="brand__logo-svc">
    </div>

    <button type="button" class="navtoggle" id="navToggle" aria-expanded="false" aria-controls="navDrawer" aria-label="전체 메뉴 열기">
      <i class="ti ti-menu-2" aria-hidden="true"></i>
    </button>

    <div class="navdrawer" id="navDrawer">
      <nav class="nav" aria-label="주요 메뉴">
        <div class="nav__item">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-search')">
            지역어 검색 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <!-- 메가메뉴 패널 1: 지역어 검색 -->
          <div id="menu-search" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">지역어 검색</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./dialect_search_prototype.html" class="mega-menu__link">통합자료검색</a></div>
                <div class="mega-menu__item"><a href="./vocab_dialect.html" class="mega-menu__link">어휘조사자료</a></div>
                <div class="mega-menu__item"><a href="./oral_dialect.html" class="mega-menu__link">구술발화조사자료</a></div>
                <div class="mega-menu__item"><a href="./dialect_variant_compare.html" class="mega-menu__link">지역어 변이형 비교</a></div>
                <div class="mega-menu__item"><a href="./dialect_phonology_compare.html" class="mega-menu__link">지역어 음운 비교</a></div>
              </div>
            </div>
          </div>
        </div>
        <div class="nav__item">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-map')">
            지역어 지도 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <!-- 메가메뉴 패널 2: 지역어 지도 -->
          <div id="menu-map" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">지역어 지도</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./dialect_map.html" class="mega-menu__link">지역어 지도</a></div>
                <div class="mega-menu__item"><a href="./dialect_our_town.html" class="mega-menu__link">지역어 지도 비교</a></div>
                <div class="mega-menu__item"><a href="#" class="mega-menu__link">나만의 지도 제작</a></div>
                <div class="mega-menu__item"><a href="./dialect_gisangdo.html" class="mega-menu__link">지역어 기상도</a></div>
              </div>
            </div>
          </div>
        </div>
        <div class="nav__item">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-archive')">
            지역어 자료관 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <!-- 메가메뉴 패널 3: 지역어 자료관 -->
          <div id="menu-archive" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">지역어 자료관</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./literature_dialect.html" class="mega-menu__link">문학 속 지역어</a></div>
                <div class="mega-menu__item"><a href="./region_culture.html" class="mega-menu__link">사진으로 보는 생활어</a></div>
                <div class="mega-menu__item"><a href="./data_room.html" class="mega-menu__link">자료실</a></div>
                <div class="mega-menu__item"><a href="#" class="mega-menu__link">Open API</a></div>
              </div>
            </div>
          </div>
        </div>
        <div class="nav__item">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-board')">
            알림마당 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <!-- 메가메뉴 패널 4: 알림마당 -->
          <div id="menu-board" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">알림마당</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./notice.html" class="mega-menu__link">공지사항</a></div>
                <div class="mega-menu__item"><a href="./faq.html" class="mega-menu__link">도움말(FAQ)</a></div>
                <div class="mega-menu__item"><a href="./mypage_opinion_write.html" class="mega-menu__link">의견제시</a></div>
              </div>
            </div>
          </div>
        </div>
        <div class="nav__item">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-about')">
            누리집소개 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <!-- 메가메뉴 패널 5: 누리집소개 -->
          <div id="menu-about" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">누리집소개</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./about_intro.html" class="mega-menu__link">사업 소개</a></div>
                <div class="mega-menu__item"><a href="./about_history.html" class="mega-menu__link">사업 연혁</a></div>
                <div class="mega-menu__item"><a href="./about_coverage.html" class="mega-menu__link">조사 현황</a></div>
                <div class="mega-menu__item"><a href="./about_related.html" class="mega-menu__link">연계 사업</a></div>
              </div>
            </div>
          </div>
        </div>
        <!-- 모바일 전용: 내 정보 (데스크톱에서는 우측 상단 util 영역에 노출) -->
        <div class="nav__item nav__item--auth">
          <button type="button" class="nav__link-btn" onclick="toggleMegaMenu(this, 'menu-my')">
            내 정보 <i class="ti ti-chevron-down nav__arrow"></i>
          </button>
          <div id="menu-my" class="mega-menu">
            <div class="mega-menu__inner">
              <div class="mega-menu__title">내 정보</div>
              <div class="mega-menu__grid">
                <div class="mega-menu__item"><a href="./mypage_edit.html" class="mega-menu__link" onclick="return openPwModal(event);">나의 정보 수정</a></div>
                <div class="mega-menu__item"><a href="./mypage_opinion.html" class="mega-menu__link">나의 의견 제시</a></div>
                <div class="mega-menu__item"><a href="./mypage_map.html" class="mega-menu__link">나의 지도</a></div>
                <div class="mega-menu__item"><a href="./mypage_withdraw.html" class="mega-menu__link">회원탈퇴</a></div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div class="topbar__actions util-links">
        <a href="./login.html" class="util-link">들어가기</a>
        <span class="util-divider">|</span>
        <a href="./register.html" class="util-link">회원가입</a>
        <span class="util-divider util-divider--my">|</span>
        <div class="util-mypage">
          <a href="#" class="util-link util-mypage__trigger" aria-haspopup="true" onclick="return false;">내정보 <i class="ti ti-chevron-down util-mypage__arrow" aria-hidden="true"></i></a>
          <div class="util-mypage__pop" role="menu" aria-label="내 정보 메뉴">
            <a href="./mypage_edit.html" class="util-mypage__link" role="menuitem" onclick="return openPwModal(event);">나의 정보 수정</a>
            <a href="./mypage_opinion.html" class="util-mypage__link" role="menuitem">나의 의견 제시</a>
            <a href="./mypage_map.html" class="util-mypage__link" role="menuitem">나의 지도</a>
            <a href="./mypage_withdraw.html" class="util-mypage__link" role="menuitem">회원탈퇴</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- 모바일 드로어 배경막 (드로어 열릴 때만 노출) -->
<div class="nav-backdrop" id="navBackdrop"></div>

<!-- 나의 정보 수정: 비밀번호 확인 레이어 팝업 (전 페이지 공통) -->
<div class="pw-modal-overlay" id="pwModal" hidden onclick="if(event.target===this) closePwModal();">
  <div class="pw-modal" role="dialog" aria-modal="true" aria-labelledby="pwModalTitle">
    <div class="pw-modal__header">
      <h2 class="pw-modal__title" id="pwModalTitle">비밀번호 확인</h2>
      <button type="button" class="pw-modal__close" aria-label="닫기" onclick="closePwModal()"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    <div class="pw-modal__body">
      <p class="pw-modal__desc">회원님의 정보를 안전하게 보호하기 위해 비밀번호를 다시 한 번 확인합니다.</p>
      <div class="pw-field">
        <span class="pw-field__label">아이디</span>
        <div class="pw-field__id">hanguk_user</div>
      </div>
      <div class="pw-field">
        <label class="pw-field__label" for="pwCheck">비밀번호</label>
        <input type="password" class="pw-field__input" id="pwCheck" placeholder="비밀번호를 입력해주세요" onkeydown="if(event.key==='Enter'){confirmPw();}">
      </div>
    </div>
    <div class="pw-modal__footer">
      <button type="button" class="pw-modal__btn pw-modal__btn--cancel" onclick="closePwModal()">취소</button>
      <button type="button" class="pw-modal__btn pw-modal__btn--confirm" onclick="confirmPw()">확인</button>
    </div>
  </div>
</div>
  `;

  // 2. 현재 페이지 경로를 검사하여 특정 탭 활성화 처리
  const currentPath = window.location.pathname;
  let activeMenuId = "";

  if (currentPath.includes('dialect_search_prototype.html') || currentPath.includes('vocab_dialect.html') || currentPath.includes('oral_dialect.html') || currentPath.includes('dialect_variant_compare.html') || currentPath.includes('dialect_phonology_compare.html')) {
    activeMenuId = "menu-search";
  } else if (currentPath.includes('dialect_map.html') || currentPath.includes('dialect_awareness.html') || currentPath.includes('dialect_our_town.html') || currentPath.includes('dialect_gisangdo.html')) {
    activeMenuId = "menu-map";
  } else if (currentPath.includes('region_culture.html') || currentPath.includes('literature_dialect.html') || currentPath.includes('data_room.html') || currentPath.includes('data_room_detail.html')) {
    activeMenuId = "menu-archive";
  } else if (currentPath.includes('notice.html') || currentPath.includes('faq.html')) {
    activeMenuId = "menu-board";
  } else if (currentPath.includes('about_intro.html') || currentPath.includes('about_history.html') || currentPath.includes('about_coverage.html') || currentPath.includes('about_related.html')) {
    activeMenuId = "menu-about";
  }

  // 현재 페이지에 해당하는 탭만 표시(밑줄)하고, 메가메뉴 패널은 접힌 상태로 둔다
  if (activeMenuId) {
    const btn = document.querySelector(`button[onclick*="${activeMenuId}"]`);
    if (btn) {
      btn.classList.add('is-active');
    }
  }

  // 3. 모바일 햄버거 메뉴 토글 (전역 메뉴를 화면 하단 드로어로 여닫기)
  const navToggle = document.getElementById('navToggle');
  const topbar = document.querySelector('.topbar');
  if (navToggle && topbar) {
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = topbar.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.innerHTML = isOpen
        ? '<i class="ti ti-x" aria-hidden="true"></i>'
        : '<i class="ti ti-menu-2" aria-hidden="true"></i>';
    });
  }
});

// ── 나의 정보 수정: 비밀번호 확인 레이어 팝업 (전역 노출) ──
// 메뉴 클릭 시 페이지를 이동하지 않고 현재 페이지에서 팝업을 띄운다.
window.openPwModal = function (event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('pwModal');
  if (!modal) return true; // 팝업이 없으면 기본 링크 동작 허용
  modal.removeAttribute('hidden');
  const pw = document.getElementById('pwCheck');
  if (pw) { pw.value = ''; setTimeout(() => pw.focus(), 50); }
  return false;
};

// 확인 버튼: 정보 수정 페이지로 이동
window.confirmPw = function () {
  window.location.href = './mypage_edit.html';
};

// 취소/닫기 버튼: 팝업만 닫고 현재 페이지 유지
window.closePwModal = function () {
  const modal = document.getElementById('pwModal');
  if (modal) modal.setAttribute('hidden', '');
};

// GNB 메가메뉴 토글 제어 함수 (전역 노출 - 마우스 호버 대신 클릭 토글 방식으로 변경)
window.toggleMegaMenu = function(btnEl, menuId) {
  const allMenus = document.querySelectorAll('.mega-menu');
  const allBtns = document.querySelectorAll('.nav__link-btn');
  const targetMenu = document.getElementById(menuId);

  if (!targetMenu) return;

  const isOpen = targetMenu.classList.contains('show');

  // 모든 메뉴 패널을 닫고, 화살표 아이콘 및 active 상태 초기화
  allMenus.forEach(menu => menu.classList.remove('show'));
  allBtns.forEach(b => {
    b.classList.remove('is-active');
    const arrow = b.querySelector('.nav__arrow');
    if (arrow) {
      arrow.classList.remove('ti-chevron-up');
      arrow.classList.add('ti-chevron-down');
    }
  });

  // 메뉴가 닫혀있었던 상태라면 열어줌
  if (!isOpen) {
    targetMenu.classList.add('show');
    if (btnEl) {
      btnEl.classList.add('is-active');
      const arrow = btnEl.querySelector('.nav__arrow');
      if (arrow) {
        arrow.classList.remove('ti-chevron-down');
        arrow.classList.add('ti-chevron-up');
      }
    }
  }
};

// 외부 영역 클릭 시 열려 있는 GNB 메가메뉴 및 모바일 드로어 닫기 처리
document.addEventListener('click', function(event) {
  const isInsideTopbar = event.target.closest('.topbar');
  if (!isInsideTopbar) {
    const allMenus = document.querySelectorAll('.mega-menu');
    const allBtns = document.querySelectorAll('.nav__link-btn');

    allMenus.forEach(menu => menu.classList.remove('show'));
    allBtns.forEach(b => {
      b.classList.remove('is-active');
      const arrow = b.querySelector('.nav__arrow');
      if (arrow) {
        arrow.classList.remove('ti-chevron-up');
        arrow.classList.add('ti-chevron-down');
      }
    });

    const topbar = document.querySelector('.topbar');
    const navToggle = document.getElementById('navToggle');
    if (topbar) topbar.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.innerHTML = '<i class="ti ti-menu-2" aria-hidden="true"></i>';
    }
  }
});
