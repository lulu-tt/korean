document.addEventListener('DOMContentLoaded', () => {
  const footerContainer = document.getElementById('footer-common');
  if (!footerContainer) return;

  footerContainer.innerHTML = `
<footer class="footer">
  <div class="wrap footer__inner">
    <div class="footer__top">
      <div class="footer__links">
        <a href="#" class="privacy">개인정보처리방침</a>
        <span class="divider">|</span>
        <a href="#">저작권정책</a>
        <span class="divider">|</span>
        <a href="#">오시는길</a>
      </div>
      <div class="footer__family">
        <select aria-label="패밀리 사이트 선택" class="family-select" onchange="if(this.value) window.open(this.value);">
          <option value="">Family site</option>
          <option value="https://www.korean.go.kr/">국립국어원</option>
          <option value="https://stdict.korean.go.kr/">표준국어대사전</option>
          <option value="https://opendict.korean.go.kr/">우리말샘</option>
        </select>
        <button type="button" class="family-btn">이동</button>
      </div>
    </div>
    <div class="footer__bottom">
      <div class="footer__logo">
        <img src="./logo_korean_horizontal.png" alt="문화체육관광부 국립국어원" class="f-logo-org">
      </div>
      <div class="footer__address">
        <span class="footer__addr-line">(07511) 서울특별시 강서구 금낭화로 154(방화동 827) 국립국어원</span>
        <span class="footer__addr-line">일반문의: 홈페이지 &gt; 기관소개 &gt; 찾아오시는 길 참조 | 대표전화: 02-2669-9775</span>
        <span class="footer__copyright">COPYRIGHT © National Institute of Korean Language ALL RIGHTS RESERVED.</span>
      </div>
    </div>
  </div>
</footer>
  `;
});
