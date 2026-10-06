/* NEIBIS 기본 통계 화면 공통 런타임 (관리자 접속자·사용자 방문자·메뉴별·게시판·웹콘텐츠·게시물 다운로드).
 *
 * 운영 NEIBIS 는 화면을 서버(.do)가 그려 주지만, 이 정적 CMS 에는 서버가 없다.
 * 그래서 검색 조건을 읽어 «같은 마크업»을 브라우저에서 만들고, 차트는 ECharts 로 그린다.
 * 데이터는 접속·로그 원장이 로컬에 없어 **예시(프로토타입) 데이터**다 — 같은 조건이면 같은 값이 나오도록
 * 날짜·이름으로 시드를 잡은 난수로 만든다.
 *
 *   <script>var NS_KEY = 'user-cnt';</script><script src="./nstats.js"></script>
 */
(function () {
  'use strict';

  /* ── 공통 도구 ─────────────────────────────── */
  var COLORS = ['#357FED', '#F59E0B', '#0CAE79', '#F97316', '#8B5CF6', '#EF4444', '#0EA5E9', '#EC4899', '#84CC16', '#06B6D4'];
  var $ = window.jQuery;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(n) { return Number(n || 0).toLocaleString('en'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rand(seed) {                      // mulberry32
    var a = hash(String(seed));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
  function fmtDate(d) { return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function parseDate(s) { var p = String(s || '').split('.'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function eachDay(start, end) {
    var out = [], d = parseDate(start), e = parseDate(end);
    while (d <= e && out.length < 800) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  /* ── 예시 데이터 ───────────────────────────── */
  var ADMIN_MENUS = ['공지사항', '지역어 지도 서비스', '통합자료검색', '지역별 이형태 관리', '검색 표준어 어휘 관리', '어휘조사자료', '문학 속 지역어',
    '구술발화 조사 자료', '도움말(FAQ)', '검색 주제 분류 관리', '사진으로 보는 생활어', '자료실', '의견제시', '세대별 지역어 변화', '상징 부호 관리',
    '사용자 계정관리', '제보자 관리', '설문조사 관리', 'Open API사용현황', '호출 단어 순위', '호출 URL 순위', '사용자 접속 현황', '지역어 검색 순위',
    '내려받기 횟수', '어휘조사자료', '지역어 지도 통계', '구술발화 조사 자료 통계', '문학 속 지역어 통계', '대시보드', '관리자 접속자 통계'];
  var USER_MENUS = ['지역어 종합 정보 > 첫화면', '지역어 종합 정보 > 지역어 검색 > 통합자료검색', '지역어 종합 정보 > 지역어 검색 > 어휘조사자료',
    '지역어 종합 정보 > 지역어 지도 > 지역어 지도 서비스', '지역어 종합 정보 > 지역어 지도 > 나의 지도', '지역어 종합 정보 > 지역어 이야기 자료',
    '지역어 종합 정보 > 지역어 자료관 > 문학 속 지역어', '지역어 종합 정보 > 지역어 자료관 > 사진으로 보는 생활어', '지역어 종합 정보 > 지역어 자료관 > 자료실',
    '지역어 종합 정보 > 알림마당 > 공지사항', '지역어 종합 정보 > 알림마당 > 도움말', '지역어 종합 정보 > 알림마당 > 의견제시',
    '지역어 종합 정보 > 누리집 소개 > 사업 소개', '지역어 종합 정보 > 누리집 소개 > 사업 연혁', '지역어 종합 정보 > 누리집 소개 > 찾아오시는 길',
    '지역어 종합 정보 > 세대별 지역어 변화', '지역어 종합 정보 > 지역어 기상도', '지역어 종합 정보 > 오늘의 지역어', '지역어 종합 정보 > 지역어 퀴즈',
    '지역어 종합 정보 > Open API 안내', '지역어 종합 정보 > 내 정보', '지역어 종합 정보 > 로그인', '지역어 종합 정보 > 회원가입',
    '지역어 종합 정보 > 이용약관', '지역어 종합 정보 > 저작권정책', '지역어 종합 정보 > 개인정보처리방침', '지역어 종합 정보 > 사이트맵',
    '지역어 종합 정보 > 지역어 소개 영상', '지역어 종합 정보 > 설문조사'];
  var BOARDS = [{ id: '1003', nm: '의견제시' }, { id: '1000', nm: '공지사항' }, { id: '1001', nm: '자료실' }, { id: '1002', nm: '도움말' }];
  var CONTENTS = [{ sn: '115', nm: '지역어 종합 정보 > 누리집 소개 > 사업 소개' }, { sn: '106', nm: '지역어 종합 정보 > 누리집 소개 > 사업 연혁' },
    { sn: '104', nm: '지역어 종합 정보 > 누리집 소개 > 찾아오시는 길' }, { sn: '112', nm: '지역어 종합 정보 > 이용약관' },
    { sn: '114', nm: '지역어 종합 정보 > 저작권정책' }, { sn: '113', nm: '지역어 종합 정보 > 개인정보처리방침' }];
  var DOWNLOAD_MENUS = [{ id: '1001', nm: '지역어 종합 정보 > 지역어 자료관 > 자료실' }, { id: '1003', nm: '지역어 종합 정보 > 내 정보 > 의견제시' },
    { id: '1000', nm: '지역어 종합 정보 > 알림마당 > 공지사항' }];
  var POSTS = { '1001': ['2025년 세대별·성별 지역어 변이 조사 결과 보고서', '지역어 조사 결과 자료집 (어휘편)', '구술발화 전사 지침서', '지역어 지도 제작 안내서', '2026년 사업 추진 계획'],
    '1003': ['지도에서 지역 표시가 어긋납니다', '검색 결과 정렬 기준 문의', '음성 자료 재생이 안 됩니다'], '1000': ['누리집 개편 안내', '서비스 점검 안내', '설문조사 참여 안내', '이용약관 개정 안내'] };

  /* 일별 접속 — kind: 'mngr'(관리자 로그인) | 'user'(사용자 방문). 접속이 없는 날은 행이 없다. */
  function daily(kind, start, end) {
    var rows = [];
    eachDay(start, end).forEach(function (d) {
      var key = fmtDate(d), r = rand(kind + key), dow = d.getDay();
      if (r() < (kind === 'mngr' ? (dow === 0 || dow === 6 ? 0.75 : 0.18) : 0.12)) return;
      var visit, view, pc, mobile;
      if (kind === 'mngr') {
        visit = ri(r, 2, 36); mobile = r() < 0.06 ? ri(r, 1, 2) : 0; pc = visit - mobile; view = visit;
      } else {
        visit = ri(r, 1, 12); view = visit * ri(r, 6, 34);
        mobile = Math.round(view * (0.25 + r() * 0.2)); pc = view - mobile;
      }
      rows.push({ date: key, visit: visit, view: view, pc: pc, mobile: mobile });
    });
    return rows;                              // 날짜 오름차순
  }
  /* 메뉴별 — 기간이 길수록 많이 나오도록 일수를 곱한다. */
  function menus(kind, start, end, keyword) {
    var names = kind === 'mngr' ? ADMIN_MENUS : USER_MENUS, days = Math.max(1, eachDay(start, end).length);
    var list = names.map(function (nm, i) {
      var r = rand(kind + nm), w = 0.2 + r() * 1.6 * (1 - i / (names.length * 1.5));
      var visit = Math.max(1, Math.round(days * w * (kind === 'mngr' ? 3.5 : 5.5)));
      var view = kind === 'mngr' ? visit : Math.round(visit * (2 + r() * 12));
      var mobile = kind === 'mngr' ? (r() < 0.1 ? Math.round(visit * 0.05) : 0) : Math.round(view * (0.25 + r() * 0.2));
      return { sn: String(90 + i), name: nm, visit: visit, view: view, pc: view - mobile, mobile: mobile };
    });
    if (keyword) list = list.filter(function (x) { return x.name.indexOf(keyword) >= 0; });
    return list;
  }
  function boardMonthly(year, kind) {         // kind: 'inq'(조회수) | 'pst'(게시물 수)
    var now = new Date(), maxM = (+year === now.getFullYear()) ? now.getMonth() + 1 : 12;
    return BOARDS.map(function (b) {
      var r = rand(kind + year + b.id), m = [];
      for (var i = 1; i <= 12; i++) m.push(i > maxM ? 0 : (r() < 0.5 ? 0 : ri(r, 1, kind === 'inq' ? 60 : 6)));
      return { id: b.id, name: b.nm, months: m, total: m.reduce(function (t, v) { return t + v; }, 0) };
    });
  }
  function contsMonthly(sn, year) {           // 배포·수정·등록·복원·삭제
    var now = new Date(), maxM = (+year === now.getFullYear()) ? now.getMonth() + 1 : 12;
    return ['배포', '수정', '등록', '복원', '삭제'].map(function (st, k) {
      var r = rand('conts' + sn + year + st), m = [];
      for (var i = 1; i <= 12; i++) m.push(i > maxM ? 0 : (r() < (k === 0 ? 0.6 : 0.8) ? 0 : ri(r, 1, k === 0 ? 3 : 2)));
      return { name: st, months: m, total: m.reduce(function (t, v) { return t + v; }, 0) };
    });
  }

  /* ── 마크업 조각 (운영 화면과 같은 클래스) ───────── */
  function pageSizeSelect(size, applyClass) {
    return '<select class="form-control-sm" id="pageItm" name="pageItm" title="목록 수">'
      + [10, 20, 50, 100].map(function (n) { return '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>' + n + '</option>'; }).join('')
      + '</select> <button type="button" class="btn btn-sm btn-outline-gray ml-1 ' + (applyClass || 'search-button') + '">적용</button>';
  }
  function listControl(total, page, pages, size, opt) {
    opt = opt || {};
    return '<div class="list-control"><div class="left"><p class="total">총 <strong class="text-primary text-medium">' + total + '</strong>건(' + page + '/' + pages + ' page)</p></div>'
      + '<div class="right"><a href="javascript:void(0);" class="btn btn-sm btn-xls mr-1" id="' + (opt.excelId || 'neibisExcel') + '"><i class="ico ico-fileexcel-white-sm"></i><span>엑셀 다운로드</span></a>'
      + (opt.noSize ? '' : pageSizeSelect(size, opt.applyClass)) + '</div></div>';
  }
  function pagination(page, pages, cls) {
    if (pages <= 1) return '<div class="pagination"><strong>1</strong></div>';
    var start = Math.floor((page - 1) / 5) * 5 + 1, end = Math.min(pages, start + 4), h = '<div class="pagination">';
    h += '<a href="#" data-pg="1" class="direction first">처음</a><a href="#" data-pg="' + Math.max(1, page - 1) + '" class="direction prev">이전</a>';
    for (var i = start; i <= end; i++) h += i === page ? '<strong>' + i + '</strong>' : '<a href="#" data-pg="' + i + '">' + i + '</a>';
    h += '<a href="#" data-pg="' + Math.min(pages, page + 1) + '" class="direction next">다음</a><a href="#" data-pg="' + pages + '" class="direction last">마지막</a></div>';
    return h;
  }
  function sortBtn(title, type, st, cls) {   // st: {type, dir}
    var active = st && st.type === type, icon = active ? (st.dir === 'asc' ? ' up' : ' down') : '';
    return '<button type="button" class="table-align-btn ' + (cls || '') + '" data-order-type="' + type + '"><span class="table-title">' + title + '</span>'
      + '<span class="ico-wrap"><i class="ico ico-table-updown-darkgary-sm' + icon + '"></i><span class="sr-only">오름차순/내림차순 정렬</span></span></button>';
  }
  function tooltip(msg) {
    return '<div class="tooltip mr-0"><a href="#;" class="btn btn-icon btn-tooltip"><i class="ico ico-question-md"></i><span class="sr-only">도움말</span></a>'
      + '<div class="tooltip-content top-left"><div class="tooltip-inner"><p>' + msg + '</p></div></div></div>';
  }
  function tabIcons(kind, srA, srB) {         // 차트 전환 탭(막대/선 ↔ 도넛)
    return '<nav class="tabmenu tabmenu-custom"><ul class="tab-list">'
      + '<li class="on"><a href="#tab-content1"><i class="ico ico-' + kind + '-chart-white-sm"></i><i class="ico ico-' + kind + '-chart-primary-sm"></i><span class="sr-only">' + srA + '</span></a></li>'
      + '<li><a href="#tab-content2"><i class="ico ico-donut-chart-white-sm"></i><i class="ico ico-donut-chart-primary-sm"></i><span class="sr-only">' + srB + '</span></a></li></ul></nav>';
  }
  function noData(msg) { return '<div class="nodata-area"><p>' + (msg || '데이터가 없어요') + '</p></div>'; }
  function chartNoData() {
    return '<div class="card"><div class="chart-nodata-area"><p>아직 데이터를 수집하고 있어요.<br>비교 차트는 2개 이상의 데이터가 필요해요.</p></div></div>';
  }

  /* ── 차트 (ECharts) ─────────────────────────── */
  var charts = {};
  function loadECharts(cb) {
    if (window.echarts) { cb(); return; }
    var q = loadECharts.q = loadECharts.q || [];
    q.push(cb);
    if (loadECharts.loading) return;
    loadECharts.loading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
    s.onload = function () { q.splice(0).forEach(function (f) { f(); }); };
    s.onerror = function () { document.querySelectorAll('[data-chart-fallback]').forEach(function (n) { n.textContent = '차트를 불러오지 못했습니다. (네트워크)'; }); };
    document.head.appendChild(s);
  }
  function drawChart(id, options) {
    var el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('data-chart-fallback', '');
    if (!el.style.height) el.style.height = (options.__h || 304) + 'px';
    delete options.__h;
    loadECharts(function () {
      if (charts[id]) { charts[id].dispose(); }
      el.removeAttribute('data-chart-fallback');
      charts[id] = window.echarts.init(el);
      charts[id].setOption(options);
    });
  }
  window.addEventListener('resize', function () { Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].resize(); }); });

  var AX = { color: '#A6ADB9', fontSize: 10 };
  function lineOpt(dates, series, rotate) {
    return {
      grid: { top: 10, bottom: 30, left: 4, right: 0, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { orient: 'horizontal', x: 'center', y: 'bottom' },
      xAxis: { data: dates, axisLabel: { rotate: rotate == null ? 45 : rotate, fontSize: 10, color: '#A6ADB9' }, axisLine: { lineStyle: { color: '#E5E7EB' } }, axisTick: { show: false } },
      yAxis: { axisLabel: AX },
      series: series.map(function (s) { return { name: s.name, type: 'line', data: s.data, itemStyle: { color: s.color }, symbol: 'none' }; })
    };
  }
  function pieOpt(data, opt) {
    opt = opt || {};
    return {
      legend: { orient: 'horizontal', x: 'center', y: 'bottom', itemWidth: 12, itemHeight: 12, data: data.map(function (d) { return d.name; }) },
      color: COLORS,
      series: opt.outside ? [
        { name: opt.name || '비율', type: 'pie', radius: ['30%', '75%'], center: ['50%', '40%'], data: data, label: { formatter: '{b} {c}%' },
          labelLine: { length: 16, length2: 120, lineStyle: { color: '#A6ADB9' } }, emphasis: { itemStyle: { color: 'inherit' } }, z: 1 },
        { name: opt.name || '비율', type: 'pie', radius: ['30%', '75%'], center: ['50%', '40%'], data: data, label: { color: '#ffffff', position: 'inside', formatter: '{c}%' } }
      ] : [
        { name: opt.name || '비율', type: 'pie', radius: opt.radius || ['30%', '66%'], center: opt.center || ['50%', '42%'], data: data,
          label: { color: '#ffffff', position: 'inside', formatter: '{c}%' } }
      ]
    };
  }
  function barOpt(names, values, top) {       // 가로 막대(순위) — 화면에는 큰 값이 위로 온다
    return {
      grid: { top: top || 0, bottom: 0, left: 0, right: 0, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { axisLabel: { align: 'right', formatter: function (v) { return v >= 0 ? Math.round(v) : ''; } }, splitLine: { show: false }, boundaryGap: ['8%', '8%'], min: 0 },
      yAxis: {
        data: names.slice().reverse(), axisLine: { show: false },
        axisTick: { show: true, length: 200, lineStyle: { color: '#E5E7EB' } }, splitLine: { show: true, lineStyle: { color: '#E5E7EB' } },
        axisLabel: { margin: 8, formatter: function (v) { return v.length > 10 ? v.slice(0, 10) + '...' : v; } }
      },
      series: [{
        type: 'bar', data: values.slice().reverse(), barWidth: '16px',
        label: { show: true, position: 'right', formatter: function (p) { return Number(p.value).toLocaleString('en'); }, color: '#374151' },
        itemStyle: { color: function (p) { return COLORS[(values.length - 1 - p.dataIndex) % COLORS.length]; } }
      }],
      __h: 480
    };
  }
  function pctData(items) {                   // [{name,value}] → 비율(%) 소수 1자리
    var tot = items.reduce(function (t, x) { return t + x.value; }, 0) || 1;
    return items.map(function (x) { return { name: x.name, value: Math.round(x.value / tot * 1000) / 10 }; });
  }

  /* ── 다운로드(엑셀 대신 UTF-8 CSV) ──────────────── */
  function downloadCsv(name, head, rows) {
    var csv = '﻿' + [head].concat(rows).map(function (r) {
      return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ── 검색 폼 ───────────────────────────────── */
  function val(sel) { return $.trim($(sel).val() || ''); }
  function checkDates() {
    if (!val('#searchStartDt')) { Message.alert({ icon: 'warning', title: '', message: '검색조건에 시작일을 입력하셔야되요.' }); return false; }
    if (!val('#searchEndDt')) { Message.alert({ icon: 'warning', title: '', message: '검색조건에 종료일을 입력하셔야되요.' }); return false; }
    if (parseDate(val('#searchStartDt')) > parseDate(val('#searchEndDt'))) {
      alert({ icon: 'warning', title: '날짜를 확인해 주세요', message: '종료일이 시작일보다 먼저이면 안돼요.' }, function () { return false; });
      return false;
    }
    return true;
  }
  function q() {                               // 현재 검색 조건
    return {
      start: val('#searchStartDt'), end: val('#searchEndDt'), site: val('#searchCl') || 'ko', keyword: val('#searchKeyword'),
      year: val('#searchYear') || val('#searchStartDt') || String(new Date().getFullYear()),
      board: val('#searchCl2'), statsType: $('input[name=statsType]:checked').val() || 'real', cond: val('#searchCondition')
    };
  }
  function enhance(scope) {                   // 새로 만든 select 를 NEIBIS 드롭다운으로
    $(scope).find('select.form-control-sm').each(function () { try { $(this).selectToDropdown({ initialWidth: '100px' }); } catch (e) { } });
  }
  function siteName(tag, txt) { return '<div class="card site-name"><' + tag + '>' + esc(txt) + '</' + tag + '></div>'; }

  /* ── 페이지별 구현 ──────────────────────────── */
  var S = { page: 1, size: 10, sort: { type: 'date', dir: 'desc' } };     // 목록 상태
  var P = {};

  /* 공통: 일별 표 정렬/페이징 */
  function sortDaily(rows) {
    var t = S.sort.type, k = { visit: 'visit', view: 'view', pc: 'pc', mobile: 'mobile' }[t], dir = S.sort.dir === 'asc' ? 1 : -1;
    var out = rows.slice();
    if (t === 'date' || !k) out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    else out.sort(function (a, b) { return dir * (a[k] - b[k]) || (a.date < b.date ? 1 : -1); });
    return out;
  }
  function slicePage(rows) {
    var pages = Math.max(1, Math.ceil(rows.length / S.size));
    S.page = Math.min(Math.max(1, S.page), pages);
    return { pages: pages, rows: rows.slice((S.page - 1) * S.size, S.page * S.size) };
  }
  function result(html) {
    $('#ns-result').html(html);
    enhance('#ns-result');
  }

  /* A. 관리자 접속자 통계 — 로그인 통계 */
  P['mngr-login'] = {
    run: function () {
      var c = q(), all = daily('mngr', c.start, c.end), rows = sortDaily(all), pg = slicePage(rows);
      P['mngr-login'].all = all;
      var tot = all.reduce(function (t, r) { return { pc: t.pc + r.pc, mobile: t.mobile + r.mobile }; }, { pc: 0, mobile: 0 }), sum = tot.pc + tot.mobile || 1;
      var body = pg.rows.map(function (r, i) {
        return '<tr><td>' + (rows.length - (S.page - 1) * S.size - i) + '</td><td>' + r.date + '</td><td>' + r.visit + '</td><td>' + r.pc + '</td><td>' + r.mobile + '</td></tr>';
      }).join('');
      result('<div class="card"><div class="statistics-wrap"><div class="statistics-header"><h4 class="title1">관리자 로그인 통계</h4></div>'
        + '<div class="statistics-body"><div class="content-row"><div class="inner"><div class="col-item col-3"><div id="chart-line"></div></div><div class="col-item"><div id="chart-pie"></div></div></div></div></div></div></div>'
        + '<div class="card"><div class="result-area">' + listControl(rows.length, S.page, pg.pages, S.size)
        + '<div class="table table-list"><div class="table-inner"><table style="min-width: 800px"><caption class="sr-only">로그인 통계 목록</caption>'
        + '<thead><tr><th scope="col">번호</th><th scope="col">날짜</th><th scope="col">방문자 수</th><th scope="col">PC</th><th scope="col">Mobile</th></tr></thead><tbody>'
        + (body || '<tr><td colspan="5">데이터가 없어요</td></tr>') + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>');
      var dates = pg.rows.map(function (r) { return r.date.slice(5).replace('.', '.'); });
      drawChart('chart-line', lineOpt(dates, [
        { name: '전체', data: pg.rows.map(function (r) { return r.visit; }), color: '#7E8594' },
        { name: 'PC', data: pg.rows.map(function (r) { return r.pc; }), color: '#357FED' },
        { name: 'Mobile', data: pg.rows.map(function (r) { return r.mobile; }), color: '#F59E0B' }]));
      drawChart('chart-pie', pieOpt([{ value: Math.round(tot.pc / sum * 100), name: 'PC' }, { value: Math.round(tot.mobile / sum * 100), name: 'Mobile' }]));
    },
    excel: function () {
      var rows = sortDaily(P['mngr-login'].all || daily('mngr', q().start, q().end));
      downloadCsv('관리자 접속자 통계(로그인 통계)', ['번호', '날짜', '방문자 수', 'PC', 'Mobile'],
        rows.map(function (r, i) { return [rows.length - i, r.date, r.visit, r.pc, r.mobile]; }));
    }
  };

  /* B. 관리자 접속자 통계 — 메뉴별 통계 / E. 사용자 메뉴별 통계 (목록 + 막대 차트) */
  function menuRank(cfg) {
    return {
      run: function () {
        var c = q(), all = menus(cfg.kind, c.start, c.end, cfg.search ? c.keyword : '');
        var k = { visit: 'visit', view: 'view', pc: 'pc', mobile: 'mobile' }[S.sort.type] || 'visit', dir = S.sort.dir === 'asc' ? 1 : -1;
        all.sort(function (a, b) { return dir * (a[k] - b[k]) || (a.name < b.name ? -1 : 1); });
        this.all = all;
        var pg = slicePage(all), top = all.slice().sort(function (a, b) { return b.visit - a.visit; }).slice(0, 10);
        var cols = cfg.cols;
        var head = '<th scope="col">번호</th><th scope="col">메뉴명</th>' + cols.map(function (x) {
          return '<th scope="col">' + sortBtn(x[1], x[0], S.sort, cfg.search ? 'listOrderBtn' : '') + '</th>';
        }).join('');
        var body = pg.rows.map(function (r, i) {
          return '<tr><td>' + (all.length - (S.page - 1) * S.size - i) + '</td><td' + (cfg.search ? ' class="text-left"' : '') + '>'
            + (cfg.search ? '<a href="javascript:void(0);" class="link detailOpen" data-menu-site-id="ko" data-menu-sn="' + r.sn + '">' + esc(r.name) + '</a>' : esc(r.name)) + '</td>'
            + cols.map(function (x) { return '<td>' + num(r[x[0]]) + '</td>'; }).join('') + '</tr>';
        }).join('');
        result((cfg.search ? siteName('h3', '지역어 종합 정보') : '') + '<div class="content-row-area"><div class="card"><div class="result-area">'
          + listControl(all.length, S.page, pg.pages, S.size)
          + '<div class="table table-list"><div class="table-inner"><table style="min-width: 720px"><caption class="sr-only">' + cfg.caption + '</caption><thead><tr>' + head + '</tr></thead><tbody>'
          + (body || '<tr><td colspan="' + (cols.length + 2) + '">데이터가 없어요</td></tr>') + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>'
          + '<div class="card"><div class="statistics-wrap"><div class="statistics-header">' + tooltip('해당 차트는 최대 10개까지 표현할 수 있어요.')
          + '<h4 class="title1">' + cfg.chartTitle + '</h4></div><div class="statistics-body"><div id="chart-bar"></div></div></div></div></div>');
        drawChart('chart-bar', barOpt(top.map(function (x) { return x.name.split('>').pop().trim(); }), top.map(function (x) { return x.visit; })));
      },
      excel: function () {
        var all = this.all || menus(cfg.kind, q().start, q().end, '');
        downloadCsv(cfg.excel, ['번호', '메뉴명'].concat(cfg.cols.map(function (x) { return x[1]; })),
          all.map(function (r, i) { return [all.length - i, r.name].concat(cfg.cols.map(function (x) { return r[x[0]]; })); }));
      }
    };
  }
  P['mngr-menu'] = menuRank({ kind: 'mngr', cols: [['visit', '접속자 수'], ['pc', 'PC'], ['mobile', 'Mobile']], caption: '메뉴별 통계 목록', chartTitle: '메뉴별 접속자 수 순위', excel: '관리자 접속자 통계(메뉴별 통계)' });
  P['menu'] = menuRank({ kind: 'user', search: true, cols: [['visit', '방문자수'], ['view', '페이지뷰'], ['pc', 'PC'], ['mobile', 'Mobile']], caption: '메뉴별 방문자 통계 목록', chartTitle: '메뉴별 방문자 순위', excel: '사용자 메뉴별 통계' });

  /* C·D. 사용자 방문자 통계 — 방문자 수 / 방문자 디바이스 */
  function visitors(device) {
    return {
      run: function () {
        var c = q(), all = daily('user', c.start, c.end), rows = sortDaily(all), pg = slicePage(rows);
        this.all = all;
        var head = '<th scope="col">번호</th><th scope="col">날짜</th>' + [['visit', '방문자 수'], ['view', '페이지 뷰'], ['pc', 'PC'], ['mobile', 'Mobile']].map(function (x) {
          return '<th scope="col">' + sortBtn(x[1], x[0], S.sort) + '</th>';
        }).join('');
        var body = pg.rows.map(function (r, i) {
          return '<tr><td>' + (rows.length - (S.page - 1) * S.size - i) + '</td><td>' + r.date + '</td><td>' + num(r.visit) + '</td><td>' + num(r.view) + '</td><td>' + num(r.pc) + '</td><td>' + num(r.mobile) + '</td></tr>';
        }).join('');
        var tot = all.reduce(function (t, r) { return { pc: t.pc + r.pc, mobile: t.mobile + r.mobile }; }, { pc: 0, mobile: 0 }), sum = tot.pc + tot.mobile || 1;
        result(siteName('h4', '지역어 종합 정보')
          + '<div class="card"><div class="statistics-wrap"><div class="statistics-header"><h5 class="title1">' + (device ? '방문자 디바이스 통계' : '방문자 수 통계') + '</h5></div>'
          + '<div class="statistics-body">' + (device
              ? '<div class="content-row"><div class="inner"><div class="col-item col-3"><div id="chart-line"></div></div><div class="col-item"><div id="chart-pie"></div></div></div></div>'
              : '<div id="chart-line"></div>') + '</div></div></div>'
          + '<div class="card"><div class="result-area">' + listControl(rows.length, S.page, pg.pages, S.size)
          + '<div class="table table-list"><div class="table-inner"><table style="min-width: 800px"><caption class="sr-only">방문자 수 목록</caption><thead><tr>' + head + '</tr></thead><tbody>'
          + (body || '<tr><td colspan="6">데이터가 없어요</td></tr>') + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>');
        var asc = all, dates = asc.map(function (r) { return r.date.slice(5); });
        if (device) {
          drawChart('chart-line', lineOpt(dates, [{ name: 'PC', data: asc.map(function (r) { return r.pc; }), color: '#357FED' },
            { name: 'Mobile', data: asc.map(function (r) { return r.mobile; }), color: '#F59E0B' }]));
          drawChart('chart-pie', pieOpt([{ value: Math.round(tot.pc / sum * 100), name: 'PC' }, { value: Math.round(tot.mobile / sum * 100), name: 'Mobile' }]));
        } else {
          drawChart('chart-line', lineOpt(dates, [{ name: '방문자 수', data: asc.map(function (r) { return r.visit; }), color: '#357FED' },
            { name: '페이지 뷰', data: asc.map(function (r) { return r.view; }), color: '#F59E0B' }]));
        }
      },
      excel: function () {
        var rows = sortDaily(this.all || daily('user', q().start, q().end));
        downloadCsv(device ? '사용자 방문자 통계(방문자 디바이스)' : '사용자 방문자 통계(방문자 수)', ['번호', '날짜', '방문자 수', '페이지 뷰', 'PC', 'Mobile'],
          rows.map(function (r, i) { return [rows.length - i, r.date, r.visit, r.view, r.pc, r.mobile]; }));
      }
    };
  }
  P['user-cnt'] = visitors(false);
  P['user-device'] = visitors(true);

  /* F. 게시판 통계 — 조회 수 / 게시물 수 */
  function boards(kind) {
    var inq = kind === 'inq';
    return {
      run: function () {
        var c = q(), all = boardMonthly(c.year, kind);
        if (c.board) all = all.filter(function (b) { return b.id === c.board; });
        var dir = S.sort.dir === 'asc' ? 1 : -1;
        all.sort(function (a, b) { return dir * (a.total - b.total) || (a.name < b.name ? -1 : 1); });
        this.all = all; this.year = c.year;
        var pg = slicePage(all);
        var body = pg.rows.map(function (b) {
          return '<tr><td class="text-left">' + esc(b.name) + '</td><td>' + num(b.total) + '</td>' + b.months.map(function (m) { return '<td>' + m + '</td>'; }).join('') + '</tr>';
        }).join('');
        var pie = pctData(all.map(function (b) { return { name: b.name, value: b.total }; }).filter(function (x) { return x.value > 0; }));
        result(siteName('h4', '지역어 종합 정보') + '<div class="card"><div class="box guide-list"><ol><li>'
          + (inq ? '1월 ~ 12월은 해당 게시판의 전체 게시물 조회수의 총합을 나타내며, 조회수 합계는 1년간의 총 조회수 합계를 나타냅니다.'
                 : '1월 ~ 12월은 해당 게시판의 게시물 수의 총합을 나타내며, 총 게시물 수는 1년간의 총 게시물 수 합계를 나타냅니다.')
          + '</li></ol></div><div class="result-area">' + listControl(all.length, S.page, pg.pages, S.size)
          + '<div class="table table-list"><div class="table-inner"><table><caption class="sr-only">게시판 통계 ' + (inq ? '조회수' : '게시물 수') + ' 목록</caption><thead><tr>'
          + '<th scope="col">게시판명</th><th scope="col">' + sortBtn(inq ? '조회수 합계' : '총 게시물 수', 'total', S.sort) + '</th>'
          + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return '<th scope="col">' + m + '월</th>'; }).join('') + '</tr></thead><tbody>'
          + (body || '<tr><td colspan="14">데이터가 없어요</td></tr>') + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>'
          + (pie.length >= 2
              ? '<div class="card statistics"><div class="statistics-wrap"><div class="statistics-header">' + tooltip((inq ? '관리자 페이지에서 특정 게시판 게시물의 조회 횟수의 비중을 나타냅니다.' : '관리자 페이지에서 특정 게시판의 게시물을 등록/수정/복원 이력의 횟수의 비중을 나타냅니다.') + '<br><br>해당 차트는 최대 10개까지 표현할 수 있어요.')
                + '<h5 class="title1">' + c.year + '년 게시판 ' + (inq ? '조회 비율' : '사용 비율') + '</h5></div><div class="statistics-body"><div id="chart-pie" style="height:500px"></div></div></div></div>'
              : '<div class="card statistics">' + chartNoData() + '</div>'));
        if (pie.length >= 2) drawChart('chart-pie', (function () { var o = pieOpt(pie, { outside: true, name: '게시판 사용 비율' }); o.__h = 500; return o; })());
      },
      excel: function () {
        var all = this.all || boardMonthly(q().year, kind);
        downloadCsv('게시판 통계(' + (inq ? '조회수' : '게시물수') + ')', ['번호', '게시판명', inq ? '조회수 합계' : '총 게시물 수', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
          all.map(function (b, i) { return [all.length - i, b.name, b.total].concat(b.months); }));
      }
    };
  }
  P['bbs-inq'] = boards('inq');
  P['bbs-pst'] = boards('pst');

  /* G. 웹콘텐츠 통계 */
  P['conts'] = {
    run: function () {
      var c = q(), all = CONTENTS.map(function (x) {
        var r = rand('cnt' + x.sn + c.year), m = contsMonthly(x.sn, c.year);
        return { sn: x.sn, name: x.nm, cnt: m.reduce(function (t, s) { return t + s.total; }, 0) };
      });
      var dir = S.sort.dir === 'asc' ? 1 : -1;
      all.sort(function (a, b) { return dir * (a.cnt - b.cnt) || (a.name < b.name ? -1 : 1); });
      this.all = all;
      var pg = slicePage(all), top = all.slice().sort(function (a, b) { return b.cnt - a.cnt; });
      var body = pg.rows.map(function (r, i) {
        return '<tr><td>' + (all.length - (S.page - 1) * S.size - i) + '</td><td class="text-left"><a href="javascript:void(0);" class="link detailOpen" data-site-id="ko" data-menu-sn="' + r.sn + '">' + esc(r.name) + '</a></td><td>' + r.cnt + '</td></tr>';
      }).join('');
      result(siteName('h3', '지역어 종합 정보') + '<div class="content-row-area"><div class="card"><div class="box guide-list"><ol>'
        + '<li>웹 콘텐츠 관리 횟수는 관리자 페이지에서 특정 웹콘텐츠를 등록/수정/복원/배포 한 이력의 횟수 입니다.</li>'
        + '<li>웹 콘텐츠 관리 횟수 비율은 관리자 페이지에서 특정 웹콘텐츠를 등록/수정/복원/배포 한 이력의 횟수를 비율로 나타낸 데이터입니다.</li></ol></div>'
        + '<div class="result-area">' + listControl(all.length, S.page, pg.pages, S.size)
        + '<div class="table table-list"><div class="table-inner"><table><caption class="sr-only">웹 콘텐츠 통계 목록</caption><colgroup><col><col><col></colgroup>'
        + '<thead><tr><th scope="col">번호</th><th scope="col">컨텐츠명</th><th scope="col">' + sortBtn('관리 횟수', 'cnt', S.sort) + '</th></tr></thead><tbody>'
        + (body || '<tr><td colspan="3">데이터가 없어요</td></tr>') + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>'
        + '<div class="card"><div class="statistics-wrap"><div class="statistics-header">' + tooltip('해당 차트는 최대 10개까지 표현할 수 있어요.')
        + '<h4 class="title1">웹콘텐츠 관리 횟수 비율</h4>' + tabIcons('bar', '웹 콘텐츠 관리 횟수 차트', '웹 콘텐츠 관리 비율 차트') + '</div>'
        + '<div class="statistics-body"><div class="tab-content" id="tab-content1"><h4 class="sr-only">웹 컨텐츠 관리 횟수 차트</h4><div id="chart-bar"></div></div>'
        + '<div class="tab-content" id="tab-content2" style="display:none"><h4 class="sr-only">웹 콘텐츠 관리 비율 차트</h4><div id="chart-pie"></div></div></div></div></div></div>');
      var names = top.map(function (x) { return x.name.split('>').pop().trim(); });
      var o = barOpt(names, top.map(function (x) { return x.cnt; }), 85); o.__h = 480; drawChart('chart-bar', o);
      P.conts.pieData = pctData(top.map(function (x, i) { return { name: names[i], value: x.cnt }; }));
    },
    tab: function (i) {
      if (i === '2' && !charts['chart-pie']) {
        $('#tab-content2').show();
        var o = pieOpt(P.conts.pieData, { radius: ['30%', '75%'], center: ['50%', '45%'], name: '게시판 사용 비율' }); o.__h = 480;
        drawChart('chart-pie', o);
      }
    },
    excel: function () {
      var all = this.all || [];
      downloadCsv('웹콘텐츠 통계', ['콘텐츠명', '관리횟수'], all.map(function (r) { return [r.name, r.cnt]; }));
    }
  };

  /* H. 게시물 다운로드 통계 — 목록(메뉴별) */
  P['bbs-down'] = {
    run: function () {
      var c = q(), real = c.statsType === 'real', days = Math.max(1, eachDay(c.start, c.end).length);
      var all = DOWNLOAD_MENUS.map(function (m) {
        var r = rand('dn' + m.id + (real ? c.start + c.end : 'cum')), files = (POSTS[m.id] || []).length;
        return { id: m.id, name: m.nm, files: real ? ri(r, 0, files) : files, dl: real ? ri(r, 0, Math.min(120, days)) : ri(r, 0, 300) };
      });
      if (c.keyword && c.cond !== '2') all = all.filter(function (x) { return x.name.indexOf(c.keyword) >= 0; });
      this.all = all; this.real = real;
      var pg = slicePage(all);
      var body = pg.rows.map(function (r, i) {
        var no = all.length - (S.page - 1) * S.size - i;
        return '<tr><td>' + no + '</td><td class="text-left">' + (real ? esc(r.name) : '<a href="./pst-downnl-list.html?bbsId=' + r.id + '&statsType=cumulative" class="link">' + esc(r.name) + '</a>')
          + '</td><td>' + r.files + '</td><td>' + r.dl + '</td></tr>';
      }).join('');
      result(siteName('h4', '지역어 종합 정보') + (all.length
        ? '<div class="card"><div class="result-area">' + listControl(all.length, S.page, pg.pages, S.size)
          + '<div class="table table-list"><div class="table-inner"><table style="min-width: 1200px"><caption class="sr-only">게시물 다운로드 통계 목록</caption><thead><tr><th scope="col">번호</th><th scope="col">메뉴명</th>'
          + '<th scope="col">' + (real ? '다운로드 파일수' : '총 첨부파일수') + '</th><th scope="col">' + (real ? '실제 다운로드수' : '누적 다운로드수') + '</th></tr></thead><tbody>' + body
          + '</tbody></table></div></div>' + pagination(S.page, pg.pages) + '</div></div>'
        : '<div class="card">' + noData() + '</div>'));
    },
    excel: function () {
      var all = this.all || [], real = this.real !== false;
      downloadCsv('게시물 다운로드 통계(목록)', ['번호', '메뉴명', real ? '다운로드 파일수' : '총 첨부파일수', real ? '실제 다운로드수' : '누적 다운로드수'],
        all.map(function (r, i) { return [all.length - i, r.name, r.files, r.dl]; }));
    }
  };

  /* H-2. 게시물 다운로드 통계 — 게시물별(누적) */
  P['bbs-down-pst'] = {
    run: function () {
      var bbsId = new URLSearchParams(location.search).get('bbsId') || '1001', kw = val('#subSearchKeyword');
      var titles = POSTS[bbsId] || [], rows = [], n = 0;
      titles.forEach(function (t, i) {
        var r = rand('pst' + bbsId + t), files = ri(r, 1, 2);
        for (var f = 0; f < files; f++) rows.push({ title: t, file: t.replace(/[·\s]+/g, ' ') + (f ? '_부록' : '') + '.' + ['pdf', 'hwp', 'xlsx'][ri(r, 0, 2)], dl: ri(r, 0, 90) });
      });
      if (kw) rows = rows.filter(function (x) { return x.title.indexOf(kw) >= 0; });
      this.rows = rows; var menu = (DOWNLOAD_MENUS.filter(function (m) { return m.id === bbsId; })[0] || {}).nm || '';
      var pg = slicePage(rows);
      $('#ns-pst-total').html(listControl(rows.length, S.page, pg.pages, S.size, { noSize: false, applyClass: 'ns-apply' }));
      enhance('#ns-pst-total');
      $('#ns-pst-body').html(pg.rows.map(function (r, i) {
        return '<tr><td>' + (rows.length - (S.page - 1) * S.size - i) + '</td><td class="text-left">' + esc(menu.split('>').pop().trim()) + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.file)
          + ' &nbsp; <a href="javascript:void(0);" class="btn btn-xs btn-outline-gray"><i class="ico ico-download-darkgray-sm"></i> <span>다운로드</span></a></td><td>' + r.dl + '</td></tr>';
      }).join('') || '<tr><td colspan="5">데이터가 없어요</td></tr>');
      $('#ns-pst-pager').html(pagination(S.page, pg.pages));
    },
    excel: function () {
      var rows = this.rows || [];
      downloadCsv('게시물 다운로드 통계(게시물)', ['번호', '메뉴명', '제목', '첨부파일', '누적 다운로드수'], rows.map(function (r, i) { return [rows.length - i, '', r.title, r.file, r.dl]; }));
    }
  };

  /* ── 상세 팝업: 메뉴별 방문자(E) ─────────────── */
  var D = { sn: null, name: '', page: 1, sort: { type: 'date', dir: 'desc' }, rows: [] };
  function detailRows() {
    var f = $('form[name=detailForm]'), s = f.find('[name=searchStartDt]').val(), e = f.find('[name=searchEndDt]').val();
    var base = daily('user', s, e).map(function (r) {
      var k = rand('menu' + D.sn + r.date);
      var visit = Math.max(1, Math.round(r.visit * (0.2 + k() * 0.5))), view = Math.max(visit, Math.round(r.view * (0.1 + k() * 0.4)));
      var mobile = Math.round(view * (0.25 + k() * 0.2));
      return { date: r.date, visit: visit, view: view, pc: view - mobile, mobile: mobile };
    });
    return base;
  }
  function detailRender() {
    var rows = detailRows(); D.rows = rows;
    if (!rows.length) {
      $('#detailBody').html($('#noDataTemplate').clone().removeAttr('id'));
      $('#detail-statistics').attr('class', 'card modal-statistics');
      return;
    }
    var t = D.sort.type, dir = D.sort.dir === 'asc' ? 1 : -1, sorted = rows.slice();
    sorted.sort(function (a, b) { return t === 'date' ? dir * (a.date < b.date ? -1 : 1) : dir * (a[t] - b[t]) || (a.date < b.date ? 1 : -1); });
    if (t === 'date' && D.sort.dir === 'desc') sorted.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var size = 10, pages = Math.max(1, Math.ceil(sorted.length / size)); D.page = Math.min(Math.max(1, D.page), pages);
    var cols = [['date', '날짜'], ['visit', '방문자수'], ['view', '페이지뷰'], ['pc', 'PC'], ['mobile', 'Mobile']];
    var html = '<div class="modal-result-area"><div class="list-control"><div class="left"><p class="total">총 <strong class="text-primary">' + sorted.length + '</strong>건(' + D.page + '/' + pages + ' page)</p></div>'
      + '<div class="right"><a href="javascript:void(0);" class="btn btn-sm btn-xls" id="detailExcel"><i class="ico ico-fileexcel-white-sm"></i><span>엑셀 다운로드</span></a></div></div>'
      + '<div class="table table-list"><div class="table-inner"><table style="min-width: 600px"><caption class="sr-only">메뉴별 방문자 통계 상세 목록</caption><thead><tr><th scope="col">번호</th>'
      + cols.map(function (x) { return '<th scope="col">' + sortBtn(x[1], x[0], D.sort, 'detailOrderBtn') + '</th>'; }).join('') + '</tr></thead><tbody>'
      + sorted.slice((D.page - 1) * size, D.page * size).map(function (r, i) {
          return '<tr><td>' + (sorted.length - (D.page - 1) * size - i) + '</td><td>' + r.date + '</td><td>' + r.visit + '</td><td>' + r.view + '</td><td>' + r.pc + '</td><td>' + r.mobile + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' + pagination(D.page, pages).replace(/class="pagination"/, 'class="pagination detail-pagination"') + '</div>';
    $('#detailBody').html(html);
    $('#detail-statistics').attr('class', 'card');
    var dates = rows.map(function (r) { return r.date; });
    var tot = rows.reduce(function (a, r) { return { pc: a.pc + r.pc, mobile: a.mobile + r.mobile }; }, { pc: 0, mobile: 0 }), sum = tot.pc + tot.mobile || 1;
    $('#tab-content1').show(); $('#tab-content2').hide();
    $('#layer-statistics-popup .tabmenu-custom li').removeClass('on').first().addClass('on');
    var lo = lineOpt(dates, [{ name: '전체', data: rows.map(function (r) { return r.view; }), color: '#7E8594' }, { name: 'PC', data: rows.map(function (r) { return r.pc; }), color: '#357FED' },
      { name: 'Mobile', data: rows.map(function (r) { return r.mobile; }), color: '#F59E0B' }]);
    lo.__h = 420; drawChart('chart-line', lo);
    D.pie = pieOpt([{ value: Math.round(tot.pc / sum * 100), name: 'PC' }, { value: Math.round(tot.mobile / sum * 100), name: 'Mobile' }]); D.pie.__h = 420;
    delete charts['chart-pie-modal'];
  }
  function bindDetail() {
    $(document).on('click', '.detailOpen', function () {
      if (window.NS_KEY === 'conts') return;                         // 웹콘텐츠는 아래에서 따로
      D.sn = $(this).data('menu-sn'); D.page = 1; D.sort = { type: 'date', dir: 'desc' };
      var f = $('form[name=detailForm]'), main = q();
      f.find('input[name=searchDateRange]').prop('checked', false).filter('[value=1m]').prop('checked', true);
      f.find('[name=searchStartDt]').val(main.start); f.find('[name=searchEndDt]').val(main.end);
      var arr = $(this).text().split('>'), path = '';
      $('#detail-title').text($.trim(arr[arr.length - 1]));
      arr.forEach(function (x) { path += '<li>' + $.trim(x) + '</li>'; });
      $('.breadcrumb-list').last().html(path);
      D.name = $.trim(arr[arr.length - 1]);
      detailRender();
      openModal('#layer-statistics-popup', this);
    });
    $(document).on('click', '.detailOrderBtn', function () {
      var type = $(this).data('order-type');
      D.sort = { type: type, dir: (D.sort.type === type && D.sort.dir === 'desc') ? 'asc' : 'desc' };
      D.page = 1; detailRender();
    });
    $(document).on('click', '.detail-pagination a[data-pg]', function (e) { e.preventDefault(); D.page = +$(this).data('pg'); detailRender(); });
    $(document).on('click', '#detailExcel', function () {
      downloadCsv(D.name + ' 메뉴 방문자 통계', ['날짜', '방문자 수', '페이지뷰', 'PC', 'MOBILE'], D.rows.map(function (r) { return [r.date, r.visit, r.view, r.pc, r.mobile]; }));
    });
    window.detailSubmit = function () { D.page = 1; detailRender(); };
    window.detailSearchReset = function () {
      var f = $('form[name=detailForm]');
      f.find('input[type=text]').val(''); f.find('input[name=searchDateRange]').prop('checked', false); return false;
    };
    // 팝업의 기간 라디오 → 날짜 채우기
    $(document).on('click', '#layer-statistics-popup input[name=searchDateRange]', function () { getDateRange(null, this); });
    // 도넛 전환은 보일 때 그린다(숨은 상태에서 그리면 크기가 0)
    $(document).on('click', '#layer-statistics-popup .tabmenu-custom a', function (e) {
      e.preventDefault();
      var i = $(this).attr('href').replace('#tab-content', '');
      $('#layer-statistics-popup .tabmenu-custom li').removeClass('on'); $(this).closest('li').addClass('on');
      $('#tab-content1,#tab-content2').hide(); $('#tab-content' + i).show();
      if (i === '2' && D.pie) { drawChart('chart-pie', D.pie); } else if (charts['chart-line']) { charts['chart-line'].resize(); }
    });
  }

  /* ── 상세 팝업: 웹콘텐츠(G) ─────────────────── */
  function contsDetail(sn, year, name) {
    var m = contsMonthly(sn, year), arr = name.split('>'), path = '';
    $('#detail-title').text($.trim(arr[arr.length - 1]));
    arr.forEach(function (x) { path += '<li>' + $.trim(x) + '</li>'; });
    $('#layer-statistics-popup .breadcrumb-list').html(path);
    var has = m.some(function (s) { return s.total > 0; });
    if (!has) {
      $('#detail_statistics').hide(); $('#popupDetailCard .table-list').hide(); $('#popupDetailCard .nodata-area').show();
    } else {
      $('#detailBody').html(m.map(function (s) {
        return '<tr><td>' + s.name + '</td><td>' + s.total + '</td>' + s.months.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>';
      }).join(''));
      $('#detail_statistics').show(); $('#popupDetailCard .table-list').show(); $('#popupDetailCard .nodata-area').hide();
      var max = Math.max(5, Math.max.apply(null, m.map(function (s) { return Math.max.apply(null, s.months); })));
      var order = ['배포', '수정', '등록', '복원', '삭제'], col = ['#357FED', '#F59E0B', '#0CAE79', '#8B5CF6', '#EF4444'];
      drawChart('chart-colbar', {
        legend: { orient: 'horizontal', x: 'center', y: 'bottom', itemWidth: 12, itemHeight: 12 },
        grid: { top: 20, bottom: 40, left: 0, right: 0, containLabel: true },
        xAxis: { data: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'], axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { margin: 8 } },
        yAxis: { min: 0, max: max, axisLabel: { align: 'right' }, splitLine: { show: true, lineStyle: { color: '#E5E7EB' } } },
        series: order.map(function (n, i) {
          var s = m.filter(function (x) { return x.name === n; })[0];
          return { name: n, type: 'bar', data: s.months, barWidth: '16px', barGap: '30%', label: { show: true, position: 'top', color: '#374151' }, itemStyle: { color: col[i] } };
        }),
        __h: 320
      });
    }
    openModal('#layer-statistics-popup', document.body);
  }

  /* ── 초기화·이벤트 ──────────────────────────── */
  /* 검색 카드(form 안)와 결과(#ns-result)는 형제 카드가 아니라 .card + .card 간격이 안 먹는다 */
  var st = document.createElement('style');
  st.textContent = '#ns-result{margin-top:20px}#ns-result:empty{margin-top:0}';
  document.head.appendChild(st);
  NSinit();
  function NSinit() {
    var key = window.NS_KEY, page = P[key];
    if (!page) return;
    $(function () {
      // 기간 라디오 → 시작·종료일 채우기(운영 화면과 같은 함수)
      if ($('input[name=searchDateRange]').length && window.ActionInit) ActionInit.click('input[name=searchDateRange]', getDateRange, this);
      var hasDates = !!$('#searchStartDt').length;
      var run = function (resetPage) {
        if (resetPage !== false) S.page = 1;
        if (hasDates && !checkDates()) return;
        S.size = parseInt($('#pageItm').val() || S.size, 10) || 10;
        $('.loadingbar').removeClass('show').addClass('hide');
        page.run.call(page);
      };
      NS.run = run;
      // 검색·적용·엔터
      $(document).on('click', '#search-form .search-button, #ns-result .search-button', function (e) { e.preventDefault(); run(true); });
      $(document).on('submit', '#search-form', function (e) { e.preventDefault(); run(true); });
      $(document).on('click', '#searchResetBtn, #resetBtn', function () {
        formResetAction($('#search-form'));
        $('#search-form input[name=statsType][value=real]').prop('checked', true);
        $('#ns-result').html(initialHtml);
        S = { page: 1, size: 10, sort: (key === 'menu' || key === 'mngr-menu') ? { type: 'visit', dir: 'desc' } : (/^bbs-(inq|pst)$/.test(key) ? { type: 'total', dir: 'desc' } : (key === 'conts' ? { type: 'cnt', dir: 'desc' } : { type: 'date', dir: 'desc' })) };
        if ($('#searchDateRange3').length) defaultDateRange();
        if (!initialHtml) run(true);
      });
      $('#search-form input[type=text]').on('keypress', function (e) { if (e.which === 13) { e.preventDefault(); run(true); } });
      // 정렬 — 같은 열을 다시 누르면 방향이 바뀐다
      $(document).on('click', '#ns-result .table-align-btn:not(.detailOrderBtn)', function () {
        var type = $(this).data('order-type');
        S.sort = { type: type, dir: (S.sort.type === type && S.sort.dir === 'desc') ? 'asc' : 'desc' };
        run(true);
      });
      // 페이지 이동
      $(document).on('click', '#ns-result .pagination:not(.detail-pagination) a[data-pg], #ns-pst-pager a[data-pg]', function (e) {
        e.preventDefault(); S.page = +$(this).data('pg'); run(false);
      });
      // 엑셀
      $(document).on('click', '#neibisExcel', function () { page.excel.call(page); });
      // 웹콘텐츠 차트 탭·상세
      if (key === 'conts') {
        $(document).on('click', '#ns-result .tabmenu-custom a', function (e) {
          e.preventDefault(); var i = $(this).attr('href').replace('#tab-content', '');
          $('#ns-result .tabmenu-custom li').removeClass('on'); $(this).closest('li').addClass('on');
          $('#tab-content1,#tab-content2').hide(); $('#tab-content' + i).show();
          if (i === '2') page.tab('2'); else if (charts['chart-bar']) charts['chart-bar'].resize();
        });
        var cur = { sn: '', name: '' };
        $(document).on('click', '.detailOpen', function () {
          cur = { sn: $(this).data('menu-sn'), name: $(this).text() };
          $('#layer-statistics-popup select[name=searchYear]').val(val('#searchYear') || new Date().getFullYear());
          contsDetail(cur.sn, val('#searchYear') || new Date().getFullYear(), cur.name);
        });
        $(document).on('click', '#popupSearchBtn', function () { contsDetail(cur.sn, $(this).closest('form').find('select[name=searchYear]').val(), cur.name); });
        $(document).on('click', '#popupResetBtn', function () {
          var y = new Date().getFullYear(); $('select[name=searchYear]').val(y).change(); return false;
        });
        window.frmSubmit = function () { run(true); };
      }
      if (key === 'menu') bindDetail();
      if (key === 'bbs-down-pst') {
        $(document).on('click', '#ns-apply,.ns-apply', function () { S.size = parseInt($('#pageItm').val(), 10) || 10; S.page = 1; page.run(); });
      }
      // 사이트명 변경 등 select 는 NEIBIS 플러그인이 처리
      var initialHtml = $('#ns-result').data('initial') === 'search-before' ? $('#ns-result').html() : '';
      if (/^(menu|mngr-menu)$/.test(key)) S.sort = { type: 'visit', dir: 'desc' };
      if (/^bbs-(inq|pst)$/.test(key)) S.sort = { type: 'total', dir: 'desc' };
      if (key === 'conts') S.sort = { type: 'cnt', dir: 'desc' };
      if ($('#searchDateRange3').length && window.defaultDateRange) defaultDateRange();
      if (!initialHtml) run(true);       // 목록이 처음부터 보이는 화면은 바로 조회
    });
  }
  var NS = window.NS = {};
})();
