/*
 * korea-map.js — 공용 한반도 지도 모듈
 * -------------------------------------------------------------
 * 도로·지명 없는 깨끗한 시·도 경계 벡터 지도를 여러 페이지에서 공통으로 사용하기 위한 헬퍼.
 *
 * 의존성 (아래 순서로 먼저 로드할 것):
 *   1) OpenLayers  : https://cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js  (+ ol.css)
 *   2) 지도 데이터 : skorea-provinces.js  (window.KOREA_PROVINCES 정의)
 *   3) 이 파일     : korea-map.js
 *
 * 사용 예)
 *   <div id="map" style="width:100%;height:520px"></div>
 *   <script>
 *     var map = KoreaMap.create('map');                 // 기본 한반도 지도
 *     // 필요 시 내 오버레이(마커·면색 등)를 map.addLayer(...) 로 얹으면 됨
 *   </script>
 *
 *   // 기존 ol.Map에 base 레이어만 얹고 싶을 때
 *   var base = KoreaMap.createBaseLayer({ zIndex: 0 });
 *   myMap.addLayer(base);
 */
(function (global) {
  'use strict';

  // 기본 설정값 — 페이지마다 create()/createBaseLayer() 두 번째 인자로 덮어쓸 수 있음
  var DEFAULTS = {
    center: [127.8, 38.1],   // 한반도 전체(남한 중심) [경도, 위도]
    zoom: 6.4,
    minZoom: 5,
    maxZoom: 12,
    fill: '#ffffff',         // 육지(시·도) 채움색 — 흰색 (바깥 배경은 지도 컨테이너 배경색)
    stroke: '#aab6c6',       // 경계선 색
    strokeWidth: 1,          // 경계선 두께
    zIndex: 0,               // base 레이어 z-index (오버레이는 이보다 크게)

    // ── 지역명 라벨 / 시·군·구 옵션 ──
    muniSrc: 'skorea-municipalities.js',  // 시·군·구 경계 데이터(지연 로드 대상). null 이면 지연 로드 안 함
    muniMinZoom: 8,          // 이 줌 이상에서 시·군·구 경계·라벨 표시 (그 아래는 시·도 라벨)
    muniStroke: '#cbd5e1',   // 시·군·구 경계선 색(얇게)
    muniStrokeWidth: 0.8,
    muniZIndex: 1,           // 시·군·구 경계 z-index
    labelZIndex: 6,          // 라벨 z-index (마커 위에 얹어 가독성 확보)
    sidoVisible: false,      // 시·도 이름 최초 표시 여부(토글 초기값) — 기본 꺼짐
    sigunguVisible: false,   // 시·군·구 이름 최초 표시 여부(토글 초기값) — 기본 꺼짐
    labelFont: 'sans-serif', // 라벨 글꼴 패밀리
    sidoColor: '#334155',    // 시·도 라벨 색
    sidoSize: 14,            // 시·도 라벨 크기(px)
    sigunguColor: '#475569', // 시·군·구 라벨 색
    sigunguSize: 11          // 시·군·구 라벨 크기(px)
  };

  // 웹메르카토르 해상도 → 줌 레벨 (스타일 함수에서 view 없이 계산)
  var R0 = 156543.03392804097;
  function zoomFromResolution(res) { return Math.log(R0 / res) / Math.LN2; }

  function merge(base, over) {
    var o = {};
    for (var k in base) { if (base.hasOwnProperty(k)) o[k] = base[k]; }
    if (over) { for (var j in over) { if (over.hasOwnProperty(j) && over[j] !== undefined) o[j] = over[j]; } }
    return o;
  }

  function ready() {
    return !!(global.ol && global.ol.Map);
  }

  // '#rgb' / '#rrggbb' → 'rgba(r,g,b,a)'
  function hexToRgba(hex, a) {
    if (typeof hex !== 'string') return 'rgba(0,0,0,' + a + ')';
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // 시·도 경계 스타일(ol.style.Style) 생성
  function createBaseStyle(opts) {
    var o = merge(DEFAULTS, opts);
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: o.fill }),
      stroke: new ol.style.Stroke({ color: o.stroke, width: o.strokeWidth })
    });
  }

  // 시·도 경계 벡터 레이어(ol.layer.Vector) 생성. 데이터/OL 없으면 null 반환
  function createBaseLayer(opts) {
    var o = merge(DEFAULTS, opts);
    if (!ready() || !global.KOREA_PROVINCES) return null;
    var layer = new ol.layer.Vector({
      source: new ol.source.Vector({
        features: new ol.format.GeoJSON().readFeatures(global.KOREA_PROVINCES, {
          dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'
        })
      }),
      style: createBaseStyle(o)
    });
    layer.setZIndex(o.zIndex);
    return layer;
  }

  // 기본 시점(ol.View) 생성
  function createView(opts) {
    var o = merge(DEFAULTS, opts);
    return new ol.View({
      center: ol.proj.fromLonLat(o.center),
      zoom: o.zoom,
      minZoom: o.minZoom,
      maxZoom: o.maxZoom
    });
  }

  function readFeatures(geojson) {
    return new ol.format.GeoJSON().readFeatures(geojson, {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'
    });
  }

  // 스크립트 1회 지연 로드 (fetch 대신 <script> 삽입 — file:// 에서도 동작)
  var _scripts = {};   // src -> 'done' | [callbacks]
  function loadScript(src, cb) {
    if (_scripts[src] === 'done') { cb(true); return; }
    if (_scripts[src]) { _scripts[src].push(cb); return; }
    _scripts[src] = [cb];
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function () {
      var cbs = _scripts[src]; _scripts[src] = 'done';
      if (cbs && cbs.forEach) cbs.forEach(function (f) { f(true); });
    };
    s.onerror = function () {
      var cbs = _scripts[src]; _scripts[src] = null;
      if (cbs && cbs.forEach) cbs.forEach(function (f) { f(false); });
    };
    document.head.appendChild(s);
  }

  // 시·군·구 경계 레이어(줌인 시 표시). 데이터(window.KOREA_MUNICIPALITIES) 없으면 null
  function createMunicipalityLayer(opts) {
    var o = merge(DEFAULTS, opts);
    if (!ready() || !global.KOREA_MUNICIPALITIES) return null;
    var layer = new ol.layer.Vector({
      source: new ol.source.Vector({ features: readFeatures(global.KOREA_MUNICIPALITIES) }),
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: o.muniStroke, width: o.muniStrokeWidth })
      }),
      minZoom: o.muniMinZoom - 0.01   // 이 줌 이상에서만 표시
    });
    layer.setZIndex(o.muniZIndex);
    return layer;
  }

  /*
   * 지역명 라벨 레이어. 데이터 없으면 null.
   * state = { sido:bool, sigungu:bool } 를 실시간 참조해 레벨별로 표시를 제어한다.
   *  - 시·도 라벨: state.sido 가 true 이면 표시
   *  - 시·군·구 라벨: state.sigungu 가 true 이고, 줌이 muniMinZoom 이상일 때만 표시(확대 시)
   * 토글 후에는 layer.changed() 로 다시 그린다.
   */
  function createLabelLayer(opts, state) {
    var o = merge(DEFAULTS, opts);
    if (!ready() || !global.KOREA_LABELS) return null;
    state = state || { sido: o.sidoVisible === true, sigungu: o.sigunguVisible === true };

    function textStyle(feature, resolution) {
      var level = feature.get('level');
      if (level === 'sido') {
        if (!state.sido) return null;
      } else { // sigungu
        if (!state.sigungu) return null;
        if (zoomFromResolution(resolution) < o.muniMinZoom) return null;  // 확대 시에만
      }
      var big = level === 'sido';
      return new ol.style.Style({
        text: new ol.style.Text({
          text: feature.get('name') || '',
          font: (big ? '700 ' : '600 ') + (big ? o.sidoSize : o.sigunguSize) + 'px ' + o.labelFont,
          fill: new ol.style.Fill({ color: big ? o.sidoColor : o.sigunguColor }),
          stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.9)', width: big ? 3.5 : 2.5 }),
          overflow: true
        })
      });
    }

    var layer = new ol.layer.Vector({
      source: new ol.source.Vector({ features: readFeatures(global.KOREA_LABELS) }),
      style: textStyle,
      declutter: true          // 라벨 겹침 자동 정리
    });
    layer.setZIndex(o.labelZIndex);
    layer._labelState = state; // 토글 제어용 상태 노출
    return layer;
  }

  /*
   * 기존 ol.Map에 시·군·구 경계 + 지역명 라벨 레이어를 얹고, 토글 컨트롤러를 반환한다.
   * @returns {object} { municipalityLayer, labelLayer, showLabels(bool), toggleLabels(), labelsVisible() }
   */
  function attachRegionLayers(map, opts) {
    var o = merge(DEFAULTS, opts);

    // 시·도/시·군·구 표시 상태(라벨 스타일 함수가 실시간 참조)
    var state = { sido: o.sidoVisible === true, sigungu: o.sigunguVisible === true };

    // 지역명 라벨(작음, 37KB)은 즉시 얹는다. 실제 표시는 state 로 제어.
    var labels = createLabelLayer(o, state);
    if (labels) map.addLayer(labels);

    // 시·군·구 경계(큼, 470KB)는 사용자가 "시·군·구"를 켤 때만 지연 로드한다.
    var muni = null;
    function ensureMuni() {
      if (muni) { muni.setVisible(state.sigungu); return; }
      function build() {
        muni = createMunicipalityLayer(o);   // layer.minZoom 으로 확대 시에만 렌더
        if (muni) { muni.setVisible(state.sigungu); map.addLayer(muni); }
      }
      if (global.KOREA_MUNICIPALITIES) { build(); return; }
      if (!o.muniSrc) return;
      loadScript(o.muniSrc, function (ok) { if (ok && !muni) build(); });
    }

    function setSido(show) {
      state.sido = !!show;
      if (labels) labels.changed();
    }
    function setSigungu(show) {
      state.sigungu = !!show;
      if (labels) labels.changed();
      if (state.sigungu) ensureMuni();          // 켤 때만 로드/표시
      else if (muni) muni.setVisible(false);     // 끄면 경계 숨김(데이터는 유지)
    }

    // 최초 상태 반영(둘 다 켜져 있게 옵션 준 경우)
    if (state.sigungu) ensureMuni();

    return {
      labelLayer: labels,
      get municipalityLayer() { return muni; },
      showSido: setSido,
      showSigungu: setSigungu,
      sidoVisible: function () { return state.sido; },
      sigunguVisible: function () { return state.sigungu; },
      // (구버전 호환) 둘 다 동시 토글
      showLabels: function (show) { setSido(show); setSigungu(show); }
    };
  }

  /*
   * 면색 레이어 생성 — 각 지형(예: 마커가 속한 시·군·구 경계)을 자기 색으로 채운다.
   * @param {object} geojson  FeatureCollection. 각 feature 는 색상 속성(기본 'color')을 가짐
   * @param {object} [opts]
   *        colorProp    색상 속성 이름 (기본 'color')
   *        color        색상 속성이 없을 때 기본색 (기본 '#3b82f6')
   *        fillAlpha    채움 투명도 0~1 (기본 0.22)
   *        strokeAlpha  경계선 투명도 0~1 (기본 0.55, 0 이면 경계선 없음)
   *        strokeWidth  경계선 두께 (기본 1)
   *        zIndex       레이어 z-index (기본 2)
   *        visible      function(feature)->bool. 특정 지형만 표시(예: 방언형 on/off). 생략 시 전체 표시
   * @returns {ol.layer.Vector|null}
   */
  function createFillLayer(geojson, opts) {
    opts = opts || {};
    if (!ready() || !geojson) return null;
    var colorProp   = opts.colorProp || 'color';
    var fallback    = opts.color || '#3b82f6';
    var fillAlpha   = opts.fillAlpha != null ? opts.fillAlpha : 0.22;
    var strokeAlpha = opts.strokeAlpha != null ? opts.strokeAlpha : 0.55;
    var strokeWidth = opts.strokeWidth != null ? opts.strokeWidth : 1;
    var zIndex      = opts.zIndex != null ? opts.zIndex : 2;
    var visible     = typeof opts.visible === 'function' ? opts.visible : null;
    var labelProp   = opts.labelProp || null;       // 예: 'word' — 면 위에 방언형 글자
    // showLabel을 명시로 넘기면 그 값을 따른다(false로 끌 수 있어야 함).
    // 안 넘기면 종전처럼 labelProp 유무로 판단.
    var showLabel   = opts.showLabel != null ? opts.showLabel === true : !!labelProp;
    // 한반도 전체 줌(~6, res≈2000~3000)에서도 글자가 보이도록 기본값을 넉넉히
    var labelMinRes = opts.labelMinResolution != null ? opts.labelMinResolution : 20000;
    var labelSize   = opts.labelSize || 13;

    function labelPoint(geom) {
      if (!geom) return null;
      try {
        var type = geom.getType();
        if (type === 'Polygon') return geom.getInteriorPoint();
        if (type === 'MultiPolygon') {
          var polys = geom.getPolygons();
          var best = polys[0], bestArea = 0, i;
          for (i = 0; i < polys.length; i++) {
            var a = polys[i].getArea();
            if (a > bestArea) { bestArea = a; best = polys[i]; }
          }
          return best ? best.getInteriorPoint() : null;
        }
        return new ol.geom.Point(ol.extent.getCenter(geom.getExtent()));
      } catch (e) {
        try {
          return new ol.geom.Point(ol.extent.getCenter(geom.getExtent()));
        } catch (e2) {
          return null;
        }
      }
    }

    var layer = new ol.layer.Vector({
      source: new ol.source.Vector({ features: readFeatures(geojson) }),
      // 라벨이 잘리지 않도록 업데이트 시 extent 여유
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: function (feature, resolution) {
        if (visible && !visible(feature)) return null;
        var c = feature.get(colorProp) || fallback;
        var s = {
          fill: new ol.style.Fill({ color: hexToRgba(c, fillAlpha) })
        };
        if (strokeAlpha > 0) s.stroke = new ol.style.Stroke({ color: hexToRgba(c, strokeAlpha), width: strokeWidth });
        var styles = [new ol.style.Style(s)];

        if (showLabel && labelProp && resolution < labelMinRes) {
          var text = feature.get(labelProp);
          if (text) {
            var pt = labelPoint(feature.getGeometry());
            if (pt) {
              // 축소 시 글자 약간 키워 가독성 확보 (해상도↑ = 축소)
              var px = Math.max(10, labelSize - 2);
              if (resolution > 4000) px = Math.max(10, labelSize - 3);
              if (resolution < 1000) px = labelSize - 1;
              styles.push(new ol.style.Style({
                geometry: pt,
                text: new ol.style.Text({
                  text: String(text),
                  font: '500 ' + px + 'px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
                  fill: new ol.style.Fill({ color: '#0f172a' }),
                  stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
                  overflow: true,
                  textAlign: 'center',
                  textBaseline: 'middle'
                })
              }));
            }
          }
        }
        return styles;
      }
    });
    layer.setZIndex(zIndex);
    // 생성 후에도 라벨만 켜고 끌 수 있게 (면색은 그대로 두고 글자만 감춤)
    layer.setLabelsVisible = function (v) {
      showLabel = !!v;
      layer.changed();
    };
    layer.getLabelsVisible = function () { return showLabel; };
    return layer;
  }

  /*
   * 지도 위 부가정보 오버레이 정의 (하천·철도·도로·산맥).
   * 각 항목은 필요할 때(토글 ON) 스크립트를 지연 로드해 레이어로 얹는다.
   *   global: 데이터 전역변수명 / src: 데이터 파일 / type: 'line'|'fill'
   */
  var OVERLAYS = {
    rivers:    { global: 'KOREA_RIVERS',    src: 'skorea-rivers.js',    type: 'line', color: '#3b5bdb', width: 1.6, zIndex: 4 },
    rail:      { global: 'KOREA_RAIL',      src: 'skorea-rail.js',      type: 'line', color: '#2f9e44', width: 2.4, zIndex: 4 },
    roads:     { global: 'KOREA_ROADS',     src: 'skorea-roads.js',     type: 'line', color: '#e8590c', width: 1.3, dash: [5, 4], zIndex: 4 },
    mountains: { global: 'KOREA_MOUNTAINS', src: 'skorea-mountains.js', type: 'fill', color: '#5f6f6a', fillAlpha: 0.5, zIndex: 1 }
  };

  function createOverlayLayer(cfg) {
    if (!ready() || !global[cfg.global]) return null;
    var style;
    if (cfg.type === 'fill') {
      style = new ol.style.Style({ fill: new ol.style.Fill({ color: hexToRgba(cfg.color, cfg.fillAlpha != null ? cfg.fillAlpha : 0.5) }) });
    } else {
      var st = { color: cfg.color, width: cfg.width || 1.5 };
      if (cfg.dash) st.lineDash = cfg.dash;
      style = new ol.style.Style({ stroke: new ol.style.Stroke(st) });
    }
    var layer = new ol.layer.Vector({ source: new ol.source.Vector({ features: readFeatures(global[cfg.global]) }), style: style });
    layer.setZIndex(cfg.zIndex != null ? cfg.zIndex : 4);
    return layer;
  }

  /*
   * 오버레이(하천·철도·도로·산맥)를 지도에 연결하고 토글 컨트롤러를 반환한다.
   * 데이터는 처음 켤 때만 지연 로드된다.
   * @returns {object} { show(key,bool), toggle(key), visible(key), layers }
   */
  function attachOverlays(map, opts) {
    opts = opts || {};
    var cfgs = opts.overlays || OVERLAYS;
    var layers = {};
    function ensure(key, show) {
      var cfg = cfgs[key]; if (!cfg) return;
      if (layers[key]) { layers[key].setVisible(show); return; }
      function build() { var L = createOverlayLayer(cfg); if (L) { L.setVisible(show); map.addLayer(L); layers[key] = L; } }
      if (global[cfg.global]) { build(); return; }
      if (cfg.src) loadScript(cfg.src, function (ok) { if (ok && !layers[key]) build(); });
    }
    return {
      show: function (key, show) { if (show) ensure(key, true); else if (layers[key]) layers[key].setVisible(false); },
      toggle: function (key) { var v = !(layers[key] && layers[key].getVisible()); this.show(key, v); return v; },
      visible: function (key) { return !!(layers[key] && layers[key].getVisible()); },
      layers: layers
    };
  }

  /*
   * 깨끗한 한반도 지도를 생성해서 반환(ol.Map). OL 미로딩 시 null.
   * @param {string|HTMLElement} target  지도를 그릴 컨테이너(id 또는 엘리먼트)
   * @param {object} [opts]  center/zoom/fill/stroke/... 및 아래 추가 옵션
   *        opts.controls            ol 컨트롤 배열 (기본: OL 기본값, [] 전달 시 컨트롤 없음)
   *        opts.interactions        ol 인터랙션 배열 (예: 정적 지도는 [] 전달)
   *        opts.keyboardEventTarget 키보드 이벤트 대상
   */
  function create(target, opts) {
    var o = merge(DEFAULTS, opts);
    if (!ready()) return null;
    var base = createBaseLayer(o);
    var cfg = {
      target: target,
      layers: base ? [base] : [],
      view: createView(o)
    };
    if (opts && opts.controls !== undefined) cfg.controls = opts.controls;
    if (opts && opts.interactions !== undefined) cfg.interactions = opts.interactions;
    if (opts && opts.keyboardEventTarget !== undefined) cfg.keyboardEventTarget = opts.keyboardEventTarget;
    var map = new ol.Map(cfg);
    // opts.regions/labels 또는 시·도/시·군·구 초기표시 옵션이 있으면 지역명 레이어를 얹고
    // 토글 컨트롤러를 map.regions 에 담아 반환한다.
    if (opts && (opts.regions || opts.labels || opts.sidoVisible || opts.sigunguVisible)) {
      map.regions = attachRegionLayers(map, o);
    }
    return map;
  }

  global.KoreaMap = {
    DEFAULTS: DEFAULTS,
    OVERLAYS: OVERLAYS,
    hexToRgba: hexToRgba,
    createBaseStyle: createBaseStyle,
    createBaseLayer: createBaseLayer,
    createView: createView,
    createMunicipalityLayer: createMunicipalityLayer,
    createLabelLayer: createLabelLayer,
    attachRegionLayers: attachRegionLayers,
    createFillLayer: createFillLayer,
    createOverlayLayer: createOverlayLayer,
    attachOverlays: attachOverlays,
    create: create
  };
})(window);
