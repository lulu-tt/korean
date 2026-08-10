/**
 * 관리자 지역어 지도 — 탭3 미리보기 + 탭2 지역 칠하기
 * 의존: ol, KoreaMap, MyMapRegions, jQuery
 * 자산 경로: /user-map/ (serve.py → dialect 프로젝트 루트)
 */
(function (global) {
  'use strict';

  var state = {
    map: null,
    fillLayer: null,
    symbolLayer: null,
    hitLayer: null,
    hitSource: null,
    dialects: [],
    paintingHdId: null,
    hideArea: false,
    hideSymbol: false,
    ready: false
  };

  function pad3(n) {
    var s = String(n || '1');
    while (s.length < 3) s = '0' + s;
    return s.slice(-3);
  }

  function faceToHex(fc) {
    if (!fc) return '#64748b';
    var s = String(fc).trim();
    if (s.charAt(0) === '#') return s;
    // "R, G, B" or "R,G,B" or single number palette index fallback
    if (/^\d+\s*,\s*\d+\s*,\s*\d+/.test(s)) {
      var p = s.split(',').map(function (x) { return parseInt(x.trim(), 10); });
      if (p.length >= 3 && !isNaN(p[0])) {
        return '#' + [p[0], p[1], p[2]].map(function (v) {
          var h = Math.max(0, Math.min(255, v)).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
      }
    }
    // 숫자만 있으면 단순 팔레트
    if (/^\d+$/.test(s)) {
      var palette = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#64748b','#0f172a'];
      return palette[parseInt(s, 10) % palette.length];
    }
    return s;
  }

  function symbolUrl(mapSymbolId) {
    var n = parseInt(mapSymbolId, 10);
    if (!n || n < 1) n = 1;
    return '/user-map/symbol_mask/' + pad3(n) + '.png';
  }

  function markerStyle(color, mapSymbolId) {
    if (!window.ol) return null;
    return new ol.style.Style({
      image: new ol.style.Icon({
        src: symbolUrl(mapSymbolId),
        color: color || '#3b82f6',
        scale: 0.9,
        anchor: [0.5, 0.5]
      })
    });
  }

  // 지역 → muni_/prov_ id 해석 (통합 에디터 admin-map-backend 와 동일 로직).
  //   시·군명(mapKey)으로 검색하고 sido 로 동명 시·군 중복 해소, 괄호/접두어 정리.
  function resolveRegionId(reg) {
    if (!window.MyMapRegions) return null;
    var rid = String(reg.regionId || '');
    if (rid.indexOf('muni_') === 0 || rid.indexOf('prov_') === 0) return rid;
    var key = String(reg.mapKey || '').trim();
    if (!key) {
      var parts = String(reg.regionNm || '').trim().split(/\s+/);
      key = parts[parts.length - 1] || '';       // 전체명이면 마지막 토큰(시·군)
    }
    if (key.indexOf('_') >= 0) key = key.split('_').pop();      // "강원_고성군" → "고성군"
    if (key.indexOf('(') >= 0) key = key.split('(')[0].trim();  // "진주시(진양군)" → "진주시"
    if (!key || !MyMapRegions.search) return null;
    var hits = MyMapRegions.search(key, 8) || [];
    if (!hits.length) return null;
    var sido = String(reg.sido || '').trim();
    if (sido) {
      for (var i = 0; i < hits.length; i++) {
        if ((hits[i].label || '').indexOf(sido) >= 0 && hits[i].name === key) return hits[i].id;
      }
      for (var k = 0; k < hits.length; k++) {
        if ((hits[k].label || '').indexOf(sido) >= 0) return hits[k].id;
      }
    }
    for (var j = 0; j < hits.length; j++) {
      if (hits[j].name === key) return hits[j].id;
    }
    return hits[0].id;
  }

  function clearOverlayLayers() {
    if (!state.map) return;
    if (state.fillLayer) { state.map.removeLayer(state.fillLayer); state.fillLayer = null; }
    if (state.symbolLayer) { state.map.removeLayer(state.symbolLayer); state.symbolLayer = null; }
  }

  function rebuildFill() {
    if (!state.map || !window.KoreaMap || !window.MyMapRegions) return;
    clearOverlayLayers();

    var fc = { type: 'FeatureCollection', features: [] };
    var symbolFeatures = [];

    (state.dialects || []).forEach(function (d) {
      var color = faceToHex(d.faceColor);
      var regs = d.regions || [];
      regs.forEach(function (r) {
        var rid = resolveRegionId(r);
        if (!rid) return;
        var geom = MyMapRegions.getGeometry(rid);
        if (!geom) return;
        fc.features.push({
          type: 'Feature',
          properties: {
            id: rid,
            color: color,
            name: r.regionNm || rid,
            word: d.word,
            hdId: d.hdId
          },
          geometry: geom
        });
        if (d.mapSymbolId) {
          var ll = MyMapRegions.getCentroidLonLat(rid);
          if (ll && window.ol) {
            symbolFeatures.push(new ol.Feature({
              geometry: new ol.geom.Point(ol.proj.fromLonLat(ll)),
              word: d.word,
              color: color,
              mapSymbolId: d.mapSymbolId
            }));
          }
        }
      });
    });

    state.fillLayer = KoreaMap.createFillLayer(fc, {
      zIndex: 2,
      fillAlpha: 0.38,
      colorProp: 'color'
    });
    if (state.fillLayer) {
      state.fillLayer.setVisible(!state.hideArea);
      state.map.addLayer(state.fillLayer);
    }

    if (symbolFeatures.length && window.ol) {
      state.symbolLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: symbolFeatures }),
        style: function (f) {
          return markerStyle(f.get('color'), f.get('mapSymbolId'));
        },
        zIndex: 5
      });
      state.symbolLayer.setVisible(!state.hideSymbol);
      state.map.addLayer(state.symbolLayer);
    }

    var meta = document.getElementById('adm-map-meta');
    if (meta) {
      meta.textContent = '지역어 ' + (state.dialects || []).length + '개 · 매핑 면 ' + fc.features.length + '곳';
    }
  }

  function ensureMap() {
    if (state.ready && state.map) {
      setTimeout(function () { state.map.updateSize(); rebuildFill(); }, 50);
      return;
    }
    var target = document.getElementById('adm-map');
    if (!target) return;
    if (!window.ol || !window.KoreaMap) {
      target.innerHTML = '<div style="padding:24px;color:#b91c1c;font-size:13px">지도 라이브러리를 불러오지 못했습니다. /user-map 자산 경로를 확인하세요.</div>';
      return;
    }
    try {
      if (window.MyMapRegions && MyMapRegions.rebuild) MyMapRegions.rebuild();
    } catch (e) { /* */ }

    state.map = KoreaMap.create(target, {
      controls: [],
      center: [127.8, 36.5],
      zoom: 7
    });
    // 클릭 칠하기
    state.map.on('singleclick', function (evt) {
      if (!state.paintingHdId || !window.MyMapRegions) return;
      var lonlat = ol.proj.toLonLat(evt.coordinate);
      var ref = MyMapRegions.pickRegionAtLonLat(lonlat[0], lonlat[1]);
      if (!ref) {
        if (window.jQuery && window.Message) Message.alert({ icon: 'info', message: '시·군·구 경계를 클릭해 주세요.' });
        return;
      }
      if (typeof global.AdminDialectMap.onRegionPick === 'function') {
        global.AdminDialectMap.onRegionPick(state.paintingHdId, {
          regionId: ref.id,
          regionNm: ref.label || ref.name
        });
      }
    });
    state.ready = true;
    setTimeout(function () { state.map.updateSize(); rebuildFill(); }, 80);
  }

  function setDialects(list) {
    state.dialects = list || [];
    if (state.ready) rebuildFill();
  }

  function setPainting(hdId) {
    state.paintingHdId = hdId || null;
    var bar = document.getElementById('adm-paint-bar');
    if (bar) {
      if (state.paintingHdId) {
        bar.hidden = false;
        var lab = document.getElementById('adm-paint-label');
        if (lab) lab.textContent = '칠하기 모드 · hdId=' + state.paintingHdId + ' · 지도를 클릭해 지역 추가/표시';
      } else {
        bar.hidden = true;
      }
    }
  }

  function setLayerVisibility(opts) {
    opts = opts || {};
    if (typeof opts.hideArea === 'boolean') state.hideArea = opts.hideArea;
    if (typeof opts.hideSymbol === 'boolean') state.hideSymbol = opts.hideSymbol;
    if (state.fillLayer) state.fillLayer.setVisible(!state.hideArea);
    if (state.symbolLayer) state.symbolLayer.setVisible(!state.hideSymbol);
  }

  global.AdminDialectMap = {
    ensureMap: ensureMap,
    setDialects: setDialects,
    rebuildFill: rebuildFill,
    setPainting: setPainting,
    setLayerVisibility: setLayerVisibility,
    onRegionPick: null,
    getState: function () { return state; }
  };
})(window);
