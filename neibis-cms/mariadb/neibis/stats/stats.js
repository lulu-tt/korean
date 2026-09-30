/* 통계 화면 공통 스크립트 — sections 응답({sections:[{title, columns, rows}]})을 그린다.
 *
 * 쓰는 화면은 STAT_KEY 를 정한 뒤 이 파일을 불러온다.
 *   <script>var STAT_KEY = 'story';</script><script src="./stats.js"></script>
 *
 * 그리는 규칙
 *  - 한 줄짜리 표(전체 통계)는 숫자 카드로, "전체(공개)" 꼴은 큰 숫자 + 공개 수로 나눈다.
 *  - 3행 이상인 표는 열 제목을 눌러 정렬하고, 숫자 열에는 크기 막대를 깐다.
 *  - "지역별"·"주제" 표에는 맨 아래에 합계를 둔다(상위 N건만 담은 작품·작가 표는 합계가 무의미해 뺀다).
 *  - 문학 속 지역어는 전체 통계 아래 나머지 표를 탭으로 나눈다.
 */
(function () {
  'use strict';

  /* ── 문자열·숫자 ───────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function com(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* 숫자에 천 단위 쉼표. 글자가 섞인 값(주제명·연월 등)은 건드리지 않고, 검색 순위는 끝의 (건수) 만 바꾼다 */
  function fmt(v) {
    if (typeof v === 'number') return v.toLocaleString();
    v = String(v == null ? '' : v);
    if (window.STAT_KEY === 'search-dialect') {
      return esc(v.replace(/\((\d+)\)$/, function (m, n) { return '(' + Number(n).toLocaleString() + ')'; }));
    }
    if (/\d/.test(v) && !/^\d{4}-\d{2}$/.test(v) &&
        /^[\d\s.,()\/:]*(?:개|도|지점|전사자료|음성자료|\d)*[\d\s.,()\/:개도지점전사자료음성]*$/.test(v)) {
      return esc(v.replace(/\d+(?:\.\d+)?/g, function (m) {
        var p = m.split('.');
        return com(p[0]) + (p[1] ? '.' + p[1] : '');
      }));
    }
    return esc(v);
  }

  var NUM = /-?\d[\d,]*(?:\.\d+)?/g;
  function nums(v) {
    var m = String(v == null ? '' : v).match(NUM);
    return m ? m.map(function (x) { return parseFloat(x.replace(/,/g, '')); }) : [];
  }
  function firstNum(v) { var a = nums(v); return a.length ? a[0] : null; }

  /* ── 카드 ─────────────────────────────────── */
  function kpi(label, value) {
    var s = String(value == null ? '' : value);
    var m = s.match(/^(.+?)\((.+)\)$/);          // "311233(274265)" → 큰 숫자 + 공개
    var big = m ? m[1] : s;
    var sub = m ? '공개 ' + fmt(m[2]) : '';
    var name = m ? label.replace(/\(공개\)/, '') : label;
    return '<div class="stat-kpi"><span class="stat-kpi__k">' + esc(name) + '</span>'
      + '<strong class="stat-kpi__v">' + fmt(big) + '</strong>'
      + '<em class="stat-kpi__s">' + esc(sub) + '</em></div>';
  }
  function cards(sec) {
    var row = sec.rows[0] || [];
    return '<div class="stat-kpis">' + sec.columns.map(function (c, i) { return kpi(c, row[i]); }).join('') + '</div>';
  }

  /* ── 표 ───────────────────────────────────── */
  function wantsTotal(sec) {
    // 문학 속 지역어는 한 표제어가 여러 지역에 걸쳐 중복 집계되므로 합계가 전체 표제어 수와 어긋난다
    if (window.STAT_KEY === 'literature') return false;
    return /지역별/.test(sec.title || '') || sec.columns[0] === '주제';
  }
  function totalRow(sec) {
    var cells = ['합계'];
    for (var j = 1; j < sec.columns.length; j++) {
      var col = sec.rows.map(function (r) { return nums(r[j]); });
      var k = col[0] ? col[0].length : 0;
      if (!k || col.some(function (a) { return a.length !== k; })) { cells.push(''); continue; }
      var sums = [];
      for (var i = 0; i < k; i++) sums.push(col.reduce(function (t, a) { return t + a[i]; }, 0));
      var idx = 0;
      cells.push(String(sec.rows[0][j]).replace(NUM, function () {
        var v = sums[idx++];
        return Math.round(v) === v ? String(v) : String(Math.round(v * 1000) / 1000);
      }));
    }
    return cells;
  }
  function table(sec) {
    if (!sec.rows.length) {
      var msg = window.STAT_KEY === 'search-dialect' ? '검색 기록이 없습니다.' : '조회된 내역이 없습니다.';
      return '<div class="table table-list"><div class="table-inner"><table><thead><tr>'
        + sec.columns.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('')
        + '</tr></thead><tbody><tr><td colspan="' + sec.columns.length + '" class="text-center" style="padding:24px;color:#64748b">'
        + msg + '</td></tr></tbody></table></div></div>';
    }
    var rich = window.STAT_KEY !== 'search-dialect' && sec.rows.length >= 3;   // 정렬·막대
    var head = sec.columns.map(function (c, j) {
      return rich ? '<th scope="col" class="stat-sort" data-col="' + j + '" tabindex="0" aria-sort="none">' + esc(c) + '<i></i></th>'
                  : '<th scope="col">' + esc(c) + '</th>';
    }).join('');
    var body = sec.rows.map(function (r) {
      return '<tr>' + r.map(function (v) { return '<td class="text-center">' + fmt(v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var foot = '';
    if (rich && wantsTotal(sec)) {
      foot = '<tfoot><tr class="stat-total">' + totalRow(sec).map(function (v) {
        return '<td class="text-center">' + fmt(v) + '</td>';
      }).join('') + '</tr></tfoot>';
    }
    return '<div class="table table-list"><div class="table-inner"><table' + (rich ? ' class="stat-rich"' : '') + '>'
      + '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>' + foot + '</table></div></div>';
  }
  function section(sec) {
    // 월별·순위 표는 행이 하나여도 표다 — 카드는 «전체 통계» 성격의 화면에만 쓴다
    var monthly = window.STAT_KEY === 'download-cnt' || window.STAT_KEY === 'search-dialect';
    var one = !monthly && sec.rows.length === 1 && sec.columns.length >= 2 && !/작품|작가|지역별/.test(sec.title || '');
    return (sec.title ? '<h3 class="title1 text-primary" style="margin:0 0 12px">' + esc(sec.title) + '</h3>' : '')
      + (one ? cards(sec) : table(sec));
  }

  /* 숫자 열마다 최댓값 대비 막대 */
  function bars(root) {
    root.querySelectorAll('table.stat-rich').forEach(function (t) {
      var rows = [].slice.call(t.tBodies[0].rows);
      var cols = t.rows[0].cells.length;
      for (var j = 1; j < cols; j++) {
        var vals = rows.map(function (r) { return firstNum(r.cells[j].textContent); });
        if (vals.some(function (v) { return v == null; })) continue;
        var max = Math.max.apply(null, vals);
        if (!(max > 0)) continue;
        rows.forEach(function (r, i) {
          var w = Math.round(vals[i] / max * 100);
          r.cells[j].style.background = 'linear-gradient(90deg, rgba(37,99,235,.13) ' + w + '%, transparent ' + w + '%)';
        });
      }
    });
  }
  function sortBy(th) {
    var t = th.closest('table'), j = +th.getAttribute('data-col');
    var rows = [].slice.call(t.tBodies[0].rows);
    var numeric = rows.every(function (r) { return firstNum(r.cells[j].textContent) != null; });
    var dir = th.getAttribute('aria-sort') === 'descending' ? 1 : (th.getAttribute('aria-sort') === 'ascending' ? -1 : (numeric ? -1 : 1));
    rows.sort(function (a, b) {
      var x = a.cells[j].textContent, y = b.cells[j].textContent;
      return dir * (numeric ? firstNum(x) - firstNum(y) : x.localeCompare(y, 'ko'));
    });
    rows.forEach(function (r) { t.tBodies[0].appendChild(r); });
    [].forEach.call(t.querySelectorAll('th.stat-sort'), function (h) { h.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
  }

  /* ── 화면 그리기 ─────────────────────────────── */
  function render(res) {
    var secs = res.sections || [], html = '';
    if (window.STAT_KEY === 'literature' && secs.length > 2) {
      html += '<div class="card">' + section(secs[0]) + '</div>';
      var tabs = secs.slice(1);
      html += '<div class="card"><nav class="tabmenu tabmenu-type1"><ul class="tab-list" id="stat-tabs" role="tablist">'
        + tabs.map(function (sec, i) {
            var label = String(sec.title || '').replace(/\s*통계.*$/, '').trim();
            return '<li' + (i === 0 ? ' class="on"' : '') + ' data-tab="' + i + '" id="stat-tab-' + i + '" role="tab" aria-controls="stat-panel-' + i + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">'
              + '<a href="javascript:void(0);"><span>' + esc(label) + '</span></a></li>';
          }).join('') + '</ul></nav>'
        + tabs.map(function (sec, i) {
            return '<div class="stat-tab-panel" id="stat-panel-' + i + '" role="tabpanel" aria-labelledby="stat-tab-' + i + '" data-panel="' + i + '"' + (i === 0 ? '' : ' hidden') + ' style="margin-top:16px">'
              + (/상위/.test(sec.title || '') ? '<p style="margin:0 0 8px;color:#64748b;font-size:13px">' + esc((sec.title || '').replace(/^.*(\(.*\)).*$/, '$1')) + '</p>' : '')
              + table(sec) + '</div>';
          }).join('') + '</div>';
    } else {
      html = secs.map(function (sec) { return '<div class="card">' + section(sec) + '</div>'; }).join('');
    }
    var box = document.getElementById('stat-sections');
    if (window.STAT_KEY === 'download-cnt') html = '<div id="stat-chart"></div>' + html;
    box.innerHTML = html;
    bars(box);
    if (window.STAT_KEY === 'download-cnt') downloadChart(secs[0]);
  }
  /* 월별 내려받기 추이 — 표는 최신 달이 위라 그래프는 뒤집어 오래된 달부터 그린다 */
  function downloadChart(sec) {
    if (!window.StatChart || !sec) return;
    var rows = sec.rows.slice().reverse();
    StatChart.render(document.getElementById('stat-chart'), {
      title: '월별 내려받기 추이',
      labels: rows.map(function (r) { return r[0]; }),
      series: sec.columns.slice(1).map(function (c, j) {
        return { name: c, values: rows.map(function (r) { return nums(r[j + 1]).reduce(function (t, v) { return t + v; }, 0); }) };
      }),
      unit: '회', emptyText: '선택한 기간에 내려받기 기록이 없습니다.'
    });
  }
  function fail(msg) {
    document.getElementById('stat-sections').innerHTML =
      '<div class="card"><p class="text-center" style="padding:24px 0 12px;color:#b91c1c">' + msg + '</p>'
      + '<p class="text-center" style="padding-bottom:16px"><button type="button" class="btn btn-md btn-outline-gray" onclick="loadStats()">'
      + '<i class="ico ico-undo-darkgray-md"></i><span class="text">다시 시도</span></button></p></div>';
  }

  /* ── 조회 ─────────────────────────────────── */
  var reqSeq = 0;                                  // 늦게 도착한 옛 응답이 새 결과를 덮지 않게
  function params() {
    var p = new URLSearchParams();
    var s = ($('#startNum').val() || '').replace(/\D/g, ''), e = ($('#endNum').val() || '').replace(/\D/g, '');
    if (s) p.set('startNum', s);
    if (e) p.set('endNum', e);
    return p;
  }
  function load() {
    var seq = ++reqSeq;
    fetch('/mariadb/neibis-api/stats/' + window.STAT_KEY + '?' + params().toString())
      .then(function (r) { return r.json(); })
      .then(function (d) { if (seq !== reqSeq) return; if (d && d.ok) render(d); else fail('목록을 불러오지 못했습니다.'); })
      .catch(function () {
        if (seq !== reqSeq) return;
        /* 정적 배포에는 CMS API 가 없다 — 내보내 둔 사본으로 물러난다 */
        var x = new XMLHttpRequest();
        x.open('GET', '../data/cms/stats_' + window.STAT_KEY.replace(/-/g, '_') + '.json', true);
        x.onload = function () { if (seq !== reqSeq) return; try { render(JSON.parse(x.responseText)); } catch (e) { fail('API 호출 실패'); } };
        x.onerror = function () { if (seq === reqSeq) fail('API 호출 실패'); };
        x.send();
      });
  }

  /* 기간(월) 입력 보조 — 빠른 선택과 시작·종료 검증 */
  window.setMonthRange = function (n) {
    var d = new Date(), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var end = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    d.setMonth(d.getMonth() - (n - 1));
    $('#startNum').val(n ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : '');
    $('#endNum').val(n ? end : '');
    load();
  };
  window.monthRangeOk = function () {
    var s = ($('#startNum').val() || '').replace(/\D/g, ''), e = ($('#endNum').val() || '').replace(/\D/g, '');
    if (s && e && s > e) { alert('시작 월이 종료 월보다 늦을 수 없습니다.'); return false; }
    return true;
  };
  window.loadStats = load;
  window.btnInit = function () { $('#search-form')[0].reset(); load(); };
  window.downloadExcel = function () {
    location.href = '/mariadb/neibis-api/stats/' + window.STAT_KEY + '/excel?' + params().toString();
  };

  /* ── 스타일 ───────────────────────────────── */
  var st = document.createElement('style');
  st.textContent =
    '.stat-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}' +
    '.stat-kpi{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;text-align:center}' +
    '.stat-kpi__k{font-size:13px;color:#64748b}' +
    '.stat-kpi__v{font-size:26px;line-height:1.2;font-weight:800;color:#1e293b;letter-spacing:-.02em}' +
    '.stat-kpi__s{font-style:normal;font-size:12px;color:#2563eb;min-height:1.2em}' +
    'th.stat-sort{cursor:pointer;user-select:none;white-space:nowrap}' +
    'th.stat-sort i{display:inline-block;width:10px;margin-left:4px;font-style:normal;color:#94a3b8}' +
    'th.stat-sort:hover{background:#eef2f7}' +
    'th.stat-sort[aria-sort=ascending] i:after{content:"\\25B2";color:#2563eb;font-size:9px}' +
    'th.stat-sort[aria-sort=descending] i:after{content:"\\25BC";color:#2563eb;font-size:9px}' +
    'th.stat-sort[aria-sort=none] i:after{content:"\\21C5"}' +
    'tr.stat-total td{font-weight:700;background:#f1f5f9;border-top:2px solid #cbd5e1}';
  document.head.appendChild(st);

  $(function () {
    $('#startNum,#endNum').on('input', function () { if (!/^\d{4}-\d{2}$/.test(this.value)) this.value = this.value.replace(/[^\d-]/g, ''); })
      .on('keypress', function (e) { if (e.keyCode === 13) { e.preventDefault(); if (window.monthRangeOk()) load(); } });
    $('#stat-sections').on('click', 'th.stat-sort', function () { sortBy(this); })
      .on('keydown', 'th.stat-sort', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(this); } })
      .on('click keydown', '#stat-tabs li', function (e) {
        var $li = $(this), $all = $('#stat-tabs li');
        if (e.type === 'keydown') {
          var k = e.key, at = $all.index($li);
          if (k === 'ArrowRight') $li = $all.eq((at + 1) % $all.length);
          else if (k === 'ArrowLeft') $li = $all.eq((at - 1 + $all.length) % $all.length);
          else if (k === 'Home') $li = $all.eq(0);
          else if (k === 'End') $li = $all.eq($all.length - 1);
          else if (k !== 'Enter' && k !== ' ') return;
          e.preventDefault();
        }
        var i = $li.attr('data-tab');
        $all.removeClass('on').attr({ 'aria-selected': 'false', tabindex: -1 });
        $li.addClass('on').attr({ 'aria-selected': 'true', tabindex: 0 });
        if (e.type === 'keydown') $li[0].focus();
        $('.stat-tab-panel').attr('hidden', true).filter('[data-panel="' + i + '"]').removeAttr('hidden');
      });
    load();
  });
})();
