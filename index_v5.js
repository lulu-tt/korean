/* Page-specific interactions. Shared GNB and footer are not modified. */
(() => {
  'use strict';
  const root = document.querySelector('.r26');
  if (!root) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = root.querySelector('.r26-hero');
  const heroMain = hero.querySelector('.r26-hero-main');
  const slides = [...hero.querySelectorAll('.r26-slide')];
  const dots = [...hero.querySelectorAll('[data-slide]')];
  const counter = document.getElementById('hero-current');
  const toggle = document.getElementById('hero-pause');
  const announcement = document.getElementById('hero-announcement');
  const quickDeck = root.querySelector('#quick-explore-carousel');
  const quickSlides = [...(quickDeck?.querySelectorAll('.r26-shortcut-slide') || [])];
  const quickDots = [...(quickDeck?.querySelectorAll('[data-quick-slide]') || [])];
  const quickToggle = quickDeck?.querySelector('#quick-pause');
  let current = 0;
  let quickCurrent = 0;
  let timer = 0;
  let userPaused = reducedMotion.matches;
  let hoverPaused = false;
  let focusPaused = false;
  let heroVisible = true;
  let quickVisible = Boolean(quickDeck);
  const delay = 6500;

  function layoutSlides() {
    const gap = parseFloat(getComputedStyle(hero).getPropertyValue('--r26-hero-card-gap')) || 14;
    const width = slides[0]?.getBoundingClientRect().width || 0;
    slides.forEach((slide, i) => {
      const offset = (i - current + slides.length) % slides.length;
      const position = offset === slides.length - 1 ? -1 : offset;
      const active = position === 0;
      slide.style.transform = `translateX(calc(-50% + ${position * (width + gap)}px))`;
      slide.style.zIndex = active ? '2' : '1';
      slide.style.setProperty('--card-position', String(position));
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      slide.style.pointerEvents = active ? 'auto' : 'none';
    });
  }

  // One clock keeps the two banners from changing at competing moments.
  // Either pause control stops both; page selection remains local to its banner.
  function schedule() {
    clearTimeout(timer);
    const playing = !userPaused && !hoverPaused && !focusPaused && !document.hidden;
    hero.dataset.playing = String(playing && heroVisible);
    if (quickDeck) quickDeck.dataset.playing = String(playing && quickVisible);
    if (playing && (heroVisible || quickVisible)) {
      timer = setTimeout(() => {
        if (heroVisible) select(current + 1, false, false);
        if (quickVisible) selectQuick(quickCurrent + 1, false, false);
        schedule();
      }, delay);
    }
  }
  function syncToggle() {
    toggle.setAttribute('aria-label', userPaused ? '슬라이드 자동 재생 시작' : '슬라이드 자동 재생 멈추기');
    toggle.innerHTML = '<i class="ti ' + (userPaused ? 'ti-player-play' : 'ti-player-pause') + '" aria-hidden="true"></i>';
    if (quickToggle) {
      quickToggle.setAttribute('aria-label', userPaused ? '자료 배너 자동 재생 시작' : '자료 배너 자동 재생 멈추기');
      quickToggle.innerHTML = toggle.innerHTML;
    }
  }
  function select(index, manual = false, reschedule = true) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      if (i === current) dots[i].setAttribute('aria-current', 'true');
      else dots[i].removeAttribute('aria-current');
    });
    layoutSlides();
    counter.textContent = String(current + 1).padStart(2, '0');
    if (manual) announcement.textContent = slides[current].getAttribute('aria-label');
    if (reschedule) schedule();
  }
  function selectQuick(index, manual = false, reschedule = true) {
    if (!quickSlides.length) return;
    quickCurrent = (index + quickSlides.length) % quickSlides.length;
    quickSlides.forEach((slide, i) => {
      const active = i === quickCurrent;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      if (active) {
        quickDeck.dataset.theme = slide.dataset.theme || 'light';
        quickDots[i].setAttribute('aria-current', 'true');
      } else quickDots[i].removeAttribute('aria-current');
    });
    if (manual) announcement.textContent = quickSlides[quickCurrent].getAttribute('aria-label');
    if (reschedule) schedule();
  }
  function pauseBoth() { userPaused = !userPaused; syncToggle(); schedule(); }
  hero.querySelector('.r26-slider-controls').hidden = false;
  dots.forEach((dot, i) => dot.addEventListener('click', () => select(i, true)));
  quickDots.forEach((dot, i) => dot.addEventListener('click', () => selectQuick(i, true)));
  toggle.addEventListener('click', pauseBoth);
  quickToggle?.addEventListener('click', pauseBoth);
  hero.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hoverPaused = true; schedule(); } });
  hero.addEventListener('pointerleave', () => { hoverPaused = false; schedule(); });
  hero.addEventListener('focusin', () => { focusPaused = true; schedule(); });
  hero.addEventListener('focusout', e => { if (!hero.contains(e.relatedTarget)) { focusPaused = false; schedule(); } });
  function bindArrowKeys(controls, buttons, selected, change) {
    controls?.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = (selected() + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      change(next, true);
      buttons[next].focus();
    });
  }
  bindArrowKeys(hero.querySelector('.r26-slider-controls'), dots, () => current, select);
  bindArrowKeys(quickDeck?.querySelector('.r26-shortcuts-controls'), quickDots, () => quickCurrent, selectQuick);
  let touchStart = null;
  heroMain.addEventListener('touchstart', e => {
    touchStart = e.touches.length === 1 ? {x:e.touches[0].clientX, y:e.touches[0].clientY} : null;
  }, {passive:true});
  heroMain.addEventListener('touchend', e => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) select(current + (dx < 0 ? 1 : -1), true);
    touchStart = null;
  }, {passive:true});
  heroMain.addEventListener('touchcancel', () => { touchStart = null; }, {passive:true});
  document.addEventListener('visibilitychange', schedule);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.target === heroMain) heroVisible = entry.isIntersecting;
        else quickVisible = entry.isIntersecting;
      });
      schedule();
    }, {threshold:.15}).observe(heroMain);
    if (quickDeck) {
      new IntersectionObserver(entries => { quickVisible = entries[0].isIntersecting; schedule(); }, {threshold:.15}).observe(quickDeck);
    }
  }
  syncToggle();
  layoutSlides();
  selectQuick(0, false, false);
  window.addEventListener('resize', layoutSlides, {passive:true});
  schedule();

  // A temporary low-resolution canvas resolves into the original service image.
  // The image and link remain usable without canvas, hover, or animation support.
  const pixelResetters = [];
  const hoverAvailable = matchMedia('(any-hover: hover)');
  root.querySelectorAll('.r26-feature-card').forEach(card => {
    const artwork = card.querySelector('.r26-service-art');
    const image = artwork?.querySelector('img');
    if (!image) return;
    let canvas, context, sample, sampleContext;
    let frame = 0, generation = 0;
    let pointerInside = false, keyboardInside = false, engaged = false;

    function stopPixels() {
      generation++;
      cancelAnimationFrame(frame);
      frame = 0;
      if (canvas) canvas.hidden = true;
    }
    pixelResetters.push(stopPixels);

    function startPixels() {
      stopPixels();
      if (reducedMotion.matches) return;
      const token = generation;
      function drawLoadedImage() {
        if (token !== generation || reducedMotion.matches || !image.naturalWidth) return;
        const width = artwork.clientWidth, height = artwork.clientHeight;
        if (!width || !height) return;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.className = 'r26-pixel-preview';
          canvas.setAttribute('aria-hidden', 'true');
          canvas.hidden = true;
          context = canvas.getContext('2d');
          sample = document.createElement('canvas');
          sampleContext = sample.getContext('2d');
          if (!context || !sampleContext) return;
          artwork.append(canvas);
        }
        if (!context || !sampleContext) return;
        const density = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * density);
        canvas.height = Math.round(height * density);
        context.imageSmoothingEnabled = false;
        const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const sourceWidth = width / cover, sourceHeight = height / cover;
        const sourceX = (image.naturalWidth - sourceWidth) / 2;
        const sourceY = (image.naturalHeight - sourceHeight) / 2;
        const initialBlock = Math.min(80, Math.max(48, Math.round(width / 5)));
        const coarseHold = 120;
        function paint(block) {
          sample.width = Math.max(1, Math.ceil(width / block));
          sample.height = Math.max(1, Math.ceil(height / block));
          sampleContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sample.width, sample.height);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(sample, 0, 0, canvas.width, canvas.height);
        }
        paint(initialBlock);
        canvas.hidden = false;
        const started = performance.now();
        function resolvePixels(now) {
          if (token !== generation) return;
          if (reducedMotion.matches) { stopPixels(); return; }
          const progress = Math.max(0, Math.min(1, (now - started - coarseHold) / 850));
          if (progress === 1) { stopPixels(); return; }
          paint(Math.max(1, Math.round(initialBlock ** (1 - progress))));
          frame = requestAnimationFrame(resolvePixels);
        }
        frame = requestAnimationFrame(resolvePixels);
      }
      if (image.complete && image.naturalWidth) drawLoadedImage();
      else image.decode().then(drawLoadedImage).catch(() => {});
    }
    function syncPixels() {
      const active = pointerInside || keyboardInside;
      if (active && !engaged) { engaged = true; startPixels(); }
      else if (!active) { engaged = false; stopPixels(); }
    }
    card.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !hoverAvailable.matches) return;
      pointerInside = true; syncPixels();
    });
    card.addEventListener('pointerleave', () => { pointerInside = false; syncPixels(); });
    card.addEventListener('focus', () => { keyboardInside = card.matches(':focus-visible'); syncPixels(); });
    card.addEventListener('blur', () => { keyboardInside = false; syncPixels(); });
  });
  window.addEventListener('resize', () => pixelResetters.forEach(reset => reset()), {passive:true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pixelResetters.forEach(reset => reset());
  });

  // WAI-ARIA tab behavior: roving focus, arrow/Home/End keys, and hidden panels.
  const tabs = [...root.querySelectorAll('.mf-tab-btn')];
  function activateTab(index, moveFocus = false) {
    tabs.forEach((tab, i) => {
      const active = index === i;
      const panel = document.getElementById(tab.dataset.tab);
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (moveFocus) tabs[index].focus();
    if (tabs[index].dataset.tab === 'tab-gisangdo') requestAnimationFrame(() => window.mfFitMap?.());
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activateTab(i));
    tab.addEventListener('keydown', e => {
      let next;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { e.preventDefault(); activateTab(next, true); }
    });
  });

  // Real scrolling is never intercepted. Only visible artwork is transformed.
  const art = [...root.querySelectorAll('[data-parallax]')];
  let scrollFrame = 0;
  function drawScroll() {
    scrollFrame = 0;
    const viewport = innerHeight;
    art.forEach(el => {
      const box = el.parentElement.getBoundingClientRect();
      const amount = reducedMotion.matches ? 0 : Math.max(-45, Math.min(45, (viewport * .45 - box.top - box.height * .3) * Number(el.dataset.parallax)));
      el.style.setProperty('--parallax-y', amount.toFixed(1) + 'px');
    });
  }
  function onScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(drawScroll); }
  addEventListener('scroll', onScroll, {passive:true});
  addEventListener('resize', onScroll, {passive:true});
  drawScroll();

  const revealElements = [...root.querySelectorAll('[data-reveal]')];
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    root.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer.unobserve(entry.target); }
    }), {threshold:.08});
    revealElements.forEach(el => observer.observe(el));
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      userPaused = true;
      pixelResetters.forEach(reset => reset());
      revealElements.forEach(el => el.classList.add('is-revealed'));
      syncToggle(); schedule();
    }
    drawScroll();
  });

  // Survey figures are rendered at their final values; data never counts up from zero.

  root.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({behavior:reducedMotion.matches ? 'instant' : 'smooth', block:'start'});
    if (target.id === 'home-search') document.getElementById('home-query').focus({preventScroll:true});
  }));
  /* v5: 지역어 조사 기록의 종이 모션 영상
     - 화면에 보일 때만 재생, 정지/재생 버튼(움직임 5초 이상 → 정지 기능 제공)
     - 사용자가 멈추면 스크롤·탭 전환으로 다시 재생하지 않는다
     - 동작 줄이기 설정이면 멈춘 상태(포스터)로 시작하고, 버튼으로 직접 재생할 수 있다 */
  root.querySelectorAll('.r26-record-video').forEach(video => {
    const button = video.parentElement.querySelector('.r26-video-toggle');
    const title = video.closest('.r26-record-video-card')?.querySelector('.r26-card-category')?.textContent.trim() || '';
    let visible = false;
    let userPaused = reducedMotion.matches;
    const render = () => {
      if (!button) return;
      button.innerHTML = `<i class="ti ${userPaused ? 'ti-player-play' : 'ti-player-pause'}" aria-hidden="true"></i>`;
      button.setAttribute('aria-label', `${title} 영상 ${userPaused ? '재생하기' : '멈추기'}`);
    };
    const sync = () => {
      if (visible && !document.hidden && !userPaused) video.play().catch(() => {});
      else video.pause();
    };
    button?.addEventListener('click', () => { userPaused = !userPaused; render(); sync(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(entry => { visible = entry.isIntersecting; sync(); }), {threshold:.25}).observe(video);
    } else {
      visible = true;
    }
    reducedMotion.addEventListener?.('change', () => { if (reducedMotion.matches) userPaused = true; render(); sync(); });
    document.addEventListener('visibilitychange', sync);
    render();
    sync();
  });
  /* v5: 오늘의 지역어 & 퀴즈 — v4에서 옮김 */
  // 서버는 window.V5_TODAY_CONTENT 또는 .r26-today[data-content-url]의 JSON으로
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
  const todaySection = root.querySelector('.r26-today');
  const todayViewport = root.querySelector('#today-viewport');
  const todayTrack = root.querySelector('#today-track');
  const todayCurrent = root.querySelector('#today-current');
  const todayTotal = root.querySelector('#today-total');
  const todayPrev = root.querySelector('#today-prev');
  const todayNext = root.querySelector('#today-next');
  const todayPause = root.querySelector('#today-pause');
  let todayCards = [];
  let activeToday = 0;
  let todayTimer = 0;
  let todayScrollTimer = 0;
  let todayVisible = false;
  let todayHovered = false;
  let todayFocused = false;
  let todayPaused = reducedMotion.matches;

  function makeNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function makeWordCard(data) {
    const card = makeNode('article', 'r26-today-card is-word');
    card.setAttribute('aria-label', `오늘의 지역어 ${data.word}`);
    card.append(makeNode('span', 'r26-today-card-type', '오늘의 지역어'));
    const content = makeNode('div', 'r26-today-word-content');
    content.append(makeNode('h3', '', data.word), makeNode('p', '', data.meaning));
    card.append(content, makeNode('span', 'r26-today-word-region', data.region));
    const link = makeNode('a', 'r26-today-word-link');
    link.href = `./dialect_search_prototype.html?q=${encodeURIComponent(data.word)}`;
    link.append(makeNode('span', '', '다른 지역 어휘 보기'), makeNode('span', '', '→'));
    card.append(link);
    return card;
  }
  function makeQuizCard(data) {
    const card = makeNode('article', 'r26-today-card is-quiz');
    card.setAttribute('aria-label', `오늘의 퀴즈 ${data.question}`);
    card.append(makeNode('span', 'r26-today-card-type', '오늘의 퀴즈'), makeNode('h3', '', data.question));
    const options = makeNode('div', 'r26-today-quiz-options');
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
    const result = makeNode('p', 'r26-today-quiz-result', '선택지를 골라보세요.');
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
    todayViewport.scrollTo({left:activeToday * todayStep(), behavior:reducedMotion.matches ? 'instant' : 'smooth'});
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
  useTodayContent(window.V5_TODAY_CONTENT || fallbackToday);
  const todayUrl = root.querySelector('.r26-today')?.dataset.contentUrl;
  if (todayUrl) fetch(todayUrl, {credentials:'same-origin'})
    .then(response => { if (!response.ok) throw new Error(`Today content: ${response.status}`); return response.json(); })
    .then(useTodayContent)
    .catch(() => { /* 화면에는 이미 기본 콘텐츠가 표시되어 있다. */ });

})();
