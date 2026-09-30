document.addEventListener('DOMContentLoaded', () => {
  const footerContainer = document.getElementById('footer-common');
  if (!footerContainer) return;

  /* 운영 사이트(NEIBIS)의 푸터와 동일한 구성.
     페이지마다 .footer / .footer__* 를 각자 정의하고 있어 클래스명이 겹치면 조용히 깨지므로,
     새 푸터는 고유 접두사(kfoot)로 스코프하고 CSS도 이 파일 안에 함께 둔다. */
  if (!document.getElementById('kfoot-css')) {
    const st = document.createElement('style');
    st.id = 'kfoot-css';
    st.textContent = `
/* 본문 마지막 섹션에 바로 붙인다 — margin-top 을 두면 body 배경(#f8fafc)이 회색 띠로 비친다 */
.kfoot { background:#f4f5f6; color:#1e2124; padding:40px 0 24px; margin-top:0; font-size:15px; line-height:1.5; text-align:left; }
.kfoot__inner { padding:0 32px; box-sizing:border-box; }
.kfoot__main { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin:0 0 24px; }
.kfoot__branding { display:flex; align-items:center; margin:0 0 24px; }
.kfoot__logo { display:flex; align-items:center; }
.kfoot__logo img { display:block; max-width:100%; width:auto; }
.kfoot__logo--org { padding-right:16px; border-right:1px solid #cbd5e1; }
.kfoot__logo--org img { height:40px; }
.kfoot__logo--svc { margin-left:16px; }
.kfoot__logo--svc img { height:32px; }
.kfoot__info { display:flex; flex-direction:column; font-style:normal; font-size:15px; line-height:1.5; }
.kfoot__loc { margin:0 0 8px; }
.kfoot__info dl { display:flex; flex-wrap:wrap; gap:4px 8px; margin:0; }
.kfoot__row { display:flex; gap:12px; }
.kfoot__row dt { color:#464c53; font-weight:700; }
.kfoot__row dd { margin:0; }
.kfoot__bottom { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px 16px; padding:16px 0 0; border-top:1px solid #cdd1d5; }
.kfoot__links { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.kfoot__links a { color:#1e2124; text-decoration:none; }
.kfoot__links a:hover { text-decoration:underline; }
.kfoot__links a.kfoot__privacy { color:#256ef4; font-weight:700; }
.kfoot__copy { margin:0; color:#464c53; }
.kfoot__notice { display:flex; align-items:center; gap:14px; margin:24px 0 0; padding:8px 16px; background:#fff; border-radius:8px; font-size:15px; }
.kfoot__notice img { display:block; height:48px; width:auto; margin:-8px 0; }
.kfoot__notice p { margin:0; }
@media (max-width: 900px) {
  .kfoot { padding:32px 0 20px; }
  .kfoot__inner { padding:0 14px; }
  .kfoot__main { flex-direction:column; margin-bottom:20px; }
  .kfoot__branding { margin-bottom:16px; }
  .kfoot__logo--org img { height:32px; }
  .kfoot__logo--org { padding-right:12px; }
  .kfoot__logo--svc { margin-left:12px; }
  .kfoot__logo--svc img { height:26px; }
  .kfoot__info, .kfoot__info dl, .kfoot__row { font-size:14px; }
  .kfoot__row { flex-wrap:wrap; gap:2px 10px; }
  .kfoot__bottom { flex-direction:column; align-items:flex-start; }
  .kfoot__copy { font-size:13px; }
  .kfoot__notice { margin-top:20px; gap:10px; padding:8px 12px; font-size:14px; }
  .kfoot__notice img { height:40px; margin:-6px 0; }
}`;
    document.head.appendChild(st);
  }

  footerContainer.innerHTML = `
<footer class="kfoot">
  <div class="kfoot__inner">
    <div class="kfoot__main">
      <div class="kfoot__left">
        <div class="kfoot__branding">
          <a class="kfoot__logo kfoot__logo--org" href="./index.html"><img src="./logo_korean_horizontal.png" alt="문화체육관광부 국립국어원 로고"></a>
          <a class="kfoot__logo kfoot__logo--svc" href="./index.html"><img src="./logo_dialect.png" alt="지역어 종합 정보 로고"></a>
        </div>
        <address class="kfoot__info">
          <span class="kfoot__loc">(07511) 서울특별시 강서구 금낭화로 154(방화동 827) 국립국어원</span>
          <dl>
            <div class="kfoot__row"><dt>대표전화</dt><dd>02-2669-9775</dd></div>
            <div class="kfoot__row"><dt>일반문의</dt><dd>홈페이지 &gt; 기관소개 &gt; 찾아오시는 길 참조</dd></div>
          </dl>
        </address>
      </div>
    </div>
    <div class="kfoot__bottom">
      <div class="kfoot__links">
        <a class="kfoot__privacy" href="https://korean.go.kr/front/nuri/pageView.do?page_id=P000186&mkn=2" target="_blank" rel="noopener">개인정보처리방침</a>
        <a href="./copyright.html">저작권정책</a>
        <a href="./terms.html">서비스 이용약관</a>
      </div>
      <p class="kfoot__copy">COPYRIGHT © National Institute of Korean Language ALL RIGHTS RESERVED.</p>
    </div>
    <div class="kfoot__notice">
      <img src="./image/mcst_logo.png" alt="문화체육관광부">
      <p>이 누리집은 문화체육관광부 산하기관 누리집입니다.</p>
    </div>
  </div>
</footer>
  `;
});
