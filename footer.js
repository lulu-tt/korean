/*
 * footer.js — 공통 푸터 주입.
 *
 * 마크업은 퍼블리싱 산출물 publishing/html/ko/_include/inc-footer.html 을
 * 옮겨 온 것이다. 원본의 ../../../assets/ 경로는 페이지 기준으로 풀려서
 * 그대로 두면 깨지므로 ./publishing/assets/ 로 바꿔 두었다.
 *
 * 원본의 Family site 셀렉트는 빈 껍데기라, 기존 프로토타입 푸터가 갖고 있던
 * 실제 링크 목록과 이동 동작을 옮겨 붙였다. 하단 링크도 마찬가지로
 * 실제 페이지를 가리키게 했다.
 */

document.addEventListener('DOMContentLoaded', () => {
  const footerContainer = document.getElementById('footer-common');
  if (!footerContainer) return;

  const branding = `
        <div class="footer-branding">
          <a href="./index.html" class="logo logo-korean">
            <img src="./publishing/assets/_common/images/logo-korean@2x.png" alt="문화체육관광부 국립국어원 로고" />
          </a>
          <a href="./index.html" class="logo logo-dialect">
            <img src="./publishing/assets/_common/images/logo-dialect@2x.png" alt="지역어 종합 정보 로고" />
          </a>
        </div>`;

  footerContainer.innerHTML = `
<footer class="footer">
  <div class="inner" id="footer">
    <div class="footer-main">
      <div class="footer-left">${branding}

        <address class="footer-info">
          <span class="footer-info-location">(07511) 서울특별시 강서구 금낭화로 154(방화동 827) 국립국어원</span>
          <dl>
            <div class="footer-info-row">
              <dt>대표전화</dt>
              <dd>02-2669-9775</dd>
            </div>
            <div class="footer-info-row">
              <dt>일반문의</dt>
              <dd>홈페이지 &gt; 기관소개 &gt; 찾아오시는 길 참조</dd>
            </div>
          </dl>
        </address>
      </div>

      <div class="footer-family">
        <select class="select select-md" aria-label="Family site 선택" onchange="if(this.value) window.open(this.value);">
          <option value="">Family site</option>
          <option value="https://www.korean.go.kr/">국립국어원</option>
          <option value="https://stdict.korean.go.kr/">표준국어대사전</option>
          <option value="https://opendict.korean.go.kr/">우리말샘</option>
        </select>
        <button type="button" class="btn btn-md btn-fit btn-outline-gray">이동</button>
      </div>
    </div>

    <div class="footer-bottom">
      <div class="footer-links">
        <a href="https://korean.go.kr/front/nuri/pageView.do?page_id=P000186&amp;mkn=2" class="text-primary" target="_blank" rel="noopener"><strong>개인정보처리방침</strong></a>
        <a href="./terms.html">서비스 이용약관</a>
        <a href="./copyright.html">저작권정책</a>
      </div>
      <p class="footer-copyright">COPYRIGHT © National Institute of Korean Language ALL RIGHTS RESERVED.</p>
    </div>
  </div>
</footer>
  `;
});
