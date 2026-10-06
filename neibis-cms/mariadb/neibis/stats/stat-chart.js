/* 월별 누적 막대 그래프 — 외부 라이브러리 없이 SVG 로 그린다.
 *
 *   StatChart.render(element, {
 *     title: '월별 접속 추이',
 *     labels: ['2026-06', '2026-07'],                 // 오래된 달부터
 *     series: [{ name: '첫화면', values: [3, 4] }, ...],
 *     unit: '건', emptyText: '표시할 기록이 없습니다.',
 *     bare: true      // 카드 테두리 없이 그린다(이미 카드 안에 넣을 때)
 *   });
 *
 * 값이 모두 0 이면 그래프 대신 안내 문구를 보인다. 막대는 한 달이어도 너무 굵어지지 않게 폭을 제한한다.
 */
(function (global) {
  'use strict';
  var COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function render(el, o) {
    if (!el) return;
    var labels = o.labels || [], series = o.series || [];
    var totals = labels.map(function (_, i) {
      return series.reduce(function (t, s) { return t + (s.values[i] || 0); }, 0);
    });
    var head = o.title ? '<h3 class="title1 text-primary" style="margin:0 0 12px">' + esc(o.title) + '</h3>' : '';
    if (!labels.length || !totals.some(function (t) { return t > 0; })) {
      var empty = head + '<p class="text-center" style="padding:28px 0;color:#64748b">' + esc(o.emptyText || '표시할 기록이 없습니다.') + '</p>';
      el.innerHTML = o.bare ? empty : '<div class="card">' + empty + '</div>';
      return;
    }
    var W = 760, H = 240, L = 44, R = 12, T = 12, B = 30;
    var max = niceMax(Math.max.apply(null, totals)), pw = W - L - R, ph = H - T - B;
    var slot = pw / labels.length, bw = Math.min(56, slot * 0.6);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(o.title || '월별 추이') + '" style="display:block;max-height:280px">';
    for (var g = 0; g <= 4; g++) {                                   // 눈금
      var y = T + ph - ph * g / 4;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e8f0"/>'
        + '<text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#64748b">'
        + Math.round(max * g / 4).toLocaleString() + '</text>';
    }
    labels.forEach(function (lb, i) {
      var x = L + slot * i + (slot - bw) / 2, acc = 0;
      series.forEach(function (s, k) {
        var v = s.values[i] || 0;
        if (!v) return;
        var h = ph * v / max, yy = T + ph - ph * (acc + v) / max;
        svg += '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + h + '" fill="' + COLORS[k % COLORS.length] + '">'
          + '<title>' + esc(lb + ' · ' + s.name + ' ' + v.toLocaleString() + (o.unit || '')) + '</title></rect>';
        acc += v;
      });
      svg += '<text x="' + (x + bw / 2) + '" y="' + (T + ph - ph * totals[i] / max - 5) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">'
        + totals[i].toLocaleString() + '</text>'
        + '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#64748b">' + esc(lb) + '</text>';
    });
    svg += '</svg>';
    var legend = '<ul style="display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;margin:10px 0 0;padding:0;font-size:12px;color:#475569">'
      + series.map(function (s, k) {
          return '<li style="display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:2px;background:'
            + COLORS[k % COLORS.length] + '"></i>' + esc(s.name) + '</li>';
        }).join('') + '</ul>';
    el.innerHTML = o.bare ? head + svg + legend : '<div class="card">' + head + svg + legend + '</div>';
  }

  global.StatChart = { render: render };
})(window);
