/*
 * gen_nkorea_municipalities.js
 * ── geoBoundaries 북한(PRK) ADM2(시·군) → 프론트 경계 데이터(nkorea-municipalities.js)
 *
 * [원본 받기]  geoBoundaries API 로 다운로드 URL 조회 후 GeoJSON 저장
 *   curl -sSL "https://www.geoboundaries.org/api/current/gbOpen/PRK/ADM2/" | \
 *     node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).gjDownloadURL))'
 *   curl -sSL "<위 URL>" -o gb_PRK_ADM2.geojson
 *   # 도(시도) 판정용으로 저장소의 skorea-provinces.js 도 필요
 *
 * [실행]  node gen_nkorea_municipalities.js [gb_PRK_ADM2.geojson]
 *
 * 출처: geoBoundaries (geoboundaries.org), ADM2 원자료 WFP·OCHA ROAP
 * 라이선스: CC BY 3.0 IGO (출처표기 시 상업 이용 가능)
 * 시·군 도(sido)는 skorea-provinces.js 의 북한 도 폴리곤에 point-in-polygon 으로 배정.
 * 한글 지명은 shapeName(로마자) → 한글 수작업 매핑(KO). 좌표 3자리 반올림 + DP 단순화.
 */
const fs = require('fs');
const SRC = process.argv[2] || 'gb_PRK_ADM2.geojson';
const OUT = 'nkorea-municipalities.js';
global.window = {};
require('./skorea-provinces.js');
const PROV = window.KOREA_PROVINCES;
const NK_IDX = [17,18,19,20,21,22,23,24,25,26,27];

// shapeName(로마자) → 한글 지명
const KO = {
  // 강원도
  'Anbyon':'안변군','Changdo':'창도군','Cholwon':'철원군','Chonnae':'천내군','Hoeyang':'회양군',
  'Ichon':'이천군','Kimhwa':'김화군','Kosan':'고산군','Kosong':'고성군','Kowon':'고원군',
  'Kumgang':'금강군','Kumya':'금야군','Munchon City':'문천시','Phangyo':'판교군','Phyonggang':'평강군',
  'Popdong':'법동군','Sepho':'세포군','Sinkye':'신계군','Sinphyong':'신평군','Thongchon':'통천군',
  'Thosan':'토산군','Wonsan City':'원산시','Yangdok':'양덕군',
  // 남포시
  'Chollima':'천리마군','Jungsan':'증산군','Kangso':'강서군','Nampo City':'남포시','Onchon':'온천군',
  'Pyongyang':'평양시','Ryonggang':'룡강군','Taean':'대안군',
  // 량강도
  'Hochon':'허천군','Hyesan City':'혜산시','Kabsan':'갑산군','Kim Hyong Gwon':'김형권군','Paekam':'백암군',
  'Phungso':'풍서군','Pochon':'보천군','Samjiyon':'삼지연시','Samsu':'삼수군','Toksong':'덕성군','Unhung':'운흥군',
  // 자강도
  'Chosan':'초산군','Huichon City':'희천시','Hwaphyong':'화평군','Hyangsan':'향산군','Janggang':'장강군',
  'Jangjin':'장진군','Jasong':'자성군','Jonchon':'전천군','Junggang':'중강군','Kanggye City':'강계시',
  'Kim Hyong Jik':'김형직군','Kim Jong Suk':'김정숙군','Kophung':'고풍군','Manpho City':'만포시','Pujon':'부전군',
  'Rangrim':'랑림군','Ryongrim':'룡림군','Sijung':'시중군','Songgan':'성간군','Songwon':'송원군',
  'Taehung':'대흥군','Tongsin':'동신군','Usi':'우시군','Wiwon':'위원군',
  // 평안남도
  'Chongnam':'청남군','Nyongwon':'녕원군','Pukchang':'북창군','Pyongwon':'평원군','Sinyang':'신양군',
  'Songchon':'성천군','Sukchon':'숙천군','Sunchon City':'순천시','Tokchon City':'덕천시','Tukjang':'득장군',
  // 평안북도
  'Anju City':'안주시','Changsong':'창성군','Cholsan':'철산군','Chonma':'천마군','Jongju City':'정주시',
  'Kaechon City':'개천시','Kujang':'구장군','Kusong City':'구성시','Kwaksan':'곽산군','Mundok':'문덕군',
  'Nyongbyon':'녕변군','Pakchon':'박천군','Phihyon':'피현군','Pyokdong':'벽동군','Ryongchon':'룡천군',
  'Sakju':'삭주군','Sindo':'신도군','Sinuiju City':'신의주시','Sonchon':'선천군','Taegwan':'대관군',
  'Thaechon':'태천군','Tongchang':'동창군','Tongrim':'동림군','Uiju':'의주군','Unjon':'운전군','Yomju':'염주군',
  // 평양시
  'Pyongsong City':'평성시','Taedong':'대동군','Unjong Dist.':'은정구역',
  // 함경남도
  'Hamhung City':'함흥시','Hamju':'함주군','Hongwon':'홍원군','Jongphyong':'정평군','Kumho':'금호군',
  'Maengsan':'맹산군','Pukchong':'북청군','Rakwon':'락원군','Riwon':'리원군','Sinhung':'신흥군',
  'Sinpho City':'신포시','Sudong':'수동군','Yodok':'요덕군','Yonggwang':'영광군',
  // 함경북도
  'Chongjin City':'청진시','Hoeryong City':'회령시','Hwadae':'화대군','Kilju':'길주군','Kim Chaek City':'김책시',
  'Kyonghung':'경흥군','Kyongsong':'경성군','Kyongwon':'경원군','Musan':'무산군','Myongchon':'명천군',
  'Myonggan':'명간군','Onsong':'온성군','Orang':'어랑군','Puryong':'부령군','Rason City':'라선시',
  'Taehongdan':'대홍단군','Tanchon City':'단천시','Yonsa':'연사군',
  // 황해남도
  'Anak':'안악군','Chongdan':'청단군','Haeju City':'해주시','Jangyon':'장연군','Kangryong':'강령군',
  'Kwail':'과일군','Ongjin':'옹진군','Pyoksong':'벽성군','Ryongyon':'룡연군','Samchon':'삼천군',
  'Sinchon':'신천군','Sinwon':'신원군','Songhwa':'송화군','Thaethan':'태탄군','Unchon':'은천군',
  'Unryul':'은률군','Yonan':'연안군',
  // 황해북도
  'Hoechang':'회창군','Hwangju':'황주군','Jaerong':'재령군','Jangphung':'장풍군','Junghwa':'중화군',
  'Kaesong City':'개성시','Kangdong':'강동군','Kangnam':'강남군','Koksan':'곡산군','Kumchon':'금천군',
  'Paechon':'배천군','Phyongsan':'평산군','Pongchon':'봉천군','Pongsan':'봉산군','Rinsan':'린산군',
  'Sangwon':'상원군','Sariwon City':'사리원시','Sohung':'서흥군','Songrim City':'송림시','Suan':'수안군',
  'Unpha':'은파군','Yonsan':'연산군','Yonthan':'연탄군'
  // 'Unsan' 은 동명(자강/평남) → 아래에서 도로 구분
};

// ── 도(sido) 판정: point-in-polygon ──
function ringContains(ring,x,y){let ins=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi))ins=!ins;}return ins;}
function polyC(c,x,y){if(!ringContains(c[0],x,y))return false;for(let h=1;h<c.length;h++)if(ringContains(c[h],x,y))return false;return true;}
function geomC(g,x,y){if(g.type==='Polygon')return polyC(g.coordinates,x,y);if(g.type==='MultiPolygon')return g.coordinates.some(pc=>polyC(pc,x,y));return false;}
function repPoint(g){let best=null,bestA=-1;const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;for(const poly of polys){const r=poly[0];let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);a=Math.abs(a/2);if(a>bestA){bestA=a;best=r;}}let cx=0,cy=0;for(const c of best){cx+=c[0];cy+=c[1];}return {c:[cx/best.length,cy/best.length],ring:best};}
function sidoOf(f){
  const rp=repPoint(f.geometry);
  const tests=[rp.c,...rp.ring.filter((_,i)=>i%20===0)];
  for(const idx of NK_IDX){const pg=PROV.features[idx].geometry;if(tests.some(t=>geomC(pg,t[0],t[1])))return PROV.features[idx].properties.name;}
  let bd=1e9,bn=null;for(const idx of NK_IDX){const pc=repPoint(PROV.features[idx].geometry).c;const d=Math.hypot(pc[0]-rp.c[0],pc[1]-rp.c[1]);if(d<bd){bd=d;bn=PROV.features[idx].properties.name;}}return bn;
}

// ── 단순화 ──
const r3=n=>Math.round(n*1000)/1000;
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;if(!L2)return Math.hypot(p[0]-a[0],p[1]-a[1]);let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
function dp(pts,eps){if(pts.length<3)return pts;let dm=0,idx=0;const a=pts[0],b=pts[pts.length-1];for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dm){dm=d;idx=i;}}if(dm>eps){return dp(pts.slice(0,idx+1),eps).slice(0,-1).concat(dp(pts.slice(idx),eps));}return [a,b];}
function cleanRing(ring,eps){let r=ring.map(c=>[r3(c[0]),r3(c[1])]);const d=[];for(const c of r){const l=d[d.length-1];if(!l||l[0]!==c[0]||l[1]!==c[1])d.push(c);}let s=dp(d,eps);if(s.length&&(s[0][0]!==s[s.length-1][0]||s[0][1]!==s[s.length-1][1]))s.push(s[0]);return s;}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);return Math.abs(a/2);}

const gj=JSON.parse(fs.readFileSync(SRC,'utf8'));
const EPS=0.0018, MINAREA=0.00015;
const out=[]; let hangul=0,roman=0; const romanList=[];

for(const f of gj.features){
  const sn=f.properties.shapeName;
  const sido=sidoOf(f);
  let name=KO[sn];
  if(sn==='Unsan') name=(sido==='평안남도')?'은산군':'운산군';
  if(name) hangul++; else { name=sn; roman++; romanList.push(sido+'/'+sn); }

  const polys=[]; const src=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const poly of src){
    const rings=[];
    for(let ri=0;ri<poly.length;ri++){
      const cr=cleanRing(poly[ri],EPS);
      if(cr.length<4) continue;
      if(ri===0 && ringArea(cr)<MINAREA){rings.length=0;break;}
      rings.push(cr);
    }
    if(rings.length) polys.push(rings);
  }
  if(!polys.length) continue;
  const geometry=polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys};
  out.push({type:'Feature',geometry:geometry,properties:{name:name,code:f.properties.shapeID,sido:sido,name_en:sn,nk:true}});
}

const fc={type:'FeatureCollection',features:out};
const body=
`/* 북한 시·군 경계 (geoBoundaries gbOpen PRK ADM2 · WFP/OCHA · CC BY 3.0 IGO)
 * ${out.length}개. 좌표 3자리 반올림 + DP(eps=${EPS}) 단순화.
 * properties={name(한글), code(shapeID), sido, name_en(로마자), nk:true}
 * sido 는 skorea-provinces.js 북한 도 폴리곤 point-in-polygon 배정(경계 근처는 오차 가능).
 * KOREA_MUNICIPALITIES 끝에 append → 기존 muni_ 인덱스 ID 보존.
 * 생성: scripts/gen_nkorea_municipalities.js
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
fs.writeFileSync(OUT,body);
console.log('features:',out.length,'(hangul',hangul,'/ roman',roman+')');
if(romanList.length) console.log('roman:',romanList.join(', '));
console.log('bytes:',fs.statSync(OUT).size);
