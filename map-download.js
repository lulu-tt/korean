/* 지역어 지도 다운로드. 지도 화면과 별도로 렌더링해 현재 화면 상태를 보존한다. */
(function () {
  'use strict';

  window.setupMapDownloads = function (api) {
    var byId = function (id) { return document.getElementById(id); };
    var busy = false;
    var regionWrap = byId('downloadRegionWrap');
    document.querySelectorAll('input[name="downloadScope"]').forEach(function (input) {
      input.addEventListener('change', function () { regionWrap.hidden = input.value !== 'area' || !input.checked; });
    });

    function download(href, filename) {
      var link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    function safeName(value) { return String(value || '지도').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim(); }
    function selected(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el && el.value; }

    function regionExtent(name) {
      var feature = window.KOREA_PROVINCES && window.KOREA_PROVINCES.features.find(function (f) { return f.properties.name === name; });
      if (!feature) throw new Error('선택한 지역의 경계 정보를 찾을 수 없습니다.');
      return new ol.format.GeoJSON().readFeature(feature, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }).getGeometry().getExtent();
    }

    function nationalExtent() {
      if (!window.KOREA_PROVINCES) throw new Error('지도 경계 정보를 찾을 수 없습니다.');
      var extent = ol.extent.createEmpty();
      window.KOREA_PROVINCES.features.forEach(function (feature) {
        if (feature.properties.region !== 'KR') return;
        var geom = new ol.format.GeoJSON().readFeature(feature, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }).getGeometry();
        ol.extent.extend(extent, geom.getExtent());
      });
      return extent;
    }

    function cloneLayer(layer) {
      var options = {
        opacity: layer.getOpacity(), visible: layer.getVisible(),
        extent: layer.getExtent(), minResolution: layer.getMinResolution(),
        maxResolution: layer.getMaxResolution(), minZoom: layer.getMinZoom(),
        maxZoom: layer.getMaxZoom(), zIndex: layer.getZIndex()
      };
      if (layer instanceof ol.layer.Group) {
        options.layers = layer.getLayers().getArray().map(cloneLayer);
      } else {
        options.source = layer.getSource();
        if (typeof layer.getStyle === 'function') options.style = layer.getStyle();
        if (typeof layer.getRenderBuffer === 'function') options.renderBuffer = layer.getRenderBuffer();
      }
      return new layer.constructor(options);
    }

    function renderMap(region) {
      return new Promise(function (resolve, reject) {
        var sourceMap = api.getMap();
        if (!sourceMap) { reject(new Error('지도가 아직 준비되지 않았습니다.')); return; }
        var target = document.createElement('div');
        target.style.cssText = 'position:fixed;left:-10000px;top:0;width:920px;height:650px;pointer-events:none;';
        document.body.appendChild(target);
        var view = new ol.View({ center: ol.proj.fromLonLat(api.center), zoom: api.zoom });
        var map;
        var timeout;
        function cleanup() { clearTimeout(timeout); if (map) map.setTarget(null); target.remove(); }
        try {
          map = new ol.Map({ target: target, layers: sourceMap.getLayers().getArray().map(cloneLayer), view: view, controls: [], interactions: [], pixelRatio: 1 });
          map.updateSize();
          view.fit(region ? regionExtent(region) : nationalExtent(), { size: [920, 650], padding: [28, 28, 28, 28], duration: 0 });
          timeout = setTimeout(function () { cleanup(); reject(new Error('지도 렌더링 시간이 초과되었습니다.')); }, 20000);
          map.once('rendercomplete', function () {
            try {
              var canvas = document.createElement('canvas'); canvas.width = 920; canvas.height = 650;
              var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
              target.querySelectorAll('canvas').forEach(function (layer) {
                if (!layer.width || !layer.height) return;
                var opacity = layer.parentNode.style.opacity || layer.style.opacity;
                ctx.globalAlpha = opacity === '' ? 1 : Number(opacity);
                var match = /^matrix\(([^)]*)\)$/.exec(layer.style.transform);
                var m = match ? match[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
                ctx.setTransform.apply(ctx, m); ctx.drawImage(layer, 0, 0);
              });
              ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
              cleanup(); resolve(canvas);
            } catch (error) { cleanup(); reject(error); }
          });
          map.renderSync();
        } catch (error) { cleanup(); reject(error); }
      });
    }

    function wrapText(ctx, text, maxWidth) {
      var result = [];
      String(text || '').split(/\r?\n/).forEach(function (paragraph) {
        if (!paragraph) { result.push(''); return; }
        var line = '';
        Array.from(paragraph).forEach(function (char) {
          if (line && ctx.measureText(line + char).width > maxWidth) { result.push(line); line = char; }
          else line += char;
        });
        if (line) result.push(line);
      });
      return result;
    }

    function loadSymbols(groups, active) {
      var files = [];
      Object.keys(groups).forEach(function (key) { groups[key].variants.forEach(function (v) { if (active[v.id] && v.symbolFile && files.indexOf(v.symbolFile) < 0) files.push(v.symbolFile); }); });
      return Promise.all(files.map(function (file) { return new Promise(function (resolve) {
        var img = new Image(); img.onload = function () { resolve([file, img]); }; img.onerror = function () { resolve([file, null]); };
        img.src = './symbol/' + encodeURIComponent(file);
      }); })).then(function (entries) { return Object.fromEntries(entries); });
    }

    function compose(mapCanvas, payload, groups, active, region, includeCommentary) {
      return Promise.all([loadSymbols(groups, active), document.fonts.load('16px NanumBarunGothicYetHangul').catch(function () { return []; })]).then(function (results) {
        var images = results[0];
        var width = 1000, pad = 40, measure = document.createElement('canvas').getContext('2d');
        var legend = [];
        Object.keys(groups).forEach(function (key) {
          var group = groups[key]; var variants = group.variants.filter(function (v) { return active[v.id]; });
          if (!variants.length) return;
          legend.push({ group: group.label || key, color: group.color, variants: variants });
        });
        var font = "'NanumBarunGothicYetHangul', sans-serif";
        measure.font = '16px ' + font;
        var commentary = includeCommentary && payload.commentary ? wrapText(measure, payload.commentary, width - pad * 2 - 32) : [];
        legend.forEach(function (g) {
          g.rows = [];
          for (var i = 0; i < g.variants.length; i += 2) {
            var row = g.variants.slice(i, i + 2).map(function (v) { return { variant: v, lines: wrapText(measure, v.word, 410) }; });
            g.rows.push({ cells: row, height: Math.max(32, Math.max.apply(null, row.map(function (cell) { return cell.lines.length; })) * 21 + 8) });
          }
        });
        var legendHeight = legend.reduce(function (sum, g) { return sum + 34 + g.rows.reduce(function (n, row) { return n + row.height; }, 0); }, 0);
        var height = 90 + 650 + 55 + legendHeight + (commentary.length ? 62 + commentary.length * 25 : 0) + 55;
        var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#172033'; ctx.font = 'bold 28px ' + font; ctx.fillText(payload.headword + ' 지역어 지도', pad, 48);
        ctx.font = '16px ' + font; ctx.fillStyle = '#526174'; ctx.fillText(region ? '대상: ' + region + ' 주변' : '대상: 전체', pad, 75);
        ctx.drawImage(mapCanvas, pad, 90);
        var y = 780;
        ctx.font = 'bold 22px ' + font; ctx.fillStyle = '#172033'; ctx.fillText('범례', pad, y); y += 26;
        legend.forEach(function (g) {
          ctx.font = 'bold 17px ' + font; ctx.fillStyle = g.color || '#334155'; ctx.fillText(g.group, pad, y); y += 12;
          g.rows.forEach(function (row) {
            row.cells.forEach(function (cell, i) {
              var v = cell.variant, x = pad + i * 460;
              var img = images[v.symbolFile];
              if (img) ctx.drawImage(img, x, y, 18, 18);
              else { ctx.fillStyle = g.color || '#334155'; ctx.beginPath(); ctx.arc(x + 9, y + 9, 7, 0, Math.PI * 2); ctx.fill(); }
              ctx.font = '16px ' + font; ctx.fillStyle = '#263445';
              cell.lines.forEach(function (line, n) { ctx.fillText(line, x + 25, y + 15 + n * 21); });
            });
            y += row.height;
          });
          y += 22;
        });
        if (commentary.length) {
          y += 8; ctx.font = 'bold 22px ' + font; ctx.fillStyle = '#172033'; ctx.fillText('해설', pad, y); y += 30;
          ctx.font = '16px ' + font; ctx.fillStyle = '#334155'; commentary.forEach(function (line) { if (line) ctx.fillText(line, pad + 16, y); y += 25; });
        }
        ctx.font = '14px ' + font; ctx.fillStyle = '#64748b'; ctx.fillText('출처: 국립국어원 지역어 종합 정보', pad, height - 20);
        return canvas;
      });
    }

    function makeDocument(forPrint) {
      if (busy) return;
      var payload = api.getPayload(), groups = api.getGroups(), active = Object.assign({}, api.getActive());
      if (!payload || !Object.keys(groups).length) { alert('지도 자료를 불러온 뒤 다시 시도해 주세요.'); return; }
      var region = selected('downloadScope') === 'area' ? byId('downloadRegion').value : '';
      var printWindow = forPrint ? window.open('', '_blank') : null;
      if (forPrint && !printWindow) { alert('인쇄 창이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.'); return; }
      if (printWindow) { printWindow.document.title = '지도 인쇄 준비 중'; printWindow.document.body.textContent = '지도를 준비하고 있습니다…'; }
      busy = true;
      renderMap(region).then(function (map) { return compose(map, payload, groups, active, region, selected('downloadCommentary') === 'yes'); }).then(function (canvas) {
        var url = canvas.toDataURL('image/png');
        var filename = '지역어지도_' + safeName(payload.headword) + (region ? '_' + safeName(region) : '') + '.png';
        if (!printWindow) download(url, filename);
        else {
          printWindow.document.open();
          printWindow.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지역어 지도</title><style>body{margin:0}img{display:block;width:100%;height:auto}@media print{@page{margin:10mm}}</style></head><body><img alt="지역어 지도"></body></html>');
          printWindow.document.close();
          var image = printWindow.document.querySelector('img'); image.onload = function () { printWindow.focus(); printWindow.print(); }; image.src = url;
        }
      }).catch(function (error) { if (printWindow) printWindow.close(); alert('지도 다운로드에 실패했습니다: ' + error.message); }).finally(function () { busy = false; });
    }

    byId('dlImage').addEventListener('click', function () { makeDocument(false); });
    byId('dlPdf').addEventListener('click', function () { makeDocument(true); });
    byId('dlCsv').addEventListener('click', function () {
      var payload = api.getPayload(), groups = api.getGroups();
      if (!payload || !Object.keys(groups).length) { alert('지도 자료를 불러온 뒤 다시 시도해 주세요.'); return; }
      var rows = [['계열', '방언형', '건수']];
      Object.keys(groups).forEach(function (key) { var g = groups[key]; g.variants.forEach(function (v) { rows.push([g.label || key, v.word, String(v.n).replace(/,/g, '')]); }); });
      var csv = '\uFEFF' + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      download(url, '지역어_' + safeName(payload.headword) + '_방언형.csv');
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  };
})();
