/**
 * my-map-store.js — 나만의 지도 프로토 저장소 (localStorage)
 * ---------------------------------------------------------------------------
 * DB 연동은 최종 단계. 지금은 기존 dialect_local.db 컬럼명·관계를 그대로 흉내 내
 * 나중에 INSERT/UPDATE 매핑만 붙이면 되도록 한다.
 *
 * 테이블 대응:
 *   kd_headword                 → headwords[]
 *   tb_headword_dialect         → dialects[]
 *   tb_headword_dialect_region  → regions[]
 *   tb_map_symbol (참조)        → SYMBOL_CATALOG 상수
 */
(function (global) {
  'use strict';

  var KEYS = {
    data: 'myMap.proto.v2',
    session: 'myMap.sessionUser',
    coach: 'myMap.coachDismissed',
    selectedHeadwordNo: 'myMap.selectedHeadwordNo'
  };

  var WORD_CLASS_OPTIONS = [
    '명사', '대명사', '수사', '조사', '동사', '형용사',
    '관형사', '부사', '감탄사', '접사', '구'
  ];

  /**
   * 면색 선택 팔레트 (~70색)
   * UI 선택용 hex / 저장은 hexToRgb → "R, G, B" (DB face_color)
   */
  var FACE_PALETTE = [
    // 빨강~분홍
    '#ef4444', '#f87171', '#dc2626', '#b91c1c', '#e11d48', '#f43f5e', '#fb7185', '#be123c',
    // 주황~노랑
    '#f97316', '#fb923c', '#ea580c', '#c2410c', '#f59e0b', '#fbbf24', '#eab308', '#facc15',
    // 연두~초록
    '#84cc16', '#a3e635', '#65a30d', '#22c55e', '#4ade80', '#16a34a', '#15803d', '#10b981',
    // 청록~하늘
    '#14b8a6', '#2dd4bf', '#0d9488', '#06b6d4', '#22d3ee', '#0891b2', '#0ea5e9', '#38bdf8',
    // 파랑
    '#3b82f6', '#60a5fa', '#2563eb', '#1d4ed8', '#1e40af', '#6366f1', '#818cf8', '#4f46e5',
    // 보라~자주
    '#8b5cf6', '#a78bfa', '#7c3aed', '#6d28d9', '#a855f7', '#c084fc', '#d946ef', '#e879f9',
    // 분홍~마젠타
    '#ec4899', '#f472b6', '#db2777', '#be185d',
    // 갈색~카키
    '#a16207', '#ca8a04', '#92400e', '#b45309', '#78350f', '#a3a3a3',
    // 회색~흑
    '#f8fafc', '#e2e8f0', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a',
    // 추가 대비색
    '#7f1d1d', '#365314', '#164e63', '#1e3a8a', '#4a044e', '#831843', '#713f12', '#3f3f46'
  ];

  /** 그룹 자동 배정용 (팔레트 앞쪽 사용) */
  var AUTO_RGB = FACE_PALETTE.slice(0, 12).map(function (hex) {
    // store as rgb string via simple parse later in nextFaceColor
    return hex;
  });

  /**
   * 상징 부호 카탈로그 — 운영에서 쓰는 실제 심볼 마스터(PNG) 170종.
   * file_nm 은 흰색 실루엣 마스터(symbol_mask/{nnn}.png)로, 그룹 면색으로 틴트해 사용.
   * map_symbol_id 1~170 = 마스터 stem (001~170).
   */
  var SYMBOL_CATALOG = [
    { map_symbol_id: '1', file_nm: '1452276819394.png', label: '부호 1' },
    { map_symbol_id: '2', file_nm: '1452277058224.png', label: '부호 2' },
    { map_symbol_id: '3', file_nm: '1452277944327.png', label: '부호 3' },
    { map_symbol_id: '4', file_nm: '1452277960983.png', label: '부호 4' },
    { map_symbol_id: '5', file_nm: '1452280833164.png', label: '부호 5' },
    { map_symbol_id: '6', file_nm: '1452280875541.png', label: '부호 6' },
    { map_symbol_id: '7', file_nm: '1452280885503.png', label: '부호 7' },
    { map_symbol_id: '8', file_nm: '1452280896049.png', label: '부호 8' },
    { map_symbol_id: '9', file_nm: '1452280907211.png', label: '부호 9' },
    { map_symbol_id: '10', file_nm: '1452280917357.png', label: '부호 10' },
    { map_symbol_id: '11', file_nm: '1452280929792.png', label: '부호 11' },
    { map_symbol_id: '12', file_nm: '1452280998527.png', label: '부호 12' },
    { map_symbol_id: '13', file_nm: '1452281013179.png', label: '부호 13' },
    { map_symbol_id: '14', file_nm: '1452281025724.png', label: '부호 14' },
    { map_symbol_id: '15', file_nm: '1452281040084.png', label: '부호 15' },
    { map_symbol_id: '16', file_nm: '1452281049680.png', label: '부호 16' },
    { map_symbol_id: '17', file_nm: '1452281059035.png', label: '부호 17' },
    { map_symbol_id: '18', file_nm: '1452281066408.png', label: '부호 18' },
    { map_symbol_id: '19', file_nm: '1452281078528.png', label: '부호 19' },
    { map_symbol_id: '20', file_nm: '1452281087981.png', label: '부호 20' },
    { map_symbol_id: '21', file_nm: '1452281095563.png', label: '부호 21' },
    { map_symbol_id: '22', file_nm: '1452281102610.png', label: '부호 22' },
    { map_symbol_id: '23', file_nm: '1452281111082.png', label: '부호 23' },
    { map_symbol_id: '24', file_nm: '1452281118462.png', label: '부호 24' },
    { map_symbol_id: '25', file_nm: '1452281125751.png', label: '부호 25' },
    { map_symbol_id: '26', file_nm: '1452281863400.png', label: '부호 26' },
    { map_symbol_id: '27', file_nm: '1452281876525.png', label: '부호 27' },
    { map_symbol_id: '28', file_nm: '1452281890053.png', label: '부호 28' },
    { map_symbol_id: '29', file_nm: '1452281898165.png', label: '부호 29' },
    { map_symbol_id: '30', file_nm: '1452281905603.png', label: '부호 30' },
    { map_symbol_id: '31', file_nm: '1452281945250.png', label: '부호 31' },
    { map_symbol_id: '32', file_nm: '1452281957043.png', label: '부호 32' },
    { map_symbol_id: '33', file_nm: '1452282053908.png', label: '부호 33' },
    { map_symbol_id: '34', file_nm: '1452282071939.png', label: '부호 34' },
    { map_symbol_id: '35', file_nm: '1452282082093.png', label: '부호 35' },
    { map_symbol_id: '36', file_nm: '1452282093879.png', label: '부호 36' },
    { map_symbol_id: '37', file_nm: '1452282107365.png', label: '부호 37' },
    { map_symbol_id: '38', file_nm: '1452282120249.png', label: '부호 38' },
    { map_symbol_id: '39', file_nm: '1452282135518.png', label: '부호 39' },
    { map_symbol_id: '40', file_nm: '1452282143481.png', label: '부호 40' },
    { map_symbol_id: '41', file_nm: '1452282158274.png', label: '부호 41' },
    { map_symbol_id: '42', file_nm: '1452282165620.png', label: '부호 42' },
    { map_symbol_id: '43', file_nm: '1452282179656.png', label: '부호 43' },
    { map_symbol_id: '44', file_nm: '1452282190825.png', label: '부호 44' },
    { map_symbol_id: '45', file_nm: '1452282220551.png', label: '부호 45' },
    { map_symbol_id: '46', file_nm: '1452282227982.png', label: '부호 46' },
    { map_symbol_id: '47', file_nm: '1452282235120.png', label: '부호 47' },
    { map_symbol_id: '48', file_nm: '1452282246014.png', label: '부호 48' },
    { map_symbol_id: '49', file_nm: '1452282265996.png', label: '부호 49' },
    { map_symbol_id: '50', file_nm: '1452282276132.png', label: '부호 50' },
    { map_symbol_id: '51', file_nm: '1452282287086.png', label: '부호 51' },
    { map_symbol_id: '52', file_nm: '1452282294265.png', label: '부호 52' },
    { map_symbol_id: '53', file_nm: '1452282304861.png', label: '부호 53' },
    { map_symbol_id: '54', file_nm: '1452282316530.png', label: '부호 54' },
    { map_symbol_id: '55', file_nm: '1452282345681.png', label: '부호 55' },
    { map_symbol_id: '56', file_nm: '1452282390982.png', label: '부호 56' },
    { map_symbol_id: '57', file_nm: '1452282422100.png', label: '부호 57' },
    { map_symbol_id: '58', file_nm: '1452282433402.png', label: '부호 58' },
    { map_symbol_id: '59', file_nm: '1452282440366.png', label: '부호 59' },
    { map_symbol_id: '60', file_nm: '1452282449261.png', label: '부호 60' },
    { map_symbol_id: '61', file_nm: '1452282456533.png', label: '부호 61' },
    { map_symbol_id: '62', file_nm: '1452282477822.png', label: '부호 62' },
    { map_symbol_id: '63', file_nm: '1452282485302.png', label: '부호 63' },
    { map_symbol_id: '64', file_nm: '1452282493424.png', label: '부호 64' },
    { map_symbol_id: '65', file_nm: '1452282501029.png', label: '부호 65' },
    { map_symbol_id: '66', file_nm: '1452282519412.png', label: '부호 66' },
    { map_symbol_id: '67', file_nm: '1452282535279.png', label: '부호 67' },
    { map_symbol_id: '68', file_nm: '1452282551779.png', label: '부호 68' },
    { map_symbol_id: '69', file_nm: '1452282574784.png', label: '부호 69' },
    { map_symbol_id: '70', file_nm: '1452282581697.png', label: '부호 70' },
    { map_symbol_id: '71', file_nm: '1452282602253.png', label: '부호 71' },
    { map_symbol_id: '72', file_nm: '1452282610074.png', label: '부호 72' },
    { map_symbol_id: '73', file_nm: '1452282616364.png', label: '부호 73' },
    { map_symbol_id: '74', file_nm: '1452282623594.png', label: '부호 74' },
    { map_symbol_id: '75', file_nm: '1452282631073.png', label: '부호 75' },
    { map_symbol_id: '76', file_nm: '1452282638271.png', label: '부호 76' },
    { map_symbol_id: '77', file_nm: '1452282646250.png', label: '부호 77' },
    { map_symbol_id: '78', file_nm: '1452282659862.png', label: '부호 78' },
    { map_symbol_id: '79', file_nm: '1452282666725.png', label: '부호 79' },
    { map_symbol_id: '80', file_nm: '1452282680193.png', label: '부호 80' },
    { map_symbol_id: '81', file_nm: '1452282693137.png', label: '부호 81' },
    { map_symbol_id: '82', file_nm: '1452282698726.png', label: '부호 82' },
    { map_symbol_id: '83', file_nm: '1452282705614.png', label: '부호 83' },
    { map_symbol_id: '84', file_nm: '1452282728329.png', label: '부호 84' },
    { map_symbol_id: '85', file_nm: '1452282736568.png', label: '부호 85' },
    { map_symbol_id: '86', file_nm: '1452282743722.png', label: '부호 86' },
    { map_symbol_id: '87', file_nm: '1452282756050.png', label: '부호 87' },
    { map_symbol_id: '88', file_nm: '1452282770726.png', label: '부호 88' },
    { map_symbol_id: '89', file_nm: '1452282784828.png', label: '부호 89' },
    { map_symbol_id: '90', file_nm: '1452282792316.png', label: '부호 90' },
    { map_symbol_id: '95', file_nm: '1452282876582.png', label: '부호 95' },
    { map_symbol_id: '98', file_nm: '1452282902754.png', label: '부호 98' },
    { map_symbol_id: '99', file_nm: '1452282912291.png', label: '부호 99' },
    { map_symbol_id: '100', file_nm: '1452282935506.png', label: '부호 100' },
    { map_symbol_id: '101', file_nm: '1452282942493.png', label: '부호 101' },
    { map_symbol_id: '102', file_nm: '1452282948915.png', label: '부호 102' },
    { map_symbol_id: '103', file_nm: '1452282960301.png', label: '부호 103' },
    { map_symbol_id: '104', file_nm: '1452282971887.png', label: '부호 104' },
    { map_symbol_id: '105', file_nm: '1452282981033.png', label: '부호 105' },
    { map_symbol_id: '106', file_nm: '1452282989587.png', label: '부호 106' },
    { map_symbol_id: '107', file_nm: '1452282996509.png', label: '부호 107' },
    { map_symbol_id: '108', file_nm: '1452283003848.png', label: '부호 108' },
    { map_symbol_id: '109', file_nm: '1452283017216.png', label: '부호 109' },
    { map_symbol_id: '110', file_nm: '1452283250890.png', label: '부호 110' },
    { map_symbol_id: '111', file_nm: '1452283257172.png', label: '부호 111' },
    { map_symbol_id: '112', file_nm: '1452283263261.png', label: '부호 112' },
    { map_symbol_id: '113', file_nm: '1452283269083.png', label: '부호 113' },
    { map_symbol_id: '114', file_nm: '1452283276513.png', label: '부호 114' },
    { map_symbol_id: '115', file_nm: '1452283283443.png', label: '부호 115' },
    { map_symbol_id: '116', file_nm: '1452283297952.png', label: '부호 116' },
    { map_symbol_id: '117', file_nm: '1452283308315.png', label: '부호 117' },
    { map_symbol_id: '118', file_nm: '1452283315678.png', label: '부호 118' },
    { map_symbol_id: '119', file_nm: '1452283322775.png', label: '부호 119' },
    { map_symbol_id: '120', file_nm: '1452283336268.png', label: '부호 120' },
    { map_symbol_id: '121', file_nm: '1452283350145.png', label: '부호 121' },
    { map_symbol_id: '122', file_nm: '1452283357133.png', label: '부호 122' },
    { map_symbol_id: '123', file_nm: '1452283369226.png', label: '부호 123' },
    { map_symbol_id: '124', file_nm: '1452283376074.png', label: '부호 124' },
    { map_symbol_id: '125', file_nm: '1452283391099.png', label: '부호 125' },
    { map_symbol_id: '126', file_nm: '1452283401070.png', label: '부호 126' },
    { map_symbol_id: '127', file_nm: '1452283408225.png', label: '부호 127' },
    { map_symbol_id: '128', file_nm: '1452283415246.png', label: '부호 128' },
    { map_symbol_id: '129', file_nm: '1452283426675.png', label: '부호 129' },
    { map_symbol_id: '130', file_nm: '1452283438952.png', label: '부호 130' },
    { map_symbol_id: '131', file_nm: '1452283450605.png', label: '부호 131' },
    { map_symbol_id: '132', file_nm: '1452283456811.png', label: '부호 132' },
    { map_symbol_id: '133', file_nm: '1452283462958.png', label: '부호 133' },
    { map_symbol_id: '134', file_nm: '1452283468198.png', label: '부호 134' },
    { map_symbol_id: '135', file_nm: '1452283475078.png', label: '부호 135' },
    { map_symbol_id: '136', file_nm: '1452283482924.png', label: '부호 136' },
    { map_symbol_id: '137', file_nm: '1452283490147.png', label: '부호 137' },
    { map_symbol_id: '138', file_nm: '1452283496360.png', label: '부호 138' },
    { map_symbol_id: '139', file_nm: '1452283503215.png', label: '부호 139' },
    { map_symbol_id: '140', file_nm: '1452283524030.png', label: '부호 140' },
    { map_symbol_id: '141', file_nm: '1452283529794.png', label: '부호 141' },
    { map_symbol_id: '142', file_nm: '1452283535816.png', label: '부호 142' },
    { map_symbol_id: '143', file_nm: '1452283546928.png', label: '부호 143' },
    { map_symbol_id: '144', file_nm: '1452283557206.png', label: '부호 144' },
    { map_symbol_id: '145', file_nm: '1452283563438.png', label: '부호 145' },
    { map_symbol_id: '146', file_nm: '1452283575324.png', label: '부호 146' },
    { map_symbol_id: '147', file_nm: '1452283581748.png', label: '부호 147' },
    { map_symbol_id: '148', file_nm: '1452283591160.png', label: '부호 148' },
    { map_symbol_id: '149', file_nm: '1452283603213.png', label: '부호 149' },
    { map_symbol_id: '150', file_nm: '1452283618338.png', label: '부호 150' },
    { map_symbol_id: '151', file_nm: '1452283628892.png', label: '부호 151' },
    { map_symbol_id: '152', file_nm: '1452283703476.png', label: '부호 152' },
    { map_symbol_id: '154', file_nm: '1452283728014.png', label: '부호 154' },
    { map_symbol_id: '155', file_nm: '1452283734860.png', label: '부호 155' },
    { map_symbol_id: '156', file_nm: '1452283741691.png', label: '부호 156' },
    { map_symbol_id: '157', file_nm: '1452283752053.png', label: '부호 157' },
    { map_symbol_id: '158', file_nm: '1452283759058.png', label: '부호 158' },
    { map_symbol_id: '159', file_nm: '1452283765663.png', label: '부호 159' },
    { map_symbol_id: '160', file_nm: '1452283771186.png', label: '부호 160' },
    { map_symbol_id: '161', file_nm: '1452283783571.png', label: '부호 161' },
    { map_symbol_id: '162', file_nm: '1452283802362.png', label: '부호 162' },
    { map_symbol_id: '163', file_nm: '1452283812516.png', label: '부호 163' },
    { map_symbol_id: '164', file_nm: '1452283829174.png', label: '부호 164' },
    { map_symbol_id: '165', file_nm: '1452283835705.png', label: '부호 165' },
    { map_symbol_id: '166', file_nm: '1452283847591.png', label: '부호 166' },
    { map_symbol_id: '167', file_nm: '1452283859259.png', label: '부호 167' },
    { map_symbol_id: '168', file_nm: '1452283869580.png', label: '부호 168' },
    { map_symbol_id: '169', file_nm: '1452283876776.png', label: '부호 169' },
    { map_symbol_id: '170', file_nm: '1452283882933.png', label: '부호 170' },
    { map_symbol_id: '171', file_nm: '1452283899665.png', label: '부호 171' },
    { map_symbol_id: '172', file_nm: '1452283905454.png', label: '부호 172' },
    { map_symbol_id: '173', file_nm: '1452283911594.png', label: '부호 173' },
    { map_symbol_id: '174', file_nm: '1452283917816.png', label: '부호 174' },
    { map_symbol_id: '175', file_nm: '1452283925713.png', label: '부호 175' },
    { map_symbol_id: '176', file_nm: '1452283935261.png', label: '부호 176' },
    { map_symbol_id: '177', file_nm: '1452283944215.png', label: '부호 177' },
    { map_symbol_id: '178', file_nm: '1452283953419.png', label: '부호 178' },
    { map_symbol_id: '179', file_nm: '1452283959775.png', label: '부호 179' },
    { map_symbol_id: '180', file_nm: '1452283970103.png', label: '부호 180' },
    { map_symbol_id: '181', file_nm: '1452284018951.png', label: '부호 181' },
    { map_symbol_id: '182', file_nm: '1452284080950.png', label: '부호 182' },
    { map_symbol_id: '183', file_nm: '1452284095377.png', label: '부호 183' },
    { map_symbol_id: '184', file_nm: '1452284102848.png', label: '부호 184' },
    { map_symbol_id: '185', file_nm: '1452284110178.png', label: '부호 185' },
    { map_symbol_id: '186', file_nm: '1452284116367.png', label: '부호 186' },
    { map_symbol_id: '187', file_nm: '1452284122365.png', label: '부호 187' },
    { map_symbol_id: '188', file_nm: '1452284131785.png', label: '부호 188' },
    { map_symbol_id: '189', file_nm: '1452284137682.png', label: '부호 189' },
    { map_symbol_id: '190', file_nm: '1452284144054.png', label: '부호 190' },
    { map_symbol_id: '191', file_nm: '1452284158989.png', label: '부호 191' },
    { map_symbol_id: '192', file_nm: '1452284170275.png', label: '부호 192' },
    { map_symbol_id: '193', file_nm: '1452284176639.png', label: '부호 193' },
    { map_symbol_id: '194', file_nm: '1452284187368.png', label: '부호 194' },
    { map_symbol_id: '195', file_nm: '1452284197921.png', label: '부호 195' },
    { map_symbol_id: '196', file_nm: '1452284205467.png', label: '부호 196' },
    { map_symbol_id: '197', file_nm: '1452284211623.png', label: '부호 197' },
    { map_symbol_id: '198', file_nm: '1452284217404.png', label: '부호 198' },
    { map_symbol_id: '199', file_nm: '1452284223401.png', label: '부호 199' },
    { map_symbol_id: '200', file_nm: '1452284233646.png', label: '부호 200' },
    { map_symbol_id: '201', file_nm: '1452284625452.png', label: '부호 201' },
    { map_symbol_id: '202', file_nm: '1452284636897.png', label: '부호 202' },
    { map_symbol_id: '203', file_nm: '1452284643069.png', label: '부호 203' },
    { map_symbol_id: '204', file_nm: '1452284648933.png', label: '부호 204' },
    { map_symbol_id: '205', file_nm: '1452284655089.png', label: '부호 205' },
    { map_symbol_id: '206', file_nm: '1452284664901.png', label: '부호 206' },
    { map_symbol_id: '207', file_nm: '1452284671798.png', label: '부호 207' },
    { map_symbol_id: '208', file_nm: '1452284677763.png', label: '부호 208' },
    { map_symbol_id: '209', file_nm: '1452284685084.png', label: '부호 209' },
    { map_symbol_id: '210', file_nm: '1452284713503.png', label: '부호 210' },
    { map_symbol_id: '211', file_nm: '1452284732651.png', label: '부호 211' },
    { map_symbol_id: '212', file_nm: '1452284739248.png', label: '부호 212' },
    { map_symbol_id: '213', file_nm: '1452284749368.png', label: '부호 213' },
    { map_symbol_id: '214', file_nm: '1452284757107.png', label: '부호 214' },
    { map_symbol_id: '215', file_nm: '1452284778386.png', label: '부호 215' },
    { map_symbol_id: '216', file_nm: '1452284786550.png', label: '부호 216' },
    { map_symbol_id: '217', file_nm: '1452284794221.png', label: '부호 217' },
    { map_symbol_id: '218', file_nm: '1452285361138.png', label: '부호 218' },
    { map_symbol_id: '219', file_nm: '1452285372700.png', label: '부호 219' },
    { map_symbol_id: '220', file_nm: '1452285378697.png', label: '부호 220' },
    { map_symbol_id: '221', file_nm: '1452285390217.png', label: '부호 221' },
    { map_symbol_id: '222', file_nm: '1452285396872.png', label: '부호 222' },
    { map_symbol_id: '223', file_nm: '1452285402695.png', label: '부호 223' },
    { map_symbol_id: '224', file_nm: '1452285408309.png', label: '부호 224' },
    { map_symbol_id: '225', file_nm: '1452285415223.png', label: '부호 225' },
    { map_symbol_id: '226', file_nm: '1452285428516.png', label: '부호 226' },
    { map_symbol_id: '227', file_nm: '1452285434114.png', label: '부호 227' },
    { map_symbol_id: '228', file_nm: '1452285439995.png', label: '부호 228' },
    { map_symbol_id: '229', file_nm: '1452285453846.png', label: '부호 229' },
    { map_symbol_id: '230', file_nm: '1452285460377.png', label: '부호 230' },
    { map_symbol_id: '231', file_nm: '1452285469114.png', label: '부호 231' },
    { map_symbol_id: '232', file_nm: '1452285475778.png', label: '부호 232' },
    { map_symbol_id: '233', file_nm: '1452285486149.png', label: '부호 233' },
    { map_symbol_id: '234', file_nm: '1452285492321.png', label: '부호 234' },
    { map_symbol_id: '235', file_nm: '1452285507514.png', label: '부호 235' },
    { map_symbol_id: '236', file_nm: '1452285519200.png', label: '부호 236' },
    { map_symbol_id: '237', file_nm: '1452285536025.png', label: '부호 237' },
    { map_symbol_id: '238', file_nm: '1452285542330.png', label: '부호 238' },
    { map_symbol_id: '239', file_nm: '1452285553267.png', label: '부호 239' },
    { map_symbol_id: '240', file_nm: '1452285564678.png', label: '부호 240' },
    { map_symbol_id: '241', file_nm: '1452285581612.png', label: '부호 241' },
    { map_symbol_id: '242', file_nm: '1452285647459.png', label: '부호 242' },
    { map_symbol_id: '243', file_nm: '1452285655213.png', label: '부호 243' },
    { map_symbol_id: '244', file_nm: '1452285661502.png', label: '부호 244' },
    { map_symbol_id: '245', file_nm: '1452285667999.png', label: '부호 245' },
    { map_symbol_id: '246', file_nm: '1452285675645.png', label: '부호 246' },
    { map_symbol_id: '247', file_nm: '1452285680818.png', label: '부호 247' },
    { map_symbol_id: '248', file_nm: '1452285686700.png', label: '부호 248' },
    { map_symbol_id: '249', file_nm: '1452285692655.png', label: '부호 249' },
    { map_symbol_id: '250', file_nm: '1452285701209.png', label: '부호 250' },
    { map_symbol_id: '251', file_nm: '1452285712904.png', label: '부호 251' },
    { map_symbol_id: '252', file_nm: '1452285718202.png', label: '부호 252' },
    { map_symbol_id: '253', file_nm: '1452285723783.png', label: '부호 253' },
    { map_symbol_id: '254', file_nm: '1452285730613.png', label: '부호 254' },
    { map_symbol_id: '255', file_nm: '1452285736270.png', label: '부호 255' },
    { map_symbol_id: '256', file_nm: '1452285745765.png', label: '부호 256' },
    { map_symbol_id: '257', file_nm: '1452285756669.png', label: '부호 257' },
    { map_symbol_id: '258', file_nm: '1452285764757.png', label: '부호 258' },
    { map_symbol_id: '259', file_nm: '1452285769939.png', label: '부호 259' },
    { map_symbol_id: '260', file_nm: '1452285779293.png', label: '부호 260' },
    { map_symbol_id: '261', file_nm: '1452285792877.png', label: '부호 261' },
    { map_symbol_id: '262', file_nm: '1452285798592.png', label: '부호 262' },
    { map_symbol_id: '263', file_nm: '1452285862060.png', label: '부호 263' },
    { map_symbol_id: '264', file_nm: '1452285867932.png', label: '부호 264' },
    { map_symbol_id: '265', file_nm: '1452285873880.png', label: '부호 265' },
    { map_symbol_id: '266', file_nm: '1452285880169.png', label: '부호 266' },
    { map_symbol_id: '267', file_nm: '1452285885699.png', label: '부호 267' },
    { map_symbol_id: '268', file_nm: '1452285891889.png', label: '부호 268' },
    { map_symbol_id: '269', file_nm: '1452285897362.png', label: '부호 269' },
    { map_symbol_id: '270', file_nm: '1452285903118.png', label: '부호 270' },
    { map_symbol_id: '271', file_nm: '1452285924557.png', label: '부호 271' },
    { map_symbol_id: '272', file_nm: '1452285930562.png', label: '부호 272' },
    { map_symbol_id: '273', file_nm: '1452285935985.png', label: '부호 273' },
    { map_symbol_id: '274', file_nm: '1452285946847.png', label: '부호 274' },
    { map_symbol_id: '275', file_nm: '1452285953094.png', label: '부호 275' },
    { map_symbol_id: '276', file_nm: '1452285960640.png', label: '부호 276' },
    { map_symbol_id: '277', file_nm: '1452285971485.png', label: '부호 277' },
    { map_symbol_id: '278', file_nm: '1452285979323.png', label: '부호 278' },
    { map_symbol_id: '279', file_nm: '1452285990777.png', label: '부호 279' },
    { map_symbol_id: '280', file_nm: '1452286000039.png', label: '부호 280' },
    { map_symbol_id: '281', file_nm: '1452286010450.png', label: '부호 281' },
    { map_symbol_id: '282', file_nm: '1452286028150.png', label: '부호 282' },
    { map_symbol_id: '283', file_nm: '1452286040877.png', label: '부호 283' },
    { map_symbol_id: '284', file_nm: '1452286052454.png', label: '부호 284' },
    { map_symbol_id: '285', file_nm: '1452286064932.png', label: '부호 285' },
    { map_symbol_id: '286', file_nm: '1452286072728.png', label: '부호 286' },
    { map_symbol_id: '287', file_nm: '1452286081224.png', label: '부호 287' },
    { map_symbol_id: '288', file_nm: '1452286086739.png', label: '부호 288' },
    { map_symbol_id: '289', file_nm: '1452286092528.png', label: '부호 289' },
    { map_symbol_id: '290', file_nm: '1452286102848.png', label: '부호 290' },
    { map_symbol_id: '291', file_nm: '1452286117683.png', label: '부호 291' },
    { map_symbol_id: '292', file_nm: '1452286130961.png', label: '부호 292' },
    { map_symbol_id: '293', file_nm: '1452286138874.png', label: '부호 293' },
    { map_symbol_id: '294', file_nm: '1452286149535.png', label: '부호 294' },
    { map_symbol_id: '295', file_nm: '1452286158840.png', label: '부호 295' },
    { map_symbol_id: '296', file_nm: '1452286166652.png', label: '부호 296' },
    { map_symbol_id: '297', file_nm: '1452286172158.png', label: '부호 297' },
    { map_symbol_id: '298', file_nm: '1452286177881.png', label: '부호 298' },
    { map_symbol_id: '299', file_nm: '1452286184336.png', label: '부호 299' },
    { map_symbol_id: '300', file_nm: '1452286190000.png', label: '부호 300' },
    { map_symbol_id: '301', file_nm: '1452286195615.png', label: '부호 301' },
    { map_symbol_id: '302', file_nm: '1452286200938.png', label: '부호 302' },
    { map_symbol_id: '303', file_nm: '1452286208484.png', label: '부호 303' },
    { map_symbol_id: '304', file_nm: '1452286214290.png', label: '부호 304' },
    { map_symbol_id: '305', file_nm: '1452286223869.png', label: '부호 305' },
    { map_symbol_id: '306', file_nm: '1452286229500.png', label: '부호 306' },
    { map_symbol_id: '307', file_nm: '1452286243910.png', label: '부호 307' },
    { map_symbol_id: '308', file_nm: '1452286250440.png', label: '부호 308' },
    { map_symbol_id: '309', file_nm: '1452286256163.png', label: '부호 309' },
    { map_symbol_id: '310', file_nm: '1452286261585.png', label: '부호 310' },
    { map_symbol_id: '311', file_nm: '1452286267734.png', label: '부호 311' },
    { map_symbol_id: '312', file_nm: '1452286272881.png', label: '부호 312' },
    { map_symbol_id: '313', file_nm: '1452286277912.png', label: '부호 313' },
    { map_symbol_id: '314', file_nm: '1452286284642.png', label: '부호 314' },
    { map_symbol_id: '315', file_nm: '1452286289907.png', label: '부호 315' },
    { map_symbol_id: '316', file_nm: '1452286302226.png', label: '부호 316' },
    { map_symbol_id: '317', file_nm: '1452286310356.png', label: '부호 317' },
    { map_symbol_id: '318', file_nm: '1452286316187.png', label: '부호 318' },
    { map_symbol_id: '319', file_nm: '1452286328222.png', label: '부호 319' },
    { map_symbol_id: '320', file_nm: '1452286334211.png', label: '부호 320' },
    { map_symbol_id: '321', file_nm: '1452286340333.png', label: '부호 321' },
    { map_symbol_id: '322', file_nm: '1452286346023.png', label: '부호 322' },
    { map_symbol_id: '323', file_nm: '1452286355751.png', label: '부호 323' },
    { map_symbol_id: '324', file_nm: '1452286362648.png', label: '부호 324' },
    { map_symbol_id: '325', file_nm: '1452286369895.png', label: '부호 325' },
    { map_symbol_id: '326', file_nm: '1452286379649.png', label: '부호 326' },
    { map_symbol_id: '327', file_nm: '1452286391859.png', label: '부호 327' },
    { map_symbol_id: '328', file_nm: '1452286399114.png', label: '부호 328' },
    { map_symbol_id: '329', file_nm: '1452286406595.png', label: '부호 329' },
    { map_symbol_id: '330', file_nm: '1452286412692.png', label: '부호 330' },
    { map_symbol_id: '331', file_nm: '1452286419647.png', label: '부호 331' },
    { map_symbol_id: '332', file_nm: '1452286427170.png', label: '부호 332' },
    { map_symbol_id: '333', file_nm: '1452286442087.png', label: '부호 333' },
    { map_symbol_id: '334', file_nm: '1452286451333.png', label: '부호 334' },
    { map_symbol_id: '335', file_nm: '1452286458855.png', label: '부호 335' },
    { map_symbol_id: '336', file_nm: '1452286467959.png', label: '부호 336' },
    { map_symbol_id: '337', file_nm: '1452286475373.png', label: '부호 337' },
    { map_symbol_id: '338', file_nm: '1452435664983.png', label: '부호 338' },
    { map_symbol_id: '339', file_nm: '1452435674862.png', label: '부호 339' },
    { map_symbol_id: '340', file_nm: '1452435684341.png', label: '부호 340' },
    { map_symbol_id: '341', file_nm: '1452435711521.png', label: '부호 341' },
    { map_symbol_id: '342', file_nm: '1452442359597.png', label: '부호 342' },
    { map_symbol_id: '343', file_nm: '1452442369351.png', label: '부호 343' },
    { map_symbol_id: '344', file_nm: '1452442382662.png', label: '부호 344' },
    { map_symbol_id: '345', file_nm: '1452442393299.png', label: '부호 345' },
    { map_symbol_id: '346', file_nm: '1452442404253.png', label: '부호 346' },
    { map_symbol_id: '347', file_nm: '1452442464608.png', label: '부호 347' },
    { map_symbol_id: '348', file_nm: '1452442481267.png', label: '부호 348' },
    { map_symbol_id: '349', file_nm: '1452442491287.png', label: '부호 349' },
    { map_symbol_id: '350', file_nm: '1452442502383.png', label: '부호 350' },
    { map_symbol_id: '351', file_nm: '1452442511954.png', label: '부호 351' },
    { map_symbol_id: '352', file_nm: '1452442532270.png', label: '부호 352' },
    { map_symbol_id: '353', file_nm: '1452442542683.png', label: '부호 353' },
    { map_symbol_id: '354', file_nm: '1452442553844.png', label: '부호 354' },
    { map_symbol_id: '355', file_nm: '1452442564463.png', label: '부호 355' },
    { map_symbol_id: '356', file_nm: '1452442576293.png', label: '부호 356' },
    { map_symbol_id: '357', file_nm: '1452442587589.png', label: '부호 357' },
    { map_symbol_id: '358', file_nm: '85399852712948998.png', label: '부호 358' },
    { map_symbol_id: '359', file_nm: '85399733319619946.png', label: '부호 359' },
    { map_symbol_id: '370', file_nm: '001.png', label: '부호 370' },
    { map_symbol_id: '371', file_nm: '002.png', label: '부호 371' },
    { map_symbol_id: '372', file_nm: '003.png', label: '부호 372' },
    { map_symbol_id: '373', file_nm: '004.png', label: '부호 373' },
    { map_symbol_id: '374', file_nm: '005.png', label: '부호 374' },
    { map_symbol_id: '375', file_nm: '006.png', label: '부호 375' },
    { map_symbol_id: '376', file_nm: '007.png', label: '부호 376' },
    { map_symbol_id: '377', file_nm: '008.png', label: '부호 377' },
    { map_symbol_id: '378', file_nm: '009.png', label: '부호 378' },
    { map_symbol_id: '379', file_nm: '010.png', label: '부호 379' },
    { map_symbol_id: '380', file_nm: '011.png', label: '부호 380' },
    { map_symbol_id: '381', file_nm: '012.png', label: '부호 381' },
    { map_symbol_id: '382', file_nm: '013.png', label: '부호 382' },
    { map_symbol_id: '383', file_nm: '014.png', label: '부호 383' },
    { map_symbol_id: '384', file_nm: '015.png', label: '부호 384' },
    { map_symbol_id: '385', file_nm: '016.png', label: '부호 385' },
    { map_symbol_id: '386', file_nm: '017.png', label: '부호 386' },
    { map_symbol_id: '387', file_nm: '018.png', label: '부호 387' },
    { map_symbol_id: '388', file_nm: '019.png', label: '부호 388' },
    { map_symbol_id: '389', file_nm: '020.png', label: '부호 389' },
    { map_symbol_id: '390', file_nm: '021.png', label: '부호 390' },
    { map_symbol_id: '391', file_nm: '022.png', label: '부호 391' },
    { map_symbol_id: '392', file_nm: '023.png', label: '부호 392' },
    { map_symbol_id: '393', file_nm: '024.png', label: '부호 393' },
    { map_symbol_id: '394', file_nm: '025.png', label: '부호 394' },
    { map_symbol_id: '395', file_nm: '026.png', label: '부호 395' },
    { map_symbol_id: '396', file_nm: '027.png', label: '부호 396' },
    { map_symbol_id: '397', file_nm: '028.png', label: '부호 397' },
    { map_symbol_id: '398', file_nm: '029.png', label: '부호 398' },
    { map_symbol_id: '399', file_nm: '030.png', label: '부호 399' },
    { map_symbol_id: '400', file_nm: '031.png', label: '부호 400' },
    { map_symbol_id: '401', file_nm: '032.png', label: '부호 401' },
    { map_symbol_id: '402', file_nm: '033.png', label: '부호 402' },
    { map_symbol_id: '403', file_nm: '034.png', label: '부호 403' },
    { map_symbol_id: '404', file_nm: '035.png', label: '부호 404' },
    { map_symbol_id: '405', file_nm: '036.png', label: '부호 405' },
    { map_symbol_id: '406', file_nm: '037.png', label: '부호 406' },
    { map_symbol_id: '407', file_nm: '038.png', label: '부호 407' },
    { map_symbol_id: '408', file_nm: '039.png', label: '부호 408' },
    { map_symbol_id: '409', file_nm: '040.png', label: '부호 409' },
    { map_symbol_id: '410', file_nm: '041.png', label: '부호 410' },
    { map_symbol_id: '411', file_nm: '042.png', label: '부호 411' },
    { map_symbol_id: '412', file_nm: '043.png', label: '부호 412' },
    { map_symbol_id: '413', file_nm: '044.png', label: '부호 413' },
    { map_symbol_id: '414', file_nm: '045.png', label: '부호 414' },
    { map_symbol_id: '415', file_nm: '046.png', label: '부호 415' },
    { map_symbol_id: '416', file_nm: '047.png', label: '부호 416' },
    { map_symbol_id: '417', file_nm: '048.png', label: '부호 417' },
    { map_symbol_id: '418', file_nm: '049.png', label: '부호 418' },
    { map_symbol_id: '419', file_nm: '050.png', label: '부호 419' },
    { map_symbol_id: '420', file_nm: '051.png', label: '부호 420' },
    { map_symbol_id: '421', file_nm: '052.png', label: '부호 421' },
    { map_symbol_id: '422', file_nm: '1211225302829453.png', label: '부호 422' },
    { map_symbol_id: '423', file_nm: '1211206896153383.png', label: '부호 423' },
    { map_symbol_id: '424', file_nm: '1211238203469971.png', label: '부호 424' },
    { map_symbol_id: '425', file_nm: '1211247886113185.png', label: '부호 425' },
    { map_symbol_id: '426', file_nm: '1211255620674692.png', label: '부호 426' },
    { map_symbol_id: '427', file_nm: '1211263962488237.png', label: '부호 427' },
    { map_symbol_id: '428', file_nm: '1211274253965564.png', label: '부호 428' },
    { map_symbol_id: '429', file_nm: '1211282361105294.png', label: '부호 429' },
    { map_symbol_id: '430', file_nm: '1211290369498584.png', label: '부호 430' },
    { map_symbol_id: '431', file_nm: '1211296116288444.png', label: '부호 431' },
    { map_symbol_id: '432', file_nm: '1294966477741848.png', label: '부호 432' },
    { map_symbol_id: '433', file_nm: '1294985579624185.png', label: '부호 433' },
    { map_symbol_id: '434', file_nm: '1294992080592318.png', label: '부호 434' },
    { map_symbol_id: '435', file_nm: '1294997986753470.png', label: '부호 435' },
    { map_symbol_id: '436', file_nm: '067.png', label: '부호 436' },
    { map_symbol_id: '437', file_nm: '068.png', label: '부호 437' },
    { map_symbol_id: '438', file_nm: '069.png', label: '부호 438' },
    { map_symbol_id: '439', file_nm: '070.png', label: '부호 439' },
    { map_symbol_id: '440', file_nm: '071.png', label: '부호 440' },
    { map_symbol_id: '441', file_nm: '072.png', label: '부호 441' },
    { map_symbol_id: '442', file_nm: '073.png', label: '부호 442' },
    { map_symbol_id: '443', file_nm: '074.png', label: '부호 443' },
    { map_symbol_id: '444', file_nm: '075.png', label: '부호 444' },
    { map_symbol_id: '445', file_nm: '076.png', label: '부호 445' },
    { map_symbol_id: '446', file_nm: '077.png', label: '부호 446' },
    { map_symbol_id: '447', file_nm: '078.png', label: '부호 447' },
    { map_symbol_id: '448', file_nm: '079.png', label: '부호 448' },
    { map_symbol_id: '449', file_nm: '080.png', label: '부호 449' },
    { map_symbol_id: '450', file_nm: '081.png', label: '부호 450' },
    { map_symbol_id: '451', file_nm: '082.png', label: '부호 451' },
    { map_symbol_id: '452', file_nm: '083.png', label: '부호 452' },
    { map_symbol_id: '453', file_nm: '084.png', label: '부호 453' },
    { map_symbol_id: '454', file_nm: '085.png', label: '부호 454' },
    { map_symbol_id: '455', file_nm: '086.png', label: '부호 455' },
    { map_symbol_id: '456', file_nm: '087.png', label: '부호 456' },
    { map_symbol_id: '457', file_nm: '088.png', label: '부호 457' },
    { map_symbol_id: '459', file_nm: '090.png', label: '부호 459' },
    { map_symbol_id: '460', file_nm: '091.png', label: '부호 460' },
    { map_symbol_id: '461', file_nm: '092.png', label: '부호 461' },
    { map_symbol_id: '462', file_nm: '093.png', label: '부호 462' },
    { map_symbol_id: '463', file_nm: '094.png', label: '부호 463' },
    { map_symbol_id: '464', file_nm: '095.png', label: '부호 464' },
    { map_symbol_id: '465', file_nm: '096.png', label: '부호 465' },
    { map_symbol_id: '466', file_nm: '097.png', label: '부호 466' },
    { map_symbol_id: '467', file_nm: '098.png', label: '부호 467' },
    { map_symbol_id: '468', file_nm: '099.png', label: '부호 468' },
    { map_symbol_id: '469', file_nm: '100.png', label: '부호 469' },
    { map_symbol_id: '470', file_nm: '101.png', label: '부호 470' },
    { map_symbol_id: '471', file_nm: '102.png', label: '부호 471' },
    { map_symbol_id: '472', file_nm: '103.png', label: '부호 472' },
    { map_symbol_id: '473', file_nm: '104.png', label: '부호 473' },
    { map_symbol_id: '474', file_nm: '105.png', label: '부호 474' },
    { map_symbol_id: '475', file_nm: '106.png', label: '부호 475' },
    { map_symbol_id: '476', file_nm: '107.png', label: '부호 476' },
    { map_symbol_id: '477', file_nm: '108.png', label: '부호 477' },
    { map_symbol_id: '478', file_nm: '109.png', label: '부호 478' },
    { map_symbol_id: '479', file_nm: '110.png', label: '부호 479' },
    { map_symbol_id: '480', file_nm: '111.png', label: '부호 480' },
    { map_symbol_id: '481', file_nm: '112.png', label: '부호 481' },
    { map_symbol_id: '482', file_nm: '113.png', label: '부호 482' },
    { map_symbol_id: '483', file_nm: '114.png', label: '부호 483' },
    { map_symbol_id: '484', file_nm: '115.png', label: '부호 484' },
    { map_symbol_id: '485', file_nm: '116.png', label: '부호 485' },
    { map_symbol_id: '486', file_nm: '117.png', label: '부호 486' },
    { map_symbol_id: '487', file_nm: '118.png', label: '부호 487' },
    { map_symbol_id: '488', file_nm: '119.png', label: '부호 488' },
    { map_symbol_id: '489', file_nm: '120.png', label: '부호 489' },
    { map_symbol_id: '490', file_nm: '121.png', label: '부호 490' },
    { map_symbol_id: '491', file_nm: '122.png', label: '부호 491' },
    { map_symbol_id: '492', file_nm: '123.png', label: '부호 492' },
    { map_symbol_id: '493', file_nm: '124.png', label: '부호 493' },
    { map_symbol_id: '494', file_nm: '125.png', label: '부호 494' },
    { map_symbol_id: '495', file_nm: '126.png', label: '부호 495' },
    { map_symbol_id: '496', file_nm: '127.png', label: '부호 496' },
    { map_symbol_id: '497', file_nm: '128.png', label: '부호 497' },
    { map_symbol_id: '498', file_nm: '129.png', label: '부호 498' },
    { map_symbol_id: '499', file_nm: '130.png', label: '부호 499' },
    { map_symbol_id: '500', file_nm: '131.png', label: '부호 500' },
    { map_symbol_id: '501', file_nm: '132.png', label: '부호 501' },
    { map_symbol_id: '502', file_nm: '133.png', label: '부호 502' },
    { map_symbol_id: '503', file_nm: '134.png', label: '부호 503' },
    { map_symbol_id: '504', file_nm: '135.png', label: '부호 504' },
    { map_symbol_id: '505', file_nm: '136.png', label: '부호 505' },
    { map_symbol_id: '506', file_nm: '137.png', label: '부호 506' },
    { map_symbol_id: '507', file_nm: '138.png', label: '부호 507' },
    { map_symbol_id: '508', file_nm: '139.png', label: '부호 508' },
    { map_symbol_id: '509', file_nm: '140.png', label: '부호 509' },
    { map_symbol_id: '510', file_nm: '141.png', label: '부호 510' },
    { map_symbol_id: '511', file_nm: '142.png', label: '부호 511' },
    { map_symbol_id: '512', file_nm: '143.png', label: '부호 512' },
    { map_symbol_id: '513', file_nm: '144.png', label: '부호 513' },
    { map_symbol_id: '514', file_nm: '145.png', label: '부호 514' },
    { map_symbol_id: '515', file_nm: '146.png', label: '부호 515' },
    { map_symbol_id: '516', file_nm: '147.png', label: '부호 516' },
    { map_symbol_id: '517', file_nm: '148.png', label: '부호 517' },
    { map_symbol_id: '518', file_nm: '149.png', label: '부호 518' },
    { map_symbol_id: '519', file_nm: '150.png', label: '부호 519' },
    { map_symbol_id: '520', file_nm: '151.png', label: '부호 520' },
    { map_symbol_id: '521', file_nm: '152.png', label: '부호 521' },
    { map_symbol_id: '522', file_nm: '153.png', label: '부호 522' },
    { map_symbol_id: '523', file_nm: '154.png', label: '부호 523' },
    { map_symbol_id: '524', file_nm: '155.png', label: '부호 524' },
    { map_symbol_id: '525', file_nm: '156.png', label: '부호 525' },
    { map_symbol_id: '526', file_nm: '157.png', label: '부호 526' },
    { map_symbol_id: '527', file_nm: '158.png', label: '부호 527' },
    { map_symbol_id: '528', file_nm: '159.png', label: '부호 528' },
    { map_symbol_id: '529', file_nm: '160.png', label: '부호 529' },
    { map_symbol_id: '530', file_nm: '161.png', label: '부호 530' },
    { map_symbol_id: '531', file_nm: '162.png', label: '부호 531' },
    { map_symbol_id: '532', file_nm: '163.png', label: '부호 532' },
    { map_symbol_id: '533', file_nm: '164.png', label: '부호 533' },
    { map_symbol_id: '534', file_nm: '165.png', label: '부호 534' },
    { map_symbol_id: '535', file_nm: '166.png', label: '부호 535' },
    { map_symbol_id: '536', file_nm: '167.png', label: '부호 536' },
    { map_symbol_id: '537', file_nm: '168.png', label: '부호 537' },
    { map_symbol_id: '538', file_nm: '169.png', label: '부호 538' },
    { map_symbol_id: '539', file_nm: '170.png', label: '부호 539' },
    { map_symbol_id: '541', file_nm: '3247489542408051.png', label: '부호 541' },
    { map_symbol_id: '543', file_nm: '19703685105444625.png', label: '부호 543' },
    { map_symbol_id: '544', file_nm: '5267408710332876.png', label: '부호 544' },
    { map_symbol_id: '549', file_nm: '6932824361398346.png', label: '부호 549' },
    { map_symbol_id: '550', file_nm: '9125547460021353.png', label: '부호 550' },
    { map_symbol_id: '551', file_nm: '12714482962897430.png', label: '부호 551' },
    { map_symbol_id: '552', file_nm: '12714500051724843.png', label: '부호 552' },
    { map_symbol_id: '553', file_nm: '12714513161242818.png', label: '부호 553' },
    { map_symbol_id: '554', file_nm: '12714521689405995.png', label: '부호 554' },
    { map_symbol_id: '555', file_nm: '12714529187974323.png', label: '부호 555' },
    { map_symbol_id: '556', file_nm: '12714538030130299.png', label: '부호 556' },
    { map_symbol_id: '557', file_nm: '12714546168288056.png', label: '부호 557' },
    { map_symbol_id: '558', file_nm: '12714552660409595.png', label: '부호 558' },
    { map_symbol_id: '559', file_nm: '12714558730230565.png', label: '부호 559' },
    { map_symbol_id: '560', file_nm: '12714565023383494.png', label: '부호 560' },
    { map_symbol_id: '561', file_nm: '12714571548061599.png', label: '부호 561' },
    { map_symbol_id: '562', file_nm: '12720010822516925.png', label: '부호 562' },
    { map_symbol_id: '563', file_nm: '12720005265149127.png', label: '부호 563' },
    { map_symbol_id: '565', file_nm: '12719988986635667.png', label: '부호 565' },
    { map_symbol_id: '567', file_nm: '12721324865932313.png', label: '부호 567' },
    { map_symbol_id: '569', file_nm: '22211231551561904.png', label: '부호 569' },
    { map_symbol_id: '586', file_nm: '33176157265293799.png', label: '부호 586' },
    { map_symbol_id: '587', file_nm: '35484448032387886.png', label: '부호 587' },
    { map_symbol_id: '589', file_nm: '48808276124289864.png', label: '부호 589' },
    { map_symbol_id: '590', file_nm: '48877791710310758.png', label: '부호 590' },
  ];

  function symbolFileById(mapSymbolId) {
    for (var i = 0; i < SYMBOL_CATALOG.length; i++) {
      if (String(SYMBOL_CATALOG[i].map_symbol_id) === String(mapSymbolId)) return SYMBOL_CATALOG[i].file_nm;
    }
    return SYMBOL_CATALOG[0].file_nm;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[MyMapStore] read', key, e);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[MyMapStore] write', key, e);
      return false;
    }
  }

  function emptyData() {
    return {
      schemaVersion: 2,
      /** DB 연동 시 dialect_local.db 버전 메모용 */
      dbCompat: 'kd_headword+tb_headword_dialect+tb_headword_dialect_region',
      seq: {
        headword_id: 900000,
        headword_no: 2900000,
        hd_id: 90000,
        hdr_id: 900000
      },
      headwords: [],
      dialects: [],
      regions: []
    };
  }

  function load() {
    var d = readJson(KEYS.data, null);
    if (!d || !d.schemaVersion) return emptyData();
    if (!d.seq) d.seq = emptyData().seq;
    if (!Array.isArray(d.headwords)) d.headwords = [];
    if (!Array.isArray(d.dialects)) d.dialects = [];
    if (!Array.isArray(d.regions)) d.regions = [];
    return d;
  }

  function save(data) {
    return writeJson(KEYS.data, data);
  }

  function nextId(data, key) {
    data.seq[key] = (parseInt(data.seq[key], 10) || 1) + 1;
    return String(data.seq[key]);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function rgbToHex(rgb) {
    if (!rgb) return '#94a3b8';
    if (rgb.charAt(0) === '#') return rgb;
    var p = String(rgb).split(',').map(function (x) { return parseInt(x.trim(), 10); });
    if (p.length < 3 || p.some(isNaN)) return '#94a3b8';
    return '#' + p.slice(0, 3).map(function (n) {
      var h = Math.max(0, Math.min(255, n)).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }

  function hexToRgb(hex) {
    if (!hex) return AUTO_RGB[0];
    if (hex.indexOf(',') !== -1) return hex;
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return AUTO_RGB[0];
    return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
  }

  function nextFaceColor(data, headwordNo) {
    // 그룹 개수 기준으로 팔레트에서 다음 색
    var groups = {};
    data.dialects.forEach(function (d) {
      if (String(d.headword_no) === String(headwordNo) && d.mutation_group != null) {
        groups[d.mutation_group] = true;
      }
    });
    var n = Object.keys(groups).length;
    return hexToRgb(FACE_PALETTE[n % FACE_PALETTE.length]);
  }

  /** 가장 가까운 팔레트 hex (기존 값 표시용) */
  function nearestPaletteHex(rgbOrHex) {
    var target = rgbToHex(rgbOrHex || FACE_PALETTE[0]);
    function parse(h) {
      h = String(h).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var t = parse(target);
    var best = FACE_PALETTE[0];
    var bestD = Infinity;
    for (var i = 0; i < FACE_PALETTE.length; i++) {
      var c = parse(FACE_PALETTE[i]);
      var d = (c[0] - t[0]) * (c[0] - t[0]) + (c[1] - t[1]) * (c[1] - t[1]) + (c[2] - t[2]) * (c[2] - t[2]);
      if (d < bestD) { bestD = d; best = FACE_PALETTE[i]; }
    }
    return best;
  }

  function getSessionUser() {
    return readJson(KEYS.session, null);
  }

  function isLoggedIn() {
    var u = getSessionUser();
    return !!(u && u.id);
  }

  /* ───────────── Headword (kd_headword) ───────────── */

  function listHeadwords(opts) {
    opts = opts || {};
    var data = load();
    var list = data.headwords.slice();
    if (opts.mineOnly && isLoggedIn()) {
      var uid = getSessionUser().id;
      list = list.filter(function (h) { return h.usid === uid || h.usid === 'demo'; });
    }
    list.sort(function (a, b) {
      return String(b.create_dt || '').localeCompare(String(a.create_dt || ''));
    });
    return list.map(clone);
  }

  function getHeadword(headwordNo) {
    var data = load();
    var h = data.headwords.filter(function (x) {
      return String(x.headword_no) === String(headwordNo);
    })[0];
    return h ? clone(h) : null;
  }

  /**
   * 표제어 등록/수정
   * payload: { headword, word_class, meaning, appro, headword_id?, headword_no? }
   * 기존 행 수정 시 전달되지 않은 컬럼은 유지 (DB partial update 규칙 선행 적용)
   */
  function saveHeadword(payload) {
    var data = load();
    var now = nowIso();
    var session = getSessionUser();
    var isEdit = !!(payload.headword_no || payload.headword_id);
    var existing = null;

    if (payload.headword_no) {
      existing = data.headwords.filter(function (h) {
        return String(h.headword_no) === String(payload.headword_no);
      })[0];
    } else if (payload.headword_id) {
      existing = data.headwords.filter(function (h) {
        return String(h.headword_id) === String(payload.headword_id);
      })[0];
    }

    var headword = String(payload.headword || '').trim();
    if (!headword) return { ok: false, reason: 'headword' };
    if (headword.length > 125) return { ok: false, reason: 'headword_len' };
    var wordClass = String(payload.word_class || '').trim();
    if (!wordClass) return { ok: false, reason: 'word_class' };
    var appro = payload.appro === 'N' ? 'N' : (payload.appro === 'Y' ? 'Y' : '');
    if (!appro) return { ok: false, reason: 'appro' };

    if (existing) {
      // partial update — 기존 컬럼 보존
      existing.headword = headword;
      existing.word_class = wordClass;
      if (payload.meaning !== undefined) existing.meaning = String(payload.meaning || '');
      existing.appro = appro;
      // use_yn, map_make, commentary, topic_id, sub_no 등 유지
      if (!save(data)) return { ok: false, reason: 'quota' };
      return { ok: true, headword: clone(existing) };
    }

    var row = {
      headword_id: nextId(data, 'headword_id'),
      topic_id: payload.topic_id != null ? String(payload.topic_id) : '121',
      headword_no: nextId(data, 'headword_no'),
      sub_no: '0',
      use_no: null,
      headword: headword,
      original_word: null,
      word_class: wordClass,
      meaning: String(payload.meaning || ''),
      usid: session ? session.id : 'guest',
      use_yn: 'N',          // 서비스 상태 — 관리자 처리 전
      appro: appro,
      map_make: 'N',
      commentary: null,
      create_dt: now
    };
    data.headwords.push(row);
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, headword: clone(row) };
  }

  function removeHeadword(headwordNo) {
    var data = load();
    var hn = String(headwordNo);
    data.headwords = data.headwords.filter(function (h) {
      return String(h.headword_no) !== hn;
    });
    var hdIds = {};
    data.dialects = data.dialects.filter(function (d) {
      if (String(d.headword_no) === hn) {
        hdIds[d.hd_id] = true;
        return false;
      }
      return true;
    });
    data.regions = data.regions.filter(function (r) {
      return String(r.headword_no) !== hn && !hdIds[r.hd_id];
    });
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true };
  }

  /* ───────────── Dialect (tb_headword_dialect) + 그룹/순서 규칙 ─────────────
   * - 그룹은 1부터 순차 (1 없이 2 생성 불가). 선택 또는 「다음 그룹」만 허용
   * - 그룹 내 순서는 1..n 순차·중복 없음. 생성 시 맨 끝, 변경(재정렬) 가능
   * - 면색(face_color)은 그룹 단위 1색 — 같은 mutation_group 전원 동일
   */

  function listDialects(headwordNo) {
    var data = load();
    var list = data.dialects.filter(function (d) {
      return String(d.headword_no) === String(headwordNo);
    });
    list.sort(function (a, b) {
      var ga = parseFloat(a.mutation_group) || 0;
      var gb = parseFloat(b.mutation_group) || 0;
      if (ga !== gb) return ga - gb;
      var sa = parseFloat(a.mutation_seq) || 0;
      var sb = parseFloat(b.mutation_seq) || 0;
      if (sa !== sb) return sa - sb;
      return String(a.word || '').localeCompare(String(b.word || ''), 'ko');
    });
    return list.map(clone);
  }

  function getDialect(hdId) {
    var data = load();
    var d = data.dialects.filter(function (x) {
      return String(x.hd_id) === String(hdId);
    })[0];
    return d ? clone(d) : null;
  }

  function _dialectsOf(data, headwordNo) {
    return data.dialects.filter(function (d) {
      return String(d.headword_no) === String(headwordNo);
    });
  }

  function _groupNums(data, headwordNo) {
    var set = {};
    _dialectsOf(data, headwordNo).forEach(function (d) {
      var g = parseInt(d.mutation_group, 10);
      if (!isNaN(g) && g > 0) set[g] = true;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  /** 사용 중인 그룹 번호 목록 [1,2,3…] */
  function listGroups(headwordNo) {
    return _groupNums(load(), headwordNo);
  }

  /** 다음에 만들 수 있는 그룹 번호 (= max+1, 없으면 1) */
  function nextGroupNumber(headwordNo) {
    var gs = listGroups(headwordNo);
    return gs.length ? gs[gs.length - 1] + 1 : 1;
  }

  /** 그룹 선택 옵션: 기존 그룹 + 다음 신규 그룹 1개 */
  function groupSelectOptions(headwordNo) {
    var existing = listGroups(headwordNo);
    var next = nextGroupNumber(headwordNo);
    return {
      existing: existing,
      nextNew: next,
      /** value 목록: 기존… + next (신규) */
      values: existing.concat([next])
    };
  }

  function _membersOfGroup(data, headwordNo, group) {
    var g = String(group);
    return _dialectsOf(data, headwordNo).filter(function (d) {
      return String(d.mutation_group) === g;
    }).sort(function (a, b) {
      return (parseInt(a.mutation_seq, 10) || 0) - (parseInt(b.mutation_seq, 10) || 0);
    });
  }

  /** 그룹 내 순서 1..n 재부여 */
  function _compactSeq(data, headwordNo, group) {
    var members = _membersOfGroup(data, headwordNo, group);
    members.forEach(function (d, i) {
      d.mutation_seq = String(i + 1);
    });
  }

  /** 그룹 번호를 1..G 로 재부여 (빈 그룹 제거 후) */
  function _compactGroups(data, headwordNo) {
    var gs = _groupNums(data, headwordNo);
    if (!gs.length) return;
    // 이미 1..n 연속이면 스킵
    var need = false;
    for (var i = 0; i < gs.length; i++) {
      if (gs[i] !== i + 1) { need = true; break; }
    }
    if (!need) return;
    var map = {};
    gs.forEach(function (oldG, idx) { map[oldG] = idx + 1; });
    _dialectsOf(data, headwordNo).forEach(function (d) {
      var og = parseInt(d.mutation_group, 10);
      if (!isNaN(og) && map[og] != null) d.mutation_group = String(map[og]);
    });
    // 각 그룹 순서 재정렬
    listGroupsFromData(data, headwordNo).forEach(function (g) {
      _compactSeq(data, headwordNo, g);
    });
  }

  function listGroupsFromData(data, headwordNo) {
    return _groupNums(data, headwordNo);
  }

  /** 그룹 면색 — 구성원 중 첫 항목 색. 미설정이면 null. */
  function getGroupColor(headwordNo, group) {
    var data = load();
    var members = _membersOfGroup(data, headwordNo, group);
    if (members.length && members[0].face_color) return members[0].face_color;
    return null;
  }

  /** 그룹 전체 면색 일괄 적용 (한 그룹 = 한 색) */
  function setGroupColor(headwordNo, group, color) {
    var data = load();
    var rgb = hexToRgb(color);
    var g = String(group);
    var n = 0;
    _dialectsOf(data, headwordNo).forEach(function (d) {
      if (String(d.mutation_group) === g) {
        d.face_color = rgb;
        n++;
      }
    });
    if (!n) return { ok: false, reason: 'empty_group' };
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, face_color: rgb, count: n };
  }

  /**
   * 여러 지역어를 한 그룹으로 일괄 이동.
   * 대상 그룹의 기존 면색을 상속(그룹=한 색), 대상 그룹 뒤에 순서 추가.
   * 이후 원 그룹 순서 압축 + 전체 그룹 번호 압축.
   */
  function setGroupForDialects(headwordNo, hdIds, groupNum) {
    var data = load();
    var hn = String(headwordNo);
    var ids = (hdIds || []).map(String);
    if (!ids.length) return { ok: false, reason: 'no_targets' };

    var vg = _validateGroup(data, hn, groupNum, true);
    if (!vg.ok) return vg;
    var targetG = String(vg.group);

    // 이동 대상 행
    var idSet = {};
    ids.forEach(function (id) { idSet[id] = true; });
    var targets = _dialectsOf(data, hn).filter(function (d) { return idSet[String(d.hd_id)]; });
    if (!targets.length) return { ok: false, reason: 'no_targets' };

    // 대상 그룹의 기존(이동 대상 제외) 멤버 → 그룹 면색 상속
    var keep = _membersOfGroup(data, hn, vg.group).filter(function (m) { return !idSet[String(m.hd_id)]; });
    var groupColor = keep.length ? keep[0].face_color : null;

    // 원 그룹들 기록(압축 위해)
    var srcGroups = {};
    targets.forEach(function (d) {
      if (d.mutation_group != null && d.mutation_group !== '') srcGroups[String(d.mutation_group)] = true;
      d.mutation_group = targetG;
      d.face_color = groupColor;
    });

    // 대상 그룹 순서 재부여: 기존 멤버(순서대로) 다음에 이동분(요청 순서대로)
    var ordered = keep.slice();
    ids.forEach(function (id) {
      var m = targets.filter(function (x) { return String(x.hd_id) === id; })[0];
      if (m) ordered.push(m);
    });
    ordered.forEach(function (m, i) { m.mutation_seq = String(i + 1); });

    // 원 그룹 순서 압축
    Object.keys(srcGroups).forEach(function (g) {
      if (g !== targetG) _compactSeq(data, hn, g);
    });
    _compactGroups(data, hn);

    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, count: targets.length, group: parseInt(targetG, 10) };
  }

  /**
   * 그룹 번호 검증: 기존 그룹이거나 nextNew 만 허용
   * createNew: true 이면 다음 번호만 허용
   */
  function _validateGroup(data, headwordNo, groupNum, allowNew) {
    var g = parseInt(groupNum, 10);
    if (isNaN(g) || g < 1) return { ok: false, reason: 'group_invalid' };
    var existing = _groupNums(data, headwordNo);
    if (existing.indexOf(g) !== -1) return { ok: true, group: g, isNew: false };
    if (!allowNew) return { ok: false, reason: 'group_missing' };
    var next = existing.length ? existing[existing.length - 1] + 1 : 1;
    // 연속성: next 만 신규 허용 (1 없이 2 금지)
    if (g !== next) return { ok: false, reason: 'group_sequence', expected: next };
    return { ok: true, group: g, isNew: true };
  }

  /**
   * 그룹 내 순서 변경 (1..n, 중복 없음). targetSeq 로 이동하고 나머지 재부여
   */
  function reorderDialectInGroup(hdId, targetSeq) {
    var data = load();
    var d = data.dialects.filter(function (x) {
      return String(x.hd_id) === String(hdId);
    })[0];
    if (!d) return { ok: false, reason: 'dialect' };
    var g = d.mutation_group;
    if (g == null || g === '') return { ok: false, reason: 'no_group' };
    var members = _membersOfGroup(data, d.headword_no, g);
    var n = members.length;
    var ts = parseInt(targetSeq, 10);
    if (isNaN(ts) || ts < 1 || ts > n) return { ok: false, reason: 'seq_range', max: n };

    // pull out and reinsert
    var arr = members.slice();
    var from = -1;
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].hd_id) === String(hdId)) { from = i; break; }
    }
    if (from < 0) return { ok: false, reason: 'dialect' };
    var item = arr.splice(from, 1)[0];
    arr.splice(ts - 1, 0, item);
    arr.forEach(function (m, idx) {
      m.mutation_seq = String(idx + 1);
    });
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, dialect: clone(d) };
  }

  function saveDialect(payload) {
    var data = load();
    var hn = String(payload.headword_no || '');
    if (!data.headwords.some(function (h) { return String(h.headword_no) === hn; })) {
      return { ok: false, reason: 'headword_no' };
    }
    var word = String(payload.word || '').trim();
    if (!word) return { ok: false, reason: 'word' };
    if (word.length > 50) return { ok: false, reason: 'word_len' };

    var existing = null;
    if (payload.hd_id) {
      existing = data.dialects.filter(function (d) {
        return String(d.hd_id) === String(payload.hd_id);
      })[0];
    }

    /* ── 수정 ── */
    if (existing) {
      if (payload.word !== undefined) existing.word = word;

      if (payload.map_symbol_id !== undefined) {
        existing.map_symbol_id = payload.map_symbol_id ? String(payload.map_symbol_id) : null;
      }
      if (payload.symbol_color !== undefined) {
        existing.symbol_color = payload.symbol_color ? String(payload.symbol_color) : null;
      }

      // 그룹 변경
      if (payload.mutation_group !== undefined &&
          String(payload.mutation_group) !== String(existing.mutation_group)) {
        var oldG = existing.mutation_group;
        var vg = _validateGroup(data, hn, payload.mutation_group, true);
        if (!vg.ok) return vg;
        existing.mutation_group = String(vg.group);
        // 새 그룹 맨 끝 순서
        var newMembers = _membersOfGroup(data, hn, vg.group).filter(function (m) {
          return String(m.hd_id) !== String(existing.hd_id);
        });
        existing.mutation_seq = String(newMembers.length + 1);
            // 새 그룹 색 적용 (기존 멤버 색 상속, 없으면 빈값 유지)
        existing.face_color = newMembers.length ? newMembers[0].face_color : null;
        // 옛 그룹 순서 압축 + 그룹 번호 압축
        if (oldG != null && oldG !== '') {
          _compactSeq(data, hn, oldG);
        }
        _compactGroups(data, hn);
      }

      // 순서만 변경 (같은 그룹 내)
      if (payload.mutation_seq !== undefined &&
          String(payload.mutation_seq) !== String(existing.mutation_seq) &&
          (payload.mutation_group === undefined ||
            String(payload.mutation_group) === String(existing.mutation_group))) {
        if (!save(data)) return { ok: false, reason: 'quota' };
        var ro = reorderDialectInGroup(existing.hd_id, payload.mutation_seq);
        if (!ro.ok) return ro;
        // reload existing after reorder
        return { ok: true, dialect: getDialect(existing.hd_id) };
      }

      // 면색 변경 → 그룹 전체 동일 색
      if (payload.face_color !== undefined && existing.mutation_group != null) {
        var rgb = hexToRgb(payload.face_color);
        var gg = String(existing.mutation_group);
        _dialectsOf(data, hn).forEach(function (d) {
          if (String(d.mutation_group) === gg) d.face_color = rgb;
        });
      } else if (payload.face_color !== undefined) {
        existing.face_color = hexToRgb(payload.face_color);
      }

      data.regions.forEach(function (r) {
        if (String(r.hd_id) === String(existing.hd_id)) r.word = existing.word;
      });
      if (!save(data)) return { ok: false, reason: 'quota' };
      return { ok: true, dialect: clone(existing) };
    }

    /* ── 신규 ── */
    var groupPayload = payload.mutation_group;
    if (groupPayload === undefined || groupPayload === '' || groupPayload == null) {
      // 기본: 그룹이 있으면 마지막 그룹, 없으면 1
      var gs = _groupNums(data, hn);
      groupPayload = gs.length ? gs[gs.length - 1] : 1;
    }
    var vg2 = _validateGroup(data, hn, groupPayload, true);
    if (!vg2.ok) return vg2;

    var members = _membersOfGroup(data, hn, vg2.group);
    var seq = members.length + 1;
    // 면색: 그룹에 이미 색이 있으면 상속(그룹=한 색), 없으면 빈값(미설정).
    // 부호·부호색도 자동 기본값 없이 빈값으로 시작한다.
    var face;
    if (members.length && members[0].face_color) {
      face = members[0].face_color; // 그룹 면색 통일
    } else if (payload.face_color) {
      face = hexToRgb(payload.face_color);
    } else {
      face = null; // 빈값 — 사용자가 그룹 면색을 설정할 때까지 미설정
    }

    var row = {
      hd_id: nextId(data, 'hd_id'),
      headword_no: hn,
      word: word,
      face_color: face,
      mutation_group: String(vg2.group),
      mutation_seq: String(seq),
      map_symbol_id: payload.map_symbol_id ? String(payload.map_symbol_id) : null,
      symbol_color: payload.symbol_color ? String(payload.symbol_color) : null,
      create_dt: nowIso()
    };
    data.dialects.push(row);
    data.headwords.forEach(function (h) {
      if (String(h.headword_no) === hn) h.map_make = 'Y';
    });
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, dialect: clone(row) };
  }

  function removeDialect(hdId) {
    var data = load();
    var id = String(hdId);
    var target = data.dialects.filter(function (d) {
      return String(d.hd_id) === id;
    })[0];
    if (!target) return { ok: false, reason: 'dialect' };
    var hn = target.headword_no;
    var g = target.mutation_group;

    data.dialects = data.dialects.filter(function (d) {
      return String(d.hd_id) !== id;
    });
    data.regions = data.regions.filter(function (r) {
      return String(r.hd_id) !== id;
    });

    if (g != null && g !== '') {
      _compactSeq(data, hn, g);
    }
    _compactGroups(data, hn);

    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true };
  }

  /** 그룹 내 순서 선택지 1..n (현재 항목 기준) */
  function seqOptionsForDialect(hdId) {
    var d = getDialect(hdId);
    if (!d || d.mutation_group == null) return [];
    var n = listDialects(d.headword_no).filter(function (x) {
      return String(x.mutation_group) === String(d.mutation_group);
    }).length;
    var opts = [];
    for (var i = 1; i <= n; i++) opts.push(i);
    return opts;
  }

  /* ───────────── Regions (tb_headword_dialect_region) ───────────── */

  function listRegions(hdId) {
    var data = load();
    return data.regions.filter(function (r) {
      return String(r.hd_id) === String(hdId);
    }).map(clone);
  }

  function listRegionsByHeadword(headwordNo) {
    var data = load();
    return data.regions.filter(function (r) {
      return String(r.headword_no) === String(headwordNo);
    }).map(clone);
  }

  /**
   * 지역 토글 부착. region_id 배타: 같은 headword_no 안에서는 한 dialect만 소유
   * regionRef: { region_id, region_nm }  — 최종 DB의 region_id 체계
   * 프로토 지도는 muni_N 을 region_id 로 쓸 수 있음 (DB 연동 시 매핑 테이블)
   */
  function toggleRegion(hdId, regionRef) {
    var data = load();
    var dialect = data.dialects.filter(function (d) {
      return String(d.hd_id) === String(hdId);
    })[0];
    if (!dialect) return { ok: false, reason: 'dialect' };
    var rid = String(regionRef.region_id);
    var hn = String(dialect.headword_no);

    // same dialect already has it → remove
    var ownIdx = -1;
    for (var i = 0; i < data.regions.length; i++) {
      if (String(data.regions[i].hd_id) === String(hdId) &&
          String(data.regions[i].region_id) === rid) {
        ownIdx = i;
        break;
      }
    }
    if (ownIdx >= 0) {
      data.regions.splice(ownIdx, 1);
      if (!save(data)) return { ok: false, reason: 'quota' };
      return { ok: true, action: 'remove', dialect: clone(dialect) };
    }

    // exclusive within headword: remove from other dialects of same headword
    var movedFrom = null;
    data.regions = data.regions.filter(function (r) {
      if (String(r.headword_no) === hn && String(r.region_id) === rid) {
        movedFrom = r.hd_id;
        return false;
      }
      return true;
    });

    data.regions.push({
      hdr_id: nextId(data, 'hdr_id'),
      headword_no: hn,
      word: dialect.word,
      region_id: rid,
      hd_id: String(dialect.hd_id),
      serial_nm: null,
      basis_year: null,
      region_nm: regionRef.region_nm || rid,
      create_dt: nowIso()
    });

    if (!save(data)) return { ok: false, reason: 'quota' };
    return {
      ok: true,
      action: movedFrom ? 'move' : 'add',
      movedFrom: movedFrom,
      dialect: clone(dialect)
    };
  }

  function removeRegion(hdrId) {
    var data = load();
    data.regions = data.regions.filter(function (r) {
      return String(r.hdr_id) !== String(hdrId);
    });
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true };
  }

  /** 지도 fill 용: headword_no → region_id 별 첫 dialect face_color (운영 규칙) */
  function buildFillByHeadword(headwordNo) {
    var dialects = listDialects(headwordNo);
    var byHd = {};
    dialects.forEach(function (d) { byHd[d.hd_id] = d; });
    var regs = listRegionsByHeadword(headwordNo);
    // region_id → first dialect by mutation order (dialects already sorted)
    var orderIndex = {};
    dialects.forEach(function (d, i) { orderIndex[d.hd_id] = i; });
    regs.sort(function (a, b) {
      return (orderIndex[a.hd_id] || 0) - (orderIndex[b.hd_id] || 0);
    });
    var owned = {};
    regs.forEach(function (r) {
      if (owned[r.region_id]) return;
      var d = byHd[r.hd_id];
      if (!d) return;
      owned[r.region_id] = {
        region_id: r.region_id,
        region_nm: r.region_nm,
        face_color: d.face_color,
        word: d.word,
        hd_id: d.hd_id,
        map_symbol_id: d.map_symbol_id,
        symbol_color: d.symbol_color,
        mutation_group: d.mutation_group
      };
    });
    return owned;
  }

  function countRegionsForDialect(hdId) {
    return listRegions(hdId).length;
  }

  function headwordSummary(h) {
    var dialects = listDialects(h.headword_no);
    var regionCount = listRegionsByHeadword(h.headword_no).length;
    return {
      headword_id: h.headword_id,
      headword_no: h.headword_no,
      headword: h.headword,
      word_class: h.word_class,
      meaning: h.meaning,
      appro: h.appro,
      use_yn: h.use_yn,
      map_make: h.map_make,
      dialect_count: dialects.length,
      region_count: regionCount,
      create_dt: h.create_dt
    };
  }

  function validateHeadwordReady(headwordNo) {
    var h = getHeadword(headwordNo);
    if (!h) return { ok: false, reason: 'headword' };
    var dialects = listDialects(headwordNo);
    if (!dialects.length) return { ok: false, reason: 'dialects' };
    var regs = listRegionsByHeadword(headwordNo);
    if (!regs.length) return { ok: false, reason: 'regions' };
    return { ok: true };
  }

  /** 최종 저장 — 지도 보기 가능 상태로 표시 */
  function finalizeHeadword(headwordNo) {
    var v = validateHeadwordReady(headwordNo);
    if (!v.ok) return v;
    var data = load();
    var hn = String(headwordNo);
    var found = null;
    data.headwords.forEach(function (h) {
      if (String(h.headword_no) === hn) {
        h.map_make = 'Y';
        h.finalized_at = nowIso();
        found = h;
      }
    });
    if (!found) return { ok: false, reason: 'headword' };
    if (!save(data)) return { ok: false, reason: 'quota' };
    return { ok: true, headword: clone(found) };
  }

  function symbolShapeById(mapSymbolId) {
    for (var i = 0; i < SYMBOL_CATALOG.length; i++) {
      if (String(SYMBOL_CATALOG[i].map_symbol_id) === String(mapSymbolId)) {
        return SYMBOL_CATALOG[i].shape || 'circle';
      }
    }
    return 'circle';
  }

  /* session */
  function loginMock(user) {
    writeJson(KEYS.session, {
      id: (user && user.id) || 'demo',
      name: (user && user.name) || '체험회원'
    });
  }

  function logoutMock() {
    localStorage.removeItem(KEYS.session);
  }

  function getSelectedHeadwordNo() {
    return localStorage.getItem(KEYS.selectedHeadwordNo) || '';
  }

  function setSelectedHeadwordNo(no) {
    if (no) localStorage.setItem(KEYS.selectedHeadwordNo, String(no));
    else localStorage.removeItem(KEYS.selectedHeadwordNo);
  }

  function isCoachDismissed() {
    return localStorage.getItem(KEYS.coach) === '1';
  }

  function dismissCoach() {
    localStorage.setItem(KEYS.coach, '1');
  }

  /** 데모용 시드 (가위 스타일) — 없을 때만 */
  function ensureSeed() {
    var data = load();
    if (data.headwords.length) return;
    var res = saveHeadword({
      headword: '가위',
      word_class: '명사',
      meaning: '옷감, 종이, 머리털 따위를 자르는 기구.',
      appro: 'Y'
    });
    if (!res.ok) return;
    var hn = res.headword.headword_no;
    loginMock({ id: 'demo', name: '체험회원' });
    // re-save with usid after login
    data = load();
    data.headwords.forEach(function (h) {
      if (String(h.headword_no) === String(hn)) h.usid = 'demo';
    });
    save(data);
    saveDialect({ headword_no: hn, word: '가새', mutation_group: '1', mutation_seq: '1', map_symbol_id: '1' });
    saveDialect({ headword_no: hn, word: '가새(=가:새)', mutation_group: '1', mutation_seq: '2', map_symbol_id: '2' });
    setSelectedHeadwordNo(hn);
  }

  global.MyMapStore = {
    KEYS: KEYS,
    WORD_CLASS_OPTIONS: WORD_CLASS_OPTIONS,
    FACE_PALETTE: FACE_PALETTE,
    AUTO_RGB: AUTO_RGB,
    SYMBOL_CATALOG: SYMBOL_CATALOG,
    rgbToHex: rgbToHex,
    hexToRgb: hexToRgb,
    nearestPaletteHex: nearestPaletteHex,

    listHeadwords: listHeadwords,
    getHeadword: getHeadword,
    saveHeadword: saveHeadword,
    removeHeadword: removeHeadword,
    headwordSummary: headwordSummary,

    listDialects: listDialects,
    getDialect: getDialect,
    saveDialect: saveDialect,
    removeDialect: removeDialect,
    listGroups: listGroups,
    nextGroupNumber: nextGroupNumber,
    groupSelectOptions: groupSelectOptions,
    getGroupColor: getGroupColor,
    setGroupColor: setGroupColor,
    setGroupForDialects: setGroupForDialects,
    reorderDialectInGroup: reorderDialectInGroup,
    seqOptionsForDialect: seqOptionsForDialect,

    listRegions: listRegions,
    listRegionsByHeadword: listRegionsByHeadword,
    toggleRegion: toggleRegion,
    removeRegion: removeRegion,
    countRegionsForDialect: countRegionsForDialect,
    buildFillByHeadword: buildFillByHeadword,
    validateHeadwordReady: validateHeadwordReady,
    finalizeHeadword: finalizeHeadword,
    symbolShapeById: symbolShapeById,
    symbolFileById: symbolFileById,

    isLoggedIn: isLoggedIn,
    getSessionUser: getSessionUser,
    loginMock: loginMock,
    logoutMock: logoutMock,
    getSelectedHeadwordNo: getSelectedHeadwordNo,
    setSelectedHeadwordNo: setSelectedHeadwordNo,
    isCoachDismissed: isCoachDismissed,
    dismissCoach: dismissCoach,
    ensureSeed: ensureSeed,

    /** 디버그·이관용 전체 덤프 (최종 DB 적재 시 사용) */
    exportAll: function () { return load(); },
    resetAll: function () {
      localStorage.removeItem(KEYS.data);
      localStorage.removeItem(KEYS.selectedHeadwordNo);
    }
  };
})(window);
