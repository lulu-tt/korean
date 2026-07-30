/**
 * dialect-map-core.js
 * 방언 지도 공통 모듈 (OpenLayers + KoreaMap)
 *
 * 사용 예:
 *   var mapApi = DialectMap.create({
 *     target: 'olmap',
 *     dataBase: './data/processed/map/',
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
          (v.points || []).forEach(function (pt) {
            var f = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(pt)) });
            f.set('vid', v.id);
            f.set('word', v.word);
            f.set('lng', pt[0]);
            f.set('lat', pt[1]);
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
        var muniBag = {};
        var cityGuIndex = getCityGuIndex(global.KOREA_MUNICIPALITIES);
        var feats = global.KOREA_MUNICIPALITIES.features || [];
        var provFc = global.KOREA_PROVINCES || null;
        var provFeats = (provFc && provFc.features) || [];
        var metroIdx = getMetroProvinceIndex(provFc);
        var matchStats = { pip: 0, name: 0, nearest: 0, miss: 0, total: 0, cityExpand: 0, metroExpand: 0 };

        Object.keys(GROUPS).forEach(function (gkey) {
          var g = GROUPS[gkey];
          g.variants.forEach(function (v) {
            (v.points || []).forEach(function (pt, pi) {
              matchStats.total++;
              var place = (v.places && v.places[pi]) || placeByCoord[pt[0].toFixed(5) + ',' + pt[1].toFixed(5)] || null;
              var hit = findMunicipality(pt[0], pt[1], global.KOREA_MUNICIPALITIES, place);
              if (!hit) { matchStats.miss++; return; }
              if (hit.method === 'pip') matchStats.pip++;
              else if (hit.method === 'name') matchStats.name++;
              else if (hit.method === 'nearest') matchStats.nearest++;

              var metroKey = resolveMetroKey(place, pt[0], pt[1], provFc);
              var cityKey = metroKey ? null : resolveCityGuKey(hit.name, place, cityGuIndex);
              var bagKey, bagInit;
              if (metroKey && metroIdx && metroIdx[metroKey] != null) {
                bagKey = 'metro:' + metroKey;
                bagInit = { metroKey: metroKey, cityKey: null, provinceIndex: metroIdx[metroKey], indices: null, name: metroKey, counts: {}, colors: {} };
              } else if (cityKey) {
                bagKey = 'city:' + cityKey;
                bagInit = { metroKey: null, cityKey: cityKey, provinceIndex: null, indices: cityGuIndex[cityKey].slice(), name: cityKey, counts: {}, colors: {} };
              } else {
                bagKey = 'idx:' + hit.index;
                bagInit = { metroKey: null, cityKey: null, provinceIndex: null, indices: [hit.index], name: hit.name, counts: {}, colors: {} };
              }
              if (!muniBag[bagKey]) {
                muniBag[bagKey] = bagInit;
                if (metroKey) matchStats.metroExpand++;
                else if (cityKey) matchStats.cityExpand++;
              }
              muniBag[bagKey].counts[v.id] = (muniBag[bagKey].counts[v.id] || 0) + 1;
              muniBag[bagKey].colors[v.id] = g.color;
            });
          });
        });

        var fillFeatures = [];
        var fillPolyCount = 0;
        Object.keys(muniBag).forEach(function (key) {
          var bag = muniBag[key];
          var bestVid = null, bestN = -1;
          Object.keys(bag.counts).forEach(function (vid) {
            if (bag.counts[vid] > bestN) { bestN = bag.counts[vid]; bestVid = vid; }
          });
          if (!bestVid) return;
          var color = bag.colors[bestVid];
          if (bag.metroKey != null && bag.provinceIndex != null) {
            var pf = provFeats[bag.provinceIndex];
            if (pf) {
              fillPolyCount++;
              fillFeatures.push({
                type: 'Feature',
                properties: { vid: bestVid, color: color, name: bag.metroKey, metro: bag.metroKey, word: wordOfVid(bestVid) },
                geometry: pf.geometry
              });
            }
            return;
          }
          (bag.indices || []).forEach(function (fi) {
            var f = feats[fi];
            if (!f) return;
            fillPolyCount++;
            fillFeatures.push({
              type: 'Feature',
              properties: { vid: bestVid, color: color, name: muniFeatureName(f, fi), city: bag.cityKey || undefined, word: wordOfVid(bestVid) },
              geometry: f.geometry
            });
          });
        });
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
          var bagCount = Object.keys(muniBag).length;
          var fillNote = '면색 ' + fillPolyCount + '폴리곤/' + bagCount + '지역';
          var recovered = matchStats.name + matchStats.nearest;
          if (recovered > 0) fillNote += ' (이름/근접 복구 ' + recovered + ')';
          if (matchStats.metroExpand > 0) fillNote += ' · 광역시 ' + matchStats.metroExpand;
          if (matchStats.cityExpand > 0) fillNote += ' · 시·구통합 ' + matchStats.cityExpand;
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
            variantMarkSVG(g.color, v.shape) +
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
      var placeLabel = '조사 지점';
      if (feature && feature.get('lng') != null && feature.get('lat') != null) {
        var lk = Number(feature.get('lng')).toFixed(5) + ',' + Number(feature.get('lat')).toFixed(5);
        var pl = placeByCoord[lk];
        if (pl && (pl.region_nm || pl.sigungu)) {
          placeLabel = pl.region_nm || ((pl.sido || '') + ' ' + (pl.sigungu || '')).trim();
        }
      }
      var color = g.color || '#64748b';
      popupContent.innerHTML =
        '<div class="popup-header">' +
          '<div class="popup-header__title">' +
            '<span class="popup-header__word" style="color:' + color + '">' + v.word + '</span>' +
            '<span>' + placeLabel + '</span>' +
            '<span>' + (g.label || '') + '</span>' +
          '</div>' +
          '<button type="button" class="popup-close" id="popup-closer" aria-label="닫기"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="popup-body">' +
          '<div class="popup-body__title"><span style="color:' + color + '">' + v.word + '</span> · ' + placeLabel + '</div>' +
          '<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">지도 표시용 실데이터 지점입니다. (음성 연결은 serial 매핑 후 제공 예정)</p>' +
        '</div>';
      popupOverlay.setPosition(coord);
      var closer = document.getElementById('popup-closer');
      if (closer) closer.onclick = function () { popupOverlay.setPosition(undefined); return false; };
    }

    function applyMapPayload(payload) {
      GROUPS = {};
      activeVariants = {};
      variantStyles = {};
      variantStylesBig = {};
      variantColors = {};
      placeByCoord = {};
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
              shape: VAR_SHAPES[i % VAR_SHAPES.length]
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
          variantStyles[v.id] = markerStyle(g.color, v.shape);
          variantStylesBig[v.id] = markerStyle(g.color, v.shape, true);
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
