/* CMS 목록 정적 대체본 — API 가 없는 배포(Vercel·GitHub Pages)용.
 *
 * 화면마다 같은 코드를 복사하지 않으려고 한 곳에 둔다.
 * 쓰는 쪽은 실패 콜백에서 CmsStatic.load(...) 를 부르고, 돌려받은 res 를
 * 원래 성공 콜백에 그대로 넘기면 된다 — 목록·페이저 코드는 손대지 않는다.
 *
 *   CmsStatic.load({
 *     url:      './data/cms/oral_list.json',   // 화면 기준 상대경로
 *     page:     state.page,
 *     pageSize: state.pageSize,
 *     filter:   function (row) { return ...; } // 없으면 전량
 *   }, function (res) { ... });                 // res 가 null 이면 대체본도 없음
 */
(function (global) {
  'use strict';
  var cache = {};

  function rowsOf(d) {
    return (d && (Array.isArray(d.list) ? d.list : d.rows)) || [];
  }
  function keyOf(d) {
    return (d && Array.isArray(d.list)) ? 'list' : 'rows';
  }

  function slice(data, o) {
    var all = rowsOf(data);
    var rows = o.filter ? all.filter(o.filter) : all;
    var size = parseInt(o.pageSize, 10) || 10;
    var pages = Math.max(1, Math.ceil(rows.length / size));
    var page = Math.min(Math.max(1, parseInt(o.page, 10) || 1), pages);
    var res = {
      ok: true, total: rows.length, page: page, pageSize: size, size: size,
      totalPages: pages, counts: data.counts,
      // 원본이 일부만 담긴 경우 그대로 물려준다 — 화면이 알려야 한다
      truncated: !!data.truncated, sourceTotal: data.total
    };
    res[keyOf(data)] = rows.slice((page - 1) * size, page * size);
    return res;
  }

  function load(o, cb) {
    var u = o.url;
    if (cache[u]) { cb(slice(cache[u], o)); return; }
    var x = new XMLHttpRequest();
    x.open('GET', u, true);
    x.onload = function () {
      if (x.status < 200 || x.status >= 300) { cb(null); return; }
      try {
        var d = JSON.parse(x.responseText);
        if (!rowsOf(d).length && !d.ok) { cb(null); return; }
        cache[u] = d; cb(slice(d, o));
      } catch (e) { cb(null); }
    };
    x.onerror = function () { cb(null); };
    x.send();
  }

  /* 목록 위에 '사본으로 보고 있음' 띠를 한 번만 붙인다 */
  function notice(anchorSel, res, extra) {
    if (document.getElementById('cmsStaticNote')) return;
    var el = document.querySelector(anchorSel);
    if (!el) return;
    var msg = '자료를 <b>내려받은 사본</b>으로 보고 있습니다 — 이 배포에는 관리 API 가 없어'
            + ' 등록·수정·삭제는 되지 않습니다.';
    if (res && res.truncated) {
      msg += ' 또한 전체 ' + Number(res.sourceTotal).toLocaleString()
           + '건 가운데 <b>앞쪽 일부만</b> 담겨 있습니다.';
    }
    if (extra) msg += ' ' + extra;
    var p = document.createElement('p');
    p.id = 'cmsStaticNote';
    p.style.cssText = 'margin:0 0 10px;padding:9px 12px;border-radius:8px;'
      + 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:12.5px';
    p.innerHTML = msg;
    el.parentNode.insertBefore(p, el);
  }

  global.CmsStatic = { load: load, notice: notice };
})(window);
