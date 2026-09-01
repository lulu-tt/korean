/*
 * gen_nkorea_municipalities.js
 * ── GADM 4.1 북한(PRK) 레벨2 → 프론트 경계 데이터(nkorea-municipalities.js) 생성기
 *
 * [원본 받기]
 *   curl -o gadm_PRK_2.json.zip \
 *     "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PRK_2.json.zip"
 *   unzip gadm_PRK_2.json.zip           # → gadm41_PRK_2.json
 *
 * [실행]  node gen_nkorea_municipalities.js
 *   → nkorea-municipalities.js (window.NKOREA_MUNICIPALITIES + KOREA_MUNICIPALITIES 병합 IIFE)
 *   생성 후 저장소 루트로 복사해 사용.
 *
 * [조정 포인트]
 *   - KO           : 로마자(NAME_2) → 한글 지명 매핑. 미확정은 생략(로마자 폴백).
 *   - SIDO / SIDO_OVERRIDE : 도명 표기·GADM 오분류 보정.
 *   - EPS          : Douglas–Peucker 단순화 강도(클수록 가벼움/거침).
 *   - 좌표 3자리 반올림, WaterBody 아티팩트 제거.
 *
 * 출처: GADM 4.1 (https://gadm.org) — 학술/비상업 이용 라이선스 확인 필요.
 */
const fs = require('fs');
const SRC = process.argv[2] || 'gadm41_PRK_2.json';
const OUT = 'nkorea-municipalities.js';

// NL_NAME_1(도) → 표시용 시도명
const SIDO = {
  '자강도': '자강도', '함경북도': '함경북도', '함경남도': '함경남도',
  '황해북도': '황해북도', '황해남도': '황해남도', '강원도': '강원도',
  '평안북도': '평안북도', '평안남도': '평안남도', '평양직할시': '평양시',
  '라선직할시': '라선특별시', '량강도': '양강도',
  '개성공업지구': '개성특별시', '금강산관광지구': '강원도',
  '신의주특별행정구': '평안북도'
};

// NAME_2(로마자) → 한글 지명. 미확정은 생략(로마자 폴백).
const KO = {
  // 자강도
  "Ch'osan":'초산군', 'Changgang':'장강군', 'Chasŏng':'자성군', "Chŏnch'ŏn":'전천군',
  'Chunggang':'중강군', "Hŭich'ŏn":'희천시', "Hwap'yŏng":'화평군', 'Kanggye':'강계시',
  "Kop'ung":'고풍군', "Manp'o":'만포시', 'Rangrim':'랑림군', 'Ryongrim':'룡림군',
  'Sijung':'시중군', 'Sŏnggan':'성간군', 'Songwŏn':'송원군', 'Tongsin':'동신군',
  'Usi':'우시군', 'Wiwŏn':'위원군',
  // 함경북도
  "Ch'ŏngjin":'청진시', 'Hoeryŏng':'회령시', 'Hwadae':'화대군', 'Hwasŏng':'화성군',
  'Kilchu':'길주군', "Kimch'aek":'김책시', 'Kyŏngsŏng':'경성군', 'Musan':'무산군',
  "Myŏngch'ŏn":'명천군', 'Onsŏng':'온성군', 'Ŏrang':'어랑군', 'Puryŏng':'부령군',
  'Puyun':'부윤군', 'Saebyŏl':'새별군', 'Ŭndŏk':'은덕군', 'Yŏnsa':'연사군',
  // 함경남도
  "Chŏngp'yŏng":'정평군', 'Dachon':'단천시', 'Doksong':'덕성군', 'Hamhŭng':'함흥시', 'Hamju':'함주군',
  "Hŏch'ŏn":'허천군', 'Hongwŏn':'홍원군', 'Jangjin':'장진군', 'Kowŏn':'고원군',
  'Kŭmho':'금호군', 'Kŭmya':'금야군', 'Pujŏn':'부전군', "Pukch'ŏng":'북청군',
  'Rakwon':'락원군', 'Riwŏn':'리원군', 'Sinhŭng':'신흥군', "Sinp'o":'신포시',
  'Sudong':'수동군', 'Yodŏk':'요덕군', 'Yŏnggwang':'영광군',
  // 황해북도
  'Hwangju':'황주군', 'Kaesŏng':'개성시', 'Koksan':'곡산군', "Kŭmch'ŏn":'금천군',
  "P'yŏngsan":'평산군', 'Pongsan':'봉산군', 'Rinsan':'린산군', 'Sariwŏn':'사리원시',
  "Sin'gye":'신계군', "Sinp'yŏng":'신평군', 'Songhu':'서흥군', 'Songrim':'송림시', 'Suan':'수안군',
  "T'osan":'토산군', "Ŭnp'a":'은파군', 'Yŏnsan':'연산군', 'Yŏntan':'연탄군',
  // 황해남도
  'Anak':'안악군', "Ch'ŏngdan":'청단군', 'Chaeryŏng':'재령군', 'Changyŏn':'장연군',
  'Haeju':'해주시', "Kangry'ŏng":'강령군', 'Kwail':'과일군', 'Ongjin':'옹진군',
  "Paekch'ŏn":'배천군', "Pongch'ŏn":'봉천군', "Pyŏksŏng":'벽성군', 'Ryongyŏn':'룡연군', "Samch'ŏn":'삼천군',
  "Sinch'ŏn":'신천군', 'Sinwŏn':'신원군', 'Songhwa':'송화군', "T'aet'an":'태탄군',
  "Ŭnch'ŏn":'은천군', 'Ŭnryul':'은률군', 'Yonan':'연안군',
  // 개성공업지구
  'Jangpung':'장풍군', 'Kaepung':'개풍군', 'Panmun':'판문군',
  // 강원도(북)
  'Anbyŏn':'안변군', "Ch'angdo":'창도군', "Ch'ŏnnae":'천내군', "Ch'ŏrwŏn":'철원군',
  'Hoeyang':'회양군', 'Ichŏn':'이천군', 'Kimhwa':'김화군', 'Kosan':'고산군',
  'Kosŏng':'고성군', 'Munchŏn':'문천시', "P'an'gyo":'판교군', "P'yŏnggang":'평강군',
  'Pŏptong':'법동군', "Sep'o":'세포군', "T'ongch'ŏn":'통천군', 'Wŏnsan':'원산시',
  // 금강산
  'Kumgangsan':'금강군',
  // 평안북도
  'Byokdong':'벽동군', "Ch'angsŏng":'창성군', "Ch'ŏlsan":'철산군', "Ch'ŏnma":'천마군',
  'Chŏngju-si':'정주시', 'Daengwan':'대관군', 'Dongrim':'동림군', 'Hyangsan':'향산군',
  'Kujang':'구장군', 'Kusŏng':'구성시', 'Kwaksan':'곽산군', 'Nyŏngbyŏn':'녕변군',
  "P'ihyŏn":'피현군', "Pakch'ŏn":'박천군', "Ryongch'ŏn":'룡천군', 'Sakju':'삭주군',
  'Sindo':'신도군', "Sŏnch'ŏn":'선천군', "T'aech'ŏn":'태천군', "Tongch'ang":'동창군',
  'Ŭiju':'의주군', 'Unjŏn':'운전군', 'Unsan':'운산군', 'Yŏmju':'염주군',
  // 평안남도
  'Anju':'안주시', "Ch'ŏllima":'천리마군', "Ch'ŏngnam":'청남군', 'Haichang':'회창군', 'Jungsan':'증산군',
  "Kaech'ŏn":'개천시', 'Kangsŏ':'강서군', 'Maengsan':'맹산군', 'Mundŏk':'문덕군',
  'Nyongwon':'녕원군', "Onch'ŏn":'온천군', "P'yŏngsŏng":'평성시', "P'yŏngwŏn":'평원군',
  "Pukch'ang":'북창군', 'Ryonggang':'룡강군', 'Sinyang':'신양군', "Sŏngch'ŏn":'성천군',
  "Sukch'ŏn":'숙천군', "Sunch'ŏn":'순천시', 'Taedong':'대동군', 'Taehŭng':'대흥군',
  "Tŏkch'ŏn":'덕천시', 'Tŭkchang':'득장군', 'Ŭnjŏng':'은정구역', 'Ŭnsan':'은산군', 'Yangdŏk':'양덕군',
  'Waudo':'와우도구역', 'Hanggu':'항구구역', 'Daean':'대안구역',
  // 평양직할시
  'Chunghwa':'중화군', 'Jong':'중구역', 'Kangdong':'강동군', 'Kangnam':'강남군', 'Pyongyang':'평양시', 'Sangwŏn':'상원군',
  // 라선
  'Rajin':'라진구역', 'Sŏnbong':'선봉군',
  // 량강도
  'Hyesan':'혜산시', 'Kapsan':'갑산군', 'Kimhyŏnggwŏn':'김형권군', 'Kimhyŏngjik':'김형직군',
  'Kimjŏngsuk':'김정숙군', "P'ungsŏ":'풍서군', 'Paegam':'백암군', "Poch'ŏn":'보천군',
  'Samjiyon':'삼지연시', 'Samsu':'삼수군', 'Taehongdan':'대홍단군', 'Unhŭng':'운흥군',
  // 신의주
  'Sinŭiju':'신의주시'
};

// GADM 이 평안남도에 잘못 넣은 남포특별시 구역들 — 시도 보정
const SIDO_OVERRIDE = { 'Waudo': '남포특별시', 'Hanggu': '남포특별시', 'Daean': '남포특별시' };

// 제거할 아티팩트
const DROP = new Set(['WaterBody']);

const r3 = n => Math.round(n * 1000) / 1000;

function dp(pts, eps) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = dp(pts.slice(0, idx + 1), eps);
    const r = dp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}
function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (!L2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function cleanRing(ring, eps) {
  let r = ring.map(c => [r3(c[0]), r3(c[1])]);
  // dedup consecutive
  const d = [];
  for (const c of r) { const last = d[d.length - 1]; if (!last || last[0] !== c[0] || last[1] !== c[1]) d.push(c); }
  let s = dp(d, eps);
  if (s.length && (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1])) s.push(s[0]);
  return s;
}
function ringArea(ring) {
  let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]); return Math.abs(a / 2);
}

const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const EPS = 0.0018;
const MINAREA = 0.00015; // 아주 작은 섬/조각 제거
const out = [];
let hangul = 0, roman = 0; const romanList = [];

for (const ft of gj.features) {
  const p = ft.properties;
  if (DROP.has(p.NAME_2)) continue;
  const sido = SIDO_OVERRIDE[p.NAME_2] || SIDO[p.NL_NAME_1] || p.NL_NAME_1;
  let name = KO[p.NAME_2];
  if (name) hangul++; else { name = p.NAME_2; roman++; romanList.push(p.NL_NAME_1 + '/' + p.NAME_2); }

  // geometry: MultiPolygon → 단순화
  const polys = [];
  const src = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
  for (const poly of src) {
    const rings = [];
    for (let ri = 0; ri < poly.length; ri++) {
      const cleaned = cleanRing(poly[ri], EPS);
      if (cleaned.length < 4) continue;
      if (ri === 0 && ringArea(cleaned) < MINAREA) { rings.length = 0; break; } // 외곽이 너무 작으면 폴리곤 통째 skip
      rings.push(cleaned);
    }
    if (rings.length) polys.push(rings);
  }
  if (!polys.length) continue;

  const geometry = polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };

  out.push({
    type: 'Feature',
    geometry: geometry,
    properties: { name: name, code: p.GID_2, sido: sido, name_en: p.NAME_2, nk: true }
  });
}

const fc = { type: 'FeatureCollection', features: out };
const body =
`/* 북한 시·군 경계 (GADM 4.1 PRK level-2, mapshaper 대신 node DP eps=${EPS} 단순화)
 * 좌표 3자리 반올림. properties={name, code(GID_2), sido, name_en, nk:true}
 * WaterBody 아티팩트 제거. 일부 지명은 로마자 폴백(GADM에 한글명 부재).
 * KOREA_MUNICIPALITIES 끝에 append → 기존 muni_ 인덱스 ID 보존.
 */
window.NKOREA_MUNICIPALITIES = ${JSON.stringify(fc)};
(function () {
  function merge() {
    var K = window.KOREA_MUNICIPALITIES;
    if (!K || !K.features) return false;
    if (K.__nkMerged) return true;
    Array.prototype.push.apply(K.features, window.NKOREA_MUNICIPALITIES.features);
    K.__nkMerged = true;
    return true;
  }
  window.__nkMergeMunicipalities = merge;
  if (!merge()) {
    var t = setInterval(function () { if (merge()) clearInterval(t); }, 80);
    setTimeout(function () { clearInterval(t); }, 15000);
  }
})();
`;
fs.writeFileSync(OUT, body);
console.log('features out:', out.length, '(hangul', hangul, '/ roman', roman + ')');
console.log('roman fallback:', romanList.join(', '));
console.log('bytes:', fs.statSync(OUT).size);
