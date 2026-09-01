/**
 * my-map-regions.js — 시·군·구 안정 ID 레지스트리
 * id = "muni_" + featureIndex (KOREA_MUNICIPALITIES.features 순서 고정)
 * bare name 단독 키 사용 금지 (중구×6 등)
 */
(function (global) {
  'use strict';

  var _list = null;
  var _byId = null;
  var _version = null;

  function ringContains(ring, x, y) {
    // ray casting; ring is [[lng,lat],...]
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      var intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function geomContains(geom, x, y) {
    if (!geom) return false;
    if (geom.type === 'Polygon') {
      if (!ringContains(geom.coordinates[0], x, y)) return false;
      for (var h = 1; h < geom.coordinates.length; h++) {
        if (ringContains(geom.coordinates[h], x, y)) return false;
      }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      for (var p = 0; p < geom.coordinates.length; p++) {
        var poly = { type: 'Polygon', coordinates: geom.coordinates[p] };
        if (geomContains(poly, x, y)) return true;
      }
    }
    return false;
  }

  function outerRing(geom) {
    if (!geom) return null;
    if (geom.type === 'Polygon') return geom.coordinates[0];
    if (geom.type === 'MultiPolygon') {
      // largest ring by vertex count (islands/coast)
      var best = null, bestN = -1;
      for (var i = 0; i < geom.coordinates.length; i++) {
        var r = geom.coordinates[i][0];
        if (r && r.length > bestN) { best = r; bestN = r.length; }
      }
      return best;
    }
    return null;
  }

  function samplePoints(geom) {
    var ring = outerRing(geom);
    if (!ring || !ring.length) return [[127.5, 36.5]];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var sx = 0, sy = 0;
    var n = ring.length;
    // drop closing vertex if duplicated
    if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n -= 1;
    for (var i = 0; i < n; i++) {
      var x = ring[i][0], y = ring[i][1];
      sx += x; sy += y;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    var avg = [sx / n, sy / n];
    var box = [(minX + maxX) / 2, (minY + maxY) / 2];
    // a few interior-ish candidates
    return [
      box,
      avg,
      [(minX * 2 + maxX) / 3, (minY * 2 + maxY) / 3],
      [(minX + maxX * 2) / 3, (minY + maxY * 2) / 3],
      ring[Math.floor(n / 2)]
    ];
  }

  var NK_RE = /자강도|량강|함경|평안|황해|남포|평양/;

  function resolveSidoForGeom(geom) {
    var fc = global.KOREA_PROVINCES;
    if (!fc || !fc.features) return '기타';
    var pts = samplePoints(geom);
    var skHit = null;
    var anyHit = null;
    for (var p = 0; p < pts.length; p++) {
      var lng = pts[p][0], lat = pts[p][1];
      for (var i = 0; i < fc.features.length; i++) {
        var f = fc.features[i];
        var name = (f.properties && f.properties.name) || '';
        if (!geomContains(f.geometry, lng, lat)) continue;
        if (!anyHit) anyHit = name;
        if (!NK_RE.test(name)) {
          // prefer 특별/광역 first
          if (/특별|광역/.test(name)) return name;
          if (!skHit) skHit = name;
        }
      }
      if (skHit) return skHit;
    }
    return skHit || anyHit || '기타';
  }

  /**
   * 북한 도·직할시 (KOREA_PROVINCES 기준, 시·군·구 데이터 없음 → 도 단위 선택)
   * 남한 강원도(index 9)와 북한 강원도(index 18) 구분
   */
  var NK_PROVINCE_NAMES = {
    '자강도': true,
    '량강도': true,
    '함경북도': true,
    '함경남도': true,
    '평안북도': true,
    '평안남도': true,
    '황해북도': true,
    '황해남도': true,
    '남포시': true,
    '평양시': true,
    '라선시': true,
    '개성시': true
  };

  function isNorthProvince(index, name) {
    if (NK_PROVINCE_NAMES[name]) return true;
    // 동명 강원도: 시·도 배열에서 남한(0–16) 이후 등장하는 강원도 = 북한
    if (name === '강원도' && index > 16) return true;
    return false;
  }

  function build() {
    _list = [];
    _byId = {};
    var fc = global.KOREA_MUNICIPALITIES;
    var muniCount = 0;
    if (fc && fc.features) {
      var feats = fc.features;
      muniCount = feats.length;
      for (var i = 0; i < feats.length; i++) {
        var name = (feats[i].properties && feats[i].properties.name) || ('구역' + i);
        var sido = resolveSidoForGeom(feats[i].geometry);
        var ref = {
          id: 'muni_' + i,
          name: name,
          sido: sido,
          label: name + ' (' + sido + ')',
          featureIndex: i,
          level: 'muni',
          source: 'municipalities'
        };
        _list.push(ref);
        _byId[ref.id] = ref;
      }
    }

    // 북한: 시·군 데이터(NKOREA)가 병합돼 있으면 위 muni 루프에서 이미 시·군 단위로 등록됨 →
    // 도(province) 단위 중복 등록을 건너뛴다. 병합 전이면 기존처럼 도 단위로 등록(폴백).
    var nkCount = 0;
    var prov = global.KOREA_PROVINCES;
    var nkMuniMerged = !!(fc && fc.__nkMerged);
    if (!nkMuniMerged && prov && prov.features) {
      for (var p = 0; p < prov.features.length; p++) {
        var pname = (prov.features[p].properties && prov.features[p].properties.name) || '';
        if (!isNorthProvince(p, pname)) continue;
        var pref = {
          id: 'prov_' + p,
          name: pname,
          sido: '북한',
          label: pname + ' (북한)',
          featureIndex: p,
          level: 'province',
          source: 'provinces'
        };
        _list.push(pref);
        _byId[pref.id] = pref;
        nkCount++;
      }
    }

    _version = 'muni' + muniCount + '+nk' + nkCount;
  }

  function ensure() {
    if (!_list) build();
  }

  var MyMapRegions = {
    rebuild: function () {
      _list = null;
      build();
    },

    dataVersion: function () {
      ensure();
      return _version;
    },

    all: function () {
      ensure();
      return _list.slice();
    },

    get: function (id) {
      ensure();
      return _byId[id] || null;
    },

    byFeatureIndex: function (idx) {
      ensure();
      return _byId['muni_' + idx] || null;
    },

    search: function (q, limit) {
      ensure();
      var query = String(q || '').trim().toLowerCase();
      if (!query) return _list.slice(0, limit || 20);
      var out = [];
      var lim = limit || 20;
      for (var i = 0; i < _list.length; i++) {
        var r = _list[i];
        var hay = (r.label + ' ' + r.name + ' ' + r.sido).toLowerCase();
        if (hay.indexOf(query) !== -1) {
          out.push(r);
          if (out.length >= lim) break;
        }
      }
      return out;
    },

    /**
     * GeoJSON → OL features (인덱스 고정으로 regionId 부여)
     * 주의: VectorSource#getFeatures() 순서에 의존하면 ID가 뒤바뀔 수 있음.
     * 반드시 readFeatures 직후 배열 인덱스로 부여한다.
     */
    createHitFeatures: function () {
      ensure();
      if (!global.ol) return [];
      var fmt = new ol.format.GeoJSON();
      var opts = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' };
      var all = [];

      // 1) 남한 시·군·구
      if (global.KOREA_MUNICIPALITIES) {
        var feats = fmt.readFeatures(global.KOREA_MUNICIPALITIES, opts);
        for (var i = 0; i < feats.length; i++) {
          var ref = _byId['muni_' + i];
          if (!ref) {
            var rawName = global.KOREA_MUNICIPALITIES.features[i] &&
              global.KOREA_MUNICIPALITIES.features[i].properties
              ? global.KOREA_MUNICIPALITIES.features[i].properties.name
              : ('구역' + i);
            ref = {
              id: 'muni_' + i,
              name: rawName,
              label: rawName,
              featureIndex: i,
              level: 'muni'
            };
          }
          feats[i].setId(ref.id);
          feats[i].set('regionId', ref.id);
          feats[i].set('regionLabel', ref.label);
          feats[i].set('regionName', ref.name);
          feats[i].set('featureIndex', ref.featureIndex);
          feats[i].set('regionLevel', 'muni');
          all.push(feats[i]);
        }
      }

      // 2) 북한 도 단위 (선택 가능 강조)
      if (global.KOREA_PROVINCES) {
        var pfeats = fmt.readFeatures(global.KOREA_PROVINCES, opts);
        for (var p = 0; p < pfeats.length; p++) {
          var pref = _byId['prov_' + p];
          if (!pref) continue; // 남한 시·도·독도 제외
          pfeats[p].setId(pref.id);
          pfeats[p].set('regionId', pref.id);
          pfeats[p].set('regionLabel', pref.label);
          pfeats[p].set('regionName', pref.name);
          pfeats[p].set('featureIndex', pref.featureIndex);
          pfeats[p].set('regionLevel', 'province');
          all.push(pfeats[p]);
        }
      }
      return all;
    },

    /**
     * @deprecated getFeatures 순서 의존 — createHitFeatures 사용 권장
     */
    attachIdsToSource: function (vectorSource) {
      ensure();
      if (!vectorSource || !vectorSource.getFeatures) return;
      // id 가 이미 있으면 유지, 없을 때만 name 매칭
      var feats = vectorSource.getFeatures();
      for (var i = 0; i < feats.length; i++) {
        if (feats[i].get('regionId')) continue;
        var nm = feats[i].get('name');
        var ref = null;
        if (nm) {
          for (var j = 0; j < _list.length; j++) {
            if (_list[j].name === nm) { ref = _list[j]; break; }
          }
        }
        if (!ref) ref = _byId['muni_' + i];
        if (ref) {
          feats[i].set('regionId', ref.id);
          feats[i].set('regionLabel', ref.label);
          feats[i].set('regionName', ref.name);
          feats[i].set('featureIndex', ref.featureIndex);
        }
      }
    },

    /**
     * 지도 좌표(EPSG:3857)에서 시·군·구 OL feature 선택 (레거시)
     * 가능하면 pickRegionAtLonLat 사용 권장
     */
    pickFeatureAtCoordinate: function (vectorSource, coordinate) {
      if (!vectorSource || !coordinate) return null;
      var hits = [];
      vectorSource.forEachFeature(function (f) {
        var g = f.getGeometry();
        if (!g) return;
        try {
          if (g.intersectsCoordinate(coordinate)) hits.push(f);
        } catch (e) { /* ignore */ }
      });
      if (!hits.length) return null;
      if (hits.length === 1) return hits[0];
      hits.sort(function (a, b) {
        var aa = 0, bb = 0;
        try { aa = a.getGeometry().getArea(); } catch (e1) { /* */ }
        try { bb = b.getGeometry().getArea(); } catch (e2) { /* */ }
        return aa - bb;
      });
      return hits[0];
    },

    /** bbox 면적 (경위도, 상대 비교용) */
    _bboxArea: function (geom) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      function walk(c) {
        if (typeof c[0] === 'number') {
          if (c[0] < minX) minX = c[0];
          if (c[0] > maxX) maxX = c[0];
          if (c[1] < minY) minY = c[1];
          if (c[1] > maxY) maxY = c[1];
        } else {
          for (var i = 0; i < c.length; i++) walk(c[i]);
        }
      }
      if (!geom || !geom.coordinates) return Infinity;
      walk(geom.coordinates);
      return (maxX - minX) * (maxY - minY);
    },

    /**
     * 경위도(lon, lat)로 원본 GeoJSON PIP → RegionRef
     * OL 변환/intersectsCoordinate 오판 방지. 중첩 시 bbox 작은 구역 우선.
     */
    pickRegionAtLonLat: function (lon, lat) {
      ensure();
      if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) return null;
      // 한반도 대략 범위
      if (lon < 124 || lon > 132 || lat < 33 || lat > 43.5) return null;

      // 1) 남한 시·군·구 우선
      var fc = global.KOREA_MUNICIPALITIES;
      if (fc && fc.features) {
        var hits = [];
        for (var i = 0; i < fc.features.length; i++) {
          var f = fc.features[i];
          if (geomContains(f.geometry, lon, lat)) {
            hits.push({
              index: i,
              area: this._bboxArea(f.geometry),
              name: (f.properties && f.properties.name) || ''
            });
          }
        }
        if (hits.length) {
          hits.sort(function (a, b) { return a.area - b.area; });
          var best = hits[0];
          var ref = _byId['muni_' + best.index];
          if (ref) return ref;
          return {
            id: 'muni_' + best.index,
            name: best.name,
            sido: '기타',
            label: best.name,
            featureIndex: best.index,
            level: 'muni'
          };
        }
      }

      // 2) 시·군·구 미히트 → 북한 도 단위
      var prov = global.KOREA_PROVINCES;
      if (prov && prov.features) {
        var phits = [];
        for (var p = 0; p < prov.features.length; p++) {
          var pf = prov.features[p];
          var pn = (pf.properties && pf.properties.name) || '';
          if (!isNorthProvince(p, pn)) continue;
          if (geomContains(pf.geometry, lon, lat)) {
            phits.push({
              index: p,
              area: this._bboxArea(pf.geometry),
              name: pn
            });
          }
        }
        if (phits.length) {
          phits.sort(function (a, b) { return a.area - b.area; });
          var pb = phits[0];
          var pref = _byId['prov_' + pb.index];
          if (pref) return pref;
          return {
            id: 'prov_' + pb.index,
            name: pb.name,
            sido: '북한',
            label: pb.name + ' (북한)',
            featureIndex: pb.index,
            level: 'province'
          };
        }
      }
      return null;
    },

    /**
     * 지도 좌표(EPSG:3857) → RegionRef
     */
    pickRegionAtMapCoord: function (coordinate3857) {
      if (!coordinate3857 || coordinate3857.length < 2) return null;
      var lon, lat;
      if (global.ol && ol.proj && ol.proj.toLonLat) {
        var ll = ol.proj.toLonLat(coordinate3857);
        lon = ll[0];
        lat = ll[1];
      } else {
        // fallback mercator
        lon = coordinate3857[0] * 180 / 20037508.34;
        lat = coordinate3857[1] * 180 / 20037508.34;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
      }
      return this.pickRegionAtLonLat(lon, lat);
    },

    snapshot: function (id) {
      var r = this.get(id);
      if (!r) return null;
      return {
        id: r.id,
        name: r.name,
        sido: r.sido,
        label: r.label,
        featureIndex: r.featureIndex,
        level: r.level,
        source: r.source
      };
    },

    /** region id → GeoJSON geometry (원본 4326) */
    getGeometry: function (regionId) {
      ensure();
      var ref = _byId[regionId];
      if (!ref) return null;
      if (ref.source === 'provinces' || String(regionId).indexOf('prov_') === 0) {
        var pf = global.KOREA_PROVINCES && global.KOREA_PROVINCES.features[ref.featureIndex];
        return pf ? pf.geometry : null;
      }
      var mf = global.KOREA_MUNICIPALITIES && global.KOREA_MUNICIPALITIES.features[ref.featureIndex];
      return mf ? mf.geometry : null;
    },

    /** 폴리곤 대략 중심 (경위도) — 마커 배치용 */
    getCentroidLonLat: function (regionId) {
      var geom = this.getGeometry(regionId);
      if (!geom) return null;
      var ring = outerRing(geom);
      if (!ring || !ring.length) return null;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      var n = ring.length;
      if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n -= 1;
      for (var i = 0; i < n; i++) {
        var x = ring[i][0], y = ring[i][1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    }
  };

  global.MyMapRegions = MyMapRegions;
})(window);
