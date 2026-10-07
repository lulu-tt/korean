(function () {
  'use strict';
  const root = document.querySelector('.v4-main');
  if (!root) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const slides = [...root.querySelectorAll('[data-slide]')];
  const dots = [...root.querySelectorAll('[data-slide-to]')];
  const current = root.querySelector('#v4-current');
  const pause = root.querySelector('#v4-pause');
  let active = 0;
  let userPaused = reduced.matches;
  let timer = 0;

  function showSlide(index, announce) {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const selected = i === active;
      slide.classList.toggle('is-active', selected);
      slide.toggleAttribute('inert', !selected);
      slide.setAttribute('aria-hidden', String(!selected));
      dots[i]?.setAttribute('aria-current', String(selected));
    });
    if (current) current.textContent = String(active + 1).padStart(2, '0');
    if (announce) slides[active].querySelector('h1,h2')?.focus?.({preventScroll:true});
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (!userPaused && slides.length > 1) timer = setTimeout(() => showSlide(active + 1), 6500);
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => showSlide(i)));
  pause?.addEventListener('click', () => {
    userPaused = !userPaused;
    pause.innerHTML = `<i class="ti ${userPaused ? 'ti-player-play' : 'ti-player-pause'}" aria-hidden="true"></i>`;
    pause.setAttribute('aria-label', userPaused ? '자동 재생 시작하기' : '자동 재생 멈추기');
    schedule();
  });
  root.querySelector('.v4-hero')?.addEventListener('pointerenter', () => clearTimeout(timer));
  root.querySelector('.v4-hero')?.addEventListener('pointerleave', schedule);
  showSlide(0);

  // 서버는 window.V4_TODAY_CONTENT 또는 .v4-today[data-content-url]의 JSON으로
  // { words:[{word,region,meaning,related:[[word,region],...]}],
  //   quizzes:[{question,options:[...],answerIndex,explanation}] }을 제공할 수 있다.
  const fallbackToday = {
    words: [
      {word:'질금', region:'강원 남부', meaning:'‘콩나물’을 이르는 말', related:[['콩지름','경북'],['콩너물','충남·전북 서부'],['콩노물','전남 서부']]},
      {word:'가새', region:'강원·경기·충북', meaning:'‘가위’를 이르는 말', related:[['가왜','경북 북부'],['가우','경기 남부'],['가시개','경북']]},
      {word:'덕석', region:'경남·전남', meaning:'‘멍석’을 이르는 말', related:[['멍시기','경북'],['덕시기','경남 동부'],['초석','제주']]},
      {word:'체', region:'전북 동북부', meaning:'곡식을 까불러 고르는 도구인 ‘키’를 이르는 말', related:[['쳉이','전북·전남 동부'],['치','강원'],['푸는체','제주']]}
    ],
    quizzes: [
      {question:'다음 중 ‘부추’를 가리키는 지역어가 아닌 것은?', options:['정구지','분추','졸','세우리','부루'], answerIndex:4, explanation:'‘부루’는 일부 지역에서 ‘상추’를 가리키는 말입니다.'},
      {question:'‘가새’는 무엇을 이르는 말일까요?', options:['가위','빗','바구니','대야'], answerIndex:0, explanation:'‘가새’는 강원·경기·충북 등에서 ‘가위’를 이르는 말입니다.'},
      {question:'‘질금’은 무엇을 이르는 말일까요?', options:['상추','콩나물','부추','옥수수'], answerIndex:1, explanation:'‘질금’은 강원 남부에서 ‘콩나물’을 이르는 말입니다.'}
    ]
  };
  const todaySection = root.querySelector('.v4-today');
  const todayViewport = root.querySelector('#v4-today-viewport');
  const todayTrack = root.querySelector('#v4-today-track');
  const todayCurrent = root.querySelector('#v4-today-current');
  const todayTotal = root.querySelector('#v4-today-total');
  const todayPrev = root.querySelector('#v4-today-prev');
  const todayNext = root.querySelector('#v4-today-next');
  const todayPause = root.querySelector('#v4-today-pause');
  let todayCards = [];
  let activeToday = 0;
  let todayTimer = 0;
  let todayScrollTimer = 0;
  let todayVisible = false;
  let todayHovered = false;
  let todayFocused = false;
  let todayPaused = reduced.matches;

  function makeNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function makeWordCard(data) {
    const card = makeNode('article', 'v4-today-card is-word');
    card.setAttribute('aria-label', `오늘의 지역어 ${data.word}`);
    card.append(makeNode('span', 'v4-today-card-type', '오늘의 지역어'));
    const content = makeNode('div', 'v4-today-word-content');
    content.append(makeNode('h3', '', data.word), makeNode('p', '', data.meaning));
    card.append(content, makeNode('span', 'v4-today-word-region', data.region));
    const link = makeNode('a', 'v4-today-word-link');
    link.href = `./dialect_search_prototype.html?q=${encodeURIComponent(data.word)}`;
    link.append(makeNode('span', '', '다른 지역 어휘 보기'), makeNode('span', '', '→'));
    card.append(link);
    return card;
  }
  function makeQuizCard(data) {
    const card = makeNode('article', 'v4-today-card is-quiz');
    card.setAttribute('aria-label', `오늘의 퀴즈 ${data.question}`);
    card.append(makeNode('span', 'v4-today-card-type', '오늘의 퀴즈'), makeNode('h3', '', data.question));
    const options = makeNode('div', 'v4-today-quiz-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', '퀴즈 선택지');
    data.options.forEach((option, index) => {
      const button = makeNode('button', '', option);
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const correct = index === data.answerIndex;
        options.querySelectorAll('button').forEach((item, itemIndex) => {
          item.classList.toggle('is-correct', itemIndex === data.answerIndex);
          item.classList.toggle('is-wrong', item === button && !correct);
          item.setAttribute('aria-pressed', String(item === button));
          item.disabled = true;
        });
        result.classList.add('is-answer');
        result.textContent = `${correct ? '정답이에요!' : `정답은 ‘${data.options[data.answerIndex]}’입니다.`} ${data.explanation}`;
        setTodayPaused(true);
      });
      options.append(button);
    });
    const result = makeNode('p', 'v4-today-quiz-result', '선택지를 골라보세요.');
    result.setAttribute('aria-live', 'polite');
    card.append(options, result);
    return card;
  }
  function todayStep() {
    const card = todayCards[0];
    if (!card) return 0;
    return card.getBoundingClientRect().width + (parseFloat(getComputedStyle(todayTrack).columnGap) || 0);
  }
  function fitTodayTrack() {
    if (!todayCards.length) return;
    const start = parseFloat(getComputedStyle(todayTrack).paddingLeft) || 0;
    const cardWidth = todayCards[0].getBoundingClientRect().width;
    todayTrack.style.paddingRight = `${Math.max(start, todayViewport.clientWidth - cardWidth - start)}px`;
    todayViewport.scrollTo({left:activeToday * todayStep(), behavior:'instant'});
  }
  function updateTodayStatus() {
    todayCurrent.textContent = String(activeToday + 1);
    todayTotal.textContent = String(todayCards.length);
    const single = todayCards.length < 2;
    todayPrev.disabled = single;
    todayNext.disabled = single;
    todayPause.disabled = single;
  }
  function scheduleToday() {
    clearTimeout(todayTimer);
    if (todayVisible && !todayHovered && !todayFocused && !todayPaused && !document.hidden && todayCards.length > 1) {
      todayTimer = setTimeout(() => goToToday((activeToday + 1) % todayCards.length), 8500);
    }
  }
  function setTodayPaused(paused) {
    todayPaused = paused;
    todayPause.setAttribute('aria-label', paused ? '자동 넘김 시작하기' : '자동 넘김 멈추기');
    todayPause.innerHTML = `<i class="ti ${paused ? 'ti-player-play' : 'ti-player-pause'}" aria-hidden="true"></i>`;
    scheduleToday();
  }
  function goToToday(index) {
    if (!todayCards.length) return;
    activeToday = (index + todayCards.length) % todayCards.length;
    updateTodayStatus();
    todayViewport.scrollTo({left:activeToday * todayStep(), behavior:reduced.matches ? 'instant' : 'smooth'});
    scheduleToday();
  }
  todayPrev?.addEventListener('click', () => goToToday(activeToday - 1));
  todayNext?.addEventListener('click', () => goToToday(activeToday + 1));
  todayPause?.addEventListener('click', () => setTodayPaused(!todayPaused));
  todaySection?.addEventListener('pointerenter', () => { todayHovered = true; scheduleToday(); });
  todaySection?.addEventListener('pointerleave', () => { todayHovered = false; scheduleToday(); });
  todaySection?.addEventListener('focusin', () => { todayFocused = true; scheduleToday(); });
  todaySection?.addEventListener('focusout', event => { todayFocused = todaySection.contains(event.relatedTarget); scheduleToday(); });
  todayViewport?.addEventListener('scroll', () => {
    clearTimeout(todayTimer);
    clearTimeout(todayScrollTimer);
    todayScrollTimer = setTimeout(() => {
      activeToday = Math.max(0, Math.min(todayCards.length - 1, Math.round(todayViewport.scrollLeft / Math.max(todayStep(), 1))));
      updateTodayStatus();
      scheduleToday();
    }, 180);
  }, {passive:true});
  addEventListener('resize', fitTodayTrack, {passive:true});
  document.addEventListener('visibilitychange', scheduleToday);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      todayVisible = entries[0]?.isIntersecting || false;
      scheduleToday();
    }, {threshold:.25}).observe(todaySection);
  } else todayVisible = true;

  function useTodayContent(candidate) {
    if (!candidate || typeof candidate !== 'object') return;
    const words = Array.isArray(candidate.words)
      ? candidate.words.filter(item => item && typeof item.word === 'string' && typeof item.region === 'string' && typeof item.meaning === 'string')
      : [];
    const quizzes = Array.isArray(candidate.quizzes)
      ? candidate.quizzes.filter(item => item && typeof item.question === 'string' && Array.isArray(item.options) && item.options.length >= 2 && item.options.every(option => typeof option === 'string') && Number.isInteger(item.answerIndex) && item.answerIndex >= 0 && item.answerIndex < item.options.length && typeof item.explanation === 'string')
      : [];
    const source = {words:words.length ? words : fallbackToday.words, quizzes:quizzes.length ? quizzes : fallbackToday.quizzes};
    const fragment = document.createDocumentFragment();
    const count = Math.max(source.words.length, source.quizzes.length);
    for (let i = 0; i < count; i += 1) {
      if (source.words[i]) fragment.append(makeWordCard(source.words[i]));
      if (source.quizzes[i]) fragment.append(makeQuizCard(source.quizzes[i]));
    }
    todayTrack.replaceChildren(fragment);
    todayCards = [...todayTrack.children];
    activeToday = 0;
    updateTodayStatus();
    fitTodayTrack();
    scheduleToday();
  }
  useTodayContent(window.V4_TODAY_CONTENT || fallbackToday);
  const todayUrl = root.querySelector('.v4-today')?.dataset.contentUrl;
  if (todayUrl) fetch(todayUrl, {credentials:'same-origin'})
    .then(response => { if (!response.ok) throw new Error(`Today content: ${response.status}`); return response.json(); })
    .then(useTodayContent)
    .catch(() => { /* 화면에는 이미 기본 콘텐츠가 표시되어 있다. */ });

  const reveal = [...root.querySelectorAll('[data-reveal]')];
  if ('IntersectionObserver' in window && !reduced.matches) {
    root.classList.add('has-motion');
    const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }), {threshold:.1});
    reveal.forEach(item => revealObserver.observe(item));
  } else reveal.forEach(item => item.classList.add('is-visible'));

  const counters = [...root.querySelectorAll('[data-count]')];
  const countObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = Number(el.dataset.count);
    if (reduced.matches) el.textContent = target.toLocaleString('ko-KR');
    else {
      const started = performance.now();
      const duration = 950;
      const tick = now => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased).toLocaleString('ko-KR');
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    countObserver.unobserve(el);
  }), {threshold:.6});
  counters.forEach(counter => countObserver.observe(counter));

  /* 자료를 만나는 여섯 가지 방법
     - 마우스가 있는 기기는 CSS 호버로 뒤집힌다.
     - 터치하면 첫 탭에 카드가 뒤집히고(뒷면 안내), 뒤집힌 카드를 다시 탭하면 링크로 이동한다.
     - 모바일에서는 가로 슬라이더: 좌우 버튼은 끝에서 처음/마지막으로 돌아가며 넘긴다. */
  const serviceTrack = root.querySelector('#v4-service-cards');
  if (serviceTrack) {
    const serviceCards = [...serviceTrack.querySelectorAll('.v4-service-card')];
    const serviceCurrent = root.querySelector('#v4-service-current');
    let lastPointer = 'mouse';
    const unflip = except => serviceCards.forEach(card => { if (card !== except) card.classList.remove('is-flipped'); });

    serviceCards.forEach(card => {
      card.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; });
      card.addEventListener('click', e => {
        // 키보드(Enter)로 누른 클릭은 detail 이 0 — 바로 이동
        if (e.detail === 0 || lastPointer === 'mouse' || card.classList.contains('is-flipped')) return;
        e.preventDefault();
        unflip(card);
        card.classList.add('is-flipped');
      });
    });
    document.addEventListener('pointerdown', e => { if (!e.target.closest?.('.v4-service-card')) unflip(null); });

    const serviceStep = () => {
      const first = serviceCards[0];
      if (!first) return 1;
      return first.offsetWidth + parseFloat(getComputedStyle(serviceTrack).columnGap || getComputedStyle(serviceTrack).gap || 0);
    };
    const serviceIndex = () => Math.max(0, Math.min(serviceCards.length - 1, Math.round(serviceTrack.scrollLeft / Math.max(serviceStep(), 1))));
    const goService = index => {
      const next = (index + serviceCards.length) % serviceCards.length;
      serviceTrack.scrollTo({left:next * serviceStep(), behavior:reduced.matches ? 'instant' : 'smooth'});
    };
    root.querySelector('.v4-service-prev')?.addEventListener('click', () => goService(serviceIndex() - 1));
    root.querySelector('.v4-service-next')?.addEventListener('click', () => goService(serviceIndex() + 1));
    let serviceFrame = 0;
    serviceTrack.addEventListener('scroll', () => {
      if (serviceFrame) return;
      serviceFrame = requestAnimationFrame(() => {
        serviceFrame = 0;
        const i = serviceIndex();
        if (serviceCurrent) serviceCurrent.textContent = String(i + 1);
        unflip(serviceCards[i]);
      });
    }, {passive:true});
  }

  /* 세대별 지역어 변화 종이 모션 영상
     - 화면에 보일 때만 재생하고, 정지 버튼으로 언제든 멈출 수 있다(움직임 5초 이상 → 정지 기능 제공).
     - 사용자가 멈추면 스크롤·탭 전환으로 다시 재생하지 않는다.
     - 동작 줄이기 설정이면 멈춘 상태(포스터)로 시작하고, 버튼으로 직접 재생할 수 있다. */
  root.querySelectorAll('.v4-record-video').forEach(video => {
    const toggle = video.parentElement.querySelector('.v4-video-toggle');
    let visible = false;
    let userPaused = reduced.matches;

    const render = () => {
      if (!toggle) return;
      toggle.innerHTML = `<i class="ti ${userPaused ? 'ti-player-play' : 'ti-player-pause'}" aria-hidden="true"></i>`;
      toggle.setAttribute('aria-label', userPaused ? '영상 재생하기' : '영상 멈추기');
    };
    const sync = () => {
      if (visible && !document.hidden && !userPaused) video.play().catch(() => {});
      else video.pause();
    };

    toggle?.addEventListener('click', () => {
      userPaused = !userPaused;
      render();
      sync();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(entry => {
        visible = entry.isIntersecting;
        sync();
      }), {threshold:.25}).observe(video);
    } else {
      visible = true;
    }
    reduced.addEventListener?.('change', () => {
      if (reduced.matches) userPaused = true;
      render();
      sync();
    });
    document.addEventListener('visibilitychange', sync);
    render();
    sync();
  });

  const depthItems = [...root.querySelectorAll('[data-depth]')];
  let frame = 0;
  function drawDepth() {
    frame = 0;
    const enabled = !reduced.matches && innerWidth > 760;
    root.classList.toggle('has-parallax', enabled);
    depthItems.forEach(item => {
      if (!enabled) {
        item.style.setProperty('--depth-y', '0px');
        return;
      }
      const rect = item.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > innerHeight + 200) return;
      const distance = innerHeight * .5 - rect.top - rect.height * .5;
      const value = Math.max(-34, Math.min(34, distance * Number(item.dataset.depth)));
      item.style.setProperty('--depth-y', `${value.toFixed(1)}px`);
    });
  }
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(drawDepth); }, {passive:true});
  addEventListener('resize', () => { if (!frame) frame = requestAnimationFrame(drawDepth); }, {passive:true});
  reduced.addEventListener?.('change', drawDepth);
  drawDepth();
})();
