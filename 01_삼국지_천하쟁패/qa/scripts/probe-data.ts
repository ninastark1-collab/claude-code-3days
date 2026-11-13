/**
 * 데이터·고증 프로브: 시나리오 배치, 생몰, 자, 지명, 연호, 능력치 이미지 범위, 독창성 금지어.
 * 기준: qa/고증기준표.md
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Report, engine, idsByName, nameOf, skip } from './lib';

const r = new Report('probe-data');
const { data, ix } = engine();
const byName = (n: string) => { const ids = idsByName(n); return ids.length ? data.officers.find((o) => o.id === ids[0])! : null; };

await r.check('C2-01 규모', () => {
  const n = data.officers.length;
  if (n < 500) r.fail('C2-01', 'S3', '시나리오', `무장 ${n}명 (목표 500~650, 41-1)`);
  else r.pass('C2-01', `무장 ${n}명`);
});

await r.check('C2-06 동명이인', () => {
  const m = new Map<string, string[]>();
  for (const o of data.officers) m.set(o.name, [...(m.get(o.name) ?? []), o.id]);
  const dups = [...m].filter(([, ids]) => ids.length > 1);
  if (dups.length) r.info('C2-06', `동명이인 ${dups.length}건 — 화면 구분 표시(자·소속) 수동 확인`, dups.map(([n, ids]) => `${n}: ${ids.join(', ')}`).join('\n'));
  else r.pass('C2-06', '동명이인 없음');
});

await r.check('C2-05 생몰·등장 상식', () => {
  const bad: string[] = []; const young: string[] = [];
  for (const o of data.officers) {
    if (o.deathYear < o.birthYear) bad.push(`${o.name}(${o.id}) 몰년 ${o.deathYear} < 생년 ${o.birthYear}`);
    if (o.debutYear > o.deathYear) bad.push(`${o.name} 등장 ${o.debutYear} > 몰년 ${o.deathYear}`);
    if (o.deathYear - o.birthYear > 95) bad.push(`${o.name} 수명 ${o.deathYear - o.birthYear}세`);
    // 어린 황제(조방·손량 등)처럼 근거가 있을 수 있어 경고만
    if (o.debutYear < o.birthYear + 12) young.push(`${o.name} ${o.debutYear}년 ${o.debutYear - o.birthYear}세 등장`);
  }
  bad.length ? r.fail('C2-05', 'S3', '시나리오', `생몰·등장 모순 ${bad.length}건`, bad.join('\n')) : r.pass('C2-05', '생몰·등장 모순 없음');
  if (young.length) r.warn('C2-05', '시나리오', `12세 미만 등장 ${young.length}명 (근거 있으면 통과)`, young.join('\n'));
});

// 고증기준표 4장 표본
const REF: [string, string | null, number | null, number][] = [
  ['조조', '맹덕', 155, 220], ['유비', '현덕', 161, 223], ['손권', '중모', 182, 252], ['관우', '운장', null, 220], ['장비', '익덕', null, 221],
  ['조운', '자룡', null, 229], ['제갈량', '공명', 181, 234], ['방통', '사원', 179, 214], ['법정', '효직', 176, 220], ['황충', '한승', null, 220],
  ['마초', '맹기', 176, 222], ['위연', '문장', null, 234], ['강유', '백약', 202, 264], ['마속', '유상', 190, 228], ['유선', '공사', 207, 271],
  ['사마의', '중달', 179, 251], ['조비', '자환', 187, 226], ['하후돈', '원양', null, 220], ['하후연', '묘재', null, 219], ['조인', '자효', 168, 223],
  ['장료', '문원', 169, 222], ['서황', '공명', null, 227], ['장합', '준예', null, 231], ['전위', null, null, 197], ['순욱', '문약', 163, 212],
  ['곽가', '봉효', 170, 207], ['순유', '공달', 157, 214], ['가후', '문화', 147, 223], ['정욱', '중덕', 141, 220], ['손견', '문대', 155, 191],
  ['손책', '백부', 175, 200], ['주유', '공근', 175, 210], ['노숙', '자경', 172, 217], ['여몽', '자명', 178, 220], ['육손', '백언', 183, 245],
  ['태사자', '자의', 166, 206], ['여포', '봉선', null, 198], ['동탁', '중영', null, 192], ['진궁', '공대', null, 198], ['원소', '본초', null, 202],
  ['원술', '공로', null, 199], ['공손찬', '백규', null, 199], ['유표', '경승', 142, 208], ['도겸', '공조', 132, 194], ['공융', '문거', 153, 208],
  ['마등', '수성', null, 212], ['장각', null, null, 184], ['하진', '수고', null, 189], ['왕윤', '자사', 137, 192], ['등애', '사재', 197, 264], ['종회', '사계', 225, 264],
];
await r.check('C2-04/C2-07 생몰·자 대조', () => {
  const miss: string[] = []; const death: string[] = []; const birth: string[] = []; const ct: string[] = [];
  for (const [name, courtesy, by, dy] of REF) {
    const o = byName(name);
    if (!o) { miss.push(name); continue; }
    if (Math.abs(o.deathYear - dy) > 1) death.push(`${name}: 데이터 ${o.deathYear} / 기준 ${dy}`);
    if (by && Math.abs(o.birthYear - by) > 1) birth.push(`${name}: 데이터 ${o.birthYear} / 기준 ${by}`);
    if (courtesy && o.courtesy && o.courtesy !== courtesy) ct.push(`${name}: 데이터 ${o.courtesy} / 기준 ${courtesy}`);
    if (courtesy && !o.courtesy) ct.push(`${name}: 자 없음 (기준 ${courtesy})`);
  }
  miss.length ? r.fail('C2-04', 'S3', '시나리오', `주요 인물 누락 ${miss.length}명`, miss.join(', ')) : r.pass('C2-04', '기준 표본 인물 전원 존재');
  death.length ? r.fail('C2-04', 'S3', '시나리오', `몰년 ±1년 초과 ${death.length}건`, death.join('\n')) : r.pass('C2-04', '몰년 일치');
  birth.length ? r.warn('C2-04', '시나리오', `생년 ±1년 초과 ${birth.length}건`, birth.join('\n')) : r.pass('C2-04', '생년 일치');
  ct.length ? r.fail('C2-07', 'S3', '시나리오', `자(字) 불일치/누락 ${ct.length}건`, ct.join('\n')) : r.pass('C2-07', '자 일치');
});

// 고증기준표 6장 (테스터 휴리스틱)
type Band = { name: string; test: (o: NonNullable<ReturnType<typeof byName>>) => boolean; want: string };
const BANDS: Band[] = [
  { name: '여포', test: (o) => o.war >= 98 && o.intelligence <= 40, want: '무력≥98, 지력≤40' },
  { name: '관우', test: (o) => o.war >= 94, want: '무력≥94' }, { name: '장비', test: (o) => o.war >= 94 && o.intelligence <= 50, want: '무력≥94, 지력≤50' },
  { name: '조운', test: (o) => o.war >= 92, want: '무력≥92' }, { name: '마초', test: (o) => o.war >= 92, want: '무력≥92' }, { name: '황충', test: (o) => o.war >= 90, want: '무력≥90' },
  { name: '허저', test: (o) => o.war >= 90 && o.intelligence <= 40, want: '무력≥90, 지력≤40' }, { name: '전위', test: (o) => o.war >= 90 && o.intelligence <= 40, want: '무력≥90, 지력≤40' },
  { name: '제갈량', test: (o) => o.intelligence >= 97 && o.politics >= 90, want: '지력≥97, 정치≥90' }, { name: '사마의', test: (o) => o.intelligence >= 93 && o.leadership >= 85, want: '지력≥93, 통솔≥85' },
  { name: '방통', test: (o) => o.intelligence >= 92, want: '지력≥92' }, { name: '곽가', test: (o) => o.intelligence >= 92, want: '지력≥92' },
  { name: '주유', test: (o) => o.intelligence >= 90 && o.leadership >= 90, want: '지력≥90, 통솔≥90' }, { name: '육손', test: (o) => o.intelligence >= 90, want: '지력≥90' },
  { name: '순욱', test: (o) => o.politics >= 92 && o.intelligence >= 90, want: '정치≥92, 지력≥90' },
  { name: '조조', test: (o) => o.leadership >= 90 && o.intelligence >= 88 && o.politics >= 88, want: '통솔≥90, 지력≥88, 정치≥88' },
  { name: '유비', test: (o) => o.charisma >= 95, want: '매력≥95' }, { name: '손권', test: (o) => o.charisma >= 85, want: '매력≥85' },
  { name: '동탁', test: (o) => o.charisma <= 40, want: '매력≤40' }, { name: '유선', test: (o) => o.intelligence <= 40 && o.war <= 30, want: '지력≤40, 무력≤30' },
  { name: '장료', test: (o) => o.leadership >= 88, want: '통솔≥88' }, { name: '노숙', test: (o) => o.politics >= 85, want: '정치≥85' },
];
await r.check('C2-02 능력치 이미지', () => {
  const out: string[] = [];
  for (const b of BANDS) {
    const o = byName(b.name); if (!o) continue;
    if (!b.test(o)) out.push(`${b.name} 통${o.leadership}/무${o.war}/지${o.intelligence}/정${o.politics}/매${o.charisma} — 기대 ${b.want}`);
  }
  out.length ? r.warn('C2-02', '시나리오', `이미지 범위 밖 ${out.length}명 (사람이 연의 근거로 판정)`, out.join('\n')) : r.pass('C2-02', '주요 장수 이미지 범위 내');
  const top = (k: 'war' | 'intelligence' | 'leadership' | 'politics' | 'charisma') =>
    [...data.officers].sort((a, b) => b[k] - a[k]).slice(0, 12).map((o) => `${o.name}${o[k]}`).join(' ');
  r.info('C2-02', '능력치 상위 12명 (검토용)', ['war', 'intelligence', 'leadership', 'politics', 'charisma'].map((k) => `${k}: ${top(k as 'war')}`).join('\n'));
  const hundreds = data.officers.filter((o) => [o.leadership, o.war, o.intelligence, o.politics, o.charisma].includes(100));
  r.info('C2-02', `능력치 100 보유 ${hundreds.length}명`, hundreds.map((o) => o.name).join(', '));
});

await r.check('C2-08 관계', () => {
  const need: [string, string, 'father' | 'sworn'][] = [
    ['손책', '손견', 'father'], ['손권', '손견', 'father'], ['마초', '마등', 'father'], ['관평', '관우', 'father'], ['관흥', '관우', 'father'],
    ['장포', '장비', 'father'], ['조비', '조조', 'father'], ['유선', '유비', 'father'],
  ];
  const out: string[] = [];
  for (const [child, father] of need) {
    const c = byName(child); const f = byName(father);
    if (!c || !f) { out.push(`${child}/${father} 데이터 없음`); continue; }
    if (c.father !== f.id) out.push(`${child}.father = ${c.father ?? '없음'} (기대 ${f.id})`);
  }
  const [lb, gy, zf] = ['유비', '관우', '장비'].map(byName);
  if (!lb?.sworn || lb.sworn !== gy?.sworn || lb.sworn !== zf?.sworn) out.push('유비·관우·장비 의형제(sworn) 그룹이 같지 않음');
  out.length ? r.fail('C2-08', 'S3', '시나리오', `관계 데이터 ${out.length}건`, out.join('\n')) : r.pass('C2-08', '부자·의형제 표본 정상');
});

// ───────── 시나리오 배치 ─────────
for (const sc of data.scenarios) {
  await r.check(`C1 ${sc.id}`, () => {
    const Y = sc.year;
    const cityOwner = new Map(sc.cities.map((c) => [c.city, c.faction]));
    const errs: string[] = []; const warns: string[] = []; const dyingThisYear: string[] = [];
    if (sc.cities.length !== data.cities.length) warns.push(`도시 ${sc.cities.length}/${data.cities.length}개만 정의`);
    for (const f of sc.factions) {
      const ruler = ix.officer.get(f.ruler);
      const place = sc.officers.find((p) => p.officer === f.ruler);
      if (!ruler) errs.push(`${f.name} 군주 id ${f.ruler} 없음`);
      else {
        if (ruler.deathYear < Y) errs.push(`${f.name} 군주 ${ruler.name} 이미 사망(${ruler.deathYear})`);
        if (ruler.debutYear > Y) warns.push(`${f.name} 군주 ${ruler.name} 등장 전(${ruler.debutYear})`);
      }
      if (!place || place.faction !== f.id) errs.push(`${f.name} 군주 ${nameOf(f.ruler)}가 자기 세력으로 배치되지 않음`);
      if (cityOwner.get(f.capital) !== f.id) errs.push(`${f.name} 수도 ${ix.city.get(f.capital)?.name ?? f.capital} 미소유`);
      if (![...cityOwner.values()].includes(f.id)) errs.push(`${f.name} 도시 0개`);
    }
    for (const p of sc.officers) {
      const b = ix.officer.get(p.officer);
      if (!b) { errs.push(`없는 무장 id ${p.officer}`); continue; }
      if (b.deathYear < Y) errs.push(`${b.name} 몰년 ${b.deathYear} < ${Y} 인데 배치`);
      else if (b.deathYear === Y) dyingThisYear.push(b.name);
      if (b.debutYear > Y) warns.push(`${b.name} 등장 ${b.debutYear} > ${Y} 인데 배치`);
      if (Y - b.birthYear < 15) warns.push(`${b.name} ${Y - b.birthYear}세 배치`);
      if (p.faction && cityOwner.get(p.city) !== p.faction) errs.push(`${b.name}(${p.faction}) 이 남의/공백 도시 ${ix.city.get(p.city)?.name}에 배치`);
      if (!ix.city.get(p.city)) errs.push(`${b.name} 없는 도시 ${p.city}`);
    }
    const counts = sc.factions.map((f) => `${f.name}${[...cityOwner.values()].filter((x) => x === f.id).length}`).join(' ');
    r.info(`C1-04 ${sc.id}`, `${sc.year}.${sc.month} 세력별 도시 수: ${counts} · 공백 ${[...cityOwner.values()].filter((x) => !x).length}`);
    errs.length ? r.fail(`C1 ${sc.id}`, 'S2', '시나리오', `배치 오류 ${errs.length}건`, errs.join('\n')) : r.pass(`C1 ${sc.id}`, '군주·수도·생몰 배치 정합');
    if (warns.length) r.warn(`C1 ${sc.id}`, '시나리오', `배치 경고 ${warns.length}건`, warns.join('\n'));
    if (dyingThisYear.length) r.info(`C1 ${sc.id}`, `시작 연도에 몰년인 배치 ${dyingThisYear.length}명 — 그해 안에 실제로 사망 처리되는지 probe-sim·플레이로 확인`, dyingThisYear.join(', '));
  });
}

// 고증기준표 3장의 "확정" 항목
const placedAs = (scId: string, name: string) => {
  const sc = data.scenarios.find((s) => s.id === scId); if (!sc) return undefined;
  const ids = idsByName(name); const p = sc.officers.find((x) => ids.includes(x.officer));
  return p ? (p.faction ?? '재야') : null; // null = 배치 안 됨
};
const factionOfRuler = (scId: string, rulerName: string) => {
  const sc = data.scenarios.find((s) => s.id === scId)!; const ids = idsByName(rulerName);
  return sc.factions.find((f) => ids.includes(f.ruler))?.id;
};
await r.check('C1-06 소속 정답', () => {
  const out: string[] = [];
  const notIn = (sc: string, name: string, ruler: string, why: string) => { const p = placedAs(sc, name); const f = factionOfRuler(sc, ruler); if (p && f && p === f) out.push(`${sc}: ${name}이 ${ruler} 세력 — ${why}`); };
  const absent = (sc: string, name: string, why: string) => { const p = placedAs(sc, name); if (p) out.push(`${sc}: ${name} 배치됨(${p}) — ${why}`); };
  notIn('s194', '조운', '유비', '연의: 200년 고성에서 합류');
  for (const n of ['여포', '진궁', '고순', '원술', '공손찬', '전위', '동탁']) absent('s200', n, '200년 이전 사망');
  for (const n of ['곽가', '원소', '손책', '태사자']) absent('s208', n, '208년 이전 사망');
  for (const n of ['하후연', '주유', '노숙', '방통', '순욱', '순유', '마등', '한수']) absent('s219', n, '219년 7월 이전 사망');
  notIn('s219', '강유', '유비', '촉 합류는 228년');
  for (const n of ['제갈량', '방통']) { const p = placedAs('s200', n); if (p && p !== '재야') out.push(`s200: ${n} 소속 ${p} — 재야여야 함`); }
  { const p = placedAs('s208', '제갈량'); const f = factionOfRuler('s208', '유비'); if (p !== f) out.push(`s208: 제갈량 소속 ${p} — 유비 휘하여야 함 (207 삼고초려)`); }
  out.length ? r.fail('C1-06', 'S2', '시나리오', `소속 정답 위반 ${out.length}건`, out.join('\n')) : r.pass('C1-06', '고증기준표 3장 확정 항목 통과');
  const hbs = placedAs('s194', '황보숭'); if (hbs && hbs !== '재야') r.warn('C1-06', '시나리오', `s194 황보숭 소속 ${hbs} (조정 신하, 195 사망 — 참고)`);
});

// ───────── 지명·지역 ─────────
const CITY_REF: Record<string, string> = {
  xiangping: '양평', beiping: '북평', ji: '계', nanpi: '남피', ye: '업', pingyuan: '평원', jinyang: '진양', shangdang: '상당', beihai: '북해', puyang: '복양',
  chenliu: '진류', xuchang: '허창', xiaopei: '소패', xiapi: '하비', langya: '낭야', runan: '여남', qiao: '초', luoyang: '낙양', hongnong: '홍농', changan: '장안',
  tianshui: '천수', anding: '안정', wuwei: '무위', xiliang: '서량', hanzhong: '한중', wan: '완', xinye: '신야', xiangyang: '양양', jiangling: '강릉', jiangxia: '강하',
  changsha: '장사', wuling: '무릉', lingling: '영릉', guiyang: '계양', shouchun: '수춘', lujiang: '여강', jianye: '건업', wu: '오', kuaiji: '회계', chaisang: '시상',
  zitong: '재동', chengdu: '성도', jiangzhou: '강주', yongan: '영안', jianning: '건녕', yunnan: '운남',
};
await r.check('C4-06 지명', () => {
  const out: string[] = [];
  for (const c of data.cities) if (CITY_REF[c.id] && CITY_REF[c.id] !== c.name) out.push(`${c.id}: ${c.name} (기준 ${CITY_REF[c.id]})`);
  const extra = data.cities.filter((c) => !CITY_REF[c.id]).map((c) => `${c.id}:${c.name}`);
  out.length ? r.fail('C4-06', 'S3', '시나리오', `지명 불일치 ${out.length}`, out.join('\n')) : r.pass('C4-06', '지명 독음 일치');
  if (extra.length) r.info('C4-06', `기준표에 없는 새 도시 ${extra.length}개 — 기준표 갱신 필요`, extra.join(', '));
  const regions = [...new Set(data.cities.map((c) => c.region))];
  r.info('C4-04', `지역 목록: ${regions.join(', ')}`);
  const yang = regions.filter((x) => x.startsWith('양주'));
  if (yang.some((x) => !/[揚涼]/.test(x))) r.fail('C4-05', 'S3', '시나리오', `양주 구분 없는 표기: ${yang.join(', ')}`);
  else r.pass('C4-05', `양주 구분 표기: ${yang.join(', ')}`);
  if (regions.some((x) => x.includes('사례'))) r.fail('C4-04', 'S3', '시나리오', '"사례" 표기 → "사예(司隸)"');
  if (!regions.some((x) => x.includes('교'))) r.info('C4-04', '교주(交州) 도시 없음 — 지도 범위 정책 질의');
  const policy = ['jianye', 'xuchang', 'yongan', 'jianning', 'yunnan'].filter((id) => data.cities.some((c) => c.id === id));
  r.warn('C4-07', '시나리오', `후대 지명 ${policy.map((id) => CITY_REF[id]).join('·')} 사용 — 시대별 표기 방침 결정 필요 (오류 아님)`);
});

await r.check('C4-01~03 연호', async () => {
  let eras: typeof import('../../src/data/eras');
  try { eras = await import('../../src/data/eras'); } catch { return skip('src/data/eras.ts 없음'); }
  const cases: [number, 'wei' | 'shu' | 'wu', string][] = [
    [184, 'wei', '중평 원년'], [188, 'wei', '중평 5년'], [190, 'wei', '초평 원년'], [193, 'wei', '초평 4년'], [194, 'wei', '흥평 원년'], [195, 'wei', '흥평 2년'],
    [196, 'wei', '건안 원년'], [200, 'wei', '건안 5년'], [208, 'wei', '건안 13년'], [219, 'wei', '건안 24년'], [221, 'shu', '장무 원년'], [222, 'wu', '황무 원년'],
    [221, 'wei', '황초 2년'], [200, 'shu', '건안 5년'], [200, 'wu', '건안 5년'],
  ];
  const out: string[] = [];
  for (const [y, camp, want] of cases) { const got = eras.eraLabel(y, camp); if (got !== want) out.push(`${y} ${camp}: "${got}" (기준 "${want}")`); }
  r.info('C4-02', `189년 표기: "${eras.eraLabel(189)}" · 220년 위: "${eras.eraLabel(220, 'wei')}" — 수동 판정`);
  if (!eras.ERAS.some((e) => e.name.includes('건흥'))) r.warn('C4-03', '시나리오', '촉 건흥(223~) 등 220년대 후속 연호 없음 — 223년 이후 진행 시 장무가 계속 이어짐');
  if (!eras.ERAS.some((e) => e.name.includes('태화'))) r.warn('C4-03', '시나리오', '위 태화(227~) 이후 연호 없음 — 장기 진행 시 황초가 끝없이 이어짐');
  out.length ? r.fail('C4-01', 'S3', '시나리오', `연호 불일치 ${out.length}`, out.join('\n')) : r.pass('C4-01', '연호 표본 15개 일치');
});

// ───────── 독창성 (40장) ─────────
const BANNED = ['귀모', '신산', '화신', '위풍', '귀문', '백출', '패왕', '비장', '투신', '창신', '궁신', '기신', '신위', '명경', '반계', '공신', '수신', '격신', '철벽', '금강', '불굴', '신장'];
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f); const st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (/\.(ts|tsx|json|css|html)$/.test(f)) out.push(p);
  }
  return out;
}
await r.check('D1-01 독창성 금지어', () => {
  const hits: string[] = [];
  for (const file of [...walk('src'), ...walk('data')]) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const w of BANNED) {
        // 문자열 안에서 단독 단어처럼 쓰인 경우만 (예: '신장' 이 '신장개업' 같은 일반어 일부면 제외하기 어려우니 사람이 판정)
        const re = new RegExp(`['"\`\\s(·,]${w}['"\`\\s)·,]`);
        if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  hits.length ? r.fail('D1-01', 'S1', '개발', `기존 게임 고유 명칭 의심 ${hits.length}곳 — 사람이 판정 (특기·기술 이름이면 교체)`, hits.join('\n')) : r.pass('D1-01', '금지어 22개 미검출');
  if (data.officers.some((o) => 'compatibility' in o || 'aishou' in o)) r.fail('D1-01', 'S1', '개발', '원형 상성 필드 존재');
});

r.write();
