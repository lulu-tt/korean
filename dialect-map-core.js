/**
 * dialect-map-core.js
 * 방언 지도 공통 모듈 (OpenLayers + KoreaMap)
 *
 * 사용 예:
 *   var mapApi = DialectMap.create({
 *     target: 'olmap',
 *     dataBase: './data/processed/map/',
 *     pointBase: './data/processed/map_points/',  // API 없을 때 쓰는 제보자 사본
 *     formListId: 'dfList',          // 없으면 범례 목록 미렌더
 *     legendSelector: '#maplegend .maplegend__list',
 *     statusId: 'mapDataStatus',
 *     stackMarkers: true,            // 동일 좌표 가로 스택
 *     uniqueColors: true,            // 계열 색 중복 방지
 *     areaFill: true,
 *     regionLayers: true,
 *     overlays: true,
 *     popup: true,
 *     onLoad: function (payload, groups) {},
 *     onError: function (err) {}
 *   });
 *   mapApi.loadHeadword('50287', '곁두리');
 *   mapApi.setVariantActive('g1-0', false); // 기호만 off, 면색 유지
 *
 * 의존: ol, KoreaMap (korea-map.js), 선택 skorea-provinces.js / municipalities 지연로드
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    target: 'olmap',
    dataBase: './data/processed/map/',
    // API(/api/map_point)가 없는 정적 배포에서 팝업 제보자 목록을 채우는 사본
    pointBase: './data/processed/map_points/',
    center: [127.8, 38.1],
    zoom: 6.4,
    stackStepLng: 0.065,
    uniqueColors: true,
    colorMinDist: 100,
    areaFill: true,
    areaFillAlpha: 0.24, // 파스텔 톤 — 핀/기호 색이 잘 보이도록 옅게
    areaStrokeAlpha: 0.42,
    areaLabels: false,   // true면 면색 위에 방언형 글자 표시
    areaLabelSize: 13,
    stackMarkers: true,
    markers: true,
    regionLayers: true,
    overlays: true,
    popup: true,
    legendSelector: '#maplegend .maplegend__list',
    formListId: 'dfList',
    statusId: 'mapDataStatus',
    infoWordId: 'infoWord',
    infoMetaId: 'infoMeta',
    popupId: 'popup',
    popupContentId: 'popup-content',
    bindFormList: true,
    bindLayerToggles: true,
    hideAreaId: 'hideArea',
    hideSymbolId: 'hideSymbol',
    lblSidoId: 'lblSido',
    lblSigunguId: 'lblSigungu',
    overlayToggles: [
      ['ovRivers', 'rivers'],
      ['ovRail', 'rail'],
      ['ovRoads', 'roads'],
      ['ovMountains', 'mountains']
    ],
    onLoad: null,
    onError: null,
    onStatus: null
  };

  /** 벡터 기호 20종 (PNG 미사용) */
  var VAR_SHAPES = [
    'circle', 'square', 'diamond', 'triangle', 'triangle-down',
    'pentagon', 'hexagon', 'heptagon', 'octagon',
    'star4', 'star5', 'star6', 'star7', 'star8',
    'cross', 'x', 'plus',
    'rect', 'rhombus-wide', 'ring'
  ];

  var GROUP_COLOR_PALETTE = [
    '#EF4444', '#22C55E', '#3B82F6', '#F59E0B', '#A855F7', '#06B6D4',
    '#F97316', '#64748B', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308',
    '#0EA5E9', '#84CC16', '#F43F5E', '#6366F1', '#10B981', '#D946EF',
    '#78716C', '#0891B2'
  ];

  var METRO_SIDO = {
    '서울특별시': 1, '부산광역시': 1, '대구광역시': 1, '인천광역시': 1,
    '광주광역시': 1, '대전광역시': 1, '울산광역시': 1, '세종특별자치시': 1
  };

  function merge(a, b) {
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    if (b) for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
    return o;
  }

  function $(id) {
    if (!id) return null;
    if (typeof id !== 'string') return id;
    return document.getElementById(id);
  }

  function hslToHex(h, s, l) {
    s = s == null ? 0.62 : s;
    l = l == null ? 0.48 : l;
    h = ((h % 360) + 360) % 360 / 360;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    var g = Math.round(hue2rgb(p, q, h) * 255);
    var b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return '#' + [r, g, b].map(function (x) {
      var t = x.toString(16).toUpperCase();
      return t.length === 1 ? '0' + t : t;
    }).join('');
  }

  function colorDist(a, b) {
    function rgb(c) {
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    var A = rgb(a), B = rgb(b);
    var dr = A[0] - B[0], dg = A[1] - B[1], db = A[2] - B[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function ensureUniqueGroupColors(groupMap, minDist) {
    minDist = minDist == null ? 100 : minDist;
    var keys = Object.keys(groupMap);
    var used = [];
    var need = [];
    function isOk(c) {
      for (var i = 0; i < used.length; i++) {
        if (c === used[i] || colorDist(c, used[i]) < minDist) return false;
      }
      return true;
    }
    function pickNew(seed) {
      var i, cand;
      for (i = 0; i < GROUP_COLOR_PALETTE.length; i++) {
        cand = GROUP_COLOR_PALETTE[i].toUpperCase();
        if (isOk(cand)) return cand;
      }
      for (i = 0; i < 720; i++) {
        cand = hslToHex((seed + i) * 137.508);
        if (isOk(cand)) return cand;
      }
      return '#64748B';
    }
    keys.forEach(function (k) {
      var c = (groupMap[k].color || '').toString().trim().toUpperCase();
      if (c && c.charAt(0) !== '#') c = '#' + c;
      if (/^#[0-9A-F]{6}$/.test(c) && isOk(c)) {
        groupMap[k].color = c;
        used.push(c);
      } else {
        need.push(k);
      }
    });
    need.forEach(function (k, idx) {
      var c = pickNew(idx * 17);
      groupMap[k].color = c;
      used.push(c);
    });
  }

  function markerStyle(color, shape, big) {
    if (!global.ol) return null;
    var stroke = new ol.style.Stroke({ color: '#ffffff', width: big ? 2 : 1.5 });
    var fill = new ol.style.Fill({ color: color });
    var r = big ? 9 : 6;
    var img;
    shape = shape || 'circle';

    if (shape === 'circle') {
      img = new ol.style.Circle({ radius: r, fill: fill, stroke: stroke });
    } else if (shape === 'ring') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: r,
          fill: new ol.style.Fill({ color: 'rgba(255,255,255,0.15)' }),
          stroke: new ol.style.Stroke({ color: color, width: big ? 3 : 2.5 })
        })
      });
    } else if (shape === 'triangle') {
      img = new ol.style.RegularShape({ points: 3, radius: r + 1, fill: fill, stroke: stroke });
    } else if (shape === 'triangle-down') {
      img = new ol.style.RegularShape({ points: 3, radius: r + 1, rotation: Math.PI, fill: fill, stroke: stroke });
    } else if (shape === 'square') {
      img = new ol.style.RegularShape({ points: 4, radius: r, angle: Math.PI / 4, fill: fill, stroke: stroke });
    } else if (shape === 'diamond' || shape === 'rhombus-wide') {
      var ang = shape === 'rhombus-wide' ? Math.PI / 6 : 0;
      img = new ol.style.RegularShape({ points: 4, radius: r + (shape === 'rhombus-wide' ? 1 : 0), angle: ang, fill: fill, stroke: stroke });
    } else if (shape === 'rect') {
      img = new ol.style.RegularShape({ points: 4, radius: r, radius2: r * 0.55, angle: Math.PI / 4, fill: fill, stroke: stroke });
    } else if (shape === 'pentagon') {
      img = new ol.style.RegularShape({ points: 5, radius: r + 1, fill: fill, stroke: stroke });
    } else if (shape === 'hexagon') {
      img = new ol.style.RegularShape({ points: 6, radius: r + 1, fill: fill, stroke: stroke });
    } else if (shape === 'heptagon') {
      img = new ol.style.RegularShape({ points: 7, radius: r + 1, fill: fill, stroke: stroke });
    } else if (shape === 'octagon') {
      img = new ol.style.RegularShape({ points: 8, radius: r + 1, fill: fill, stroke: stroke });
    } else if (shape === 'star4') {
      img = new ol.style.RegularShape({ points: 4, radius: r + 2, radius2: (r + 2) / 2.4, fill: fill, stroke: stroke });
    } else if (shape === 'star5' || shape === 'star') {
      img = new ol.style.RegularShape({ points: 5, radius: r + 2, radius2: (r + 2) / 2.5, fill: fill, stroke: stroke });
    } else if (shape === 'star6') {
      img = new ol.style.RegularShape({ points: 6, radius: r + 2, radius2: (r + 2) / 2.5, fill: fill, stroke: stroke });
    } else if (shape === 'star7') {
      img = new ol.style.RegularShape({ points: 7, radius: r + 2, radius2: (r + 2) / 2.5, fill: fill, stroke: stroke });
    } else if (shape === 'star8') {
      img = new ol.style.RegularShape({ points: 8, radius: r + 2, radius2: (r + 2) / 2.5, fill: fill, stroke: stroke });
    } else if (shape === 'cross' || shape === 'plus') {
      img = new ol.style.RegularShape({ points: 4, radius: r + 1, radius2: r * 0.28, angle: 0, fill: fill, stroke: stroke });
    } else if (shape === 'x') {
      img = new ol.style.RegularShape({ points: 4, radius: r + 1, radius2: r * 0.28, angle: Math.PI / 4, fill: fill, stroke: stroke });
    } else {
      img = new ol.style.Circle({ radius: r, fill: fill, stroke: stroke });
    }
    return new ol.style.Style({ image: img });
  }

  function variantMarkSVG(color, shape) {
    var inner;
    shape = shape || 'circle';
    if (shape === 'square') {
      inner = '<rect x="1.5" y="1.5" width="11" height="11" rx="1.5"/>';
    } else if (shape === 'rect') {
      inner = '<rect x="0.5" y="3.5" width="13" height="7" rx="1"/>';
    } else if (shape === 'diamond' || shape === 'rhombus-wide') {
      inner = shape === 'rhombus-wide'
        ? '<polygon points="7,2 13,7 7,12 1,7"/>'
        : '<polygon points="7,1 13,7 7,13 1,7"/>';
    } else if (shape === 'triangle') {
      inner = '<polygon points="7,1 12.2,10.5 1.8,10.5"/>';
    } else if (shape === 'triangle-down') {
      inner = '<polygon points="7,13 12.2,3.5 1.8,3.5"/>';
    } else if (shape === 'pentagon') {
      inner = '<polygon points="7,1 12.71,5.15 10.53,11.85 3.47,11.85 1.29,5.15"/>';
    } else if (shape === 'hexagon') {
      inner = '<polygon points="7,1 12.2,4 12.2,10 7,13 1.8,10 1.8,4"/>';
    } else if (shape === 'heptagon') {
      inner = '<polygon points="7,1 11.5,2.8 13,7 11.5,11.2 7,13 2.5,11.2 1,7 2.5,2.8"/>';
    } else if (shape === 'octagon') {
      inner = '<polygon points="4.5,1 9.5,1 13,4.5 13,9.5 9.5,13 4.5,13 1,9.5 1,4.5"/>';
    } else if (shape === 'star4') {
      inner = '<polygon points="7,1 8.2,5.2 12.5,5.5 9.2,8.2 10.2,12.5 7,10 3.8,12.5 4.8,8.2 1.5,5.5 5.8,5.2"/>';
    } else if (shape === 'star5' || shape === 'star') {
      inner = '<polygon points="7,1 8.41,5.06 12.71,5.15 9.28,7.74 10.53,11.85 7,9.4 3.47,11.85 4.72,7.74 1.29,5.15 5.59,5.06"/>';
    } else if (shape === 'star6') {
      inner = '<polygon points="7,1 8.5,4.5 12.5,4.5 9.5,7 11,11 7,8.8 3,11 4.5,7 1.5,4.5 5.5,4.5"/>';
    } else if (shape === 'star7' || shape === 'star8') {
      inner = '<polygon points="7,1 8.3,4.2 11.8,3.8 9.5,6.2 11.5,9.5 8.1,8.5 7,12 5.9,8.5 2.5,9.5 4.5,6.2 2.2,3.8 5.7,4.2"/>';
    } else if (shape === 'cross' || shape === 'plus') {
      inner = '<path d="M5.5 1.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z"/>';
    } else if (shape === 'x') {
      inner = '<path d="M3.2 2.1l1.8-1.1 2 3.1 2-3.1 1.8 1.1-2.1 3.2 2.1 3.2-1.8 1.1-2-3.1-2 3.1-1.8-1.1 2.1-3.2z"/>';
    } else if (shape === 'ring') {
      return '<svg class="dfvarrow__mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">' +
        '<circle cx="7" cy="7" r="5.2" fill="none" stroke="' + color + '" stroke-width="2.2"/>' +
        '</svg>';
    } else {
      inner = '<circle cx="7" cy="7" r="6"/>';
    }
    return '<svg class="dfvarrow__mark" width="14" height="14" viewBox="0 0 14 14" fill="' + color + '" aria-hidden="true">' + inner + '</svg>';
  }

  // ─── instance ─────────────────────────────────────────────
  function create(userOpts) {
    var opts = merge(DEFAULTS, userOpts || {});
    var olMap = null;
    var regionLayers = null;
    var overlays = null;
    var markerLayer = null;
    var areaLayer = null;
    var popupOverlay = null;
    var mapDataCache = {};
    var GROUPS = {};
    var REGIONS = [];   // payload.regions 전체(조사+미조사) — 면색(choropleth) 소스
    var MISFILL = {};   // payload.misurveyFill — 미조사 추정 채움(공식 색), 면색 전용
    var FACEFILL = {};  // payload.faceFill — 공식 last-wins 색 override(제주 동/읍·광역시 등 집계 폴리곤)
    var currentHeadwordNo = '';
    var variantStyles = {};
    var variantStylesBig = {};
    var variantColors = {};
    var activeVariants = {};
    var hoverFeature = null;
    var placeByCoord = {};
    var destroyed = false;

    function setMapStatus(msg, isErr) {
      if (typeof opts.onStatus === 'function') opts.onStatus(msg, isErr);
      var el = $(opts.statusId);
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = isErr ? '#b91c1c' : '#64748b';
    }

    function getTargetEl() {
      if (typeof opts.target === 'string') return document.getElementById(opts.target);
      return opts.target;
    }

    function initMap() {
      var target = getTargetEl();
      if (!target) throw new Error('DialectMap: target not found');
      if (!global.ol || !ol.Map) throw new Error('DialectMap: OpenLayers (ol) required');

      var provinceLayer = (global.KoreaMap && KoreaMap.createBaseLayer)
        ? KoreaMap.createBaseLayer({ zIndex: 0 })
        : null;

      olMap = new ol.Map({
        target: target,
        layers: provinceLayer ? [provinceLayer] : [],
        view: new ol.View({
          center: ol.proj.fromLonLat(opts.center),
          zoom: opts.zoom
        }),
        controls: []
      });
      requestAnimationFrame(function () { if (olMap) olMap.updateSize(); });

      if (opts.regionLayers && global.KoreaMap && KoreaMap.attachRegionLayers) {
        regionLayers = KoreaMap.attachRegionLayers(olMap, { sidoVisible: false, sigunguVisible: false });
      }
      if (opts.overlays && global.KoreaMap && KoreaMap.attachOverlays) {
        overlays = KoreaMap.attachOverlays(olMap);
      }

      if (opts.popup) {
        var popupElement = $(opts.popupId);
        if (popupElement) {
          popupOverlay = new ol.Overlay({
            element: popupElement,
            autoPan: true,
            autoPanAnimation: { duration: 250 }
          });
          olMap.addOverlay(popupOverlay);
        }
      }

      if (opts.markers) {
        olMap.on('click', function (evt) {
          if (!markerLayer) return;
          var feature = olMap.forEachFeatureAtPixel(olMap.getEventPixel(evt.originalEvent), function (f) { return f; }, {
            layerFilter: function (layer) { return layer === markerLayer; }
          });
          if (!feature) return;
          showGenericPopup(feature.get('vid'), feature.getGeometry().getCoordinates(), feature);
        });
        olMap.on('pointermove', function (evt) {
          if (evt.dragging || !markerLayer) return;
          var feature = olMap.forEachFeatureAtPixel(olMap.getEventPixel(evt.originalEvent), function (f) { return f; }, {
            layerFilter: function (layer) { return layer === markerLayer; }
          }) || null;
          if (feature !== hoverFeature) {
            hoverFeature = feature;
            markerLayer.changed();
          }
          document.body.style.cursor = feature ? 'pointer' : '';
        });
      }

      if (opts.bindLayerToggles) bindLayerToggles();
    }

    function bindLayerToggles() {
      var el;
      el = $(opts.lblSidoId);
      if (el) el.addEventListener('change', function () {
        if (regionLayers) regionLayers.showSido(this.checked);
      });
      el = $(opts.lblSigunguId);
      if (el) el.addEventListener('change', function () {
        if (regionLayers) regionLayers.showSigungu(this.checked);
      });
      (opts.overlayToggles || []).forEach(function (pair) {
        var e = $(pair[0]);
        if (e) e.addEventListener('change', function () {
          if (overlays) overlays.show(pair[1], this.checked);
        });
      });
      el = $(opts.hideAreaId);
      if (el) el.addEventListener('change', function () {
        if (areaLayer) areaLayer.setVisible(!this.checked);
      });
      el = $(opts.hideSymbolId);
      if (el) el.addEventListener('change', function () {
        if (markerLayer) markerLayer.setVisible(!this.checked);
      });
    }

    function applyMarkerStackOffsets() {
      if (!opts.stackMarkers || !markerLayer || !global.ol) return;
      var src = markerLayer.getSource();
      if (!src) return;
      var feats = src.getFeatures();
      var buckets = Object.create(null);
      var step = opts.stackStepLng || 0.065;

      feats.forEach(function (f) {
        var id = f.get('vid');
        if (!activeVariants[id]) {
          f.set('stackIndex', 0);
          f.set('stackCount', 1);
          return;
        }
        var key = Number(f.get('lng')).toFixed(5) + ',' + Number(f.get('lat')).toFixed(5);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(f);
      });

      Object.keys(buckets).forEach(function (key) {
        var arr = buckets[key];
        arr.sort(function (a, b) {
          return String(a.get('vid')).localeCompare(String(b.get('vid')));
        });
        var n = arr.length;
        arr.forEach(function (f, i) {
          f.set('stackIndex', i);
          f.set('stackCount', n);
          var baseLng = Number(f.get('lng'));
          var baseLat = Number(f.get('lat'));
          var dx = n <= 1 ? 0 : step * (i - (n - 1) / 2);
          f.setGeometry(new ol.geom.Point(ol.proj.fromLonLat([baseLng + dx, baseLat])));
        });
      });

      feats.forEach(function (f) {
        if (activeVariants[f.get('vid')]) return;
        f.setGeometry(new ol.geom.Point(ol.proj.fromLonLat([Number(f.get('lng')), Number(f.get('lat'))])));
      });
    }

    function rebuildMarkerFeatures() {
      if (!olMap || !global.ol || !opts.markers) return;
      var features = [];
      Object.keys(GROUPS).forEach(function (gkey) {
        GROUPS[gkey].variants.forEach(function (v) {
          (v.points || []).forEach(function (pt, pi) {
            var f = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(pt)) });
            f.set('vid', v.id);
            f.set('word', v.word);
            f.set('lng', pt[0]);
            f.set('lat', pt[1]);
            // places[i] 가 points[i] 와 대응되면 지점 메타를 피처에 심음
            var place = (v.places && v.places[pi]) || null;
            if (!place && v.places && v.places.length) {
              var lk = Number(pt[0]).toFixed(5) + ',' + Number(pt[1]).toFixed(5);
              place = placeByCoord[lk] || null;
            }
            if (place) f.set('place', place);
            f.set('stackIndex', 0);
            f.set('stackCount', 1);
            features.push(f);
          });
        });
      });
      if (!markerLayer) {
        markerLayer = new ol.layer.Vector({
          source: new ol.source.Vector({ features: features }),
          style: function (feature) {
            var id = feature.get('vid');
            if (!activeVariants[id]) return null;
            return feature === hoverFeature ? variantStylesBig[id] : variantStyles[id];
          }
        });
        markerLayer.setZIndex(3);
        olMap.addLayer(markerLayer);
      } else {
        markerLayer.getSource().clear();
        markerLayer.getSource().addFeatures(features);
      }
      applyMarkerStackOffsets();
      markerLayer.changed();
    }

    function refreshMarkers() {
      applyMarkerStackOffsets();
      if (markerLayer) markerLayer.changed();
    }

    // ── area fill helpers (PIP / name / metro / city-gu) ──
    function pointInRing(x, y, ring) {
      var inside = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0], yi = ring[i][1];
        var xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
      }
      return inside;
    }
    function pointInGeom(lon, lat, geom) {
      if (!geom) return false;
      if (geom.type === 'Polygon') {
        if (!pointInRing(lon, lat, geom.coordinates[0])) return false;
        for (var h = 1; h < geom.coordinates.length; h++) {
          if (pointInRing(lon, lat, geom.coordinates[h])) return false;
        }
        return true;
      }
      if (geom.type === 'MultiPolygon') {
        for (var p = 0; p < geom.coordinates.length; p++) {
          if (pointInGeom(lon, lat, { type: 'Polygon', coordinates: geom.coordinates[p] })) return true;
        }
      }
      return false;
    }
    function muniFeatureName(f, i) {
      var props = (f && f.properties) || {};
      return props.name || props.NAME || props.SIG_KOR_NM || ('m' + i);
    }
    function normalizeAdminName(s) {
      if (!s) return '';
      var raw = String(s).trim();
      var parts = raw.split(/\s+/).filter(Boolean);
      var t = parts.length ? parts[parts.length - 1] : raw;
      t = t.replace(/\s+/g, '');
      t = t.replace(/^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도|강원특별자치도|전북특별자치도)/, '');
      t = t.replace(/^(경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주도|충북|충남|전북|전남|경북|경남)/, '');
      return t;
    }
    function minDist2ToGeom(lon, lat, geom) {
      var best = Infinity;
      function walk(c) {
        if (!c) return;
        if (typeof c[0] === 'number') {
          var dx = c[0] - lon, dy = c[1] - lat;
          var d = dx * dx + dy * dy;
          if (d < best) best = d;
          return;
        }
        for (var i = 0; i < c.length; i++) walk(c[i]);
      }
      if (geom && geom.coordinates) walk(geom.coordinates);
      return best;
    }
    function getMuniNameIndex(muniFc) {
      if (muniFc.__nameIndex) return muniFc.__nameIndex;
      var idx = Object.create(null);
      var feats = (muniFc && muniFc.features) || [];
      for (var i = 0; i < feats.length; i++) {
        var nm = normalizeAdminName(muniFeatureName(feats[i], i));
        if (!nm) continue;
        if (!idx[nm]) idx[nm] = [];
        idx[nm].push(i);
      }
      muniFc.__nameIndex = idx;
      return idx;
    }
    function getCityGuIndex(muniFc) {
      if (muniFc.__cityGuIndex) return muniFc.__cityGuIndex;
      var idx = Object.create(null);
      var feats = (muniFc && muniFc.features) || [];
      for (var i = 0; i < feats.length; i++) {
        var nm = muniFeatureName(feats[i], i);
        var m = String(nm).match(/^(.+시)(.+구)$/);
        if (!m) continue;
        var city = m[1];
        if (!idx[city]) idx[city] = [];
        idx[city].push(i);
      }
      Object.keys(idx).forEach(function (city) {
        if (idx[city].length < 2) delete idx[city];
      });
      muniFc.__cityGuIndex = idx;
      return idx;
    }
    function resolveCityGuKey(muniName, place, cityGuIndex) {
      if (!cityGuIndex) return null;
      var nm = String(muniName || '');
      var m = nm.match(/^(.+시)(.+구)$/);
      if (m && cityGuIndex[m[1]]) return m[1];
      if (place) {
        var tries = [place.sigungu, place.sigungu_nm, place.region_nm, place.regionNm];
        for (var t = 0; t < tries.length; t++) {
          var s = normalizeAdminName(tries[t]);
          if (!s) continue;
          s = s.replace(/\(.*\)$/, '');
          if (cityGuIndex[s]) return s;
          var cm = s.match(/^(.+시)/);
          if (cm && cityGuIndex[cm[1]]) return cm[1];
        }
      }
      return null;
    }
    function getMetroProvinceIndex(provFc) {
      if (!provFc) return null;
      if (provFc.__metroIndex) return provFc.__metroIndex;
      var idx = Object.create(null);
      var feats = (provFc && provFc.features) || [];
      for (var i = 0; i < feats.length; i++) {
        var props = feats[i].properties || {};
        var nm = props.name;
        if (!nm || !METRO_SIDO[nm]) continue;
        if (idx[nm] != null) {
          if (props.region === 'KR' && (feats[idx[nm]].properties || {}).region !== 'KR') idx[nm] = i;
          continue;
        }
        idx[nm] = i;
      }
      provFc.__metroIndex = idx;
      return idx;
    }
    function resolveMetroKey(place, lon, lat, provFc) {
      var metroIdx = getMetroProvinceIndex(provFc);
      if (!metroIdx) return null;
      function fromText(s) {
        if (!s) return null;
        var t = String(s).trim();
        if (METRO_SIDO[t]) return t;
        var m = t.match(/^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시)/);
        return m ? m[1] : null;
      }
      if (place) {
        var bySido = fromText(place.sido);
        if (bySido) return bySido;
        var byRn = fromText(place.region_nm) || fromText(place.regionNm);
        if (byRn) return byRn;
      }
      var feats = (provFc && provFc.features) || [];
      var names = Object.keys(metroIdx);
      for (var i = 0; i < names.length; i++) {
        var fi = metroIdx[names[i]];
        var f = feats[fi];
        if (f && pointInGeom(lon, lat, f.geometry)) return names[i];
      }
      return null;
    }
    function placeNameCandidates(place) {
      var tryNames = [];
      if (!place) return tryNames;
      if (place.sigungu) tryNames.push(normalizeAdminName(place.sigungu));
      if (place.sigungu_nm) tryNames.push(normalizeAdminName(place.sigungu_nm));
      if (place.region_nm) {
        tryNames.push(normalizeAdminName(place.region_nm));
        var compact = String(place.region_nm).replace(/\s+/g, '');
        compact = compact.replace(/^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도|강원특별자치도|전북특별자치도)/, '');
        compact = compact.replace(/^(경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주도|충북|충남|전북|전남|경북|경남)/, '');
        if (compact) tryNames.push(compact);
      }
      if (place.regionNm) tryNames.push(normalizeAdminName(place.regionNm));
      return tryNames;
    }
    function hitMatchesPlace(hitName, place, cityGuIndex) {
      if (!place || !hitName) return true;
      var tries = placeNameCandidates(place);
      if (!tries.length) return true;
      for (var i = 0; i < tries.length; i++) {
        var key = (tries[i] || '').replace(/\(.*\)$/, '');
        if (!key) continue;
        if (hitName === key) return true;
        if (cityGuIndex && cityGuIndex[key] && hitName.indexOf(key) === 0) return true;
        if (key.length >= 2 && hitName.indexOf(key) !== -1) return true;
      }
      return false;
    }
    function findMunicipality(lon, lat, muniFc, place) {
      var feats = (muniFc && muniFc.features) || [];
      var i, f;
      var cityGuIndex = getCityGuIndex(muniFc);
      var nameIndex = getMuniNameIndex(muniFc);

      function pickNearest(indexList, method) {
        if (!indexList || !indexList.length) return null;
        var uniq = [], uSeen = Object.create(null);
        for (var u = 0; u < indexList.length; u++) {
          if (uSeen[indexList[u]]) continue;
          uSeen[indexList[u]] = true;
          uniq.push(indexList[u]);
        }
        if (uniq.length === 1) {
          i = uniq[0]; f = feats[i];
          return { name: muniFeatureName(f, i), feature: f, index: i, method: method };
        }
        var bestI = uniq[0], bestD = Infinity;
        for (var t = 0; t < uniq.length; t++) {
          i = uniq[t];
          var d = minDist2ToGeom(lon, lat, feats[i].geometry);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        f = feats[bestI];
        return { name: muniFeatureName(f, bestI), feature: f, index: bestI, method: method };
      }
      function resolveByPlaceName(method) {
        var candidates = [];
        var tryNames = placeNameCandidates(place);
        var seen = Object.create(null);
        for (var n = 0; n < tryNames.length; n++) {
          var key = tryNames[n];
          if (!key || seen[key]) continue;
          seen[key] = true;
          key = key.replace(/\(.*\)$/, '');
          var list = nameIndex[key];
          if (list && list.length) {
            for (var k = 0; k < list.length; k++) candidates.push(list[k]);
          }
          if (cityGuIndex[key]) {
            for (var c = 0; c < cityGuIndex[key].length; c++) candidates.push(cityGuIndex[key][c]);
          }
        }
        return pickNearest(candidates, method || 'name');
      }

      var byNameFirst = resolveByPlaceName('name');
      if (byNameFirst) {
        var pipHit = null;
        for (i = 0; i < feats.length; i++) {
          f = feats[i];
          if (pointInGeom(lon, lat, f.geometry)) {
            pipHit = { name: muniFeatureName(f, i), feature: f, index: i, method: 'pip' };
            break;
          }
        }
        if (!pipHit) return byNameFirst;
        if (hitMatchesPlace(pipHit.name, place, cityGuIndex)) return pipHit;
        return byNameFirst;
      }
      for (i = 0; i < feats.length; i++) {
        f = feats[i];
        if (pointInGeom(lon, lat, f.geometry)) {
          return { name: muniFeatureName(f, i), feature: f, index: i, method: 'pip' };
        }
      }
      var maxDist2 = 0.2 * 0.2;
      var nearI = -1, nearD = Infinity;
      for (i = 0; i < feats.length; i++) {
        var d2 = minDist2ToGeom(lon, lat, feats[i].geometry);
        if (d2 < nearD) { nearD = d2; nearI = i; }
      }
      if (nearI >= 0 && nearD <= maxDist2) {
        f = feats[nearI];
        return { name: muniFeatureName(f, nearI), feature: f, index: nearI, method: 'nearest' };
      }
      return null;
    }
    // 면색(choropleth)은 남한 시군구만 필요(북한은 조사 데이터 없음). 북한 세분화는
    // "시·군·구 경계" 토글 시 korea-map 의 boundary 로더에서만 지연 로드/병합한다.
    function loadMunicipalities(cb) {
      if (global.KOREA_MUNICIPALITIES) { cb(true); return; }
      var s = document.createElement('script');
      s.src = 'skorea-municipalities.js';
      s.async = true;
      s.onload = function () { cb(!!global.KOREA_MUNICIPALITIES); };
      s.onerror = function () { cb(false); };
      document.head.appendChild(s);
    }

    function wordOfVid(vid) {
      var gkeys = Object.keys(GROUPS), i, j, g, v;
      for (i = 0; i < gkeys.length; i++) {
        g = GROUPS[gkeys[i]];
        for (j = 0; j < (g.variants || []).length; j++) {
          v = g.variants[j];
          if (v.id === vid) return v.word || '';
        }
      }
      return '';
    }

    function rebuildAreaFillFromPoints() {
      if (!opts.areaFill || !olMap || !global.ol || !global.KoreaMap || !KoreaMap.createFillLayer) return;
      loadMunicipalities(function (ok) {
        if (!ok || !global.KOREA_MUNICIPALITIES) {
          setMapStatus((document.getElementById(opts.statusId) && document.getElementById(opts.statusId).textContent || '') + ' · 면색: 시군구 데이터 없음', false);
          return;
        }
        // 공식(국립국어원) 지도와 동일한 "region_id 통합" 채색.
        //  좌표(point-in-polygon) 대신 조사지점의 시/군 식별자로 폴리곤을 칠한다.
        //  → 통합시(고양·수원 등) 일반구·광역시 자치구가 모(母) 단위로 같은 색이 되어 흰색이 사라짐.
        var feats = global.KOREA_MUNICIPALITIES.features || [];
        var matchStats = { total: 0, miss: 0, regions: 0, filled: 0 };

        // (1) 지역별 색 집계 — payload.regions 전체(조사+미조사) 기준.
        //  공식 fillPolicy(region_id_first_face_color)와 동일하게 각 시·군의 faceColor 로 칠한다.
        //  '미조사' 지역은 groups.variants 에 없고 regions 에만 있으므로, 반드시 regions 를 소스로 쓴다.
        function rgbHex(s) {
          if (!s) return null;
          s = String(s).trim();
          if (s.charAt(0) === '#') return s;
          var m = s.split(',').map(function (x) { return parseInt(x, 10); });
          if (m.length < 3 || isNaN(m[0]) || isNaN(m[1]) || isNaN(m[2])) return null;
          function h(n) { n = Math.max(0, Math.min(255, n || 0)); return (n < 16 ? '0' : '') + n.toString(16); }
          return '#' + h(m[0]) + h(m[1]) + h(m[2]);
        }
        var byName = {};    // 정규화 시·군명 → { color, word, sido, bySido:{sido:{color,word}} }
        var metroRep = {};  // 광역시 sido → { color, word }
        function addFace(sido, sgRaw, color, word) {
          var sg = normalizeAdminName(sgRaw || '');
          if (sg) sg = sg.replace(/\(.*\)$/, '').trim();
          if (!sg || !color) { matchStats.miss++; return; }
          if (!byName[sg]) byName[sg] = { color: color, word: word || '', sido: sido, bySido: {} };
          // 동일명 다른 시도(강원 고성 vs 경남 고성 등)는 sido별로 각각 보관해 폴리곤 sido 로 정확 매칭
          if (sido && !byName[sg].bySido[sido]) byName[sg].bySido[sido] = { color: color, word: word || '' };
          if (METRO_SIDO[sido] && !metroRep[sido]) metroRep[sido] = { color: color, word: word || '' };
        }
        // 조사 지역 색: groups.variants.places + 그룹 색(=공식 faceColor). 실측 지점이 있는 시·군만.
        //  (payload.regions 는 과거 미조사 패딩이 섞여 있어 면색 기준으로 쓰지 않는다 — 미조사는
        //   아래 misurveyFill 로 운영개발과 동일하게 처리). region_id 가 여러 그룹에 걸리면 첫 색.
        Object.keys(GROUPS).forEach(function (gkey) {
          var g = GROUPS[gkey];
          var color = rgbHex(g.color);
          (g.variants || []).forEach(function (v) {
            (v.places || []).forEach(function (pl) {
              matchStats.total++;
              addFace(String(pl.sido || '').trim(), pl.sigungu || pl.region_nm, color, v.word);
            });
          });
        });
        // 미조사 추정 채움(운영개발/공식 색): 조사자료가 없는 지역을 공식과 동일한 추정색으로.
        //  마커(실측 점)는 건드리지 않고 면색만 보강. 이미 조사된 지역은 그대로 둔다.
        Object.keys(MISFILL).forEach(function (k) {
          var hex = rgbHex(MISFILL[k]);
          if (!hex) return;
          if (METRO_SIDO[k]) { if (!metroRep[k]) metroRep[k] = { color: hex, word: '' }; }
          else if (!byName[k]) byName[k] = { color: hex, word: '', sido: '', bySido: {}, misurvey: true };
        });
        // faceFill: 공식 last-wins 색 override. 한 폴리곤이 여러 조사기록을 묶는 경우(제주 동/읍은
        //  regionId 공유, 광역시는 여러 구)는 우리의 '첫 그룹' 색이 운영개발의 '마지막 기록' 색과
        //  달라질 수 있어, 그 지역만 공식 색으로 덮어쓴다(동일명 다른 도는 제외돼 있음).
        Object.keys(FACEFILL).forEach(function (k) {
          var hex = rgbHex(FACEFILL[k]);
          if (!hex) return;
          if (METRO_SIDO[k]) metroRep[k] = { color: hex, word: (metroRep[k] && metroRep[k].word) || '' };
          else byName[k] = { color: hex, word: (byName[k] && byName[k].word) || '', sido: '', bySido: {} };
        });
        matchStats.regions = Object.keys(byName).length;

        // 광역시 판정 보강: 일부 폴리곤은 sido 가 비어 있어(부산·대구·대전·울산·광주 구 등)
        // f.properties.sido 로는 광역시를 못 가린다. 도(광역시) 경계에 대표점 point-in-polygon 으로 판정.
        var provFc = global.KOREA_PROVINCES || null;
        var metroProvGeoms = [];
        if (provFc && provFc.features) {
          provFc.features.forEach(function (pf) {
            var nm = pf.properties && pf.properties.name;
            if (nm && METRO_SIDO[nm]) metroProvGeoms.push({ sido: nm, geom: pf.geometry });
          });
        }
        function repPoint(geom) {
          if (!geom) return null;
          var ring = null;
          if (geom.type === 'Polygon') ring = geom.coordinates[0];
          else if (geom.type === 'MultiPolygon') {
            var best = -1, bi = 0;
            geom.coordinates.forEach(function (p, ix) { if (p[0] && p[0].length > best) { best = p[0].length; bi = ix; } });
            ring = geom.coordinates[bi][0];
          }
          if (!ring || !ring.length) return null;
          var sx = 0, sy = 0;
          for (var c = 0; c < ring.length; c++) { sx += ring[c][0]; sy += ring[c][1]; }
          return [sx / ring.length, sy / ring.length];
        }
        function minDistToGeom(x, y, geom) {
          // 대표점에서 도 경계 꼭짓점까지의 최소 거리(도 단위). 섬 자치구를 모 광역시에 붙일 때만 사용.
          var rings = [];
          if (geom.type === 'Polygon') rings = geom.coordinates;
          else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(function (p) { rings = rings.concat(p); });
          var best = Infinity;
          for (var r = 0; r < rings.length; r++) {
            var ring = rings[r];
            for (var c = 0; c < ring.length; c++) {
              var dx = ring[c][0] - x, dy = ring[c][1] - y;
              var d = dx * dx + dy * dy;
              if (d < best) best = d;
            }
          }
          return Math.sqrt(best);
        }
        function metroOf(f) {
          // 폴리곤의 실제 위치(geometry)로 광역시를 판정한다. skorea-municipalities 의 sido 속성은
          //  자치구에서 비어 있거나 틀린 경우가 많아(예: 모든 '서구'가 sido=대전광역시) 신뢰하지 않는다.
          var rp = repPoint(f.geometry);
          if (rp) {
            for (var k = 0; k < metroProvGeoms.length; k++) {
              if (pointInGeom(rp[0], rp[1], metroProvGeoms[k].geom)) return metroProvGeoms[k].sido;
            }
            // 섬 자치구(영도구 등)는 도 경계가 단순화돼 pip 실패 → 가장 가까운 광역시(0.25°≈25km 이내)
            var nearSido = null, nearD = 0.25;
            for (var m = 0; m < metroProvGeoms.length; m++) {
              var d = minDistToGeom(rp[0], rp[1], metroProvGeoms[m].geom);
              if (d < nearD) { nearD = d; nearSido = metroProvGeoms[m].sido; }
            }
            if (nearSido) return nearSido;
          }
          // 최후 폴백: sido 속성이 광역시면 사용
          var fsido = (f.properties && f.properties.sido) || '';
          return METRO_SIDO[fsido] ? fsido : null;
        }

        // (2) 폴리곤별 색: 직접 이름 → 통합시(모시) → 광역시(sido 대표). 북한은 제외(경계만)
        var fillFeatures = [];
        var fillPolyCount = 0;
        for (var fi = 0; fi < feats.length; fi++) {
          var f = feats[fi];
          if (f.properties && f.properties.nk) continue;   // 북한: 면색 없음(경계·이름만)
          var rawName = muniFeatureName(f, fi);
          var name = normalizeAdminName(rawName);
          var fsido = (f.properties && f.properties.sido) || '';
          var pick = null;
          var isMetroGu = /구$/.test(name) && name.indexOf('시') < 0;   // 종로구·서구·영도구 등 광역시 자치구
          if (isMetroGu) {
            // 광역시 자치구: 소속 광역시 대표색으로만 칠한다. '구' 이름은 광역시마다 중복돼(서구·중구·동구…)
            //  이름 매칭하면 다른 광역시 색을 잘못 가져오므로(예: 광주 서구가 대전 서구 색), 이름 매칭은 건너뛴다.
            var ms = metroOf(f); if (ms && metroRep[ms]) pick = metroRep[ms];
          } else {
            // (a) 직접 이름 매칭: 폴리곤 sido 에 해당하는 색 우선(강원/경남 고성처럼 동일명 구분)
            if (byName[name]) {
              if (fsido && byName[name].bySido && byName[name].bySido[fsido]) pick = byName[name].bySido[fsido];
              else if (!fsido || byName[name].sido === fsido) pick = byName[name];
            }
            // (b) 통합시 일반구: "OO시XX구" → "OO시" 색 (고양·수원·성남·안양·안산·용인…)
            if (!pick) { var cm = name.match(/^(.+시)(.+구)$/); if (cm && byName[cm[1]]) pick = byName[cm[1]]; }
            // (d) 이름만 매칭: 시도 표기 차이(제주도↔제주특별자치도)·동일명 도-군(강원·경남 고성군)
            if (!pick && byName[name]) pick = byName[name];
          }
          if (!pick || !pick.color) continue;   // 조사자료 없는 곳만 흰색
          fillPolyCount++;
          fillFeatures.push({
            type: 'Feature',
            properties: { color: pick.color, name: rawName, word: pick.word || '' },
            geometry: f.geometry
          });
        }
        matchStats.filled = fillPolyCount;
        var fc = { type: 'FeatureCollection', features: fillFeatures };

        if (areaLayer) {
          olMap.removeLayer(areaLayer);
          areaLayer = null;
        }
        areaLayer = KoreaMap.createFillLayer(fc, {
          zIndex: 5,
          fillAlpha: opts.areaFillAlpha != null ? opts.areaFillAlpha : 0.24,
          strokeAlpha: opts.areaStrokeAlpha != null ? opts.areaStrokeAlpha : 0.42,
          strokeWidth: 0.9,
          // labelProp는 항상 지정해 두고 표시 여부는 showLabel로만 제어한다.
          // (나중에 setAreaLabelsVisible로 다시 켤 수 있어야 하므로)
          labelProp: 'word',
          showLabel: !!opts.areaLabels,
          labelSize: opts.areaLabelSize || 13,
          // 한반도 전체(줌 ~6) 해상도에서도 글자 보이도록 여유 있게
          labelMinResolution: opts.areaLabelMinResolution != null ? opts.areaLabelMinResolution : 20000
        });
        if (areaLayer) {
          if (opts.hideAreaId) {
            var hide = $(opts.hideAreaId);
            areaLayer.setVisible(!(hide && hide.checked));
          } else {
            areaLayer.setVisible(true);
          }
          olMap.addLayer(areaLayer);
          // 비동기 면색 추가 직후 캔버스 크기·재그리기 보장 (비교 카드 등 늦게 붙는 타깃)
          try {
            olMap.updateSize();
            areaLayer.changed();
            if (typeof olMap.renderSync === 'function') olMap.renderSync();
          } catch (e) { /* ignore */ }
          requestAnimationFrame(function () {
            if (!olMap || destroyed) return;
            olMap.updateSize();
            if (areaLayer) areaLayer.changed();
          });
        }

        if (matchStats.total > 0) {
          var statusEl = $(opts.statusId);
          var base = statusEl ? statusEl.textContent.replace(/\s*·\s*면색:[^·]*$/, '') : '';
          var fillNote = '면색 ' + fillPolyCount + '폴리곤/' + matchStats.regions + '지역(시·군 통합)';
          if (matchStats.miss > 0) fillNote += ' · 미매칭 ' + matchStats.miss;
          setMapStatus((base ? base + ' · ' : '') + fillNote, matchStats.miss > 0);
        }

        if (typeof opts.onAreaReady === 'function') {
          try { opts.onAreaReady(fc, matchStats); } catch (e2) { /* ignore */ }
        }
      });
    }

    function renderMapLegend() {
      if (!opts.legendSelector) return;
      var list = document.querySelector(opts.legendSelector);
      if (!list) return;
      var keys = Object.keys(GROUPS);
      if (!keys.length) { list.innerHTML = ''; return; }
      list.innerHTML = keys.map(function (gkey) {
        var g = GROUPS[gkey];
        var color = g.color || '#64748B';
        var name = g.label || gkey;
        return '<li class="maplegend__row">' +
          '<span class="dfmark dfmark--circle" style="background:' + color + '" aria-hidden="true"></span>' +
          '<span class="maplegend__name">' + name + '</span></li>';
      }).join('');
    }

    function syncGroupCheckbox(gkey) {
      if (!opts.formListId) return;
      var groupCb = document.querySelector('#' + opts.formListId + ' .dfcb[data-group="' + gkey + '"], .dfcb[data-group="' + gkey + '"]');
      if (!groupCb || !GROUPS[gkey]) return;
      var ids = GROUPS[gkey].variants.map(function (v) { return v.id; });
      var onCount = ids.filter(function (id) { return activeVariants[id]; }).length;
      groupCb.checked = onCount === ids.length;
      groupCb.indeterminate = onCount > 0 && onCount < ids.length;
    }

    function renderDialectFormList(payload) {
      if (!opts.formListId) return;
      var list = $(opts.formListId);
      if (!list) return;
      var keys = Object.keys(GROUPS);
      if (!keys.length) {
        list.innerHTML = '<li class="dfitem" style="padding:16px;color:#94a3b8;font-weight:600;">표시할 방언형 데이터가 없습니다.</li>';
        return;
      }
      list.innerHTML = keys.map(function (gkey, gi) {
        var g = GROUPS[gkey];
        var open = gi < 3 ? ' is-open' : '';
        var exp = gi < 3 ? 'true' : 'false';
        return '<li class="dfitem' + open + '">' +
          '<div class="dfitem__head">' +
            '<input type="checkbox" class="dfcb" data-group="' + gkey + '" checked aria-label="' + (g.label || gkey) + ' 지도 표시">' +
            '<button class="dfitem__expand" type="button" aria-expanded="' + exp + '">' +
              '<span class="dfmark" style="background:' + g.color + ';width:12px;height:12px;border-radius:50%;display:inline-block;border:2px solid #fff;box-shadow:0 0 0 1px ' + g.color + '" aria-hidden="true"></span>' +
              '<span class="dfitem__headmain"><span class="dfitem__word">' + (g.label || gkey) + '</span>' +
              '<span class="dfitem__group">(' + g.variants.length + '형)</span></span>' +
              '<i class="ti ti-chevron-down dfchev" aria-hidden="true"></i>' +
            '</button>' +
          '</div>' +
          '<div class="dfitem__panel"><div class="dfvarlist" data-group="' + gkey + '"></div></div>' +
        '</li>';
      }).join('');

      list.querySelectorAll('.dfvarlist').forEach(function (el) {
        var gkey = el.dataset.group;
        var g = GROUPS[gkey];
        if (!g) return;
        el.innerHTML = g.variants.map(function (v) {
          return '<label class="dfvarrow">' +
            '<input type="checkbox" class="dfvarcb" data-vid="' + v.id + '" data-group="' + gkey + '" checked aria-label="' + v.word + ' 지도 표시">' +
            (v.symbolFile
              ? '<img class="dfvarrow__sym" src="' + (opts.symbolBase || './symbol/') + v.symbolFile + '?v=3" width="16" height="16" alt="" style="vertical-align:middle;flex:0 0 auto">'
              : variantMarkSVG(g.color, v.shape)) +
            '<span class="dfvarrow__word">' + v.word + '</span>' +
            '<span class="dfvarrow__n" title="지점 수">' + v.n + '곳</span>' +
          '</label>';
        }).join('');
      });

      if (!opts.bindFormList) return;

      list.querySelectorAll('.dfitem__expand').forEach(function (head) {
        head.addEventListener('click', function () {
          var item = head.closest('.dfitem');
          var open = item.classList.toggle('is-open');
          head.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });
      list.querySelectorAll('.dfvarcb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          activeVariants[cb.dataset.vid] = cb.checked;
          syncGroupCheckbox(cb.dataset.group);
          refreshMarkers();
        });
      });
      list.querySelectorAll('.dfcb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var gkey = cb.dataset.group;
          cb.indeterminate = false;
          if (!GROUPS[gkey]) return;
          GROUPS[gkey].variants.forEach(function (v) { activeVariants[v.id] = cb.checked; });
          list.querySelectorAll('.dfvarcb[data-group="' + gkey + '"]').forEach(function (vcb) {
            vcb.checked = cb.checked;
          });
          refreshMarkers();
        });
      });

      var meta = $(opts.infoMetaId);
      if (meta && payload) {
        meta.innerHTML = '표준어: <b>' + (payload.headword || '') + '</b>' +
          (payload.word_class ? ' <span class="dform__sep">|</span> 품사: <b>' + payload.word_class + '</b>' : '') +
          ' <span class="dform__sep">|</span> <span style="color:#64748b;font-weight:600">실데이터</span>';
      }
    }

    var currentPayload = null;
    var popupReqSeq = 0;

    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function resolvePlace(feature, v) {
      var pl = feature && feature.get('place');
      if (pl) return pl;
      if (feature && feature.get('lng') != null && feature.get('lat') != null) {
        var lk = Number(feature.get('lng')).toFixed(5) + ',' + Number(feature.get('lat')).toFixed(5);
        if (placeByCoord[lk]) return placeByCoord[lk];
      }
      // variant.places 에서 좌표 일치 찾기
      if (v && v.places && feature) {
        var lng = Number(feature.get('lng'));
        var lat = Number(feature.get('lat'));
        for (var i = 0; i < v.places.length; i++) {
          var p = v.places[i];
          if (p && Math.abs(Number(p.lng) - lng) < 1e-5 && Math.abs(Number(p.lat) - lat) < 1e-5) return p;
        }
        if (v.places.length === v.points.length) {
          // points 인덱스 추정
        }
      }
      return null;
    }

    function buildPopupRows(baseRows) {
      // 중복 키 제거 (앞쪽 우선)
      var seen = {};
      var out = [];
      baseRows.forEach(function (r) {
        if (seen[r[0]]) return;
        seen[r[0]] = 1;
        if (r[1] == null || String(r[1]).trim() === '') return;
        out.push(r);
      });
      return out;
    }

    /* 한 지점을 여러 제보자가 답한 경우가 8.8% 다 (수원 '가을' = 2020 여75 · 2023 여20 · 2023 남20).
       예전에는 그중 하나만 골라 보여 줘 나머지가 통째로 가려졌다. 이제 전부 나열한다. */
    function informantList(details) {
      // 묶는 단위는 '제보자' 다 — 조사연도·성별·나이.
      // 한 사람이 같은 말을 표기만 달리해 여러 줄로 들어 있다
      // (산청 2007 남76: '가을' / '가을(=가을'')' — 일련번호도 다르다).
      // 그대로 나열하면 같은 사람이 세 명처럼 보인다.
      var byKey = {};
      var order = [];
      (details || []).forEach(function (d) {
        var sex = d.sex || '';
        var age = d.age ? (d.age + '세') : '';
        var who = [sex, age].filter(Boolean).join(' · ');
        if (!d.basisYear && !who) return;
        var key = [d.basisYear || '', sex, age].join('│');
        if (!byKey[key]) {
          byKey[key] = {
            year: d.basisYear ? d.basisYear + '년' : '',
            who: who || '정보 없음',
            memos: [],
            forms: []
          };
          order.push(key);
        }
        var it = byKey[key];
        var memo = (d.fileMemo || '').trim();
        if (memo && it.memos.indexOf(memo) < 0) it.memos.push(memo);
        var form = (d.dltTp || '').trim();
        if (form && it.forms.indexOf(form) < 0) it.forms.push(form);
      });
      var list = order.map(function (k) {
        var it = byKey[k];
        return { year: it.year, who: it.who, memo: it.memos.join(' · ') };
      });
      // 최근 조사부터
      list.sort(function (a, b) { return (b.year || '').localeCompare(a.year || ''); });
      return list;
    }

    function renderPopupHtml(v, g, placeLabel, rows, optsExtra) {
      var color = (g && g.color) || '#64748b';
      var extra = optsExtra || {};
      var table = rows.map(function (r) {
        return '<tr><th scope="row">' + escHtml(r[0]) + '</th><td>' + escHtml(r[1]) + '</td></tr>';
      }).join('');
      var audioCell = '';
      var speaker =
        '<button type="button" class="popup-speaker-btn" disabled title="준비 중" aria-label="음성 듣기 (준비 중)">' +
          '<i class="ti ti-volume" aria-hidden="true"></i>' +
        '</button>';
      // 음성 파일 연동 전: 아이콘만 있는 심플 버튼 (비활성)
      if (extra.showAudioPlaceholder && !(extra.informants && extra.informants.length)) {
        audioCell = '<tr><th scope="row">음성</th><td style="text-align:left;">' + speaker + '</td></tr>';
      }

      // 제보자가 여럿이면 표로 나열한다 (조사시기 · 제보자 · 음성)
      var infBlock = '';
      var infs = extra.informants || [];
      if (infs.length) {
        infBlock =
          '<div class="popup-informants">' +
            '<div class="popup-informants__cap">이 지점에서 조사된 제보자 <b>' + infs.length + '명</b></div>' +
            '<table class="popup-inftable"><thead><tr>' +
              '<th scope="col">조사시기</th><th scope="col">제보자</th><th scope="col">음성</th>' +
            '</tr></thead><tbody>' +
            infs.map(function (x) {
              return '<tr>' +
                '<td>' + escHtml(x.year) + '</td>' +
                '<td>' + escHtml(x.who) +
                  (x.memo ? '<small>' + escHtml(x.memo) + '</small>' : '') + '</td>' +
                '<td>' + speaker + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table>' +
          '</div>';
      }
      return '' +
        '<div class="popup-header">' +
          '<div class="popup-header__title">' +
            '<span class="popup-header__word" style="color:' + color + '">' + escHtml(v.word) + '</span>' +
            '<span>' + escHtml(placeLabel) + '</span>' +
            (g && g.label ? '<span>' + escHtml(g.label) + '</span>' : '') +
          '</div>' +
          '<button type="button" class="popup-close" id="popup-closer" aria-label="닫기"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="popup-body">' +
          ((table || audioCell)
            ? '<table class="popup-table"><tbody>' + table + audioCell + '</tbody></table>'
            : (extra.note ? '<p class="popup-note">' + escHtml(extra.note) + '</p>' : '')) +
          infBlock +
        '</div>';
    }

    function showGenericPopup(vid, coord, feature) {
      if (!opts.popup || !popupOverlay) return;
      var popupContent = $(opts.popupContentId);
      if (!popupContent) return;
      var gkey = String(vid).split('-')[0];
      var g = GROUPS[gkey];
      if (!g) return;
      var v = null;
      g.variants.forEach(function (x) { if (x.id === vid) v = x; });
      if (!v) return;

      var pl = resolvePlace(feature, v);
      var placeLabel = '조사 지점';
      if (pl && (pl.region_nm || pl.sigungu || pl.sido)) {
        placeLabel = pl.region_nm || ((pl.sido || '') + ' ' + (pl.sigungu || '')).trim();
      }

      var payload = currentPayload || {};
      // '지역' 은 팝업 머리글과 제목에 이미 있어 세 번 반복된다 — 표에서는 뺀다
      var baseRows = [];

      var rows = buildPopupRows(baseRows);
      popupContent.innerHTML = renderPopupHtml(v, g, placeLabel, rows,
        { note: '제보자 정보를 불러오는 중…' });
      popupOverlay.setPosition(coord);
      function bindCloser() {
        var c = document.getElementById('popup-closer');
        if (c) c.onclick = function () { popupOverlay.setPosition(undefined); return false; };
      }
      bindCloser();

      // DB에서 제보자·연도·일련번호 보강
      var reqId = ++popupReqSeq;

      function draw(picked, note) {
        if (reqId !== popupReqSeq) return;
        if (picked && picked.length) {
          popupContent.innerHTML = renderPopupHtml(v, g, placeLabel, buildPopupRows(baseRows), {
            showAudioPlaceholder: true,
            informants: informantList(picked)
          });
        } else {
          popupContent.innerHTML = renderPopupHtml(v, g, placeLabel, buildPopupRows(baseRows),
            { note: note || '이 지점의 제보자 정보가 없습니다.' });
        }
        bindCloser();
      }

      // API 응답에서 이 방언형에 해당하는 줄만 추린다. 하나도 없으면 지점 전체.
      function pick(rows) {
        var matched = (rows || []).filter(function (d) {
          return d.dltTp === v.word || (d.dltTp && d.dltTp.indexOf(v.word) === 0);
        });
        return matched.length ? matched : (rows || []);
      }

      // API 가 없는 정적 배포(깃허브 페이지·Vercel)용 사본
      function fallback(note) {
        loadStaticPoints(payload.headword_no, function (points) {
          var rows = staticInformants(points, v.word, pl);
          draw(rows, rows && rows.length ? null : note);
        });
      }

      fetch('/api/map_point?' + new URLSearchParams({
        word: v.word || '',
        std: payload.headword || '',
        sido: (pl && pl.sido) || '',
        sigungu: (pl && pl.sigungu) || '',
        region: placeLabel || ''
      }).toString())
        .then(function (r) {
          if (!r.ok) throw new Error('no api');
          return r.json();
        })
        .then(function (res) {
          if (reqId !== popupReqSeq) return;
          if (!res || res.status !== 'success') { fallback('제보자 정보를 불러오지 못했습니다.'); return; }
          if (!res.data || !res.data.length) { fallback(null); return; }
          draw(pick(res.data));
        })
        .catch(function () {
          if (reqId !== popupReqSeq) return;
          fallback('제보자 정보를 불러오지 못했습니다.');
        });
    }

    // ── 정적 제보자 사본 (scripts/export_map_points.py 가 만든다) ──
    var staticPoints = {};

    function loadStaticPoints(no, cb) {
      var key = String(no || '');
      if (!key) { cb(null); return; }
      if (staticPoints.hasOwnProperty(key)) {
        var hit = staticPoints[key];
        if (hit && hit.pending) { hit.waiting.push(cb); return; }
        cb(hit);
        return;
      }
      var slot = { pending: true, waiting: [cb] };
      staticPoints[key] = slot;
      function settle(val) {
        staticPoints[key] = val;
        slot.waiting.forEach(function (fn) { fn(val); });
      }
      fetch((opts.pointBase || './data/processed/map_points/') + encodeURIComponent(key) + '.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { settle((j && j.points) || null); })
        .catch(function () { settle(null); });
    }

    function staticInformants(points, word, pl) {
      if (!points) return null;
      var k = [word || '', (pl && pl.sido) || '', (pl && pl.sigungu) || ''].join('\u2502');
      var arr = points[k];
      if (!arr || !arr.length) return null;
      // API 응답과 같은 모양으로 되돌린다 — informantList 가 그대로 쓴다.
      return arr.map(function (x) {
        return {
          basisYear: x.y || '',
          sex: x.s || '',
          age: x.a || '',
          fileMemo: x.m || '',
          dltTp: (x.f || word || '').split('|')[0]
        };
      });
    }

    // 원본 심볼 PNG 아이콘 스타일 (symbolFile 있을 때 사용). 크기는 운영과 동일(~13px)로 정규화.
    function iconStyle(file, big) {
      var base = opts.symbolBase || './symbol/';
      var icon = new ol.style.Icon({ src: base + file + '?v=3', anchor: [0.5, 0.5] });
      var target = big ? (opts.symbolPxBig || 13) : (opts.symbolPx || 10);
      var im = icon.getImage();
      function fit() { var w = (im && im.naturalWidth) || 23; icon.setScale(target / w); if (markerLayer) markerLayer.changed(); }
      if (im && im.naturalWidth) fit(); else if (im) im.addEventListener('load', fit, { once: true });
      // 원본 심볼 PNG 자체에 흰색/불투명 배경이 구워져 있어(운영과 동일) 별도 플레이트 불필요.
      // 필요 시 opts.symbolWhiteBg === true 로 뒤에 흰 원을 덧그릴 수 있음(기본 꺼짐).
      if (opts.symbolWhiteBg === true) {
        return [
          new ol.style.Style({
            image: new ol.style.Circle({
              radius: target * 0.72 + 1.5,
              fill: new ol.style.Fill({ color: '#ffffff' }),
              stroke: new ol.style.Stroke({ color: 'rgba(15,23,42,0.15)', width: 0.8 })
            })
          }),
          new ol.style.Style({ image: icon })
        ];
      }
      return new ol.style.Style({ image: icon });
    }

    function applyMapPayload(payload) {
      currentPayload = payload || null;
      GROUPS = {};
      activeVariants = {};
      variantStyles = {};
      variantStylesBig = {};
      variantColors = {};
      placeByCoord = {};
      REGIONS = (payload && payload.regions) || [];   // 면색 소스(미조사 포함)
      MISFILL = (payload && payload.misurveyFill) || {};   // 미조사 추정 채움(공식 색)
      FACEFILL = (payload && payload.faceFill) || {};      // 공식 last-wins override
      var groups = (payload && payload.groups) || {};
      Object.keys(groups).forEach(function (gkey) {
        var src = groups[gkey];
        var g = {
          color: src.color || '#64748b',
          label: src.label || gkey,
          variants: (src.variants || []).map(function (v, i) {
            return {
              word: v.word,
              n: String(v.n != null ? v.n : (v.points || []).length),
              points: v.points || [],
              places: v.places || [],
              id: gkey + '-' + i,
              shape: VAR_SHAPES[i % VAR_SHAPES.length],
              symbolFile: v.symbolFile || null
            };
          })
        };
        GROUPS[gkey] = g;
      });
      if (opts.uniqueColors) ensureUniqueGroupColors(GROUPS, opts.colorMinDist);
      Object.keys(GROUPS).forEach(function (gkey) {
        var g = GROUPS[gkey];
        g.variants.forEach(function (v) {
          activeVariants[v.id] = true;
          if (v.symbolFile) {
            // 운영과 동일한 원본 심볼 PNG 사용
            variantStyles[v.id] = iconStyle(v.symbolFile, false);
            variantStylesBig[v.id] = iconStyle(v.symbolFile, true);
          } else {
            // 심볼 파일이 없으면 기존 벡터 도형으로 폴백
            variantStyles[v.id] = markerStyle(g.color, v.shape);
            variantStylesBig[v.id] = markerStyle(g.color, v.shape, true);
          }
          variantColors[v.id] = g.color;
          (v.places || []).forEach(function (pl) {
            if (pl.lng == null || pl.lat == null) return;
            placeByCoord[pl.lng.toFixed(5) + ',' + pl.lat.toFixed(5)] = pl;
          });
        });
      });
      rebuildMarkerFeatures();
      rebuildAreaFillFromPoints();
      renderDialectFormList(payload);
      renderMapLegend();
      var st = (payload && payload.stats) || {};
      setMapStatus(
        '실데이터 · 지점 ' + (st.points || 0) + ' · 방언형 ' + (st.variants || 0) +
        ' · 계열 ' + (st.groups || 0) +
        (payload && payload.source ? ' · ' + payload.source : '')
      );
      if (typeof opts.onLoad === 'function') opts.onLoad(payload, GROUPS);
    }

    function loadHeadword(headwordNo, wordLabel) {
      if (destroyed) return;
      if (!headwordNo) {
        setMapStatus('이 단어는 아직 지도 export가 없습니다. (data-id 없음)', true);
        return;
      }
      if (currentHeadwordNo === String(headwordNo) && Object.keys(GROUPS).length) return;
      currentHeadwordNo = String(headwordNo);
      var iw = $(opts.infoWordId);
      if (iw && wordLabel) iw.textContent = wordLabel;
      setMapStatus('실데이터 불러오는 중… (' + headwordNo + ')');
      if (mapDataCache[headwordNo]) {
        applyMapPayload(mapDataCache[headwordNo]);
        return;
      }
      // no-cache: export를 다시 만들면 바로 반영되도록 항상 재검증한다.
      // (개발 서버가 Cache-Control을 안 보내 브라우저가 옛 JSON을 그대로 쓰는 문제)
      fetch(opts.dataBase + encodeURIComponent(headwordNo) + '.json', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' — export 파일이 없습니다');
          return r.json();
        })
        .then(function (data) {
          mapDataCache[headwordNo] = data;
          applyMapPayload(data);
        })
        .catch(function (err) {
          GROUPS = {};
          rebuildMarkerFeatures();
          if (areaLayer && olMap) { olMap.removeLayer(areaLayer); areaLayer = null; }
          var list = $(opts.formListId);
          if (list) list.innerHTML = '';
          setMapStatus('로드 실패: ' + (err.message || err) + ' · python3 scripts/export_map_headword.py --headword-no ' + headwordNo, true);
          if (typeof opts.onError === 'function') opts.onError(err);
        });
    }

    // boot
    initMap();

    return {
      loadHeadword: loadHeadword,
      applyPayload: applyMapPayload,
      refreshMarkers: refreshMarkers,
      setVariantActive: function (vid, on) {
        activeVariants[vid] = !!on;
        refreshMarkers();
      },
      setGroupActive: function (gkey, on) {
        if (!GROUPS[gkey]) return;
        GROUPS[gkey].variants.forEach(function (v) { activeVariants[v.id] = !!on; });
        refreshMarkers();
      },
      getGroups: function () { return GROUPS; },
      getActiveVariants: function () { return activeVariants; },
      getMap: function () { return olMap; },
      getRegionLayers: function () { return regionLayers; },
      getOverlays: function () { return overlays; },
      zoomBy: function (delta) {
        if (!olMap) return;
        var view = olMap.getView();
        view.animate({ zoom: (view.getZoom() || opts.zoom) + delta, duration: 250 });
      },
      resetView: function () {
        if (!olMap) return;
        olMap.getView().animate({ center: ol.proj.fromLonLat(opts.center), zoom: opts.zoom, duration: 350 });
      },
      setAreaVisible: function (v) { if (areaLayer) areaLayer.setVisible(!!v); },
      /* 면색 위의 방언형 글자만 켜고 끄기.
         opts.areaLabels를 함께 갱신해, 단어 변경 등으로 면색 레이어가 다시 만들어져도 상태가 유지된다. */
      setAreaLabelsVisible: function (v) {
        opts.areaLabels = !!v;
        if (areaLayer && areaLayer.setLabelsVisible) areaLayer.setLabelsVisible(!!v);
      },
      setMarkersVisible: function (v) { if (markerLayer) markerLayer.setVisible(!!v); },
      showSido: function (v) { if (regionLayers) regionLayers.showSido(!!v); },
      showSigungu: function (v) { if (regionLayers) regionLayers.showSigungu(!!v); },
      showOverlay: function (key, v) { if (overlays) overlays.show(key, !!v); },
      variantMarkSVG: variantMarkSVG,
      updateSize: function () { if (olMap) olMap.updateSize(); },
      destroy: function () {
        destroyed = true;
        if (olMap) {
          olMap.setTarget(null);
          olMap = null;
        }
      }
    };
  }

  global.DialectMap = {
    create: create,
    DEFAULTS: DEFAULTS,
    VAR_SHAPES: VAR_SHAPES,
    variantMarkSVG: variantMarkSVG,
    markerStyle: markerStyle,
    ensureUniqueGroupColors: ensureUniqueGroupColors
  };
})(typeof window !== 'undefined' ? window : this);
