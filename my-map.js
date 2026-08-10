/**
 * my-map.js — 나만의 지도 제작 프로토 (단계형 UI)
 * 1 표제어 → 2 어휘 → 3 그룹·부호·면색·지역 → 4 지도(실시간)
 * 저장 필드는 DB 컬럼명 정합 (MyMapStore)
 */
(function () {
  'use strict';

  var state = {
    step: 1,
    headwordNo: null,
    selectedHdId: null,
    selectedHdIds: {},   // 다중 선택(그룹 일괄 설정)용 hd_id 집합
    openColorGroup: null, // 면색 팔레트가 펼쳐진 그룹 번호
    olMap: null,
    hitLayer: null,
    fillLayer: null,
    hoverFeature: null
  };

  function $(id) { return document.getElementById(id); }
  function text(el, v) { if (el) el.textContent = v == null ? '' : String(v); }

  function toast(msg) {
    var t = $('mm-toast');
    if (!t) return;
    text(t, msg);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2800);
  }

  function shapeClass(mapSymbolId) {
    var shape = MyMapStore.symbolShapeById
      ? MyMapStore.symbolShapeById(mapSymbolId)
      : 'circle';
    if (shape === 'square') return 'dfmark--square';
    if (shape === 'diamond') return 'dfmark--diamond';
    if (shape === 'triangle') return 'dfmark--triangle';
    if (shape === 'star') return 'dfmark--circle';
    if (shape === 'cross') return 'dfmark--square';
    return 'dfmark--circle';
  }

  // 흰색 실루엣 마스터 폴더 (그룹 면색으로 틴트해서 사용)
  // 자산 베이스는 window.MY_MAP_ASSET_BASE 로 재정의 가능 (관리자 DB 연동 시 '/user-map').
  var MASK_BASE = (window.MY_MAP_ASSET_BASE || '.').replace(/\/$/, '') + '/symbol_mask/';

  /** file 이 이미 완전한 URL/data-URI 면 그대로, 아니면 마스크 폴더 기준 상대경로 */
  function symUrl(file) {
    file = file || '001.png';
    return /^(data:|https?:|\/)/.test(file) ? file : (MASK_BASE + file);
  }

  /** OL 마커 스타일 — 흰색 실루엣(마스크/아이콘)을 그룹 면색으로 틴트 */
  function markerStyle(color, file, big) {
    if (!window.ol) return null;
    var icon = new ol.style.Icon({
      src: symUrl(file),
      color: color,
      scale: (big ? 17 : 13) / 23
    });
    return new ol.style.Style({ image: icon });
  }

  /** 흰색 실루엣을 색으로 틴트한 인라인 요소 (피커·카드 공용) */
  function symbolImg(file, color, size) {
    size = size || 20;
    var url = symUrl(file);
    return '<span class="symimg" style="width:' + size + 'px;height:' + size + 'px;' +
      'background-color:' + color + ';' +
      '-webkit-mask:url(' + url + ') center/contain no-repeat;' +
      'mask:url(' + url + ') center/contain no-repeat;"></span>';
  }

  /** 인라인 SVG 상징부호 (피커·범례 공용) — shape/색상/크기 */
  function symbolSVG(shape, color, size) {
    size = size || 22;
    shape = shape || 'circle';
    var outline = /-o$/.test(shape);
    var base = shape.replace(/-o$/, '');
    var fillCol = outline ? '#ffffff' : color;
    var strokeCol = outline ? color : 'rgba(15,23,42,.18)';
    var sw = outline ? 2.4 : 1.2;
    var shapes = {
      'circle': '<circle cx="12" cy="12" r="8.4"/>',
      'square': '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="1.4"/>',
      'triangle': '<polygon points="12,3.6 20.4,19.2 3.6,19.2"/>',
      'triangle-down': '<polygon points="12,20.4 3.6,4.8 20.4,4.8"/>',
      'diamond': '<polygon points="12,2.8 21.2,12 12,21.2 2.8,12"/>',
      'star': '<polygon points="12,2.6 14.5,9.3 21.6,9.4 15.9,13.7 18,20.6 12,16.3 6,20.6 8.1,13.7 2.4,9.4 9.5,9.3"/>',
      'cross': '<polygon points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9"/>'
    };
    var body = shapes[base] || shapes.circle;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' +
      '<g fill="' + fillCol + '" stroke="' + strokeCol + '" stroke-width="' + sw + '" stroke-linejoin="round">' +
      body + '</g></svg>';
  }

  /* ── steps ── */
  function setStep(n, opts) {
    opts = opts || {};
    closeStyleModal();
    exitPaintMode();
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 3) n = 3;

    // 탭 이동 가드 (클릭 이동 시 안내)
    if (n >= 2 && !state.headwordNo) {
      if (!opts.silent) toast('표제어를 먼저 등록·선택하세요.');
      n = 1;
    }

    state.step = n;

    document.querySelectorAll('.mm-step').forEach(function (el) {
      var s = parseInt(el.getAttribute('data-step'), 10);
      var on = s === n;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.tabIndex = on ? 0 : -1;
    });
    updateStepDone();
    updateStepNav();

    // 1: 표제어 / 2: 어휘·설정(지역어+속성) / 3: 지도 확인(읽기 전용 그룹 목록)
    var showHw = n === 1;
    var showDf = n === 2;
    var showReview = n === 3;
    if ($('panel-headword')) $('panel-headword').classList.toggle('is-open', showHw);
    if ($('panel-dialect')) $('panel-dialect').classList.toggle('is-open', showDf);
    if ($('panel-review')) $('panel-review').classList.toggle('is-open', showReview);

    if (n === 1) renderHeadwords();
    if (n === 2) {
      renderDialects();
      refreshAddGroupSelect();
      renderStyleForm();
    }
    if (n === 3) {
      renderReview();
      rebuildFill();
    }

    // 지도 도구(설정·공유·다운로드) 노출 단계 — 기본 2·3단계(사용자·관리자 공통), window.MY_MAP_TOOLS_STEPS 로 재정의 가능
    var toolSteps = (window.MY_MAP_TOOLS_STEPS && window.MY_MAP_TOOLS_STEPS.length) ? window.MY_MAP_TOOLS_STEPS : [2, 3];
    var tools = $('mm-map-tools');
    if (tools) tools.style.display = (toolSteps.indexOf(n) >= 0) ? 'flex' : 'none';

    if (n === 3) {
      updateModeBar();
      var mapEl = $('mm-map');
      if (mapEl && mapEl.scrollIntoView) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (!opts.silent) {
        var v = state.headwordNo ? MyMapStore.validateHeadwordReady(state.headwordNo) : { ok: false };
        if (v.ok) {
          text($('mm-mode'), '3단계: 지도를 확인하고 최종 저장·지도보기를 이용하세요.');
        } else {
          text($('mm-mode'), '3단계: 지도를 확인하세요. (미완료 항목이 있으면 최종 저장 전 보완해 주세요.)');
        }
      }
    }

    // 사이드 스크롤 상단
    var sc = document.querySelector('.mm-side__scroll');
    if (sc && !opts.keepScroll) sc.scrollTop = 0;
  }

  var STEP_LABELS = { 1: '표제어 등록', 2: '어휘·설정', 3: '지도 확인' };

  function stepStatus() {
    var hn = state.headwordNo;
    var hasHw = !!hn;
    var hasDf = hasHw && MyMapStore.listDialects(hn).length > 0;
    var hasRg = hasHw && MyMapStore.listRegionsByHeadword(hn).length > 0;
    var isFinal = hasHw && MyMapStore.getHeadword(hn) && !!MyMapStore.getHeadword(hn).finalized_at;
    return { hasHw: hasHw, hasDf: hasDf, hasRg: hasRg, isFinal: isFinal };
  }

  function updateStepDone() {
    var st = stepStatus();
    document.querySelectorAll('.mm-step').forEach(function (el) {
      var s = parseInt(el.getAttribute('data-step'), 10);
      var done = false, locked = false, tip = '';
      if (s === 1) {
        done = st.hasHw;
        tip = st.hasHw ? '완료 · 표제어가 등록되었습니다.' : '먼저 표제어를 등록하세요.';
      } else if (s === 2) {
        done = st.hasDf && st.hasRg;
        locked = !st.hasHw;
        tip = !st.hasHw ? '잠김 · 표제어를 먼저 등록하세요.'
          : (done ? '완료 · 지역어와 지역이 설정되었습니다.'
            : '지역어·그룹·부호·면색·지역을 설정하세요.');
      } else if (s === 3) {
        done = st.isFinal;
        locked = !st.hasHw;
        tip = !st.hasHw ? '잠김 · 표제어를 먼저 등록하세요.'
          : (st.isFinal ? '완료 · 최종 저장되었습니다.' : '지도를 확인하고 최종 저장하세요.');
      }
      el.classList.toggle('is-done', done && s !== state.step);
      el.classList.toggle('is-locked', locked);
      el.setAttribute('title', tip);
    });
  }

  /** 하단 이전/다음 네비 + 단계 표시 갱신 */
  function updateStepNav() {
    var ind = $('mm-step-indicator');
    if (ind) text(ind, state.step + ' / 3 · ' + (STEP_LABELS[state.step] || ''));
    var prev = $('btn-step-prev');
    var next = $('btn-step-next');
    if (prev) prev.disabled = state.step <= 1;
    if (next) {
      var st = stepStatus();
      var atEnd = state.step >= 3;
      // 다음 단계 진입 조건: 2단계는 표제어 필요
      var blocked = (state.step === 1 && !st.hasHw);
      if (atEnd) {
        // 마지막 단계: 「최종 저장」 버튼으로 전환
        next.disabled = false;
        text(next, '최종 저장');
        next.title = '지도를 최종 저장합니다.';
        var sic = document.createElement('i');
        sic.className = 'ti ti-device-floppy';
        sic.setAttribute('aria-hidden', 'true');
        next.insertBefore(document.createTextNode(' '), next.firstChild);
        next.insertBefore(sic, next.firstChild);
      } else {
        next.disabled = blocked;
        next.title = blocked ? '표제어를 먼저 등록하세요.' : (STEP_LABELS[state.step + 1] || '') + '(으)로 이동';
        text(next, '다음');
        var ic = document.createElement('i');
        ic.className = 'ti ti-arrow-right';
        ic.setAttribute('aria-hidden', 'true');
        next.appendChild(document.createTextNode(' '));
        next.appendChild(ic);
      }
    }
  }

  /** 자동(임시) 저장 표시 — 방금 저장됨 → 잠시 후 기기 저장 상태로 */
  function flashSaved() {
    var el = $('mm-autosave');
    if (!el) return;
    text(el, '✓ 방금 저장됨');
    el.classList.add('is-on');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(function () {
      el.classList.remove('is-on');
      text(el, state.headwordNo ? '기기에 임시 저장됨' : '');
    }, 1600);
  }

  /* ── headword list ── */
  function renderHeadwords() {
    var list = $('hw-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    var items = MyMapStore.listHeadwords();
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'mm-empty';
      empty.textContent = '등록된 표제어가 없습니다. 「추가 등록」을 눌러 시작하세요.';
      list.appendChild(empty);
      return;
    }
    items.forEach(function (h) {
      var sum = MyMapStore.headwordSummary(h);
      var card = document.createElement('div');
      card.className = 'hw-card' + (String(h.headword_no) === String(state.headwordNo) ? ' is-selected' : '');
      card.setAttribute('role', 'option');
      card.tabIndex = 0;

      var title = document.createElement('h3');
      title.className = 'hw-card__title';
      title.textContent = h.headword;

      var meta = document.createElement('div');
      meta.className = 'hw-card__meta';
      ;[
        h.word_class || '-',
        '신청 ' + (h.appro === 'Y' ? 'Y' : 'N'),
        '상태 ' + (h.use_yn || 'N'),
        '어휘 ' + sum.dialect_count,
        '지역 ' + sum.region_count
      ].forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        meta.appendChild(s);
      });

      if (h.meaning) {
        var mean = document.createElement('div');
        mean.style.cssText = 'font-size:12px;color:#64748b;margin-top:6px;line-height:1.4;font-weight:500;';
        mean.textContent = h.meaning.length > 80 ? h.meaning.slice(0, 80) + '…' : h.meaning;
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(mean);
      } else {
        card.appendChild(title);
        card.appendChild(meta);
      }

      var actions = document.createElement('div');
      actions.className = 'hw-card__actions';
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mm-btn mm-btn--ghost mm-btn--sm';
      edit.textContent = '수정';
      edit.addEventListener('click', function (e) {
        e.stopPropagation();
        selectHeadword(h.headword_no, { goStep2: true });
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'mm-btn mm-btn--ghost mm-btn--sm mm-btn--danger';
      del.textContent = '삭제';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('표제어 [' + h.headword + '] 와 연결된 지역어·지역을 모두 삭제할까요?')) return;
        MyMapStore.removeHeadword(h.headword_no);
        if (String(state.headwordNo) === String(h.headword_no)) {
          state.headwordNo = null;
          state.selectedHdId = null;
          MyMapStore.setSelectedHeadwordNo('');
        }
        toast('삭제했습니다.');
        renderHeadwords();
        rebuildFill();
        updateMapChrome();
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      card.appendChild(actions);

      card.addEventListener('click', function () { selectHeadword(h.headword_no); });
      list.appendChild(card);
    });
  }

  function selectHeadword(headwordNo, opts) {
    opts = opts || {};
    state.headwordNo = String(headwordNo);
    state.selectedHdId = null;
    MyMapStore.setSelectedHeadwordNo(state.headwordNo);
    var dialects = MyMapStore.listDialects(state.headwordNo);
    if (dialects.length) state.selectedHdId = dialects[0].hd_id;
    if (opts.goStep2) {
      // 「수정」: 2단계 어휘·설정 탭으로 이동
      setStep(2);
      updateMapChrome();
      rebuildFill();
      toast('표제어를 선택했습니다. 지역어를 추가하세요.');
    } else {
      // 목록 선택: 탭 이동 없이 현재 탭에서 지도만 갱신
      renderHeadwords();
      updateStepDone();
      updateStepNav();
      updateMapChrome();
      rebuildFill();
    }
  }

  /* ── headword modal ── */
  function fillWordClassOptions() {
    var sel = $('hw-class');
    if (!sel || sel.options.length > 1) return;
    MyMapStore.WORD_CLASS_OPTIONS.forEach(function (w) {
      var o = document.createElement('option');
      o.value = w;
      o.textContent = w;
      sel.appendChild(o);
    });
  }

  function openHeadwordModal(existing) {
    fillWordClassOptions();
    var modal = $('hw-modal');
    $('hw-modal-title').textContent = existing ? '표제어 수정' : '표제어 추가';
    $('hw-edit-no').value = existing ? existing.headword_no : '';
    $('hw-headword').value = existing ? existing.headword : '';
    $('hw-class').value = existing ? (existing.word_class || '') : '';
    $('hw-meaning').value = existing ? (existing.meaning || '') : '';
    $('hw-appro').value = existing ? (existing.appro || '') : '';
    $('hw-use-yn').value = existing
      ? ('서비스 상태: ' + (existing.use_yn === 'Y' ? '반영(Y)' : '미처리(N)'))
      : '미처리 (N) — 등록 후 관리자 처리';
    modal.hidden = false;
    setTimeout(function () { $('hw-headword').focus(); }, 50);
  }

  function closeHeadwordModal() {
    $('hw-modal').hidden = true;
  }

  /** 지역어 상세 설정 레이어 팝업 */
  function openStyleModal() {
    if (!state.selectedHdId) return;
    renderStyleForm();
    var modal = $('style-modal');
    if (modal) modal.hidden = false;
  }

  function closeStyleModal() {
    var modal = $('style-modal');
    if (modal) modal.hidden = true;
  }

  /** 상세 설정 팝업 열기 (지역어 지정) */
  function openDetail(hdId) {
    if (hdId) state.selectedHdId = hdId;
    if (!state.selectedHdId) return;
    exitPaintMode();
    renderDialects();
    openStyleModal();
    updateModeBar();
  }

  /** 지역 지정(지도 페인팅) 모드 진입 — 지도 클릭으로 지역 추가/제거 */
  function enterPaintMode(hdId) {
    if (hdId) state.selectedHdId = hdId;
    if (!state.selectedHdId) return;
    state.painting = true;
    closeStyleModal();
    renderDialects();
    var bar = $('mm-paint');
    if (bar) bar.hidden = false;
    updatePaintBar();
    updateModeBar();
  }

  function exitPaintMode() {
    state.painting = false;
    var bar = $('mm-paint');
    if (bar) bar.hidden = true;
    var sug = $('mm-region-suggest');
    if (sug) sug.hidden = true;
  }

  function updatePaintBar() {
    if (!state.painting) return;
    var d = state.selectedHdId ? MyMapStore.getDialect(state.selectedHdId) : null;
    if (!d) { exitPaintMode(); return; }
    var w = $('mm-paint-word'); if (w) w.textContent = d.word || '';
    var c = $('mm-paint-count'); if (c) c.textContent = MyMapStore.countRegionsForDialect(d.hd_id);
    var dot = $('mm-paint-dot'); if (dot) dot.style.background = MyMapStore.rgbToHex(d.face_color);
  }

  function saveHeadwordFromModal() {
    var payload = {
      headword: $('hw-headword').value,
      word_class: $('hw-class').value,
      meaning: $('hw-meaning').value,
      appro: $('hw-appro').value
    };
    var editNo = $('hw-edit-no').value;
    if (editNo) payload.headword_no = editNo;

    if (!MyMapStore.isLoggedIn()) MyMapStore.loginMock();

    var res = MyMapStore.saveHeadword(payload);
    if (!res.ok) {
      var msgs = {
        headword: '표제어를 입력해 주세요.',
        headword_len: '표제어는 125자 이내로 입력해 주세요.',
        word_class: '품사를 선택해 주세요.',
        appro: '서비스 신청 여부를 선택해 주세요.',
        quota: '저장 공간이 부족합니다.'
      };
      toast(msgs[res.reason] || '저장에 실패했습니다.');
      return;
    }
    closeHeadwordModal();
    toast(editNo ? '표제어를 수정했습니다.' : '표제어를 등록했습니다.');
    state.headwordNo = res.headword.headword_no;
    MyMapStore.setSelectedHeadwordNo(state.headwordNo);
    renderHeadwords();
    setStep(2);
    updateMapChrome();
    flashSaved();
  }

  /* ── dialects ── */
  function renderDialects() {
    var list = $('df-list');
    var hint = $('dialect-hint');
    if (!list) return;
    // 목록을 다시 그릴 때 사이드 패널 스크롤 위치 유지
    // (그룹 면색 팔레트 펼침·체크박스 토글 등에서 맨 위로 튀는 현상 방지)
    var scrollBox = document.querySelector('.mm-side__scroll');
    var savedScroll = scrollBox ? scrollBox.scrollTop : 0;
    while (list.firstChild) list.removeChild(list.firstChild);

    if (!state.headwordNo) {
      if (hint) hint.textContent = '표제어를 먼저 선택하세요.';
      list.appendChild(Object.assign(document.createElement('div'), {
        className: 'mm-empty', textContent: '표제어 없음'
      }));
      return;
    }
    var hw = MyMapStore.getHeadword(state.headwordNo);
    if (hint) {
      hint.textContent = '표제어: ' + (hw ? hw.headword : state.headwordNo) +
        ' (headword_no=' + state.headwordNo + ')';
    }

    var dialects = MyMapStore.listDialects(state.headwordNo);
    if (!dialects.length) {
      state.selectedHdIds = {};
      var empty = document.createElement('div');
      empty.className = 'mm-empty';
      empty.textContent = '지역어가 없습니다. 위에서 추가하세요.';
      list.appendChild(empty);
      return;
    }

    // 선택 집합에서 사라진 지역어 정리
    var valid = {};
    dialects.forEach(function (d) { valid[String(d.hd_id)] = true; });
    Object.keys(state.selectedHdIds).forEach(function (id) {
      if (!valid[id]) delete state.selectedHdIds[id];
    });

    // 다중 선택 배치 바
    list.appendChild(buildBatchBar());

    // 그룹별로 묶기
    var groups = {}, order = [];
    dialects.forEach(function (d) {
      var g = (d.mutation_group == null || d.mutation_group === '') ? '_none' : String(d.mutation_group);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(d);
    });
    order.sort(function (a, b) {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      return (+a) - (+b);
    });

    order.forEach(function (g) {
      list.appendChild(buildGroupBlock(g, groups[g]));
    });
    if (scrollBox) scrollBox.scrollTop = savedScroll;
    updateStepDone();
  }

  /** 그룹설정: 다중 선택 → 그룹 일괄 지정 (타이틀 + 서브텍스트) */
  function buildBatchBar() {
    var ids = Object.keys(state.selectedHdIds);
    var wrap = document.createElement('div');
    wrap.className = 'df-groupset' + (ids.length ? ' is-active' : '');

    var title = document.createElement('div');
    title.className = 'df-groupset__title';
    title.textContent = '그룹설정';
    wrap.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'df-groupset__sub';
    sub.textContent = ids.length
      ? (ids.length + '개 선택됨 · 지정할 그룹을 고르고 적용하세요')
      : '지역어를 선택하시면 그룹을 한번에 지정하실 수 있습니다.';
    wrap.appendChild(sub);

    if (ids.length) {
      var row = document.createElement('div');
      row.className = 'df-groupset__row';

      var sel = document.createElement('select');
      sel.className = 'mm-select df-batch__group';
      fillGroupSelect(sel, null);
      row.appendChild(sel);

      var apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'mm-btn mm-btn--primary mm-btn--sm';
      apply.textContent = '그룹 적용';
      apply.addEventListener('click', function () {
        applyGroupToSelected(sel.value);
      });
      row.appendChild(apply);

      var clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'mm-btn mm-btn--ghost mm-btn--sm';
      clear.textContent = '선택 해제';
      clear.addEventListener('click', function () {
        state.selectedHdIds = {};
        renderDialects();
      });
      row.appendChild(clear);

      wrap.appendChild(row);
    }
    return wrap;
  }

  function applyGroupToSelected(groupVal) {
    var ids = Object.keys(state.selectedHdIds);
    if (!ids.length) { toast('지역어를 선택하세요.'); return; }
    var res = MyMapStore.setGroupForDialects(state.headwordNo, ids, groupVal);
    if (!res.ok) {
      var msgs = {
        group_sequence: '그룹은 순서대로만 만들 수 있습니다.',
        group_invalid: '올바른 그룹을 선택하세요.',
        group_missing: '존재하지 않는 그룹입니다.',
        no_targets: '선택된 지역어가 없습니다.'
      };
      toast(msgs[res.reason] || '그룹 설정에 실패했습니다.');
      return;
    }
    state.selectedHdIds = {};
    toast(res.count + '개 지역어를 ' + res.group + '그룹으로 설정했습니다.');
    refreshAddGroupSelect();
    renderDialects();
    rebuildFill();
    renderLegend();
    flashSaved();
  }

  /** 한 그룹 블록: 헤더(면색 편집) + 지역어 카드들 */
  function buildGroupBlock(g, members) {
    var wrap = document.createElement('div');
    wrap.className = 'df-group';

    var isNone = (g === '_none');
    var head = document.createElement('div');
    head.className = 'df-group__head';

    var label = document.createElement('span');
    label.className = 'df-group__label';
    label.textContent = isNone ? '그룹 미지정' : (g + '그룹');
    head.appendChild(label);

    var count = document.createElement('span');
    count.className = 'df-group__count';
    count.textContent = members.length + '개';
    head.appendChild(count);

    if (!isNone) {
      var gColor = MyMapStore.getGroupColor(state.headwordNo, g); // null이면 미설정
      var colorBtn = document.createElement('button');
      colorBtn.type = 'button';
      colorBtn.className = 'df-group__color' + (gColor ? '' : ' is-empty');
      colorBtn.title = gColor ? '그룹 면색 수정' : '그룹 면색 지정';
      if (gColor) colorBtn.style.background = MyMapStore.rgbToHex(gColor);
      colorBtn.innerHTML = gColor
        ? ''
        : '<i class="ti ti-plus" aria-hidden="true"></i>';
      colorBtn.appendChild(Object.assign(document.createElement('span'), {
        className: 'df-group__colortext',
        textContent: gColor ? MyMapStore.rgbToHex(gColor) : '면색 지정'
      }));
      colorBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        state.openColorGroup = (String(state.openColorGroup) === String(g)) ? null : g;
        renderDialects();
      });
      head.appendChild(colorBtn);
    }
    wrap.appendChild(head);

    // 면색 팔레트(펼침)
    if (!isNone && String(state.openColorGroup) === String(g)) {
      wrap.appendChild(buildGroupPalette(g));
    }

    members.forEach(function (d) {
      wrap.appendChild(buildDfCard(d));
    });
    return wrap;
  }

  /** '미설정' 표시 — 투명 체커보드 패턴 (색 없음 아이콘) */
  function applyNoneSwatch(el) {
    el.style.backgroundColor = '#fff';
    el.style.backgroundImage =
      'linear-gradient(45deg,#dfe3e8 25%,transparent 25%),' +
      'linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),' +
      'linear-gradient(45deg,transparent 75%,#dfe3e8 75%),' +
      'linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)';
    el.style.backgroundSize = '8px 8px';
    el.style.backgroundPosition = '0 0,0 4px,4px -4px,-4px 0';
  }

  /** 그룹 면색 선택 팔레트 (인라인 펼침) */
  function buildGroupPalette(g) {
    var box = document.createElement('div');
    box.className = 'mm-palette df-grouppalette';
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', g + '그룹 면색');
    var gc = MyMapStore.getGroupColor(state.headwordNo, g);
    var isUnset = !gc;
    var cur = isUnset ? '' : MyMapStore.rgbToHex(gc).toLowerCase();
    var palette = MyMapStore.FACE_PALETTE || [];

    function applyColor(hex) {
      var res = MyMapStore.setGroupColor(state.headwordNo, g, hex);
      if (!res.ok) { toast('면색 적용에 실패했습니다.'); return; }
      state.openColorGroup = null;
      toast(g + '그룹 면색' + (hex ? '을 적용했습니다.' : '을 미설정으로 변경했습니다.'));
      renderDialects();
      rebuildFill();
      renderLegend();
      flashSaved();
    }

    // 미설정(빈값) 스와치 — 항상 첫 번째
    var none = document.createElement('button');
    none.type = 'button';
    none.className = 'mm-palette__swatch' + (isUnset ? ' is-selected' : '');
    none.title = '미설정';
    none.setAttribute('role', 'option');
    none.setAttribute('aria-label', '면색 미설정');
    applyNoneSwatch(none);
    none.addEventListener('click', function (e) { e.stopPropagation(); applyColor(''); });
    box.appendChild(none);

    palette.forEach(function (hex) {
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'mm-palette__swatch' + (hex.toLowerCase() === cur ? ' is-selected' : '');
      sw.style.backgroundColor = hex;
      sw.title = hex;
      sw.setAttribute('role', 'option');
      sw.setAttribute('aria-label', '면색 ' + hex);
      sw.addEventListener('click', function (e) { e.stopPropagation(); applyColor(hex); });
      box.appendChild(sw);
    });
    return box;
  }

  /** 지역어 카드 1개 */
  function buildDfCard(d) {
    var card = document.createElement('div');
    card.className = 'df-card' + (String(d.hd_id) === String(state.selectedHdId) ? ' is-selected' : '');

    var head = document.createElement('div');
    head.className = 'df-card__head';

    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'df-card__check';
    chk.checked = !!state.selectedHdIds[String(d.hd_id)];
    chk.setAttribute('aria-label', d.word + ' 선택');
    chk.addEventListener('click', function (e) { e.stopPropagation(); });
    chk.addEventListener('change', function () {
      if (chk.checked) state.selectedHdIds[String(d.hd_id)] = true;
      else delete state.selectedHdIds[String(d.hd_id)];
      renderDialects();
    });

    var wordBtn = document.createElement('button');
    wordBtn.type = 'button';
    wordBtn.className = 'df-card__word';
    wordBtn.textContent = d.word;
    wordBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      enterPaintMode(d.hd_id);
    });

    var cnt = document.createElement('span');
    cnt.className = 'df-card__cnt';
    cnt.textContent = MyMapStore.countRegionsForDialect(d.hd_id) + '곳';

    var gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'df-card__gear';
    gear.title = '상세 설정 (그룹·순서·부호·면색)';
    gear.setAttribute('aria-label', '상세 설정');
    gear.innerHTML = '<i class="ti ti-settings" aria-hidden="true"></i>';
    gear.addEventListener('click', function (e) {
      e.stopPropagation();
      openDetail(d.hd_id);
    });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'df-card__gear df-card__del';
    del.title = '지역어 삭제';
    del.setAttribute('aria-label', '지역어 삭제');
    del.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      state.selectedHdId = d.hd_id;
      deleteSelectedDialect();
    });

    head.appendChild(chk);
    head.appendChild(wordBtn);
    head.appendChild(cnt);
    head.appendChild(gear);
    head.appendChild(del);
    card.appendChild(head);

    var meta = document.createElement('div');
    meta.className = 'df-card__meta';
    var faceHtml = d.face_color
      ? '<span class="df-card__face" style="background:' + MyMapStore.rgbToHex(d.face_color) + '"></span>'
      : '<span class="df-card__na">미설정</span>';
    var symHtml;
    if (d.map_symbol_id) {
      var symHex2 = (d.symbol_color && String(d.symbol_color)) ||
        (d.face_color ? MyMapStore.rgbToHex(d.face_color) : '#64748b');
      var symFile = MyMapStore.symbolFileById ? MyMapStore.symbolFileById(d.map_symbol_id) : '001.png';
      symHtml = '<span class="df-card__sym">' + symbolImg(symFile, symHex2, 14) + '</span>';
    } else {
      symHtml = '<span class="df-card__na">미설정</span>';
    }
    meta.innerHTML = '순서 ' + (d.mutation_seq != null ? d.mutation_seq : '미지정') +
      ' · 면색 ' + faceHtml +
      ' · 부호 ' + symHtml;
    card.appendChild(meta);

    card.addEventListener('click', function () {
      enterPaintMode(d.hd_id);
    });
    return card;
  }

  /* ── 3단계: 읽기 전용 그룹별 목록 ── */
  function renderReview() {
    var list = $('review-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    if (!state.headwordNo) {
      list.appendChild(Object.assign(document.createElement('div'), {
        className: 'mm-empty', textContent: '표제어를 선택하세요.'
      }));
      return;
    }
    var dialects = MyMapStore.listDialects(state.headwordNo);
    if (!dialects.length) {
      list.appendChild(Object.assign(document.createElement('div'), {
        className: 'mm-empty', textContent: '설정된 지역어가 없습니다. 2. 어휘·설정에서 추가하세요.'
      }));
      return;
    }

    // 그룹별로 묶기 (2단계와 동일 정렬)
    var groups = {}, order = [];
    dialects.forEach(function (d) {
      var g = (d.mutation_group == null || d.mutation_group === '') ? '_none' : String(d.mutation_group);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(d);
    });
    order.sort(function (a, b) {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      return (+a) - (+b);
    });

    order.forEach(function (g) {
      var members = groups[g];
      var isNone = (g === '_none');
      var block = document.createElement('div');
      block.className = 'rv-group';

      var head = document.createElement('div');
      head.className = 'rv-group__head';

      var gColor = isNone ? null : MyMapStore.getGroupColor(state.headwordNo, g);
      var sw = document.createElement('span');
      sw.className = 'rv-group__swatch' + (gColor ? '' : ' is-empty');
      if (gColor) sw.style.background = MyMapStore.rgbToHex(gColor);
      head.appendChild(sw);

      var label = document.createElement('span');
      label.className = 'rv-group__label';
      label.textContent = isNone ? '그룹 미지정' : (g + '그룹');
      head.appendChild(label);

      var cnt = document.createElement('span');
      cnt.className = 'rv-group__count';
      cnt.textContent = members.length + '개';
      head.appendChild(cnt);
      block.appendChild(head);

      members.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'rv-card';

        var seq = document.createElement('span');
        seq.className = 'rv-card__seq';
        seq.textContent = d.mutation_seq != null ? d.mutation_seq : '·';
        row.appendChild(seq);

        var word = document.createElement('span');
        word.className = 'rv-card__word';
        word.textContent = d.word;
        row.appendChild(word);

        // 부호 칸은 항상 고정폭으로 배치(카운트 칸 정렬 유지) — 미설정이면 비움
        var sym = document.createElement('span');
        sym.className = 'rv-card__sym';
        if (d.map_symbol_id) {
          var symHex = (d.symbol_color && String(d.symbol_color)) ||
            (d.face_color ? MyMapStore.rgbToHex(d.face_color) : '#64748b');
          var symFile = MyMapStore.symbolFileById ? MyMapStore.symbolFileById(d.map_symbol_id) : '001.png';
          sym.innerHTML = symbolImg(symFile, symHex, 15);
        }
        row.appendChild(sym);

        var rc = document.createElement('span');
        rc.className = 'rv-card__cnt';
        rc.textContent = MyMapStore.countRegionsForDialect(d.hd_id) + '곳';
        row.appendChild(rc);

        block.appendChild(row);
      });
      list.appendChild(block);
    });
  }

  /** 그룹 셀렉트 옵션 채우기 (기존 그룹 + 다음 신규 1개) */
  function fillGroupSelect(selectEl, selected, opts) {
    if (!selectEl || !state.headwordNo) return;
    opts = opts || MyMapStore.groupSelectOptions(state.headwordNo);
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    opts.existing.forEach(function (g) {
      var o = document.createElement('option');
      o.value = String(g);
      o.textContent = g + '그룹';
      selectEl.appendChild(o);
    });
    var oNew = document.createElement('option');
    oNew.value = String(opts.nextNew);
    oNew.textContent = opts.nextNew + '그룹 (신규)';
    selectEl.appendChild(oNew);
    if (selected != null && selected !== '') {
      selectEl.value = String(selected);
    } else if (opts.existing.length) {
      selectEl.value = String(opts.existing[opts.existing.length - 1]);
    } else {
      selectEl.value = String(opts.nextNew);
    }
  }

  function refreshAddGroupSelect() {
    fillGroupSelect($('df-group'), null);
  }

  function addDialect() {
    if (!state.headwordNo) {
      toast('표제어를 먼저 선택하세요.');
      setStep(1);
      return;
    }
    var word = ($('df-word').value || '').trim();
    if (!word) {
      toast('지역어를 입력하세요.');
      return;
    }
    var groupVal = $('df-group').value;
    if (!groupVal) {
      toast('그룹을 선택하세요.');
      return;
    }
    var res = MyMapStore.saveDialect({
      headword_no: state.headwordNo,
      word: word,
      mutation_group: groupVal,
      map_symbol_id: ''
    });
    if (!res.ok) {
      var msgs = {
        word_len: '50자 이내로 입력하세요.',
        group_sequence: '그룹은 순서대로만 만들 수 있습니다. (다음: ' +
          (res.expected != null ? res.expected : MyMapStore.nextGroupNumber(state.headwordNo)) + '그룹)',
        group_invalid: '올바른 그룹을 선택하세요.',
        group_missing: '존재하지 않는 그룹입니다.'
      };
      toast(msgs[res.reason] || '추가에 실패했습니다.');
      return;
    }
    $('df-word').value = '';
    state.selectedHdId = res.dialect.hd_id;
    toast('「' + res.dialect.word + '」 → ' + res.dialect.mutation_group +
      '그룹 순서 ' + res.dialect.mutation_seq);
    refreshAddGroupSelect();
    renderDialects();
    setStep(2, { keepScroll: true });
    rebuildFill();
    updateModeBar();
    flashSaved();
  }

  /* ── 엑셀 지역어 일괄 추가 ── */
  function normRegion(s) {
    return String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').toLowerCase();
  }

  /** 엑셀 지역명 → 프로토 지역 ref 배열 (구 분할 시는 여러 개, 미매칭 시 null) */
  function matchRegionsByName(excelName) {
    if (!window.MyMapRegions) return null;
    var all = MyMapRegions.all();
    var clean = String(excelName || '').replace(/\([^)]*\)/g, '').trim();
    if (!clean) return null;
    var toks = clean.split(/\s+/);
    var sidoPart = normRegion(toks[0]);
    // 1) 시도+지역명 완전 일치
    var exact = all.filter(function (r) { return normRegion(r.sido + r.name) === normRegion(clean); });
    if (exact.length) return exact;
    // 2) 세종 특례 (단일 자치시)
    if (sidoPart.indexOf('세종') !== -1) {
      var sj = all.filter(function (r) { return normRegion(r.sido).indexOf('세종') !== -1; });
      if (sj.length) return sj;
    }
    // 3) 시/군/구 토큰(뒤에서부터) 접두 매칭 + 시도 일치
    var muniTok = null;
    for (var i = toks.length - 1; i >= 1; i--) {
      if (/[시군구]$/.test(toks[i])) { muniTok = toks[i]; break; }
    }
    if (!muniTok) muniTok = toks[toks.length - 1];
    var mt = normRegion(muniTok);
    function sidoOK(r) {
      var rs = normRegion(r.sido);
      return rs.indexOf(sidoPart) !== -1 || sidoPart.indexOf(rs) !== -1 || rs.slice(0, 2) === sidoPart.slice(0, 2);
    }
    var cands = all.filter(function (r) {
      var rn = normRegion(r.name);
      return (rn === mt || rn.indexOf(mt) === 0) && sidoOK(r);
    });
    if (cands.length) return cands;
    // 4) 폴백: 시도 불명이라도 동일 지역명이 유일하면 사용 (예: 영도구=기타)
    var byName = all.filter(function (r) { return normRegion(r.name) === mt; });
    if (byName.length === 1) return byName;
    return null;
  }

  /** 파싱된 행([{region, word}])을 현재 표제어에 반영 */
  function importDialectExcelRows(rows) {
    var hn = state.headwordNo;
    if (!hn) { toast('표제어를 먼저 선택하세요.'); setStep(1); return; }

    var existing = {};
    MyMapStore.listDialects(hn).forEach(function (d) { existing[d.word] = d.hd_id; });

    var wordRegions = {}, wordOrder = [], unmatched = {}, usedRows = 0;
    rows.forEach(function (row) {
      var regName = (row.region || '').trim();
      var wordStr = (row.word || '').trim();
      if (!regName || !wordStr) return;
      usedRows++;
      var refs = matchRegionsByName(regName);
      var words = wordStr.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      words.forEach(function (w) {
        if (!wordRegions[w]) { wordRegions[w] = {}; wordOrder.push(w); }
        if (refs) refs.forEach(function (rf) { wordRegions[w][rf.id] = rf; });
      });
      if (!refs) unmatched[regName] = true;
    });

    if (!wordOrder.length) { toast('가져올 지역어가 없습니다. 양식(지역명/지역어)을 확인하세요.'); return; }

    // 엑셀로 추가되는 신규 지역어는 모두 하나의 그룹으로 생성 (그룹 번호 1회 계산 후 공용)
    var importGroup = MyMapStore.nextGroupNumber(hn);
    var newWords = 0, mappedRegions = 0;
    wordOrder.forEach(function (w) {
      var hdId = existing[w];
      if (!hdId) {
        var res = MyMapStore.saveDialect({
          headword_no: hn, word: w,
          mutation_group: importGroup, map_symbol_id: ''
        });
        if (res && res.ok) { hdId = res.dialect.hd_id; existing[w] = hdId; newWords++; state.selectedHdId = hdId; }
      }
      if (!hdId) return;
      var owned = {};
      MyMapStore.listRegions(hdId).forEach(function (r) { owned[r.region_id] = true; });
      Object.keys(wordRegions[w]).forEach(function (rid) {
        if (owned[rid]) return;
        var rf = wordRegions[w][rid];
        var rr = MyMapStore.toggleRegion(hdId, { region_id: rf.id, region_nm: rf.label || rf.name });
        if (rr && rr.ok && rr.action !== 'remove') { mappedRegions++; owned[rid] = true; }
      });
    });

    refreshAddGroupSelect();
    renderDialects();
    renderStyleForm();
    rebuildFill();
    renderLegend();
    updateStepDone();
    updateStepNav();
    flashSaved();

    var unm = Object.keys(unmatched);
    var msg = '엑셀 반영 완료 — 지역어 ' + newWords + '종 · 지역 ' + mappedRegions + '곳 매핑'
      + (usedRows ? ' (' + usedRows + '행)' : '');
    if (unm.length) msg += ' · 미매칭 ' + unm.length + '건';
    toast(msg);
    if (unm.length) console.warn('[엑셀 미매칭 지역]', unm);
  }

  function handleExcelFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('파일을 읽지 못했습니다.'); };
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        var hdrIdx = -1, cName = -1, cWord = -1;
        for (var i = 0; i < Math.min(aoa.length, 12); i++) {
          var row = aoa[i] || [];
          var iName = -1, iWord = -1;
          for (var c = 0; c < row.length; c++) {
            var v = row[c];
            if (typeof v !== 'string') continue;
            if (iName === -1 && v.indexOf('지역명') !== -1) iName = c;
            if (iWord === -1 && v.indexOf('지역어') !== -1 && v.indexOf('방법') === -1) iWord = c;
          }
          if (iName !== -1 && iWord !== -1) { hdrIdx = i; cName = iName; cWord = iWord; break; }
        }
        if (hdrIdx === -1) { toast('양식을 인식하지 못했습니다. (지역명·지역어 열이 필요합니다)'); return; }
        var rows = [];
        for (var r = hdrIdx + 1; r < aoa.length; r++) {
          var rr = aoa[r] || [];
          var rn = rr[cName], wd = rr[cWord];
          if (rn == null && wd == null) continue;
          rows.push({ region: rn == null ? '' : String(rn), word: wd == null ? '' : String(wd) });
        }
        importDialectExcelRows(rows);
      } catch (err) {
        toast('엑셀 처리 실패: ' + (err && err.message ? err.message : err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') { toast('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    var aoa = [
      ['지역어 지도 등록 자료'],
      ['지역명', '지역코드', '지역어'],
      ['강원도 강릉시', '', '그늘'],
      ['강원도 고성군', '', '그늘, 그네'],
      ['서울특별시 종로구', '', '']
    ];
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '지도 Upload sample');
    XLSX.writeFile(wb, '지역어_지도_등록_양식.xlsx');
  }

  /** 현재 설정을 엑셀(xlsx)로 내려받기
   *  컬럼: 지역명·지역어·그룹·그룹내 순서·면색코드·부호코드·부호컬러코드 */
  function downloadSettingsXlsx() {
    if (!state.headwordNo) { toast('표제어를 선택하세요.'); return; }
    if (typeof XLSX === 'undefined') { toast('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    var dialects = MyMapStore.listDialects(state.headwordNo);
    if (!dialects.length) { toast('내보낼 지역어가 없습니다.'); return; }

    var aoa = [['지역명', '지역어', '그룹', '그룹내 순서', '면색코드', '부호코드', '부호컬러코드']];
    dialects.forEach(function (d) {
      var faceHex = d.face_color ? MyMapStore.rgbToHex(d.face_color) : '';
      var symCode = d.map_symbol_id ? String(d.map_symbol_id) : '';
      var symColor = d.symbol_color ? String(d.symbol_color) : '';
      var group = d.mutation_group != null ? d.mutation_group : '';
      var seq = d.mutation_seq != null ? d.mutation_seq : '';
      var regs = MyMapStore.listRegions(d.hd_id);
      if (!regs.length) {
        aoa.push(['', d.word, group, seq, faceHex, symCode, symColor]);
      } else {
        regs.forEach(function (r) {
          aoa.push([r.region_nm || r.region_id, d.word, group, seq, faceHex, symCode, symColor]);
        });
      }
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '설정');
    XLSX.writeFile(wb, '나만의지도_' + headwordLabel() + '_설정.xlsx');
    toast('설정을 엑셀로 내려받았습니다.');
  }

  /* ── style form ── */
  /** 상징 부호 시각 그리드(썸네일 피커) — 최초 1회 생성, 이후 선택/색상만 갱신 */
  function renderSymbolGrid() {
    var box = $('st-symbol-grid');
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    // 미설정(빈값) 부호 — 항상 첫 번째, 체커보드
    var none = document.createElement('button');
    none.type = 'button';
    none.className = 'mm-symbtn';
    none.dataset.id = '';
    none.setAttribute('role', 'option');
    none.setAttribute('aria-label', '부호 미설정');
    none.title = '미설정';
    applyNoneSwatch(none);
    none.addEventListener('click', function () {
      if (state._styleSaving) return;
      var hid = $('st-symbol'); if (hid) hid.value = '';
      syncSymbolGrid('', ($('st-symcolor') && $('st-symcolor').value) || '#64748b');
      saveStyle({ from: 'symbol' });
    });
    box.appendChild(none);
    var catalog = MyMapStore.getSymbolCatalog ? MyMapStore.getSymbolCatalog() : MyMapStore.SYMBOL_CATALOG;
    catalog.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-symbtn';
      btn.dataset.id = s.map_symbol_id;
      btn.dataset.file = s.file_nm;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-label', s.label);
      btn.title = s.label;
      btn.innerHTML = symbolImg(s.file_nm, '#64748b', 22);
      btn.addEventListener('click', function () {
        if (state._styleSaving) return;
        var hid = $('st-symbol');
        if (hid) hid.value = s.map_symbol_id;
        syncSymbolGrid(s.map_symbol_id, ($('st-symcolor') && $('st-symcolor').value) || '#111111');
        saveStyle({ from: 'symbol' });
      });
      box.appendChild(btn);
    });
  }

  /** 그리드 선택 상태 + 현재 그룹 면색으로 미리보기 틴트 (이미지 재로딩 없이 배경색만 변경) */
  function syncSymbolGrid(selectedId, color) {
    var box = $('st-symbol-grid');
    if (!box) return;
    color = color || '#64748b';
    var nodes = box.querySelectorAll('.mm-symbtn');
    for (var i = 0; i < nodes.length; i++) {
      var on = String(nodes[i].dataset.id) === String(selectedId);
      nodes[i].classList.toggle('is-selected', on);
      nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
      var img = nodes[i].querySelector('.symimg');
      if (img) img.style.backgroundColor = color;
    }
  }

  function renderStyleForm() {
    renderSymbolGrid();
    var d = state.selectedHdId ? MyMapStore.getDialect(state.selectedHdId) : null;
    if (!d) return;
    var title = $('style-modal-title');
    if (title) title.textContent = '지역어 상세 · 「' + (d.word || '') + '」';
    $('st-word').value = d.word || '';

    // 그룹 선택
    fillGroupSelect($('st-group'), d.mutation_group);

    // 그룹 내 순서 1..n
    var seqSel = $('st-seq');
    while (seqSel.firstChild) seqSel.removeChild(seqSel.firstChild);
    var seqOpts = MyMapStore.seqOptionsForDialect(d.hd_id);
    seqOpts.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s);
      o.textContent = String(s);
      seqSel.appendChild(o);
    });
    seqSel.value = d.mutation_seq != null ? String(d.mutation_seq) : '1';

    // 그룹 면색 → 팔레트 선택
    var gColor = d.mutation_group != null
      ? MyMapStore.getGroupColor(state.headwordNo, d.mutation_group)
      : d.face_color;
    var hex = MyMapStore.nearestPaletteHex
      ? MyMapStore.nearestPaletteHex(gColor)
      : MyMapStore.rgbToHex(gColor);
    // 그룹 면색은 상세 팝업에서 설정하지 않음(그룹별 자동 배정). hex 는 부호 기본색 계산용.
    // 부호 색상 — 면색과 별개. 값 없으면 그룹 면색을 기본값으로.
    // 부호 색상 — 값 없으면 '미설정'(빈값). 그리드 미리보기 틴트는 표시용으로 그룹 면색 사용.
    var symHex = (d.symbol_color && String(d.symbol_color)) || '';
    var tintHex = symHex || hex || '#64748b';
    $('st-symcolor').value = symHex;
    renderSymColorPalette(symHex);
    $('st-symbol').value = d.map_symbol_id || '';
    syncSymbolGrid(d.map_symbol_id || '', tintHex);

    var chips = $('st-regions');
    while (chips.firstChild) chips.removeChild(chips.firstChild);
    var regs = MyMapStore.listRegions(d.hd_id);
    var rc = $('st-region-count'); if (rc) rc.textContent = regs.length ? ('· ' + regs.length + '곳') : '';
    if (!regs.length) {
      var hint = document.createElement('span');
      hint.style.cssText = 'font-size:12px;color:#94a3b8;font-weight:600;';
      hint.textContent = '지역 없음 — 지도 클릭 또는 검색';
      chips.appendChild(hint);
    } else {
      regs.forEach(function (r) {
        var chip = document.createElement('span');
        chip.className = 'df-chip';
        var lab = document.createElement('span');
        lab.textContent = r.region_nm || r.region_id;
        var x = document.createElement('button');
        x.type = 'button';
        x.setAttribute('aria-label', '제거');
        x.textContent = '×';
        x.addEventListener('click', function () {
          MyMapStore.removeRegion(r.hdr_id);
          renderStyleForm();
          renderDialects();
          rebuildFill();
        });
        chip.appendChild(lab);
        chip.appendChild(x);
        chips.appendChild(chip);
      });
    }
    updateModeBar();
  }

  /**
   * 3단계 속성 즉시 저장 (그룹·순서·면색·상징·지역어명)
   * opts.from: 'group' | 'seq' | 'color' | 'symbol' | 'word' | 'all'
   * opts.quiet: true 이면 짧은 toast 생략
   */
  function saveStyle(opts) {
    opts = opts || {};
    if (state._styleSaving) return;
    if (!state.selectedHdId) return;
    var d0 = MyMapStore.getDialect(state.selectedHdId);
    if (!d0) return;

    state._styleSaving = true;
    try {
      var newGroup = $('st-group') ? $('st-group').value : d0.mutation_group;
      var newSeq = $('st-seq') ? $('st-seq').value : d0.mutation_seq;
      var newColor = $('st-color') ? $('st-color').value : null;
      var newSymbol = $('st-symbol') ? $('st-symbol').value : d0.map_symbol_id;
      var newSymColor = $('st-symcolor') ? ($('st-symcolor').value || null) : (d0.symbol_color || null);
      var newWord = $('st-word') ? $('st-word').value : d0.word;

      var res = MyMapStore.saveDialect({
        hd_id: state.selectedHdId,
        headword_no: state.headwordNo,
        word: newWord,
        mutation_group: newGroup,
        map_symbol_id: newSymbol,
        symbol_color: newSymColor
      });
      if (!res.ok) {
        var msgs = {
          group_sequence: '그룹은 순차적으로만 추가할 수 있습니다.',
          group_invalid: '올바른 그룹을 선택하세요.',
          group_missing: '존재하지 않는 그룹입니다.',
          word: '지역어를 입력하세요.',
          word_len: '지역어는 50자 이내여야 합니다.'
        };
        toast(msgs[res.reason] || '저장 실패');
        renderStyleForm();
        return;
      }

      // 순서 변경 (그룹 이동 후 최신 기준)
      var d1 = MyMapStore.getDialect(state.selectedHdId);
      if (d1 && newSeq != null && String(newSeq) !== String(d1.mutation_seq)) {
        var ro = MyMapStore.reorderDialectInGroup(state.selectedHdId, newSeq);
        if (!ro.ok) {
          toast(ro.reason === 'seq_range'
            ? '순서는 1~' + ro.max + ' 사이여야 합니다.'
            : '순서 변경 실패');
          renderStyleForm();
          return;
        }
      }

      // 그룹 면색 일괄
      d1 = MyMapStore.getDialect(state.selectedHdId);
      if (d1 && d1.mutation_group != null && newColor) {
        MyMapStore.setGroupColor(state.headwordNo, d1.mutation_group, newColor);
      }

      if (!opts.quiet) {
        var label = {
          group: '그룹',
          seq: '순서',
          color: '그룹 면색',
          symbol: '상징 부호',
          word: '지역어',
          all: '속성'
        }[opts.from || 'all'] || '속성';
        toast(label + ' 저장됨 · G' + (d1 && d1.mutation_group) +
          ' / 순서 ' + (d1 && d1.mutation_seq));
      }

      refreshAddGroupSelect();
      renderDialects();
      renderStyleForm();
      rebuildFill();
      renderLegend();
      flashSaved();
    } finally {
      state._styleSaving = false;
    }
  }

  function renderColorPalette(selectedHex) {
    var box = $('st-color-palette');
    var label = $('st-color-label');
    if (!box) return;
    var palette = MyMapStore.FACE_PALETTE || [];
    var sel = (selectedHex || ($('st-color') && $('st-color').value) || palette[0] || '#ef4444').toLowerCase();
    if (label) label.textContent = sel;

    // 한 번만 버튼 생성, 이후 선택 상태만 갱신
    if (!box.dataset.ready) {
      box.dataset.ready = '1';
      palette.forEach(function (hex, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mm-palette__swatch';
        btn.style.backgroundColor = hex;
        btn.dataset.hex = hex;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-label', '면색 ' + (idx + 1) + ' ' + hex);
        btn.title = hex;
        btn.addEventListener('click', function () {
          if (state._styleSaving) return;
          $('st-color').value = hex;
          renderColorPalette(hex);
          saveStyle({ from: 'color' });
        });
        box.appendChild(btn);
      });
    }

    var nodes = box.querySelectorAll('.mm-palette__swatch');
    for (var i = 0; i < nodes.length; i++) {
      var h = (nodes[i].dataset.hex || '').toLowerCase();
      var on = h === sel.toLowerCase();
      nodes[i].classList.toggle('is-selected', on);
      nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /** 부호 색상 팔레트 (면색과 별개) — 선택 시 그리드 재틴트 + 저장 */
  function renderSymColorPalette(selectedHex) {
    var box = $('st-symcolor-palette');
    if (!box) return;
    var palette = MyMapStore.FACE_PALETTE || [];
    // '' 은 미설정(빈값) — 유효값으로 취급
    var raw = (selectedHex != null ? selectedHex : (($('st-symcolor') && $('st-symcolor').value) || ''));
    var sel = String(raw).toLowerCase();
    if (!box.dataset.ready) {
      box.dataset.ready = '1';
      // 미설정(빈값) 스와치 — 항상 첫 번째, 그룹 면색을 따름
      var none = document.createElement('button');
      none.type = 'button';
      none.className = 'mm-palette__swatch';
      none.dataset.hex = '';
      none.title = '미설정 (그룹 면색 따름)';
      none.setAttribute('role', 'option');
      none.setAttribute('aria-label', '미설정');
      applyNoneSwatch(none);
      none.addEventListener('click', function () {
        if (state._styleSaving) return;
        $('st-symcolor').value = '';
        renderSymColorPalette('');
        var g = $('st-group') ? $('st-group').value : null;
        var gc = (g != null && g !== '') ? MyMapStore.getGroupColor(state.headwordNo, g) : null;
        syncSymbolGrid($('st-symbol') ? $('st-symbol').value : '', gc ? MyMapStore.rgbToHex(gc) : '#64748b');
        saveStyle({ from: 'symbol' });
      });
      box.appendChild(none);
      palette.forEach(function (hex, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mm-palette__swatch';
        btn.style.backgroundColor = hex;
        btn.dataset.hex = hex;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-label', '부호색 ' + (idx + 1) + ' ' + hex);
        btn.title = hex;
        btn.addEventListener('click', function () {
          if (state._styleSaving) return;
          $('st-symcolor').value = hex;
          renderSymColorPalette(hex);
          syncSymbolGrid($('st-symbol') ? $('st-symbol').value : '', hex);
          saveStyle({ from: 'symbol' });
        });
        box.appendChild(btn);
      });
    }
    var nodes = box.querySelectorAll('.mm-palette__swatch');
    for (var i = 0; i < nodes.length; i++) {
      var h = (nodes[i].dataset.hex || '').toLowerCase();
      var on = h === sel;
      nodes[i].classList.toggle('is-selected', on);
      nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function bindStyleAutosave() {
    if (state._styleBound) return;
    state._styleBound = true;

    function onChange(from) {
      return function () {
        if (state._styleSaving) return;
        saveStyle({ from: from });
      };
    }

    var g = $('st-group');
    var s = $('st-seq');
    var sym = $('st-symbol');
    var w = $('st-word');

    if (g) g.addEventListener('change', onChange('group'));
    if (s) s.addEventListener('change', onChange('seq'));
    if (sym) sym.addEventListener('change', onChange('symbol'));
    // 면색은 팔레트 클릭에서 즉시 저장 (renderColorPalette)
    if (w) {
      w.addEventListener('change', onChange('word'));
      w.addEventListener('blur', function () {
        if (state._styleSaving) return;
        var d = state.selectedHdId ? MyMapStore.getDialect(state.selectedHdId) : null;
        if (d && w.value !== d.word) saveStyle({ from: 'word' });
      });
    }
  }

  function deleteSelectedDialect() {
    if (!state.selectedHdId) return;
    var d = MyMapStore.getDialect(state.selectedHdId);
    if (!d) return;
    if (!confirm('지역어 [' + d.word + '] 를 삭제할까요?')) return;
    MyMapStore.removeDialect(state.selectedHdId);
    state.selectedHdId = null;
    toast('삭제했습니다.');
    closeStyleModal();
    exitPaintMode();
    renderDialects();
    rebuildFill();
    renderLegend();
    updateStepDone();
    updateStepNav();
  }

  /* ── map ── */
  function updateMapChrome() {
    var hw = state.headwordNo ? MyMapStore.getHeadword(state.headwordNo) : null;
    text($('map-title'), hw ? hw.headword : '표제어를 선택하세요');
    var badge = $('mm-status');
    if (badge) {
      if (!hw) {
        text(badge, '미저장');
        badge.className = 'mm-badge';
      } else if (hw.finalized_at) {
        text(badge, '최종 저장됨');
        badge.className = 'mm-badge mm-badge--saved';
      } else {
        text(badge, '임시 저장됨');
        badge.className = 'mm-badge mm-badge--temp';
      }
    }
    var auto = $('mm-autosave');
    if (auto && !auto.classList.contains('is-on')) {
      text(auto, hw ? '기기에 임시 저장됨' : '');
    }
    updateModeBar();
    renderLegend();
    updateStepDone();
    updateStepNav();
  }

  function updateModeBar() {
    var bar = $('mm-mode');
    if (!bar) return;
    if (!state.headwordNo) {
      text(bar, '1단계: 표제어를 등록·선택하세요.');
      return;
    }
    var d = state.selectedHdId ? MyMapStore.getDialect(state.selectedHdId) : null;
    if (!d) {
      text(bar, '2단계: 지역어를 추가한 뒤 선택하세요.');
      return;
    }
    text(bar, '「' + d.word + '」 지역 매핑 중 — 지도 클릭 또는 검색 (그룹 ' +
      (d.mutation_group != null ? d.mutation_group : '미지정') + ')');
  }

  function renderLegend() {
    var ul = $('mm-legend-list');
    if (!ul) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    if (!state.headwordNo) {
      ul.appendChild(Object.assign(document.createElement('li'), {
        className: 'maplegend__row',
        textContent: '표제어 선택 필요',
        style: 'color:#94a3b8'
      }));
      return;
    }
    var dialects = MyMapStore.listDialects(state.headwordNo);
    // 그룹 단위로 집계: 대표(순서 1번) 지역어 + 그룹 면색 + 매핑 지역 유무
    var groups = {};
    dialects.forEach(function (d) {
      var g = d.mutation_group;
      if (g == null || g === '') return;
      if (!groups[g]) groups[g] = { group: g, rep: null, minSeq: Infinity, hasRegion: false };
      var seq = parseInt(d.mutation_seq, 10);
      if (isNaN(seq)) seq = 9999;
      if (seq < groups[g].minSeq) { groups[g].minSeq = seq; groups[g].rep = d; }
      if (MyMapStore.countRegionsForDialect(d.hd_id)) groups[g].hasRegion = true;
    });
    var keys = Object.keys(groups).sort(function (a, b) { return (+a) - (+b); });
    var any = false;
    keys.forEach(function (k) {
      var g = groups[k];
      if (!g.hasRegion || !g.rep) return; // 지도에 표시되는 그룹만
      any = true;
      var li = document.createElement('li');
      li.className = 'maplegend__row';
      var mark = document.createElement('span');
      mark.className = 'dfmark-svg';
      mark.innerHTML = symbolSVG('circle', MyMapStore.rgbToHex(g.rep.face_color), 18);
      var name = document.createElement('span');
      name.textContent = g.rep.word;
      li.appendChild(mark);
      li.appendChild(name);
      ul.appendChild(li);
    });
    if (!any) {
      var li = document.createElement('li');
      li.className = 'maplegend__row';
      li.style.color = '#94a3b8';
      li.textContent = '지역 매핑 후 표시';
      ul.appendChild(li);
    }
  }

  function rebuildFill() {
    if (!state.olMap || !window.KoreaMap) return;
    if (state.fillLayer) {
      state.olMap.removeLayer(state.fillLayer);
      state.fillLayer = null;
    }
    if (state.symbolLayer) {
      state.olMap.removeLayer(state.symbolLayer);
      state.symbolLayer = null;
    }
    if (!state.headwordNo || !window.KOREA_MUNICIPALITIES) {
      renderLegend();
      return;
    }

    var owned = MyMapStore.buildFillByHeadword(state.headwordNo);
    var fc = { type: 'FeatureCollection', features: [] };
    var symbolFeatures = [];

    Object.keys(owned).forEach(function (rid) {
      var info = owned[rid];
      var geom = MyMapRegions.getGeometry ? MyMapRegions.getGeometry(rid) : null;
      var reg = MyMapRegions.get(rid);

      if (!geom) {
        if (String(rid).indexOf('prov_') === 0) {
          var pidx = reg ? reg.featureIndex : parseInt(String(rid).replace('prov_', ''), 10);
          if (window.KOREA_PROVINCES && KOREA_PROVINCES.features[pidx]) {
            geom = KOREA_PROVINCES.features[pidx].geometry;
          }
        } else if (String(rid).indexOf('muni_') === 0) {
          var midx = reg ? reg.featureIndex : parseInt(String(rid).replace('muni_', ''), 10);
          if (KOREA_MUNICIPALITIES && KOREA_MUNICIPALITIES.features[midx]) {
            geom = KOREA_MUNICIPALITIES.features[midx].geometry;
          }
        }
      }
      if (!geom) return;

      var color = MyMapStore.rgbToHex(info.face_color);
      fc.features.push({
        type: 'Feature',
        properties: {
          id: rid,
          color: color,
          name: info.region_nm,
          word: info.word
        },
        geometry: geom
      });

      // 부호 마커 (폴리곤 중심) — 부호 미설정이면 표시하지 않음
      var ll = (info.map_symbol_id && MyMapRegions.getCentroidLonLat)
        ? MyMapRegions.getCentroidLonLat(rid)
        : null;
      if (ll && window.ol) {
        var file = MyMapStore.symbolFileById
          ? MyMapStore.symbolFileById(info.map_symbol_id)
          : '001.png';
        var symColor = info.symbol_color ? String(info.symbol_color) : color;
        var f = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat(ll)),
          word: info.word,
          regionId: rid,
          symFile: file,
          color: symColor
        });
        symbolFeatures.push(f);
      }
    });

    state.fillLayer = KoreaMap.createFillLayer(fc, {
      zIndex: 2,
      fillAlpha: 0.35,
      colorProp: 'color'
    });
    if (state.fillLayer) {
      if (state.hideArea) state.fillLayer.setVisible(false);
      state.olMap.addLayer(state.fillLayer);
    }

    if (symbolFeatures.length && window.ol) {
      state.symbolLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: symbolFeatures }),
        style: function (feature) {
          return markerStyle(feature.get('color') || '#3b82f6', feature.get('symFile') || '001.png', false);
        },
        zIndex: 5
      });
      if (state.hideSymbol) state.symbolLayer.setVisible(false);
      state.olMap.addLayer(state.symbolLayer);
    }
    renderLegend();
  }

  function finalizeAndMaybeView(openView) {
    if (!state.headwordNo) {
      toast('표제어를 선택하세요.');
      setStep(1);
      return;
    }
    var res = MyMapStore.finalizeHeadword(state.headwordNo);
    if (!res.ok) {
      if (res.reason === 'dialects') {
        toast('지역어를 1개 이상 추가하세요.');
        setStep(2);
      } else if (res.reason === 'regions') {
        toast('지역을 1곳 이상 매핑하세요.');
        setStep(2);
      } else toast('저장할 수 없습니다.');
      return;
    }
    toast('최종 저장했습니다. 나의 지도 목록으로 이동합니다.');
    updateMapChrome();
    // 최종 저장 후 내정보 > 나의 지도 목록으로 이동
    setTimeout(function () {
      location.href = './mypage_map.html';
    }, 700);
  }

  function attachRegionFromRef(ref) {
    if (!state.selectedHdId) {
      toast('지역어를 먼저 선택하세요.');
      setStep(2);
      return;
    }
    var res = MyMapStore.toggleRegion(state.selectedHdId, {
      region_id: ref.id || ref.region_id,
      region_nm: ref.label || ref.region_nm || ref.name
    });
    if (!res.ok) {
      toast('지역 매핑 실패');
      return;
    }
    if (res.action === 'remove') toast('지역을 제거했습니다.');
    else if (res.action === 'move') toast((ref.label || ref.name) + ' → 현재 지역어로 옮김');
    renderStyleForm();
    renderDialects();
    rebuildFill();
    updateStepDone();
    updateStepNav();
    updatePaintBar();
    flashSaved();
  }

  function initMap() {
    var target = $('mm-map');
    if (!target || !window.ol || !window.KoreaMap) {
      toast('지도를 불러오지 못했습니다.');
      return;
    }
    MyMapRegions.rebuild();

    state.olMap = KoreaMap.create(target, {
      controls: [],
      center: [127.8, 38.3],
      zoom: 6.6
    });
    if (!state.olMap) return;

    if (window.KOREA_MUNICIPALITIES) {
      // regionId 를 GeoJSON 배열 인덱스와 1:1 로 부여 (getFeatures 순서 사용 금지)
      var hitFeatures = MyMapRegions.createHitFeatures
        ? MyMapRegions.createHitFeatures()
        : new ol.format.GeoJSON().readFeatures(KOREA_MUNICIPALITIES, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          });
      state.hitSource = new ol.source.Vector({ features: hitFeatures });
      if (!MyMapRegions.createHitFeatures) {
        MyMapRegions.attachIdsToSource(state.hitSource);
      }
      state.hitLayer = new ol.layer.Vector({
        source: state.hitSource,
        style: function (feature) {
          var hover = feature === state.hoverFeature;
          // 남한 시·군·구 · 북한 도 모두 기본 흰색(투명) — 호버 시만 파란 강조
          return new ol.style.Style({
            fill: new ol.style.Fill({
              color: hover ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0)'
            }),
            stroke: new ol.style.Stroke({
              color: hover ? '#3b82f6' : 'rgba(148,163,184,0.55)',
              width: hover ? 1.4 : 0.6
            })
          });
        },
        zIndex: 1,
        updateWhileAnimating: false,
        updateWhileInteracting: false
      });
      state.olMap.addLayer(state.hitLayer);
    }

    if (KoreaMap.attachRegionLayers) {
      // 라벨용 — 클릭 hit 에는 사용하지 않음. 지도 설정 토글용으로 컨트롤러 보관.
      state.regionCtl = KoreaMap.attachRegionLayers(state.olMap, { sidoVisible: true, sigunguVisible: false });
    }
    // 하천·철도·도로·산맥 오버레이 (지도 설정에서 토글, 처음 켤 때 지연 로드)
    if (KoreaMap.attachOverlays) {
      state.overlays = KoreaMap.attachOverlays(state.olMap);
    }

    /**
     * 클릭/호버 지역 판정 — 원본 GeoJSON 경위도 PIP (OL intersects 사용 안 함)
     * 부산 클릭 → 경기도 오인 등 투영/히트 오류 방지
     */
    function pickRegionRef(mapCoord) {
      if (MyMapRegions.pickRegionAtMapCoord) {
        return MyMapRegions.pickRegionAtMapCoord(mapCoord);
      }
      // fallback
      if (!state.hitSource) return null;
      var f = MyMapRegions.pickFeatureAtCoordinate
        ? MyMapRegions.pickFeatureAtCoordinate(state.hitSource, mapCoord)
        : null;
      if (!f) return null;
      return {
        id: f.get('regionId'),
        label: f.get('regionLabel') || f.get('name'),
        name: f.get('regionName') || f.get('name')
      };
    }

    function findHitFeatureByRegionId(regionId) {
      if (!state.hitSource || !regionId) return null;
      var found = null;
      state.hitSource.forEachFeature(function (f) {
        if (found) return;
        if (f.get('regionId') === regionId) found = f;
      });
      return found;
    }

    state.olMap.on('singleclick', function (evt) {
      if (!state.painting) {
        toast('지역어를 클릭해 「지역 지정」 모드로 들어가세요.');
        return;
      }
      var ref = pickRegionRef(evt.coordinate);
      if (!ref || !ref.id) {
        var ll = ol.proj.toLonLat(evt.coordinate);
        toast('시·군·구를 찾지 못했습니다. (' +
          ll[0].toFixed(3) + ', ' + ll[1].toFixed(3) + ')');
        return;
      }
      attachRegionFromRef({
        id: ref.id,
        label: ref.label || ref.name,
        name: ref.name
      });
    });

    state.olMap.on('pointermove', function (evt) {
      if (evt.dragging) return;
      var ref = pickRegionRef(evt.coordinate);
      var hit = ref ? findHitFeatureByRegionId(ref.id) : null;
      if (hit !== state.hoverFeature) {
        state.hoverFeature = hit;
        if (state.hitLayer) state.hitLayer.changed();
      }
      target.style.cursor = ref ? 'pointer' : '';
      if (ref && target) {
        target.title = ref.label || ref.name || '';
      }
    });

    // 레이아웃 확정 후 픽셀↔좌표 보정 (크기 어긋나면 클릭 위치가 통째로 밀림)
    function resizeMap() {
      if (!state.olMap) return;
      state.olMap.updateSize();
      // 최초 크기 확정 시 한반도 전체에 맞춰 1회 프레이밍
      if (!state.mapFitted) {
        var sz = state.olMap.getSize();
        if (sz && sz[0] && sz[1]) { fitKorea(false); state.mapFitted = true; }
      }
    }
    setTimeout(resizeMap, 0);
    setTimeout(resizeMap, 200);
    setTimeout(resizeMap, 600);
    window.addEventListener('resize', resizeMap);

    rebuildFill();
  }

  /** 한반도 전체(제주~북단)가 지도에 꽉 차도록 뷰 맞춤 — 화면 크기와 무관하게 일관 프레이밍 */
  function fitKorea(animate) {
    if (!state.olMap || !window.ol) return;
    var sz = state.olMap.getSize();
    if (!sz || !sz[0] || !sz[1]) return;
    var ext = ol.proj.transformExtent([124.6, 32.9, 132.0, 43.3], 'EPSG:4326', 'EPSG:3857');
    // 좌측 패딩을 크게 주어 한반도를 살짝 우측으로 배치 (좌하단 범례와 겹침도 완화)
    state.olMap.getView().fit(ext, { size: sz, padding: [16, 20, 16, 96], duration: animate ? 250 : 0 });
  }

  /* typeahead */
  function setupTypeahead() {
    var input = $('mm-region-search');
    var panel = $('mm-region-suggest');
    if (!input || !panel) return;
    var items = [];
    var activeIdx = -1;

    function close() {
      panel.hidden = true;
      panel.innerHTML = '';
      activeIdx = -1;
      items = [];
      input.setAttribute('aria-expanded', 'false');
    }

    function openList(list) {
      items = list;
      activeIdx = list.length ? 0 : -1;
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      if (!list.length) {
        var e = document.createElement('div');
        e.style.cssText = 'padding:10px;font-size:13px;color:#94a3b8;font-weight:600;';
        e.textContent = '검색 결과 없음';
        panel.appendChild(e);
        panel.hidden = false;
        return;
      }
      list.forEach(function (r, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mm-suggest__item' + (i === 0 ? ' is-active' : '');
        btn.textContent = r.label;
        btn.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          attachRegionFromRef(r);
          input.value = '';
          close();
        });
        panel.appendChild(btn);
      });
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (!q) { close(); return; }
      openList(MyMapRegions.search(q, 12));
    });
    input.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[activeIdx]) {
          attachRegionFromRef(items[activeIdx]);
          input.value = '';
          close();
        }
        return;
      } else if (e.key === 'Escape') {
        close();
        return;
      } else return;
      var nodes = panel.querySelectorAll('.mm-suggest__item');
      nodes.forEach(function (n, i) { n.classList.toggle('is-active', i === activeIdx); });
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  /* ── 지도 설정 · 공유 · 다운로드 (dialect_map.html 이식) ── */
  function withMapCanvas(cb) {
    if (!state.olMap) return;
    state.olMap.once('rendercomplete', function () {
      var size = state.olMap.getSize();
      var out = document.createElement('canvas');
      out.width = size[0]; out.height = size[1];
      var ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      document.querySelectorAll('#mm-map canvas').forEach(function (canvas) {
        if (canvas.width === 0) return;
        var op = canvas.parentNode.style.opacity || canvas.style.opacity;
        ctx.globalAlpha = op === '' ? 1 : Number(op);
        var t = canvas.style.transform;
        var m = /^matrix\(([^)]*)\)$/.exec(t);
        if (m) { var v = m[1].split(',').map(Number); ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]); }
        else ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(canvas, 0, 0);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      cb(out);
    });
    state.olMap.renderSync();
  }

  function triggerDownload(href, filename) {
    var a = document.createElement('a');
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function headwordLabel() {
    var hw = state.headwordNo ? MyMapStore.getHeadword(state.headwordNo) : null;
    return hw ? hw.headword : '지도';
  }

  function downloadMapImage(kind) {
    if (!state.olMap) { toast('지도가 없습니다.'); return; }
    withMapCanvas(function (canvas) {
      if (kind === 'pdf') {
        var url = canvas.toDataURL('image/png');
        var w = window.open('', '_blank');
        if (!w) { toast('팝업이 차단되어 PDF 창을 열 수 없습니다.'); return; }
        w.document.write('<html><head><title>지역어 지도 - ' + headwordLabel() + '</title></head>' +
          '<body style="margin:0"><img src="' + url + '" style="width:100%" ' +
          'onload="setTimeout(function(){window.focus();window.print();},300)"></body></html>');
        w.document.close();
      } else {
        triggerDownload(canvas.toDataURL('image/png'), '나만의지도_' + headwordLabel() + '.png');
      }
    });
  }

  function downloadCsv() {
    if (!state.headwordNo) { toast('표제어를 선택하세요.'); return; }
    var dialects = MyMapStore.listDialects(state.headwordNo);
    var rows = [['그룹', '순서', '지역어', '지역 수', '지역명']];
    dialects.forEach(function (d) {
      var regs = MyMapStore.listRegions(d.hd_id).map(function (r) { return r.region_nm || r.region_id; });
      rows.push([
        d.mutation_group != null ? d.mutation_group : '',
        d.mutation_seq != null ? d.mutation_seq : '',
        d.word,
        String(regs.length),
        regs.join(' / ')
      ]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    triggerDownload(url, '나만의지도_' + headwordLabel() + '_지역어.csv');
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function bindMapTools() {
    function bindPop(btnId, popId) {
      var btn = $(btnId), pop = $(popId);
      if (!btn || !pop) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = pop.hidden;
        document.querySelectorAll('.mm-pop').forEach(function (p) { p.hidden = true; });
        pop.hidden = !willOpen;
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    bindPop('mm-btn-settings', 'mm-pop-settings');
    bindPop('mm-btn-download', 'mm-pop-download');
    document.addEventListener('click', function () {
      document.querySelectorAll('.mm-pop').forEach(function (p) { p.hidden = true; });
    });

    function ov(id, key) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { if (state.overlays) state.overlays.show(key, el.checked); });
    }
    ov('ov-rivers', 'rivers'); ov('ov-rail', 'rail'); ov('ov-roads', 'roads'); ov('ov-mountains', 'mountains');

    var ls = $('lbl-sido');
    if (ls) ls.addEventListener('change', function () { if (state.regionCtl && state.regionCtl.showSido) state.regionCtl.showSido(ls.checked); });
    var lg = $('lbl-sigungu');
    if (lg) lg.addEventListener('change', function () { if (state.regionCtl && state.regionCtl.showSigungu) state.regionCtl.showSigungu(lg.checked); });

    var ha = $('hide-area');
    if (ha) ha.addEventListener('change', function () { state.hideArea = ha.checked; if (state.fillLayer) state.fillLayer.setVisible(!ha.checked); });
    var hs = $('hide-symbol');
    if (hs) hs.addEventListener('change', function () { state.hideSymbol = hs.checked; if (state.symbolLayer) state.symbolLayer.setVisible(!hs.checked); });

    var sh = $('mm-btn-share');
    if (sh) sh.addEventListener('click', function () {
      var url = location.href.split('?')[0] + (state.headwordNo ? ('?headword_no=' + encodeURIComponent(state.headwordNo)) : '');
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
      toast('현재 지도 링크를 복사했습니다.');
    });

    var dpng = $('mm-dl-png'); if (dpng) dpng.addEventListener('click', function () { downloadMapImage('png'); });
    var dpdf = $('mm-dl-pdf'); if (dpdf) dpdf.addEventListener('click', function () { downloadMapImage('pdf'); });
    var dcsv = $('mm-dl-csv'); if (dcsv) dcsv.addEventListener('click', downloadCsv);
  }

  function bindUi() {
    $('btn-hw-new').addEventListener('click', function () { openHeadwordModal(null); });
    $('btn-hw-save').addEventListener('click', saveHeadwordFromModal);
    document.querySelectorAll('[data-close-hw]').forEach(function (el) {
      el.addEventListener('click', closeHeadwordModal);
    });
    document.querySelectorAll('[data-close-style]').forEach(function (el) {
      el.addEventListener('click', closeStyleModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (state.painting) { exitPaintMode(); return; }
        var sm = $('style-modal'); if (sm && !sm.hidden) closeStyleModal();
        var hm = $('hw-modal'); if (hm && !hm.hidden) closeHeadwordModal();
      }
    });
    // 지역 지정(페인팅) 모드 툴바
    var pDone = $('mm-paint-done');
    if (pDone) pDone.addEventListener('click', exitPaintMode);
    var pSet = $('mm-paint-settings');
    if (pSet) pSet.addEventListener('click', function () { if (state.selectedHdId) openDetail(state.selectedHdId); });
    var pFromModal = $('btn-paint-from-modal');
    if (pFromModal) pFromModal.addEventListener('click', function () { enterPaintMode(state.selectedHdId); });
    $('btn-df-add').addEventListener('click', addDialect);
    var bExcel = $('btn-df-excel'), fExcel = $('df-excel-file'), bTpl = $('btn-df-excel-tpl');
    if (bExcel && fExcel) {
      bExcel.addEventListener('click', function () {
        if (!state.headwordNo) { toast('표제어를 먼저 선택하세요.'); setStep(1); return; }
        fExcel.value = '';
        fExcel.click();
      });
      fExcel.addEventListener('change', function (e) {
        handleExcelFile(e.target.files && e.target.files[0]);
      });
    }
    if (bTpl) bTpl.addEventListener('click', downloadExcelTemplate);
    var bExport = $('btn-df-export');
    if (bExport) bExport.addEventListener('click', downloadSettingsXlsx);
    $('df-word').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addDialect(); }
    });
    bindStyleAutosave();
    var btnSave = $('btn-style-save');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        saveStyle({ from: 'all' });
      });
    }
    $('btn-df-del').addEventListener('click', deleteSelectedDialect);

    document.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setStep(parseInt(btn.getAttribute('data-goto'), 10));
      });
    });

    var bPrev = $('btn-step-prev');
    var bNext = $('btn-step-next');
    if (bPrev) bPrev.addEventListener('click', function () { setStep(state.step - 1); });
    if (bNext) bNext.addEventListener('click', function () {
      if (state.step >= 3) {
        if (!confirm('현재 설정한 데이터를 기준으로 지도를 최종 저장할까요?')) return;
        finalizeAndMaybeView(false);
        return;
      }
      setStep(state.step + 1);
    });

    // 상단 단계 탭 클릭 이동
    document.querySelectorAll('.mm-step[data-step]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setStep(parseInt(tab.getAttribute('data-step'), 10));
      });
      tab.addEventListener('keydown', function (e) {
        var cur = parseInt(tab.getAttribute('data-step'), 10);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setStep(Math.min(3, cur + 1));
          var next = document.querySelector('.mm-step[data-step="' + state.step + '"]');
          if (next) next.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setStep(Math.max(1, cur - 1));
          var prev = document.querySelector('.mm-step[data-step="' + state.step + '"]');
          if (prev) prev.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          setStep(1);
          var t1 = document.querySelector('.mm-step[data-step="1"]');
          if (t1) t1.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          setStep(3);
          var t4 = document.querySelector('.mm-step[data-step="3"]');
          if (t4) t4.focus();
        }
      });
    });

    setupTypeahead();
    bindMapTools();

    $('mm-zoom-in').addEventListener('click', function () {
      if (!state.olMap) return;
      var v = state.olMap.getView();
      v.animate({ zoom: Math.min((v.getZoom() || 6) + 1, 12), duration: 200 });
    });
    $('mm-zoom-out').addEventListener('click', function () {
      if (!state.olMap) return;
      var v = state.olMap.getView();
      v.animate({ zoom: Math.max((v.getZoom() || 6) - 1, 5), duration: 200 });
    });
    $('mm-zoom-reset').addEventListener('click', function () {
      if (!state.olMap) return;
      fitKorea(true);
    });
    var legToggle = $('mm-legend-toggle');
    if (legToggle) {
      legToggle.addEventListener('click', function () {
        var box = legToggle.closest('.maplegend');
        if (!box) return;
        var collapsed = box.classList.toggle('is-collapsed');
        legToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }
  }

  function boot() {
    if (!window.MyMapStore || !window.MyMapRegions) {
      console.error('MyMapStore / MyMapRegions missing');
      return;
    }
    if (!MyMapStore.isLoggedIn()) MyMapStore.loginMock();
    // 시드 없이 빈 상태로 시작 (ensureSeed 원하면 주석 해제)
    // MyMapStore.ensureSeed();

    bindUi();
    fillWordClassOptions();
    renderSymbolGrid();

    // 메뉴 첫 진입은 항상 1단계(표제어 등록)부터 시작. 이전 선택 표제어는 복원해 목록에서 강조.
    var saved = MyMapStore.getSelectedHeadwordNo();
    if (saved && MyMapStore.getHeadword(saved)) {
      state.headwordNo = saved;
      var dfs = MyMapStore.listDialects(saved);
      if (dfs.length) state.selectedHdId = dfs[0].hd_id;
    }
    setStep(1);
    renderHeadwords();
    if (state.headwordNo) {
      renderDialects();
      refreshAddGroupSelect();
    }
    initMap();
    updateMapChrome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
