/*
 * admin-map-backend.js — MyMapStore 의 DB 연동 백엔드 어댑터
 *
 * 목적: 사용자 사이트의 진짜 에디터(my-map.js)를 관리자에서 그대로 구동하되,
 *       저장소만 localStorage → 관리자 DB API(/neibis-api/*) 로 교체한다.
 *
 * 읽기: 한 "표제어 작업세트"(headword+dialects+regions)를 메모리로 하이드레이션 →
 *       MyMapStore.load() 는 메모리에서 동기 반환.
 * 쓰기: MyMapStore.save(data) 호출 시 메모리 반영 + 디바운스 플러시.
 *       flush 는 스냅샷 대비 diff(신규/수정/삭제)를 기존 엔드포인트로 반영.
 *
 * id 정합: my-map.js 가 들고 있는 로컬 id 는 절대 재작성하지 않는다.
 *          localId→dbId 맵(_idMap)을 두고 "플러시 시점에만" 번역한다.
 *          (새 dialect 는 로컬 hd_id 90000+, 저장 후 실제 hd_id 를 맵에 기록)
 * region_id: DB region_id 컬럼은 TEXT → 신규 지역은 muni_N 을 그대로 저장(역변환 불필요).
 *            레거시 숫자 id 는 읽을 때만 이름으로 muni_N 변환.
 */
(function (global) {
  'use strict';

  var API = '/mariadb/neibis-api';

  function emptyData() {
    return {
      schemaVersion: 2,
      dbCompat: 'kd_headword+tb_headword_dialect+tb_headword_dialect_region',
      seq: { headword_id: 900000, headword_no: 2900000, hd_id: 90000, hdr_id: 900000 },
      headwords: [], dialects: [], regions: []
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // DB 색상값 정규화: "0100FF"(# 없는 hex) → "#0100FF". "r,g,b" · "#hex" 는 그대로.
  function normColor(c) {
    c = String(c == null ? '' : c).trim();
    if (!c) return c;
    if (/^[0-9a-fA-F]{6}$/.test(c) || /^[0-9a-fA-F]{3}$/.test(c)) return '#' + c;
    return c;
  }

  // 지역 → muni_/prov_ id 해석.
  //   MyMapRegions.search 는 시·군명("광주시")만 매칭됨(전체명 "경기도 광주시" 실패).
  //   → mapKey(시·군명)로 검색하고 sido 로 동명 시·군 중복 해소("광주시" 경기 vs 광주광역시).
  function resolveRegionId(r) {
    var rid = String(r.regionId || '');
    if (rid.indexOf('muni_') === 0 || rid.indexOf('prov_') === 0) return rid;
    var key = String(r.mapKey || '').trim();
    if (!key) {
      var parts = String(r.regionNm || '').trim().split(/\s+/);
      key = parts[parts.length - 1] || '';  // 전체명이면 마지막 토큰(시·군)
    }
    if (key.indexOf('_') >= 0) key = key.split('_').pop();      // "강원_고성군" → "고성군"
    if (key.indexOf('(') >= 0) key = key.split('(')[0].trim();  // "진주시(진양군)" → "진주시"
    if (!key || !global.MyMapRegions || !MyMapRegions.search) return rid;
    var hits = MyMapRegions.search(key, 8) || [];
    if (!hits.length) return rid;
    var sido = String(r.sido || '').trim();
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

  function getJSON(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); });
  }
  function postJSON(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  var Backend = {
    _data: emptyData(),
    _snapshot: emptyData(),
    _idMap: { hd: {}, hdr: {} },
    _headwordNo: '',
    _flushTimer: null,
    _flushing: false,
    _pending: false,
    readOnly: false,
    onStatus: null,          // fn(state, info)  state: 'saving'|'saved'|'error'|'clean'
    DEBOUNCE_MS: 500,

    _status: function (s, info) { if (this.onStatus) { try { this.onStatus(s, info); } catch (e) { /* */ } } },

    /** API → MyMapStore data 하이드레이션 (Promise) */
    hydrate: function (headwordNo) {
      var self = this;
      self._headwordNo = String(headwordNo || '');
      self._idMap = { hd: {}, hdr: {} };
      if (global.MyMapRegions && MyMapRegions.rebuild) {
        try { MyMapRegions.rebuild(); } catch (e) { /* */ }
      }
      var hn = self._headwordNo;
      return Promise.all([
        getJSON(API + '/headword/detail?headwordNo=' + encodeURIComponent(hn)),
        getJSON(API + '/dialect/list?headwordNo=' + encodeURIComponent(hn) + '&full=1')
      ]).then(function (res) {
        var det = (res[0] && res[0].ok) ? res[0].data : null;
        var dl = (res[1] && res[1].ok) ? (res[1].list || []) : [];
        var data = emptyData();
        if (det) {
          data.headwords.push({
            headword_id: det.headwordId || '',
            topic_id: det.topicId || '121',
            headword_no: det.headwordNo || hn,
            sub_no: '0', use_no: null,
            headword: det.headword || '',
            original_word: null,
            word_class: det.wordClass || '',
            meaning: det.meaning || '',
            usid: det.usid || 'admin',
            use_yn: det.useYn || 'N',
            appro: det.appro || 'N',
            map_make: det.mapMake || 'Y',
            commentary: det.commentary || null,
            create_dt: det.createDt || ''
          });
        }
        dl.forEach(function (d) {
          data.dialects.push({
            hd_id: String(d.hdId),
            headword_no: String(d.headwordNo || hn),
            word: d.word || '',
            face_color: normColor(d.faceColor),
            mutation_group: d.mutationGroup || '',
            mutation_seq: d.mutationSeq || '',
            map_symbol_id: d.mapSymbolId || '',
            symbol_color: normColor(d.symbolColor),
            create_dt: d.createDt || ''
          });
          (d.regions || []).forEach(function (r) {
            data.regions.push({
              hdr_id: String(r.hdrId || ''),
              headword_no: String(d.headwordNo || hn),
              word: d.word || '',
              region_id: resolveRegionId(r),
              hd_id: String(d.hdId),
              serial_nm: null, basis_year: null,
              region_nm: r.regionNm || '',
              create_dt: ''
            });
          });
        });
        self._data = data;
        self._snapshot = clone(data);
        return data;
      });
    },

    // ── MyMapStore 백엔드 인터페이스 ──
    load: function () { return this._data; },

    save: function (data) {
      this._data = data;
      if (this.readOnly) { return true; }
      this._scheduleFlush();
      return true;
    },

    _scheduleFlush: function () {
      var self = this;
      this._status('saving');
      if (this._flushTimer) clearTimeout(this._flushTimer);
      this._flushTimer = setTimeout(function () { self._flush(); }, this.DEBOUNCE_MS);
    },

    _tHd: function (id) { return this._idMap.hd[id] || id; },
    _tHdr: function (id) { return this._idMap.hdr[id] || id; },

    _flush: function () {
      var self = this;
      if (this._flushing) { this._pending = true; return; }
      this._flushing = true;
      var data = this._data, snap = this._snapshot;

      // 새 표제어(스냅샷에 headword 없음)면 생성 후 실 headwordNo 로 재적재
      var curH = data.headwords[0], snapH = snap.headwords[0];
      var chain;
      if (curH && !snapH) {
        chain = postJSON('/headword/save', {
          mode: 'C', headword: curH.headword, wordClass: curH.word_class,
          meaning: curH.meaning, appro: curH.appro, useYn: curH.use_yn,
          topicId: curH.topic_id
        }).then(function (r) {
          if (r && r.ok && r.headwordNo) {
            global.location.replace('dialect-editor.do?headwordNo=' + encodeURIComponent(r.headwordNo));
          } else { throw new Error((r && r.message) || '표제어 등록 실패'); }
        });
      } else {
        chain = self._syncHeadword(curH, snapH)
          .then(function () { return self._syncDialects(); })
          .then(function () { return self._syncRegions(); })
          .then(function () { self._snapshot = clone(self._data); });
      }

      chain.then(function () {
        self._status('saved');
      }).catch(function (e) {
        console.error('[AdminMapBackend] flush 실패', e);
        self._status('error', e && e.message);
      }).then(function () {
        self._flushing = false;
        if (self._pending) { self._pending = false; self._scheduleFlush(); }
      });
    },

    _syncHeadword: function (cur, snap) {
      if (!cur || !snap) return Promise.resolve();
      var changed = ['headword', 'word_class', 'meaning', 'appro', 'use_yn']
        .some(function (k) { return String(cur[k] || '') !== String(snap[k] || ''); });
      if (!changed) return Promise.resolve();
      return postJSON('/headword/save', {
        mode: 'M', headwordNo: cur.headword_no,
        headword: cur.headword, wordClass: cur.word_class, meaning: cur.meaning,
        appro: cur.appro, useYn: cur.use_yn
      });
    },

    _syncDialects: function () {
      var self = this, data = this._data, snap = this._snapshot;
      var hn = (data.headwords[0] && data.headwords[0].headword_no) || this._headwordNo;
      var snapById = {}; snap.dialects.forEach(function (d) { snapById[d.hd_id] = d; });
      var curById = {}; data.dialects.forEach(function (d) { curById[d.hd_id] = d; });

      var ops = [];
      // 생성
      data.dialects.forEach(function (d) {
        if (snapById[d.hd_id]) return;
        ops.push(function () {
          return postJSON('/dialect/save', {
            mode: 'C', headwordNo: hn, word: d.word,
            mutationGroup: d.mutation_group, mutationSeq: d.mutation_seq,
            mapSymbolId: d.map_symbol_id, faceColor: d.face_color, symbolColor: d.symbol_color
          }).then(function (r) {
            if (r && r.ok && r.hdId) self._idMap.hd[d.hd_id] = String(r.hdId);
            else throw new Error((r && r.message) || '지역어 등록 실패');
          });
        });
      });
      // 수정
      data.dialects.forEach(function (d) {
        var s = snapById[d.hd_id];
        if (!s) return;
        var diff = ['word', 'mutation_group', 'mutation_seq', 'map_symbol_id', 'face_color', 'symbol_color']
          .some(function (k) { return String(d[k] || '') !== String(s[k] || ''); });
        if (!diff) return;
        ops.push(function () {
          return postJSON('/dialect/save', {
            mode: 'M', hdId: self._tHd(d.hd_id), headwordNo: hn, word: d.word,
            mutationGroup: d.mutation_group, mutationSeq: d.mutation_seq,
            mapSymbolId: d.map_symbol_id, faceColor: d.face_color, symbolColor: d.symbol_color
          });
        });
      });
      // 삭제
      snap.dialects.forEach(function (s) {
        if (curById[s.hd_id]) return;
        ops.push(function () {
          return postJSON('/dialect/save', { mode: 'D', hdId: self._tHd(s.hd_id) })
            .catch(function () { /* 이미 삭제됨 등 무시 */ });
        });
      });
      return self._runSeq(ops);
    },

    _syncRegions: function () {
      var self = this, data = this._data, snap = this._snapshot;
      var hn = (data.headwords[0] && data.headwords[0].headword_no) || this._headwordNo;
      var snapById = {}; snap.regions.forEach(function (r) { snapById[r.hdr_id] = r; });
      var curById = {}; data.regions.forEach(function (r) { curById[r.hdr_id] = r; });

      var ops = [];
      // 생성
      data.regions.forEach(function (r) {
        if (snapById[r.hdr_id]) return;
        ops.push(function () {
          return postJSON('/dialect/region/save', {
            mode: 'C', hdId: self._tHd(r.hd_id), headwordNo: hn, word: r.word,
            regionId: r.region_id, regionNm: r.region_nm
          }).then(function (res) {
            if (res && res.ok && res.hdrId) self._idMap.hdr[r.hdr_id] = String(res.hdrId);
            else throw new Error((res && res.message) || '지역 저장 실패');
          });
        });
      });
      // 삭제
      snap.regions.forEach(function (s) {
        if (curById[s.hdr_id]) return;
        ops.push(function () {
          return postJSON('/dialect/region/save', { mode: 'D', hdrId: self._tHdr(s.hdr_id) })
            .catch(function () { /* dialect 삭제 시 cascade 등 무시 */ });
        });
      });
      return self._runSeq(ops);
    },

    _runSeq: function (ops) {
      return ops.reduce(function (p, op) { return p.then(op); }, Promise.resolve());
    },

    /** 강제 즉시 플러시 (완료 저장 버튼 등) */
    flushNow: function () {
      if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
      this._flush();
    }
  };

  global.AdminMapBackend = Backend;
})(window);
