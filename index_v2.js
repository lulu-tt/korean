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
        const initialBlock = Math.min(40, Math.max(24, Math.round(width / 9)));
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
          const progress = Math.min(1, (now - started) / 850);
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
})();
